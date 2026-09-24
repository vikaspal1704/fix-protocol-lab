import { FixParseError } from "./errors.js";
import { SOH, type FixField, type FixMessage } from "./message.js";
import { getImplementedVersion, versionForBeginString, isImplemented } from "./versions/index.js";

export interface EncodeOptions {
  /** Test/fault hook: write this CheckSum instead of the computed one. */
  readonly overrideCheckSum?: string;
  /** Test hook: write this BodyLength instead of the computed one. */
  readonly overrideBodyLength?: number;
}

const encoder = new TextEncoder();
const TAG = /^[1-9][0-9]*$/;
const RESERVED_TAGS = new Set([8, 9, 10, 35]);

/** Sum of bytes modulo 256, as three digits. FIX: CheckSum covers every byte before "10=". */
export function computeCheckSum(bytesBeforeChecksum: Uint8Array): string {
  let sum = 0;
  for (const byte of bytesBeforeChecksum) sum = (sum + byte) & 0xff;
  return String(sum).padStart(3, "0");
}

function assertValue(tag: number, value: string): void {
  if (value.length === 0) {
    throw new FixParseError("MALFORMED_FIELD", `tag ${tag} has an empty value`, tag);
  }
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    // v1 is ASCII-only; SOH would split the field.
    if (code === SOH || code > 0x7e || code < 0x20) {
      throw new FixParseError(
        "MALFORMED_FIELD",
        `tag ${tag} contains a byte that is not printable ASCII (0x${code.toString(16)})`,
        tag,
      );
    }
  }
}

export function encode(msg: FixMessage, opts: EncodeOptions = {}): Uint8Array {
  const profile = getImplementedVersion(versionOrThrow(msg.beginString));
  assertValue(35, msg.msgType);

  let body = `35=${msg.msgType}\x01`;
  for (const [tag, value] of msg.fields) {
    if (!Number.isInteger(tag) || tag <= 0 || RESERVED_TAGS.has(tag)) {
      throw new FixParseError("MALFORMED_FIELD", `tag ${tag} is not allowed in the body`, tag);
    }
    assertValue(tag, value);
    body += `${tag}=${value}\x01`;
  }

  // FIX: BodyLength counts bytes after "9=...<SOH>" up to and including the SOH before "10=".
  const bodyLength = opts.overrideBodyLength ?? body.length;
  const head = encoder.encode(`8=${profile.beginString}\x019=${bodyLength}\x01${body}`);
  const checkSum = opts.overrideCheckSum ?? computeCheckSum(head);
  const trailer = encoder.encode(`10=${checkSum}\x01`);

  const out = new Uint8Array(head.length + trailer.length);
  out.set(head);
  out.set(trailer, head.length);
  return out;
}

function versionOrThrow(beginString: string): string {
  const profile = versionForBeginString(beginString);
  if (!profile) {
    throw new FixParseError("UNKNOWN_VERSION", `BeginString ${beginString} is not registered`);
  }
  return profile.id;
}

/** Latin-1 view of the bytes; FIX framing is byte-oriented. */
function bytesToString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

// eslint-disable-next-line no-control-regex -- SOH (0x01) is the FIX field delimiter
const TRAILER = /^10=(\d{3})\x01$/;

export function decode(bytes: Uint8Array): FixMessage {
  const text = bytesToString(bytes);

  // 8=BeginString must come first.
  if (!text.startsWith("8=")) {
    throw new FixParseError("BAD_BEGIN_STRING", "message must start with 8=", 8);
  }
  const beginEnd = text.indexOf("\x01");
  if (beginEnd < 0) throw new FixParseError("BAD_BEGIN_STRING", "BeginString is not terminated", 8);
  const beginString = text.slice(2, beginEnd);
  const profile = versionForBeginString(beginString);
  if (!profile || !isImplemented(profile)) {
    throw new FixParseError(
      "UNKNOWN_VERSION",
      profile
        ? `${profile.label} is planned, not implemented yet`
        : `BeginString ${beginString} is not registered`,
      8,
    );
  }

  // 9=BodyLength must come second.
  if (!text.startsWith("9=", beginEnd + 1)) {
    throw new FixParseError("BAD_BODY_LENGTH", "BodyLength (9) must be the second field", 9);
  }
  const lengthEnd = text.indexOf("\x01", beginEnd + 1);
  const lengthText = text.slice(beginEnd + 3, lengthEnd < 0 ? undefined : lengthEnd);
  if (lengthEnd < 0 || !/^\d+$/.test(lengthText)) {
    throw new FixParseError("BAD_BODY_LENGTH", `BodyLength "${lengthText}" is not a number`, 9);
  }
  const bodyLength = Number(lengthText);
  const bodyStart = lengthEnd + 1;
  const bodyEnd = bodyStart + bodyLength;

  // The trailer must sit exactly BodyLength bytes after the body starts.
  const trailerStart = text.lastIndexOf("\x0110=") + 1;
  if (trailerStart === 0) {
    throw new FixParseError("BAD_CHECKSUM", "CheckSum (10) is missing", 10);
  }
  if (trailerStart !== bodyEnd) {
    throw new FixParseError(
      "BAD_BODY_LENGTH",
      `BodyLength is ${bodyLength} but the body is ${trailerStart - bodyStart} bytes`,
      9,
    );
  }
  const trailer = TRAILER.exec(text.slice(trailerStart));
  if (!trailer) {
    throw new FixParseError("BAD_CHECKSUM", "CheckSum must be 10=ddd followed by SOH, last", 10);
  }
  const expected = computeCheckSum(bytes.subarray(0, bodyEnd));
  if (trailer[1] !== expected) {
    throw new FixParseError("BAD_CHECKSUM", `CheckSum is ${trailer[1]} but should be ${expected}`, 10);
  }

  // Body: 35 first, then the remaining fields in order.
  const rawFields = text.slice(bodyStart, bodyEnd - 1).split("\x01");
  const fields: FixField[] = [];
  let msgType: string | undefined;
  rawFields.forEach((raw, index) => {
    const eq = raw.indexOf("=");
    const tagText = eq < 0 ? raw : raw.slice(0, eq);
    const value = eq < 0 ? "" : raw.slice(eq + 1);
    if (eq < 0 || !TAG.test(tagText) || value.length === 0) {
      throw new FixParseError("MALFORMED_FIELD", `malformed field "${raw}"`);
    }
    const tag = Number(tagText);
    if (index === 0) {
      if (tag !== 35) throw new FixParseError("MISSING_MSG_TYPE", "MsgType (35) must be the third field", 35);
      msgType = value;
      return;
    }
    if (RESERVED_TAGS.has(tag)) {
      throw new FixParseError("MALFORMED_FIELD", `tag ${tag} may not appear in the body`, tag);
    }
    fields.push([tag, value]);
  });
  if (msgType === undefined) throw new FixParseError("MISSING_MSG_TYPE", "MsgType (35) is missing", 35);

  return { beginString, msgType, fields };
}

/** Render SOH as "|" for display. */
export function toDisplay(bytes: Uint8Array): string {
  return bytesToString(bytes).replaceAll("\x01", "|");
}

/** Parse the "|" display form back into wire bytes (tests, paste box). */
export function fromDisplay(text: string): Uint8Array {
  return encoder.encode(text.replaceAll("|", "\x01"));
}
