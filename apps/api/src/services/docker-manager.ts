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
import net  from 'net';
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

  // ── Command dispatch (Docker attach → container stdin) ────────────────

  /**
   * Write a command to the game container's stdin via the Docker attach API.
   *
   * Uses a raw TCP socket to the Docker Unix socket to send an HTTP Upgrade
   * request (the attach endpoint hijacks the connection after the 101
   * response), then writes the command line directly to container stdin.
   *
   * This is the correct approach for non-TTY containers (tty: false in
   * docker-compose.yml). The /proc/1/fd/0 exec trick only works reliably
   * for TTY containers and breaks log stream framing if tty: true is set.
   *
   * Requires: `stdin_open: true` in docker-compose.yml.
   */
  async sendCommand(serverId: string, cmd: string): Promise<void> {
    const name = await this.getContainerName(serverId);

    return new Promise<void>((resolve, reject) => {
      const socket = net.createConnection(DOCKER_SOCKET);

      // Guard: only settle the promise once (prevents double-resolve/reject).
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn();
      };

      // Reject if Docker never responds within 10 s.
      const timeoutId = setTimeout(() => {
        socket.destroy();
        settle(() => reject(new Error('Docker attach timed out after 10s')));
      }, 10_000);

      // HTTP/1.1 upgrade request — Docker responds with 101 then keeps the
      // connection open as a bidirectional raw stream to container stdin.
      const httpRequest =
        `POST /containers/${name}/attach?stream=1&stdin=1 HTTP/1.1\r\n` +
        `Host: localhost\r\n` +
        `Connection: Upgrade\r\n` +
        `Upgrade: tcp\r\n` +
        `\r\n`;

      let headerBuf  = '';
      let headersDone = false;

      socket.once('connect', () => socket.write(httpRequest));

      socket.on('data', (chunk: Buffer) => {
        if (headersDone) return;

        // Accumulate until we have a complete HTTP response header block.
        headerBuf += chunk.toString('binary');
        const headerEnd = headerBuf.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;

        headersDone = true;

        // Check HTTP status — must be 101 (upgrade) or 200 (older Docker).
        const statusLine = headerBuf.split('\r\n')[0];
        const statusCode = parseInt(statusLine.split(' ')[1] ?? '0', 10);

        if (statusCode !== 101 && statusCode !== 200) {
          socket.destroy();
          settle(() => reject(new Error(
            `Docker attach failed (${statusCode}): ${statusLine.trim()}`
          )));
          return;
        }

        // Successfully hijacked — write command then close cleanly.
        socket.write(`${cmd}\n`, () => {
          socket.end();
          settle(() => resolve());
        });
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        settle(() => reject(err));
      });
    });
  }

  // ── Log streaming ─────────────────────────────────────────────────────

  /**
   * Start streaming logs from a Docker container.
   * Docker multiplexes stdout+stderr using 8-byte frame headers:
   *   [stream_type(1), 0, 0, 0, payload_size(4 bytes BE)]
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
        let frameBuffer = Buffer.alloc(0);

        res.on('data', (chunk: Buffer) => {
          frameBuffer = Buffer.concat([frameBuffer, chunk]);

          // Parse Docker multiplexing frames
          while (frameBuffer.length >= 8) {
            const frameSize = frameBuffer.readUInt32BE(4);
            if (frameBuffer.length < 8 + frameSize) break;

            const payload = frameBuffer.subarray(8, 8 + frameSize).toString('utf-8');
            frameBuffer   = frameBuffer.subarray(8 + frameSize);

            // Split payload into lines and push each
            for (const raw of stripAnsi(payload).split('\n')) {
              pushLine(raw.trimEnd());
            }
          }
        });

        res.on('end', () => {
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
