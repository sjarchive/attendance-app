import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, requireAdmin, isErrorResponse } from "@/lib/auth";
import { json, badRequest, conflict, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { todayStr } from "@/lib/date";
import type { CourseWithDetails } from "@/lib/types";

// GET /api/courses — professor: own courses; admin: all courses
export async function GET() {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  try {
    const today = todayStr();
    const courseWhere = user.role === "ADMIN" ? {} : { professorId: user.id };
    // Course list, unique headcount, and today's attendance counts run in parallel.
    const [courses, uniqueStudents, todayCounts] = await Promise.all([
      db.course.findMany({
        where: courseWhere,
        include: {
          program: true,
          professor: true,
          _count: { select: { enrollments: { where: { active: true } } } },
        },
        orderBy: [{ program: { name: "asc" } }, { code: "asc" }],
      }),
      // UNIQUE student headcount — NOT the sum of per-course enrollment counts
      // (students enrolled in 2+ courses would be double-counted).
      user.role === "ADMIN"
        ? db.student.count()
        : db.student.count({
            where: {
              enrollments: {
                some: { active: true, course: { professorId: user.id } },
              },
            },
          }),
      db.attendanceRecord.groupBy({
        by: ["courseId", "status"],
        where: {
          date: today,
          ...(user.role === "ADMIN" ? {} : { course: { professorId: user.id } }),
        },
        _count: { _all: true },
      }),
    ]);

    const todaySummary = new Map<string, { marked: number; present: number }>();
    for (const row of todayCounts) {
      const curr = todaySummary.get(row.courseId) ?? { marked: 0, present: 0 };
      curr.marked += row._count._all;
      if (row.status === "PRESENT") curr.present += row._count._all;
      todaySummary.set(row.courseId, curr);
    }

    const payload: CourseWithDetails[] = courses.map((c) => {
      const t = todaySummary.get(c.id);
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        programId: c.programId,
        programName: c.program.name,
        professorId: c.professorId,
        professorName: c.professor.name,
        studentCount: c._count.enrollments,
        todayMarkedCount: t?.marked ?? 0,
        todayPresentCount: t?.present ?? 0,
      };
    });
    return json({ courses: payload, stats: { students: uniqueStudents } });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const courseSchema = z.object({
  code: z.string().trim().min(2, "Course code is required").max(20),
  title: z.string().trim().min(2, "Course title is required").max(120),
  programId: z.string().min(1, "Select a program"),
  professorId: z.string().min(1, "Assign a professor"),
});

// POST /api/courses — create course (admin only)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = courseSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { code, title, programId, professorId } = parsed.data;

  try {
    const program = await db.program.findUnique({ where: { id: programId } });
    if (!program) return badRequest("Selected program does not exist");

    const professor = await db.professor.findUnique({ where: { id: professorId } });
    if (!professor || !professor.active) {
      return badRequest("Selected professor does not exist or is disabled");
    }

    const duplicate = await db.course.findUnique({
      where: { programId_code: { programId, code } },
    });
    if (duplicate) {
      return conflict(`Course code ${code} already exists in ${program.name}`);
    }

    const course = await db.course.create({
      data: { code, title, programId, professorId },
    });
    await logAudit({
      action: "CREATE_COURSE",
      entityType: "course",
      entityId: course.id,
      entityLabel: `${course.code} · ${course.title}`,
      details: { programId, professorId, programName: program.name },
      actor: auth.user,
      courseId: course.id,
    });
    return json({ course }, 201);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
