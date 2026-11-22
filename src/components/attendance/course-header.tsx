"use client";

import type { ReactNode } from "react";
import { ArrowLeft, BarChart3, CalendarCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CourseWithDetails } from "@/lib/types";
import { cn } from "@/lib/utils";

export type CourseSubView = "attendance" | "roster" | "reports";

interface CourseHeaderProps {
  course: CourseWithDetails;
  activeTab: CourseSubView;
  onSelectTab: (tab: CourseSubView) => void;
  onBack: () => void;
  subtitle?: string;
  actions?: ReactNode;
}

const COURSE_TABS: {
  id: CourseSubView;
  label: string;
  icon: typeof CalendarCheck;
}[] = [
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "roster", label: "Roster", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
];

export function CourseHeader({
  course,
  activeTab,
  onSelectTab,
  onBack,
  subtitle,
  actions,
}: CourseHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Back to dashboard"
            title="Back to dashboard"
            className="mt-0.5 h-9 w-9 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                {course.code}
              </span>
              <span aria-hidden="true">·</span>
              <span>{course.programName}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {course.studentCount}{" "}
                {course.studentCount === 1 ? "student" : "students"}
              </span>
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
              {course.title}
            </h1>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Unified in-course navigation switcher */}
      <div
        role="tablist"
        aria-label={`Course views for ${course.code}`}
        className="inline-flex w-full items-center gap-1 rounded-lg border bg-muted/50 p-1 sm:w-auto"
      >
        {COURSE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                if (!isActive) onSelectTab(tab.id);
              }}
              className={cn(
                "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-initial sm:text-sm",
                isActive
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
