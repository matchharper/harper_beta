import { FloatingPortalContainer } from "@/components/ui/floating-portal";
import { X } from "lucide-react";
import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { useCareerT } from "@/i18n/useCareerT";
import { useIsOrgLocaleProvided, useOrgT } from "@/i18n/org/OrgLocaleProvider";

type TalentCareerModalProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  headerActions?: React.ReactNode;
  closeActions?: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  onEscapeKeyDown?: React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
  >["onEscapeKeyDown"];
  onPointerDownOutside?: React.ComponentPropsWithoutRef<
    typeof DialogPrimitive.Content
  >["onPointerDownOutside"];
  /** Set false for a side panel that allows interacting with the workspace. */
  modal?: boolean;
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
  headerActions,
  closeActions,
  description,
  footer,
  ariaLabel,
  closeOnBackdrop = true,
  onEscapeKeyDown,
  onPointerDownOutside,
  modal = true,
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
  const orgT = useOrgT();
  const isOrg = useIsOrgLocaleProvided();
  const [portalContainer, setPortalContainer] =
    React.useState<HTMLDivElement | null>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const hasTitle = title !== undefined && title !== null;
  const hasDescription = description !== undefined && description !== null;
  const resolvedCloseButtonAriaLabel =
    closeButtonAriaLabel ??
    (isOrg
      ? orgT("modal.close", "모달 닫기")
      : t("career.common.talent_career_modal.18ppi14", "모달 닫기"));
  const fallbackAccessibleTitle = ariaLabel ?? resolvedCloseButtonAriaLabel;
  const closeButton = showCloseButton ? (
    <DialogPrimitive.Close
      className={cn(
        !closeActions && "absolute right-3 top-3 z-10",
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-tint",
        mobileBottomSheet &&
          "max-md:rounded-full max-md:border-0 max-md:bg-neutral-50 max-md:text-neutral-primary max-md:shadow-none max-md:hover:bg-bg-weak max-md:focus-visible:outline-2 max-md:focus-visible:outline-offset-2 max-md:focus-visible:outline-neutral-1000-a10",
        closeButtonClassName
      )}
      aria-label={resolvedCloseButtonAriaLabel}
    >
      <X
        aria-hidden="true"
        className={cn(
          "h-4 w-4",
          mobileBottomSheet && "max-md:h-[18px] max-md:w-[18px]"
        )}
      />
    </DialogPrimitive.Close>
  ) : null;

  return (
    <DialogPrimitive.Root
      modal={modal}
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-80 bg-overlay backdrop-blur-overlay",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            backdropClassName
          )}
        />
        <div
          className={cn(
            "fixed inset-0 z-80 flex items-center justify-center px-4 py-6 pointer-events-none",
            mobileBottomSheet
              ? "max-md:items-end max-md:px-0 max-md:pb-0 max-md:pt-6 md:px-6"
              : "sm:px-6",
            overlayClassName
          )}
        >
          <DialogPrimitive.Content
            aria-label={!hasTitle ? ariaLabel : undefined}
            onOpenAutoFocus={() => {
              returnFocusRef.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
            }}
            onCloseAutoFocus={(event) => {
              if (returnFocusRef.current?.isConnected) {
                event.preventDefault();
                returnFocusRef.current.focus({ preventScroll: true });
              }
            }}
            onEscapeKeyDown={onEscapeKeyDown}
            onPointerDownOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
              onPointerDownOutside?.(event);
            }}
            onInteractOutside={(event) => {
              if (!closeOnBackdrop) event.preventDefault();
            }}
            className={cn(
              "relative flex max-h-[calc(100dvh-3rem)] w-full max-w-[720px] flex-col rounded-modal border-(length:--modal-border-width) border-modal-border bg-modal bg-modal-image text-modal-foreground shadow-(--shadow-modal) backdrop-blur-modal outline-none pointer-events-auto",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
              mobileBottomSheet
                ? [
                    "max-md:flex max-md:max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] max-md:flex-col",
                    "max-md:rounded-b-none max-md:rounded-t-sheet max-md:border-b-0 max-md:pb-[env(safe-area-inset-bottom)]",
                    "max-md:data-[state=closed]:slide-out-to-bottom max-md:data-[state=open]:slide-in-from-bottom",
                    "max-md:data-[state=closed]:zoom-out-100 max-md:data-[state=open]:zoom-in-100",
                  ]
                : null,
              "duration-200",
              panelClassName
            )}
          >
            <FloatingPortalContainer.Provider value={portalContainer}>
              {closeActions && closeButton ? (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
                  {closeActions}
                  {closeButton}
                </div>
              ) : closeButton}
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
              {eyebrow || hasTitle || hasDescription || headerActions ? (
                <header
                  className={cn(
                    "shrink-0 rounded-t-[inherit] px-4 py-5 sm:px-5",
                    mobileBottomSheet && "max-md:shrink-0",
                    mobileBottomSheet &&
                      showCloseButton &&
                      "max-md:pr-16 sm:max-md:pr-16",
                    headerClassName
                  )}
                >
                  {eyebrow && (
                    <div className="text-[11px] font-heading uppercase tracking-[0.18em] text-neutral-soft">
                      {eyebrow}
                    </div>
                  )}
                  {headerActions ? (
                    <div
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-x-4 gap-y-3",
                        showCloseButton && "sm:pr-8"
                      )}
                    >
                      {hasTitle && (
                        <DialogPrimitive.Title
                          className={cn(
                            "mt-0 text-base font-heading tracking-[-0.02em] text-modal-foreground",
                            showCloseButton && "max-sm:pr-8"
                          )}
                        >
                          {title}
                        </DialogPrimitive.Title>
                      )}
                      <div className="ml-auto shrink-0 max-sm:flex max-sm:w-full max-sm:justify-end">
                        {headerActions}
                      </div>
                    </div>
                  ) : (
                    hasTitle && (
                      <DialogPrimitive.Title className="mt-0 text-base font-heading tracking-[-0.02em] text-modal-foreground">
                        {title}
                      </DialogPrimitive.Title>
                    )
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
                  "min-h-0 overflow-y-auto py-0",
                  mobileBottomSheet && "max-md:min-h-0 max-md:overflow-y-auto",
                  bodyClassName
                )}
              >
                {children}
              </div>
              {footer && (
                <footer
                  className={cn(
                    "shrink-0 rounded-b-[inherit] px-4 py-5 sm:px-5",
                    mobileBottomSheet && "max-md:shrink-0 pt-1 sm:pt-5",
                    footerClassName
                  )}
                >
                  {footer}
                </footer>
              )}
              {/* Portal wrappers must not participate in the modal flex layout. */}
              <div ref={setPortalContainer} className="fixed inset-0 pointer-events-none" />
            </FloatingPortalContainer.Provider>
          </DialogPrimitive.Content>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default TalentCareerModal;
