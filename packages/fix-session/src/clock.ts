/** Injectable time source so every session timer can be driven by tests. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Timer {
  readonly id: number;
  readonly at: number;
  readonly fn: () => void;
}

/**
 * Deterministic clock for tests and simulations: time only moves when advance()
 * is called, and timers due at the same instant run in the order they were set.
 */
export class ManualClock implements Clock {
  private current: number;
  private nextId = 1;
  private timers: Timer[] = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: () => void, ms: number): unknown {
    const timer = { id: this.nextId++, at: this.current + Math.max(0, ms), fn };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  /** Run every timer due within the next `ms` milliseconds, in time order. */
  advance(ms: number): void {
    const target = this.current + ms;
    for (;;) {
      const due = this.timers
        .filter((t) => t.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.current = due.at;
      due.fn();
    }
    this.current = target;
  }

  /** Advance to an absolute time. */
  advanceTo(epochMs: number): void {
    this.advance(epochMs - this.current);
  }
}
