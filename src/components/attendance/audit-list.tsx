"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  CalendarCheck,
  History,
  KeyRound,
  Layers,
  Loader2,
  RefreshCw,
  UserCog,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/client";
import { formatDateLabel } from "@/lib/date";
import type { AuditEntry, AuditEntityType, AuditResponse } from "@/lib/types";

const ACTION_LABELS: Record<string, string> = {
  SAVE_ATTENDANCE: "Attendance saved",
  ADD_STUDENT: "Student added",
  EDIT_STUDENT: "Student edited",
  REMOVE_STUDENT: "Student removed",
  RESTORE_STUDENT: "Student restored",
  IMPORT_STUDENTS: "CSV import",
  CREATE_COURSE: "Course created",
  UPDATE_COURSE: "Course updated",
  DELETE_COURSE: "Course deleted",
  CREATE_PROGRAM: "Program created",
  UPDATE_PROGRAM: "Program updated",
  DELETE_PROGRAM: "Program deleted",
  CREATE_PROFESSOR: "Account created",
  UPDATE_PROFESSOR: "Account updated",
  SET_STUDENT_CREDENTIALS: "Student credentials set",
  BULK_ENABLE_STUDENT_LOGINS: "Bulk enabled student logins",
};

const ENTITY_ICONS: Record<AuditEntityType, LucideIcon> = {
  attendance: CalendarCheck,
  student: UserRound,
  course: BookOpen,
  program: Layers,
  professor: UserCog,
  student_account: KeyRound,
};

const ENTITY_FILTERS: { value: AuditEntityType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "attendance", label: "Attendance" },
  { value: "student", label: "Students" },
  { value: "course", label: "Courses" },
  { value: "program", label: "Programs" },
  { value: "professor", label: "Faculty" },
  { value: "student_account", label: "Student access" },
];

const PAGE_SIZE = 20;
const MAX_DETAIL_LINES = 4;

interface AuditChangeDetail {
  rollNo: string;
  name: string;
  from: string;
  to: string;
}

interface AuditParsedDetails {
  changed?: AuditChangeDetail[];
  changedMore?: number;
  created?: number;
}

function isAuditChange(value: unknown): value is AuditChangeDetail {
  return (
    typeof value === "object" &&
    value !== null &&
    "rollNo" in value &&
    typeof value.rollNo === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "from" in value &&
    typeof value.from === "string" &&
    "to" in value &&
    typeof value.to === "string"
  );
}

function parseAuditDetails(raw: string | null): AuditParsedDetails | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as Record<string, unknown>;
    const out: AuditParsedDetails = {};
    if (Array.isArray(obj.changed)) {
      out.changed = obj.changed.filter(isAuditChange);
    }
    if (typeof obj.changedMore === "number") {
      out.changedMore = obj.changedMore;
    }
    if (typeof obj.created === "number") {
      out.created = obj.created;
    }
    return out;
  } catch {
    return null;
  }
}

// createdAt is an ISO string; the date part is formatted with the shared
// helper and the time is shown as-is (kept simple by design).
function formatAuditTimestamp(iso: string): string {
  const datePart = iso.slice(0, 10);
  const timePart = iso.slice(11, 16);
  if (!datePart) return iso;
  return timePart
    ? `${formatDateLabel(datePart)}, ${timePart}`
    : formatDateLabel(datePart);
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const Icon = ENTITY_ICONS[entry.entityType];
  const details = parseAuditDetails(entry.details);
  const changed = details?.changed ?? [];
  const visible = changed.slice(0, MAX_DETAIL_LINES);
  const changedMore = details?.changedMore ?? 0;
  const created = details?.created ?? 0;
  const hasExtras =
    visible.length > 0 || changedMore > 0 || created > 0;

  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">
            {ACTION_LABELS[entry.action] ?? entry.action}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {entry.entityLabel}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {entry.actorName} · {formatAuditTimestamp(entry.createdAt)}
        </p>
        {hasExtras && (
          <div className="mt-1.5 space-y-0.5">
            {visible.map((change, idx) => (
              <p
                key={`${change.rollNo}-${idx}`}
                className="truncate text-xs text-muted-foreground"
              >
                {change.rollNo} {change.name}: {change.from} → {change.to}
              </p>
            ))}
            {changedMore > 0 && (
              <p className="text-xs text-muted-foreground">
                +{changedMore} more
              </p>
            )}
            {created > 0 && (
              <p className="text-xs text-muted-foreground">
                {created} newly marked
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AuditSkeletonRows() {
  return (
    <div className="space-y-4 py-1">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditEmptyState() {
  return (
    <div className="py-10 text-center">
      <History
        className="mx-auto h-8 w-8 text-muted-foreground/50"
        aria-hidden="true"
      />
      <p className="mt-2 text-sm font-medium">No activity yet</p>
    </div>
  );
}

function AuditErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function AuditList({
  courseId,
  limit = 12,
}: {
  courseId?: string;
  limit?: number;
}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (courseId) params.set("courseId", courseId);
      const data = await apiFetch<AuditResponse>(
        `/api/audit?${params.toString()}`
      );
      setEntries(data.entries);
    } catch (err) {
      setEntries([]);
      setError(
        err instanceof Error ? err.message : "Failed to load activity"
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <AuditSkeletonRows />;

  if (error) {
    return <AuditErrorCard message={error} onRetry={() => void load()} />;
  }

  if (entries.length === 0) return <AuditEmptyState />;

  return (
    <div className="divide-y">
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

export function AuditAdminPanel() {
  const [entityType, setEntityType] = useState<AuditEntityType | "all">("all");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        if (entityType !== "all") params.set("entityType", entityType);
        const data = await apiFetch<AuditResponse>(
          `/api/audit?${params.toString()}`
        );
        setEntries((prev) =>
          append ? [...prev, ...data.entries] : data.entries
        );
        setTotal(data.total);
      } catch (err) {
        if (!append) setEntries([]);
        setError(
          err instanceof Error ? err.message : "Failed to load audit trail"
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [entityType]
  );

  useEffect(() => {
    void fetchPage(0, false);
  }, [fetchPage]);

  const hasMore = entries.length > 0 && entries.length < total;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={entityType}
          onValueChange={(value) => setEntityType(value as AuditEntityType | "all")}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {loading ? "Loading..." : `${total} entries`}
        </p>
      </div>

      <Card className="py-0">
        <CardContent className="p-4">
          {loading ? (
            <AuditSkeletonRows />
          ) : error ? (
            <AuditErrorCard
              message={error}
              onRetry={() => void fetchPage(0, false)}
            />
          ) : entries.length === 0 ? (
            <AuditEmptyState />
          ) : (
            <>
              <div className="divide-y">
                {entries.map((entry) => (
                  <AuditRow key={entry.id} entry={entry} />
                ))}
              </div>
              {hasMore && (
                <div className="mt-3 flex justify-center border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void fetchPage(entries.length, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <Loader2
                        className="mr-1.5 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
