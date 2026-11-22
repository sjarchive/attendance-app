import type { ReportRow } from "@/lib/types";

/**
 * Pure helper utilities for attendance UI calculations, sorting, filtering,
 * date stepping, localized relative timestamps, and URL query state.
 */

export type ReportSortKey =
  | "rollNo"
  | "name"
  | "present"
  | "absent"
  | "late"
  | "leave"
  | "total"
  | "percentage";

export type SortDirection = "asc" | "desc";

export type AppViewName =
  | "dashboard"
  | "attendance"
  | "roster"
  | "reports"
  | "admin";

export type AdminTabName =
  | "professors"
  | "programs"
  | "courses"
  | "students"
  | "audit";

export interface ParsedRouteState {
  view: AppViewName;
  courseId: string | null;
  adminTab: AdminTabName;
}

const VALID_VIEWS = new Set<AppViewName>([
  "dashboard",
  "attendance",
  "roster",
  "reports",
  "admin",
]);

const VALID_ADMIN_TABS = new Set<AdminTabName>([
  "professors",
  "programs",
  "courses",
  "students",
  "audit",
]);

/** Shift a YYYY-MM-DD calendar date by `deltaDays`, optionally clamping to [minDate, maxDate]. */
export function shiftDateStr(
  dateStr: string,
  deltaDays: number,
  bounds?: { min?: string; max?: string }
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  let next = `${yy}-${mm}-${dd}`;
  if (bounds?.min && next < bounds.min) next = bounds.min;
  if (bounds?.max && next > bounds.max) next = bounds.max;
  return next;
}

/**
 * How many consecutive PRESENT classes a student needs to reach `targetPct` (default 75%).
 * Returns null if no classes have been marked yet, or 0 if already at/above target.
 */
export function classesNeededForTarget(
  present: number,
  marked: number,
  targetPct = 75
): number | null {
  if (marked <= 0) return null;
  const ratio = targetPct / 100;
  if (ratio >= 1) return present < marked ? Infinity : 0;
  if (present / marked >= ratio) return 0;
  // Solve (present + x) / (marked + x) >= ratio  =>  x >= (ratio * marked - present) / (1 - ratio)
  const needed = Math.ceil((ratio * marked - present) / (1 - ratio) - 1e-9);
  return Math.max(1, needed);
}

/**
 * How many upcoming classes a student could miss while staying at or above `targetPct`.
 * Returns 0 if already at/below threshold or no classes marked.
 */
export function classesCanMiss(
  present: number,
  marked: number,
  targetPct = 75
): number {
  if (marked <= 0 || targetPct <= 0) return 0;
  const ratio = targetPct / 100;
  if (present / marked < ratio) return 0;
  // Solve present / (marked + x) >= ratio => x <= floor(present / ratio - marked)
  return Math.max(0, Math.floor(present / ratio - marked + 1e-9));
}

/** Sort report rows cleanly by any column while breaking ties by roll number. */
export function sortReportRows(
  rows: ReportRow[],
  sortKey: ReportSortKey,
  direction: SortDirection
): ReportRow[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "rollNo") {
      cmp = a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true });
    } else if (sortKey === "name") {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    } else {
      cmp = a[sortKey] - b[sortKey];
    }
    if (cmp !== 0) return cmp * factor;
    return a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true });
  });
}

/** Filter report rows by search query (rollNo or name) and optional <75% threshold. */
export function filterReportRows(
  rows: ReportRow[],
  query: string,
  onlyBelowThreshold: boolean,
  threshold = 75
): ReportRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (onlyBelowThreshold && (row.total === 0 || row.percentage >= threshold)) {
      return false;
    }
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) || row.rollNo.toLowerCase().includes(q)
    );
  });
}

/**
 * Format an ISO timestamp in the user's local timezone with a human-friendly
 * relative label for recent entries and a full local string for tooltips.
 */
export function formatLocalAuditTime(
  iso: string,
  nowMs: number = Date.now()
): { relative: string; exact: string } {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return { relative: iso, exact: iso };
  }

  const exact = dt.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const diffSec = Math.floor((nowMs - dt.getTime()) / 1000);
  if (diffSec < 0) {
    return { relative: exact, exact };
  }
  if (diffSec < 60) {
    return { relative: "Just now", exact };
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return { relative: `${diffMin}m ago`, exact };
  }
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    return { relative: `${diffHr}h ago`, exact };
  }
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) {
    return { relative: `${diffDay}d ago`, exact };
  }

  const compact = dt.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { relative: compact, exact };
}

/** Parse URL search params into a typed route state. */
export function parseViewSearchParams(search: string): ParsedRouteState {
  const params = new URLSearchParams(search);
  const rawView = params.get("view") as AppViewName | null;
  const view: AppViewName =
    rawView && VALID_VIEWS.has(rawView) ? rawView : "dashboard";
  const courseId = params.get("course");
  const rawTab = params.get("tab") as AdminTabName | null;
  const adminTab: AdminTabName =
    rawTab && VALID_ADMIN_TABS.has(rawTab) ? rawTab : "professors";
  return {
    view,
    courseId: courseId && courseId.trim().length > 0 ? courseId : null,
    adminTab,
  };
}

/** Build a clean query string ("" or "?...") for a given route state. */
export function buildViewQueryString(state: {
  view: AppViewName;
  courseId?: string | null;
  adminTab?: AdminTabName;
}): string {
  if (state.view === "dashboard") return "";
  const params = new URLSearchParams();
  params.set("view", state.view);
  if (
    (state.view === "attendance" ||
      state.view === "roster" ||
      state.view === "reports") &&
    state.courseId
  ) {
    params.set("course", state.courseId);
  }
  if (state.view === "admin" && state.adminTab && state.adminTab !== "professors") {
    params.set("tab", state.adminTab);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
