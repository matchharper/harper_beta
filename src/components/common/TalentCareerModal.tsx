import { X } from "lucide-react";
import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

type TalentCareerModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  overlayClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeButtonClassName?: string;
};

const TalentCareerModal = ({
  open,
  onClose,
  children,
  eyebrow,
  title,
  description,
  footer,
  ariaLabel,
  closeOnBackdrop = true,
  showCloseButton = true,
  overlayClassName,
  backdropClassName,
  panelClassName,
  headerClassName,
  bodyClassName,
  footerClassName,
  closeButtonClassName,
}: TalentCareerModalProps) => {
  const hasTitle = title !== undefined && title !== null;
  const hasDescription = description !== undefined && description !== null;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-80 bg-black/55 backdrop-blur-xs",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            backdropClassName
          )}
        />
        <div
          className={cn(
            "fixed inset-0 z-80 flex items-center justify-center px-4 py-6 sm:px-6 pointer-events-none",
            overlayClassName
          )}
        >
          <DialogPrimitive.Content
            aria-label={!hasTitle ? ariaLabel : undefined}
            onPointerDownOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
            }}
            className={cn(
              "relative w-full max-w-[720px] overflow-hidden rounded-xl border border-neutral-1000-a10 bg-bg-default shadow-[0_24px_80px_rgba(17,24,39,0.2)] outline-none pointer-events-auto",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              "duration-200",
              panelClassName
            )}
          >
            {showCloseButton ? (
              <DialogPrimitive.Close
                className={cn(
                  "absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                  closeButtonClassName
                )}
                aria-label="모달 닫기"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            ) : null}
            {eyebrow || hasTitle || hasDescription ? (
              <header
                className={cn(
                  "border-b border-neutral-1000-a05 px-4 py-5 sm:px-5",
                  headerClassName
                )}
              >
                {eyebrow && (
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-soft">
                    {eyebrow}
                  </div>
                )}
                {hasTitle && (
                  <DialogPrimitive.Title className="mt-2 text-base font-semibold tracking-[-0.02em] text-neutral-primary">
                    {title}
                  </DialogPrimitive.Title>
                )}
                {hasDescription &&
                  (typeof description === "string" ? (
                    <DialogPrimitive.Description
                      className="mt-2 max-w-[56ch] text-sm leading-relaxed text-neutral-muted"
                      dangerouslySetInnerHTML={{ __html: description }}
                    />
                  ) : (
                    <DialogPrimitive.Description className="mt-2 max-w-[56ch] text-sm leading-relaxed text-neutral-muted">
                      {description}
                    </DialogPrimitive.Description>
                  ))}
              </header>
            ) : null}
            <div className={cn("py-0", bodyClassName)}>{children}</div>
            {footer && (
              <footer className={cn("px-4 py-5 sm:px-5", footerClassName)}>
                {footer}
              </footer>
            )}
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default TalentCareerModal;
