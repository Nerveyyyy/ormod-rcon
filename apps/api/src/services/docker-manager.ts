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

  // ── Command dispatch (docker exec → /proc/1/fd/0) ─────────────────────

  /**
   * Write a command to the game container's stdin via docker exec.
   * Uses /proc/1/fd/0 to write to the game process (PID 1) stdin.
   *
   * cmd is passed as a shell positional argument ($1) to prevent injection.
   * Requires: `stdin_open: true` and `tty: true` in docker-compose.yml.
   */
  async sendCommand(serverId: string, cmd: string): Promise<void> {
    const name = await this.getContainerName(serverId);

    // Create exec instance — cmd passed as $1, not interpolated into script
    const execCreate = await dockerRequest('POST', `/containers/${name}/exec`, {
      AttachStdin:  false,
      AttachStdout: false,
      AttachStderr: false,
      Tty:          false,
      Cmd: ['sh', '-c', 'printf "%s\\n" "$1" > /proc/1/fd/0', 'sh', cmd],
    }) as { Id?: string };

    if (!execCreate?.Id) {
      throw new Error(`Failed to create exec instance on container "${name}"`);
    }

    // Start the exec (detached — we don't await output)
    await dockerRequest('POST', `/exec/${execCreate.Id}/start`, { Detach: true });
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
