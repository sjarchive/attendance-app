"use client";

import { useCallback, useEffect, useState } from "react";
import { Fragment } from "react";
import {
  CalendarCheck,
  GraduationCap,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateLabel } from "@/lib/date";
import {
  ATTENDANCE_STATUSES,
  STATUS_META,
  type AttendanceStatus,
  type MyAttendanceResponse,
  type StudentCourseSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Dot colors mirror the status legend used across the app (attendance marker).
const STATUS_DOTS: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-600",
  ABSENT: "bg-red-600",
  LATE: "bg-amber-500",
  LEAVE: "bg-violet-600",
};

function pctTextClass(pct: number): string {
  if (pct >= 75) return "text-emerald-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

function pctBadgeClass(pct: number): string {
  if (pct >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (pct >= 50) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function formatPercentage(pct: number): string {
  return Number.isInteger(pct) ? `${pct}` : pct.toFixed(1);
}

function StatusCounts({ course }: { course: StudentCourseSummary }) {
  const counts: Record<AttendanceStatus, number> = {
    PRESENT: course.present,
    ABSENT: course.absent,
    LATE: course.late,
    LEAVE: course.leave,
  };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {ATTENDANCE_STATUSES.map((status, idx) => (
        <Fragment key={status}>
          {idx > 0 && (
            <span className="text-border" aria-hidden="true">
              ·
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span
              className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOTS[status])}
              aria-hidden="true"
            />
            {STATUS_META[status].short} {counts[status]}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

export function MyAttendance() {
  const [data, setData] = useState<MyAttendanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-7 w-56" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  if (expired) {
    return (
      <Card className="items-center p-6 text-center">
        <p className="text-sm font-medium">
          Your session has expired. Please sign in again.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in once more to see your attendance.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-4"
          onClick={() => load()}
        >
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Retry
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
          onClick={() => load()}
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Hello, {data.student.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-normal">
            {data.student.programName}
          </Badge>
          <Badge
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
          >
            {data.student.rollNo}
          </Badge>
        </div>
      </div>

      {noRecords ? (
        <Card className="items-center p-10 text-center">
          <GraduationCap
            className="h-10 w-10 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">No attendance recorded yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your attendance will appear here once your professors start
            marking it.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <CalendarCheck className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-4xl font-semibold leading-none tracking-tight",
                  pctTextClass(overallPct)
                )}
              >
                {formatPercentage(overallPct)}%
              </p>
              <p className="mt-2 text-sm font-medium">Overall attendance</p>
              <p className="text-xs text-muted-foreground">
                {data.overall.present} of {data.overall.marked} marked days
                present
              </p>
            </div>
          </div>
        </Card>
      )}

      {data.courses.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Your courses
          </h2>
          <Card className="py-0">
            <div className="divide-y">
              {data.courses.map((course) => (
                <div
                  key={course.courseId}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
                      >
                        {course.code}
                      </Badge>
                      {!course.active && (
                        <Badge
                          variant="outline"
                          className="border-muted-foreground/30 text-[11px] font-normal text-muted-foreground"
                        >
                          Removed
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">
                      {course.title}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 sm:items-end">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <StatusCounts course={course} />
                      <Badge
                        variant="outline"
                        className={cn(pctBadgeClass(course.percentage))}
                      >
                        {formatPercentage(course.percentage)}%
                      </Badge>
                    </div>
                    {course.lastMarked && (
                      <p className="text-xs text-muted-foreground">
                        Last marked {formatDateLabel(course.lastMarked)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
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
