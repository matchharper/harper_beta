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
  BeigeActionDropdown,
  BeigeActionDropdownItem,
} from "@/components/ui/beige/action-dropdown";
import { careerCx } from "./ui/CareerPrimitives";
import type { CareerHistoryOpportunity } from "./types";

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

const checklistItems = [
  "회원님의 희망 역할과 근무 조건을 확인합니다.",
  "회사에 전달해도 되는 소개 맥락을 정리합니다.",
];

export default function InternalConnectionOnboardingModal({
  callPending = false,
  onClose,
  onStartCall,
  onStartChat,
  open,
}: InternalConnectionOnboardingModalProps) {
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
      title="연결 수락 전에 5분 대화가 필요해요."
      description="내부 기회 연결은 회사에 회원님을 소개하고 추천하는 단계라, 회사에서 궁금해할만한 정보를 Harper에게 알려주시면 좋습니다."
      panelClassName="w-full max-w-[520px] rounded-[16px] border border-beige900/10 bg-beige50"
      headerClassName="border-b border-beige900/10 px-5 py-5 sm:px-6"
      bodyClassName="px-5 py-5 sm:px-6"
      footerClassName="border-t border-beige900/10 px-5 py-4 sm:px-6"
      closeButtonClassName="right-3 top-3 hover:bg-beige200"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-beige900/15 bg-white px-4 text-[14px] font-medium text-beige900 transition-colors hover:bg-beige100 sm:w-auto"
          >
            확인
          </button>
          <BeigeActionDropdown
            align="end"
            contentClassName="w-[220px]"
            modal={false}
            trigger={
              <button
                type="button"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-beige900 px-4 text-[14px] font-medium text-beige50 transition-colors hover:bg-beige900/90 sm:w-auto"
              >
                대화하기
                <ChevronDown className="h-4 w-4" />
              </button>
            }
          >
            <BeigeActionDropdownItem
              onSelect={handleStartChat}
              className="gap-2"
            >
              <MessageCircle className="h-4 w-4 text-beige900/65" />
              채팅으로 하기
            </BeigeActionDropdownItem>
            <BeigeActionDropdownItem
              onSelect={handleStartCall}
              disabled={callPending}
              className="gap-2"
            >
              {callPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-beige900/65" />
              ) : (
                <Phone className="h-4 w-4 text-beige900/65" />
              )}
              {callPending ? "전화 연결 중..." : "전화로 하기"}
            </BeigeActionDropdownItem>
          </BeigeActionDropdown>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[10px] border border-[#2f5d47]/15 bg-[#edf4ef] px-4 py-3 text-[13px] leading-5 text-[#244c3a]">
          이 대화가 끝나면 Harper가 회원님 기준에 맞게 연결을 진행할 수
          있습니다.
        </div>
        <div className="space-y-2">
          {checklistItems.map((item) => (
            <div
              key={item}
              className="flex gap-2 text-[13px] leading-5 text-beige900/70"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2f5d47]" />
              <span className="min-w-0">{item}</span>
            </div>
          ))}
        </div>
        <p
          className={careerCx(
            "text-[12px] leading-5 text-beige900/70",
            "sm:max-w-[80ch]"
          )}
        >
          Hapre와의 가벼운 대화로 생각해주세요. 짧게 이야기하면서 어떤 것들을
          선호하시고, 어떤 것들이 고려된 연결을 원하시는지 얘기해주시면 됩니다.
        </p>
      </div>
    </TalentCareerModal>
  );
}
