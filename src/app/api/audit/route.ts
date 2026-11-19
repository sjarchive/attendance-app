import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, isErrorResponse } from "@/lib/auth";
import { json, badRequest, serverError } from "@/lib/api";
import type { AuditEntry, AuditEntityType, AuditResponse } from "@/lib/types";

const ENTITY_TYPES: AuditEntityType[] = [
  "attendance",
  "student",
  "course",
  "program",
  "professor",
  "student_account",
];

// GET /api/audit — read the audit trail (Phase 2).
// ADMIN: everything, with optional entityType filter.
// PROFESSOR: only attendance entries for their own courses (the UI and the
// server both enforce the scope — a professor cannot browse other entities).
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (isErrorResponse(auth)) return auth.response;
  const { user } = auth;

  const sp = request.nextUrl.searchParams;
  const parsedLimit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .safeParse(sp.get("limit") ?? undefined);
  const parsedOffset = z.coerce
    .number()
    .int()
    .min(0)
    .default(0)
    .safeParse(sp.get("offset") ?? undefined);
  if (!parsedLimit.success || !parsedOffset.success) {
    return badRequest("Invalid pagination parameters");
  }
  const limit = parsedLimit.data;
  const offset = parsedOffset.data;

  const entityTypeParam = sp.get("entityType");
  const courseIdParam = sp.get("courseId");

  try {
    const where: {
      entityType?: string;
      courseId?: { in: string[] };
    } = {};

    if (user.role === "ADMIN") {
      if (entityTypeParam && ENTITY_TYPES.includes(entityTypeParam as AuditEntityType)) {
        where.entityType = entityTypeParam;
      }
      if (courseIdParam) {
        // Course-scoped read requires the courseId to belong to an existing course;
        // admins may read any course's entries.
        where.courseId = { in: [courseIdParam] };
      }
    } else {
      // PROFESSOR: attendance entries of own courses only
      const myCourses = await db.course.findMany({
        where: { professorId: user.id },
        select: { id: true },
      });
      const ids =
        courseIdParam && myCourses.some((c) => c.id === courseIdParam)
          ? [courseIdParam]
          : myCourses.map((c) => c.id);
      where.entityType = "attendance";
      where.courseId = { in: ids };
    }

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.auditLog.count({ where }),
    ]);

    const entries: AuditEntry[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: (ENTITY_TYPES.includes(r.entityType as AuditEntityType)
        ? r.entityType
        : "course") as AuditEntityType,
      entityId: r.entityId,
      entityLabel: r.entityLabel,
      details: r.details,
      actorName: r.actorName,
      createdAt: r.createdAt.toISOString(),
      courseId: r.courseId,
    }));

    const payload: AuditResponse = { entries, total };
    return json(payload);
  } catch (e) {
    console.error(e);
    return serverError();
  }
}
