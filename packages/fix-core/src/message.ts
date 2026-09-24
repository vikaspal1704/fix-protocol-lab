import { FixParseError } from "./errors.js";

export const SOH = 0x01;

/** A field is a numeric tag and its raw string value. Order is significant. */
export type FixField = readonly [tag: number, value: string];

export interface FixMessage {
  /** A registered profile's BeginString, e.g. "FIX.4.4". */
  readonly beginString: string;
  /** Tag 35. */
  readonly msgType: string;
  /** Body fields in wire order, excluding 8, 9, 35 and 10. Duplicates allowed. */
  readonly fields: readonly FixField[];
}

/** First occurrence of `tag`, or undefined. */
export function getField(msg: FixMessage, tag: number): string | undefined {
  return msg.fields.find(([t]) => t === tag)?.[1];
}

/** Every occurrence of `tag`, in wire order. */
export function getFields(msg: FixMessage, tag: number): string[] {
  return msg.fields.filter(([t]) => t === tag).map(([, v]) => v);
}

export function requireField(msg: FixMessage, tag: number): string {
  const value = getField(msg, tag);
  if (value === undefined) {
    throw new FixParseError("MISSING_REQUIRED_TAG", `required tag ${tag} is missing`, tag);
  }
  return value;
}
