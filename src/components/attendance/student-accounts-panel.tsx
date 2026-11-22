"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CredentialsDialog,
  type IssuedCredentials,
} from "@/components/attendance/credentials-dialog";
import { apiFetch } from "@/lib/client";
import type { ProgramWithCounts, StudentAccountView } from "@/lib/types";
import { cn } from "@/lib/utils";

const PASSWORD_LENGTH = 8;
const LAST_PROGRAM_KEY = "attendance:lastStudentProgramId";

function generatePassword(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const random = new Uint32Array(PASSWORD_LENGTH);
  crypto.getRandomValues(random);
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += chars[random[i] % chars.length];
  }
  return out;
}

function suggestUsername(rollNo: string): string {
  return rollNo.toLowerCase();
}

export function StudentAccountsPanel() {
  const [programs, setPrograms] = useState<ProgramWithCounts[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");

  const [students, setStudents] = useState<StudentAccountView[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const [editing, setEditing] = useState<StudentAccountView | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [issuedCredentials, setIssuedCredentials] =
    useState<IssuedCredentials | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const loadPrograms = useCallback(async () => {
    setProgramsLoading(true);
    setProgramsError(null);
    try {
      const data = await apiFetch<{ programs: ProgramWithCounts[] }>(
        "/api/programs"
      );
      setPrograms(data.programs);
      if (data.programs.length > 0) {
        let preferred = data.programs[0].id;
        try {
          const saved = window.sessionStorage.getItem(LAST_PROGRAM_KEY);
          if (saved && data.programs.some((p) => p.id === saved)) {
            preferred = saved;
          }
        } catch {
          // ignore storage errors
        }
        setProgramId((curr) => curr || preferred);
      }
    } catch (err) {
      setProgramsError(
        err instanceof Error ? err.message : "Failed to load programs"
      );
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  function handleProgramSelect(nextId: string) {
    setProgramId(nextId);
    setStudents([]);
    setStudentsError(null);
    try {
      window.sessionStorage.setItem(LAST_PROGRAM_KEY, nextId);
    } catch {
      // ignore storage errors
    }
  }

  const refetchStudents = useCallback(
    async (silent = false) => {
      if (!programId) return;
      if (!silent) setStudentsLoading(true);
      setStudentsError(null);
      try {
        const data = await apiFetch<{ students: StudentAccountView[] }>(
          `/api/student-accounts?programId=${encodeURIComponent(programId)}`
        );
        setStudents(data.students);
      } catch (err) {
        setStudentsError(
          err instanceof Error ? err.message : "Failed to load students"
        );
        if (!silent) setStudents([]);
      } finally {
        if (!silent) setStudentsLoading(false);
      }
    },
    [programId]
  );

  useEffect(() => {
    if (programId) void refetchStudents();
  }, [programId, refetchStudents]);

  const missingCount = useMemo(
    () => students.filter((s) => !s.hasPassword).length,
    [students]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (onlyMissing && s.hasPassword) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.rollNo.toLowerCase().includes(q) ||
        (s.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, search, onlyMissing]);

  function openCredentials(student: StudentAccountView) {
    setEditing(student);
    setUsername(student.username ?? suggestUsername(student.rollNo));
    setPassword(generatePassword());
  }

  async function handleSave() {
    if (!editing) return;
    const trimmedUser = username.trim();
    const rawPass = password;
    setSaving(true);
    try {
      await apiFetch("/api/student-accounts", {
        method: "PATCH",
        body: JSON.stringify({
          studentId: editing.id,
          username: trimmedUser,
          password: rawPass,
        }),
      });
      const targetName = editing.name;
      setEditing(null);
      setIssuedCredentials({
        title: "Student credentials saved",
        recipientName: targetName,
        username: trimmedUser,
        password: rawPass,
        note: `Share these read-only sign-in details with ${targetName} in person.`,
      });
      await refetchStudents(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save credentials"
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkEnable() {
    if (!programId) return;
    setBulkLoading(true);
    try {
      const res = await apiFetch<{ enabled: number; skipped: string[] }>(
        "/api/student-accounts",
        { method: "POST", body: JSON.stringify({ programId }) }
      );
      const skippedNote =
        res.skipped.length > 0
          ? `, skipped ${res.skipped.length} (username taken)`
          : "";
      toast.success(`Enabled ${res.enabled} student logins${skippedNote}`);
      setBulkOpen(false);
      await refetchStudents(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to enable logins"
      );
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight">
          Student logins
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Set up read-only credentials so students can view their own
          attendance.
        </p>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div>
            <Label htmlFor="student-accounts-program" className="sr-only">
              Program
            </Label>
            {programsLoading ? (
              <Skeleton className="h-9 w-full sm:w-56" />
            ) : programsError ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {programsError}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadPrograms()}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            ) : (
              <Select value={programId} onValueChange={handleProgramSelect}>
                <SelectTrigger
                  id="student-accounts-program"
                  className="h-9 w-full sm:w-56"
                >
                  <SelectValue placeholder="Choose a program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {programId && !studentsLoading && students.length > 0 && (
            <>
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
                  aria-label="Search students by name, roll number, or username"
                  className="h-9 pl-8 pr-7 text-xs"
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
                aria-pressed={onlyMissing}
                onClick={() => setOnlyMissing((prev) => !prev)}
                className={cn(
                  "h-9 whitespace-nowrap text-xs",
                  onlyMissing &&
                    "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300"
                )}
              >
                Missing login ({missingCount})
              </Button>
            </>
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-9 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700 dark:border-emerald-800/60 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
          disabled={!programId || studentsLoading || missingCount === 0}
          onClick={() => setBulkOpen(true)}
        >
          <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Enable logins for missing ({missingCount})
        </Button>
      </div>

      {studentsLoading ? (
        <Card className="py-6">
          <CardContent className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : studentsError ? (
        <Card className="items-center p-6 text-center">
          <p className="text-sm text-muted-foreground">{studentsError}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => void refetchStudents()}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </Card>
      ) : !programId ? (
        <Card className="items-center p-10 text-center">
          <Users
            className="h-10 w-10 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">No programs available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a program first to review students&apos; login status.
          </p>
        </Card>
      ) : students.length === 0 ? (
        <Card className="items-center p-10 text-center">
          <Users
            className="h-10 w-10 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">No students in this program</p>
        </Card>
      ) : filteredStudents.length === 0 ? (
        <Card className="items-center p-10 text-center">
          <p className="text-sm font-medium">No matching students</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {onlyMissing
              ? "Every student matching your search already has a login enabled."
              : "Try clearing your search query."}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setSearch("");
              setOnlyMissing(false);
            }}
          >
            Reset filters
          </Button>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Roll No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Courses</TableHead>
                    <TableHead>Login username</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="pl-4 font-mono text-xs font-medium tabular-nums sm:text-sm">
                        {student.rollNo}
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.name}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground tabular-nums">
                        {student.activeEnrollments}
                      </TableCell>
                      <TableCell className="font-mono text-xs sm:text-sm">
                        {student.username ?? (
                          <span className="font-sans text-muted-foreground">
                            not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.hasPassword ? (
                          <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCredentials(student)}
                        >
                          <KeyRound
                            className="mr-1.5 h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {student.hasPassword
                            ? "Reset login"
                            : "Set credentials"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Post-save copyable credentials modal */}
      <CredentialsDialog
        credentials={issuedCredentials}
        onClose={() => setIssuedCredentials(null)}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set credentials</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.name} — Roll ${editing.rollNo}`
                : "Student credentials"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="student-login-username">Username</Label>
              <Input
                id="student-login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={editing ? suggestUsername(editing.rollNo) : ""}
                autoComplete="off"
                className="font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="student-login-password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="student-login-password"
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  className="flex-1 font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setPassword(generatePassword())}
                >
                  Generate
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Students sign in with this username to view their own attendance
              (read-only).
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void handleSave()}
              disabled={saving || !username.trim() || password.length === 0}
            >
              {saving ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={bulkOpen}
        onOpenChange={(open) => {
          if (!bulkLoading) setBulkOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Enable logins for {missingCount} students without credentials?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students without credentials will get username = their roll number
              (lowercase) and password = their roll number. Share the
              credentials in person — students can then sign in to view their
              own attendance (read-only).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={bulkLoading}
              onClick={(e) => {
                e.preventDefault();
                void handleBulkEnable();
              }}
            >
              {bulkLoading ? (
                <Loader2
                  className="mr-1.5 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {bulkLoading ? "Enabling..." : "Enable logins"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default StudentAccountsPanel;
