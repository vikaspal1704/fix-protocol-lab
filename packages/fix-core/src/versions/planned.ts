import type { FixVersionProfile } from "./registry.js";

/**
 * Versions on the roadmap (ARCHITECTURE §12). They're listed so the UI can
 * show them, but can't be used on the wire until they're implemented.
 * Empty for now: FIX 4.2, 4.3, 4.4 and 5.0 SP2 are all implemented.
 */
export const plannedProfiles: readonly FixVersionProfile[] = [];
