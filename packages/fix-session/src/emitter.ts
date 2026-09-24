type Listener<A extends unknown[]> = (...args: A) => void;

/** Minimal typed event emitter (keeps the session free of Node's untyped EventEmitter). */
export class Emitter<Events extends Record<string, unknown[]>> {
  private listeners: { [K in keyof Events]?: Listener<Events[K]>[] } = {};

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    (this.listeners[event] ??= []).push(listener);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this.listeners[event] = this.listeners[event]?.filter((l) => l !== listener);
    return this;
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    for (const listener of this.listeners[event] ?? []) listener(...args);
  }
}
