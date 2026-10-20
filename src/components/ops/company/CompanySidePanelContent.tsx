import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

// Domain layout only; the shared Dialog owns focus, dismissal and scroll locking.
export function CompanySidePanelContent({
  title,
  description,
  headerAction,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof DialogContent>, "title"> & {
  title: string;
  description: ReactNode;
  headerAction?: ReactNode;
}) {
  return (
    <DialogContent
      {...props}
      className={cn(
        "left-auto right-0 top-0 flex h-dvh w-full max-w-2xl translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-r-0 p-0 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 motion-reduce:animate-none",
        className
      )}
    >
      <header className="shrink-0 border-b border-neutral-1000-a10 px-4 py-4 pr-12 sm:px-5 sm:pr-12">
        {headerAction}
        <DialogTitle className="break-words text-base font-medium">
          {title}
        </DialogTitle>
        <DialogDescription className="mt-1 text-xs leading-5 text-neutral-muted">
          {description}
        </DialogDescription>
      </header>
      {children}
    </DialogContent>
  );
}
