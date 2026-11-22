"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/attendance/csv-import-dialog";
import {
  CourseHeader,
  type CourseSubView,
} from "@/components/attendance/course-header";
import {
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
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
import type { CourseWithDetails, RosterStudent } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface RosterManagerProps {
  course: CourseWithDetails;
  onChanged?: () => void;
  onBack: () => void;
  onSelectTab: (tab: CourseSubView) => void;
}

type StatusFilter = "ALL" | "ACTIVE" | "REMOVED";

/** Extract the server-provided error message from a failed response body ({ error }). */
async function getErrorMessage(
  res: Response,
  fallback: string
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

function sortRoster(students: RosterStudent[]): RosterStudent[] {
  return [...students].sort((a, b) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })
  );
}

export function RosterManager({
  course,
  onChanged,
  onBack,
  onSelectTab,
}: RosterManagerProps) {
  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Add-student dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addRollNo, setAddRollNo] = useState("");
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Edit-student dialog
  const [editTarget, setEditTarget] = useState<RosterStudent | null>(null);
  const [editRollNo, setEditRollNo] = useState("");
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Soft-remove confirmation
  const [removeTarget, setRemoveTarget] = useState<RosterStudent | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const loadStudents = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/students?courseId=${encodeURIComponent(course.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Failed to load the roster")
        );
      }
      const data = (await res.json()) as { students: RosterStudent[] };
      setStudents(sortRoster(data.students));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load the roster";
      setLoadError(message);
      toast.error(message);
    }
  }, [course.id]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const activeCount = useMemo(
    () =>
      students
        ? students.filter((student) => student.active).length
        : course.studentCount,
    [students, course.studentCount]
  );

  const removedCount = useMemo(
    () =>
      students ? students.filter((student) => !student.active).length : 0,
    [students]
  );

  const filteredStudents = useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    return students.filter((student) => {
      if (statusFilter === "ACTIVE" && !student.active) return false;
      if (statusFilter === "REMOVED" && student.active) return false;
      if (!q) return true;
      return (
        student.name.toLowerCase().includes(q) ||
        student.rollNo.toLowerCase().includes(q)
      );
    });
  }, [students, search, statusFilter]);

  async function handleAdd() {
    const rollNo = addRollNo.trim();
    const name = addName.trim();
    if (!rollNo || !name) {
      toast.error("Roll number and name are both required");
      return;
    }
    setAddBusy(true);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, rollNo, name }),
      });
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, `Could not add "${name}" to the roster`)
        );
      }
      setAddOpen(false);
      setAddRollNo("");
      setAddName("");
      toast.success(`"${name}" added to ${course.code}`);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : `Could not add "${name}" to the roster`
      );
    } finally {
      setAddBusy(false);
    }
  }

  function openEdit(student: RosterStudent) {
    setEditTarget(student);
    setEditRollNo(student.rollNo);
    setEditName(student.name);
  }

  async function handleEdit() {
    if (!editTarget) return;
    const rollNo = editRollNo.trim();
    const name = editName.trim();
    if (!rollNo || !name) {
      toast.error("Roll number and name are both required");
      return;
    }
    setEditBusy(true);
    try {
      const res = await fetch(
        `/api/students/${encodeURIComponent(editTarget.studentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id, name, rollNo }),
        }
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not update the student")
        );
      }
      setEditTarget(null);
      toast.success(`"${name}" updated`);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the student"
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      const res = await fetch(
        `/api/students/${encodeURIComponent(removeTarget.studentId)}?courseId=${encodeURIComponent(course.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not remove the student")
        );
      }
      toast.success(
        `"${removeTarget.name}" removed from the roster — attendance history kept`
      );
      setRemoveTarget(null);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove the student"
      );
    } finally {
      setRemoveBusy(false);
    }
  }

  async function handleRestore(student: RosterStudent) {
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: course.id,
          rollNo: student.rollNo,
          name: student.name,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not restore the student")
        );
      }
      toast.success(`"${student.name}" restored to the roster`);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not restore the student"
      );
    }
  }

  const courseWithFreshCount = useMemo(
    () => ({ ...course, studentCount: activeCount }),
    [course, activeCount]
  );

  return (
    <div className="space-y-4">
      <CourseHeader
        course={courseWithFreshCount}
        activeTab="roster"
        onBack={onBack}
        onSelectTab={onSelectTab}
        actions={
          <>
            <CsvImportDialog
              courseId={course.id}
              onImported={() => {
                void loadStudents();
                onChanged?.();
              }}
            />
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Add student
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="gap-3 border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-base">Student roster</CardTitle>
              <CardDescription className="mt-1 text-xs">
                Add, edit, or soft-remove students. Removed students keep their
                attendance history and can be restored.
              </CardDescription>
            </div>

            {students && students.length > 0 && (
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
                    placeholder="Search name or roll..."
                    aria-label="Search roster by name or roll number"
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

                {removedCount > 0 && (
                  <div
                    role="group"
                    aria-label="Filter roster status"
                    className="inline-flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
                  >
                    {(
                      [
                        { id: "ALL", label: `All (${students.length})` },
                        { id: "ACTIVE", label: `Active (${activeCount})` },
                        { id: "REMOVED", label: `Removed (${removedCount})` },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={statusFilter === opt.id}
                        onClick={() => setStatusFilter(opt.id)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors tabular-nums",
                          statusFilter === opt.id
                            ? "bg-background text-foreground shadow-xs"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {students === null && loadError ? (
            <div className="m-4 flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-300">
                {loadError}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadStudents()}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
            </div>
          ) : students === null ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <Users className="size-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium">No students yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                This course has an empty roster. Add the first student or import
                a CSV to start tracking attendance.
              </p>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Add the first student
              </Button>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium">No matching students</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try adjusting your search or status filter.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("ALL");
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
                    <TableHead className="hidden pl-4 sm:table-cell">
                      Roll No
                    </TableHead>
                    <TableHead className="pl-4 sm:pl-2">Name</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">
                      Marked days
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStudents.map((student) => (
                    <TableRow
                      key={student.studentId}
                      className={student.active ? undefined : "opacity-70"}
                    >
                      <TableCell className="hidden pl-4 font-mono text-sm tabular-nums sm:table-cell">
                        {student.rollNo}
                      </TableCell>
                      <TableCell className="pl-4 font-medium sm:pl-2">
                        <p className="leading-tight">{student.name}</p>
                        <p className="font-mono text-xs leading-tight text-muted-foreground tabular-nums sm:hidden">
                          {student.rollNo}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-sm text-muted-foreground tabular-nums sm:table-cell">
                        {student.markedDays}
                      </TableCell>
                      <TableCell>
                        {student.active ? (
                          <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            Removed
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-2">
                          {student.active ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Edit ${student.name}`}
                                onClick={() => openEdit(student)}
                              >
                                <Pencil
                                  className="h-3.5 w-3.5 sm:mr-1.5"
                                  aria-hidden="true"
                                />
                                <span className="hidden sm:inline">Edit</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Remove ${student.name}`}
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/50"
                                onClick={() => setRemoveTarget(student)}
                              >
                                <Trash2
                                  className="h-3.5 w-3.5 sm:mr-1.5"
                                  aria-hidden="true"
                                />
                                <span className="hidden sm:inline">Remove</span>
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`Restore ${student.name}`}
                              className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
                              onClick={() => void handleRestore(student)}
                            >
                              <RotateCcw
                                className="h-3.5 w-3.5 sm:mr-1.5"
                                aria-hidden="true"
                              />
                              <span className="hidden sm:inline">Restore</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add student dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleAdd();
            }}
          >
            <DialogHeader>
              <DialogTitle>Add student</DialogTitle>
              <DialogDescription>
                Enroll a new student in {course.code}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="roster-add-roll">Roll number</Label>
                <Input
                  id="roster-add-roll"
                  value={addRollNo}
                  onChange={(event) => setAddRollNo(event.target.value)}
                  placeholder="e.g. 23CS045"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="roster-add-name">Name</Label>
                <Input
                  id="roster-add-name"
                  value={addName}
                  onChange={(event) => setAddName(event.target.value)}
                  placeholder="Full name"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={addBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={addBusy}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {addBusy ? "Adding..." : "Add student"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit student dialog */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleEdit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit student</DialogTitle>
              <DialogDescription>
                Update the details for {editTarget?.name ?? "this student"} in{" "}
                {course.code}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="roster-edit-name">Name</Label>
                <Input
                  id="roster-edit-name"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="roster-edit-roll">Roll number</Label>
                <Input
                  id="roster-edit-roll"
                  value={editRollNo}
                  onChange={(event) => setEditRollNo(event.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditTarget(null)}
                disabled={editBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={editBusy}
              >
                {editBusy ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Soft-remove confirmation */}
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &quot;{removeTarget?.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The student will be removed from the {course.code} roster, but
              their past attendance is preserved. You can restore them later at
              any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={removeBusy}
              onClick={(event) => {
                event.preventDefault();
                void handleRemove();
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {removeBusy ? "Removing..." : "Remove student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default RosterManager;
