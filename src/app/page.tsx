"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LoginScreen } from "@/components/attendance/login-screen";
import { Dashboard } from "@/components/attendance/dashboard";
import { AttendanceMarker } from "@/components/attendance/attendance-marker";
import { RosterManager } from "@/components/attendance/roster-manager";
import { AdminPanel } from "@/components/attendance/admin-panel";
import { ReportsView } from "@/components/attendance/reports-view";
import { MyAttendance } from "@/components/attendance/my-attendance";
import type { CourseSubView } from "@/components/attendance/course-header";
import { apiFetch } from "@/lib/client";
import {
  buildViewQueryString,
  parseViewSearchParams,
  type AdminTabName,
  type AppViewName,
} from "@/lib/attendance-helpers";
import type { BootStats, CourseWithDetails, SessionUser } from "@/lib/types";

type View =
  | { name: "dashboard" }
  | { name: "attendance"; courseId: string }
  | { name: "roster"; courseId: string }
  | { name: "reports"; courseId: string }
  | { name: "admin"; tab: AdminTabName };

function viewFromUrl(isAdmin: boolean): View {
  if (typeof window === "undefined") return { name: "dashboard" };
  const parsed = parseViewSearchParams(window.location.search);
  if (parsed.view === "admin") {
    return isAdmin ? { name: "admin", tab: parsed.adminTab } : { name: "dashboard" };
  }
  if (
    (parsed.view === "attendance" ||
      parsed.view === "roster" ||
      parsed.view === "reports") &&
    parsed.courseId
  ) {
    return { name: parsed.view, courseId: parsed.courseId };
  }
  return { name: "dashboard" };
}

const emptySubscribe = () => () => {};

function ThemeToggleButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4" aria-hidden="true" />
      )}
    </Button>
  );
}

export default function Home() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [courses, setCourses] = useState<CourseWithDetails[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [uniqueStudents, setUniqueStudents] = useState(0);

  // Unsaved-changes guard propagated from AttendanceMarker
  const [attendanceDirty, setAttendanceDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  const pushUrl = useCallback(
    (next: View, replace = false) => {
      if (typeof window === "undefined") return;
      const qs = buildViewQueryString({
        view: next.name as AppViewName,
        courseId:
          next.name === "attendance" ||
          next.name === "roster" ||
          next.name === "reports"
            ? next.courseId
            : null,
        adminTab: next.name === "admin" ? next.tab : undefined,
      });
      const target = `${window.location.pathname}${qs}`;
      if (`${window.location.pathname}${window.location.search}` === target) {
        return;
      }
      if (replace) {
        window.history.replaceState(null, "", target);
      } else {
        window.history.pushState(null, "", target);
      }
    },
    []
  );

  const commitView = useCallback(
    (next: View, options?: { replace?: boolean }) => {
      setView(next);
      if (next.name !== "attendance") {
        setAttendanceDirty(false);
      }
      pushUrl(next, options?.replace ?? false);
    },
    [pushUrl]
  );

  const navigateWithGuard = useCallback(
    (action: () => void) => {
      if (attendanceDirty) {
        setPendingNav(() => action);
      } else {
        action();
      }
    },
    [attendanceDirty]
  );

  // Browser tab close / refresh protection when attendance has unsaved edits
  useEffect(() => {
    if (!attendanceDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [attendanceDirty]);

  // Sync browser Back / Forward buttons with view state
  useEffect(() => {
    if (!user || user.role === "STUDENT") return;
    function handlePopState() {
      const next = viewFromUrl(user?.role === "ADMIN");
      setView(next);
      if (next.name !== "attendance") {
        setAttendanceDirty(false);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user]);

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
      const message =
        err instanceof Error ? err.message : "Failed to load courses";
      if (message.toLowerCase().includes("session")) {
        setUser(null);
      }
      toast.error(message);
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  // Session bootstrap: one request returns user + courses (see /api/boot).
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
          const initial = viewFromUrl(data.user.role === "ADMIN");
          // If URL points to a course no longer accessible, fall back to dashboard
          if (
            (initial.name === "attendance" ||
              initial.name === "roster" ||
              initial.name === "reports") &&
            !data.courses.some((c) => c.id === initial.courseId)
          ) {
            setView({ name: "dashboard" });
            pushUrl({ name: "dashboard" }, true);
          } else {
            setView(initial);
          }
        }
      } catch {
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, [pushUrl]);

  const handleLogin = useCallback(
    (u: SessionUser) => {
      setUser(u);
      commitView({ name: "dashboard" }, { replace: true });
      if (u.role !== "STUDENT") {
        void refreshCourses();
      }
    },
    [commitView, refreshCourses]
  );

  const performLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore network errors on logout
    }
    setAttendanceDirty(false);
    setUser(null);
    commitView({ name: "dashboard" }, { replace: true });
    setCourses([]);
    setUniqueStudents(0);
    toast("You have been signed out");
  }, [commitView]);

  const handleSessionExpired = useCallback(() => {
    setAttendanceDirty(false);
    setUser(null);
    commitView({ name: "dashboard" }, { replace: true });
    setCourses([]);
    setUniqueStudents(0);
  }, [commitView]);

  const activeCourse =
    view.name === "attendance" ||
    view.name === "roster" ||
    view.name === "reports"
      ? courses.find((c) => c.id === view.courseId) ?? null
      : null;

  const handleCourseTabSelect = useCallback(
    (tab: CourseSubView) => {
      if (!activeCourse) return;
      commitView({ name: tab, courseId: activeCourse.id });
    },
    [activeCourse, commitView]
  );

  // Lock scroll while the splash/loading screen is shown
  useEffect(() => {
    if (!booting) return;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [booting]);

  // ---- Boot screen -------------------------------------------------------
  if (booting) {
    return (
      <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col items-center justify-center gap-3 overflow-hidden overscroll-none touch-none bg-background select-none">
        <GraduationCap
          className="h-8 w-8 text-emerald-600 dark:text-emerald-400"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">
          Loading Attendance Tracker...
        </p>
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
      {/* Unsaved attendance guard for top-level header navigation */}
      <AlertDialog
        open={pendingNav !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNav(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved attendance?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved attendance changes on this screen. Leaving now
              will discard those edits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                const action = pendingNav;
                setPendingNav(null);
                setAttendanceDirty(false);
                action?.();
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
          {/* Brand button returns to Dashboard */}
          {isStudent ? (
            <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
              <GraduationCap
                className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tracking-tight">
                Attendance Tracker
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                navigateWithGuard(() => commitView({ name: "dashboard" }))
              }
              className="flex shrink-0 items-center gap-2 rounded-md py-1 pr-1 text-left whitespace-nowrap transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Attendance Tracker — Go to Dashboard"
            >
              <GraduationCap
                className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tracking-tight">
                Attendance Tracker
              </span>
            </button>
          )}

          <nav
            className="ml-auto flex shrink-0 items-center gap-1 sm:gap-1.5"
            aria-label="Main"
          >
            {!isStudent && view.name !== "dashboard" && (
              <Button
                variant="ghost"
                size="sm"
                className="whitespace-nowrap"
                onClick={() =>
                  navigateWithGuard(() => commitView({ name: "dashboard" }))
                }
              >
                <LayoutDashboard
                  className="h-4 w-4 sm:mr-1.5"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Dashboard</span>
                <span className="sr-only sm:hidden">Dashboard</span>
              </Button>
            )}
            {isAdmin && view.name !== "admin" && (
              <Button
                variant="ghost"
                size="sm"
                className="whitespace-nowrap"
                onClick={() =>
                  navigateWithGuard(() =>
                    commitView({ name: "admin", tab: "professors" })
                  )
                }
                title="Admin panel"
              >
                <ShieldCheck
                  className="h-4 w-4 sm:mr-1.5"
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Admin</span>
                <span className="sr-only sm:hidden">Admin</span>
              </Button>
            )}

            <ThemeToggleButton />

            <Separator
              orientation="vertical"
              className="mx-1 hidden h-6 sm:block"
            />
            <div className="hidden text-right md:block">
              <p className="text-xs font-medium leading-tight">{user.name}</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                {user.role === "ADMIN"
                  ? "Admin"
                  : user.role === "PROFESSOR"
                    ? "Professor"
                    : "Student"}{" "}
                · {user.username}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateWithGuard(() => void performLogout())}
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {isStudent && <MyAttendance onSessionExpired={handleSessionExpired} />}

        {!isStudent && view.name === "dashboard" && (
          <Dashboard
            user={user}
            courses={courses}
            uniqueStudents={uniqueStudents}
            loading={coursesLoading}
            onMarkAttendance={(course) =>
              commitView({ name: "attendance", courseId: course.id })
            }
            onManageRoster={(course) =>
              commitView({ name: "roster", courseId: course.id })
            }
            onViewReports={(course) =>
              commitView({ name: "reports", courseId: course.id })
            }
            onOpenAdmin={
              isAdmin
                ? () => commitView({ name: "admin", tab: "professors" })
                : undefined
            }
            onRefresh={refreshCourses}
          />
        )}

        {!isStudent && view.name === "attendance" && activeCourse && (
          <AttendanceMarker
            course={activeCourse}
            onBack={() => commitView({ name: "dashboard" })}
            onSelectTab={handleCourseTabSelect}
            onDirtyChange={setAttendanceDirty}
            onSaved={refreshCourses}
          />
        )}

        {!isStudent && view.name === "roster" && activeCourse && (
          <RosterManager
            course={activeCourse}
            onChanged={refreshCourses}
            onBack={() => commitView({ name: "dashboard" })}
            onSelectTab={handleCourseTabSelect}
          />
        )}

        {!isStudent && view.name === "reports" && activeCourse && (
          <ReportsView
            course={activeCourse}
            onBack={() => commitView({ name: "dashboard" })}
            onSelectTab={handleCourseTabSelect}
          />
        )}

        {!isStudent && view.name === "admin" && isAdmin && (
          <AdminPanel
            activeTab={view.tab}
            onTabChange={(tab) =>
              commitView({ name: "admin", tab }, { replace: true })
            }
            onBack={() => commitView({ name: "dashboard" })}
            onChanged={refreshCourses}
          />
        )}
      </main>

      <footer
        className="mt-auto border-t"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <p className="text-xs text-muted-foreground">
            Department of Education
          </p>
        </div>
      </footer>
    </div>
  );
}
