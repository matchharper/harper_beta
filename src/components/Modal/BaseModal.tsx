import React from "react";
import { Loader2 } from "lucide-react";
import { useMessages } from "@/i18n/useMessage";
import { BareButton } from "@/components/ui/button";

type BaseModalProps = {
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: React.ReactNode;
  cancelLabel?: React.ReactNode;
  isCloseButton?: boolean;
  isLoading?: boolean;
  isConfirmDisabled?: boolean;
  isCloseDisabled?: boolean;
  size?: "sm" | "md" | "lg";
};

const BaseModal = ({
  children,
  onClose,
  onConfirm,
  confirmLabel,
  cancelLabel,
  isCloseButton = true,
  isLoading = false,
  isConfirmDisabled = false,
  isCloseDisabled = false,
  size = "md",
}: BaseModalProps) => {
  const sizeClass = {
    sm: "max-w-[480px]",
    md: "max-w-[600px]",
    lg: "max-w-[720px]",
  }[size];
  const { m } = useMessages();

  return (
    <div className="fixed inset-0 z-50 flex w-full items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={() => {
          if (!isCloseDisabled) onClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-50 max-h-[calc(100svh-48px)] w-full overflow-y-auto rounded-[20px] border border-neutral-1000-a05 bg-bg-default p-5 shadow-[0_20px_60px_rgba(31,28,26,0.16)] outline-none transition-[max-width,padding] duration-300 ease-in-out sm:p-6 ${
          isCloseButton ? sizeClass : "max-w-[520px]"
        }`}
      >
        {children}

        <div className="mt-8 flex w-full flex-row items-center justify-end gap-2">
          {isCloseButton && (
            <BareButton
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-medium text-neutral-muted transition-colors duration-200 hover:bg-bg-weak hover:text-neutral-primary disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (!isCloseDisabled) onClose();
              }}
              disabled={isCloseDisabled}
            >
              {cancelLabel ?? m.system.close}
            </BareButton>
          )}
          <BareButton
            type="button"
            className="inline-flex h-11 min-w-[92px] items-center justify-center rounded-xl bg-black px-5 text-sm font-medium text-neutral-00 transition-colors duration-200 hover:bg-neutral-primary disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onConfirm}
            disabled={isLoading || isConfirmDisabled}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              confirmLabel
            )}
          </BareButton>
        </div>
      </div>
    </div>
  );
};

export default React.memo(BaseModal);
