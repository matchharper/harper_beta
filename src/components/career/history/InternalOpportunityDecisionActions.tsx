"use client";

import React, { useState } from "react";
import { EllipsisVertical, Loader2 } from "lucide-react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/components/ui/action-dropdown";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { cn } from "@/lib/utils";
import {
  getInternalOpportunityDecisionAvailability,
  INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH,
  type CareerInternalOpportunityDecisionAction,
} from "@/lib/career/internalOpportunityDecision";
import type { CareerHistoryOpportunity } from "../types";
import Image from "next/image";
import Textarea from "@/components/ui/textarea";

export type InternalOpportunityDecisionChangeRequest = {
  action: CareerInternalOpportunityDecisionAction;
  item: CareerHistoryOpportunity;
  reason?: string | null;
};

const stopCardActivation = (event: React.SyntheticEvent) => {
  event.stopPropagation();
};

export function InternalOpportunityDecisionMenu({
  className,
  item,
  onAction,
  pending,
  onCard = false,
}: {
  className?: string;
  item: CareerHistoryOpportunity;
  onAction: (action: CareerInternalOpportunityDecisionAction) => void;
  pending: boolean;
  onCard?: boolean;
}) {
  const t = useCareerT();
  const { canRevert, canStopProcess } =
    getInternalOpportunityDecisionAvailability(item);

  if (!canRevert && !canStopProcess) return null;

  return (
    <div
      data-career-card-action="true"
      className={className}
      onClick={stopCardActivation}
      onPointerDown={stopCardActivation}
    >
      <ActionDropdown
        align="end"
        contentClassName="min-w-[210px]"
        trigger={
          <MuteButton
            size={onCard ? "sm" : "md"}
            variant={onCard ? "transparent" : "default"}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <EllipsisVertical className="h-4 w-4" />
            )}
          </MuteButton>
        }
      >
        {canRevert ? (
          <ActionDropdownItem
            disabled={pending}
            onSelect={() => onAction("revert")}
          >
            {t(
              "career.history.internal_decision_actions.revert",
              "새 포지션으로 되돌리기"
            )}
          </ActionDropdownItem>
        ) : null}
        {canStopProcess ? (
          <ActionDropdownItem
            tone="danger"
            disabled={pending}
            onSelect={() => onAction("stop_process")}
          >
            {t(
              "career.history.internal_decision_actions.stop",
              "진행 중단하기"
            )}
          </ActionDropdownItem>
        ) : null}
      </ActionDropdown>
    </div>
  );
}

export function InternalOpportunityDecisionChangeModal({
  error,
  onClose,
  onConfirm,
  request,
}: {
  error?: string;
  onClose: () => void;
  onConfirm: (
    request: InternalOpportunityDecisionChangeRequest
  ) => boolean | Promise<boolean>;
  request: InternalOpportunityDecisionChangeRequest;
}) {
  const t = useCareerT();
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stopReason, setStopReason] = useState(request.reason ?? "");

  const isStop = request.action === "stop_process";
  const isAcceptedRevert =
    request.action === "revert" && request.item.feedback === "positive";
  const title = isStop
    ? t(
        "career.history.internal_decision_actions.stop_title",
        "이 포지션의 진행을 중단할까요?"
      )
    : isAcceptedRevert
      ? t(
          "career.history.internal_decision_actions.revert_accept_title",
          "연결 수락을 되돌릴까요?"
        )
      : t(
          "career.history.internal_decision_actions.revert_reject_title",
          "거절을 되돌릴까요?"
        );
  const description = isStop
    ? t(
        "career.history.internal_decision_actions.stop_description",
        "진행 중단 의사를 전달하고 이 포지션을 ‘진행 종료’로 이동합니다. 이미 회사 담당자와 연락 중이거나 일정이 잡혔다면, 담당자에게 직접 취소 의사를 알려주세요."
      )
    : isAcceptedRevert
      ? t(
          "career.history.internal_decision_actions.revert_accept_description",
          "연결을 취소하고 이 포지션을 ‘새 포지션’으로 되돌립니다. 이미 전달된 정보나 발송된 안내는 자동으로 회수되지 않습니다."
        )
      : t(
          "career.history.internal_decision_actions.revert_reject_description",
          "거절을 취소하고 이 포지션을 ‘새 포지션’으로 되돌립니다. 되돌린 뒤에는 다시 수락하거나 거절할 수 있어요."
        );

  const handleConfirm = async () => {
    if (submitting) return;
    setAttempted(true);
    setSubmitting(true);
    const changed = await onConfirm({
      ...request,
      reason: isStop ? stopReason.trim() || null : null,
    });
    if (!changed) {
      setSubmitting(false);
    }
  };

  return (
    <TalentCareerModal
      open
      onClose={() => {
        if (!submitting) onClose();
      }}
      closeOnBackdrop={!submitting}
      title={title}
      description={description}
      panelClassName="max-w-[520px] rounded-[16px] border-neutral-1000-a05 bg-bg-floating"
      headerClassName="px-5 py-5 pr-14 sm:px-6"
      bodyClassName="px-5 py-5 sm:px-6"
      footer={
        <div className="flex gap-2 flex-row justify-end">
          <MuteButton variant="default" onClick={onClose} disabled={submitting}>
            {t("career.common.cancel", "취소")}
          </MuteButton>
          <MuteButton
            size="md"
            variant={isStop ? "warn" : "dark"}
            onClick={() => void handleConfirm()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isStop
              ? t(
                  "career.history.internal_decision_actions.stop_confirm",
                  "진행 중단하기"
                )
              : t(
                  "career.history.internal_decision_actions.revert_confirm",
                  "새 포지션으로 되돌리기"
                )}
          </MuteButton>
        </div>
      }
    >
      <div className="flex items-start gap-3 rounded-[10px] border border-neutral-1000-a05 shadow-xs bg-bg-floating p-3">
        <div className="truncate flex flex-row items-center gap-1 text-[14px] font-normal text-neutral-primary">
          <span className="bg-black/5 p-1 px-2 flex flex-row items-center gap-2 rounded-sm">
            {request.item.title}
          </span>
          <span className="px-1">at</span>{" "}
          <span className="bg-black/5 p-1 pr-2 flex flex-row items-center gap-2 rounded-sm">
            {request.item.companyLogoUrl && (
              <Image
                src={request.item.companyLogoUrl ?? ""}
                alt={request.item.companyName}
                width={20}
                height={20}
              />
            )}
            {request.item.companyName}
          </span>
        </div>
      </div>
      {isStop && (
        <Textarea
          placeholder={t(
            "career.history.internal_decision_actions.stop_reason_placeholder",
            "(Optional) 진행 종료 이유에 대해서 알려주세요. ex) 다른 회사에 오퍼를 받았습니다, 이직을 할 수 없는 상황이 되었습니다. 등"
          )}
          value={stopReason}
          onChange={(event) => setStopReason(event.target.value)}
          maxLength={INTERNAL_OPPORTUNITY_DECISION_REASON_MAX_LENGTH}
          disabled={submitting}
          className={cn("mt-2 h-[82px]")}
        />
      )}
      {attempted && error ? (
        <div
          role="alert"
          className="mt-3 rounded-[10px] border border-critical/20 bg-critical-faded px-3 py-2.5 text-[13px] leading-5 text-critical"
        >
          {error}
        </div>
      ) : null}
    </TalentCareerModal>
  );
}
