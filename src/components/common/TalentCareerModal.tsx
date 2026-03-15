import { X } from "lucide-react";
import React, { useEffect, useId } from "react";
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
  const titleId = useId();
  const descriptionId = useId();
  const hasTitle = title !== undefined && title !== null;
  const hasDescription = description !== undefined && description !== null;

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 sm:px-6",
        overlayClassName
      )}
    >
      <button
        type="button"
        aria-label="모달 배경 닫기"
        className={cn(
          "absolute inset-0 bg-black/55 backdrop-blur-[4px]",
          backdropClassName
        )}
        onClick={() => {
          if (closeOnBackdrop) onClose();
        }}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={hasTitle ? titleId : undefined}
        aria-describedby={hasDescription ? descriptionId : undefined}
        aria-label={!hasTitle ? ariaLabel : undefined}
        className={cn(
          "relative z-[1] w-full max-w-[720px] overflow-hidden rounded-xl border border-hblack200 bg-hblack000 shadow-[0_24px_80px_rgba(17,24,39,0.18)]",
          panelClassName
        )}
      >
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "absolute right-4 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md bg-hblack50 text-hblack600 transition-colors hover:border-xprimary hover:text-xprimary",
              closeButtonClassName
            )}
            aria-label="모달 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {eyebrow || hasTitle || hasDescription ? (
          <header
            className={cn(
              "border-b border-hblack100/80 px-4 py-5 sm:px-5",
              headerClassName
            )}
          >
            {eyebrow ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-hblack500">
                {eyebrow}
              </div>
            ) : null}
            {hasTitle ? (
              <h2
                id={titleId}
                className="mt-2 text-lg font-semibold tracking-[-0.02em] text-hblack1000"
              >
                {title}
              </h2>
            ) : null}
            {hasDescription ? (
              <p
                id={descriptionId}
                className="mt-2 max-w-[56ch] text-sm leading-relaxed text-hblack600 sm:text-[15px]"
              >
                {description}
              </p>
            ) : null}
          </header>
        ) : null}
        <div className={cn("py-0", bodyClassName)}>{children}</div>
        {footer ? (
          <footer className={cn("px-4 py-5 sm:px-5", footerClassName)}>
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
};

export default TalentCareerModal;
