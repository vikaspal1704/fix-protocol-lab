import { describe, expect, it } from "vitest";

import { FixFramer, FixParseError, fromDisplay, toDisplay } from "../src/index.js";
import { VECTORS } from "./vectors.js";

describe("framer", () => {
  it("framer reassembles a message split across chunks", () => {
    const framer = new FixFramer();
    const bytes = fromDisplay(VECTORS.A3);
    const out: Uint8Array[] = [];

    for (const byte of bytes) out.push(...framer.push(Uint8Array.of(byte)));

    expect(out.map(toDisplay)).toEqual([VECTORS.A3]);
    expect(framer.pending).toBe(0);
  });

  it("framer returns multiple messages from one chunk", () => {
    const framer = new FixFramer();

    const out = framer.push(fromDisplay(VECTORS.A1 + VECTORS.A3 + VECTORS.A4));

    expect(out.map(toDisplay)).toEqual([VECTORS.A1, VECTORS.A3, VECTORS.A4]);
  });

  it("framer resyncs after garbage bytes", () => {
    const framer = new FixFramer();

    const out = framer.push(fromDisplay("xx8=junk|garbage|" + VECTORS.A1 + "noise"));

    expect(out.map(toDisplay)).toEqual([VECTORS.A1]);
    expect(framer.push(fromDisplay(VECTORS.B1)).map(toDisplay)).toEqual([VECTORS.B1]);
  });

  it("framer enforces max message size", () => {
    const framer = new FixFramer();

    expect(() => framer.push(fromDisplay("8=FIX.4.4|9=70000|35=0|"))).toThrow(FixParseError);
    try {
      framer.push(fromDisplay("8=FIX.4.4|9=70000|"));
    } catch (err) {
      expect((err as FixParseError).code).toBe("MESSAGE_TOO_LARGE");
    }
    // Still usable afterwards.
    expect(new FixFramer().push(fromDisplay(VECTORS.E1)).map(toDisplay)).toEqual([VECTORS.E1]);
  });
});
