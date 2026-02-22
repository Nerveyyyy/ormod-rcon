/**
 * docker-manager.ts
 *
 * Controls ORMOD: Directive game containers via the Docker HTTP API over the
 * Unix socket mounted at /var/run/docker.sock.
 *
 * Replaces node-pty / server-manager.ts with a purely socket-based approach:
 *   - Start/stop/restart  → POST /containers/{name}/start|stop|restart
 *   - Live log stream     → GET  /containers/{name}/logs?follow=true
 *   - Send stdin command  → POST /containers/{name}/exec  +  exec start
 *
 * No external packages — uses only Node.js built-in `http` module.
 */

import http from 'http';
import { EventEmitter } from 'events';
import prisma from '../db/prisma-client.js';

// ── Config ────────────────────────────────────────────────────────────────
const DOCKER_SOCKET      = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';
const OUTPUT_BUFFER_SIZE = 1000;   // lines kept in memory per server
const BUFFER_LINGER_MS   = 60_000; // keep buffer 60s after container stops

// ── Helpers ───────────────────────────────────────────────────────────────

/** Strip ANSI / VT escape sequences from Docker log output */
function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1B\][^\x07\x1B]*\x07/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '')
    .replace(/\x1B[^[\]]/g, '');
}

/**
 * Send a request to the Docker API over the Unix socket.
 * Returns the parsed JSON response body (or raw string on parse failure).
 */
async function dockerRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr   = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {};
    if (bodyStr) {
      headers['Content-Type']   = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(bodyStr));
    }

    const req = http.request(
      { socketPath: DOCKER_SOCKET, method, path, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try   { resolve(data ? JSON.parse(data) : {}); }
          catch { resolve(data); }
        });
      }
    );

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── DockerManager class ───────────────────────────────────────────────────

class DockerManager {
  /** Set of serverIds whose containers are currently running */
  private runningContainers = new Set<string>();
  /** In-memory ring buffers of recent output, keyed by serverId */
  private outputBuffers     = new Map<string, string[]>();
  /** EventEmitters for live line subscriptions, keyed by serverId */
  private outputEmitters    = new Map<string, EventEmitter>();
  /** Active Docker log stream requests, keyed by serverId */
  private logStreams         = new Map<string, http.ClientRequest>();

  // ── Container name resolution ─────────────────────────────────────────

  /**
   * Resolve the Docker container name for a server.
   * Uses the server's `executablePath` field (repurposed as container name in
   * Docker mode).  Falls back to GAME_CONTAINER_NAME env var or 'ormod-game'.
   */
  private async getContainerName(serverId: string): Promise<string> {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    return server.executablePath.trim() || process.env.GAME_CONTAINER_NAME || 'ormod-game';
  }

  // ── Process control ───────────────────────────────────────────────────

  async start(serverId: string): Promise<void> {
    const name = await this.getContainerName(serverId);
    await dockerRequest('POST', `/containers/${name}/start`);
    this.runningContainers.add(serverId);
    this.startLogStream(serverId, name);
  }

  async stop(serverId: string): Promise<void> {
    const name = await this.getContainerName(serverId);
    await dockerRequest('POST', `/containers/${name}/stop`);
    this.runningContainers.delete(serverId);
    this.stopLogStream(serverId);
  }

  async restart(serverId: string): Promise<void> {
    const name = await this.getContainerName(serverId);
    this.stopLogStream(serverId);
    await dockerRequest('POST', `/containers/${name}/restart`);
    this.runningContainers.add(serverId);
    // Brief delay — wait for container to be running before tailing logs
    setTimeout(() => this.startLogStream(serverId, name), 2000);
  }

  isRunning(serverId: string): boolean {
    return this.runningContainers.has(serverId);
  }

  // ── Command dispatch (Docker attach → PTY master → game stdin) ───────────

  /**
   * Write a command to the game container's stdin via Docker attach.
   *
   * With tty: true the container has a pseudo-terminal.  PID 1 (the game)
   * holds the PTY slave as its stdin; Docker holds the PTY master.
   *
   * The attach API (POST /containers/{name}/attach?stdin=1&stream=1) performs
   * an HTTP Upgrade so the caller gets direct socket access to the PTY master.
   * Writing cmd\n to that socket is identical to the user typing the command
   * in `docker attach` — the PTY line discipline delivers it to the game's
   * Console.ReadLine() call.
   *
   * /proc/1/fd/0 is the PTY slave — writing there goes in the OUTPUT direction
   * and never reaches the game's read(), which is why it was silently ignored.
   */
  async sendCommand(serverId: string, cmd: string): Promise<void> {
    const name = await this.getContainerName(serverId);

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: (() => void) | ((e: Error) => void), arg?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        arg ? (fn as (e: Error) => void)(arg) : (fn as () => void)();
      };

      const timer = setTimeout(() => {
        req.destroy();
        settle(reject, new Error('sendCommand: timed out after 5 s'));
      }, 5000);

      const req = http.request({
        socketPath: DOCKER_SOCKET,
        method:     'POST',
        path:       `/containers/${name}/attach?stdin=1&stream=1&stdout=0&stderr=0`,
        headers: {
          'Content-Type': 'application/vnd.docker.raw-stream',
          'Connection':   'Upgrade',
          'Upgrade':      'tcp',
        },
      });

      // 101 Switching Protocols → socket is now the raw PTY master connection
      req.on('upgrade', (_res, socket) => {
        socket.write(`${cmd}\n`, (err) => {
          socket.end();
          if (err) settle(reject, err as Error); else settle(resolve);
        });
      });

      // Non-101 response means the container isn't running or attach failed
      req.on('response', (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () =>
          settle(reject, new Error(`Docker attach ${res.statusCode}: ${body.trim()}`))
        );
      });

      req.on('error', (err: Error) => settle(reject, err));
      req.end();
    });
  }

  // ── Log streaming ─────────────────────────────────────────────────────

  /**
   * Start streaming logs from a Docker container.
   *
   * With tty: true (required for game console input) Docker streams raw PTY
   * bytes — no 8-byte multiplexing frame headers.  We buffer across TCP chunks
   * and split on \r\n or \n (PTY uses \r\n).
   */
  private startLogStream(serverId: string, containerName: string): void {
    this.stopLogStream(serverId); // clean up any existing stream

    const outputBuffer: string[] = [];
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);

    this.outputBuffers.set(serverId, outputBuffer);
    this.outputEmitters.set(serverId, emitter);

    const pushLine = (text: string) => {
      if (!text) return;
      outputBuffer.push(text);
      if (outputBuffer.length > OUTPUT_BUFFER_SIZE) outputBuffer.shift();
      emitter.emit('line', text);
    };

    const req = http.request(
      {
        socketPath: DOCKER_SOCKET,
        method:     'GET',
        // tail=100 gives the last 100 lines of history on connect
        path: `/containers/${containerName}/logs?follow=true&stdout=true&stderr=true&tail=100`,
      },
      (res) => {
        // tty: true → raw PTY bytes, no Docker stream multiplexing headers.
        // Buffer incomplete lines across chunks (PTY uses \r\n line endings).
        let lineBuffer = '';

        res.on('data', (chunk: Buffer) => {
          lineBuffer += stripAnsi(chunk.toString('utf-8'));
          const lines = lineBuffer.split(/\r?\n/);
          lineBuffer  = lines.pop() ?? ''; // last element may be incomplete
          for (const line of lines) {
            pushLine(line.trimEnd());
          }
        });

        res.on('end', () => {
          if (lineBuffer) pushLine(lineBuffer.trimEnd()); // flush incomplete line
          // Container stopped (externally or via stop/restart)
          this.runningContainers.delete(serverId);
          pushLine(`# Container stopped.`);
          emitter.emit('exit');
          this.logStreams.delete(serverId);

          setTimeout(() => {
            this.outputBuffers.delete(serverId);
            this.outputEmitters.delete(serverId);
          }, BUFFER_LINGER_MS);
        });

        res.on('error', (err: Error) => {
          pushLine(`# Log stream error: ${err.message}`);
          emitter.emit('exit');
        });
      }
    );

    req.on('error', (err: Error) => {
      const emitter = this.outputEmitters.get(serverId);
      if (emitter) {
        emitter.emit('line', `# Docker connection error: ${err.message}`);
        emitter.emit('exit');
      }
    });

    req.end();
    this.logStreams.set(serverId, req);
  }

  private stopLogStream(serverId: string): void {
    const req = this.logStreams.get(serverId);
    if (req) {
      req.destroy();
      this.logStreams.delete(serverId);
    }
  }

  // ── Accessors (same interface as the old server-manager) ──────────────

  getOutputBuffer(serverId: string): string[] {
    return this.outputBuffers.get(serverId) ?? [];
  }

  getOutputEmitter(serverId: string): EventEmitter | undefined {
    return this.outputEmitters.get(serverId);
  }

  // ── Startup reconciliation ─────────────────────────────────────────────

  /**
   * Called once on server startup.
   * Checks each registered server's container state and reconnects log
   * streams for any that are already running.
   */
  async reconnect(): Promise<void> {
    const servers = await prisma.server.findMany();

    for (const server of servers) {
      const name = server.executablePath.trim() || process.env.GAME_CONTAINER_NAME || 'ormod-game';
      try {
        const info = await dockerRequest('GET', `/containers/${name}/json`) as {
          State?: { Running?: boolean };
        };
        if (info?.State?.Running === true) {
          this.runningContainers.add(server.id);
          this.startLogStream(server.id, name);
        }
      } catch {
        // Container not found or Docker unavailable — skip silently
      }
    }
  }
}

export const dockerManager = new DockerManager();
