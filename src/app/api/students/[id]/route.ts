import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { requireCourseAccess, isCourseAccessError } from "@/lib/course-access";
import { json, badRequest, conflict, notFound, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  name: z.string().trim().min(2, "Student name is required").max(80).optional(),
  rollNo: z.string().trim().min(1, "Roll number is required").max(20).optional(),
});

// PATCH /api/students/:id — edit student details (via a course the caller owns)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { courseId, name, rollNo } = parsed.data;

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;

  try {
    const enrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: id } },
    });
    if (!enrollment) {
      return notFound("This student is not on the course roster");
    }

    const student = await db.student.findUnique({ where: { id } });
    if (!student) return notFound("Student not found");

    if (rollNo && rollNo !== student.rollNo) {
      const duplicate = await db.student.findUnique({
        where: { programId_rollNo: { programId: student.programId, rollNo } },
      });
      if (duplicate && duplicate.id !== id) {
        return conflict("This roll number is already used in this program");
      }
    }

    const updated = await db.student.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(rollNo ? { rollNo } : {}),
      },
    });

    // Audit trail: name / roll number edits propagate across all courses
    if (updated.name !== student.name || updated.rollNo !== student.rollNo) {
      await logAudit({
        action: "EDIT_STUDENT",
        entityType: "student",
        entityId: updated.id,
        entityLabel: `${updated.name} (${updated.rollNo})`,
        details: {
          from: { name: student.name, rollNo: student.rollNo },
          to: { name: updated.name, rollNo: updated.rollNo },
          viaCourseId: courseId,
        },
        actor: user,
        courseId,
      });
    }

    return json({
      student: {
        studentId: updated.id,
        rollNo: updated.rollNo,
        name: updated.name,
        active: enrollment.active,
        markedDays: await db.attendanceRecord.count({
          where: { courseId, studentId: id },
        }),
      },
    });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

// DELETE /api/students/:id?courseId=... — soft-remove from course roster.
// Keeps past attendance rows; blocks future marking (plan Step 6).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;
  const { id } = await params;

  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId) return badRequest("courseId is required");

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;

  try {
    const enrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: id } },
      include: { student: true },
    });
    if (!enrollment) return notFound("This student is not on the course roster");

    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { active: false },
    });

    // Audit trail — soft-remove keeps past attendance rows (plan Step 6)
    await logAudit({
      action: "REMOVE_STUDENT",
      entityType: "student",
      entityId: enrollment.studentId,
      entityLabel: `${enrollment.student.name} (${enrollment.student.rollNo})`,
      details: { courseId, note: "Soft-removed; attendance history kept" },
      actor: user,
      courseId,
    });

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
