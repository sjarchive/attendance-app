import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { json, badRequest, conflict, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// GET /api/programs — list all programs with counts (any signed-in user)
export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  try {
    const programs = await db.program.findMany({ orderBy: { name: "asc" } });
    const withCounts = await Promise.all(
      programs.map(async (p) => ({
        id: p.id,
        name: p.name,
        courseCount: await db.course.count({ where: { programId: p.id } }),
        studentCount: await db.student.count({ where: { programId: p.id } }),
      }))
    );
    return json({ programs: withCounts });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const programSchema = z.object({
  name: z.string().trim().min(2, "Program name is required").max(80),
});

// POST /api/programs — create program (admin only)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = programSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const exists = await db.program.findUnique({ where: { name: parsed.data.name } });
    if (exists) return conflict("A program with this name already exists");
    const program = await db.program.create({ data: { name: parsed.data.name } });
    await logAudit({
      action: "CREATE_PROGRAM",
      entityType: "program",
      entityId: program.id,
      entityLabel: program.name,
      actor: auth.user,
    });
    return json({ program }, 201);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
