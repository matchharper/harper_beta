"use client";

import { showToast } from "@/components/toast/toast";
import { useUpdateMatchCandidateDecision } from "@/hooks/useMatchWorkspace";
import type { MatchCandidateDetailResponse } from "@/lib/match/shared";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, Clock3 } from "lucide-react";
import { useState } from "react";

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
    tone: "bg-white text-black hover:bg-white/90",
  },
  {
    icon: Ban,
    label: "거절",
    status: "rejected" as const,
    tone: "text-white/70 hover:bg-white/5 hover:text-white",
  },
  {
    icon: Clock3,
    label: "보류",
    status: "hold" as const,
    tone: "text-white/70 hover:bg-white/5 hover:text-white",
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
    <div className="flex h-screen w-full flex-col text-white">
      <div className="px-5 pb-5 pt-5">
        <h2 className="mt-3 text-xl font-medium leading-tight text-white">
          {detail.role?.name ?? detail.match.roleName}
        </h2>
        <div className="mt-3 text-sm text-white/55">
          {detail.workspace.companyName}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
          <span>현재 상태</span>
          <span className="text-white/70">
            {STATUS_COPY[detail.match.status]}
          </span>
          {detail.relatedRoles.slice(1).map((role) => (
            <span key={role.roleId} className="text-white/45">
              · also for {role.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto border-y border-white/10 px-5">
        <section className="py-5">
          <div className="text-sm text-white/45">Memo from Harper</div>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-white/80">
            {detail.match.harperMemo?.trim() ||
              "아직 남겨진 Harper memo가 없습니다."}
          </div>
        </section>

        <section className="border-t border-white/10 py-5">
          <div className="text-sm text-white/45">최근 피드백</div>
          <div className="mt-2 whitespace-pre-wrap text-[15px] leading-8 text-white/65">
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
              <div className="text-sm text-white/70">
                <span className="font-medium text-white">
                  {
                    ACTION_BUTTONS.find((item) => item.status === draftStatus)
                      ?.label
                  }
                </span>{" "}
                사유를 남겨주세요.
              </div>
              <textarea
                rows={4}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="w-full resize-none rounded-[14px] border border-white/10 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition hover:border-white/15 focus:border-white/20"
                placeholder="후보자와 연결을 요청하거나, 거절하거나, 보류하는 이유를 적어주세요."
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDraftStatus(null);
                    setReason("");
                  }}
                  className="rounded-md px-3 py-2 text-sm text-white/65 transition hover:bg-white/5 hover:text-white"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDecision()}
                  disabled={updateDecision.isPending}
                  className="rounded-md bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updateDecision.isPending ? "저장 중..." : "사유와 함께 저장"}
                </button>
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
                  <button
                    key={action.status}
                    type="button"
                    onClick={() => setDraftStatus(action.status)}
                    className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition ${action.tone}`}
                  >
                    <Icon size={15} />
                    {action.label}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
