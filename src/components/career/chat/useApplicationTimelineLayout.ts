import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** Follow content and measured composer clearance while the user follows the latest turn. */
export function useApplicationTimelineLayout(
  active: boolean,
  scrollRef: RefObject<HTMLDivElement | null>,
  following: boolean
) {
  const followingRef = useRef(following);
  useLayoutEffect(() => {
    followingRef.current = following;
  }, [following]);
  const measure = useCallback(() => {
    const el = scrollRef.current;
    return active && el ? Math.max(0, el.scrollHeight - el.clientHeight) : null;
  }, [active, scrollRef]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!active || !el) return;
    let frame = 0;
    const resize = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (followingRef.current)
          el.scrollTo({ top: measure() ?? 0, behavior: "auto" });
      });
    });
    const clearance = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (followingRef.current) el.scrollTo({top: measure() ?? 0, behavior: "auto"});
      });
    });
    // The parent owns the shared normal-chat clearance variable.
    if (el.parentElement) clearance.observe(el.parentElement, {attributes:true, attributeFilter:["style"]});
    resize.observe(el);
    if (el.firstElementChild) resize.observe(el.firstElementChild);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      clearance.disconnect();
    };
  }, [active, measure, scrollRef]);
  return measure;
}
