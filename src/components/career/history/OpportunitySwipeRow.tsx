import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SwipeAction = { label: string; icon: ReactNode; onSelect: () => void };
type Gesture = {
  id: number;
  x: number;
  y: number;
  width: number;
  threshold: number;
  horizontal: boolean;
  distance: number;
};

/** A touch-only shortcut to the same actions available in the card's buttons. */
export function OpportunitySwipeRow({
  children,
  disabled,
  positive,
  negative,
  preview = false,
}: {
  children: ReactNode;
  disabled: boolean;
  positive: SwipeAction;
  negative: SwipeAction;
  /** Local interaction preview: also accept mouse input on wide screens. */
  preview?: boolean;
}) {
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const action = offset >= 0 ? positive : negative;

  const reset = () => {
    gesture.current = null;
    setDragging(false);
    setReady(false);
    setOffset(0);
  };

  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const commit =
      !cancelled &&
      !disabled &&
      current.horizontal &&
      Math.abs(current.distance) >= current.threshold;
    reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (commit) (current.distance > 0 ? positive : negative).onSelect();
  };

  return (
    <div
      className="relative isolate -my-1 overflow-hidden rounded-lg py-1"
      style={{ touchAction: disabled ? "auto" : "pan-y pinch-zoom" }}
      onClickCapture={(event) => {
        if (!suppressClick.current || event.detail === 0) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClick.current = false;
      }}
      onPointerDown={(event) => {
        if (!event.isPrimary) {
          reset();
          return;
        }
        suppressClick.current = false;
        if (
          disabled ||
          (!preview &&
            (event.pointerType === "mouse" ||
              !window.matchMedia("(max-width: 767px)").matches)) ||
          event.button > 0 ||
          (event.target as HTMLElement).closest(
            "button,a,input,textarea,select,[data-clickable-panel-ignore='true']"
          )
        )
          return;
        const width = event.currentTarget.getBoundingClientRect().width;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          width,
          threshold: Math.min(180, Math.max(156, width * 0.44)),
          horizontal: false,
          distance: 0,
        };
      }}
      onPointerMove={(event) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        if (disabled) {
          reset();
          return;
        }
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (!current.horizontal) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
          if (Math.abs(dy) > Math.abs(dx) * 1.25) {
            gesture.current = null;
            return;
          }
          if (Math.abs(dx) <= Math.abs(dy) * 1.25) return;
          current.horizontal = true;
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        current.distance = dx;
        const distance = Math.abs(dx);
        // Keep the row under the finger, with gentle resistance beyond commitment.
        const travel = Math.min(
          current.width * 0.8,
          distance <= current.threshold
            ? distance
            : current.threshold + (distance - current.threshold) * 0.35
        );
        setOffset(Math.sign(dx) * travel);
        setReady(distance >= current.threshold);
      }}
      onPointerUp={(event) => finish(event)}
      onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => {
        // Touch starts with implicit capture on the child. Transferring it to
        // this row emits a bubbling lost-capture event from that child.
        if (event.target === event.currentTarget) finish(event, true);
      }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 inset-y-1 flex items-center overflow-hidden rounded-lg bg-bg-weak px-3",
          !preview && "md:hidden",
          offset >= 0 ? "justify-start" : "justify-end"
        )}
      >
        <div
          className={cn(
            "relative flex h-9 items-center overflow-hidden rounded-full bg-bg-floating text-xs font-normal transition-colors duration-150 motion-reduce:transition-none",
            ready
              ? offset > 0
                ? "text-positive-strong"
                : "text-critical-strong"
              : "text-neutral-muted"
          )}
          style={{
            width: Math.max(36, Math.abs(offset) - 24),
            opacity: Math.min(1, Math.abs(offset) / 44),
          }}
        >
          <span className="absolute left-2.5 flex size-4 items-center justify-center [&_svg]:size-4 [&_svg]:stroke-[1.5]">
            {action.icon}
          </span>
          <span
            className="absolute left-9 whitespace-nowrap leading-4 transition-opacity duration-100 motion-reduce:transition-none"
            style={{
              opacity: Math.min(1, Math.max(0, (Math.abs(offset) - 104) / 24)),
            }}
          >
            {action.label}
          </span>
        </div>
      </div>
      <div
        className={cn(
          "relative",
          dragging
            ? "select-none"
            : "transition-transform duration-200 ease-out motion-reduce:transition-none"
        )}
        style={{
          transform: offset ? `translate3d(${offset}px, 0, 0)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
