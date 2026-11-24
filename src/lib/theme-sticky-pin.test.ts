import test from "node:test";
import assert from "node:assert/strict";
import { computeAbsolutePinMetrics } from "./theme-sticky-pin";

test("computeAbsolutePinMetrics pins an actively stuck bottom bar to its exact visual offset inside parent", () => {
  const metrics = computeAbsolutePinMetrics({
    edge: "bottom",
    elementRect: { top: 787, left: 0, width: 390, height: 57 },
    parentRect: { top: 80, left: 16, width: 358, height: 1356 },
    parentBorderTop: 0,
    parentBorderLeft: 0,
    parentPaddingTop: 0,
    parentPaddingBottom: 0,
    elementMarginTop: 0,
    elementMarginBottom: 0,
  });

  assert.deepEqual(metrics, {
    edge: "bottom",
    top: 707,
    left: -16,
    width: 390,
    height: 57,
    parentPaddingTop: 0,
    parentPaddingBottom: 57,
  });
});

test("computeAbsolutePinMetrics pins a scrolled sticky top header and preserves layout via parentPaddingTop", () => {
  const metrics = computeAbsolutePinMetrics({
    edge: "top",
    elementRect: { top: 0, left: 0, width: 390, height: 57 },
    parentRect: { top: -250, left: 0, width: 390, height: 1502 },
    parentBorderTop: 0,
    parentBorderLeft: 0,
    parentPaddingTop: 0,
    parentPaddingBottom: 0,
    elementMarginTop: 0,
    elementMarginBottom: 0,
  });

  assert.deepEqual(metrics, {
    edge: "top",
    top: 250,
    left: 0,
    width: 390,
    height: 57,
    parentPaddingTop: 57,
    parentPaddingBottom: 0,
  });
});

test("computeAbsolutePinMetrics accounts for scrolled parent, parent borders/padding, and element margins", () => {
  const metrics = computeAbsolutePinMetrics({
    edge: "bottom",
    elementRect: { top: 787, left: 144, width: 1152, height: 57 },
    parentRect: { top: -169, left: 160, width: 1120, height: 1356 },
    parentBorderTop: 1,
    parentBorderLeft: 2,
    parentPaddingTop: 12,
    parentPaddingBottom: 24,
    elementMarginTop: 16,
    elementMarginBottom: 0,
  });

  assert.deepEqual(metrics, {
    edge: "bottom",
    top: 955,
    left: -18,
    width: 1152,
    height: 57,
    parentPaddingTop: 12,
    parentPaddingBottom: 97,
  });
});
