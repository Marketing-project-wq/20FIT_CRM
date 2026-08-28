/** WIB↔UTC conversion (pure, client-safe — imported by both UI and tests). WIB = UTC+7, no DST. */
export const WIB_OFFSET_HOURS = 7;

/** Convert a wall-clock WIB date+time ("2026-08-29", "14:30") to a UTC ISO string. Returns null
 *  if the parts don't form a valid date. */
export function wibToUtcIso(dateStr: string, timeStr: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!m || !tm) return null;
  const [, y, mo, d] = m.map(Number) as unknown as [string, number, number, number];
  const [, h, mi] = tm.map(Number) as unknown as [string, number, number];
  if (h > 23 || mi > 59 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - WIB_OFFSET_HOURS * 3_600_000;
  const dt = new Date(utcMs);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
