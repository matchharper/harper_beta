import { FloatingPortalContainer } from "@/components/ui/floating-portal";
import { ChevronLeft, X } from "lucide-react";
import React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { useCareerT } from "@/i18n/useCareerT";
import { useIsOrgLocaleProvided, useOrgT } from "@/i18n/org/OrgLocaleProvider";

export type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  headerActions?: React.ReactNode;
  closeActions?: React.ReactNode;
  backAction?: { label: string; onClick: () => void };
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

/** 모달과 바텀시트가 서로 다르게 배치·표시하는 부분. */
export type ModalShellLayout = {
  positioner: string;
  panel: string;
  /** 호출부 panelClassName보다 우선해야 하는 형태(높이·모서리 등). */
  panelOverride?: string;
  headerButton: string;
  headerIcon: string;
  /** 닫기 버튼과 제목이 겹치지 않도록 호출부 headerClassName 뒤에 적용한다. */
  headerWithCloseButton?: string;
  footer?: string;
};

export const MODAL_SURFACE_CLASS_NAME =
  "relative flex w-full max-w-[720px] flex-col border-(length:--modal-border-width) border-modal-border bg-modal bg-modal-image text-modal-foreground shadow-(--shadow-modal) backdrop-blur-modal outline-none pointer-events-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200";

export const MODAL_HEADER_BUTTON_CLASS_NAME =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center transition-colors";

/**
 * TalentCareerModal과 BottomSheetModal이 공유하는 Radix Dialog 골격.
 * 포커스 관리, 배경 클릭·Escape 처리, 헤더·본문·푸터 배치를 담당한다.
 */
const ModalShell = ({
  open,
  onClose,
  children,
  eyebrow,
  title,
  headerActions,
  closeActions,
  backAction,
  description,
  footer,
  ariaLabel,
  closeOnBackdrop = true,
  onEscapeKeyDown,
  onPointerDownOutside,
  modal = true,
  showCloseButton = true,
  overlayClassName,
  backdropClassName,
  panelClassName,
  headerClassName,
  descriptionClassName,
  bodyClassName,
  footerClassName,
  closeButtonClassName,
  closeButtonAriaLabel,
  layout,
}: ModalShellProps & { layout: ModalShellLayout }) => {
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
        layout.headerButton,
        !closeActions && "absolute right-3 top-3 z-10",
        closeButtonClassName
      )}
      aria-label={resolvedCloseButtonAriaLabel}
    >
      <X aria-hidden="true" className={layout.headerIcon} />
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
            "fixed inset-0 z-80 bg-black/5",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            backdropClassName
          )}
        />
        <div className={cn(layout.positioner, overlayClassName)}>
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
            className={cn(layout.panel, panelClassName, layout.panelOverride)}
          >
            <FloatingPortalContainer.Provider value={portalContainer}>
              {backAction && (
                <button
                  type="button"
                  onClick={backAction.onClick}
                  aria-label={backAction.label}
                  className={cn(layout.headerButton, "absolute left-3 top-3 z-10")}
                >
                  <ChevronLeft aria-hidden="true" className={layout.headerIcon} />
                </button>
              )}
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
                    backAction && "pl-16 sm:pl-16",
                    headerClassName,
                    showCloseButton && layout.headerWithCloseButton
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
                className={cn("min-h-0 overflow-y-auto py-0", bodyClassName)}
              >
                {children}
              </div>
              {footer && (
                <footer
                  className={cn(
                    "shrink-0 rounded-b-[inherit] px-4 py-5 sm:px-5",
                    layout.footer,
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

export default ModalShell;
