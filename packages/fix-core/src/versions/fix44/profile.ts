import type { ImplementedProfile } from "../registry.js";
import { fix44Dictionary } from "./dictionary.js";

export const fix44Profile: ImplementedProfile = {
  id: "FIX.4.4",
  label: "FIX 4.4",
  beginString: "FIX.4.4",
  status: "implemented",
  summary: "The most widely deployed version; ExecType F reports every fill.",
  order: 44,
  dictionary: fix44Dictionary,
  session: {
    extraLogonFields: [],
    adminMsgTypes: ["0", "1", "2", "3", "4", "5", "A"],
  },
};
