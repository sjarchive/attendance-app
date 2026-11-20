import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { json, badRequest, conflict, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import type { ProfessorAccount } from "@/lib/types";

// GET /api/professors — list accounts (admin only)
export async function GET() {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  try {
    const professors = await db.professor.findMany({
      include: { _count: { select: { courses: true } } },
      orderBy: { name: "asc" },
    });
    const payload: ProfessorAccount[] = professors.map((p) => ({
      id: p.id,
      name: p.name,
      username: p.username,
      role: p.role === "ADMIN" ? "ADMIN" : "PROFESSOR",
      active: p.active,
      courseCount: p._count.courses,
      createdAt: p.createdAt.toISOString(),
    }));
    return json({ professors: payload });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be at most 40 characters")
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Only letters, numbers, dots, hyphens, and underscores are allowed"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["PROFESSOR", "ADMIN"]),
});

// POST /api/professors — create account (admin only, plan Step 7)
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { name, username, password, role } = parsed.data;

  try {
    const exists = await db.professor.findUnique({ where: { username } });
    if (exists) return conflict("An account with this username already exists");

    const professor = await db.professor.create({
      data: { name, username, passwordHash: await hashPassword(password), role },
    });
    await logAudit({
      action: "CREATE_PROFESSOR",
      entityType: "professor",
      entityId: professor.id,
      entityLabel: `${professor.name} <${professor.username}>`,
      details: { role },
      actor: auth.user,
    });
    return json(
      { professor: { id: professor.id, name: professor.name, username: professor.username } },
      201
    );
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
