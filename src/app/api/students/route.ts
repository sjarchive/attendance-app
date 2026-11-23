import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { requireCourseAccess, isCourseAccessError } from "@/lib/course-access";
import { json, badRequest, conflict, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import type { RosterStudent } from "@/lib/types";

// GET /api/students?courseId=... — course roster incl. soft-removed students
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  const courseId = request.nextUrl.searchParams.get("courseId");
  if (!courseId) return badRequest("courseId is required");

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;

  try {
    const enrollments = await db.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          include: { _count: { select: { attendance: { where: { courseId } } } } },
        },
      },
      orderBy: { student: { rollNo: "asc" } },
    });

    const students: RosterStudent[] = enrollments
      .map((e) => ({
        studentId: e.studentId,
        rollNo: e.student.rollNo,
        name: e.student.name,
        active: e.active,
        markedDays: e.student._count.attendance,
      }))
      .sort((a, b) =>
        a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })
      );
    return json({ students });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const createSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  rollNo: z.string().trim().min(1, "Roll number is required").max(20, "Roll number is too long"),
  name: z.string().trim().min(2, "Student name is required").max(80),
});

// POST /api/students — add student to a course roster.
// If a student with the same roll no already exists in the course's program,
// (re)enroll them; otherwise create the student. Re-adding a soft-removed
// student re-activates their enrollment.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { courseId, rollNo, name } = parsed.data;

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  try {
    let student = await db.student.findUnique({
      where: { programId_rollNo: { programId: course.programId, rollNo } },
    });
    const studentIsNew = !student;
    let nameCorrected = false;
    if (!student) {
      student = await db.student.create({
        data: { rollNo, name, programId: course.programId },
      });
    } else if (student.name !== name) {
      student = await db.student.update({ where: { id: student.id }, data: { name } });
      nameCorrected = true;
    }

    const priorEnrollment = await db.enrollment.findUnique({
      where: { courseId_studentId: { courseId, studentId: student.id } },
    });
    const isNewEnrollment = !priorEnrollment;
    const wasInactive = priorEnrollment ? !priorEnrollment.active : false;
    if (priorEnrollment && priorEnrollment.active && !nameCorrected) {
      return conflict(`Roll number ${rollNo} is already on this course roster`);
    }

    const enrollment = await db.enrollment.upsert({
      where: { courseId_studentId: { courseId, studentId: student.id } },
      create: { courseId, studentId: student.id, active: true },
      update: { active: true },
    });

    // Audit trail
    if (isNewEnrollment) {
      await logAudit({
        action: "ADD_STUDENT",
        entityType: "student",
        entityId: student.id,
        entityLabel: `${student.name} (${student.rollNo})`,
        details: { courseId, courseCode: course.code, studentIsNew },
        actor: user,
        courseId,
      });
    } else if (wasInactive) {
      await logAudit({
        action: "RESTORE_STUDENT",
        entityType: "student",
        entityId: student.id,
        entityLabel: `${student.name} (${student.rollNo})`,
        details: { courseId, courseCode: course.code },
        actor: user,
        courseId,
      });
    } else if (nameCorrected) {
      await logAudit({
        action: "EDIT_STUDENT",
        entityType: "student",
        entityId: student.id,
        entityLabel: `${student.name} (${student.rollNo})`,
        details: { courseId, note: "Name corrected during re-add" },
        actor: user,
        courseId,
      });
    }

    const markedDays = await db.attendanceRecord.count({
      where: { courseId, studentId: student.id },
    });

    return json(
      {
        student: {
          studentId: student.id,
          rollNo: student.rollNo,
          name: student.name,
          active: enrollment.active,
          markedDays,
        } satisfies RosterStudent,
      },
      201
    );
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
