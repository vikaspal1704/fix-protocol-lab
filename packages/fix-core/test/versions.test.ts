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
import { messageOf, VECTORS, VERSION_VECTORS } from "./vectors.js";

const SRC = join(import.meta.dirname, "..", "src");
const REPO = join(import.meta.dirname, "..", "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("versions", () => {
  it("registry lists every roadmap version as implemented", () => {
    const versions = listVersions().map((v) => [v.id, v.beginString, v.status]);

    expect(versions).toEqual([
      ["FIX.4.2", "FIX.4.2", "implemented"],
      ["FIX.4.3", "FIX.4.3", "implemented"],
      ["FIX.4.4", "FIX.4.4", "implemented"],
      ["FIX.5.0SP2", "FIXT.1.1", "implemented"],
    ]);
    expect(getImplementedVersion("FIX.5.0SP2").applVerId).toBe("9");
    expect(getImplementedVersion("FIX.5.0SP2").session.extraLogonFields).toEqual([[1137, "9"]]);
  });

  it("registry rejects duplicate version ids", () => {
    expect(() => registerVersion(getVersion("FIX.4.4"))).toThrow(/already registered/);
  });

  it("decode rejects unregistered or planned begin strings", () => {
    registerVersion({ id: "FIX.9.7", label: "FIX 9.7 (test)", beginString: "FIX.9.7", status: "planned", summary: "", order: 97, dictionary: null, session: null });
    for (const begin of ["FIX.9.7", "FOO.1"]) {
      const raw = fromDisplay(VECTORS.E1.replace("8=FIX.4.4", `8=${begin}`));
      expect(() => decode(raw)).toThrow(FixParseError);
      try {
        decode(raw);
      } catch (err) {
        expect((err as FixParseError).code).toBe("UNKNOWN_VERSION");
      }
    }
    expect(() => getImplementedVersion("FIX.9.7")).toThrow(/planned/);
  });

  for (const [id, vectors] of Object.entries(VERSION_VECTORS)) {
    it(`codec round-trips ${id} golden vectors`, () => {
      for (const display of Object.values(vectors)) {
        const expected = messageOf(display);

        expect(decode(fromDisplay(display))).toEqual(expected);
        expect(toDisplay(encode(expected))).toBe(display);
      }
    });
  }

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
    const common = [
      6, 7, 8, 9, 10, 11, 14, 16, 17, 31, 32, 34, 35, 36, 37, 38, 39, 40, 41, 43, 44, 45, 49, 52, 54,
      55, 56, 58, 59, 60, 97, 98, 102, 108, 112, 122, 123, 141, 150, 151, 371, 372, 373, 434,
    ];
    const extra: Record<string, number[]> = { "FIX.4.2": [20, 21], "FIX.4.3": [21], "FIX.4.4": [], "FIX.5.0SP2": [1128, 1137] };

    for (const [id, tags] of Object.entries(extra)) {
      const dict = getImplementedVersion(id).dictionary;
      for (const tag of [...common, ...tags]) expect(dict.tags.get(tag)?.description, `${id} tag ${tag}`).toBeTruthy();
      for (const type of ["A", "0", "1", "2", "3", "4", "5", "D", "F", "8", "9"]) {
        expect(dict.msgTypes.get(type)?.name, `${id} msgType ${type}`).toBeTruthy();
      }
    }
  });

  it("version dictionaries describe what changed between versions", () => {
    const dict = (id: string) => getImplementedVersion(id).dictionary;

    expect(dict("FIX.4.2").tags.get(150)?.values).toMatchObject({ "1": "Partial fill", "2": "Fill" });
    expect(dict("FIX.4.2").tags.get(150)?.values).not.toHaveProperty("F");
    expect(dict("FIX.4.2").tags.get(32)?.name).toBe("LastShares");
    expect(dict("FIX.4.3").tags.has(20)).toBe(false);
    expect(dict("FIX.4.3").tags.get(150)?.values).toHaveProperty("F");
    expect(dict("FIX.4.4").tags.has(21)).toBe(false);
    expect(dict("FIX.5.0SP2").tags.get(1137)?.values?.["9"]).toBe("FIX 5.0 SP2");
  });

  it("runs without Node built-ins", () => {
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from\s+["']node:|require\(|\bBuffer\b/);
    }
  });

  it("no hard-coded begin string outside version profiles", () => {
    const profileDir = /[\\/]versions[\\/]fix\d+(sp\d+)?[\\/]/;
    for (const file of sourceFiles(SRC)) {
      if (profileDir.test(file)) continue;
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "") // doc comments may mention versions
        .replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/["'`]FIXT?\.\d/);
    }
  });

  it("docs show only valid fix messages and the per-version vectors", () => {
    const docs = ["README.md", ...readdirSync(join(REPO, "docs")).map((f) => join("docs", f))].filter((f) => f.endsWith(".md"));
    let checked = 0;
    for (const doc of docs) {
      const text = readFileSync(join(REPO, doc), "utf8");
      for (const [display] of text.matchAll(/8=FIXT?\.[\d.]+\|[^\s`]*?\|10=\d{3}\|/g)) {
        if (display.includes("...") || display.includes("…")) continue; // abbreviated on purpose
        expect(() => decode(fromDisplay(display)), `${doc}: ${display}`).not.toThrow();
        checked += 1;
      }
    }
    const contract = readFileSync(join(REPO, "docs", "API_CONTRACT.md"), "utf8");
    for (const display of Object.values(VERSION_VECTORS).flatMap((v) => Object.values(v))) {
      expect(contract, display).toContain(display);
    }
    expect(checked).toBeGreaterThan(30);
  });
});
