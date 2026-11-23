"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ClipboardList,
  Download,
  Loader2,
  Percent,
  RotateCcw,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  CourseHeader,
  type CourseSubView,
} from "@/components/attendance/course-header";
import { apiFetch } from "@/lib/client";
import { todayStr, formatDateLabel } from "@/lib/date";
import {
  filterReportRows,
  shiftDateStr,
  sortReportRows,
  type ReportSortKey,
  type SortDirection,
} from "@/lib/attendance-helpers";
import type {
  CourseWithDetails,
  DailyTrendPoint,
  ReportResponse,
  ReportRow,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface ReportsViewProps {
  course: CourseWithDetails;
  onBack: () => void;
  onSelectTab: (tab: CourseSubView) => void;
}

/** First day of the month containing the given YYYY-MM-DD string. */
function firstOfMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  if (!y || !m) return dateStr;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Soft-tinted color for an attendance percentage (>=75 emerald, >=50 amber, else red). */
function percentageTone(pct: number): string {
  if (pct >= 75) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (pct >= 50) {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300";
  }
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300";
}

function progressBarTone(pct: number): string {
  if (pct >= 75) return "bg-emerald-600 dark:bg-emerald-500";
  if (pct >= 50) return "bg-amber-500 dark:bg-amber-400";
  return "bg-red-600 dark:bg-red-500";
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function shortAxisDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function SortIndicator({
  column,
  sortKey,
  sortDir,
}: {
  column: ReportSortKey;
  sortKey: ReportSortKey;
  sortDir: SortDirection;
}) {
  if (sortKey !== column) {
    return (
      <ArrowUpDown
        className="ml-1 inline h-3 w-3 opacity-40"
        aria-hidden="true"
      />
    );
  }
  return sortDir === "asc" ? (
    <ArrowUp
      className="ml-1 inline h-3 w-3 text-emerald-600 dark:text-emerald-400"
      aria-hidden="true"
    />
  ) : (
    <ArrowDown
      className="ml-1 inline h-3 w-3 text-emerald-600 dark:text-emerald-400"
      aria-hidden="true"
    />
  );
}

export function ReportsView({
  course,
  onBack,
  onSelectTab,
}: ReportsViewProps) {
  const today = todayStr();
  const [from, setFrom] = useState<string>(() => firstOfMonth(todayStr()));
  const [to, setTo] = useState<string>(() => todayStr());
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Table search, <75% filter, and sorting
  const [search, setSearch] = useState("");
  const [onlyBelow75, setOnlyBelow75] = useState(false);
  const [sortKey, setSortKey] = useState<ReportSortKey>("rollNo");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

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
      const params = new URLSearchParams({
        courseId: course.id,
        format: "csv",
      });
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
      const match = /filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i.exec(
        disposition
      );
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
      toast.error(
        err instanceof Error ? err.message : "Failed to download report"
      );
    } finally {
      setDownloading(false);
    }
  }

  function handleFromChange(value: string) {
    if (!value) {
      setFrom("");
      return;
    }
    if (value > today) return;
    setFrom(value);
    if (to && value > to) setTo(value);
  }

  function handleToChange(value: string) {
    if (!value) {
      setTo("");
      return;
    }
    if (value > today) return;
    if (from && value < from) return;
    setTo(value);
  }

  function applyPreset(preset: "thisMonth" | "last30" | "allTime") {
    if (preset === "allTime") {
      setFrom("");
      setTo("");
      return;
    }
    setTo(today);
    setFrom(
      preset === "thisMonth" ? firstOfMonth(today) : shiftDateStr(today, -30)
    );
  }

  function toggleSort(key: ReportSortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "rollNo" || key === "name" ? "asc" : "desc");
    }
  }

  const summary = data?.summary;
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const dailyTrend = useMemo(() => data?.dailyTrend ?? [], [data?.dailyTrend]);

  const below75Count = useMemo(
    () => rows.filter((r) => r.total > 0 && r.percentage < 75).length,
    [rows]
  );

  const displayedRows = useMemo(() => {
    const filtered = filterReportRows(rows, search, onlyBelow75, 75);
    return sortReportRows(filtered, sortKey, sortDir);
  }, [rows, search, onlyBelow75, sortKey, sortDir]);

  const thisMonthActive = from === firstOfMonth(today) && to === today;
  const last30Active = from === shiftDateStr(today, -30) && to === today;
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
      <CourseHeader
        course={course}
        activeTab="reports"
        onBack={onBack}
        onSelectTab={onSelectTab}
        actions={
          <Button
            size="sm"
            onClick={() => void handleDownloadCsv()}
            disabled={downloading}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {downloading ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            {downloading ? "Downloading..." : "Download CSV"}
          </Button>
        }
      />

      {/* Controls: date range + presets */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="report-from" className="text-xs">
                From
              </Label>
              <Input
                id="report-from"
                type="date"
                value={from}
                max={to || today}
                min="2000-01-01"
                onChange={(e) => handleFromChange(e.target.value)}
                className="h-9 w-40 tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to" className="text-xs">
                To
              </Label>
              <Input
                id="report-to"
                type="date"
                value={to}
                max={today}
                min={from || "2000-01-01"}
                onChange={(e) => handleToChange(e.target.value)}
                className="h-9 w-40 tabular-nums"
              />
            </div>
          </div>

          <div
            role="group"
            aria-label="Date range presets"
            className="inline-flex w-fit items-center gap-1 rounded-lg border bg-muted/40 p-1"
          >
            {(
              [
                { id: "thisMonth", label: "This month", active: thisMonthActive },
                { id: "last30", label: "Last 30 days", active: last30Active },
                { id: "allTime", label: "All time", active: allTimeActive },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={preset.active}
                onClick={() => applyPreset(preset.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  preset.active
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Couldn&apos;t load the report
                </p>
                <p className="mt-0.5 text-xs text-red-700 dark:text-red-300">
                  {error}
                </p>
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
          {/* Summary KPI cards with explicit labels */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
                  <Percent className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Class average
                  </p>
                  {loading || !summary ? (
                    <Skeleton className="mt-1.5 h-6 w-16" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold leading-none tabular-nums">
                      {formatPct(summary.classAverage)}
                    </p>
                  )}
                  <p className="mt-1.5 truncate text-xs text-muted-foreground tabular-nums">
                    {summary
                      ? `${summary.totalPresent} present of ${summary.totalMarked} marks`
                      : "—"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Days marked
                  </p>
                  {loading || !summary ? (
                    <Skeleton className="mt-1.5 h-6 w-10" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold leading-none tabular-nums">
                      {summary.markedDays}
                    </p>
                  )}
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">
                    {rangeLabel}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
                  <Users className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    Students counted
                  </p>
                  {loading || !summary ? (
                    <Skeleton className="mt-1.5 h-6 w-10" />
                  ) : (
                    <p className="mt-1 text-xl font-semibold leading-none tabular-nums">
                      {summary.studentsCounted}
                    </p>
                  )}
                  <p className="mt-1.5 truncate text-xs text-muted-foreground tabular-nums">
                    {course.studentCount} active on roster
                    {below75Count > 0 ? ` · ${below75Count} below 75%` : ""}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Daily attendance trend chart (when >= 2 marked sessions) */}
          {!loading && dailyTrend.length >= 2 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <TrendingUp
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Daily attendance trend
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Dashed line marks 75% target
                  </span>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={dailyTrend}
                      margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient
                          id="attendanceAreaFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#059669"
                            stopOpacity={0.22}
                          />
                          <stop
                            offset="95%"
                            stopColor="#059669"
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortAxisDate}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <ReferenceLine
                        y={75}
                        stroke="#d97706"
                        strokeDasharray="4 4"
                        strokeOpacity={0.7}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) {
                            return null;
                          }
                          const pt = payload[0]?.payload as
                            | DailyTrendPoint
                            | undefined;
                          if (!pt) return null;
                          return (
                            <div className="rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
                              <p className="font-medium">
                                {formatDateLabel(pt.date)}
                              </p>
                              <p className="mt-1 font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                {pt.percentage.toFixed(1)}% present ({pt.present}/
                                {pt.total})
                              </p>
                              <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                                A {pt.absent} · L {pt.late} · V {pt.leave}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="percentage"
                        stroke="#059669"
                        strokeWidth={2}
                        fill="url(#attendanceAreaFill)"
                        isAnimationActive={false}
                        dot={{ r: 3, fill: "#059669", strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#059669" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-student breakdown table */}
          <Card>
            <CardHeader className="gap-3 border-b pb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <ClipboardList
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    Per-student breakdown
                    <span className="whitespace-nowrap font-normal text-muted-foreground tabular-nums">
                      ({displayedRows.length}
                      {displayedRows.length !== rows.length
                        ? ` of ${rows.length}`
                        : ""}{" "}
                      {rows.length === 1 ? "student" : "students"})
                    </span>
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs">
                    Click any column header to sort · {rangeLabel}
                  </CardDescription>
                </div>

                {!loading && rows.length > 0 && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative w-full sm:w-52">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search student..."
                        aria-label="Search report by student name or roll number"
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

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-pressed={onlyBelow75}
                      onClick={() => setOnlyBelow75((prev) => !prev)}
                      className={cn(
                        "h-8 whitespace-nowrap text-xs",
                        onlyBelow75 &&
                          "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
                      )}
                    >
                      <AlertTriangle
                        className="mr-1.5 h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      Below 75% ({below75Count})
                    </Button>
                  </div>
                )}
              </div>
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
              ) : displayedRows.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm font-medium">No matching students</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {onlyBelow75
                      ? "No students are below 75% matching your filter."
                      : "Try clearing your search query."}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setSearch("");
                      setOnlyBelow75(false);
                    }}
                  >
                    Reset filters
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4">
                          <button
                            type="button"
                            onClick={() => toggleSort("rollNo")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            Roll No
                            <SortIndicator
                              column="rollNo"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            onClick={() => toggleSort("name")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            Name
                            <SortIndicator
                              column="name"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead className="text-right" title="Present">
                          <button
                            type="button"
                            onClick={() => toggleSort("present")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            <span className="sm:hidden">P</span>
                            <span className="hidden sm:inline">Present</span>
                            <SortIndicator
                              column="present"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead className="text-right" title="Absent">
                          <button
                            type="button"
                            onClick={() => toggleSort("absent")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            <span className="sm:hidden">A</span>
                            <span className="hidden sm:inline">Absent</span>
                            <SortIndicator
                              column="absent"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead className="text-right" title="Late">
                          <button
                            type="button"
                            onClick={() => toggleSort("late")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            <span className="sm:hidden">L</span>
                            <span className="hidden sm:inline">Late</span>
                            <SortIndicator
                              column="late"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead className="text-right" title="Leave">
                          <button
                            type="button"
                            onClick={() => toggleSort("leave")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            <span className="sm:hidden">V</span>
                            <span className="hidden sm:inline">Leave</span>
                            <SortIndicator
                              column="leave"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead
                          className="hidden text-right sm:table-cell"
                          title="Marked days"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort("total")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            Marked
                            <SortIndicator
                              column="total"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                        <TableHead
                          className="pr-4 text-right"
                          title="Attendance percentage"
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort("percentage")}
                            className="inline-flex items-center font-medium hover:text-foreground"
                          >
                            <span className="sm:hidden">%</span>
                            <span className="hidden sm:inline">
                              Attendance %
                            </span>
                            <SortIndicator
                              column="percentage"
                              sortKey={sortKey}
                              sortDir={sortDir}
                            />
                          </button>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedRows.map((row: ReportRow) => (
                        <TableRow key={row.studentId}>
                          <TableCell className="pl-4 font-mono text-xs tabular-nums sm:text-sm">
                            {row.rollNo}
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className="flex flex-wrap items-center gap-2">
                              {row.name}
                              {!row.active && (
                                <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  Removed
                                </span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {row.present}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {row.absent}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {row.late}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {row.leave}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm tabular-nums sm:table-cell">
                            {row.total}
                          </TableCell>
                          <TableCell className="pr-4 text-right">
                            {row.total === 0 ? (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-2.5">
                                <div
                                  className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:block"
                                  aria-hidden="true"
                                >
                                  <div
                                    className={cn(
                                      "h-full rounded-full",
                                      progressBarTone(row.percentage)
                                    )}
                                    style={{
                                      width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                                    }}
                                  />
                                </div>
                                <span
                                  className={cn(
                                    "inline-flex min-w-[3.5rem] items-center justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-medium tabular-nums",
                                    percentageTone(row.percentage)
                                  )}
                                >
                                  {formatPct(row.percentage)}
                                </span>
                              </div>
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
