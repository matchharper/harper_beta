import { Loader2 } from "lucide-react";
import React from "react";
import { useMessages } from "@/i18n/useMessage";
import { BareButton } from "@/components/ui/button";

const BaseModal = ({
  children,
  onClose,
  onConfirm,
  confirmLabel,
  isCloseButton = true,
  isLoading = false,
  size = "md",
}: {
  children: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string | React.ReactNode;
  isCloseButton?: boolean;
  isLoading?: boolean;
  size?: "sm" | "md" | "lg";
}) => {
  const sizeClass = {
    sm: "max-w-[480px]",
    md: "max-w-[600px]",
    lg: "max-w-[720px]",
  }[size];
  const { m } = useMessages();

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center px-4 w-full
  `}
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div
        className={`relative z-50 w-full rounded-[28px] bg-bg-default p-6 shadow-sm border border-neutral-1000-a05
  transition-[max-width,padding] duration-300 ease-in-out ${
    isCloseButton ? `${sizeClass}` : "max-w-[520px]"
  }`}
      >
        {children}

        <div className="w-full mt-8 flex flex-row items-end justify-end gap-2">
          {isCloseButton && (
            <BareButton
              className={`transition-colors duration-200 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-neutral-muted hover:bg-bg-default
                ${
                  isCloseButton
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                }
              `}
              onClick={onClose}
            >
              {m.system.close}
            </BareButton>
          )}
          <BareButton
            className="transition-colors duration-200 inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-sm font-medium text-neutral-00 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
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
