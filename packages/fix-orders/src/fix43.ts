import { createDialect } from "./dialect.js";

/** FIX 4.3: ExecTransType is gone and fills are ExecType F, but HandlInst is still required. */
export const fix43Dialect = createDialect({
  versionId: "FIX.4.3",
  handlInst: true,
  execTransType: false,
  fillExecType: "F",
});
