import { fix42Profile } from "./fix42/profile.js";
import { fix43Profile } from "./fix43/profile.js";
import { fix44Profile } from "./fix44/profile.js";
import { fix50sp2Profile } from "./fix50sp2/profile.js";
import { plannedProfiles } from "./planned.js";
import { registerVersion } from "./registry.js";

export * from "./registry.js";

for (const profile of [
  fix42Profile,
  fix43Profile,
  fix44Profile,
  fix50sp2Profile,
  ...plannedProfiles,
]) {
  registerVersion(profile);
}

/** Version used when none is specified. */
export const DEFAULT_VERSION_ID = fix44Profile.id;
