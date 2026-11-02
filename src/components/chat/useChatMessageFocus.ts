import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { liftMessageBubble } from "./messageBubbleLift";

export function useChatMessageFocus(containerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  const [selection, setSelection] = useState<{ bubble: HTMLElement; width: number; height: number } | null>(null);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [closing, setClosing] = useState(false);
  const flight = useRef<ReturnType<typeof liftMessageBubble> | null>(null);
  const closingRef = useRef(false);
  const close = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    await flight.current?.returnToSource();
    setSelection(null);
    setClosing(false);
    closingRef.current = false;
  }, []);

  useLayoutEffect(() => {
    if (!selection || !target) return;
    const lifted = liftMessageBubble(selection.bubble, target);
    flight.current = lifted;
    return () => {
      lifted.restore();
      flight.current = null;
    };
  }, [selection, target]);

  useEffect(() => {
    const container = containerRef.current?.closest<HTMLElement>("[data-career-message-container]");
    if (!enabled || !container) return;
    const mobile = window.matchMedia?.("(max-width: 767px)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let startX = 0, startY = 0;
    let opened = false;
    const cancel = () => clearTimeout(timer);
    const down = (event: PointerEvent) => {
      cancel();
      if (!mobile?.matches || (event.pointerType !== "touch" && event.pointerType !== "pen")) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [contenteditable=true]")) return;
      const bubble = target.closest<HTMLElement>("[data-chat-message-bubble]");
      if (!bubble || !container.contains(bubble) || bubble.hasAttribute("data-chat-message-lifted")) return;
      opened = false;
      startX = event.clientX; startY = event.clientY;
      timer = setTimeout(() => {
        if (!bubble.isConnected) return;
        const rect = bubble.getBoundingClientRect();
        // Dismiss the composer keyboard; viewport changes retarget the same bubble.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        window.getSelection()?.removeAllRanges();
        opened = true;
        setSelection({ bubble, width: rect.width, height: rect.height });
      }, 450);
    };
    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) cancel();
    };
    const context = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (mobile?.matches && target.closest("[data-chat-message-bubble]") && !target.closest("a, button, input, textarea")) event.preventDefault();
    };
    const click = (event: MouseEvent) => {
      if (opened) { event.preventDefault(); event.stopPropagation(); opened = false; }
    };
    const breakpoint = () => { if (!mobile?.matches) void close(); };
    container.addEventListener("pointerdown", down);
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerup", cancel);
    container.addEventListener("pointercancel", cancel);
    container.addEventListener("contextmenu", context);
    container.addEventListener("click", click, true);
    container.addEventListener("scroll", cancel, true);
    mobile?.addEventListener("change", breakpoint);
    return () => {
      cancel();
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerup", cancel);
      container.removeEventListener("pointercancel", cancel);
      container.removeEventListener("contextmenu", context);
      container.removeEventListener("click", click, true);
      container.removeEventListener("scroll", cancel, true);
      mobile?.removeEventListener("change", breakpoint);
    };
  }, [containerRef, enabled, close]);

  return { selection, closing, close, targetRef: setTarget };
}
