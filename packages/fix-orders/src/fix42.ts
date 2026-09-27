import { createDialect } from "./dialect.js";

/** FIX 4.2: HandlInst on orders, ExecTransType on reports, fills as ExecType 1/2. */
export const fix42Dialect = createDialect({
  versionId: "FIX.4.2",
  handlInst: true,
  execTransType: true,
  fillExecType: "PARTIAL_OR_FULL",
});
