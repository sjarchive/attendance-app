"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  GraduationCap,
  LogIn,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateLabel } from "@/lib/date";
import {
  classesCanMiss,
  classesNeededForTarget,
} from "@/lib/attendance-helpers";
import {
  ATTENDANCE_STATUSES,
  STATUS_META,
  type AttendanceStatus,
  type MyAttendanceResponse,
  type StudentCourseSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface MyAttendanceProps {
  onSessionExpired?: () => void;
}

const TARGET_PCT = 75;

const STATUS_BADGE_STYLES: Record<AttendanceStatus, string> = {
  PRESENT:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300",
  ABSENT:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300",
  LATE: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300",
  LEAVE:
    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-300",
};

function pctTextClass(pct: number): string {
  if (pct >= 75) return "text-emerald-700 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}

function pctBadgeClass(pct: number): string {
  if (pct >= 75) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (pct >= 50) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300";
}

function pctBarClass(pct: number): string {
  if (pct >= 75) return "bg-emerald-600 dark:bg-emerald-500";
  if (pct >= 50) return "bg-amber-500 dark:bg-amber-400";
  return "bg-red-600 dark:bg-red-500";
}

function formatPercentage(pct: number): string {
  return Number.isInteger(pct) ? `${pct}` : pct.toFixed(1);
}

function targetGuidance(present: number, marked: number): string {
  const needed = classesNeededForTarget(present, marked, TARGET_PCT);
  if (needed === null) return "No sessions marked yet";
  if (needed > 0) {
    return `Attend next ${needed} consecutive ${needed === 1 ? "class" : "classes"} to reach ${TARGET_PCT}%`;
  }
  const buffer = classesCanMiss(present, marked, TARGET_PCT);
  if (buffer === 0) return `Right on the ${TARGET_PCT}% target`;
  return `On track · ${buffer} ${buffer === 1 ? "class" : "classes"} above ${TARGET_PCT}% target`;
}

function StatusCounts({ course }: { course: StudentCourseSummary }) {
  const counts: Record<AttendanceStatus, number> = {
    PRESENT: course.present,
    ABSENT: course.absent,
    LATE: course.late,
    LEAVE: course.leave,
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
      {ATTENDANCE_STATUSES.map((status, idx) => (
        <Fragment key={status}>
          {idx > 0 && (
            <span className="text-border" aria-hidden="true">
              ·
            </span>
          )}
          <span>
            <span className="font-mono font-medium text-foreground">
              {STATUS_META[status].short}
            </span>{" "}
            {counts[status]}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function MyAttendance({ onSessionExpired }: MyAttendanceProps) {
  const [data, setData] = useState<MyAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCourseIds, setExpandedCourseIds] = useState<
    Record<string, boolean>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setExpired(false);
    try {
      const res = await fetch("/api/me/attendance");
      if (res.status === 401 || res.status === 403) {
        setExpired(true);
        setData(null);
        return;
      }
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      if (!res.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof (body as { error: unknown }).error === "string"
            ? (body as { error: string }).error
            : `Request failed (${res.status})`;
        throw new Error(message);
      }
      setData(body as MyAttendanceResponse);
    } catch (err) {
      setData(null);
      setError(
        err instanceof Error ? err.message : "Failed to load attendance"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleCourse(courseId: string) {
    setExpandedCourseIds((prev) => ({
      ...prev,
      [courseId]: !prev[courseId],
    }));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (expired) {
    return (
      <Card className="items-center p-8 text-center">
        <p className="text-sm font-medium">
          Your session has expired. Please sign in again.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in once more to view your attendance records.
        </p>
        <Button
          size="sm"
          className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
          onClick={() => {
            if (onSessionExpired) onSessionExpired();
            else window.location.reload();
          }}
        >
          <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Sign in again
        </Button>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="items-center p-6 text-center">
        <p className="text-sm font-medium">
          {error ?? "Something went wrong while loading your attendance."}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={() => void load()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </Card>
    );
  }

  const overallPct = data.overall.percentage;
  const noRecords = data.overall.marked === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Hello, {data.student.name}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span>{data.student.programName}</span>
            <span className="mx-2 text-border" aria-hidden="true">
              ·
            </span>
            <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
              {data.student.rollNo}
            </span>
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {noRecords ? (
        <Card className="items-center p-10 text-center">
          <GraduationCap
            className="h-10 w-10 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">No attendance recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your attendance will appear here once your professors start marking
            it.
          </p>
        </Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
                <CalendarCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Overall attendance
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-4xl",
                    pctTextClass(overallPct)
                  )}
                >
                  {formatPercentage(overallPct)}%
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                  {data.overall.present} of {data.overall.marked} marked days
                  present
                </p>
              </div>
            </div>

            <div className="w-full space-y-1.5 sm:max-w-sm">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">
                  {targetGuidance(data.overall.present, data.overall.marked)}
                </span>
                <span className="shrink-0 whitespace-nowrap font-mono text-muted-foreground tabular-nums">
                  {TARGET_PCT}% goal
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", pctBarClass(overallPct))}
                  style={{
                    width: `${Math.min(100, Math.max(0, overallPct))}%`,
                  }}
                />
                <div
                  className="absolute bottom-0 top-0 w-0.5 bg-foreground/50"
                  style={{ left: `${TARGET_PCT}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          </div>
        </Card>
      )}

      {data.courses.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Your courses
            </h2>
            <p className="text-xs text-muted-foreground">
              Click any course to view date-by-date history
            </p>
          </div>
          <Card className="overflow-hidden py-0">
            <div className="divide-y">
              {data.courses.map((course) => {
                const isExpanded = Boolean(expandedCourseIds[course.courseId]);
                const history = course.history ?? [];
                const guidance = targetGuidance(course.present, course.marked);

                return (
                  <div key={course.courseId}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleCourse(course.courseId)}
                      className="flex w-full flex-col gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            {course.code}
                          </span>
                          {!course.active && (
                            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Removed
                            </span>
                          )}
                          {course.lastMarked && (
                            <>
                              <span
                                className="text-border"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <span className="text-muted-foreground">
                                Last marked {formatDateLabel(course.lastMarked)}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">
                          {course.title}
                        </p>
                        <div className="mt-2 flex flex-col gap-1.5 sm:max-w-sm">
                          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                course.marked > 0
                                  ? pctBarClass(course.percentage)
                                  : "bg-muted-foreground/30"
                              )}
                              style={{
                                width: `${course.marked > 0 ? Math.min(100, Math.max(0, course.percentage)) : 0}%`,
                              }}
                            />
                            <div
                              className="absolute bottom-0 top-0 w-0.5 bg-foreground/40"
                              style={{ left: `${TARGET_PCT}%` }}
                              aria-hidden="true"
                            />
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {guidance}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <StatusCounts course={course} />
                          <span
                            className={cn(
                              "inline-flex min-w-[3.5rem] items-center justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
                              course.marked > 0
                                ? pctBadgeClass(course.percentage)
                                : "border-border bg-muted text-muted-foreground"
                            )}
                          >
                            {course.marked > 0
                              ? `${formatPercentage(course.percentage)}%`
                              : "—"}
                          </span>
                        </div>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span>
                            {isExpanded ? "Hide history" : "Date history"}
                          </span>
                          <ChevronDown
                            className={cn(
                              "h-3.5 w-3.5 transition-transform duration-150",
                              isExpanded && "rotate-180"
                            )}
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t bg-muted/20 px-4 py-3">
                        {history.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            No attendance dates recorded for this course yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {history.map((item) => (
                              <div
                                key={`${course.courseId}-${item.date}`}
                                className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-xs"
                              >
                                <span className="font-medium tabular-nums">
                                  {formatDateLabel(item.date)}
                                </span>
                                <span
                                  className={cn(
                                    "rounded border px-2 py-0.5 text-[11px] font-medium",
                                    STATUS_BADGE_STYLES[item.status]
                                  )}
                                >
                                  {STATUS_META[item.status].label}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Percentage = Present ÷ marked days. Late, Leave and Absent count as
            non-present.
          </p>
        </div>
      )}
    </div>
  );
}

export default MyAttendance;
