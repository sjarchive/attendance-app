"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eraser,
  History,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusToggle } from "@/components/attendance/status-toggle";
import { AuditList } from "@/components/attendance/audit-list";
import {
  CourseHeader,
  type CourseSubView,
} from "@/components/attendance/course-header";
import { apiFetch } from "@/lib/client";
import { todayStr, formatDateLabel } from "@/lib/date";
import { shiftDateStr } from "@/lib/attendance-helpers";
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
  onSelectTab: (tab: CourseSubView) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
}

type StatusMap = Record<string, AttendanceStatus | null>;
type QuickFilter = "ALL" | "UNMARKED" | "ABSENT";

export function AttendanceMarker({
  course,
  onBack,
  onSelectTab,
  onDirtyChange,
  onSaved,
}: AttendanceMarkerProps) {
  const [date, setDate] = useState<string>(todayStr());
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<AttendanceLoadResponse["roster"]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [saved, setSaved] = useState<StatusMap>({});
  const [saving, setSaving] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);

  // Search & quick filter
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("ALL");

  // Confirmation dialogs
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [pendingActionLabel, setPendingActionLabel] = useState<string>(
    "leave this date"
  );

  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
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
        for (const s of data.roster) {
          next[s.studentId] = data.records[s.studentId] ?? null;
        }
        setStatuses(next);
        setSaved({ ...data.records });
        setFocusedIdx(0);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to load attendance"
        );
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
    void load(course.id, date);
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

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const visibleRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((student) => {
      const st = statuses[student.studentId] ?? null;
      if (quickFilter === "UNMARKED" && st !== null) return false;
      if (quickFilter === "ABSENT" && st !== "ABSENT") return false;
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        student.rollNo.toLowerCase().includes(q)
      );
    });
  }, [roster, statuses, search, quickFilter]);

  // Clamp focusedIdx if filter shrinks the visible list
  const safeFocusedIdx =
    visibleRoster.length === 0
      ? 0
      : Math.min(focusedIdx, visibleRoster.length - 1);

  const scrollRowIntoView = useCallback((studentId: string) => {
    const node = rowRefs.current.get(studentId);
    if (node) {
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, []);

  const guardAction = useCallback(
    (label: string, action: () => void) => {
      if (dirty) {
        setPendingActionLabel(label);
        setPendingAction(() => action);
      } else {
        action();
      }
    },
    [dirty]
  );

  function requestDateChange(nextDate: string) {
    if (!nextDate || nextDate > maxDate || nextDate === date) return;
    guardAction(`switch to ${formatDateLabel(nextDate)}`, () => {
      setDate(nextDate);
    });
  }

  function setStatus(studentId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  }

  function toggleStatus(studentId: string, status: AttendanceStatus) {
    setStatuses((prev) => ({
      ...prev,
      [studentId]: prev[studentId] === status ? null : status,
    }));
  }

  function markUnmarkedPresent() {
    if (roster.length === 0) return;
    let filled = 0;
    const next: StatusMap = { ...statuses };
    for (const s of roster) {
      if (!next[s.studentId]) {
        next[s.studentId] = "PRESENT";
        filled += 1;
      }
    }
    if (filled === 0) {
      toast.info("Every student already has a status");
      return;
    }
    setStatuses(next);
    toast.success(
      `Marked ${filled} unmarked ${filled === 1 ? "student" : "students"} present`
    );
  }

  function markAllPresent() {
    if (roster.length === 0) return;
    const prevSnapshot = { ...statuses };
    const next: StatusMap = {};
    for (const s of roster) next[s.studentId] = "PRESENT";
    setStatuses(next);
    toast("All students marked present", {
      action: {
        label: "Undo",
        onClick: () => setStatuses(prevSnapshot),
      },
    });
  }

  function performClearAll() {
    const prevSnapshot = { ...statuses };
    const next: StatusMap = {};
    for (const s of roster) next[s.studentId] = null;
    setStatuses(next);
    setClearConfirmOpen(false);
    toast("Cleared all marks on this screen", {
      action: {
        label: "Undo",
        onClick: () => setStatuses(prevSnapshot),
      },
    });
  }

  function resetToSaved() {
    const next: StatusMap = {};
    for (const s of roster) next[s.studentId] = saved[s.studentId] ?? null;
    setStatuses(next);
    toast.info("Reverted unsaved changes");
  }

  const handleSave = useCallback(async () => {
    const records = roster
      .map((s) => ({ studentId: s.studentId, status: statuses[s.studentId] }))
      .filter((r): r is { studentId: string; status: AttendanceStatus } =>
        Boolean(r.status)
      );
    const clearedStudentIds = roster
      .filter((s) => Boolean(saved[s.studentId]) && !statuses[s.studentId])
      .map((s) => s.studentId);
    if (records.length === 0 && clearedStudentIds.length === 0) {
      toast.error("Nothing to save — mark at least one student first");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ saved: number; cleared?: number }>(
        "/api/attendance",
        {
          method: "POST",
          body: JSON.stringify({
            courseId: course.id,
            date,
            records,
            clearedStudentIds,
          }),
        }
      );
      const summaryParts: string[] = [];
      if (result.saved > 0) {
        summaryParts.push(
          `${result.saved} ${result.saved === 1 ? "student" : "students"}`
        );
      }
      if (result.cleared && result.cleared > 0) {
        summaryParts.push(`${result.cleared} cleared`);
      }
      toast.success(
        `Attendance saved for ${formatDateLabel(date)}${summaryParts.length > 0 ? ` (${summaryParts.join(", ")})` : ""}`
      );
      await load(course.id, date, true);
      onSaved?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save attendance"
      );
    } finally {
      setSaving(false);
    }
  }, [roster, statuses, saved, course.id, date, load, onSaved]);

  // Ctrl/Cmd + S shortcut to save attendance
  useEffect(() => {
    function onGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!saving && !loading && roster.length > 0 && dirty) {
          void handleSave();
        }
      }
    }
    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [saving, loading, roster.length, dirty, handleSave]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (visibleRoster.length === 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (["p", "a", "l", "v"].includes(key)) {
      e.preventDefault();
      const student = visibleRoster[safeFocusedIdx];
      if (!student) return;
      const status = (
        key === "p"
          ? "PRESENT"
          : key === "a"
            ? "ABSENT"
            : key === "l"
              ? "LATE"
              : "LEAVE"
      ) as AttendanceStatus;
      setStatus(student.studentId, status);
      // Auto-advance to the next visible student and scroll it into view
      const nextIdx = Math.min(visibleRoster.length - 1, safeFocusedIdx + 1);
      setFocusedIdx(nextIdx);
      const nextStudent = visibleRoster[nextIdx];
      if (nextStudent) scrollRowIntoView(nextStudent.studentId);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const nextIdx = Math.min(
        visibleRoster.length - 1,
        Math.max(0, safeFocusedIdx + delta)
      );
      setFocusedIdx(nextIdx);
      const nextStudent = visibleRoster[nextIdx];
      if (nextStudent) scrollRowIntoView(nextStudent.studentId);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedIdx(0);
      scrollRowIntoView(visibleRoster[0].studentId);
    } else if (e.key === "End") {
      e.preventDefault();
      const lastIdx = visibleRoster.length - 1;
      setFocusedIdx(lastIdx);
      scrollRowIntoView(visibleRoster[lastIdx].studentId);
    }
  }

  const isPast = date < maxDate;
  const markedCount = roster.length - counts.unmarked;

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

      {/* Unsaved changes guard */}
      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved attendance?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes for {formatDateLabel(date)}. If you{" "}
              {pendingActionLabel}, those edits will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear confirmation */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all marks on screen?</AlertDialogTitle>
            <AlertDialogDescription>
              This un-marks all {markedCount}{" "}
              {markedCount === 1 ? "student" : "students"} for{" "}
              {formatDateLabel(date)} in your current view. Nothing is saved
              until you click Save attendance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={performClearAll}
            >
              Clear marks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CourseHeader
        course={course}
        activeTab="attendance"
        onBack={() => guardAction("return to the dashboard", onBack)}
        onSelectTab={(tab) =>
          guardAction(`switch to ${tab}`, () => onSelectTab(tab))
        }
        actions={
          <>
            {!loading && (
              <span
                className={cn(
                  "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium",
                  dirty
                    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300"
                )}
              >
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivityOpen(true)}
            >
              <History className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Activity
            </Button>
          </>
        }
      />

      {/* Date stepper + status summary + bulk actions */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <Label htmlFor="attendance-date" className="text-xs">
                Session date
              </Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Previous day"
                  title="Previous day"
                  onClick={() =>
                    requestDateChange(
                      shiftDateStr(date, -1, { min: "2000-01-01" })
                    )
                  }
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Input
                  id="attendance-date"
                  type="date"
                  value={date}
                  max={maxDate}
                  min="2000-01-01"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && v > maxDate) return;
                    if (v) requestDateChange(v);
                  }}
                  className="h-9 w-40 tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  aria-label="Next day"
                  title="Next day"
                  disabled={date >= maxDate}
                  onClick={() =>
                    requestDateChange(shiftDateStr(date, 1, { max: maxDate }))
                  }
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                {isPast && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => requestDateChange(maxDate)}
                  >
                    Today
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={markUnmarkedPresent}
                disabled={loading || roster.length === 0 || counts.unmarked === 0}
              >
                <CheckCircle2
                  className="mr-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Mark unmarked present
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={markAllPresent}
                disabled={
                  loading ||
                  roster.length === 0 ||
                  counts.PRESENT === roster.length
                }
              >
                <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                All present
              </Button>
              {dirty && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetToSaved}
                  disabled={loading}
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Revert
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setClearConfirmOpen(true)}
                disabled={loading || roster.length === 0 || markedCount === 0}
              >
                <Eraser className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Clear
              </Button>
            </div>
          </div>

          {/* Clean unboxed live status summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground tabular-nums">
            {ATTENDANCE_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="font-mono font-semibold text-foreground">
                  {STATUS_META[s].short}
                </span>
                <span>
                  {STATUS_META[s].label}:{" "}
                  <strong className="font-semibold text-foreground">
                    {counts[s]}
                  </strong>
                </span>
              </span>
            ))}
            <span aria-hidden="true" className="hidden text-border sm:inline">
              |
            </span>
            <span>
              Unmarked:{" "}
              <strong
                className={cn(
                  "font-semibold",
                  counts.unmarked > 0
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-foreground"
                )}
              >
                {counts.unmarked}
              </strong>
            </span>
          </div>
        </CardContent>
      </Card>

      {isPast && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          <History className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Editing past attendance for {formatDateLabel(date)}. Existing
            records load automatically.
          </span>
        </div>
      )}

      {/* Class roster card */}
      <Card>
        <CardHeader className="gap-3 border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList
                  className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Class roster
                <span className="font-normal text-muted-foreground tabular-nums">
                  ({visibleRoster.length}
                  {visibleRoster.length !== roster.length
                    ? ` of ${roster.length}`
                    : ""}{" "}
                  {roster.length === 1 ? "student" : "students"})
                </span>
              </CardTitle>
              <CardDescription className="mt-1 hidden text-xs sm:block">
                Keys:{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                  P
                </kbd>{" "}
                Present ·{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                  A
                </kbd>{" "}
                Absent ·{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                  L
                </kbd>{" "}
                Late ·{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                  V
                </kbd>{" "}
                Leave (auto-advances row) ·{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
                  Ctrl/⌘+S
                </kbd>{" "}
                Save
              </CardDescription>
            </div>

            {roster.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-52">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setFocusedIdx(0);
                    }}
                    placeholder="Filter name or roll..."
                    aria-label="Filter roster by name or roll number"
                    className="h-8 pl-8 pr-7 text-xs"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div
                  role="group"
                  aria-label="Filter students by status"
                  className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
                >
                  {(
                    [
                      { id: "ALL", label: "All" },
                      { id: "UNMARKED", label: `Unmarked (${counts.unmarked})` },
                      { id: "ABSENT", label: `Absent (${counts.ABSENT})` },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={quickFilter === item.id}
                      onClick={() => {
                        setQuickFilter(item.id);
                        setFocusedIdx(0);
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors tabular-nums",
                        quickFilter === item.id
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
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
              <p className="mt-3 font-medium">
                No active students in this roster
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add students in the Roster tab to start marking attendance.
              </p>
              <Button
                size="sm"
                className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => onSelectTab("roster")}
              >
                Go to Roster
              </Button>
            </div>
          ) : visibleRoster.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p className="text-sm font-medium">No matching students</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No students match your current search or filter.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setSearch("");
                  setQuickFilter("ALL");
                }}
              >
                Show all students
              </Button>
            </div>
          ) : (
            <div
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-label="Roster list. Use arrow keys to navigate and P, A, L, or V keys to mark the highlighted student."
              className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <ul className="divide-y">
                {visibleRoster.map((student, idx) => {
                  const focused = idx === safeFocusedIdx;
                  return (
                    <li
                      key={student.studentId}
                      ref={(el) => {
                        if (el) rowRefs.current.set(student.studentId, el);
                        else rowRefs.current.delete(student.studentId);
                      }}
                      onClick={() => setFocusedIdx(idx)}
                      className={cn(
                        "flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30",
                        focused &&
                          "bg-emerald-50/70 dark:bg-emerald-950/35"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {student.name}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground tabular-nums">
                          {student.rollNo}
                        </p>
                      </div>
                      <StatusToggle
                        studentName={student.name}
                        value={statuses[student.studentId] ?? null}
                        onChange={(s) => {
                          setFocusedIdx(idx);
                          toggleStatus(student.studentId, s);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compact sticky save footer */}
      <div className="sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums sm:text-sm">
            <span className="font-medium text-foreground">{markedCount}</span>{" "}
            of {roster.length} marked
            {counts.unmarked > 0 && (
              <span className="ml-1.5 text-amber-700 dark:text-amber-400">
                · {counts.unmarked} left
              </span>
            )}
            <span className="hidden sm:inline">
              <span className="mx-2 text-border">|</span>
              {formatDateLabel(date)}
            </span>
          </p>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={saving || loading || roster.length === 0 || !dirty}
            className="h-9 bg-emerald-600 px-4 text-white hover:bg-emerald-700"
          >
            {saving ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {saving ? "Saving..." : "Save attendance"}
          </Button>
        </div>
      </div>
    </div>
  );
}
