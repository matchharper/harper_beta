// components/common/ConfirmModal.tsx
"use client";

import React, { useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/router";

interface CreditModalProps {
  open: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

const CreditModal: React.FC<CreditModalProps> = ({
  open,
  onClose,
  isLoading = false,
}) => {
  const router = useRouter();

  const onConfirm = useCallback(async () => {
    if (isLoading) return;
    await router.push("/pricing");
  }, [router, isLoading]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      // Enter로 confirm 하고 싶으면:
      // if (e.key === "Enter") onConfirm();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  // ====== 디자인 갈아엎기 편하게 여기만 보면 됨 ======
  const overlayClass =
    "fixed inset-0 z-50 flex items-center justify-center px-4 w-full";
  const backdropClass =
    "absolute inset-0 bg-black/40 backdrop-blur-[2px]";
  const modalClass =
    "relative z-50 w-full max-w-[440px] rounded-[28px] bg-hgray100 p-6 shadow-sm border border-white/5";
  const titleClass = "text-base font-normal text-hgray900";
  const descClass = "mt-4 text-sm text-hgray800 font-normal leading-loose";
  const footerClass = "w-full mt-12 flex flex-row items-end justify-end gap-2";
  const confirmBtnClass =
    "transition-colors duration-200 w-full inline-flex items-center justify-center rounded-xl bg-accenta1 px-6 py-3 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-70";
  // ===============================================

  return (
    <div className={overlayClass} role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className={backdropClass} onClick={onClose} />

      {/* Modal */}
      <div className={modalClass}>
        <div className={titleClass}>크레딧이 모두 소진되었습니다.</div>

        <p
          className={descClass}
          dangerouslySetInnerHTML={{
            __html: `Harper 활용법을 완벽히 익히신 것 같네요.<br />
Credit 추가 구매 혹은 Pro로 업그레이드하고<br />
제한 없이 이용해 보세요.`,
          }}
        />

        <div className={footerClass}>
          <button
            className={confirmBtnClass}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "플랜 업그레이드"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CreditModal);
