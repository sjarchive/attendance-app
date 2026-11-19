"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CsvImportDialog } from "@/components/attendance/csv-import-dialog";
import {
  ArrowLeftIcon,
  PencilIcon,
  PlusIcon,
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
  CardAction,
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

export interface RosterManagerProps {
  course: CourseWithDetails;
  onChanged?: () => void;
  onBack?: () => void;
}

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

function sortRoster(students: RosterStudent[]): RosterStudent[] {
  return [...students].sort((a, b) =>
    a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }),
  );
}

export function RosterManager({
  course,
  onChanged,
  onBack,
}: RosterManagerProps) {
  const [students, setStudents] = useState<RosterStudent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, "Failed to load the roster"));
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

  const activeCount = students
    ? students.filter((student) => student.active).length
    : course.studentCount;

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
          await getErrorMessage(res, `Could not add "${name}" to the roster`),
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
          : `Could not add "${name}" to the roster`,
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
        },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not update the student"),
        );
      }
      setEditTarget(null);
      toast.success(`"${name}" updated`);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update the student",
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
        { method: "DELETE" },
      );
      if (!res.ok) {
        throw new Error(
          await getErrorMessage(res, "Could not remove the student"),
        );
      }
      toast.success(
        `"${removeTarget.name}" removed from the roster — attendance history kept`,
      );
      setRemoveTarget(null);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove the student",
      );
    } finally {
      setRemoveBusy(false);
    }
  }

  async function handleRestore(student: RosterStudent) {
    try {
      // Re-posting the same roll number re-activates the existing enrollment.
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
          await getErrorMessage(res, "Could not restore the student"),
        );
      }
      toast.success(`"${student.name}" restored to the roster`);
      await loadStudents();
      onChanged?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not restore the student",
      );
    }
  }

  const dialogBodyClass = "grid gap-4";

  return (
    <div className="flex flex-col gap-6">
      {/* Header: back navigation + course context */}
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeftIcon />
            Back
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge className="border-transparent bg-emerald-600 text-white">
            {course.code}
          </Badge>
          <h2 className="text-base font-semibold leading-none">
            {course.title}
          </h2>
          <Badge variant="secondary">{course.programName}</Badge>
          <Badge variant="outline" className="gap-1 font-normal">
            <UsersIcon />
            {activeCount} {activeCount === 1 ? "student" : "students"}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Student roster</CardTitle>
          <CardDescription>
            Add, edit, or soft-remove students. Removed students keep their
            attendance history and can be restored.
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <CsvImportDialog
              courseId={course.id}
              onImported={() => {
                void loadStudents();
                onChanged?.();
              }}
            />
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon />
              Add student
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          {students === null && loadError ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
              <p className="text-sm text-red-700 dark:text-red-300">
                {loadError}
              </p>
              <Button variant="outline" size="sm" onClick={() => void loadStudents()}>
                <RotateCcwIcon />
                Try again
              </Button>
            </div>
          ) : students === null ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
                <UsersIcon className="size-6" />
              </div>
              <p className="text-sm font-medium">No students yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                This course has an empty roster. Add the first student to start
                tracking attendance.
              </p>
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => setAddOpen(true)}
              >
                <PlusIcon />
                Add the first student
              </Button>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Roll No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Marked days</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow
                      key={student.studentId}
                      className={student.active ? undefined : "opacity-70"}
                    >
                      <TableCell className="font-mono text-sm">
                        {student.rollNo}
                      </TableCell>
                      <TableCell className="font-medium">
                        {student.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.markedDays}
                      </TableCell>
                      <TableCell>
                        {student.active ? (
                          <Badge className="border-transparent bg-emerald-600 text-white">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="border-transparent bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            Removed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {student.active ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(student)}
                              >
                                <PencilIcon />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                                onClick={() => setRemoveTarget(student)}
                              >
                                <Trash2Icon />
                                Remove
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:hover:bg-emerald-950"
                              onClick={() => void handleRestore(student)}
                            >
                              <RotateCcwIcon />
                              Restore
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
            className={dialogBodyClass}
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
                <PlusIcon />
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
            className={dialogBodyClass}
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
            <AlertDialogTitle>Remove &quot;{removeTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              The student will be removed from the {course.code} roster, but
              their past attendance is preserved. You can restore them later by
              re-adding the same roll number.
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
              <Trash2Icon />
              {removeBusy ? "Removing..." : "Remove student"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default RosterManager;
