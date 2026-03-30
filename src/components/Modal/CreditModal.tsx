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
    await router.push("/my/billing");
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
  const backdropClass = "absolute inset-0 bg-black/40 backdrop-blur-[2px]";
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
        <div className={titleClass}>
          이번 달 월 검색 한도를 모두 사용했습니다.
        </div>

        <p
          className={descClass}
          dangerouslySetInnerHTML={{
            __html: `현재 플랜의 월 검색 한도를 모두 사용했습니다.<br />
다음 이용 기간이 시작될 때까지 기다리거나 플랜을 변경해<br />
더 많은 검색을 이어서 진행해 보세요.`,
          }}
        />

        <div className={footerClass}>
          <button
            className={confirmBtnClass}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "플랜 업그레이드"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CreditModal);
