"use client";

import { useMemo } from "react";
import {
  BookOpen,
  CalendarCheck,
  GraduationCap,
  Layers,
  Loader2,
  Users,
  UserRound,
  ShieldCheck,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { CourseWithDetails, SessionUser } from "@/lib/types";

interface DashboardProps {
  user: SessionUser;
  courses: CourseWithDetails[];
  loading: boolean;
  onMarkAttendance: (course: CourseWithDetails) => void;
  onManageRoster: (course: CourseWithDetails) => void;
  onViewReports: (course: CourseWithDetails) => void;
  onRefresh: () => void;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function Dashboard({
  user,
  courses,
  loading,
  onMarkAttendance,
  onManageRoster,
  onViewReports,
  onRefresh,
}: DashboardProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, CourseWithDetails[]>();
    for (const course of courses) {
      const list = map.get(course.programName) ?? [];
      list.push(course);
      map.set(course.programName, list);
    }
    return Array.from(map.entries());
  }, [courses]);

  const totalStudents = useMemo(
    () => courses.reduce((sum, c) => sum + c.studentCount, 0),
    [courses]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greeting()}, {user.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.role === "ADMIN"
              ? "You are viewing every course in the department."
              : "Select a course to mark today's attendance or manage its roster."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            {loading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <p className="text-lg font-semibold leading-none sm:text-xl">
                {grouped.length}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Programs</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </div>
            {loading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <p className="text-lg font-semibold leading-none sm:text-xl">
                {courses.length}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Courses</p>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            {loading ? (
              <Skeleton className="h-6 w-10" />
            ) : (
              <p className="text-lg font-semibold leading-none sm:text-xl">
                {totalStudents}
              </p>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Students</p>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-7 w-44" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        </div>
      ) : courses.length === 0 ? (
        <Card className="p-10 text-center">
          <GraduationCap
            className="mx-auto h-10 w-10 text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-medium">No courses assigned yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.role === "ADMIN"
              ? "Create programs and courses from the Admin panel."
              : "The administrator will assign courses to you — check back soon."}
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([programName, programCourses]) => (
            <section key={programName} aria-label={programName}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {programName}
                </h2>
                <Badge variant="outline" className="text-[11px] font-normal">
                  {programCourses.length}{" "}
                  {programCourses.length === 1 ? "course" : "courses"}
                </Badge>
                <Separator className="flex-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {programCourses.map((course) => (
                  <Card
                    key={course.id}
                    className="flex flex-col transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700"
                        >
                          {course.code}
                        </Badge>
                        {course.studentCount === 0 && (
                          <Badge
                            variant="outline"
                            className="border-amber-200 bg-amber-50 text-[11px] font-normal text-amber-700"
                          >
                            Empty roster
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-base leading-snug">
                        {course.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 pb-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {course.professorName}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          {course.studentCount} students
                        </span>
                      </div>
                    </CardContent>
                    <CardFooter className="gap-2 border-t pt-4">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => onMarkAttendance(course)}
                      >
                        <CalendarCheck
                          className="mr-1.5 h-4 w-4"
                          aria-hidden="true"
                        />
                        Mark attendance
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => onManageRoster(course)}
                      >
                        <Users className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Roster
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Reports for ${course.code}`}
                        title="Attendance report"
                        onClick={() => onViewReports(course)}
                      >
                        <BarChart3 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {user.role === "ADMIN" && !loading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Administrators can create professor accounts and manage programs from
          the Admin panel in the header.
        </p>
      )}
    </div>
  );
}
