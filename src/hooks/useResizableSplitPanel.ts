import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

type Options = {
  enabled: boolean;
  minPct: number;
  maxPct: number;
  defaultPct: number;
  step?: number;
};

type Result = {
  containerRef: RefObject<HTMLDivElement>;
  widthPct: number;
  handleResizeStart: (clientX: number) => void;
  handleResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

export function useResizableSplitPanel({
  enabled,
  minPct,
  maxPct,
  defaultPct,
  step = 2,
}: Options): Result {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [widthPct, setWidthPct] = useState(defaultPct);

  const updateWidth = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) return;

      const nextPct = ((clientX - bounds.left) / bounds.width) * 100;
      const clamped = Math.min(maxPct, Math.max(minPct, nextPct));
      setWidthPct(clamped);
    },
    [minPct, maxPct]
  );

  useEffect(() => {
    if (!enabled) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingRef.current) return;
      event.preventDefault();
      updateWidth(event.clientX);
    };

    const handlePointerUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [enabled, updateWidth]);

  const handleResizeStart = useCallback(
    (clientX: number) => {
      if (!enabled) return;
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      updateWidth(clientX);
    },
    [enabled, updateWidth]
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!enabled) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setWidthPct((current) => Math.max(minPct, current - step));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setWidthPct((current) => Math.min(maxPct, current + step));
      }
    },
    [enabled, minPct, maxPct, step]
  );

  return { containerRef, widthPct, handleResizeStart, handleResizeKeyDown };
}
