import type { FixVersionProfile } from "./registry.js";

/**
 * Versions on the roadmap (ARCHITECTURE §12). They're listed so the UI can
 * show them, but can't be used on the wire until they're implemented.
 */
export const plannedProfiles: readonly FixVersionProfile[] = [
  {
    id: "FIX.4.2",
    label: "FIX 4.2",
    beginString: "FIX.4.2",
    status: "planned",
    summary: "Still common; fills use ExecType 1/2 and ExecTransType (20).",
    order: 42,
    dictionary: null,
    session: null,
  },
  {
    id: "FIX.4.3",
    label: "FIX 4.3",
    beginString: "FIX.4.3",
    status: "planned",
    summary: "The bridge between 4.2 and 4.4; drops ExecTransType.",
    order: 43,
    dictionary: null,
    session: null,
  },
  {
    id: "FIX.5.0SP2",
    label: "FIX 5.0 SP2",
    beginString: "FIXT.1.1",
    applVerId: "9",
    status: "planned",
    summary: "Application layer over the FIXT.1.1 session layer, selected by ApplVerID.",
    order: 52,
    dictionary: null,
    session: null,
  },
];
