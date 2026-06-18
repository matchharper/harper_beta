import { useEffect } from "react";

function isFormEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true']")
  );
}

export function useMatchingTalentPoolHotkeys(args: {
  enabled: boolean;
  onTagIndex: (index: number) => void;
}) {
  const { enabled, onTagIndex } = args;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (isFormEditingTarget(event.target)) return;
      if (!/^[1-5]$/.test(event.key)) return;

      event.preventDefault();
      onTagIndex(Number(event.key) - 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onTagIndex]);
}
