"use client";

import { showToast } from "@/components/toast/toast";
import { useUpdateMatchCandidateDecision } from "@/hooks/useMatchWorkspace";
import type { MatchCandidateDetailResponse } from "@/lib/match/shared";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Ban, Clock3 } from "lucide-react";
import { useState } from "react";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { BareButton } from "@/components/ui/button";

type MatchMemoPanelProps = {
  detail: MatchCandidateDetailResponse;
  workspaceId?: string | null;
};

const STATUS_COPY = {
  hold: "보류",
  pending: "결정 대기",
  rejected: "거절",
  requested: "연결 요청",
} as const;

const ACTION_BUTTONS = [
  {
    icon: ArrowRight,
    label: "연결 요청",
    status: "requested" as const,
    tone: "bg-black text-neutral-00 hover:bg-black/90",
  },
  {
    icon: Ban,
    label: "거절",
    status: "rejected" as const,
    tone: "text-neutral-primary hover:bg-bg-default hover:text-neutral-primary",
  },
  {
    icon: Clock3,
    label: "보류",
    status: "hold" as const,
    tone: "text-neutral-primary hover:bg-bg-default hover:text-neutral-primary",
  },
];

export default function MatchMemoPanel({
  detail,
  workspaceId,
}: MatchMemoPanelProps) {
  const [draftStatus, setDraftStatus] = useState<
    "requested" | "rejected" | "hold" | null
  >(null);
  const [reason, setReason] = useState("");
  const updateDecision = useUpdateMatchCandidateDecision();

  const confirmDecision = async () => {
    if (!draftStatus || reason.trim().length === 0) {
      showToast({
        message: "사유를 입력해 주세요.",
        variant: "white",
      });
      return;
    }

    try {
      await updateDecision.mutateAsync({
        candidId: detail.match.candidId,
        feedbackText: reason.trim(),
        roleId: detail.match.roleId,
        status: draftStatus,
        workspaceId: workspaceId ?? detail.workspace.companyWorkspaceId,
      });
      showToast({
        message: "결정이 저장되었습니다.",
        variant: "white",
      });
      setDraftStatus(null);
      setReason("");
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "결정을 저장하지 못했습니다.",
        variant: "white",
      });
    }
  };

  return (
    <div className="flex h-screen w-full flex-col text-neutral-primary">
      <div className="px-5 pb-5 pt-5">
        <h2 className="mt-3 text-xl font-medium leading-tight text-neutral-primary">
          {detail.role?.name ?? detail.match.roleName}
        </h2>
        <div className="mt-3 text-sm text-neutral-muted">
          {detail.workspace.companyName}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-soft">
          <span>현재 상태</span>
          <span className="text-neutral-primary">
            {STATUS_COPY[detail.match.status]}
          </span>
          {detail.relatedRoles.slice(1).map((role) => (
            <span key={role.roleId} className="text-neutral-soft">
              · also for {role.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-y border-neutral-1000-a05 px-5">
        <section className="py-5">
          <div className="text-sm text-neutral-soft">Memo from Harper</div>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-neutral-primary">
            {detail.match.harperMemo?.trim() ||
              "아직 남겨진 Harper memo가 없습니다."}
          </div>
        </section>

        <section className="border-t border-neutral-1000-a05 py-5">
          <div className="text-sm text-neutral-soft">최근 피드백</div>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-neutral-muted">
            {detail.match.feedbackText?.trim() ||
              "아직 결정 사유가 기록되지 않았습니다."}
          </div>
        </section>
      </div>

      <div className="px-7 py-6">
        <AnimatePresence mode="wait">
          {draftStatus ? (
            <motion.div
              key="decision-form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="space-y-4"
            >
              <div className="text-sm text-neutral-primary">
                <span className="font-medium text-neutral-primary">
                  {
                    ACTION_BUTTONS.find((item) => item.status === draftStatus)
                      ?.label
                  }
                </span>{" "}
                사유를 남겨주세요.
              </div>
              <UiTextarea
                unstyled
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full resize-none rounded-[14px] border border-neutral-1000-a05 bg-bg-default px-4 py-3 text-sm text-neutral-primary outline-none placeholder:text-neutral-placeholder transition hover:border-neutral-1000-a10 focus:border-neutral-1000-a10"
                placeholder="후보자와 연결을 요청하거나, 거절하거나, 보류하는 이유를 적어주세요."
              />
              <div className="flex items-center justify-end gap-3">
                <BareButton
                  type="button"
                  onClick={() => {
                    setDraftStatus(null);
                    setReason("");
                  }}
                  className="rounded-md px-3 py-2 text-sm text-neutral-muted transition hover:bg-bg-default hover:text-neutral-primary"
                >
                  취소
                </BareButton>
                <BareButton
                  type="button"
                  onClick={() => void confirmDecision()}
                  disabled={updateDecision.isPending}
                  className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-neutral-00 transition hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateDecision.isPending ? "저장 중..." : "사유와 함께 저장"}
                </BareButton>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="decision-actions"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="grid grid-cols-1 gap-2"
            >
              {ACTION_BUTTONS.map((action) => {
                const Icon = action.icon;
                return (
                  <BareButton
                    key={action.status}
                    type="button"
                    onClick={() => setDraftStatus(action.status)}
                    className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition ${action.tone}`}
                  >
                    <Icon size={15} />
                    {action.label}
                  </BareButton>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
