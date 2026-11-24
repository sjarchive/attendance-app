export type StickyEdge = "top" | "bottom";

export interface RectLike {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PinMetricsInput {
  edge: StickyEdge;
  elementRect: RectLike;
  parentRect: RectLike;
  parentBorderTop: number;
  parentBorderLeft: number;
  parentPaddingTop: number;
  parentPaddingBottom: number;
  elementMarginTop: number;
  elementMarginBottom: number;
}

export interface PinMetrics {
  edge: StickyEdge;
  top: number;
  left: number;
  width: number;
  height: number;
  parentPaddingTop: number;
  parentPaddingBottom: number;
}

/**
 * Computes exact parent-relative coordinates to temporarily freeze a
 * position:sticky bar (top header or bottom action bar) as position:absolute
 * during document.startViewTransition().
 *
 * Mobile Chromium (Chrome/Brave Android) can drop or shift actively-stuck
 * position:sticky elements during the root View Transition snapshot, making
 * them disappear until the transition finishes. Freezing the element in
 * document coordinates while preserving parent flow height via paddingTop
 * (for top bars) or paddingBottom (for bottom bars) avoids both layout shift
 * and sticky-snapshot glitches.
 */
export function computeAbsolutePinMetrics(input: PinMetricsInput): PinMetrics {
  const flowHeight =
    input.elementRect.height +
    input.elementMarginTop +
    input.elementMarginBottom;

  return {
    edge: input.edge,
    top: input.elementRect.top - input.parentRect.top - input.parentBorderTop,
    left: input.elementRect.left - input.parentRect.left - input.parentBorderLeft,
    width: input.elementRect.width,
    height: input.elementRect.height,
    parentPaddingTop:
      input.edge === "top"
        ? input.parentPaddingTop + flowHeight
        : input.parentPaddingTop,
    parentPaddingBottom:
      input.edge === "bottom"
        ? input.parentPaddingBottom + flowHeight
        : input.parentPaddingBottom,
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

  const prevParentStyles = new Map<HTMLElement, string | null>();
  const restores: Array<() => void> = [];

  // Read all geometry before mutating styles to avoid layout thrashing
  const plans: Array<{
    el: HTMLElement;
    parent: HTMLElement;
    metrics: PinMetrics;
    parentWasStatic: boolean;
    prevElStyle: string | null;
  }> = [];

  for (const el of nodes) {
    const parent = el.parentElement;
    if (!parent) continue;

    const elCs = window.getComputedStyle(el);
    if (elCs.position !== "sticky") continue;

    const elementRect = el.getBoundingClientRect();
    if (elementRect.width <= 0 || elementRect.height <= 0) continue;

    const attr = el.getAttribute("data-theme-pin-sticky");
    const edge: StickyEdge = attr === "top" ? "top" : "bottom";

    const parentRect = parent.getBoundingClientRect();
    const parentCs = window.getComputedStyle(parent);

    const metrics = computeAbsolutePinMetrics({
      edge,
      elementRect,
      parentRect,
      parentBorderTop: parseFloat(parentCs.borderTopWidth) || 0,
      parentBorderLeft: parseFloat(parentCs.borderLeftWidth) || 0,
      parentPaddingTop: parseFloat(parentCs.paddingTop) || 0,
      parentPaddingBottom: parseFloat(parentCs.paddingBottom) || 0,
      elementMarginTop: parseFloat(elCs.marginTop) || 0,
      elementMarginBottom: parseFloat(elCs.marginBottom) || 0,
    });

    if (!prevParentStyles.has(parent)) {
      prevParentStyles.set(parent, parent.getAttribute("style"));
    }

    plans.push({
      el,
      parent,
      metrics,
      parentWasStatic: parentCs.position === "static",
      prevElStyle: el.getAttribute("style"),
    });
  }

  for (const plan of plans) {
    const { el, parent, metrics, parentWasStatic, prevElStyle } = plan;

    if (parentWasStatic) {
      parent.style.position = "relative";
    }
    if (metrics.edge === "top") {
      parent.style.paddingTop = `${metrics.parentPaddingTop}px`;
    } else {
      parent.style.paddingBottom = `${metrics.parentPaddingBottom}px`;
    }

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
    });
  }

  for (const [parent, prevStyle] of prevParentStyles.entries()) {
    restores.push(() => {
      restoreInlineStyle(parent, prevStyle);
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
