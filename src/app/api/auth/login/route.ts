import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import {
  createSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { badRequest } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid request body");
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { email, password } = parsed.data;

  // Rate limit per IP + email (plan Step 8)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = checkRateLimit(`login:${ip}:${email}`, 10, 5 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  const invalid = NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  // 1) Faculty login (PROFESSOR / ADMIN)
  const professor = await db.professor.findUnique({ where: { email } });
  if (professor && (await verifyPassword(password, professor.passwordHash))) {
    if (!professor.active) {
      return NextResponse.json(
        { error: "This account has been disabled. Please contact the administrator." },
        { status: 403 }
      );
    }
    const token = await createSessionToken(professor);
    const response = NextResponse.json({
      user: {
        id: professor.id,
        name: professor.name,
        email: professor.email,
        role: professor.role,
      },
    });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    return response;
  }

  // 2) Student login (read-only self-view, Phase 2)
  const student = await db.student.findUnique({ where: { email } });
  if (student && student.passwordHash && (await verifyPassword(password, student.passwordHash))) {
    const token = await createSessionToken({
      id: student.id,
      role: "STUDENT",
      name: student.name,
      email: student.email ?? email,
    });
    const response = NextResponse.json({
      user: {
        id: student.id,
        name: student.name,
        email: student.email ?? email,
        role: "STUDENT",
      },
    });
    response.cookies.set(sessionCookieName, token, sessionCookieOptions);
    return response;
  }

  return invalid;
}
