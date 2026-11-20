// Server-side auth helpers for API routes.
// requireUser(): valid session AND account still active (DB check so that
// disabled accounts are locked out immediately, not just at token expiry).
// Professors/ADMINs are "staff"; students get a separate read-only role and
// are rejected by requireUser unless explicitly allowed.
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  verifySessionToken,
  sessionCookieName,
  type SessionPayload,
} from "@/lib/session";
import type { Role, SessionUser } from "@/lib/types";
import { unauthorized, forbidden } from "@/lib/api";

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  return verifySessionToken(token);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;

  if (payload.role === "STUDENT") {
    const student = await db.student.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, rollNo: true, username: true, passwordHash: true },
    });
    // Credentials revoked -> session no longer valid
    if (!student || !student.passwordHash) return null;
    return {
      id: student.id,
      name: student.name,
      username: student.username ?? "",
      role: "STUDENT",
    };
  }

  const professor = await db.professor.findUnique({
    where: { id: payload.sub },
    select: { id: true, name: true, username: true, role: true, active: true },
  });
  if (!professor || !professor.active) return null;
  return {
    id: professor.id,
    name: professor.name,
    username: professor.username,
    role: professor.role === "ADMIN" ? "ADMIN" : "PROFESSOR",
  };
}

/**
 * Guard an API route for specific roles. Defaults to staff-only
 * (PROFESSOR + ADMIN), which rejects student sessions.
 */
export async function requireUser(
  roles: Role[] = ["PROFESSOR", "ADMIN"]
): Promise<
  { user: SessionUser } | { response: ReturnType<typeof unauthorized> | ReturnType<typeof forbidden> }
> {
  const user = await getSessionUser();
  if (!user) {
    return { response: unauthorized("Your session has expired. Please sign in again.") };
  }
  if (!roles.includes(user.role)) {
    return { response: forbidden("You do not have permission to do this") };
  }
  return { user };
}

export async function requireAdmin(): Promise<
  { user: SessionUser } | { response: ReturnType<typeof unauthorized> | ReturnType<typeof forbidden> }
> {
  return requireUser(["ADMIN"]);
}

export function isErrorResponse(
  result: { user: SessionUser } | { response: unknown }
): result is { response: unknown } {
  return "response" in result;
}
