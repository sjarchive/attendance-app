"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eraser,
  History,
  Loader2,
  Save,
  UserRoundX,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusToggle } from "@/components/attendance/status-toggle";
import { AuditList } from "@/components/attendance/audit-list";
import { apiFetch } from "@/lib/client";
import { todayStr, formatDateLabel } from "@/lib/date";
import {
  ATTENDANCE_STATUSES,
  STATUS_META,
  type AttendanceLoadResponse,
  type AttendanceStatus,
  type CourseWithDetails,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface AttendanceMarkerProps {
  course: CourseWithDetails;
  onBack: () => void;
}

type StatusMap = Record<string, AttendanceStatus | null>;

export function AttendanceMarker({ course, onBack }: AttendanceMarkerProps) {
  const [date, setDate] = useState<string>(todayStr());
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<
    AttendanceLoadResponse["roster"]
  >([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [saved, setSaved] = useState<StatusMap>({});
  const [saving, setSaving] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);

  const maxDate = todayStr();

  const load = useCallback(
    async (courseId: string, forDate: string, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await apiFetch<AttendanceLoadResponse>(
          `/api/attendance?courseId=${encodeURIComponent(courseId)}&date=${forDate}`
        );
        setRoster(data.roster);
        const next: StatusMap = {};
        for (const s of data.roster) next[s.studentId] = data.records[s.studentId] ?? null;
        setStatuses(next);
        setSaved({ ...data.records });
        setFocusedIdx((idx) => Math.min(idx, Math.max(0, data.roster.length - 1)));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load attendance");
        setRoster([]);
        setStatuses({});
        setSaved({});
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    load(course.id, date);
  }, [course.id, date, load]);

  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, unmarked: 0 };
    for (const s of roster) {
      const v = statuses[s.studentId];
      if (v) c[v] += 1;
      else c.unmarked += 1;
    }
    return c;
  }, [roster, statuses]);

  const dirty = useMemo(() => {
    return roster.some((s) => {
      const current = statuses[s.studentId] ?? null;
      const baseline = saved[s.studentId] ?? null;
      return current !== baseline;
    });
  }, [roster, statuses, saved]);

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  }

  function toggleStatus(studentId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === status ? null : status,
    }));
  }

  function markAllPresent() {
    if (roster.length === 0) return;
    const next: StatusMap = {};
    for (const s of roster) next[s.studentId] = "PRESENT";
    setStatuses(next);
    toast.info("All students marked present");
  }

  function clearAll() {
    const next: StatusMap = {};
    for (const s of roster) next[s.studentId] = null;
    setStatuses(next);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (roster.length === 0) return;
    const key = e.key.toLowerCase();
    if (["p", "a", "l", "v"].includes(key)) {
      e.preventDefault();
      const student = roster[Math.min(focusedIdx, roster.length - 1)];
      if (!student) return;
      const status = (key === "p"
        ? "PRESENT"
        : key === "a"
          ? "ABSENT"
          : key === "l"
            ? "LATE"
            : "LEAVE") as AttendanceStatus;
      setStatus(student.studentId, status);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((idx) => {
        const delta = e.key === "ArrowDown" ? 1 : -1;
        return Math.min(roster.length - 1, Math.max(0, idx + delta));
      });
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setFocusedIdx(roster.length - 1);
    }
  }

  async function handleSave() {
    const records = roster
      .map((s) => ({ studentId: s.studentId, status: statuses[s.studentId] }))
      .filter((r): r is { studentId: string; status: AttendanceStatus } =>
        Boolean(r.status)
      );

    if (records.length === 0) {
      toast.error("Nothing to save — mark at least one student first");
      return;
    }

    setSaving(true);
    try {
      const result = await apiFetch<{ saved: number }>("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ courseId: course.id, date, records }),
      });
      toast.success(
        `Attendance saved for ${formatDateLabel(date)} (${result.saved} ${result.saved === 1 ? "student" : "students"})`
      );
      await load(course.id, date, true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSaving(false);
    }
  }

  const isPast = date < maxDate;

  return (
    <div className="space-y-4">
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Recent activity</DialogTitle>
            <DialogDescription>
              Attendance changes for {course.code} — who saved what and when.
            </DialogDescription>
          </DialogHeader>
          <AuditList courseId={course.id} limit={12} />
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to dashboard"
            className="mt-0.5"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
              >
                {course.code}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-normal">
                {course.programName}
              </Badge>
            </div>
            <h1 className="mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">
              Mark attendance
            </h1>
            <p className="text-sm text-muted-foreground">{course.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!loading && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5",
                dirty
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {dirty ? "Unsaved changes" : "Saved"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivityOpen(true)}
          >
            <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Activity
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Label htmlFor="attendance-date" className="text-xs">
              Date
            </Label>
            <div className="relative w-fit">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="attendance-date"
                type="date"
                value={date}
                max={maxDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && v > maxDate) return; // block future dates
                  if (v) setDate(v);
                }}
                min="2000-01-01"
                className="w-44 pl-9"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {ATTENDANCE_STATUSES.map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    s === "PRESENT" && "bg-emerald-600",
                    s === "ABSENT" && "bg-red-600",
                    s === "LATE" && "bg-amber-500",
                    s === "LEAVE" && "bg-violet-600"
                  )}
                  aria-hidden="true"
                />
                {STATUS_META[s].label} {counts[s]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs text-muted-foreground">
              <UserRoundX className="h-3 w-3" aria-hidden="true" />
              Unmarked {counts.unmarked}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={markAllPresent}
              disabled={loading || roster.length === 0}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
              Mark all present
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearAll}
              disabled={loading || roster.length === 0}
            >
              <Eraser className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {isPast && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          You are editing attendance for a past date. Existing records load
          automatically and can be corrected.
        </p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClipboardList className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Class roster
            <span className="font-normal text-muted-foreground">
              ({roster.length} {roster.length === 1 ? "student" : "students"})
            </span>
          </CardTitle>
          <CardDescription className="text-xs">
            Tip: click a status to mark, click it again to un-mark. Use the
            arrow keys to move between students and press{" "}
            <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">P</kbd>{" "}
            <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">A</kbd>{" "}
            <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">L</kbd>{" "}
            <kbd className="rounded border bg-muted px-1 font-sans text-[10px]">V</kbd>{" "}
            to mark Present, Absent, Late or Leave.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-6">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : roster.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Users
                className="mx-auto h-10 w-10 text-muted-foreground/50"
                aria-hidden="true"
              />
              <p className="mt-3 font-medium">No active students in this roster</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add students from the course&apos;s Roster screen first.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={onBack}
              >
                Back to dashboard
              </Button>
            </div>
          ) : (
            <div
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-label="Roster list, use P, A, L or V keys to mark the focused student"
              className="overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:max-h-[60vh]"
            >
              <ul className="divide-y">
                {roster.map((student, idx) => {
                  const focused = idx === focusedIdx;
                  return (
                    <li
                      key={student.studentId}
                      onClick={() => setFocusedIdx(idx)}
                      className={cn(
                        "flex items-center justify-between gap-3 px-4 py-3 transition-colors",
                        focused && "bg-emerald-50/60"
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            "h-8 w-1 shrink-0 rounded-full transition-colors",
                            focused ? "bg-emerald-500" : "bg-transparent"
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {student.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Roll {student.rollNo}
                          </p>
                        </div>
                      </div>
                      <StatusToggle
                        value={statuses[student.studentId] ?? null}
                        onChange={(s) => toggleStatus(student.studentId, s)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-30 border-t bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground sm:text-sm">
            {roster.length - counts.unmarked} of {roster.length} marked
            {counts.unmarked > 0 && (
              <span className="ml-1 text-amber-600">
                · {counts.unmarked} left
              </span>
            )}
            <span className="hidden sm:inline">
              <span className="mx-1 text-border">|</span>
              {formatDateLabel(date)}
            </span>
          </p>
          <Button
            onClick={handleSave}
            disabled={saving || loading || roster.length === 0 || !dirty}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Saving..." : "Save attendance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
