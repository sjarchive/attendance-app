import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { json, badRequest, conflict, notFound, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import type { StudentAccountView } from "@/lib/types";

// GET /api/student-accounts?programId=... — students of a program with their
// self-view credential status (admin only, Phase 2)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  const programId = request.nextUrl.searchParams.get("programId");
  if (!programId) return badRequest("programId is required");

  try {
    const students = await db.student.findMany({
      where: { programId },
      include: {
        _count: { select: { enrollments: { where: { active: true } } } },
      },
      orderBy: { rollNo: "asc" },
    });

    const payload: StudentAccountView[] = students.map((s) => ({
      id: s.id,
      rollNo: s.rollNo,
      name: s.name,
      email: s.email,
      hasPassword: Boolean(s.passwordHash),
      activeEnrollments: s._count.enrollments,
    }));
    return json({ students: payload });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const patchSchema = z.object({
  studentId: z.string().min(1),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .or(z.literal(""))
    .optional(),
  password: z.string().min(6, "Password must be at least 6 characters").max(72).optional(),
});

// PATCH /api/student-accounts — set or revoke a student's self-view
// credentials (admin only). Send email: "" to clear the email.
export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

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
  const { studentId, email, password } = parsed.data;

  try {
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (!student) return notFound("Student not found");

    if (email !== undefined && email !== "") {
      const clashStudent = await db.student.findUnique({ where: { email } });
      if (clashStudent && clashStudent.id !== studentId) {
        return conflict("This email is already used by another student");
      }
      const clashProfessor = await db.professor.findUnique({ where: { email } });
      if (clashProfessor) {
        return conflict("This email is already used by a faculty account");
      }
    }

    const updated = await db.student.update({
      where: { id: studentId },
      data: {
        ...(email !== undefined ? { email: email === "" ? null : email } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: { id: true, rollNo: true, name: true, email: true, passwordHash: true },
    });

    await logAudit({
      action: "SET_STUDENT_CREDENTIALS",
      entityType: "student_account",
      entityId: updated.id,
      entityLabel: `${updated.name} (${updated.rollNo})`,
      details: {
        emailSet: updated.email,
        passwordSet: Boolean(updated.passwordHash),
      },
      actor: auth.user,
    });

    const view: StudentAccountView = {
      id: updated.id,
      rollNo: updated.rollNo,
      name: updated.name,
      email: updated.email,
      hasPassword: Boolean(updated.passwordHash),
      activeEnrollments: await db.enrollment.count({
        where: { studentId: studentId, active: true },
      }),
    };
    return json({ student: view });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const bulkSchema = z.object({ programId: z.string().min(1) });

// POST /api/student-accounts — bulk-enable self-view logins for a program
// (admin only). Students without credentials get email = rollno@student.dept.edu
// and password = their roll number, so the HoD can announce the pattern.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { programId } = parsed.data;

  try {
    const program = await db.program.findUnique({ where: { id: programId } });
    if (!program) return notFound("Program not found");

    const students = await db.student.findMany({
      where: { programId, passwordHash: null },
    });

    let enabled = 0;
    const skipped: string[] = [];

    for (const s of students) {
      const email = `${s.rollNo.toLowerCase()}@student.dept.edu`;
      const clash =
        (await db.student.findUnique({ where: { email } })) ??
        (await db.professor.findUnique({ where: { email } }));
      if (clash) {
        skipped.push(s.rollNo);
        continue;
      }
      await db.student.update({
        where: { id: s.id },
        data: { email, passwordHash: await hashPassword(s.rollNo) },
      });
      enabled += 1;
    }

    await logAudit({
      action: "BULK_ENABLE_STUDENT_LOGINS",
      entityType: "student_account",
      entityId: programId,
      entityLabel: program.name,
      details: { enabled, skipped },
      actor: auth.user,
    });

    return json({
      enabled,
      skipped,
      programName: program.name,
      pattern: "email = rollno@student.dept.edu, password = roll number",
    });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
