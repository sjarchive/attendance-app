"use client";

import { useCallback, useEffect, useState } from "react";
import { GraduationCap, LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginScreen } from "@/components/attendance/login-screen";
import { Dashboard } from "@/components/attendance/dashboard";
import { AttendanceMarker } from "@/components/attendance/attendance-marker";
import { RosterManager } from "@/components/attendance/roster-manager";
import { AdminPanel } from "@/components/attendance/admin-panel";
import { ReportsView } from "@/components/attendance/reports-view";
import { MyAttendance } from "@/components/attendance/my-attendance";
import { apiFetch } from "@/lib/client";
import type { BootStats, CourseWithDetails, SessionUser } from "@/lib/types";

type View =
  | { name: "dashboard" }
  | { name: "attendance"; course: CourseWithDetails }
  | { name: "roster"; course: CourseWithDetails }
  | { name: "reports"; course: CourseWithDetails }
  | { name: "admin" };

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [uniqueStudents, setUniqueStudents] = useState(0);

  const refreshCourses = useCallback(async () => {
    setCoursesLoading(true);
    try {
      const data = await apiFetch<{
        courses: CourseWithDetails[];
        stats?: BootStats;
      }>("/api/courses");
      setCourses(data.courses);
      setUniqueStudents(data.stats?.students ?? 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load courses";
      if (message.toLowerCase().includes("session")) {
        setUser(null);
      }
      toast.error(message);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  // Session bootstrap: one request returns user + courses (see /api/boot).
  // A 401/session-expiry later in the app falls back to refreshCourses' handler.
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{
          user: SessionUser | null;
          courses: CourseWithDetails[];
          stats?: BootStats;
        }>("/api/boot");
        setUser(data.user);
        if (data.user && data.user.role !== "STUDENT") {
          setCourses(data.courses);
          setUniqueStudents(data.stats?.students ?? 0);
        }
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const handleLogin = useCallback(
    (u: SessionUser) => {
      setUser(u);
      setView({ name: "dashboard" });
      if (u.role !== "STUDENT") {
        refreshCourses();
      }
    },
    [refreshCourses]
  );

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    setUser(null);
    setView({ name: "dashboard" });
    setCourses([]);
    setUniqueStudents(0);
    toast("You have been signed out");
  }, []);

  // ---- Boot screen -------------------------------------------------------
  if (booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <GraduationCap className="h-8 w-8 text-emerald-600" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading attendance system...</p>
      </div>
    );
  }

  // ---- Login -------------------------------------------------------------
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  const isAdmin = user.role === "ADMIN";
  const isStudent = user.role === "STUDENT";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3">
          <GraduationCap className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              <span className="sm:hidden">Attendance</span>
              <span className="hidden sm:inline">Department Attendance</span>
            </p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              Student attendance tracking
            </p>
          </div>

          <nav className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="Main">
            {!isStudent && view.name !== "dashboard" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView({ name: "dashboard" })}
              >
                <LayoutDashboard className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sr-only sm:hidden">Dashboard</span>
              </Button>
            )}
            {isAdmin && view.name !== "admin" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView({ name: "admin" })}
                title="Admin panel"
              >
                <ShieldCheck className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                <span className="hidden sm:inline">Admin</span>
                <span className="sr-only sm:hidden">Admin</span>
              </Button>
            )}
            <Separator orientation="vertical" className="mx-1 hidden h-6 sm:block" />
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium leading-tight">{user.name}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {user.username}
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                isAdmin
                  ? "border-violet-200 bg-violet-50 text-[10px] font-semibold text-violet-700"
                  : "text-[10px] font-semibold text-muted-foreground"
              }
            >
              {user.role}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {isStudent && <MyAttendance />}

        {!isStudent && view.name === "dashboard" && (
          <Dashboard
            user={user}
            courses={courses}
            uniqueStudents={uniqueStudents}
            loading={coursesLoading}
            onMarkAttendance={(course) => setView({ name: "attendance", course })}
            onManageRoster={(course) => setView({ name: "roster", course })}
            onViewReports={(course) => setView({ name: "reports", course })}
            onRefresh={refreshCourses}
          />
        )}

        {view.name === "attendance" && (
          <AttendanceMarker
            course={view.course}
            onBack={() => setView({ name: "dashboard" })}
          />
        )}

        {view.name === "roster" && (
          <RosterManager
            course={view.course}
            onChanged={refreshCourses}
            onBack={() => setView({ name: "dashboard" })}
          />
        )}

        {view.name === "reports" && (
          <ReportsView
            course={view.course}
            onBack={() => setView({ name: "dashboard" })}
          />
        )}

        {view.name === "admin" && (
          <AdminPanel onChanged={refreshCourses} />
        )}
      </main>

      <footer
        className="mt-auto border-t"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <p className="text-xs text-muted-foreground">
            Department of Education · Attendance System
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date().getFullYear()} · Annual system (no semesters)
          </p>
        </div>
      </footer>
    </div>
  );
}
