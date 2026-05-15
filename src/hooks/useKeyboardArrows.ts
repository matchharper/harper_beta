import { useEffect } from "react";

const isInteractiveTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
};

export function useKeyboardArrows({
  enabled,
  onArrowLeft,
  onArrowRight,
}: {
  enabled: boolean;
  onArrowLeft: () => void;
  onArrowRight: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const handle = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isInteractiveTarget(event.target)) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        onArrowLeft();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onArrowRight();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [enabled, onArrowLeft, onArrowRight]);
}
