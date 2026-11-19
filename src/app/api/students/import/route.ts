import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { requireCourseAccess, isCourseAccessError } from "@/lib/course-access";
import { json, badRequest, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { parseRosterCsv } from "@/lib/csv";
import type { ImportSummary } from "@/lib/types";

const importSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  csv: z.string().min(1, "CSV content is empty").max(200_000, "CSV is too large"),
});

// POST /api/students/import — bulk-add a roster from CSV (Phase 2).
// Two columns per line: roll number, name. Header row optional.
// Existing students in the program are (re)enrolled; soft-removed
// enrollments are re-activated; names are corrected if they differ.
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

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { courseId } = parsed.data;

  const access = await requireCourseAccess(user, courseId);
  if (isCourseAccessError(access)) return access.response;
  const { course } = access;

  const { rows, errors } = parseRosterCsv(parsed.data.csv);

  const summary: ImportSummary = {
    totalRows: rows.length,
    created: 0,
    reactivated: 0,
    updated: 0,
    skipped: 0,
    errors: errors.slice(0, 50),
  };

  if (rows.length === 0) {
    return json({ summary, message: "No valid rows found in the CSV" });
  }

  try {
    for (const row of rows) {
      let student = await db.student.findUnique({
        where: {
          programId_rollNo: { programId: course.programId, rollNo: row.rollNo },
        },
      });

      if (!student) {
        student = await db.student.create({
          data: { rollNo: row.rollNo, name: row.name, programId: course.programId },
        });
        summary.created += 1;
      } else if (student.name !== row.name) {
        student = await db.student.update({
          where: { id: student.id },
          data: { name: row.name },
        });
        summary.updated += 1;
      }

      const prior = await db.enrollment.findUnique({
        where: { courseId_studentId: { courseId, studentId: student.id } },
      });
      if (!prior) {
        await db.enrollment.create({
          data: { courseId, studentId: student.id, active: true },
        });
      } else if (!prior.active) {
        await db.enrollment.update({
          where: { id: prior.id },
          data: { active: true },
        });
        summary.reactivated += 1;
      }
    }

    await logAudit({
      action: "IMPORT_STUDENTS",
      entityType: "student",
      entityId: course.id,
      entityLabel: `${course.code} · CSV import`,
      details: {
        totalRows: summary.totalRows,
        created: summary.created,
        updated: summary.updated,
        reactivated: summary.reactivated,
        parseErrors: errors.length,
      },
      actor: user,
      courseId,
    });

    return json({ summary });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
