import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { json, badRequest, conflict, notFound, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  code: z.string().trim().min(2).max(20).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  programId: z.string().min(1).optional(),
  professorId: z.string().min(1).optional(),
});

// PATCH /api/courses/:id — edit course (admin only)
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const data = parsed.data;

  try {
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return notFound("Course not found");

    if (data.programId) {
      const program = await db.program.findUnique({ where: { id: data.programId } });
      if (!program) return badRequest("Selected program does not exist");
    }
    if (data.professorId) {
      const professor = await db.professor.findUnique({ where: { id: data.professorId } });
      if (!professor || !professor.active) {
        return badRequest("Selected professor does not exist or is disabled");
      }
    }

    const code = data.code ?? course.code;
    const programId = data.programId ?? course.programId;
    const duplicate = await db.course.findUnique({
      where: { programId_code: { programId, code } },
    });
    if (duplicate && duplicate.id !== id) {
      return conflict(`Course code ${code} already exists in this program`);
    }

    const updated = await db.course.update({ where: { id }, data });
    await logAudit({
      action: "UPDATE_COURSE",
      entityType: "course",
      entityId: updated.id,
      entityLabel: `${updated.code} · ${updated.title}`,
      details: {
        from: { code: course.code, title: course.title, programId: course.programId, professorId: course.professorId },
        to: { code: updated.code, title: updated.title, programId: updated.programId, professorId: updated.professorId },
      },
      actor: auth.user,
      courseId: updated.id,
    });
    return json({ course: updated });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

// DELETE /api/courses/:id — removes course; enrollments + attendance cascade
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;
  const { id } = await params;

  try {
    const course = await db.course.findUnique({ where: { id } });
    if (!course) return notFound("Course not found");
    await db.course.delete({ where: { id } });
    await logAudit({
      action: "DELETE_COURSE",
      entityType: "course",
      entityId: course.id,
      entityLabel: `${course.code} · ${course.title}`,
      details: { note: "Course deleted; enrollments and attendance history removed" },
      actor: auth.user,
    });
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
