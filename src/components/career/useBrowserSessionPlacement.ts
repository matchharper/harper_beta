"use client";

import { useLayoutEffect, useState } from "react";

/** Inline panels scroll in the document; only an offscreen panel needs coordinates. */
export function useBrowserSessionPlacement({
  dock,
  layout,
  inlineAnchor,
  content,
  depth,
  expanded,
}: {
  dock: HTMLElement;
  layout: HTMLElement;
  inlineAnchor: HTMLElement | null;
  content: HTMLElement | null;
  depth: number;
  expanded: boolean;
}) {
  const [inline, setInline] = useState(Boolean(inlineAnchor));
  useLayoutEffect(() => {
    if (!content) return;
    return observePlacement(
      { dock, layout, inlineAnchor, content, depth, expanded },
      setInline
    );
  }, [dock, layout, inlineAnchor, content, depth, expanded]);
  return { inline };
}

// DOM measurements and positioning belong to the observer, outside React render.
function observePlacement(
  {
    dock,
    layout,
    inlineAnchor,
    content,
    depth,
    expanded,
  }: {
    dock: HTMLElement;
    layout: HTMLElement;
    inlineAnchor: HTMLElement | null;
    content: HTMLElement;
    depth: number;
    expanded: boolean;
  },
  setInline: React.Dispatch<React.SetStateAction<boolean>>
) {
  const viewport = inlineAnchor?.closest<HTMLElement>("[data-career-timeline]");
  const update = () => {
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
      const width = Math.min(
        expanded ? 720 : 320,
        Math.max(0, parent.width - 32)
      );
      const bottom = anchor.top - parent.top - 12 - depth * 40;
      Object.assign(content.style, {
        position: "fixed",
        width: `${width}px`,
        maxHeight: `${Math.max(0, bottom - 16)}px`,
        zIndex: expanded ? "11" : "10",
        left: `${Math.max(16, Math.min(anchor.right - parent.left - width - depth * 12, parent.width - width - 16))}px`,
      });
      content.style.top = `${Math.max(16, bottom - content.offsetHeight)}px`;
    }
    setInline((current) => (current === visible ? current : visible));
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
  return () => {
    resize?.disconnect();
    intersection?.disconnect();
    document.removeEventListener("scroll", update, true);
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
  };
}
