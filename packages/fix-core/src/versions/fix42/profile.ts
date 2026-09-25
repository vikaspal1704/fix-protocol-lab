import type { ImplementedProfile } from "../registry.js";
import { fix42Dictionary } from "./dictionary.js";

export const fix42Profile: ImplementedProfile = {
  id: "FIX.4.2",
  label: "FIX 4.2",
  beginString: "FIX.4.2",
  status: "implemented",
  summary:
    "Still common; fills use ExecType 1/2 and every execution report carries ExecTransType (20).",
  order: 42,
  dictionary: fix42Dictionary,
  session: {
    extraLogonFields: [],
    adminMsgTypes: ["0", "1", "2", "3", "4", "5", "A"],
  },
};
