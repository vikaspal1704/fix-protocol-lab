const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** UTCTimestamp with milliseconds: YYYYMMDD-HH:MM:SS.sss */
export function formatUtcTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.` +
    pad(d.getUTCMilliseconds(), 3)
  );
}

const TIMESTAMP = /^(\d{4})(\d{2})(\d{2})-(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/;

export function parseUtcTimestamp(text: string): number {
  const m = TIMESTAMP.exec(text);
  if (!m) throw new Error(`invalid UTCTimestamp: ${text}`);
  const [, y, mo, d, h, mi, s, ms] = m.map(Number) as number[];
  return Date.UTC(y!, mo! - 1, d!, h!, mi!, s!, Number.isNaN(ms) ? 0 : ms!);
}
