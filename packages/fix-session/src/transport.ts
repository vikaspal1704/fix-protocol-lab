import type { Clock } from "./clock.js";

/** A byte pipe the session writes to and reads from (TCP socket or in-memory). */
export interface ByteTransport {
  write(bytes: Uint8Array): void;
  onData(cb: (chunk: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  close(): void;
}

class PipeEnd implements ByteTransport {
  peer!: PipeEnd;
  private dataListeners: ((chunk: Uint8Array) => void)[] = [];
  private closeListeners: (() => void)[] = [];
  closed = false;

  constructor(
    private readonly clock: Clock,
    private readonly latencyMs: number,
  ) {}

  write(bytes: Uint8Array): void {
    if (this.closed) return;
    const copy = bytes.slice();
    this.clock.setTimeout(() => {
      if (!this.peer.closed) for (const cb of this.peer.dataListeners) cb(copy);
    }, this.latencyMs);
  }

  onData(cb: (chunk: Uint8Array) => void): void {
    this.dataListeners.push(cb);
  }

  onClose(cb: () => void): void {
    this.closeListeners.push(cb);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.closeListeners) cb();
    this.clock.setTimeout(() => this.peer.close(), this.latencyMs);
  }
}

/**
 * Two connected in-memory transports. Bytes arrive after `latencyMs` on the
 * given clock, which keeps tests deterministic (the reference timeline uses 1 ms).
 */
export function createPipe(clock: Clock, latencyMs = 1): [ByteTransport, ByteTransport] {
  const a = new PipeEnd(clock, latencyMs);
  const b = new PipeEnd(clock, latencyMs);
  a.peer = b;
  b.peer = a;
  return [a, b];
}
