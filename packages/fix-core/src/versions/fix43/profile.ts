import type { ImplementedProfile } from "../registry.js";
import { fix43Dictionary } from "./dictionary.js";

export const fix43Profile: ImplementedProfile = {
  id: "FIX.4.3",
  label: "FIX 4.3",
  beginString: "FIX.4.3",
  status: "implemented",
  summary:
    "The bridge between 4.2 and 4.4: drops ExecTransType, introduces ExecType F, still requires HandlInst (21).",
  order: 43,
  dictionary: fix43Dictionary,
  session: {
    extraLogonFields: [],
    adminMsgTypes: ["0", "1", "2", "3", "4", "5", "A"],
  },
};
