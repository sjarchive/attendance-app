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
}

// Per-student Present / Absent / Late / Leave control (plan Step 5).
// Clicking the already-selected status clears it (un-mark).
export function StatusToggle({ value, onChange, disabled }: StatusToggleProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Attendance status"
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
                  aria-label={meta.label}
                  onClick={() => onChange(status)}
                  className={cn(
                    "h-8 w-8 rounded-md border text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-10",
                    selected
                      ? meta.className
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {meta.short}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{meta.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
