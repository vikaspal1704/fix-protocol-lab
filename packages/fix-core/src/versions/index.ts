import { fix44Profile } from "./fix44/profile.js";
import { plannedProfiles } from "./planned.js";
import { registerVersion } from "./registry.js";

export * from "./registry.js";

registerVersion(fix44Profile);
for (const profile of plannedProfiles) registerVersion(profile);

/** Version used when none is specified (FIX 4.4 in v1). */
export const DEFAULT_VERSION_ID = fix44Profile.id;
