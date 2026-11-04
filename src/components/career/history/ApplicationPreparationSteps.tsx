"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  ArrowRight,
  Check,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader2,
} from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import type { ApplicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import { ApplicationReviewPanel } from "../chat/ApplicationReviewPanel";
import { useCareerChatPanelContext } from "../CareerChatPanelContext";
import type { CareerHistoryOpportunity } from "../types";

/** Present saved materials separately from the action that continues the application. */
export function ApplicationPreparationRows({
  application: a,
  continuationDisabled,
  onContinue,
  onDocument,
  onReview,
  onOpenChat,
  onOpenLink,
}: {
  application: ApplicationReviewView;
  continuationDisabled?: boolean;
  onContinue: () => void;
  onDocument: (id: string) => void;
  onReview: () => void;
  onOpenChat: () => void;
  onOpenLink: (url: string) => void;
}) {
  const t = useCareerT();
  const analyzing = a.analysisStatus === "running";
  const inspecting =
    a.inspectionStatus === "queued" || a.inspectionStatus === "running";
  const running =
    a.browser?.status === "queued" || a.browser?.status === "running";
  const waiting = a.browser?.status === "waiting";
  const confirmed = a.submissionState === "confirmed";
  const uncertain = a.submissionState === "unknown" && !running && !waiting;
  const documentId = a.ready ? a.resumeDocumentId : a.workingResumeDocumentId;
  const direct =
    !a.browser && a.submissionAccess === "unsupported" && a.applicationUrl;
  const openChat = running || waiting || analyzing || inspecting;
  const complete = t("career.application.steps.complete", "완료");
  const rows = [
    {
      title: t("career.simulation.resumeSource", "이력서"),
      Icon: FileText,
      status: analyzing
        ? t("career.application.steps.analyzing", "분석 중")
        : a.ready
          ? complete
          : a.analysisStatus === "failed" || a.analysisStatus === "cancelled"
            ? t("career.application.steps.preparation_stopped", "준비 중단")
            : documentId
              ? t("career.application.steps.saved", "작성됨")
              : t("career.application.steps.pending", "준비 전"),
      busy: analyzing,
      complete: a.ready && !analyzing,
      action: documentId ? () => onDocument(documentId) : undefined,
      label: t("career.application.steps.view_resume", "이력서 보기"),
    },
    {
      title: t("career.application.steps.materials_title", "지원 내용"),
      Icon: ClipboardList,
      status: inspecting
        ? t("career.application.steps.inspecting", "확인 중")
        : confirmed
          ? complete
          : a.review
            ? a.preparationPending || !a.reviewCurrent
              ? t("career.application.steps.confirm", "확인 필요")
              : t("career.application.steps.draft_saved", "초안 저장됨")
            : t("career.application.steps.pending", "준비 전"),
      busy: inspecting,
      complete: confirmed && !inspecting,
      action: a.review ? onReview : undefined,
      label: t("career.application.steps.review", "내용 확인"),
    },
  ];
  const status = confirmed
    ? t("career.application.review.sent", "지원 완료")
    : running
      ? t("career.application.steps.submitting", "지원 중")
      : uncertain
        ? t("career.application.steps.uncertain", "제출 확인 필요")
        : waiting
          ? t("career.application.steps.confirm", "확인 필요")
          : a.browser?.status === "failed" || a.browser?.status === "cancelled"
            ? t("career.application.steps.stopped", "지원 중단")
            : null;
  const resultAvailable = Boolean(a.browser?.result || a.review);
  return (
    <section
      className="my-6 w-full min-w-0"
      aria-label={t("career.apply.title", "하퍼로 지원하기")}
    >
      <h3 className="mb-2 text-sm font-medium text-neutral-primary">
        {t("career.apply.title", "하퍼로 지원하기")}
      </h3>
      <ul className="divide-y divide-neutral-1000-a05">
        {rows.map(({ Icon, ...row }) => (
          <li key={row.title} className="flex min-w-0 items-center gap-3 py-3">
            <Icon className="size-4 shrink-0 text-neutral-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-neutral-primary">{row.title}</p>
              <p
                role="status"
                className="mt-1 flex items-center gap-1 text-xs text-neutral-muted"
              >
                {row.busy ? (
                  <Loader2
                    className="size-3 motion-safe:animate-spin"
                    aria-hidden
                  />
                ) : row.complete ? (
                  <Check className="size-3 text-positive-strong" aria-hidden />
                ) : null}
                {row.status}
              </p>
            </div>
            {row.action && (
              <MuteButton
                variant="transparent"
                onClick={row.action}
                className="shrink-0"
              >
                {row.label}
              </MuteButton>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-1000-a10 pt-4">
        {status && (
          <p
            role="status"
            className="flex items-center gap-1.5 text-sm text-neutral-muted"
          >
            {confirmed ? (
              <Check className="size-4 text-positive-strong" aria-hidden />
            ) : running ? (
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden
              />
            ) : null}
            {status}
          </p>
        )}
        {confirmed || uncertain ? (
          <MuteButton
            className="ml-auto"
            onClick={resultAvailable ? onReview : onOpenChat}
          >
            {resultAvailable
              ? t("career.application.steps.result", "결과 보기")
              : t("career.application.steps.open_chat", "대화로 이동")}
          </MuteButton>
        ) : (
          <MuteButton
            variant="dark"
            size="lg"
            className="ml-auto"
            disabled={!direct && !openChat && continuationDisabled}
            onClick={
              direct
                ? () => onOpenLink(direct)
                : openChat
                  ? onOpenChat
                  : onContinue
            }
          >
            {direct
              ? t("career.application.review.direct", "지원 사이트 열기")
              : openChat
                ? t("career.application.steps.open_chat", "대화로 이동")
                : a.ready
                  ? t(
                      "career.application.steps.continue_application",
                      "이어서 지원하기"
                    )
                  : t(
                      "career.application.steps.continue_preparation",
                      "지원 준비 이어서 하기"
                    )}
            {direct ? (
              <ExternalLink className="size-4" aria-hidden />
            ) : (
              <ArrowRight className="size-4" aria-hidden />
            )}
          </MuteButton>
        )}
      </div>
    </section>
  );
}

export default function ApplicationPreparationSteps({
  item,
  onOpenChat,
  onOpenLink,
}: {
  item: CareerHistoryOpportunity;
  onOpenChat?: () => void;
  onOpenLink: (url: string) => void;
}) {
  const { fetchWithAuth } = useCareerApi();
  const chat = useCareerChatPanelContext();
  const router = useRouter();
  const t = useCareerT();
  const [application, setApplication] = useState<ApplicationReviewView | null>(
    null
  );
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(
    async (isCurrent: () => boolean = () => true) => {
      const response = await fetchWithAuth(
        `/api/talent/application-review?roleId=${encodeURIComponent(item.roleId)}`
      );
      if (!response.ok) return;
      const data = await response.json();
      if (isCurrent()) setApplication(data.applications?.[0] ?? null);
    },
    [fetchWithAuth, item.roleId]
  );
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(() => !disposed).catch(() => {});
      if (!disposed) timer = setTimeout(poll, 5000);
    };
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [refresh, chat.chatPending]);
  const continuePreparation = async () => {
    if (lock.current) return;
    lock.current = true;
    setSending(true);
    try {
      const opportunity = {
        roleId: item.roleId,
        label: `${item.companyName} · ${item.title}`,
      };
      const documentIds = new Set<string>();
      if (application?.resumeDocumentId)
        documentIds.add(application.resumeDocumentId);
      const documents = (application?.review?.documents ?? []).filter(
        (document) => {
          if (documentIds.has(document.documentId)) return false;
          documentIds.add(document.documentId);
          return true;
        }
      );
      const sent = chat.onSendChatMessage({
        text: [
          t(
            "career.forms.legacyContinue",
            "{role}에 이전에 준비한 내용을 바탕으로 지원을 도와줘.",
            { values: { role: opportunity.label } }
          ),
          ...(application?.resumeDocumentId
            ? [
                `[${t("career.application.review.resumeFile", "이력서 열기")}](documentId:${application.resumeDocumentId})`,
              ]
            : []),
          ...documents.map(
            (document) =>
              `[${document.title}](documentId:${document.documentId})`
          ),
        ].join("\n"),
        opportunityMentions: [opportunity],
      });
      onOpenChat?.();
      await sent;
    } finally {
      lock.current = false;
      setSending(false);
    }
  };
  if (!application) return null;
  return (
    <>
      <ApplicationPreparationRows
        application={application}
        continuationDisabled={
          sending || chat.chatPending || chat.assistantTyping || !chat.user
        }
        onContinue={() => {
          void continuePreparation().catch(() => {});
        }}
        onOpenChat={() => onOpenChat?.()}
        onDocument={(id) => {
          void router.push(getCareerDocumentHref(id));
        }}
        onReview={() => setOpen(true)}
        onOpenLink={onOpenLink}
      />
      {open && (application.review || application.browser?.result) && (
        <ApplicationReviewPanel
          key={application.messageId}
          initial={application}
          onClose={() => setOpen(false)}
          onSaved={setApplication}
        />
      )}
    </>
  );
}
