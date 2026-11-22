import test from "node:test";
import assert from "node:assert/strict";
import {
  buildViewQueryString,
  classesCanMiss,
  classesNeededForTarget,
  filterReportRows,
  formatLocalAuditTime,
  parseViewSearchParams,
  shiftDateStr,
  sortReportRows,
} from "./attendance-helpers";
import type { ReportRow } from "./types";

const SAMPLE_ROWS: ReportRow[] = [
  {
    studentId: "s1",
    rollNo: "BED1-02",
    name: "Zoya Khan",
    active: true,
    present: 8,
    absent: 2,
    late: 0,
    leave: 0,
    total: 10,
    percentage: 80,
  },
  {
    studentId: "s2",
    rollNo: "BED1-10",
    name: "Aarav Sharma",
    active: true,
    present: 6,
    absent: 4,
    late: 0,
    leave: 0,
    total: 10,
    percentage: 60,
  },
  {
    studentId: "s3",
    rollNo: "BED1-01",
    name: "Meera Nair",
    active: true,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: 0,
    percentage: 0,
  },
];

test("shiftDateStr steps days across month boundaries and clamps to max", () => {
  assert.equal(shiftDateStr("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDateStr("2026-11-30", 1), "2026-12-01");
  assert.equal(
    shiftDateStr("2026-11-21", 1, { max: "2026-11-21" }),
    "2026-11-21"
  );
  assert.equal(
    shiftDateStr("2026-11-21", -1, { min: "2026-11-21" }),
    "2026-11-21"
  );
});

test("classesNeededForTarget calculates consecutive classes to reach 75%", () => {
  assert.equal(classesNeededForTarget(0, 0), null);
  assert.equal(classesNeededForTarget(9, 12), 0); // 75% exact
  assert.equal(classesNeededForTarget(10, 12), 0); // > 75%
  // 6/10 = 60% -> need x where (6+x)/(10+x) >= 0.75 => 6+x >= 7.5+0.75x => 0.25x >= 1.5 => x = 6
  assert.equal(classesNeededForTarget(6, 10), 6);
  // 7/10 = 70% -> need 2: (9/12 = 75%)
  assert.equal(classesNeededForTarget(7, 10), 2);
});

test("classesCanMiss calculates safe buffer above 75%", () => {
  assert.equal(classesCanMiss(0, 0), 0);
  assert.equal(classesCanMiss(7, 10), 0);
  // 9/10 = 90% -> can miss 2 (9/12 = 75%), missing 3 gives 9/13 = 69.2%
  assert.equal(classesCanMiss(9, 10), 2);
});

test("sortReportRows sorts numerically by rollNo and percentage", () => {
  const byRoll = sortReportRows(SAMPLE_ROWS, "rollNo", "asc").map(
    (r) => r.rollNo
  );
  assert.deepEqual(byRoll, ["BED1-01", "BED1-02", "BED1-10"]);

  const byPctDesc = sortReportRows(SAMPLE_ROWS, "percentage", "desc").map(
    (r) => r.studentId
  );
  assert.deepEqual(byPctDesc, ["s1", "s2", "s3"]);
});

test("filterReportRows filters by search query and <75% threshold", () => {
  const below = filterReportRows(SAMPLE_ROWS, "", true);
  // Excludes s3 because total === 0 (unmarked) and s1 because 80% >= 75%
  assert.deepEqual(
    below.map((r) => r.studentId),
    ["s2"]
  );

  const byName = filterReportRows(SAMPLE_ROWS, "zoya", false);
  assert.deepEqual(
    byName.map((r) => r.studentId),
    ["s1"]
  );
});

test("formatLocalAuditTime produces relative strings for recent timestamps", () => {
  const now = Date.UTC(2026, 10, 21, 12, 0, 0);
  assert.equal(
    formatLocalAuditTime(new Date(now - 20_000).toISOString(), now).relative,
    "Just now"
  );
  assert.equal(
    formatLocalAuditTime(new Date(now - 5 * 60_000).toISOString(), now).relative,
    "5m ago"
  );
  assert.equal(
    formatLocalAuditTime(new Date(now - 3 * 3600_000).toISOString(), now)
      .relative,
    "3h ago"
  );
  assert.equal(
    formatLocalAuditTime(new Date(now - 2 * 86400_000).toISOString(), now)
      .relative,
    "2d ago"
  );
});

test("URL search params round-trip cleanly", () => {
  const qs = buildViewQueryString({ view: "reports", courseId: "c-42" });
  assert.equal(qs, "?view=reports&course=c-42");
  assert.deepEqual(parseViewSearchParams(qs), {
    view: "reports",
    courseId: "c-42",
    adminTab: "professors",
  });

  const adminQs = buildViewQueryString({ view: "admin", adminTab: "audit" });
  assert.equal(adminQs, "?view=admin&tab=audit");
  assert.deepEqual(parseViewSearchParams(adminQs), {
    view: "admin",
    courseId: null,
    adminTab: "audit",
  });

  assert.equal(buildViewQueryString({ view: "dashboard" }), "");
});
