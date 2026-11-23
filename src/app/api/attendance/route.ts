import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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
      db.attendanceRecord.findMany({
        where: { courseId, date },
        select: { studentId: true, status: true },
      }),
    ]);

    const roster: RosterStudent[] = enrollments
      .map((e) => ({
        studentId: e.studentId,
        rollNo: e.student.rollNo,
        name: e.student.name,
        active: e.active,
        markedDays: 0,
      }))
      .sort((a, b) =>
        a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true })
      );

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
        programName: course.program.name,
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

const saveSchema = z
  .object({
    courseId: z.string().min(1),
    date: z.string().regex(DATE_RE, "date must be YYYY-MM-DD"),
    records: z
      .array(
        z.object({
          studentId: z.string().min(1),
          status: z.enum(["PRESENT", "ABSENT", "LATE", "LEAVE"]),
        })
      )
      .default([]),
    clearedStudentIds: z.array(z.string().min(1)).optional().default([]),
  })
  .refine(
    (data) => data.records.length > 0 || data.clearedStudentIds.length > 0,
    { message: "Nothing to save — mark or clear at least one student" }
  );

// POST /api/attendance — upsert marked students and delete cleared students.
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
  const { courseId, date, records, clearedStudentIds } = parsed.data;

  const today = todayStr();
  if (date > today) {
    return badRequest("Attendance cannot be marked for a future date");
  }

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  try {
    const [activeEnrollments, existingRows] = await Promise.all([
      db.enrollment.findMany({
        where: { courseId, active: true },
        select: { studentId: true },
      }),
      db.attendanceRecord.findMany({
        where: { courseId, date },
        select: { studentId: true, status: true },
      }),
    ]);

    const activeIds = new Set(activeEnrollments.map((e) => e.studentId));
    const validRecords = records.filter((r) => activeIds.has(r.studentId));
    const markedIdSet = new Set(validRecords.map((r) => r.studentId));
    const validClearedIds = Array.from(
      new Set(
        clearedStudentIds.filter(
          (id) => activeIds.has(id) && !markedIdSet.has(id)
        )
      )
    );

    if (validRecords.length === 0 && validClearedIds.length === 0) {
      return badRequest("No active students in the submitted list");
    }

    const existingMap = new Map(existingRows.map((r) => [r.studentId, r.status]));
    const touchedIds = Array.from(
      new Set([...validRecords.map((r) => r.studentId), ...validClearedIds])
    );

    const touchedPromise = db.student.findMany({
      where: { id: { in: touchedIds } },
      select: { id: true, rollNo: true, name: true },
    });

    // Store DateTime columns as ISO-8601 TEXT matching @prisma/adapter-d1 format
    const nowIso = new Date().toISOString();
    const mutations: Promise<unknown>[] = [];

    if (validRecords.length > 0) {
      const valueRows = validRecords.map((r) =>
        Prisma.sql`(${r.studentId}, ${r.status})`
      );
      mutations.push(
        db.$executeRaw`
          INSERT INTO "attendance"
            ("id", "courseId", "studentId", "date", "status", "markedById", "createdAt", "updatedAt")
          SELECT lower(hex(randomblob(16))), ${courseId}, v.column1, ${date}, v.column2, ${user.id},
                 ${nowIso}, ${nowIso}
          FROM (VALUES ${Prisma.join(valueRows)}) AS v
          WHERE true
          ON CONFLICT ("courseId", "studentId", "date")
          DO UPDATE SET "status" = EXCLUDED."status",
                        "markedById" = EXCLUDED."markedById",
                        "updatedAt" = ${nowIso}
        `
      );
    }

    if (validClearedIds.length > 0) {
      mutations.push(
        db.attendanceRecord.deleteMany({
          where: {
            courseId,
            date,
            studentId: { in: validClearedIds },
          },
        })
      );
    }

    const [touched] = await Promise.all([touchedPromise, ...mutations]);

    const studentById = new Map(touched.map((s) => [s.id, s]));
    let createdCount = 0;
    let clearedCount = 0;
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

    for (const studentId of validClearedIds) {
      const prior = existingMap.get(studentId);
      if (prior !== undefined) {
        clearedCount += 1;
        const s = studentById.get(studentId);
        changed.push({
          rollNo: s?.rollNo ?? "?",
          name: s?.name ?? "?",
          from: prior,
          to: "UNMARKED",
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
        cleared: clearedCount,
        changed: changed.slice(0, 30),
        changedMore: Math.max(0, changed.length - 30),
        unchanged:
          validRecords.length - createdCount - (changed.length - clearedCount),
      },
      actor: user,
      courseId,
    });

    return json({
      ok: true,
      saved: validRecords.length,
      cleared: clearedCount,
      date,
      courseCode: course.code,
      timezone: APP_TIMEZONE,
    });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
