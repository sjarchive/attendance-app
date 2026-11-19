import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { json, serverError } from "@/lib/api";
import type { MyAttendanceResponse, StudentCourseSummary } from "@/lib/types";

// GET /api/me/attendance — read-only view of the signed-in student's own
// attendance across every course they were ever enrolled in (Phase 2).
export async function GET() {
  const auth = await requireUser(["STUDENT"]);
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  try {
    const student = await db.student.findUnique({
      where: { id: user.id },
      include: { program: true },
    });
    if (!student) return json({ error: "Student not found" }, 404);

    const enrollments = await db.enrollment.findMany({
      where: { studentId: student.id },
      include: { course: true },
      orderBy: { course: { code: "asc" } },
    });

    const records = await db.attendanceRecord.findMany({
      where: { studentId: student.id },
      select: { courseId: true, date: true, status: true },
      orderBy: { date: "desc" },
    });

    const byCourse = new Map<
      string,
      {
        PRESENT: number;
        ABSENT: number;
        LATE: number;
        LEAVE: number;
        last: string | null;
      }
    >();
    let totalMarked = 0;
    let totalPresent = 0;

    for (const r of records) {
      const s = byCourse.get(r.courseId) ?? {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        LEAVE: 0,
        last: null as string | null,
      };
      if (
        r.status === "PRESENT" ||
        r.status === "ABSENT" ||
        r.status === "LATE" ||
        r.status === "LEAVE"
      ) {
        s[r.status] += 1;
      }
      if (s.last === null || r.date > s.last) s.last = r.date;
      byCourse.set(r.courseId, s);
      totalMarked += 1;
      if (r.status === "PRESENT") totalPresent += 1;
    }

    const courses: StudentCourseSummary[] = enrollments.map((e) => {
      const s = byCourse.get(e.courseId) ?? {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        LEAVE: 0,
        last: null,
      };
      const marked = s.PRESENT + s.ABSENT + s.LATE + s.LEAVE;
      return {
        courseId: e.courseId,
        code: e.course.code,
        title: e.course.title,
        active: e.active,
        marked,
        present: s.PRESENT,
        absent: s.ABSENT,
        late: s.LATE,
        leave: s.LEAVE,
        percentage: marked === 0 ? 0 : Math.round((s.PRESENT / marked) * 1000) / 10,
        lastMarked: s.last,
      };
    });

    const payload: MyAttendanceResponse = {
      student: {
        name: student.name,
        rollNo: student.rollNo,
        programName: student.program.name,
      },
      overall: {
        marked: totalMarked,
        present: totalPresent,
        percentage:
          totalMarked === 0
            ? 0
            : Math.round((totalPresent / totalMarked) * 1000) / 10,
      },
      courses,
    };
    return json(payload);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
