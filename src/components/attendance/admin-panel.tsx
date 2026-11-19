"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  BanIcon,
  BookOpenIcon,
  CircleCheckIcon,
  GraduationCapIcon,
  HistoryIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StudentAccountsPanel } from "@/components/attendance/student-accounts-panel";
import { AuditAdminPanel } from "@/components/attendance/audit-list";
import type {
  CourseWithDetails,
  ProfessorAccount,
  ProgramWithCounts,
  Role,
} from "@/lib/types";

export interface AdminPanelProps {
  onChanged?: () => void;
}

const JSON_HEADERS = { "Content-Type": "application/json" } as const;
const PASSWORD_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Extract the server-provided error message from a failed response body ({ error }). */
async function getErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = (await res.json()) as { error?: unknown };
    if (typeof payload?.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    // Response had no JSON body; fall through to the fallback message.
  }
  return fallback;
}

/** Random 10-character alphanumeric password, shown to the admin so it can be shared in person. */
function generatePassword(): string {
  const random = new Uint32Array(10);
  crypto.getRandomValues(random);
  let password = "";
  for (let i = 0; i < random.length; i += 1) {
    password += PASSWORD_ALPHABET[random[i] % PASSWORD_ALPHABET.length];
  }
  return password;
}

function pickList<T>(payload: unknown, key: string): T[] {
  if (payload !== null && typeof payload === "object" && key in payload) {
    const value = (payload as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

const pickProfessors = (payload: unknown): ProfessorAccount[] =>
  pickList<ProfessorAccount>(payload, "professors").sort((a, b) =>
    a.name.localeCompare(b.name),
  );

const pickPrograms = (payload: unknown): ProgramWithCounts[] =>
  pickList<ProgramWithCounts>(payload, "programs").sort((a, b) =>
    a.name.localeCompare(b.name),
  );

const pickCourses = (payload: unknown): CourseWithDetails[] =>
  pickList<CourseWithDetails>(payload, "courses").sort((a, b) =>
    a.code.localeCompare(b.code),
  );

interface ApiList<T> {
  data: T[] | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

function useApiList<T>(
  url: string,
  pick: (payload: unknown) => T[],
): ApiList<T> {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to load data"));
      }
      setData(pick(await res.json()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [url, pick]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload };
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-11 w-full" />
      ))}
    </div>
  );
}

function LoadErrorNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCcwIcon />
        Try again
      </Button>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function AdminPanel({ onChanged }: AdminPanelProps) {
  const professorsApi = useApiList<ProfessorAccount>(
    "/api/professors",
    pickProfessors,
  );
  const programsApi = useApiList<ProgramWithCounts>(
    "/api/programs",
    pickPrograms,
  );
  const coursesApi = useApiList<CourseWithDetails>("/api/courses", pickCourses);

  const professors = professorsApi.data ?? [];
  const programs = programsApi.data ?? [];
  const courses = coursesApi.data ?? [];

  // Add professor dialog
  const [addProfOpen, setAddProfOpen] = useState(false);
  const [addProfName, setAddProfName] = useState("");
  const [addProfEmail, setAddProfEmail] = useState("");
  const [addProfPassword, setAddProfPassword] = useState("");
  const [addProfRole, setAddProfRole] = useState<Role>("PROFESSOR");
  const [addProfBusy, setAddProfBusy] = useState(false);

  // Reset password dialog
  const [resetTarget, setResetTarget] = useState<ProfessorAccount | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  // Enable / disable account
  const [disableTarget, setDisableTarget] = useState<ProfessorAccount | null>(
    null,
  );
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  // Add / rename / delete program
  const [addProgramOpen, setAddProgramOpen] = useState(false);
  const [addProgramName, setAddProgramName] = useState("");
  const [addProgramBusy, setAddProgramBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProgramWithCounts | null>(
    null,
  );
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteProgramTarget, setDeleteProgramTarget] =
    useState<ProgramWithCounts | null>(null);
  const [deleteProgramBusy, setDeleteProgramBusy] = useState(false);

  // Add / edit / delete course
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [courseEditId, setCourseEditId] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseProgramId, setCourseProgramId] = useState("");
  const [courseProfessorId, setCourseProfessorId] = useState("");
  const [courseBusy, setCourseBusy] = useState(false);
  const [courseDeleteTarget, setCourseDeleteTarget] =
    useState<CourseWithDetails | null>(null);
  const [courseDeleteBusy, setCourseDeleteBusy] = useState(false);

  const activeProfessorOptions = professors.filter(
    (professor) => professor.active || professor.id === courseProfessorId,
  );

  function openAddProfessor() {
    setAddProfName("");
    setAddProfEmail("");
    setAddProfRole("PROFESSOR");
    setAddProfPassword(generatePassword());
    setAddProfOpen(true);
  }

  async function handleAddProfessor() {
    const name = addProfName.trim();
    const email = addProfEmail.trim();
    const password = addProfPassword.trim();
    if (!name || !email || !password) {
      toast.error("Name, email, and password are all required");
      return;
    }
    setAddProfBusy(true);
    try {
      const res = await fetch("/api/professors", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, email, password, role: addProfRole }),
      });
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not create the account"),
        );
      }
      toast.success("Credentials ready — share them in person", {
        description: `${name} · ${email} · password: ${password}`,
      });
      setAddProfOpen(false);
      await professorsApi.reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the account",
      );
    } finally {
      setAddProfBusy(false);
    }
  }

  function openReset(professor: ProfessorAccount) {
    setResetTarget(professor);
    setResetPassword(generatePassword());
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    const password = resetPassword.trim();
    if (!password) {
      toast.error("Password is required");
      return;
    }
    setResetBusy(true);
    try {
      const res = await fetch(
        `/api/professors/${encodeURIComponent(resetTarget.id)}`,
        {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ password }),
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not reset the password"),
        );
      }
      toast.success(`Password reset for ${resetTarget.name}`, {
        description: `New password: ${password} — share it in person`,
      });
      setResetTarget(null);
      await professorsApi.reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not reset the password",
      );
    } finally {
      setResetBusy(false);
    }
  }

  async function handleSetActive(professor: ProfessorAccount, active: boolean) {
    setToggleBusyId(professor.id);
    try {
      const res = await fetch(
        `/api/professors/${encodeURIComponent(professor.id)}`,
        {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ active }),
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not update the account"),
        );
      }
      toast.success(
        active
          ? `${professor.name} can sign in again`
          : `${professor.name} has been disabled`,
      );
      await professorsApi.reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the account",
      );
    } finally {
      setToggleBusyId(null);
    }
  }

  async function handleDisableConfirm() {
    if (!disableTarget) return;
    const target = disableTarget;
    setDisableTarget(null);
    await handleSetActive(target, false);
  }

  async function handleAddProgram() {
    const name = addProgramName.trim();
    if (!name) {
      toast.error("Program name is required");
      return;
    }
    setAddProgramBusy(true);
    try {
      const res = await fetch("/api/programs", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not create the program"),
        );
      }
      toast.success(`Program "${name}" created`);
      setAddProgramOpen(false);
      setAddProgramName("");
      await programsApi.reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create the program",
      );
    } finally {
      setAddProgramBusy(false);
    }
  }

  function openRename(program: ProgramWithCounts) {
    setRenameTarget(program);
    setRenameName(program.name);
  }

  async function handleRename() {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) {
      toast.error("Program name is required");
      return;
    }
    setRenameBusy(true);
    try {
      const res = await fetch(
        `/api/programs/${encodeURIComponent(renameTarget.id)}`,
        {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ name }),
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not rename the program"),
        );
      }
      toast.success(`Program renamed to "${name}"`);
      setRenameTarget(null);
      // Course rows embed the program name, so refresh them too.
      await Promise.all([programsApi.reload(), coursesApi.reload()]);
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not rename the program",
      );
    } finally {
      setRenameBusy(false);
    }
  }

  async function handleDeleteProgram() {
    if (!deleteProgramTarget) return;
    setDeleteProgramBusy(true);
    try {
      const res = await fetch(
        `/api/programs/${encodeURIComponent(deleteProgramTarget.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not delete the program"),
        );
      }
      toast.success(`Program "${deleteProgramTarget.name}" deleted`);
      setDeleteProgramTarget(null);
      await programsApi.reload();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the program",
      );
    } finally {
      setDeleteProgramBusy(false);
    }
  }

  function openCourseDialog(course?: CourseWithDetails) {
    if (course) {
      setCourseEditId(course.id);
      setCourseCode(course.code);
      setCourseTitle(course.title);
      setCourseProgramId(course.programId);
      setCourseProfessorId(course.professorId);
    } else {
      setCourseEditId(null);
      setCourseCode("");
      setCourseTitle("");
      setCourseProgramId("");
      setCourseProfessorId("");
    }
    setCourseDialogOpen(true);
  }

  async function handleCourseSubmit() {
    const code = courseCode.trim();
    const title = courseTitle.trim();
    if (!code || !title || !courseProgramId || !courseProfessorId) {
      toast.error("Code, title, program, and professor are all required");
      return;
    }
    setCourseBusy(true);
    try {
      const res = await fetch(
        courseEditId
          ? `/api/courses/${encodeURIComponent(courseEditId)}`
          : "/api/courses",
        {
          method: courseEditId ? "PATCH" : "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            code,
            title,
            programId: courseProgramId,
            professorId: courseProfessorId,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(
            res,
            courseEditId ? "Could not update the course" : "Could not create the course",
          ),
        );
      }
      toast.success(courseEditId ? `Course "${code}" updated` : `Course "${code}" created`);
      setCourseDialogOpen(false);
      // Program and professor rows embed course counts, so refresh them too.
      await Promise.all([
        coursesApi.reload(),
        programsApi.reload(),
        professorsApi.reload(),
      ]);
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : courseEditId
            ? "Could not update the course"
            : "Could not create the course",
      );
    } finally {
      setCourseBusy(false);
    }
  }

  async function handleDeleteCourse() {
    if (!courseDeleteTarget) return;
    setCourseDeleteBusy(true);
    try {
      const res = await fetch(
        `/api/courses/${encodeURIComponent(courseDeleteTarget.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not delete the course"),
        );
      }
      toast.success(`Course "${courseDeleteTarget.code}" deleted`);
      setCourseDeleteTarget(null);
      await Promise.all([
        coursesApi.reload(),
        programsApi.reload(),
        professorsApi.reload(),
      ]);
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not delete the course",
      );
    } finally {
      setCourseDeleteBusy(false);
    }
  }

  const destructiveButtonClass =
    "text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950";
  const primaryButtonClass =
    "bg-emerald-600 text-white hover:bg-emerald-700";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Administration</CardTitle>
        <CardDescription>
          Manage professor accounts, academic programs, and course offerings.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        <Tabs defaultValue="professors" className="gap-4">
          <TabsList>
            <TabsTrigger value="professors">
              <UsersIcon />
              Professors
            </TabsTrigger>
            <TabsTrigger value="programs">
              <GraduationCapIcon />
              Programs
            </TabsTrigger>
            <TabsTrigger value="courses">
              <BookOpenIcon />
              Courses
            </TabsTrigger>
            <TabsTrigger value="students">
              <KeyRoundIcon />
              Students
            </TabsTrigger>
            <TabsTrigger value="audit">
              <HistoryIcon />
              Audit log
            </TabsTrigger>
          </TabsList>

          {/* ── Professors ─────────────────────────────────────────── */}
          <TabsContent value="professors" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {professors.length}{" "}
                {professors.length === 1 ? "account" : "accounts"}
              </p>
              <Button
                className={primaryButtonClass}
                onClick={openAddProfessor}
              >
                <PlusIcon />
                Add professor
              </Button>
            </div>
            {professorsApi.data === null && professorsApi.error ? (
              <LoadErrorNotice
                message={professorsApi.error}
                onRetry={() => void professorsApi.reload()}
              />
            ) : professorsApi.data === null ? (
              <TableSkeleton />
            ) : professors.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="size-6" />}
                title="No professor accounts yet"
                description="Create the first account so someone can manage courses and attendance."
              />
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {professors.map((professor) => (
                      <TableRow
                        key={professor.id}
                        className={professor.active ? undefined : "opacity-70"}
                      >
                        <TableCell className="font-medium">
                          {professor.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {professor.email}
                        </TableCell>
                        <TableCell>
                          {professor.role === "ADMIN" ? (
                            <Badge className="border-transparent bg-violet-600 text-white">
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Professor</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {professor.courseCount}
                        </TableCell>
                        <TableCell>
                          {professor.active ? (
                            <Badge className="border-transparent bg-emerald-600 text-white">
                              Active
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                            >
                              Disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={toggleBusyId === professor.id}
                                  aria-label={`Actions for ${professor.name}`}
                                >
                                  <MoreHorizontalIcon />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem
                                  onSelect={() => openReset(professor)}
                                >
                                  <KeyRoundIcon />
                                  Reset password
                                </DropdownMenuItem>
                                {professor.active ? (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => setDisableTarget(professor)}
                                  >
                                    <BanIcon />
                                    Disable account
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      void handleSetActive(professor, true)
                                    }
                                  >
                                    <CircleCheckIcon />
                                    Enable account
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Programs ───────────────────────────────────────────── */}
          <TabsContent value="programs" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {programs.length} {programs.length === 1 ? "program" : "programs"}
              </p>
              <Button
                className={primaryButtonClass}
                onClick={() => {
                  setAddProgramName("");
                  setAddProgramOpen(true);
                }}
              >
                <PlusIcon />
                Add program
              </Button>
            </div>
            {programsApi.data === null && programsApi.error ? (
              <LoadErrorNotice
                message={programsApi.error}
                onRetry={() => void programsApi.reload()}
              />
            ) : programsApi.data === null ? (
              <TableSkeleton />
            ) : programs.length === 0 ? (
              <EmptyState
                icon={<GraduationCapIcon className="size-6" />}
                title="No programs yet"
                description="Programs group courses and their students. Add the first one to get started."
              />
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Courses</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {programs.map((program) => (
                      <TableRow key={program.id}>
                        <TableCell className="font-medium">
                          {program.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {program.courseCount}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {program.studentCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openRename(program)}
                            >
                              <PencilIcon />
                              Rename
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={destructiveButtonClass}
                              onClick={() => setDeleteProgramTarget(program)}
                            >
                              <Trash2Icon />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Courses ────────────────────────────────────────────── */}
          <TabsContent value="courses" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {courses.length} {courses.length === 1 ? "course" : "courses"}
              </p>
              <Button
                className={primaryButtonClass}
                disabled={programsApi.data === null || professorsApi.data === null}
                onClick={() => openCourseDialog()}
              >
                <PlusIcon />
                Add course
              </Button>
            </div>
            {coursesApi.data === null && coursesApi.error ? (
              <LoadErrorNotice
                message={coursesApi.error}
                onRetry={() => void coursesApi.reload()}
              />
            ) : coursesApi.data === null ? (
              <TableSkeleton />
            ) : courses.length === 0 ? (
              <EmptyState
                icon={<BookOpenIcon className="size-6" />}
                title="No courses yet"
                description="Create a course and assign it to a program and a professor."
              />
            ) : (
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Professor</TableHead>
                      <TableHead>Students</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {courses.map((course) => (
                      <TableRow key={course.id}>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-emerald-600/40 bg-emerald-50 font-mono text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          >
                            {course.code}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {course.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {course.programName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {course.professorName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {course.studentCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCourseDialog(course)}
                            >
                              <PencilIcon />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={destructiveButtonClass}
                              onClick={() => setCourseDeleteTarget(course)}
                            >
                              <Trash2Icon />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ── Students (self-view credentials, Phase 2) ───────────── */}
          <TabsContent value="students" className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Give students read-only access to their own attendance. They sign
              in with the email and password you set here.
            </p>
            <StudentAccountsPanel />
          </TabsContent>

          {/* ── Audit log (Phase 2) ─────────────────────────────────  */}
          <TabsContent value="audit" className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Who changed what and when — attendance saves, roster edits, and
              account administration.
            </p>
            <AuditAdminPanel />
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Add professor dialog */}
      <Dialog open={addProfOpen} onOpenChange={setAddProfOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddProfessor();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add professor</DialogTitle>
              <DialogDescription>
                Create a new account. Share the password with the professor in
                person — it is never emailed.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="prof-name">Name</Label>
                <Input
                  id="prof-name"
                  value={addProfName}
                  onChange={(event) => setAddProfName(event.target.value)}
                  placeholder="Full name"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prof-email">Email</Label>
                <Input
                  id="prof-email"
                  type="email"
                  value={addProfEmail}
                  onChange={(event) => setAddProfEmail(event.target.value)}
                  placeholder="professor@college.edu"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prof-password">Temporary password</Label>
                <div className="flex items-end gap-2">
                  <Input
                    id="prof-password"
                    value={addProfPassword}
                    onChange={(event) => setAddProfPassword(event.target.value)}
                    className="flex-1 font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddProfPassword(generatePassword())}
                  >
                    <RefreshCwIcon />
                    Generate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Shown in plain text so you can share it with the professor.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="prof-role">Role</Label>
                <Select
                  value={addProfRole}
                  onValueChange={(value) => setAddProfRole(value as Role)}
                >
                  <SelectTrigger id="prof-role" className="w-full">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROFESSOR">Professor</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddProfOpen(false)}
                disabled={addProfBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={primaryButtonClass}
                disabled={addProfBusy}
              >
                {addProfBusy ? "Creating..." : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => {
          if (!open) setResetTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleResetPassword();
            }}
          >
            <DialogHeader>
              <DialogTitle>Reset password</DialogTitle>
              <DialogDescription>
                Set a new password for {resetTarget?.name ?? "this account"} (
                {resetTarget?.email ?? ""}).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="reset-password">New password</Label>
              <div className="flex items-end gap-2">
                <Input
                  id="reset-password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  className="flex-1 font-mono"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setResetPassword(generatePassword())}
                >
                  <RefreshCwIcon />
                  Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Shown in plain text so you can share it in person.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetTarget(null)}
                disabled={resetBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={primaryButtonClass}
                disabled={resetBusy}
              >
                {resetBusy ? "Saving..." : "Reset password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Disable account confirmation */}
      <AlertDialog
        open={disableTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisableTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disable &quot;{disableTarget?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This account will no longer be able to sign in. Their courses and
              all attendance history remain untouched, and the account can be
              re-enabled at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={(event) => {
                event.preventDefault();
                void handleDisableConfirm();
              }}
            >
              <BanIcon />
              Disable account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add program dialog */}
      <Dialog open={addProgramOpen} onOpenChange={setAddProgramOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAddProgram();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add program</DialogTitle>
              <DialogDescription>
                Programs group related courses, e.g. &quot;B.Tech CSE&quot;.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="program-name">Program name</Label>
              <Input
                id="program-name"
                value={addProgramName}
                onChange={(event) => setAddProgramName(event.target.value)}
                placeholder="e.g. B.Tech Computer Science"
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddProgramOpen(false)}
                disabled={addProgramBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={primaryButtonClass}
                disabled={addProgramBusy}
              >
                <PlusIcon />
                {addProgramBusy ? "Creating..." : "Create program"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Rename program dialog */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRename();
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename program</DialogTitle>
              <DialogDescription>
                Currently &quot;{renameTarget?.name ?? ""}&quot;. Courses keep
                their link to this program.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="rename-program">Program name</Label>
              <Input
                id="rename-program"
                value={renameName}
                onChange={(event) => setRenameName(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
                disabled={renameBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={primaryButtonClass}
                disabled={renameBusy}
              >
                {renameBusy ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete program confirmation */}
      <AlertDialog
        open={deleteProgramTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteProgramTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{deleteProgramTarget?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the program. Programs that still have
              courses or students cannot be deleted — move or remove them
              first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProgramBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleteProgramBusy}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteProgram();
              }}
            >
              <Trash2Icon />
              {deleteProgramBusy ? "Deleting..." : "Delete program"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add / edit course dialog */}
      <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCourseSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {courseEditId ? "Edit course" : "Add course"}
              </DialogTitle>
              <DialogDescription>
                {courseEditId
                  ? "Update the course details, program, or assigned professor."
                  : "Create a course offering under a program, taught by an active professor."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="course-code">Code</Label>
                  <Input
                    id="course-code"
                    value={courseCode}
                    onChange={(event) => setCourseCode(event.target.value)}
                    placeholder="e.g. CS201"
                    autoFocus={!courseEditId}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="course-title">Title</Label>
                  <Input
                    id="course-title"
                    value={courseTitle}
                    onChange={(event) => setCourseTitle(event.target.value)}
                    placeholder="e.g. Data Structures"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Program</Label>
                <Select
                  value={courseProgramId}
                  onValueChange={setCourseProgramId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.length === 0 ? (
                      <SelectLabel>
                        No programs yet — create one first
                      </SelectLabel>
                    ) : (
                      programs.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Professor</Label>
                <Select
                  value={courseProfessorId}
                  onValueChange={setCourseProfessorId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a professor" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeProfessorOptions.length === 0 ? (
                      <SelectLabel>
                        No active professors yet — add one first
                      </SelectLabel>
                    ) : (
                      activeProfessorOptions.map((professor) => (
                        <SelectItem key={professor.id} value={professor.id}>
                          {professor.name}
                          {professor.active ? "" : " (disabled)"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCourseDialogOpen(false)}
                disabled={courseBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className={primaryButtonClass}
                disabled={courseBusy}
              >
                {courseBusy
                  ? "Saving..."
                  : courseEditId
                    ? "Save changes"
                    : "Create course"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete course confirmation */}
      <AlertDialog
        open={courseDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCourseDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{courseDeleteTarget?.code} —{" "}
              {courseDeleteTarget?.title}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the course, every student enrollment in
              it, and all attendance history recorded for it. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={courseDeleteBusy}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={courseDeleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteCourse();
              }}
            >
              <Trash2Icon />
              {courseDeleteBusy ? "Deleting..." : "Delete course"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default AdminPanel;
