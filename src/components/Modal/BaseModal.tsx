import { Loader2 } from "lucide-react";
import React from "react";
import { useMessages } from "@/i18n/useMessage";

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
  confirmLabel: string;
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
        className={`relative z-50 w-full rounded-[28px] bg-ngray300 p-6 shadow-sm border border-white/10
  transition-[max-width,padding] duration-300 ease-in-out ${
    isCloseButton ? `${sizeClass}` : "max-w-[520px]"
  }`}
      >
        {children}

        <div className="w-full mt-8 flex flex-row items-end justify-end gap-2">
          {isCloseButton && (
            <button
              className={`transition-colors duration-200 inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-medium text-white hover:bg-white/5 
                ${
                  isCloseButton
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                }
              `}
              onClick={onClose}
            >
              {m.system.close}
            </button>
          )}
          <button
            className="transition-colors duration-200 inline-flex items-center justify-center rounded-xl bg-accenta1 px-6 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BaseModal;
