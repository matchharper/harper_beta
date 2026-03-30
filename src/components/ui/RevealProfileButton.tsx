import React, { useState } from "react";
import CreditModal from "@/components/Modal/CreditModal";
import { showToast } from "@/components/toast/toast";
import { useRevealCandidateProfile } from "@/hooks/useRevealCandidateProfile";
import { cn } from "@/lib/utils";

function isInsufficientRevealCreditError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  return normalized.includes("insufficient") || message.includes("부족");
}

type RevealProfileButtonProps = {
  candidId: string;
  className?: string;
  overlay?: boolean;
  overlayClassName?: string;
  label?: string;
  onRevealed?: () => void;
};

export default function RevealProfileButton({
  candidId,
  className = "",
  overlay = false,
  overlayClassName = "",
  label = "프로필 열람",
  onRevealed,
}: RevealProfileButtonProps) {
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const revealMutation = useRevealCandidateProfile();

  const handleReveal = async () => {
    try {
      const result = await revealMutation.mutateAsync(candidId);
      onRevealed?.();
      showToast({
        message: result.alreadyRevealed
          ? "이미 열람한 프로필입니다."
          : "후보자 프로필을 열람했습니다.",
        variant: "white",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "프로필 열람에 실패했습니다.";
      if (isInsufficientRevealCreditError(error)) {
        setIsCreditModalOpen(true);
        return;
      }

      showToast({
        message,
        variant: "white",
      });
    }
  };

  return (
    <>
      <CreditModal
        open={isCreditModalOpen}
        onClose={() => setIsCreditModalOpen(false)}
        title="남은 열람 횟수가 부족합니다."
        description="이 후보자 프로필을 열람하려면 남은 열람 횟수가 필요합니다.<br />플랜을 변경해 더 많은 열람을 이어서 진행해 보세요."
      />

      {overlay ? (
        <button
          type="button"
          aria-label={label}
          aria-busy={revealMutation.isPending}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleReveal();
          }}
          disabled={revealMutation.isPending}
          className={cn(
            "group-hover:bg-black/10 absolute inset-0 z-[70] flex h-full w-full cursor-pointer items-center justify-center border border-transparent transition-all duration-300 disabled:cursor-not-allowed",
            overlayClassName
          )}
        >
          <span
            className={cn(
              "inline-flex items-center rounded-full border border-white/80 bg-gradient-to-br from-white/85 via-white/75 to-white/70 px-4 py-1.5 text-sm font-normal text-black transition-all duration-300 group-hover:bg-white group-hover:border-white",
              className
            )}
          >
            {revealMutation.isPending ? "열람 중입니다..." : label}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void handleReveal();
          }}
          disabled={revealMutation.isPending}
          className={cn(
            "inline-flex items-center rounded-lg border border-white/80 bg-gradient-to-br from-white/85 via-white/75 to-white/70 px-4 py-1.5 text-sm font-normal text-black transition-all duration-300 hover:bg-white hover:border-white",
            className
          )}
        >
          {revealMutation.isPending ? "열람 중입니다..." : label}
        </button>
      )}
    </>
  );
}
