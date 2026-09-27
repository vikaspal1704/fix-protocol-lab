import { fix42Dialect } from "./fix42.js";
import { fix43Dialect } from "./fix43.js";
import { fix44Dialect } from "./fix44.js";
import { fix50sp2Dialect } from "./fix50sp2.js";
import type { OrderDialect } from "./types.js";

export * from "./types.js";
export { createDialect, type DialectRules } from "./dialect.js";

const DIALECTS = new Map<string, OrderDialect>(
  [fix42Dialect, fix43Dialect, fix44Dialect, fix50sp2Dialect].map((d) => [d.versionId, d]),
);

/** Order dialect for an implemented FIX version (ARCHITECTURE §12). */
export function dialectFor(versionId: string): OrderDialect {
  const dialect = DIALECTS.get(versionId);
  if (!dialect) throw new Error(`no order dialect for ${versionId}`);
  return dialect;
}

export function hasDialect(versionId: string): boolean {
  return DIALECTS.has(versionId);
}
