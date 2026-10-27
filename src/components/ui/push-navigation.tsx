"use client";

import {
  createContext,
  useContext,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const PushNavigationContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
  portalContainer: HTMLDivElement | null;
} | null>(null);

export function PushNavigationFrame({
  children,
  className,
  surfaceClassName,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  className?: string;
  surfaceClassName?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null
  );
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  return (
    <PushNavigationContext.Provider value={{ open, setOpen, portalContainer }}>
      <div
        ref={setPortalContainer}
        className={cn(
          "relative isolate h-full w-full overflow-hidden bg-neutral-50 [--push-navigation-width:min(75vw,360px)]",
          className
        )}
      >
        <div
          data-push-navigation-surface
          className={cn(
            "relative z-10 flex h-full w-full flex-col bg-bg-default transition-[translate,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            open
              ? "translate-x-[var(--push-navigation-width)] shadow-[-12px_0_32px_-12px_rgba(0,0,0,0.12)]"
              : "translate-x-0",
            surfaceClassName
          )}
        >
          {children}
        </div>
      </div>
    </PushNavigationContext.Provider>
  );
}

export function usePushNavigation() {
  const context = useContext(PushNavigationContext);
  if (!context) {
    throw new Error("Push navigation requires PushNavigationFrame");
  }
  return context;
}

export function PushNavigationContent({
  className,
  overlayClassName,
  ...props
}: ComponentPropsWithoutRef<typeof DialogContent>) {
  const { portalContainer } = usePushNavigation();
  return (
    <DialogContent
      hideCloseButton
      aria-describedby={undefined}
      {...props}
      portalContainer={portalContainer}
      overlayClassName={cn(
        "absolute left-[var(--push-navigation-width)] z-20 bg-transparent backdrop-blur-none data-[state=open]:animate-none data-[state=closed]:animate-none",
        overlayClassName
      )}
      className={cn(
        "absolute !inset-y-0 !left-0 !right-auto !top-0 z-0 flex h-full w-[var(--push-navigation-width)] max-w-none !translate-x-0 !translate-y-0 flex-col gap-0 rounded-none border-0 bg-neutral-50 p-0 shadow-none duration-300 data-[state=open]:animate-none data-[state=closed]:fade-out-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none",
        className
      )}
    />
  );
}
