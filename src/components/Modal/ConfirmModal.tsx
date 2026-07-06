"use client";

import React, { useEffect } from "react";
import BaseModal from "./BaseModal";

interface ConfirmModalProps {
  open: boolean;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
  isConfirmDisabled?: boolean;
  isCloseDisabled?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  isLoading = false,
  isConfirmDisabled = false,
  isCloseDisabled,
}) => {
  const closeDisabled = isCloseDisabled ?? isLoading;

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!closeDisabled) onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDisabled, open, onClose]);

  if (!open) return null;

  return (
    <BaseModal
      onClose={() => {
        if (!closeDisabled) onClose();
      }}
      onConfirm={() => {
        if (!isLoading && !isConfirmDisabled) void onConfirm();
      }}
      isLoading={isLoading}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      isConfirmDisabled={isConfirmDisabled}
      isCloseDisabled={closeDisabled}
      isCloseButton={true}
      size="sm"
    >
      {title && (
        <div className="text-[17px] font-medium leading-6 text-neutral-primary">
          {title}
        </div>
      )}

      {description && (
        <div className="mt-3 whitespace-pre-line text-sm font-normal leading-6 text-neutral-muted">
          {description}
        </div>
      )}

      {children && (
        <div className={description ? "mt-4" : "mt-3"}>{children}</div>
      )}
    </BaseModal>
  );
};

export default React.memo(ConfirmModal);
