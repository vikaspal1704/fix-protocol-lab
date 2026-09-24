import type { FixDictionary } from "../dictionary.js";
import { FixParseError } from "../errors.js";
import type { FixField } from "../message.js";

export type VersionStatus = "implemented" | "planned";

export interface SessionProfile {
  /** Extra Logon fields beyond 98/108/141, e.g. [[1137, "9"]] for FIXT. */
  readonly extraLogonFields: readonly FixField[];
  /** Admin MsgTypes this version's session layer uses. */
  readonly adminMsgTypes: readonly string[];
}

export interface FixVersionProfile {
  /** "FIX.4.4", "FIX.4.2", "FIX.5.0SP2" */
  readonly id: string;
  /** "FIX 4.4" */
  readonly label: string;
  /** "FIX.4.4"; "FIXT.1.1" for FIX 5.x */
  readonly beginString: string;
  /** FIX 5.x only, e.g. "9" for FIX.5.0SP2 (tags 1128/1137). */
  readonly applVerId?: string;
  readonly status: VersionStatus;
  /** One line shown in the version picker. */
  readonly summary: string;
  /** Oldest first; used to order listVersions(). */
  readonly order: number;
  /** null while planned. */
  readonly dictionary: FixDictionary | null;
  /** null while planned. */
  readonly session: SessionProfile | null;
}

/** A profile that can actually be used on the wire. */
export type ImplementedProfile = FixVersionProfile & {
  readonly status: "implemented";
  readonly dictionary: FixDictionary;
  readonly session: SessionProfile;
};

const registry = new Map<string, FixVersionProfile>();

export function registerVersion(profile: FixVersionProfile): void {
  if (registry.has(profile.id)) {
    throw new Error(`FIX version ${profile.id} is already registered`);
  }
  if (profile.status === "implemented" && (!profile.dictionary || !profile.session)) {
    throw new Error(`implemented FIX version ${profile.id} needs a dictionary and a session profile`);
  }
  registry.set(profile.id, profile);
}

export function getVersion(id: string): FixVersionProfile {
  const profile = registry.get(id);
  if (!profile) throw new FixParseError("UNKNOWN_VERSION", `FIX version ${id} is not registered`);
  return profile;
}

/** Like getVersion, but only returns versions that can be used on the wire. */
export function getImplementedVersion(id: string): ImplementedProfile {
  const profile = getVersion(id);
  if (!isImplemented(profile)) {
    throw new FixParseError("UNKNOWN_VERSION", `FIX version ${id} is planned, not implemented yet`);
  }
  return profile;
}

export function isImplemented(profile: FixVersionProfile): profile is ImplementedProfile {
  return profile.status === "implemented" && profile.dictionary !== null && profile.session !== null;
}

/** Stable order, oldest version first. */
export function listVersions(): readonly FixVersionProfile[] {
  return [...registry.values()].sort((a, b) => a.order - b.order);
}

export function versionForBeginString(
  beginString: string,
  applVerId?: string,
): FixVersionProfile | undefined {
  const matches = [...registry.values()].filter((p) => p.beginString === beginString);
  if (applVerId !== undefined) return matches.find((p) => p.applVerId === applVerId);
  return matches.length === 1 ? matches[0] : matches.find((p) => p.applVerId === undefined);
}
