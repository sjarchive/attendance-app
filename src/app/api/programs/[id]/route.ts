import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { json, badRequest, conflict, notFound, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const renameSchema = z.object({
  name: z.string().trim().min(2, "Program name is required").max(80),
});

// PATCH /api/programs/:id — rename (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const program = await db.program.findUnique({ where: { id } });
    if (!program) return notFound("Program not found");

    const duplicate = await db.program.findUnique({ where: { name: parsed.data.name } });
    if (duplicate && duplicate.id !== id) {
      return conflict("A program with this name already exists");
    }

    const updated = await db.program.update({ where: { id }, data: { name: parsed.data.name } });
    await logAudit({
      action: "UPDATE_PROGRAM",
      entityType: "program",
      entityId: updated.id,
      entityLabel: updated.name,
      details: { from: program.name, to: updated.name },
      actor: auth.user,
    });
    return json({ program: updated });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

// DELETE /api/programs/:id — guarded: only when it has no courses/students
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;
  const { id } = await params;

  try {
    const program = await db.program.findUnique({ where: { id } });
    if (!program) return notFound("Program not found");

    const [courseCount, studentCount] = await Promise.all([
      db.course.count({ where: { programId: id } }),
      db.student.count({ where: { programId: id } }),
    ]);
    if (courseCount > 0 || studentCount > 0) {
      return conflict(
        `Cannot delete: this program still has ${courseCount} course(s) and ${studentCount} student(s). Remove them first.`
      );
    }

    await db.program.delete({ where: { id } });
    await logAudit({
      action: "DELETE_PROGRAM",
      entityType: "program",
      entityId: program.id,
      entityLabel: program.name,
      actor: auth.user,
    });
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
