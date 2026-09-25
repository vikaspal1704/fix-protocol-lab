import type { ImplementedProfile } from "../registry.js";
import { fix50sp2Dictionary } from "./dictionary.js";

/** ApplVerID (1128/1137) code for FIX 5.0 SP2. */
const APPL_VER_ID = "9";

export const fix50sp2Profile: ImplementedProfile = {
  id: "FIX.5.0SP2",
  label: "FIX 5.0 SP2",
  beginString: "FIXT.1.1",
  applVerId: APPL_VER_ID,
  status: "implemented",
  summary:
    "Application layer over the separate FIXT.1.1 session layer; Logon agrees DefaultApplVerID (1137).",
  order: 52,
  dictionary: fix50sp2Dictionary,
  session: {
    extraLogonFields: [[1137, APPL_VER_ID]],
    adminMsgTypes: ["0", "1", "2", "3", "4", "5", "A"],
  },
};
