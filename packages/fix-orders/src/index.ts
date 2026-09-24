import { fix44Dialect } from "./fix44.js";
import type { OrderDialect } from "./types.js";

export * from "./types.js";

const DIALECTS = new Map<string, OrderDialect>([[fix44Dialect.versionId, fix44Dialect]]);

/** Order dialect for an implemented FIX version (ARCHITECTURE §12). */
export function dialectFor(versionId: string): OrderDialect {
  const dialect = DIALECTS.get(versionId);
  if (!dialect) throw new Error(`no order dialect for ${versionId}`);
  return dialect;
}

export function hasDialect(versionId: string): boolean {
  return DIALECTS.has(versionId);
}
