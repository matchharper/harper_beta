/** Promote the original bubble to the browser top layer without moving React's DOM. */
export function liftMessageBubble(bubble: HTMLElement, destination: HTMLElement) {
  const source = bubble.getBoundingClientRect();
  const computed = getComputedStyle(bubble);
  const originalStyle = bubble.getAttribute("style");
  const originalPopover = bubble.getAttribute("popover");
  const originalScrollTop = bubble.scrollTop;
  const placeholder = document.createElement("div");
  placeholder.dataset.chatMessagePlaceholder = "true";
  placeholder.setAttribute("aria-hidden", "true");
  Object.assign(placeholder.style, {
    width: `${source.width}px`, height: `${source.height}px`,
    margin: computed.margin, alignSelf: computed.alignSelf,
    flexShrink: "0", visibility: "hidden", pointerEvents: "none",
  });
  bubble.before(placeholder);

  // Popover's UA styles would otherwise add a border, padding and canvas fill.
  const surface = {
    padding: computed.padding, border: computed.border,
    background: computed.backgroundColor === "rgba(0, 0, 0, 0)"
      ? "rgba(245, 245, 245, 1)" : computed.background,
    color: computed.color,
  };
  // The bubble remains outside Dialog.Content in the DOM. Keep its native scroll
  // gesture from reaching the modal's document-level background scroll lock.
  const containScroll = (event: Event) => event.stopPropagation();
  bubble.addEventListener("touchmove", containScroll, { passive: true });
  bubble.addEventListener("wheel", containScroll, { passive: true });
  let animation: Animation | undefined;
  let restored = false;
  let returning = false;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animate = (frames: Keyframe[], duration: number) => {
    animation?.cancel();
    if (reducedMotion || !bubble.animate) return Promise.resolve();
    animation = bubble.animate(frames, {
      duration, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both",
    });
    return animation.finished.then(() => {}, () => {});
  };
  const transformTo = (left: number, top: number, scale: number) =>
    `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
  const focusFrame = () => {
    const rect = destination.getBoundingClientRect();
    const scale = rect.width / source.width;
    return { transform: transformTo(rect.left, rect.top, scale), maxHeight: `${rect.height / scale}px` };
  };
  const restore = () => {
    if (restored) return;
    restored = true;
    animation?.cancel();
    bubble.removeEventListener("touchmove", containScroll);
    bubble.removeEventListener("wheel", containScroll);
    window.visualViewport?.removeEventListener("resize", reposition);
    window.visualViewport?.removeEventListener("scroll", reposition);
    if (bubble.isConnected && bubble.matches(":popover-open")) bubble.hidePopover();
    if (originalPopover === null) bubble.removeAttribute("popover");
    else bubble.setAttribute("popover", originalPopover);
    bubble.removeAttribute("data-chat-message-lifted");
    if (originalStyle === null) bubble.removeAttribute("style");
    else bubble.setAttribute("style", originalStyle);
    bubble.scrollTop = originalScrollTop;
    placeholder.remove();
  };
  const reposition = () => {
    if (restored || returning) return;
    const current = getComputedStyle(bubble).transform;
    const frame = focusFrame();
    Object.assign(bubble.style, frame);
    void animate([{ transform: current }, frame], 240);
  };

  bubble.setAttribute("popover", "manual");
  bubble.dataset.chatMessageLifted = "true";
  Object.assign(bubble.style, surface, {
    position: "fixed", inset: "auto", left: "0", top: "0", margin: "0",
    width: `${source.width}px`, minWidth: "0", maxWidth: "none", height: "auto",
    boxSizing: "border-box", transformOrigin: "top left", overflow: "auto",
    overscrollBehavior: "contain", pointerEvents: "auto", animation: "none",
    transition: "none", willChange: "transform", scrollbarWidth: "none",
    filter: "drop-shadow(0 12px 24px rgb(0 0 0 / 0.12))",
  });
  bubble.showPopover();
  const frame = focusFrame();
  Object.assign(bubble.style, frame);
  void animate([
    { transform: transformTo(source.left, source.top, 1), maxHeight: `${source.height}px` }, frame,
  ], 440);
  // Start observing after the initial notification so it cannot replace the opening flight.
  let firstResize = true;
  const resizeObserver = new ResizeObserver(() => {
    if (firstResize) { firstResize = false; return; }
    reposition();
  });
  resizeObserver.observe(destination);
  window.visualViewport?.addEventListener("resize", reposition);
  window.visualViewport?.addEventListener("scroll", reposition);

  return {
    restore: () => { resizeObserver.disconnect(); restore(); },
    returnToSource: async () => {
      if (restored || returning) return;
      returning = true;
      resizeObserver.disconnect();
      const current = getComputedStyle(bubble);
      const from = { transform: current.transform, maxHeight: current.maxHeight };
      const origin = placeholder.getBoundingClientRect();
      const to = { transform: transformTo(origin.left, origin.top, 1), maxHeight: `${origin.height}px` };
      bubble.scrollTop = originalScrollTop;
      Object.assign(bubble.style, to);
      await animate([from, to], 280);
      restore();
    },
  };
}
