"use client";

import React from "react";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "./types";
import { BareButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

export function shouldBlockInternalConnectionAcceptance(
  item: CareerHistoryOpportunity,
  isOnboardingComplete: boolean
) {
  return (
    !isOnboardingComplete &&
    item.feedback !== "positive" &&
    item.sourceType === "internal"
  );
}

type InternalConnectionOnboardingModalProps = {
  callPending?: boolean;
  onClose: () => void;
  onStartCall: () => void;
  onStartChat: () => void;
  open: boolean;
};

export default function InternalConnectionOnboardingModal({
  callPending = false,
  onClose,
  onStartCall,
  onStartChat,
  open,
}: InternalConnectionOnboardingModalProps) {
  const t = useCareerT();
  const checklistItems = [
    t(
      "career.common.internal_connection_onboarding_modal.1lyfoil",
      "회원님의 희망 역할과 근무 조건을 확인합니다."
    ),
    t(
      "career.common.internal_connection_onboarding_modal.18w9rer",
      "회사에 전달해도 되는 소개 맥락을 정리합니다."
    ),
  ];

  const handleStartChat = () => {
    onClose();
    onStartChat();
  };
  const handleStartCall = () => {
    onClose();
    onStartCall();
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      title={t(
        "career.common.internal_connection_onboarding_modal.0vo80wd",
        "연결 수락 전에 5분 커리어 인터뷰가 필요해요."
      )}
      description={t(
        "career.common.internal_connection_onboarding_modal.1yorbt8",
        "내부 기회 연결은 회사에 회원님을 소개하고 추천하는 단계라, 회사에서 궁금해할만한 정보를 저에게 알려주셔야 이후 단계를 진행할 수 있어요."
      )}
      panelClassName="w-full max-w-[520px] rounded-[16px] border border-neutral-1000-a05 bg-bg-floating"
      headerClassName="border-b border-neutral-1000-a05 px-5 py-5 sm:px-6"
      bodyClassName="px-5 py-5 sm:px-6"
      footerClassName="border-t border-neutral-1000-a05 px-5 py-4 sm:px-6"
      closeButtonClassName="right-3 top-3 hover:bg-bg-weak"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <BareButton
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 text-[14px] font-medium text-neutral-primary transition-colors hover:bg-bg-weak sm:w-auto"
          >
            {t(
              "career.common.internal_connection_onboarding_modal.0z48n2w",
              "확인"
            )}
          </BareButton>
          <ActionDropdown
            align="end"
            contentClassName="w-[220px]"
            modal={false}
            trigger={
              <BareButton
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-black px-4 text-[14px] font-medium text-neutral-00 transition-colors hover:bg-black/90 sm:w-auto"
              >
                {t(
                  "career.common.internal_connection_onboarding_modal.059fa2p",
                  "대화하기"
                )}
                <ChevronDown className="h-4 w-4" />
              </BareButton>
            }
          >
            <ActionDropdownItem onSelect={handleStartChat} className="gap-2">
              <MessageCircle className="h-4 w-4 text-neutral-muted" />
              {t(
                "career.common.internal_connection_onboarding_modal.1sbmfzi",
                "채팅으로 하기"
              )}
            </ActionDropdownItem>
            <ActionDropdownItem
              onSelect={handleStartCall}
              disabled={callPending}
              className="gap-2"
            >
              {callPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-neutral-muted" />
              ) : (
                <Phone className="h-4 w-4 text-neutral-muted" />
              )}
              {callPending
                ? t(
                    "career.common.internal_connection_onboarding_modal.037ebaa",
                    "전화 연결 중..."
                  )
                : t(
                    "career.common.internal_connection_onboarding_modal.1wjj1zl",
                    "전화로 하기"
                  )}
            </ActionDropdownItem>
          </ActionDropdown>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[10px] border border-positive/30 bg-positive-faded px-4 py-3 text-[13px] leading-5 text-positive">
          {t(
            "career.common.internal_connection_onboarding_modal.1sj53gq",
            "이 대화가 끝나면 Harper가 회원님 기준에 맞게 연결을 진행할 수 있습니다."
          )}
        </div>
        <div className="space-y-2">
          {checklistItems.map((item) => (
            <div
              key={item}
              className="flex gap-2 text-[13px] leading-5 text-neutral-muted"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <span className="min-w-0">{item}</span>
            </div>
          ))}
        </div>
        <p
          className={cn(
            "text-[12px] leading-5 text-neutral-muted",
            "sm:max-w-[80ch]"
          )}
        >
          {t(
            "career.common.internal_connection_onboarding_modal.0pmrpu5",
            "Harper와의 가벼운 대화로 생각해주세요. 짧게 이야기하면서 어떤 것들을 선호하시고, 어떤 것들이 고려된 연결을 원하시는지 얘기해주시면 됩니다."
          )}
        </p>
      </div>
    </TalentCareerModal>
  );
}
