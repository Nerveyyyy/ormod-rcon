/**
 * docker-manager.ts
 *
 * Controls ORMOD: Directive game containers via the Docker HTTP API over the
 * Unix socket mounted at /var/run/docker.sock.
 *
 *   Start / stop / restart  → POST /containers/{name}/start|stop|restart
 *   Inspect (TTY detection) → GET  /containers/{name}/json
 *   Live log stream         → GET  /containers/{name}/logs?follow=true
 *   Send stdin command      → POST /containers/{name}/attach  (HTTP Upgrade)
 *
 * No external packages — uses only Node.js built-in `http` module.
 *
 * ── TTY vs non-TTY log framing ────────────────────────────────────────────
 *   tty: true  → Docker streams raw PTY bytes (no frame headers).
 *                Commands are sent via attach → HTTP Upgrade → PTY master.
 *   tty: false → Docker multiplexes stdout/stderr in 8-byte frames.
 *                Commands would be sent via /proc/1/fd/0 (not used currently).
 *
 * ── Command dispatch ──────────────────────────────────────────────────────
 *   With tty: true, Docker attach gives direct access to the PTY master.
 *   Writing cmd\n to the socket is identical to the user typing in
 *   `docker attach` — the PTY line discipline delivers it to the game's
 *   Console.ReadLine() call.  Commands are queued per-server to prevent
 *   interleaving from concurrent requests.
 *
 * ── No external packages ──────────────────────────────────────────────────
 */

import http from 'http';
import { EventEmitter } from 'events';
import prisma from '../db/prisma-client.js';

// ── Config ────────────────────────────────────────────────────────────────────
const OUTPUT_BUFFER_SIZE = 1000;   // lines kept in memory per server
const BUFFER_LINGER_MS   = 60_000; // keep buffer 60s after container stops

// ── Docker connection helper ──────────────────────────────────────────────────
// Supports both a Unix socket (default) and a TCP proxy (docker-compose.secure.yml).
//   Unix socket:  DOCKER_SOCKET=/var/run/docker.sock  (default)
//   TCP proxy:    DOCKER_HOST=tcp://socket-proxy:2375  (set in secure compose)

/** Build http.RequestOptions pointing at either the Unix socket or TCP proxy. */
function dockerOptions(
  method:   string,
  path:     string,
  headers?: Record<string, string>,
): http.RequestOptions {
  // Lazy reads — env may not be loaded at module evaluation time
  const dockerHost = (process.env.DOCKER_HOST ?? '').replace(/^tcp:\/\//, 'http://');
  const dockerSocket = process.env.DOCKER_SOCKET ?? '/var/run/docker.sock';

  const base = dockerHost
    ? (() => {
        const u = new URL(dockerHost);
        return { hostname: u.hostname, port: Number(u.port || 2375) };
      })()
    : { socketPath: dockerSocket };
  return { ...base, method, path, ...(headers ? { headers } : {}) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
      dockerOptions(method, path, Object.keys(headers).length ? headers : undefined),
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

// ── Per-server command queue ──────────────────────────────────────────────────
// Serialises commands per serverId so concurrent HTTP requests don't interleave
// bytes on the PTY master socket.

class CommandQueue {
  private queues = new Map<string, Promise<void>>();

  enqueue(serverId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.queues.get(serverId) ?? Promise.resolve();
    // Chain onto the previous promise; continue even if previous errored
    const next = prev.then(fn, fn);
    this.queues.set(serverId, next);
    // Cleanup once the tail settles
    next.finally(() => {
      if (this.queues.get(serverId) === next) this.queues.delete(serverId);
    });
    return next;
  }
}

const commandQueue = new CommandQueue();

// ── DockerManager class ───────────────────────────────────────────────────────

class DockerManager {
  /** Set of serverIds whose containers are currently running */
  private runningContainers = new Set<string>();
  /** In-memory ring buffers of recent output, keyed by serverId */
  private outputBuffers     = new Map<string, string[]>();
  /** EventEmitters for live line subscriptions, keyed by serverId */
  private outputEmitters    = new Map<string, EventEmitter>();
  /** Active Docker log stream requests, keyed by serverId */
  private logStreams         = new Map<string, http.ClientRequest>();

  // ── Container name resolution ─────────────────────────────────────────────

  /**
   * Resolve the Docker container name for a server.
   * Prefers the explicit `containerName` field (new), falls back to the legacy
   * `executablePath` field (repurposed), then falls back to GAME_CONTAINER_NAME.
   */
  private async getContainerName(serverId: string): Promise<string> {
    const server = await prisma.server.findUniqueOrThrow({ where: { id: serverId } });
    return (
      server.containerName?.trim() ||
      server.executablePath.trim() ||
      process.env.GAME_CONTAINER_NAME ||
      'ormod-game'
    );
  }

  // ── Container inspection ──────────────────────────────────────────────────

  /**
   * Inspect a container and return relevant state.
   * Returns null if the container is not found or Docker is unavailable.
   */
  async inspect(containerName: string): Promise<{
    running: boolean;
    tty:     boolean;
  } | null> {
    try {
      const info = await dockerRequest('GET', `/containers/${containerName}/json`) as {
        State?:  { Running?: boolean };
        Config?: { Tty?: boolean };
      };
      return {
        running: info?.State?.Running  === true,
        tty:     info?.Config?.Tty     !== false, // default true for game containers
      };
    } catch {
      return null;
    }
  }

  // ── Process control ───────────────────────────────────────────────────────

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

  // ── Command dispatch (Docker attach → PTY master → game stdin) ────────────

  /**
   * Write a command to the game container's stdin via Docker attach.
   *
   * With tty: true the container has a pseudo-terminal.  PID 1 (the game)
   * holds the PTY slave as its stdin; Docker holds the PTY master.
   *
   * The attach API performs an HTTP Upgrade so the caller gets direct socket
   * access to the PTY master.  Writing cmd\n to that socket is identical to
   * the user typing the command in `docker attach`.
   *
   * Commands are queued per-server to prevent concurrent sends from
   * interleaving bytes on the same socket connection.
   *
   * Note: the game currently does not send console responses (Playtest 1.9.0).
   * This is fire-and-forget until the game ships RCON.
   */
  async sendCommand(serverId: string, cmd: string): Promise<void> {
    return commandQueue.enqueue(serverId, () => this._attachAndWrite(serverId, cmd));
  }

  private async _attachAndWrite(serverId: string, cmd: string): Promise<void> {
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
        ...dockerOptions('POST', `/containers/${name}/attach?stdin=1&stream=1&stdout=0&stderr=0`),
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

  // ── Log streaming ─────────────────────────────────────────────────────────

  /**
   * Start streaming logs from a Docker container.
   *
   * Inspects the container first to detect whether it has a TTY allocated:
   *
   *   tty: true  → Docker streams raw PTY bytes with \r\n line endings.
   *                We buffer across chunks and split on \r?\n.
   *
   *   tty: false → Docker multiplexes stdout/stderr in 8-byte frames:
   *                [stream_type(1), 0, 0, 0, size(4 BE)] + payload
   *                We parse frames, extract payload, then split lines.
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

    // Inspect first to detect TTY mode; default to true (our game container)
    this.inspect(containerName).then(info => {
      const isTty = info?.tty !== false; // true if unknown or explicitly true

      const req = http.request(
        dockerOptions('GET', `/containers/${containerName}/logs?follow=true&stdout=true&stderr=true&tail=100`),
        (res) => {
          if (isTty) {
            // ── TTY mode: raw PTY bytes, \r\n line endings ─────────────────
            let lineBuffer = '';

            res.on('data', (chunk: Buffer) => {
              lineBuffer += stripAnsi(chunk.toString('utf-8'));
              const lines = lineBuffer.split(/\r?\n/);
              lineBuffer  = lines.pop() ?? ''; // last may be incomplete
              for (const line of lines) {
                pushLine(line.trimEnd());
              }
            });

            res.on('end', () => {
              if (lineBuffer) pushLine(lineBuffer.trimEnd());
              this._onStreamEnd(serverId, emitter);
            });

          } else {
            // ── Non-TTY mode: 8-byte Docker multiplex frames ───────────────
            // Frame header: [stream(1B), 0, 0, 0, size(4B big-endian)]
            let frameBuffer = Buffer.alloc(0);

            res.on('data', (chunk: Buffer) => {
              frameBuffer = Buffer.concat([frameBuffer, chunk]);
              while (frameBuffer.length >= 8) {
                const frameSize = frameBuffer.readUInt32BE(4);
                if (frameBuffer.length < 8 + frameSize) break;
                const payload   = frameBuffer.subarray(8, 8 + frameSize).toString('utf-8');
                frameBuffer     = frameBuffer.subarray(8 + frameSize);
                for (const raw of stripAnsi(payload).split('\n')) {
                  pushLine(raw.trimEnd());
                }
              }
            });

            res.on('end', () => {
              this._onStreamEnd(serverId, emitter);
            });
          }

          res.on('error', (err: Error) => {
            pushLine(`# Log stream error: ${err.message}`);
            emitter.emit('exit');
          });
        }
      );

      req.on('error', (err: Error) => {
        emitter.emit('line', `# Docker connection error: ${err.message}`);
        emitter.emit('exit');
      });

      req.end();
      this.logStreams.set(serverId, req);
    });
  }

  private _onStreamEnd(serverId: string, emitter: EventEmitter): void {
    this.runningContainers.delete(serverId);
    const emitterRef = this.outputEmitters.get(serverId);
    if (emitterRef) emitterRef.emit('line', '# Container stopped.');
    emitter.emit('exit');
    this.logStreams.delete(serverId);

    setTimeout(() => {
      this.outputBuffers.delete(serverId);
      this.outputEmitters.delete(serverId);
    }, BUFFER_LINGER_MS);
  }

  private stopLogStream(serverId: string): void {
    const req = this.logStreams.get(serverId);
    if (req) {
      req.destroy();
      this.logStreams.delete(serverId);
    }
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getOutputBuffer(serverId: string): string[] {
    return this.outputBuffers.get(serverId) ?? [];
  }

  getOutputEmitter(serverId: string): EventEmitter | undefined {
    return this.outputEmitters.get(serverId);
  }

  // ── Startup reconciliation ────────────────────────────────────────────────

  /**
   * Called once on server startup.
   * Checks each registered server's container state and reconnects log
   * streams for any that are already running.
   */
  async reconnect(): Promise<void> {
    const servers = await prisma.server.findMany();

    for (const server of servers) {
      const name = (
        server.containerName?.trim() ||
        server.executablePath.trim() ||
        process.env.GAME_CONTAINER_NAME ||
        'ormod-game'
      );
      try {
        const info = await this.inspect(name);
        if (info?.running) {
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
