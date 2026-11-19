// Date helpers shared by client and server.
// The app operates on date-only strings ("YYYY-MM-DD") in the department's
// timezone so attendance days never shift across timezones.

export const APP_TIMEZONE = "Asia/Calcutta";

/** Today's date in the app timezone as "YYYY-MM-DD" */
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(
    new Date()
  );
}

/** "2026-11-18" -> "Wed, 18 Nov 2026" */
export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function isBeforeOrEqual(a: string, b: string): boolean {
  return a <= b;
}
