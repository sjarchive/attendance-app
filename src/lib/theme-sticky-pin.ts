export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PinMetricsInput {
  elementRect: RectLike;
  parentRect: RectLike;
  parentBorderTop: number;
  parentBorderLeft: number;
  parentPaddingBottom: number;
  elementMarginTop: number;
  elementMarginBottom: number;
}

export interface PinMetrics {
  top: number;
  left: number;
  width: number;
  height: number;
  parentPaddingBottom: number;
}

/**
 * Computes exact parent-relative coordinates to temporarily freeze a
 * position:sticky bar as position:absolute during document.startViewTransition().
 *
 * Mobile Chromium (Chrome/Brave Android) expands the View Transition Snapshot
 * Containing Block behind dynamic browser chrome and can drop or shift
 * actively-stuck bottom sticky elements, making them disappear for the duration
 * of the transition and pop back afterwards. Freezing the element in document
 * coordinates while preserving parent height avoids both layout shift and
 * sticky-snapshot glitches.
 */
export function computeAbsolutePinMetrics(input: PinMetricsInput): PinMetrics {
  return {
    top: input.elementRect.top - input.parentRect.top - input.parentBorderTop,
    left: input.elementRect.left - input.parentRect.left - input.parentBorderLeft,
    width: input.elementRect.width,
    height: input.elementRect.height,
    parentPaddingBottom:
      input.parentPaddingBottom +
      input.elementRect.height +
      input.elementMarginTop +
      input.elementMarginBottom,
  };
}

function restoreInlineStyle(el: HTMLElement, prevStyle: string | null) {
  if (prevStyle === null) {
    el.removeAttribute("style");
  } else {
    el.setAttribute("style", prevStyle);
  }
}

export function pinStickyElementsForViewTransition(
  rootDoc: Document = document
): () => void {
  if (typeof window === "undefined") return () => {};
  const nodes = rootDoc.querySelectorAll<HTMLElement>("[data-theme-pin-sticky]");
  if (nodes.length === 0) return () => {};

  const restores: Array<() => void> = [];

  // Read all geometry before mutating styles to avoid layout thrashing
  const plans: Array<{
    el: HTMLElement;
    parent: HTMLElement;
    metrics: PinMetrics;
    parentWasStatic: boolean;
    prevElStyle: string | null;
    prevParentStyle: string | null;
  }> = [];

  for (const el of nodes) {
    const parent = el.parentElement;
    if (!parent) continue;

    const elCs = window.getComputedStyle(el);
    if (elCs.position !== "sticky") continue;

    const elementRect = el.getBoundingClientRect();
    if (elementRect.width <= 0 || elementRect.height <= 0) continue;

    const parentRect = parent.getBoundingClientRect();
    const parentCs = window.getComputedStyle(parent);

    const metrics = computeAbsolutePinMetrics({
      elementRect,
      parentRect,
      parentBorderTop: parseFloat(parentCs.borderTopWidth) || 0,
      parentBorderLeft: parseFloat(parentCs.borderLeftWidth) || 0,
      parentPaddingBottom: parseFloat(parentCs.paddingBottom) || 0,
      elementMarginTop: parseFloat(elCs.marginTop) || 0,
      elementMarginBottom: parseFloat(elCs.marginBottom) || 0,
    });

    plans.push({
      el,
      parent,
      metrics,
      parentWasStatic: parentCs.position === "static",
      prevElStyle: el.getAttribute("style"),
      prevParentStyle: parent.getAttribute("style"),
    });
  }

  for (const plan of plans) {
    const { el, parent, metrics, parentWasStatic, prevElStyle, prevParentStyle } =
      plan;

    if (parentWasStatic) {
      parent.style.position = "relative";
    }
    parent.style.paddingBottom = `${metrics.parentPaddingBottom}px`;

    el.style.position = "absolute";
    el.style.top = `${metrics.top}px`;
    el.style.left = `${metrics.left}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.width = `${metrics.width}px`;
    el.style.height = `${metrics.height}px`;
    el.style.margin = "0";

    restores.push(() => {
      restoreInlineStyle(el, prevElStyle);
      restoreInlineStyle(parent, prevParentStyle);
    });
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (let i = restores.length - 1; i >= 0; i -= 1) {
      restores[i]();
    }
  };
}
