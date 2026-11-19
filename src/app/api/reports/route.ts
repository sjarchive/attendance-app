import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { requireCourseAccess, isCourseAccessError } from "@/lib/course-access";
import { json, badRequest, serverError } from "@/lib/api";
import { csvEscape } from "@/lib/csv";
import { todayStr } from "@/lib/date";
import type { ReportResponse, ReportRow } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/reports?courseId=&from=&to=&format=json|csv
// Attendance percentage per student for a course over a date range (Phase 2).
// Percentage = Present / total marked days (Late, Leave and Absent count as
// non-present; counts are shown so the numbers stay transparent).
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  const sp = request.nextUrl.searchParams;
  const courseId = sp.get("courseId");
  if (!courseId) return badRequest("courseId is required");

  const from = sp.get("from");
  const to = sp.get("to");
  const format = sp.get("format") === "csv" ? "csv" : "json";

  if (from && !DATE_RE.test(from)) return badRequest("from must be YYYY-MM-DD");
  if (to && !DATE_RE.test(to)) return badRequest("to must be YYYY-MM-DD");
  if (from && to && from > to) return badRequest("'from' date must be before 'to' date");

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  try {
    const dateFilter: { gte?: string; lte?: string } = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lte = to;

    const records = await db.attendanceRecord.findMany({
      where: { courseId, ...(from || to ? { date: dateFilter } : {}) },
      select: { studentId: true, date: true, status: true },
    });

    // Students = active enrollments + anyone with records in range
    const enrollments = await db.enrollment.findMany({
      where: { courseId },
      include: { student: true },
      orderBy: { student: { rollNo: "asc" } },
    });

    const stats = new Map<
      string,
      Record<"PRESENT" | "ABSENT" | "LATE" | "LEAVE", number>
    >();
    const markedDates = new Set<string>();
    let totalMarked = 0;
    let totalPresent = 0;

    for (const r of records) {
      markedDates.add(r.date);
      const s = stats.get(r.studentId) ?? {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        LEAVE: 0,
      };
      if (r.status === "PRESENT" || r.status === "ABSENT" || r.status === "LATE" || r.status === "LEAVE") {
        s[r.status] += 1;
      }
      stats.set(r.studentId, s);
      totalMarked += 1;
      if (r.status === "PRESENT") totalPresent += 1;
    }

    const studentIds = new Set([
      ...stats.keys(),
      ...enrollments.filter((e) => e.active).map((e) => e.studentId),
    ]);

    const rows: ReportRow[] = enrollments
      .filter((e) => studentIds.has(e.studentId))
      .map((e) => {
        const s = stats.get(e.studentId) ?? {
          PRESENT: 0,
          ABSENT: 0,
          LATE: 0,
          LEAVE: 0,
        };
        const total = s.PRESENT + s.ABSENT + s.LATE + s.LEAVE;
        return {
          studentId: e.studentId,
          rollNo: e.student.rollNo,
          name: e.student.name,
          active: e.active,
          present: s.PRESENT,
          absent: s.ABSENT,
          late: s.LATE,
          leave: s.LEAVE,
          total,
          percentage: total === 0 ? 0 : Math.round((s.PRESENT / total) * 1000) / 10,
        };
      })
      .sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));

    const payload: ReportResponse = {
      course: {
        id: course.id,
        code: course.code,
        title: course.title,
        programName: "",
      },
      from: from ?? null,
      to: to ?? null,
      rows,
      summary: {
        classAverage:
          totalMarked === 0
            ? 0
            : Math.round((totalPresent / totalMarked) * 1000) / 10,
        markedDays: markedDates.size,
        studentsCounted: rows.length,
        totalMarked,
        totalPresent,
      },
    };

    if (format === "csv") {
      const header = [
        "Roll No",
        "Name",
        "Status",
        "Present",
        "Absent",
        "Late",
        "Leave",
        "Marked Days",
        "Percentage",
      ];
      const lines = [header.map(csvEscape).join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.rollNo,
            r.name,
            r.active ? "Active" : "Removed",
            r.present,
            r.absent,
            r.late,
            r.leave,
            r.total,
            `${r.percentage}%`,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      const stamp = `${from ?? "start"}_to_${to ?? todayStr()}`;
      return new Response(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="attendance-${course.code}-${stamp}.csv"`,
        },
      });
    }

    return json(payload);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
