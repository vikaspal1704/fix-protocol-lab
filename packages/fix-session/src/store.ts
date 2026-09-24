import type { FixField } from "@fixlab/fix-core";

export interface StoredMessage {
  readonly seq: number;
  readonly msgType: string;
  readonly fields: readonly FixField[];
  readonly sendingTime: string;
  readonly admin: boolean;
}

/** In-memory outbound store used to answer ResendRequests (no persistence by design). */
export class MessageStore {
  private readonly messages = new Map<number, StoredMessage>();

  constructor(private readonly capacity = 10_000) {}

  add(message: StoredMessage): void {
    this.messages.set(message.seq, message);
    if (this.messages.size > this.capacity) {
      const oldest = this.messages.keys().next().value;
      if (oldest !== undefined) this.messages.delete(oldest);
    }
  }

  get(seq: number): StoredMessage | undefined {
    return this.messages.get(seq);
  }

  clear(): void {
    this.messages.clear();
  }
}
