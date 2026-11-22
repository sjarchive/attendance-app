"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Clock,
  GraduationCap,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import type { CourseWithDetails, SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DashboardProps {
  user: SessionUser;
  courses: CourseWithDetails[];
  /** UNIQUE student headcount from the API (per-course sums double-count). */
  uniqueStudents: number;
  loading: boolean;
  onMarkAttendance: (course: CourseWithDetails) => void;
  onManageRoster: (course: CourseWithDetails) => void;
  onViewReports: (course: CourseWithDetails) => void;
  onOpenAdmin?: () => void;
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
  uniqueStudents,
  loading,
  onMarkAttendance,
  onManageRoster,
  onViewReports,
  onOpenAdmin,
  onRefresh,
}: DashboardProps) {
  const [search, setSearch] = useState("");
  const [selectedProgram, setSelectedProgram] = useState<string>("ALL");

  const programNames = useMemo(() => {
    const set = new Set<string>();
    for (const c of courses) set.add(c.programName);
    return Array.from(set);
  }, [courses]);

  const markedTodayCoursesCount = useMemo(() => {
    return courses.filter(
      (c) => c.studentCount > 0 && (c.todayMarkedCount ?? 0) > 0
    ).length;
  }, [courses]);

  const activeCoursesWithStudents = useMemo(() => {
    return courses.filter((c) => c.studentCount > 0).length;
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((course) => {
      if (selectedProgram !== "ALL" && course.programName !== selectedProgram) {
        return false;
      }
      if (!q) return true;
      return (
        course.code.toLowerCase().includes(q) ||
        course.title.toLowerCase().includes(q) ||
        course.professorName.toLowerCase().includes(q) ||
        course.programName.toLowerCase().includes(q)
      );
    });
  }, [courses, search, selectedProgram]);

  const grouped = useMemo(() => {
    const map = new Map<string, CourseWithDetails[]>();
    for (const course of filteredCourses) {
      const list = map.get(course.programName) ?? [];
      list.push(course);
      map.set(course.programName, list);
    }
    return Array.from(map.entries());
  }, [filteredCourses]);

  const showFilterBar = !loading && courses.length > 0;
  const hasFiltersActive = search.trim().length > 0 || selectedProgram !== "ALL";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            {greeting()}, {user.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.role === "ADMIN"
              ? "Overview of every course in the department."
              : "Select a course to mark today's attendance, manage its roster, or view reports."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user.role === "ADMIN" && onOpenAdmin && (
            <Button variant="outline" size="sm" onClick={onOpenAdmin}>
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Manage department
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
              <Layers className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {loading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <p className="text-lg font-semibold leading-none tabular-nums sm:text-xl">
                  {programNames.length}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Programs</p>
            </div>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {loading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <p className="text-lg font-semibold leading-none tabular-nums sm:text-xl">
                  {courses.length}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Courses</p>
            </div>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {loading ? (
                <Skeleton className="h-6 w-10" />
              ) : (
                <p className="text-lg font-semibold leading-none tabular-nums sm:text-xl">
                  {uniqueStudents}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Students</p>
            </div>
          </div>
        </Card>

        <Card className="p-3.5 sm:p-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              {loading ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <p className="text-lg font-semibold leading-none tabular-nums sm:text-xl">
                  {markedTodayCoursesCount}/{activeCoursesWithStudents}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">Marked today</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Search & program filter bar */}
      {showFilterBar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses or professors..."
              aria-label="Search courses or professors"
              className="h-9 pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear course search"
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>

          {programNames.length > 1 && (
            <div
              role="group"
              aria-label="Filter by program"
              className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                aria-pressed={selectedProgram === "ALL"}
                onClick={() => setSelectedProgram("ALL")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  selectedProgram === "ALL"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All programs
              </button>
              {programNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selectedProgram === name}
                  onClick={() => setSelectedProgram(name)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                    selectedProgram === name
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-6 w-44" />
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
          {user.role === "ADMIN" && onOpenAdmin && (
            <Button
              size="sm"
              className="mt-4 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={onOpenAdmin}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Open Admin panel
            </Button>
          )}
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium">No matching courses</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try clearing your search or switching the program filter.
          </p>
          {hasFiltersActive && (
            <Button
              size="sm"
              variant="outline"
              className="mt-4"
              onClick={() => {
                setSearch("");
                setSelectedProgram("ALL");
              }}
            >
              Reset filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(([programName, programCourses]) => (
            <section key={programName} aria-label={programName}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {programName}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {programCourses.length}{" "}
                  {programCourses.length === 1 ? "course" : "courses"}
                </span>
                <Separator className="flex-1" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {programCourses.map((course) => {
                  const markedToday = course.todayMarkedCount ?? 0;
                  const presentToday = course.todayPresentCount ?? 0;
                  const isMarkedToday = course.studentCount > 0 && markedToday > 0;
                  const isCompleteToday =
                    course.studentCount > 0 && markedToday >= course.studentCount;

                  return (
                    <Card
                      key={course.id}
                      className="flex flex-col transition-colors hover:border-foreground/20"
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            {course.code}
                          </span>
                          {course.studentCount === 0 ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              Empty roster
                            </span>
                          ) : isMarkedToday ? (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
                              <CheckCircle2
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              {isCompleteToday
                                ? `Today · ${presentToday}/${markedToday} present`
                                : `Today · ${markedToday}/${course.studentCount} marked`}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              Not marked today
                            </span>
                          )}
                        </div>
                        <CardTitle className="pt-1 text-base leading-snug">
                          {course.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="flex-1 pb-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {course.professorName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                            {course.studentCount}{" "}
                            {course.studentCount === 1 ? "student" : "students"}
                          </span>
                        </div>
                      </CardContent>
                      <CardFooter className="gap-2 border-t pt-4">
                        <Button
                          size="sm"
                          className="flex-1 whitespace-nowrap bg-emerald-600 text-white hover:bg-emerald-700"
                          onClick={() => onMarkAttendance(course)}
                        >
                          <CalendarCheck
                            className="mr-1.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          {isMarkedToday ? "Update attendance" : "Mark attendance"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="whitespace-nowrap"
                          onClick={() => onManageRoster(course)}
                        >
                          <Users
                            className="mr-1.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
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
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
