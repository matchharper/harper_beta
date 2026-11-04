"use client";

import { useLayoutEffect, useState } from "react";

/** Inline panels scroll in the document; only an offscreen panel needs coordinates. */
export function useBrowserSessionPlacement({
  dock,
  layout,
  inlineAnchor,
  content,
  depth,
  collapsed,
}: {
  dock: HTMLElement;
  layout: HTMLElement;
  inlineAnchor: HTMLElement | null;
  content: HTMLElement | null;
  depth: number;
  collapsed: boolean | null;
}) {
  const [placement, setPlacement] = useState({
    inline: Boolean(inlineAnchor),
    mobile: false,
  });
  useLayoutEffect(() => {
    if (!content) return;
    return observePlacement(
      { dock, layout, inlineAnchor, content, depth, collapsed },
      setPlacement
    );
  }, [dock, layout, inlineAnchor, content, depth, collapsed]);
  return {
    inline: placement.inline,
    collapsed: !placement.inline && (collapsed ?? placement.mobile),
  };
}

// DOM measurements and positioning belong to the observer, outside React render.
function observePlacement(
  {
    dock,
    layout,
    inlineAnchor,
    content,
    depth,
    collapsed,
  }: {
    dock: HTMLElement;
    layout: HTMLElement;
    inlineAnchor: HTMLElement | null;
    content: HTMLElement;
    depth: number;
    collapsed: boolean | null;
  },
  setPlacement: React.Dispatch<
    React.SetStateAction<{ inline: boolean; mobile: boolean }>
  >
) {
  const viewport = inlineAnchor?.closest<HTMLElement>("[data-career-timeline]");
  const update = () => {
    const mobile = window.innerWidth < 768;
    const isCollapsed = collapsed ?? mobile;
    const rect = inlineAnchor?.getBoundingClientRect();
    const bounds = viewport?.getBoundingClientRect();
    const visible = Boolean(
      rect &&
      bounds &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > Math.max(0, bounds.top) &&
      rect.top < Math.min(window.innerHeight, bounds.bottom) &&
      rect.right > Math.max(0, bounds.left) &&
      rect.left < Math.min(window.innerWidth, bounds.right)
    );
    if (visible) {
      Object.assign(content.style, {
        position: "relative",
        left: "",
        top: "",
        width: "100%",
        maxHeight: "calc(100dvh - 160px)",
        zIndex: "auto",
      });
      if (inlineAnchor) inlineAnchor.style.height = "";
    } else {
      // Reserve the natural row height before taking the same node out of flow.
      if (inlineAnchor && content.style.position !== "fixed")
        inlineAnchor.style.height = `${content.offsetHeight}px`;
      const parent = layout.getBoundingClientRect();
      const anchor = dock.getBoundingClientRect();
      const width = Math.min(320, Math.max(0, parent.width - 32));
      const top = Math.max(
        12,
        (window.visualViewport?.offsetTop ?? 0) - parent.top + 12
      );
      const bottom = anchor.top - parent.top - 12 - depth * 40;
      Object.assign(content.style, {
        position: "fixed",
        width: `${width}px`,
        maxHeight: `${Math.max(0, mobile ? Math.min(parent.height, window.visualViewport?.height ?? window.innerHeight) - top - 16 : bottom - 16)}px`,
        zIndex: isCollapsed ? "10" : "11",
        left: `${mobile ? (parent.width - width) / 2 : Math.max(16, Math.min(anchor.right - parent.left - width - depth * 12, parent.width - width - 16))}px`,
      });
      content.style.top = `${mobile ? top : Math.max(16, bottom - content.offsetHeight)}px`;
    }
    setPlacement((current) =>
      current.inline === visible && current.mobile === mobile
        ? current
        : { inline: visible, mobile }
    );
  };
  update();
  const resize =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
  for (const element of [inlineAnchor, viewport, dock, content, layout])
    if (element) resize?.observe(element);
  const intersection =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(update, { root: viewport ?? null });
  if (inlineAnchor) intersection?.observe(inlineAnchor);
  // Native layout handles inline scrolling. This only switches at the viewport boundary.
  document.addEventListener("scroll", update, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", update);
  window.visualViewport?.addEventListener("resize", update);
  window.visualViewport?.addEventListener("scroll", update);
  return () => {
    resize?.disconnect();
    intersection?.disconnect();
    document.removeEventListener("scroll", update, true);
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
  };
}
