import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  decode,
  defineDictionary,
  encode,
  FixParseError,
  fromDisplay,
  getImplementedVersion,
  getVersion,
  listVersions,
  registerVersion,
  toDisplay,
} from "../src/index.js";
import { VECTORS } from "./vectors.js";

const SRC = join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("versions", () => {
  it("registry lists implemented and planned versions", () => {
    const versions = listVersions().map((v) => [v.id, v.status]);

    expect(versions).toEqual([
      ["FIX.4.2", "planned"],
      ["FIX.4.3", "planned"],
      ["FIX.4.4", "implemented"],
      ["FIX.5.0SP2", "planned"],
    ]);
    expect(getVersion("FIX.5.0SP2").beginString).toBe("FIXT.1.1");
  });

  it("registry rejects duplicate version ids", () => {
    expect(() => registerVersion(getVersion("FIX.4.4"))).toThrow(/already registered/);
  });

  it("decode rejects unregistered or planned begin strings", () => {
    for (const begin of ["FIX.4.2", "FOO.1"]) {
      const raw = fromDisplay(VECTORS.E1.replace("8=FIX.4.4", `8=${begin}`));
      expect(() => decode(raw)).toThrow(FixParseError);
      try {
        decode(raw);
      } catch (err) {
        expect((err as FixParseError).code).toBe("UNKNOWN_VERSION");
      }
    }
    expect(() => getImplementedVersion("FIX.4.2")).toThrow(/planned/);
  });

  it("supports a newly registered test version", () => {
    const base = getImplementedVersion("FIX.4.4");
    registerVersion({
      ...base,
      id: "FIX.9.9",
      label: "FIX 9.9 (test)",
      beginString: "FIX.9.9",
      order: 99,
    });

    const msg = { beginString: "FIX.9.9", msgType: "0", fields: [[49, "A"], [56, "B"]] as const };
    const bytes = encode(msg);

    expect(toDisplay(bytes).startsWith("8=FIX.9.9|9=")).toBe(true);
    expect(decode(bytes)).toEqual(msg);
  });

  it("dictionary overrides compose over a base", () => {
    const base = getImplementedVersion("FIX.4.4").dictionary;

    const derived = defineDictionary(base, {
      removeTags: [141],
      tags: [
        { tag: 20, name: "ExecTransType", type: "CHAR", description: "Transaction type.", values: { "0": "New" } },
        { tag: 150, name: "ExecType", type: "CHAR", description: "Old semantics.", values: { "1": "Partial fill" } },
      ],
    });

    expect(derived.tags.has(141)).toBe(false);
    expect(derived.tags.get(20)?.name).toBe("ExecTransType");
    expect(derived.tags.get(150)?.values).toEqual({ "1": "Partial fill" });
    expect(base.tags.has(141)).toBe(true); // base untouched
  });

  it("dictionary covers every tag used by the project", () => {
    const dict = getImplementedVersion("FIX.4.4").dictionary;
    const tags = [
      6, 7, 8, 9, 10, 11, 14, 16, 17, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 49, 52, 54,
      55, 56, 58, 59, 60, 97, 98, 102, 108, 112, 122, 123, 141, 150, 151, 371, 372, 373, 434,
    ];

    for (const tag of tags) expect(dict.tags.get(tag)?.description, `tag ${tag}`).toBeTruthy();
    for (const type of ["A", "0", "1", "2", "3", "4", "5", "D", "F", "8", "9"]) {
      expect(dict.msgTypes.get(type)?.name, `msgType ${type}`).toBeTruthy();
    }
  });

  it("runs without Node built-ins", () => {
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["']node:|require\(|\bBuffer\b/);
    }
  });

  it("no hard-coded begin string outside version profiles", () => {
    for (const file of sourceFiles(SRC)) {
      if (file.includes(join("versions", "fix44"))) continue;
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "") // doc comments may mention versions
        .replace(/\/\/.*$/gm, "");
      expect(code, file).not.toContain('"FIX.4.4"');
    }
  });
});
