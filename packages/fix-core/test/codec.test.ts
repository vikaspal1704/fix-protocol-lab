import { describe, expect, it } from "vitest";

import {
  computeCheckSum,
  decode,
  encode,
  FixParseError,
  fromDisplay,
  getFields,
  toDisplay,
  type FixMessage,
} from "../src/index.js";
import { messageOf, rawWithBody, VECTORS } from "./vectors.js";

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(FixParseError);
    expect((err as FixParseError).code).toBe(code);
    return;
  }
  throw new Error(`expected FixParseError ${code}`);
}

describe("codec", () => {
  it("encodes golden vectors byte-for-byte", () => {
    for (const [id, display] of Object.entries(VECTORS)) {
      expect(toDisplay(encode(messageOf(display))), id).toBe(display);
      expect(encode(messageOf(display)), id).toEqual(fromDisplay(display));
    }
  });

  it("decodes golden vectors into ordered fields", () => {
    const msg = decode(fromDisplay(VECTORS.A3));

    expect(msg.beginString).toBe("FIX.4.4");
    expect(msg.msgType).toBe("D");
    expect(msg.fields.map(([t]) => t)).toEqual([49, 56, 34, 52, 11, 55, 54, 60, 38, 40, 44, 59]);
    for (const display of Object.values(VECTORS)) {
      expect(decode(fromDisplay(display))).toEqual(messageOf(display));
    }
  });

  it("round-trips encode and decode", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .-:/_=|";
    for (let i = 0; i < 500; i++) {
      const fields = Array.from({ length: 1 + rand(20) }, () => {
        let tag = 1 + rand(5000);
        while ([8, 9, 10, 35].includes(tag)) tag += 1;
        const value = Array.from({ length: 1 + rand(30) }, () => alphabet[rand(alphabet.length)]).join("");
        return [tag, value.replaceAll("|", "!")] as const;
      });
      const msg: FixMessage = { beginString: "FIX.4.4", msgType: rand(2) ? "D" : "0", fields };
      const bytes = encode(msg);
      expect(decode(bytes)).toEqual(msg);
      expect(encode(decode(bytes))).toEqual(bytes);
    }
  });

  it("computes checksum edge values 000 and 255", () => {
    const e1 = fromDisplay(VECTORS.E1);
    const e2 = fromDisplay(VECTORS.E2);

    expect(computeCheckSum(e1.subarray(0, e1.length - 7))).toBe("000");
    expect(computeCheckSum(e2.subarray(0, e2.length - 7))).toBe("255");
  });

  it("rejects wrong checksum", () => {
    const bad = VECTORS.A1.replace("10=083|", "10=084|");

    expectCode(() => decode(fromDisplay(bad)), "BAD_CHECKSUM");
    expectCode(() => decode(fromDisplay(VECTORS.A1.replace("10=083|", "10=83|"))), "BAD_CHECKSUM");
    expectCode(() => decode(fromDisplay(VECTORS.A1.replace("|10=083|", "|"))), "BAD_CHECKSUM");
  });

  it("rejects wrong body length", () => {
    expectCode(() => decode(fromDisplay(VECTORS.A1.replace("9=72|", "9=71|"))), "BAD_BODY_LENGTH");
    expectCode(() => decode(fromDisplay(VECTORS.A1.replace("9=72|", "9=73|"))), "BAD_BODY_LENGTH");
    expectCode(() => decode(fromDisplay(VECTORS.A1.replace("9=72|", "9=x|"))), "BAD_BODY_LENGTH");
  });

  it("rejects missing or misplaced begin string", () => {
    expectCode(() => decode(fromDisplay(VECTORS.A1.slice("8=FIX.4.4|".length))), "BAD_BEGIN_STRING");
    expectCode(() => decode(fromDisplay(" " + VECTORS.A1)), "BAD_BEGIN_STRING");
  });

  it("rejects msg type not in third position", () => {
    const raw = rawWithBody("49=BUYSIDE|35=0|56=EXCH|34=2|52=20260924-10:00:30.000|");

    expectCode(() => decode(fromDisplay(raw)), "MISSING_MSG_TYPE");
  });

  it("rejects malformed fields", () => {
    for (const field of ["abc=1", "012=x", "44=", "4444"]) {
      const raw = rawWithBody(`35=0|49=BUYSIDE|${field}|`);
      expectCode(() => decode(fromDisplay(raw)), "MALFORMED_FIELD");
    }
  });

  it("preserves duplicate tags in order", () => {
    const msg: FixMessage = {
      beginString: "FIX.4.4",
      msgType: "D",
      fields: [[453, "2"], [448, "PARTY-A"], [447, "D"], [448, "PARTY-B"], [447, "C"]],
    };

    const decoded = decode(encode(msg));

    expect(decoded).toEqual(msg);
    expect(getFields(decoded, 448)).toEqual(["PARTY-A", "PARTY-B"]);
  });

  it("encoder rejects SOH and non-ASCII in values", () => {
    for (const value of ["a\x01b", "café", "", "tab\there"]) {
      expectCode(
        () => encode({ beginString: "FIX.4.4", msgType: "0", fields: [[58, value]] }),
        "MALFORMED_FIELD",
      );
    }
  });
});
