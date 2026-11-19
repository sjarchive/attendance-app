"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Download,
  Loader2,
  Percent,
  RotateCcw,
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/client";
import { todayStr, formatDateLabel } from "@/lib/date";
import type { CourseWithDetails, ReportResponse, ReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReportsViewProps {
  course: CourseWithDetails;
  onBack: () => void;
}

/** First day of the month containing the given YYYY-MM-DD string. */
function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  if (!y || !m) return dateStr;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Shift a YYYY-MM-DD string by N days using plain calendar math. */
function shiftDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const shifted = new Date(y, m - 1, d + days);
  const yy = shifted.getFullYear();
  const mm = String(shifted.getMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Pill color for an attendance percentage (>=75 emerald, >=50 amber, else red). */
function percentageTone(pct: number): string {
  if (pct >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (pct >= 50) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function ReportsView({ course, onBack }: ReportsViewProps) {
  const today = todayStr();
  const [from, setFrom] = useState<string>(() => firstOfMonth(todayStr()));
  const [to, setTo] = useState<string>(() => todayStr());
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ courseId: course.id });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const payload = await apiFetch<ReportResponse>(
        `/api/reports?${params.toString()}`
      );
      setData(payload);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [course.id, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDownloadCsv() {
    setDownloading(true);
    try {
      const params = new URLSearchParams({ courseId: course.id, format: "csv" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/reports?${params.toString()}`);
      if (!res.ok) {
        let message = `Download failed (${res.status})`;
        try {
          const body: unknown = await res.json();
          if (
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof (body as { error: unknown }).error === "string"
          ) {
            message = (body as { error: string }).error;
          }
        } catch {
          // response was not JSON — keep the generic message
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(disposition);
      const filename = match?.[1] ?? `attendance-${course.code}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download report");
    } finally {
      setDownloading(false);
    }
  }

  function handleFromChange(value: string) {
    if (!value) {
      setFrom("");
      return;
    }
    if (value > today) return; // never allow future dates
    setFrom(value);
    if (to && value > to) setTo(value); // keep from <= to (auto-correct "to")
  }

  function handleToChange(value: string) {
    if (!value) {
      setTo("");
      return;
    }
    if (value > today) return; // "To" max = today
    if (from && value < from) return; // keep from <= to
    setTo(value);
  }

  function applyPreset(preset: "thisMonth" | "last30" | "allTime") {
    if (preset === "allTime") {
      setFrom("");
      setTo("");
      return;
    }
    setTo(today);
    setFrom(preset === "thisMonth" ? firstOfMonth(today) : shiftDays(today, -30));
  }

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  const thisMonthActive = from === firstOfMonth(today) && to === today;
  const last30Active = from === shiftDays(today, -30) && to === today;
  const allTimeActive = from === "" && to === "";

  const rangeLabel =
    from && to
      ? `${formatDateLabel(from)} → ${formatDateLabel(to)}`
      : from
        ? `From ${formatDateLabel(from)}`
        : to
          ? `Until ${formatDateLabel(to)}`
          : "All time";

  return (
    <div className="space-y-4">
      {/* Header: back navigation + course context */}
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
              Attendance report
            </h1>
            <p className="text-sm text-muted-foreground">{course.title}</p>
          </div>
        </div>
      </div>

      {/* Controls: date range + presets + CSV export */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="report-from" className="text-xs">
                From
              </Label>
              <div className="relative w-fit">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="report-from"
                  type="date"
                  value={from}
                  max={to || today}
                  min="2000-01-01"
                  onChange={(e) => handleFromChange(e.target.value)}
                  className="w-44 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to" className="text-xs">
                To
              </Label>
              <div className="relative w-fit">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="report-to"
                  type="date"
                  value={to}
                  max={today}
                  min={from || "2000-01-01"}
                  onChange={(e) => handleToChange(e.target.value)}
                  className="w-44 pl-9"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                aria-pressed={thisMonthActive}
                onClick={() => applyPreset("thisMonth")}
                className={cn(
                  thisMonthActive &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                This month
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={last30Active}
                onClick={() => applyPreset("last30")}
                className={cn(
                  last30Active &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                Last 30 days
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-pressed={allTimeActive}
                onClick={() => applyPreset("allTime")}
                className={cn(
                  allTimeActive &&
                    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                )}
              >
                All time
              </Button>
            </div>
          </div>

          <div className="flex items-center">
            <Button
              onClick={handleDownloadCsv}
              disabled={downloading}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {downloading ? "Downloading..." : "Download CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-red-800">
                  Couldn&apos;t load the report
                </p>
                <p className="mt-0.5 text-xs text-red-700">{error}</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => void load()}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Percent className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {loading || !summary ? (
                    <Skeleton className="h-6 w-14" />
                  ) : (
                    <p className="text-lg font-semibold leading-none">
                      {formatPct(summary.classAverage)}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {summary
                      ? `${summary.totalPresent} present of ${summary.totalMarked} marked`
                      : "—"}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {loading || !summary ? (
                    <Skeleton className="h-6 w-10" />
                  ) : (
                    <p className="text-lg font-semibold leading-none">
                      {summary.markedDays}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {rangeLabel}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  {loading || !summary ? (
                    <Skeleton className="h-6 w-10" />
                  ) : (
                    <p className="text-lg font-semibold leading-none">
                      {summary.studentsCounted}
                    </p>
                  )}
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {course.studentCount} on roster
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Per-student table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                <ClipboardList
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                Per-student breakdown
                <span className="whitespace-nowrap font-normal text-muted-foreground">
                  ({rows.length} {rows.length === 1 ? "student" : "students"})
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Counts per status for {rangeLabel.toLowerCase()}.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <ClipboardList
                    className="mx-auto h-10 w-10 text-muted-foreground/50"
                    aria-hidden="true"
                  />
                  <p className="mt-3 font-medium">
                    No attendance records in this range
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Try a wider date range, or mark attendance first.
                  </p>
                </div>
              ) : (
                <div className="overflow-auto sm:max-h-96 [&_[data-slot=table-container]]:overflow-visible">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="sticky top-0 z-10 bg-background px-1 pl-1 sm:px-2 sm:pl-4">
                          Roll No
                        </TableHead>
                        <TableHead className="sticky top-0 z-10 bg-background px-1 sm:px-2">
                          Name
                        </TableHead>
                        <TableHead
                          className="sticky top-0 z-10 bg-background px-1 text-right sm:px-2"
                          title="Present"
                        >
                          <span className="sm:hidden">P</span>
                          <span className="hidden sm:inline">Present</span>
                        </TableHead>
                        <TableHead
                          className="sticky top-0 z-10 bg-background px-1 text-right sm:px-2"
                          title="Absent"
                        >
                          <span className="sm:hidden">A</span>
                          <span className="hidden sm:inline">Absent</span>
                        </TableHead>
                        <TableHead
                          className="sticky top-0 z-10 bg-background px-1 text-right sm:px-2"
                          title="Late"
                        >
                          <span className="sm:hidden">L</span>
                          <span className="hidden sm:inline">Late</span>
                        </TableHead>
                        <TableHead
                          className="sticky top-0 z-10 bg-background px-1 text-right sm:px-2"
                          title="Leave"
                        >
                          <span className="sm:hidden">V</span>
                          <span className="hidden sm:inline">Leave</span>
                        </TableHead>
                        <TableHead
                          className="hidden sticky top-0 z-10 bg-background text-right sm:table-cell"
                          title="Marked days"
                        >
                          Marked
                        </TableHead>
                        <TableHead
                          className="sticky top-0 z-10 bg-background px-1 pr-1 text-right sm:px-2 sm:pr-4"
                          title="Attendance percentage"
                        >
                          <span className="sm:hidden">%</span>
                          <span className="hidden sm:inline">Attendance %</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row: ReportRow) => (
                        <TableRow key={row.studentId}>
                          <TableCell className="px-1 pl-1 tabular-nums sm:px-2 sm:pl-4">
                            {row.rollNo}
                          </TableCell>
                          <TableCell className="px-1 font-medium sm:px-2">
                            <span className="flex flex-wrap items-center gap-2">
                              {row.name}
                              {!row.active && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal text-muted-foreground"
                                >
                                  Removed
                                </Badge>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="px-1 text-right tabular-nums sm:px-2">
                            {row.present}
                          </TableCell>
                          <TableCell className="px-1 text-right tabular-nums sm:px-2">
                            {row.absent}
                          </TableCell>
                          <TableCell className="px-1 text-right tabular-nums sm:px-2">
                            {row.late}
                          </TableCell>
                          <TableCell className="px-1 text-right tabular-nums sm:px-2">
                            {row.leave}
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">
                            {row.total}
                          </TableCell>
                          <TableCell className="px-1 pr-1 text-right sm:px-2 sm:pr-4">
                            {row.total === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                                  percentageTone(row.percentage)
                                )}
                              >
                                {formatPct(row.percentage)}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!loading && rows.length > 0 && (
                <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                  Percentage = Present ÷ marked days. Late, Leave and Absent
                  count as non-present.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default ReportsView;
