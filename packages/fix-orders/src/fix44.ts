import { createDialect } from "./dialect.js";

/** FIX 4.4: ExecType F for every fill; OrdStatus carries partial vs full. */
export const fix44Dialect = createDialect({
  versionId: "FIX.4.4",
  handlInst: false,
  execTransType: false,
  fillExecType: "F",
});
