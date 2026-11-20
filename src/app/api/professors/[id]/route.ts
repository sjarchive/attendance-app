import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, isErrorResponse } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { json, badRequest, conflict, notFound, serverError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be at most 40 characters")
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Only letters, numbers, dots, hyphens, and underscores are allowed")
    .optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72).optional(),
  active: z.boolean().optional(),
});

// PATCH /api/professors/:id — edit / reset password / enable-disable (admin only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (isErrorResponse(auth)) return auth.response;
  const { user: admin } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const data = parsed.data;

  if (admin.id === id && data.active === false) {
    return badRequest("You cannot disable your own account");
  }

  try {
    const professor = await db.professor.findUnique({ where: { id } });
    if (!professor) return notFound("Professor not found");

    if (data.username && data.username !== professor.username) {
      const duplicate = await db.professor.findUnique({ where: { username: data.username } });
      if (duplicate) return conflict("An account with this username already exists");
    }

    const updated = await db.professor.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.username ? { username: data.username } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
      select: { id: true, name: true, username: true, active: true },
    });

    // Audit trail — never log the password itself
    const changes: Record<string, unknown> = {};
    if (data.name && data.name !== professor.name) changes.name = { from: professor.name, to: data.name };
    if (data.username && data.username !== professor.username) changes.username = { from: professor.username, to: data.username };
    if (data.active !== undefined && data.active !== professor.active) changes.active = { from: professor.active, to: data.active };
    if (data.password) changes.passwordReset = true;
    if (Object.keys(changes).length > 0) {
      await logAudit({
        action: "UPDATE_PROFESSOR",
        entityType: "professor",
        entityId: updated.id,
        entityLabel: `${updated.name} <${updated.username}>`,
        details: changes,
        actor: auth.user,
      });
    }

    return json({ professor: updated });
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
