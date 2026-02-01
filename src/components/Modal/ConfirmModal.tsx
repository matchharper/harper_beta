// components/common/ConfirmModal.tsx
"use client";

import React, { useEffect } from "react";
import BaseModal from "./BaseModal";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title = "Are you sure?",
  description = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
  isLoading = false,
}) => {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <BaseModal
      onClose={onClose}
      onConfirm={async () => onConfirm()}
      isLoading={isLoading}
      confirmLabel={confirmLabel}
      isCloseButton={true}
      size="sm"
    >
      {title && <div className="text-base font-normal text-hgray900">{title}</div>}

      {description && (
        <p
          className="mt-4 text-sm text-hgray800 font-normal leading-relaxed"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      )}
    </BaseModal>
  );
};

export default ConfirmModal;
