import { db } from "@/lib/db";
import { getSessionPayload } from "@/lib/auth";
import { json, serverError } from "@/lib/api";
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

    // Staff: active-check, course fetch and the unique headcount are all
    // independent (the course filter only needs the id from the signed token),
    // so run them in parallel.
    const [professor, courses, uniqueStudents] = await Promise.all([
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
    ]);

    if (!professor || !professor.active) return json({ user: null, courses: [] });

    const user: SessionUser = {
      id: professor.id,
      name: professor.name,
      username: professor.username,
      role: professor.role === "ADMIN" ? "ADMIN" : "PROFESSOR",
    };

    const courseList: CourseWithDetails[] = courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      programId: c.programId,
      programName: c.program.name,
      professorId: c.professorId,
      professorName: c.professor.name,
      studentCount: c._count.enrollments,
    }));

    return json({ user, courses: courseList, stats: { students: uniqueStudents } });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
