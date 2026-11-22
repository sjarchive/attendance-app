// Shared types used by both API routes and the client (single source of truth)

export type Role = "PROFESSOR" | "ADMIN" | "STUDENT";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "PRESENT",
  "ABSENT",
  "LATE",
  "LEAVE",
];

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; key: string; className: string }
> = {
  PRESENT: {
    label: "Present",
    short: "P",
    key: "p",
    className:
      "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
  },
  ABSENT: {
    label: "Absent",
    short: "A",
    key: "a",
    className: "bg-red-600 text-white border-red-600 hover:bg-red-700",
  },
  LATE: {
    label: "Late",
    short: "L",
    key: "l",
    className: "bg-amber-500 text-white border-amber-500 hover:bg-amber-600",
  },
  LEAVE: {
    label: "Leave",
    short: "V",
    key: "v",
    className:
      "bg-violet-600 text-white border-violet-600 hover:bg-violet-700",
  },
};

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: Role;
}

export interface ProgramWithCounts {
  id: string;
  name: string;
  courseCount: number;
  studentCount: number;
}

// Aggregate stats for staff dashboards. `students` is a UNIQUE student count
// (not the sum of per-course enrollments, which double-counts students
// enrolled in more than one course).
export interface BootStats {
  students: number;
}

export interface CourseWithDetails {
  id: string;
  code: string;
  title: string;
  programId: string;
  programName: string;
  professorId: string;
  professorName: string;
  studentCount: number;
  todayMarkedCount?: number;
  todayPresentCount?: number;
}

export interface ProfessorAccount {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  courseCount: number;
  createdAt: string;
}

export interface RosterStudent {
  studentId: string;
  rollNo: string;
  name: string;
  active: boolean; // enrollment active flag (soft-remove support)
  markedDays: number; // past attendance rows kept even after removal
}

export interface AttendanceLoadResponse {
  course: {
    id: string;
    code: string;
    title: string;
    programName: string;
  };
  date: string; // YYYY-MM-DD
  roster: RosterStudent[]; // active enrollments, ordered by roll no
  records: Record<string, AttendanceStatus>; // studentId -> saved status for the date
}

export interface DateRow {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

// ---- Phase 2: reports, import, student self-view, audit -----------------

export interface ReportRow {
  studentId: string;
  rollNo: string;
  name: string;
  active: boolean; // currently enrolled (may be false for soft-removed)
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  percentage: number; // present / total * 100, rounded to 1 decimal
}

export interface DailyTrendPoint {
  date: string;
  present: number;
  absent: number;
  late: number;
  leave: number;
  total: number;
  percentage: number;
}

export interface ReportResponse {
  course: { id: string; code: string; title: string; programName: string };
  from: string | null;
  to: string | null;
  rows: ReportRow[];
  dailyTrend?: DailyTrendPoint[];
  summary: {
    classAverage: number; // % across all marked days in range
    markedDays: number; // distinct dates with records in range
    studentsCounted: number;
    totalMarked: number;
    totalPresent: number;
  };
}

export interface ImportSummary {
  totalRows: number;
  created: number;
  reactivated: number;
  updated: number;
  skipped: number;
  errors: { line: number; message: string }[]; // capped at 50
}

export interface StudentAttendanceHistoryItem {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
}

export interface StudentCourseSummary {
  courseId: string;
  code: string;
  title: string;
  active: boolean;
  marked: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
  percentage: number;
  lastMarked: string | null; // YYYY-MM-DD
  history?: StudentAttendanceHistoryItem[];
}

export interface MyAttendanceResponse {
  student: { name: string; rollNo: string; programName: string };
  overall: { marked: number; present: number; percentage: number };
  courses: StudentCourseSummary[];
}

export interface StudentAccountView {
  id: string;
  rollNo: string;
  name: string;
  username: string | null;
  hasPassword: boolean;
  activeEnrollments: number;
}

export type AuditEntityType =
  | "attendance"
  | "student"
  | "course"
  | "program"
  | "professor"
  | "student_account";

export interface AuditEntry {
  id: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  details: string | null;
  actorName: string;
  createdAt: string;
  courseId: string | null;
}

export interface AuditResponse {
  entries: AuditEntry[];
  total: number;
}
