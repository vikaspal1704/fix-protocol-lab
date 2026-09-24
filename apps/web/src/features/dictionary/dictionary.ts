import { DEFAULT_VERSION_ID, getVersion, isImplemented, type FixDictionary, type TagInfo } from "@fixlab/fix-core";

/** Dictionary for a version, falling back to the default version while planned. */
export function dictionaryFor(versionId: string): FixDictionary {
  const profile = getVersion(isKnown(versionId) ? versionId : DEFAULT_VERSION_ID);
  if (isImplemented(profile)) return profile.dictionary;
  const fallback = getVersion(DEFAULT_VERSION_ID);
  if (!isImplemented(fallback)) throw new Error("default FIX version must be implemented");
  return fallback.dictionary;
}

function isKnown(versionId: string): boolean {
  try {
    getVersion(versionId);
    return true;
  } catch {
    return false;
  }
}

export function tagInfo(versionId: string, tag: number): TagInfo | undefined {
  return dictionaryFor(versionId).tags.get(tag);
}

/** Human meaning of a value, e.g. 54=1 -> "Buy". */
export function valueMeaning(versionId: string, tag: number, value: string): string | null {
  if (tag === 35) return dictionaryFor(versionId).msgTypes.get(value)?.name ?? null;
  return tagInfo(versionId, tag)?.values?.[value] ?? null;
}
