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
  fullScreen = false,
}: {
  dock: HTMLElement;
  layout: HTMLElement;
  inlineAnchor: HTMLElement | null;
  content: HTMLElement | null;
  depth: number;
  collapsed: boolean | null;
  fullScreen?: boolean;
}) {
  const [placement, setPlacement] = useState({
    inline: Boolean(inlineAnchor),
    mobile: false,
  });
  useLayoutEffect(() => {
    if (!content) return;
    return observePlacement(
      { dock, layout, inlineAnchor, content, depth, collapsed, fullScreen },
      setPlacement
    );
  }, [dock, layout, inlineAnchor, content, depth, collapsed, fullScreen]);
  return {
    inline: placement.inline,
    collapsed: fullScreen ? false : collapsed ?? placement.mobile,
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
    fullScreen,
  }: {
    dock: HTMLElement;
    layout: HTMLElement;
    inlineAnchor: HTMLElement | null;
    content: HTMLElement;
    depth: number;
    collapsed: boolean | null;
    fullScreen: boolean;
  },
  setPlacement: React.Dispatch<
    React.SetStateAction<{ inline: boolean; mobile: boolean }>
  >
) {
  const viewport = inlineAnchor?.closest<HTMLElement>("[data-career-timeline]");
  let wasInline: boolean | undefined;
  let animation: Animation | undefined;
  const update = () => {
    const before = content.getBoundingClientRect();
    const mobile = window.innerWidth < 768;
    const isCollapsed = collapsed ?? mobile;
    const rect = inlineAnchor?.getBoundingClientRect();
    const bounds = viewport?.getBoundingClientRect();
    const visible = Boolean(
      !fullScreen && !mobile && rect &&
      bounds &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > Math.max(0, bounds.top) &&
      rect.top < Math.min(window.innerHeight, bounds.bottom) &&
      rect.right > Math.max(0, bounds.left) &&
      rect.left < Math.min(window.innerWidth, bounds.right)
    );
    const parent = layout.getBoundingClientRect();
    const anchor = dock.getBoundingClientRect();
    if (fullScreen) {
      // The native top layer escapes the chat's transformed/clipped container
      // without moving or reconnecting the live iframe. Radix still owns dismissal.
      const viewport = window.visualViewport;
      const gap = mobile ? 8 : 16;
      Object.assign(content.style, {
        position: "fixed", inset: "auto",
        left: `${(viewport?.offsetLeft ?? 0) + gap}px`,
        top: `${(viewport?.offsetTop ?? 0) + gap}px`,
        width: `${Math.max(0, (viewport?.width ?? window.innerWidth) - gap * 2)}px`,
        height: `${Math.max(0, (viewport?.height ?? window.innerHeight) - gap * 2)}px`,
        maxHeight: "none", zIndex: "80",
      });
      if (content.showPopover && !content.matches(":popover-open")) content.showPopover();
    } else if (visible && rect) {
      Object.assign(content.style, {
        position: "fixed", left: `${rect.left - parent.left}px`,
        top: `${rect.top - parent.top}px`, width: `${rect.width}px`,
        maxHeight: "calc(100dvh - 160px)", zIndex: "10",
      });
      if (inlineAnchor) {
        // Once measured, reserve the actual popup height, including its folded
        // state. The initial placeholder must not leave space before the footer.
        inlineAnchor.style.minHeight = "0px";
        inlineAnchor.style.height = `${content.offsetHeight}px`;
      }
    } else {
      if (inlineAnchor) {
        if (mobile) {
          inlineAnchor.style.minHeight = "";
          inlineAnchor.style.height = "0px";
        }
        else if (wasInline) inlineAnchor.style.height = `${before.height}px`;
      }
      const width = Math.min(320, Math.max(0, parent.width - 32));
      const top = Math.max(12, (window.visualViewport?.offsetTop ?? 0) - parent.top + 12);
      const bottom = anchor.top - parent.top - 12 - depth * 40;
      Object.assign(content.style, {
        position: "fixed", width: `${width}px`,
        maxHeight: `${Math.max(0, mobile ? Math.min(parent.height, window.visualViewport?.height ?? window.innerHeight) - top - 16 : bottom - 16)}px`,
        zIndex: isCollapsed ? "10" : "11",
        left: `${mobile ? (parent.width - width) / 2 : Math.max(16, Math.min(anchor.right - parent.left - width - depth * 12, parent.width - width - 16))}px`,
      });
      content.style.top = `${mobile ? top + depth * 56 : Math.max(16, bottom - content.offsetHeight)}px`;
    }
    if (!fullScreen) content.style.height = "";
    // Animate only the change of placement. Native scrolling never trails the
    // pointer, and changing the slot cannot remount the live browser viewer.
    if (!fullScreen && wasInline !== undefined && wasInline !== visible && before.width &&
        content.animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      animation?.cancel();
      const after = content.getBoundingClientRect();
      if (after.width && after.height) animation = content.animate([
        { transformOrigin: "top left", transform: `translate(${before.left - after.left}px, ${before.top - after.top}px) scale(${before.width / after.width}, ${before.height / after.height})` },
        { transformOrigin: "top left", transform: "none" },
      ], { duration: 240, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
    }
    wasInline = visible;
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
  // Text/tool output can move an anchor without resizing the anchor itself.
  // Observe the conversation flow as well as scroll/viewport geometry.
  for (const child of Array.from(viewport?.children ?? [])) resize?.observe(child);
  let frame: number | undefined;
  const mutation = typeof MutationObserver === "undefined" || !viewport ? null : new MutationObserver(() => {
    for (const child of Array.from(viewport.children)) resize?.observe(child);
    if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; update(); });
  });
  if (viewport) mutation?.observe(viewport, { childList: true, subtree: true, characterData: true });
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
    animation?.cancel();
    mutation?.disconnect();
    if (frame !== undefined) cancelAnimationFrame(frame);
    resize?.disconnect();
    intersection?.disconnect();
    document.removeEventListener("scroll", update, true);
    window.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("resize", update);
    window.visualViewport?.removeEventListener("scroll", update);
  };
}
