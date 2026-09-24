export type TagType =
  | "STRING"
  | "INT"
  | "SEQNUM"
  | "LENGTH"
  | "PRICE"
  | "QTY"
  | "CHAR"
  | "BOOLEAN"
  | "UTCTIMESTAMP";

export interface TagInfo {
  readonly tag: number;
  /** FIX field name, e.g. "OrdType". */
  readonly name: string;
  readonly type: TagType;
  /** One plain-language sentence. */
  readonly description: string;
  /** Enumerated code -> meaning. */
  readonly values?: Readonly<Record<string, string>>;
}

export interface MsgTypeInfo {
  readonly name: string;
  readonly category: "admin" | "app";
  readonly description: string;
}

export interface FixDictionary {
  readonly tags: ReadonlyMap<number, TagInfo>;
  readonly msgTypes: ReadonlyMap<string, MsgTypeInfo>;
}

export interface DictionaryOverrides {
  readonly tags?: readonly TagInfo[];
  readonly msgTypes?: Readonly<Record<string, MsgTypeInfo>>;
  readonly removeTags?: readonly number[];
}

/**
 * Build a dictionary from an optional base plus overrides, so later FIX versions
 * can extend earlier ones (4.3 over 4.2, 4.4 over 4.3) instead of copying them.
 */
export function defineDictionary(
  base: FixDictionary | null,
  overrides: DictionaryOverrides,
): FixDictionary {
  const tags = new Map(base?.tags ?? []);
  const msgTypes = new Map(base?.msgTypes ?? []);
  for (const tag of overrides.removeTags ?? []) tags.delete(tag);
  for (const info of overrides.tags ?? []) tags.set(info.tag, info);
  for (const [type, info] of Object.entries(overrides.msgTypes ?? {})) msgTypes.set(type, info);
  return { tags, msgTypes };
}
