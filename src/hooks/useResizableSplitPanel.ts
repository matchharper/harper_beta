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
  onResizeEnd?: (widthPct: number) => void;
  step?: number;
};

type Result = {
  containerRef: RefObject<HTMLDivElement | null>;
  widthPct: number;
  handleResizeStart: (clientX: number) => void;
  handleResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

const clampPct = (value: number, minPct: number, maxPct: number) =>
  Math.min(maxPct, Math.max(minPct, value));

export function useResizableSplitPanel({
  enabled,
  minPct,
  maxPct,
  defaultPct,
  onResizeEnd,
  step = 2,
}: Options): Result {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [widthPct, setWidthPct] = useState(() =>
    clampPct(defaultPct, minPct, maxPct)
  );
  const widthPctRef = useRef(widthPct);

  const setClampedWidthPct = useCallback(
    (value: number) => {
      const clamped = clampPct(value, minPct, maxPct);
      widthPctRef.current = clamped;
      setWidthPct(clamped);
      return clamped;
    },
    [maxPct, minPct]
  );

  const updateWidth = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return null;

      const bounds = container.getBoundingClientRect();
      if (bounds.width <= 0) return null;

      const nextPct = ((clientX - bounds.left) / bounds.width) * 100;
      return setClampedWidthPct(nextPct);
    },
    [setClampedWidthPct]
  );

  useEffect(() => {
    if (draggingRef.current) return;
    setClampedWidthPct(defaultPct);
  }, [defaultPct, setClampedWidthPct]);

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
      onResizeEnd?.(widthPctRef.current);
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
  }, [enabled, onResizeEnd, updateWidth]);

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
        const nextWidthPct = setClampedWidthPct(widthPctRef.current - step);
        onResizeEnd?.(nextWidthPct);
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        const nextWidthPct = setClampedWidthPct(widthPctRef.current + step);
        onResizeEnd?.(nextWidthPct);
      }
    },
    [enabled, onResizeEnd, setClampedWidthPct, step]
  );

  return { containerRef, widthPct, handleResizeStart, handleResizeKeyDown };
}
