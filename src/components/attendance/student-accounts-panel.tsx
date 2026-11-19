"use client";

import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Loader2,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { apiFetch } from "@/lib/client";
import type { ProgramWithCounts, StudentAccountView } from "@/lib/types";

const PASSWORD_LENGTH = 8;

function generatePassword(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function suggestEmail(rollNo: string): string {
  return `${rollNo.toLowerCase()}@student.dept.edu`;
}

export function StudentAccountsPanel() {
  const [programs, setPrograms] = useState<ProgramWithCounts[]>([]);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [programId, setProgramId] = useState("");

  const [students, setStudents] = useState<StudentAccountView[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [editing, setEditing] = useState<StudentAccountView | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

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
    setStudents([]);
    setStudentsError(null);
    if (programId) void refetchStudents();
  }, [programId, refetchStudents]);

  const hasMissing = students.some((s) => !s.hasPassword);

  function openCredentials(student: StudentAccountView) {
    setEditing(student);
    setEmail(student.email ?? suggestEmail(student.rollNo));
    setPassword("");
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiFetch("/api/student-accounts", {
        method: "PATCH",
        body: JSON.stringify({
          studentId: editing.id,
          email: email.trim(),
          password,
        }),
      });
      toast.success("Credentials saved — share them in person");
      setEditing(null);
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
          ? `, skipped ${res.skipped.length} (email taken)`
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
        <h2 className="text-lg font-semibold tracking-tight">Student logins</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up read-only credentials so students can view their own
          attendance.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5">
          <Label htmlFor="student-accounts-program" className="sr-only">
            Program
          </Label>
          {programsLoading ? (
            <Skeleton className="h-9 w-full sm:w-64" />
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
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger
                id="student-accounts-program"
                className="w-full sm:w-64"
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

        <Button
          variant="outline"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
          disabled={!programId || studentsLoading || !hasMissing}
          onClick={() => setBulkOpen(true)}
        >
          <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Enable logins for missing
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
          <p className="mt-3 font-medium">Choose a program</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a program to review its students&apos; login status.
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
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="overflow-auto sm:max-h-96">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Roll No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Courses</TableHead>
                    <TableHead>Login email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="pl-4 font-medium">
                        {student.rollNo}
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.activeEnrollments}
                      </TableCell>
                      <TableCell>
                        {student.email ?? (
                          <span className="text-muted-foreground">
                            not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {student.hasPassword ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            Enabled
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-muted-foreground/30 text-muted-foreground"
                          >
                            Disabled
                          </Badge>
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
                          Set credentials
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
              <Label htmlFor="student-login-email">Email</Label>
              <Input
                id="student-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={editing ? suggestEmail(editing.rollNo) : ""}
                autoComplete="off"
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
                  className="flex-1"
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
              Students sign in with this email to view their own attendance
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
              disabled={saving || !email.trim() || password.length === 0}
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
              Enable logins for students without credentials?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Students without credentials will get email =
              rollno@student.dept.edu and password = their roll number. Share
              the credentials in person — students can then sign in to view
              their own attendance (read-only).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkLoading}>
              Cancel
            </AlertDialogCancel>
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
