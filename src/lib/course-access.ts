import { db } from "@/lib/db";
import { notFound, forbidden } from "@/lib/api";
import type { SessionUser } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export type CourseWithProgram = Prisma.CourseGetPayload<{
  include: { program: { select: { name: true } } };
}>;

// PROFESSORs may only touch their own courses; ADMINs may touch everything.
export async function requireCourseAccess(
  user: SessionUser,
  courseId: string
): Promise<
  | { course: CourseWithProgram }
  | { response: ReturnType<typeof notFound> | ReturnType<typeof forbidden> }
> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    include: { program: { select: { name: true } } },
  });
  if (!course) return { response: notFound("Course not found") };
  if (user.role !== "ADMIN" && course.professorId !== user.id) {
    return { response: forbidden("You do not have access to this course") };
  }
  return { course };
}

export function isCourseAccessError(
  result: { course: CourseWithProgram } | { response: unknown }
): result is { response: unknown } {
  return "response" in result;
}
