import { db } from "@/lib/db";
import { notFound, forbidden } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import type { Course } from "@prisma/client";

// PROFESSORs may only touch their own courses; ADMINs may touch everything.
export async function requireCourseAccess(
  user: SessionUser,
  courseId: string
): Promise<{ course: Course } | { response: ReturnType<typeof notFound> | ReturnType<typeof forbidden> }> {
  const course = await db.course.findUnique({ where: { id: courseId } });
  if (!course) return { response: notFound("Course not found") };
  if (user.role !== "ADMIN" && course.professorId !== user.id) {
    return { response: forbidden("You do not have access to this course") };
  }
  return { course };
}

export function isCourseAccessError(
  result: { course: Course } | { response: unknown }
): result is { response: unknown } {
  return "response" in result;
}
