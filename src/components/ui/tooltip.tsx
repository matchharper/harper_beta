"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-10050 overflow-hidden rounded-md bg-neutral-1000 px-3 py-1.5 text-xs text-neutral-00 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--radix-tooltip-content-transform-origin)",
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

type TooltipSide = "bottom" | "top" | "left" | "right";
type TooltipAlign = "start" | "center" | "end";

export function Tooltips({
  children,
  text,
  side = "bottom",
}: {
  children: React.ReactNode;
  text: string;
  side?: TooltipSide;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        {text && (
          <TooltipContent
            side={side}
            align="start"
            className="mb-px max-w-[400px] whitespace-pre-wrap wrap-break-word"
          >
            <p>{text}</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export function ResponsiveLightTooltip({
  align = "start",
  children,
  className,
  contentClassName,
  side = "bottom",
  trigger,
  triggerClassName,
}: {
  align?: TooltipAlign;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  side?: TooltipSide;
  trigger: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const pinnedRef = React.useRef(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const tooltipId = React.useId();
  const triggerBaseClassName =
    "inline-flex items-center gap-1.5 rounded-[4px] py-1 text-left text-[13px] font-normal leading-5 text-neutral-muted transition hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/10";

  const closeTooltip = React.useCallback(() => {
    pinnedRef.current = false;
    setOpen(false);
  }, []);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (contentRef.current?.contains(target)) return;

      closeTooltip();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [closeTooltip, open]);

  const openTooltip = () => setOpen(true);
  const closeTooltipIfUnpinned = () => {
    if (!pinnedRef.current) setOpen(false);
  };
  const togglePinned = () => {
    const nextPinned = !pinnedRef.current;
    pinnedRef.current = nextPinned;
    setOpen(nextPinned);
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") return;
    closeTooltip();
  };

  return (
    <div className={cn("relative w-full", className)}>
      <TooltipProvider delayDuration={100}>
        <Tooltip
          open={open}
          onOpenChange={(nextOpen) => {
            if (nextOpen || !pinnedRef.current) {
              setOpen(nextOpen);
            }
          }}
        >
          <TooltipTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-controls={tooltipId}
              aria-expanded={open}
              className={cn(triggerBaseClassName, triggerClassName)}
              onBlur={closeTooltipIfUnpinned}
              onClick={togglePinned}
              onFocus={openTooltip}
              onKeyDown={handleKeyDown}
              onPointerEnter={openTooltip}
              onPointerLeave={closeTooltipIfUnpinned}
            >
              {trigger}
            </button>
          </TooltipTrigger>
          <TooltipContent
            ref={contentRef}
            id={tooltipId}
            side={isMobile ? "bottom" : side}
            align={isMobile ? "center" : align}
            className={cn(
              "max-w-[min(520px,calc(100vw-32px))] text-[13px] md:text-[14px] font-normal whitespace-pre-wrap wrap-break-word rounded-lg border border-black/5 bg-white/80 px-5 py-5 leading-5 text-black shadow-[0_14px_36px_rgba(0,0,0,0.12)] backdrop-blur-sm",
              contentClassName
            )}
          >
            {children}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQueryList.matches);

    updateMatches();
    mediaQueryList.addEventListener("change", updateMatches);
    return () => {
      mediaQueryList.removeEventListener("change", updateMatches);
    };
  }, [query]);

  return matches;
}
