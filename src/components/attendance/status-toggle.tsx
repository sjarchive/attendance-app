"use client";

import {
  ATTENDANCE_STATUSES,
  STATUS_META,
  type AttendanceStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatusToggleProps {
  value: AttendanceStatus | null;
  onChange: (status: AttendanceStatus) => void;
  disabled?: boolean;
  studentName?: string;
}

// Per-student Present / Absent / Late / Leave control.
// Clicking the already-selected status clears it (un-mark).
// Mobile targets are 40x40px with comfortable spacing to prevent mis-taps.
export function StatusToggle({
  value,
  onChange,
  disabled,
  studentName,
}: StatusToggleProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex items-center gap-1.5 sm:gap-1"
        role="group"
        aria-label={
          studentName
            ? `Attendance status for ${studentName}`
            : "Attendance status"
        }
      >
        {ATTENDANCE_STATUSES.map((status) => {
          const meta = STATUS_META[status];
          const selected = value === status;
          return (
            <Tooltip key={status}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={
                    studentName ? `${meta.label} — ${studentName}` : meta.label
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(status);
                  }}
                  className={cn(
                    "h-10 w-10 rounded-md border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-10",
                    selected
                      ? meta.className
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground dark:bg-muted/30"
                  )}
                >
                  {meta.short}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {meta.label} ({meta.short})
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
