import { X } from "lucide-react";
import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { useCareerT } from "@/i18n/useCareerT";

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
  /** 모바일 화면에서 모달을 화면 하단에 붙는 BottomSheet 형태로 표시한다. */
  mobileBottomSheet?: boolean;
  overlayClassName?: string;
  backdropClassName?: string;
  panelClassName?: string;
  headerClassName?: string;
  descriptionClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
  closeButtonClassName?: string;
  closeButtonAriaLabel?: string;
};

/**
 * 최대한 Component를 사용하는 단계에서 className을 설정하지 않는 것이 좋다.
 */
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
  mobileBottomSheet = false,
  overlayClassName,
  backdropClassName,
  panelClassName,
  headerClassName,
  descriptionClassName,
  bodyClassName,
  footerClassName,
  closeButtonClassName,
  closeButtonAriaLabel,
}: TalentCareerModalProps) => {
  const t = useCareerT();
  const hasTitle = title !== undefined && title !== null;
  const hasDescription = description !== undefined && description !== null;
  const resolvedCloseButtonAriaLabel =
    closeButtonAriaLabel ??
    t("career.common.talent_career_modal.18ppi14", "모달 닫기");
  const fallbackAccessibleTitle = ariaLabel ?? resolvedCloseButtonAriaLabel;

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
            "fixed inset-0 z-80 bg-black/10 backdrop-blur-xs",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            backdropClassName
          )}
        />
        <div
          className={cn(
            "fixed inset-0 z-80 flex items-center justify-center px-4 py-6 sm:px-6 pointer-events-none",
            mobileBottomSheet &&
              "max-sm:items-end max-sm:px-0 max-sm:pb-0 max-sm:pt-6",
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
              mobileBottomSheet
                ? [
                    "max-sm:flex max-sm:max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] max-sm:flex-col",
                    "max-sm:rounded-b-none max-sm:rounded-t-[20px] max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]",
                    "max-sm:data-[state=closed]:slide-out-to-bottom max-sm:data-[state=open]:slide-in-from-bottom",
                    "max-sm:data-[state=closed]:zoom-out-100 max-sm:data-[state=open]:zoom-in-100",
                  ]
                : null,
              "duration-200",
              panelClassName
            )}
          >
            {mobileBottomSheet ? (
              <div
                aria-hidden="true"
                className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-neutral-1000-a10 sm:hidden"
              />
            ) : null}
            {showCloseButton ? (
              <DialogPrimitive.Close
                className={cn(
                  "absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-black/5",
                  closeButtonClassName
                )}
                aria-label={resolvedCloseButtonAriaLabel}
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            ) : null}
            {!hasTitle ? (
              <DialogPrimitive.Title className="sr-only">
                {fallbackAccessibleTitle}
              </DialogPrimitive.Title>
            ) : null}
            {!hasDescription ? (
              <DialogPrimitive.Description className="sr-only">
                {fallbackAccessibleTitle}
              </DialogPrimitive.Description>
            ) : null}
            {eyebrow || hasTitle || hasDescription ? (
              <header
                className={cn(
                  "border-b border-neutral-1000-a05 px-4 py-5 sm:px-5",
                  mobileBottomSheet && "max-sm:shrink-0",
                  headerClassName
                )}
              >
                {eyebrow && (
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-soft">
                    {eyebrow}
                  </div>
                )}
                {hasTitle && (
                  <DialogPrimitive.Title className="mt-0 text-base font-medium tracking-[-0.02em] text-neutral-primary">
                    {title}
                  </DialogPrimitive.Title>
                )}
                {hasDescription &&
                  (typeof description === "string" ? (
                    <DialogPrimitive.Description
                      className={cn(
                        "mt-2 max-w-[56ch] text-sm leading-relaxed text-neutral-muted",
                        descriptionClassName
                      )}
                      dangerouslySetInnerHTML={{ __html: description }}
                    />
                  ) : (
                    <DialogPrimitive.Description
                      className={cn(
                        "mt-2 max-w-[56ch] text-sm leading-relaxed text-neutral-muted",
                        descriptionClassName
                      )}
                    >
                      {description}
                    </DialogPrimitive.Description>
                  ))}
              </header>
            ) : null}
            <div
              className={cn(
                "py-0",
                mobileBottomSheet && "max-sm:min-h-0 max-sm:overflow-y-auto",
                bodyClassName
              )}
            >
              {children}
            </div>
            {footer && (
              <footer
                className={cn(
                  "px-4 py-5 sm:px-5",
                  mobileBottomSheet && "max-sm:shrink-0 pt-1 sm:pt-5",
                  footerClassName
                )}
              >
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
