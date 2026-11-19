// Audit trail writer (Phase 2). Fire-and-forget from route handlers:
// a failed audit write must never fail the user's actual request.
import { db } from "@/lib/db";
import type { AuditEntityType } from "@/lib/types";

export interface AuditInput {
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  details?: unknown; // JSON-serializable; never include passwords
  actor: { id: string; name: string };
  courseId?: string | null;
}

export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        details: input.details === undefined ? null : JSON.stringify(input.details),
        actorId: input.actor.id,
        actorName: input.actor.name,
        courseId: input.courseId ?? null,
      },
    });
  } catch (e) {
    console.error("audit write failed", e);
  }
}
