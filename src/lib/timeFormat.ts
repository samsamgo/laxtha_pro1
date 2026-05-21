const KST_OFFSET_MIN = 9 * 60;
const KST_OFFSET_MS = KST_OFFSET_MIN * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * Convert epoch ms or Date to KST (Asia/Seoul, UTC+9) ISO-8601 string with explicit offset.
 * Example output: "2026-05-21T22:00:00.000+09:00"
 */
export function toKstIso(input: number | Date): string {
  const ms = typeof input === "number" ? input : input.getTime();
  const k = new Date(ms + KST_OFFSET_MS);
  const y = k.getUTCFullYear();
  const mo = pad2(k.getUTCMonth() + 1);
  const d = pad2(k.getUTCDate());
  const h = pad2(k.getUTCHours());
  const mi = pad2(k.getUTCMinutes());
  const s = pad2(k.getUTCSeconds());
  const ms3 = pad3(k.getUTCMilliseconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms3}+09:00`;
}

/** KST timezone label for metadata. */
export const KST_TIMEZONE = "Asia/Seoul";
