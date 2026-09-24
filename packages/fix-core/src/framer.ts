import { FixParseError } from "./errors.js";
import { SOH } from "./message.js";

const START = [0x38, 0x3d, 0x46, 0x49, 0x58]; // "8=FIX" (matches FIX.x.y and FIXT.1.1)
const TRAILER_LENGTH = 7; // "10=ddd" + SOH

/**
 * Splits a TCP byte stream into whole FIX messages. It is version-neutral and
 * doesn't validate CheckSum: decode() does that, so a damaged message can be
 * reported instead of disappearing.
 */
export class FixFramer {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly maxMessageBytes: number;

  constructor(opts: { maxMessageBytes?: number } = {}) {
    this.maxMessageBytes = opts.maxMessageBytes ?? 65536;
  }

  /** Bytes buffered but not yet a complete message. */
  get pending(): number {
    return this.buffer.length;
  }

  /** Append a chunk; returns every complete message now available (raw bytes). */
  push(chunk: Uint8Array): Uint8Array[] {
    this.buffer = concat(this.buffer, chunk);
    const messages: Uint8Array[] = [];

    for (;;) {
      const start = indexOf(this.buffer, START);
      if (start < 0) {
        // Keep a tail in case "8=FIX" is split across chunks.
        this.buffer = this.buffer.slice(Math.max(0, this.buffer.length - (START.length - 1)));
        break;
      }
      if (start > 0) this.buffer = this.buffer.slice(start); // discard garbage before a message

      // Header: 8=<BeginString><SOH>9=<digits><SOH>
      const beginEnd = this.buffer.indexOf(SOH);
      if (beginEnd < 0 || this.buffer.length < beginEnd + 3) break; // header still arriving
      if (this.buffer[beginEnd + 1] !== 0x39 || this.buffer[beginEnd + 2] !== 0x3d) {
        this.buffer = this.buffer.slice(1); // not a real header; resync
        continue;
      }
      const lengthEnd = this.buffer.indexOf(SOH, beginEnd + 3);
      if (lengthEnd < 0) break;
      const lengthText = String.fromCharCode(...this.buffer.subarray(beginEnd + 3, lengthEnd));
      if (!/^\d{1,9}$/.test(lengthText)) {
        this.buffer = this.buffer.slice(1);
        continue;
      }
      const bodyLength = Number(lengthText);
      const end = lengthEnd + 1 + bodyLength + TRAILER_LENGTH;
      if (end > this.maxMessageBytes) {
        this.buffer = this.buffer.slice(1); // drop this header so the framer stays usable
        throw new FixParseError(
          "MESSAGE_TOO_LARGE",
          `message of ${end} bytes exceeds the ${this.maxMessageBytes}-byte limit`,
          9,
        );
      }
      if (this.buffer.length < end) break; // wait for the rest

      messages.push(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end);
    }
    return messages;
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b.slice();
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function indexOf(haystack: Uint8Array, needle: readonly number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
