import { db } from "@/lib/db";
import { getSessionPayload } from "@/lib/auth";
import { json, serverError } from "@/lib/api";
import { todayStr } from "@/lib/date";
import type { CourseWithDetails, SessionUser } from "@/lib/types";

// GET /api/boot — single round trip for app startup.
// Returns the session user (or null) and, for staff, the course list.
// Replaces the old serial /api/auth/me -> /api/courses chain: one request,
// one route module to compile, and the DB work runs in parallel.
export async function GET() {
  try {
    const payload = await getSessionPayload();
    if (!payload) return json({ user: null, courses: [] });

    if (payload.role === "STUDENT") {
      // Credentials revoked -> treat as signed out
      const student = await db.student.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, username: true, passwordHash: true },
      });
      if (!student || !student.passwordHash) return json({ user: null, courses: [] });
      const user: SessionUser = {
        id: student.id,
        name: student.name,
        username: student.username ?? "",
        role: "STUDENT",
      };
      return json({ user, courses: [] });
    }

    const today = todayStr();
    // Staff: active-check, course fetch, headcount, and today's attendance run in parallel.
    const [professor, courses, uniqueStudents, todayCounts] = await Promise.all([
      db.professor.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, username: true, role: true, active: true },
      }),
      db.course.findMany({
        where: payload.role === "ADMIN" ? {} : { professorId: payload.sub },
        include: {
          program: true,
          professor: true,
          _count: { select: { enrollments: { where: { active: true } } } },
        },
        orderBy: [{ program: { name: "asc" } }, { code: "asc" }],
      }),
      // UNIQUE student headcount — NOT the sum of per-course enrollment counts,
      // which would double-count every student enrolled in 2+ courses.
      payload.role === "ADMIN"
        ? db.student.count()
        : db.student.count({
            where: {
              enrollments: {
                some: { active: true, course: { professorId: payload.sub } },
              },
            },
          }),
      db.attendanceRecord.groupBy({
        by: ["courseId", "status"],
        where: {
          date: today,
          ...(payload.role === "ADMIN" ? {} : { course: { professorId: payload.sub } }),
        },
        _count: { _all: true },
      }),
    ]);

    if (!professor || !professor.active) return json({ user: null, courses: [] });

    const user: SessionUser = {
      id: professor.id,
      name: professor.name,
      username: professor.username,
      role: professor.role === "ADMIN" ? "ADMIN" : "PROFESSOR",
    };

    const todaySummary = new Map<string, { marked: number; present: number }>();
    for (const row of todayCounts) {
      const curr = todaySummary.get(row.courseId) ?? { marked: 0, present: 0 };
      curr.marked += row._count._all;
      if (row.status === "PRESENT") curr.present += row._count._all;
      todaySummary.set(row.courseId, curr);
    }

    const courseList: CourseWithDetails[] = courses.map((c) => {
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

    return json({ user, courses: courseList, stats: { students: uniqueStudents } });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
