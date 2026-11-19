import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { requireCourseAccess, isCourseAccessError } from "@/lib/course-access";
import { json, badRequest, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { todayStr, APP_TIMEZONE } from "@/lib/date";
import { ATTENDANCE_STATUSES } from "@/lib/types";
import type { AttendanceLoadResponse, RosterStudent } from "@/lib/types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/attendance?courseId=...&date=YYYY-MM-DD
// Loads the roster + any existing records for that course/date, so re-opening
// a past date loads existing records for editing (plan Step 5).
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  const courseId = request.nextUrl.searchParams.get("courseId");
  const date = request.nextUrl.searchParams.get("date");
  if (!courseId) return badRequest("courseId is required");
  if (!date || !DATE_RE.test(date)) return badRequest("date must be YYYY-MM-DD");

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  try {
    const [enrollments, records] = await Promise.all([
      db.enrollment.findMany({
        where: { courseId, active: true },
        include: { student: true },
        orderBy: { student: { rollNo: "asc" } },
      }),
      db.attendanceRecord.findMany({ where: { courseId, date } }),
    ]);

    const roster: RosterStudent[] = enrollments.map((e) => ({
      studentId: e.studentId,
      rollNo: e.student.rollNo,
      name: e.student.name,
      active: e.active,
      markedDays: 0,
    }));

    const recordMap: Record<string, (typeof ATTENDANCE_STATUSES)[number]> = {};
    for (const r of records) {
      if ((ATTENDANCE_STATUSES as string[]).includes(r.status)) {
        recordMap[r.studentId] = r.status as (typeof ATTENDANCE_STATUSES)[number];
      }
    }

    const payload: AttendanceLoadResponse = {
      course: {
        id: course.id,
        code: course.code,
        title: course.title,
        programName: "", // filled by caller from courses list; kept simple
      },
      date,
      roster,
      records: recordMap,
    };
    return json(payload);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const saveSchema = z.object({
  courseId: z.string().min(1),
  date: z.string().regex(DATE_RE, "date must be YYYY-MM-DD"),
  records: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]),
      })
    )
    .min(1, "Nothing to save — mark at least one student"),
});

// POST /api/attendance — save (upsert) one row per student.
// The (courseId, studentId, date) unique constraint makes saving idempotent
// and re-editable (plan Step 5).
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

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { courseId, date, records } = parsed.data;

  // Block future dates (plan Step 5) — "today" in the department's timezone
  const today = todayStr();
  if (date > today) {
    return badRequest("Attendance cannot be marked for a future date");
  }

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  try {
    // Only students actively enrolled in this course can be marked
    const activeEnrollments = await db.enrollment.findMany({
      where: { courseId, active: true },
      select: { studentId: true },
    });
    const activeIds = new Set(activeEnrollments.map((e) => e.studentId));
    const validRecords = records.filter((r) => activeIds.has(r.studentId));

    if (validRecords.length === 0) {
      return badRequest("No active students in the submitted list");
    }

    // Snapshot existing records so the audit entry can describe the diff
    const existingRows = await db.attendanceRecord.findMany({
      where: { courseId, date },
      select: { studentId: true, status: true },
    });
    const existingMap = new Map(existingRows.map((r) => [r.studentId, r.status]));

    await db.$transaction(
      validRecords.map((r) =>
        db.attendanceRecord.upsert({
          where: {
            courseId_studentId_date: { courseId, studentId: r.studentId, date },
          },
          create: {
            courseId,
            studentId: r.studentId,
            date,
            status: r.status,
            markedById: user.id,
          },
          update: { status: r.status, markedById: user.id },
        })
      )
    );

    // Audit trail: who saved, what changed (Phase 2)
    const touched = await db.student.findMany({
      where: { id: { in: validRecords.map((r) => r.studentId) } },
      select: { id: true, rollNo: true, name: true },
    });
    const studentById = new Map(touched.map((s) => [s.id, s]));
    let createdCount = 0;
    const changed: { rollNo: string; name: string; from: string; to: string }[] = [];
    for (const r of validRecords) {
      const prior = existingMap.get(r.studentId);
      if (prior === undefined) {
        createdCount += 1;
      } else if (prior !== r.status) {
        const s = studentById.get(r.studentId);
        changed.push({
          rollNo: s?.rollNo ?? "?",
          name: s?.name ?? "?",
          from: prior,
          to: r.status,
        });
      }
    }
    await logAudit({
      action: "SAVE_ATTENDANCE",
      entityType: "attendance",
      entityId: `${courseId}:${date}`,
      entityLabel: `${course.code} · ${date}`,
      details: {
        date,
        created: createdCount,
        changed: changed.slice(0, 30),
        changedMore: Math.max(0, changed.length - 30),
        unchanged:
          validRecords.length - createdCount - changed.length,
      },
      actor: user,
      courseId,
    });

    return json({
      ok: true,
      saved: validRecords.length,
      date,
      courseCode: course.code,
      timezone: APP_TIMEZONE,
    });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
