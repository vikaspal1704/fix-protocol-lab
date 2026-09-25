import { createDialect } from "./dialect.js";

/**
 * FIX 5.0 SP2: the same order messages as FIX 4.4. ApplVerID (1128) is left out
 * because both sides agreed DefaultApplVerID (1137) on the FIXT Logon.
 */
export const fix50sp2Dialect = createDialect({
  versionId: "FIX.5.0SP2",
  handlInst: false,
  execTransType: false,
  fillExecType: "F",
});
