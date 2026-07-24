"use client";

import React, { useId, useRef, useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
  TriangleAlert,
} from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import {
  BareButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  textareaSurfaceClassName,
  Textarea as UiTextarea,
} from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "./types";

type InternalConnectionAcceptanceModalProps = {
  callPending?: boolean;
  isOnboardingComplete: boolean;
  item: CareerHistoryOpportunity | null;
  pending?: boolean;
  onAccept: (feedbackReason: string | null) => void;
  onClose: () => void;
  onStartCall: () => void;
  onStartChat: () => void;
};

export default function InternalConnectionAcceptanceModal({
  callPending = false,
  isOnboardingComplete,
  item,
  pending = false,
  onAccept,
  onClose,
  onStartCall,
  onStartChat,
}: InternalConnectionAcceptanceModalProps) {
  const t = useCareerT();
  const formId = useId();
  const feedbackReasonRef = useRef<HTMLTextAreaElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [openMoreWarning, setOpenMoreWarning] = useState(false);

  const closeModal = () => {
    setAcknowledged(false);
    onClose();
  };

  if (!item) return null;

  if (!isOnboardingComplete) {
    return (
      <TalentCareerModal
        open
        onClose={closeModal}
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
              onClick={closeModal}
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
              <ActionDropdownItem
                onSelect={() => {
                  closeModal();
                  onStartChat();
                }}
                className="gap-2"
              >
                <MessageCircle className="h-4 w-4 text-neutral-muted" />
                {t(
                  "career.common.internal_connection_onboarding_modal.1sbmfzi",
                  "채팅으로 하기"
                )}
              </ActionDropdownItem>
              <ActionDropdownItem
                onSelect={() => {
                  closeModal();
                  onStartCall();
                }}
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
            <div className="flex gap-2 text-[13px] leading-5 text-neutral-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <span className="min-w-0">
                {t(
                  "career.common.internal_connection_onboarding_modal.1lyfoil",
                  "회원님의 희망 역할과 근무 조건을 확인합니다."
                )}
              </span>
            </div>
            <div className="flex gap-2 text-[13px] leading-5 text-neutral-muted">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <span className="min-w-0">
                {t(
                  "career.common.internal_connection_onboarding_modal.18w9rer",
                  "회사에 전달해도 되는 소개 맥락을 정리합니다."
                )}
              </span>
            </div>
          </div>
          <p className="text-[12px] leading-5 text-neutral-muted sm:max-w-[80ch]">
            {t(
              "career.common.internal_connection_onboarding_modal.0pmrpu5",
              "Harper와의 가벼운 대화로 생각해주세요. 짧게 이야기하면서 어떤 것들을 선호하시고, 어떤 것들이 고려된 연결을 원하시는지 얘기해주시면 됩니다."
            )}
          </p>
        </div>
      </TalentCareerModal>
    );
  }

  return (
    <TalentCareerModal
      open
      onClose={closeModal}
      panelClassName="max-h-[calc(100svh-2rem)] max-w-[560px] overflow-x-hidden overflow-y-auto border border-neutral-1000-a05 bg-bg-floating"
      bodyClassName="bg-bg-floating px-5"
      mobileBottomSheet
      footer={
        <div className="flex flex-col md:flex-row items-center justify-between">
          <Checkbox
            checked={acknowledged}
            disabled={pending}
            required
            label={t(
              "career.common.internal_connection_acceptance_modal.acknowledgement",
              "위 안내를 확인했습니다."
            )}
            onChange={(event) => setAcknowledged(event.target.checked)}
            size="medium"
          />
          <div className="items-center justify-end gap-2 w-full md:w-auto grid grid-cols-[0.25fr_0.75fr] mt-2 md:mt-0 md:flex">
            <SecondaryButton
              type="button"
              onClick={closeModal}
              disabled={pending}
            >
              {t("career.settings.career_settings_modal.0jiry9t", "취소")}
            </SecondaryButton>
            <PrimaryButton
              type="submit"
              form={formId}
              disabled={pending || !acknowledged}
              className={cn(
                "border-primary bg-primary text-neutral-00",
                !acknowledged ? "opacity-50" : "",
                pending && "animate-pulse"
              )}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t(
                "career.common.internal_connection_acceptance_modal.submit",
                "연결 수락"
              )}
            </PrimaryButton>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || !acknowledged) return;
          onAccept(feedbackReasonRef.current?.value.trim() || null);
          closeModal();
        }}
        className="text-[13px] text-neutral-primary font-normal"
      >
        <div className="flex flex-col gap-2 text-[14px] text-neutral-800">
          <div className="text-base font-semibold pt-6 pb-3 text-neutral-primary">
            {t("career.common.internal_connection_acceptance_modal.01cracx", "연결 수락 후 다음 단계를 진행하시겠습니까?")}
          </div>
          <div>
            {t(
              "career.common.internal_connection_acceptance_modal.028q399",
              "연결 수락시 Harper가 회원님의 주요 정보와 왜 회원님이 적합한 인재인지에 대한 내용을 회사 측에 전달하고 다음 프로세스가 진행됩니다."
            )}
          </div>
          <div>
            {t(
              "career.common.internal_connection_acceptance_modal.0emad1t",
              "이후 회사 측으로부터 다음 일정에 대한 안내를 받을 수 있습니다."
            )}
          </div>
          <p className="mt-2">
            {t(
              "career.common.internal_connection_acceptance_modal.memo_description",
              "이 메모는 Harper가 다음 단계를 준비할 때 참고합니다."
            )}
          </p>
        </div>

        <label className="block">
          <UiTextarea
            key={item.id}
            ref={feedbackReasonRef}
            unstyled
            defaultValue={item.feedbackReason ?? ""}
            placeholder={t(
              "career.common.internal_connection_acceptance_modal.memo_placeholder",
              "(Optional) Harper가 다음 단계에서 참고할 포인트 혹은 회사에 전달하고 싶은 내용을 알려주세요. 작성하지 않고 제출하셔도 됩니다."
            )}
            className={cn(textareaSurfaceClassName, "mt-2 min-h-[112px]")}
          />
        </label>
        <div
          onClick={() => setOpenMoreWarning((prev) => !prev)}
          className="mt-2 relative group flex flex-row gap-2 px-3 py-2 rounded-sm bg-critical-faded/50 hover:bg-critical-faded/70 transition-colors cursor-pointer"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" />
          <div className="min-w-0 flex-1 text-critical">
            <div>
              {t(
                "career.common.internal_connection_acceptance_modal.0ujjrpc",
                "이후 단계에서 정당한 사유나 사전 안내 없이 회사의 연락에 응답하지 않거나, 확정된 인터뷰에 불참·직전 취소하는 경우 향후 Harper 이용이 제한될 수 있습니다."
              )}
            </div>
            {openMoreWarning && (
              <div className="mt-2 text-critical/70">
                {t(
                  "career.common.internal_connection_acceptance_modal.1tvfp0q",
                  "Harper가 사전 안내 여부와 사유, 무응답·불참·직전 취소의 반복 여부를 확인해 제한 여부를 판단합니다. 제한이 적용되면 새로운 회사 연결 제안 및 추천이 중단되며, 요청 시에만 검토 후 복구될 수 있습니다."
                )}
                <br />
                {t(
                  "career.common.internal_connection_acceptance_modal.11m93na",
                  "더 기회가 필요한 분들에게 기회가 갈 수 있게 하기 위한 조치입니다."
                )}
              </div>
            )}
          </div>
          <div className="absolute bottom-0 right-2 group-hover:opacity-100 group-hover:translate-y-[-4px] opacity-0 transition-all">
            <ArrowDown
              className={`h-3.5 w-3.5 shrink-0 text-critical ${openMoreWarning ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </form>
    </TalentCareerModal>
  );
}
