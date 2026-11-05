"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useRouter } from "next/router";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerMobileChatClose } from "@/components/career/mobile/CareerMobileChatCloseContext";
import RichText from "@/components/ui/rich-text";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { applicationFieldId } from "@/lib/career/simulation/applicationReview";
import type { ApplicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import { useOptionalCareerChatPanelContext } from "../CareerChatPanelContext";

export function ApplicationReviewEntry({
  messageId,
  roleId,
  version,
  inline = false,
}: {
  messageId?: number;
  roleId?: string;
  version?: number;
  inline?: boolean;
}) {
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [applications, setApplications] = useState<ApplicationReviewView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = messageId
      ? `messageId=${messageId}`
      : `roleId=${encodeURIComponent(roleId ?? "")}`;
    void fetchWithAuth(`/api/talent/application-review?${query}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok)
          setApplications(
            ((await response.json()).applications ?? []).filter(
              (view: ApplicationReviewView) => view.review
            )
          );
      })
      .catch(() => {});
    return () => controller.abort();
  }, [fetchWithAuth, messageId, roleId, version]);
  if (!applications.length) return null;
  if (inline)
    return (
      <div className="mt-4 w-full min-w-0">
        {applications.map((application) => (
          <ApplicationReviewPanel
            key={application.messageId}
            initial={application}
          />
        ))}
      </div>
    );
  return (
    <div className="my-3 flex flex-wrap gap-2">
      {applications.map((application, index) => (
        <MuteButton
          key={application.messageId}
          onClick={() => setSelected(application.messageId)}
        >
          <FileText className="size-4" aria-hidden />
          {t("career.application.review.open", "지원서 확인")}
          {applications.length > 1 ? ` · ${applications.length - index}` : ""}
        </MuteButton>
      ))}
      {selected && (
        <ApplicationReviewPanel
          key={selected}
          initial={
            applications.find(
              (application) => application.messageId === selected
            )!
          }
          onClose={() => setSelected(null)}
          onSaved={(saved) =>
            setApplications((previous) =>
              previous.map((application) =>
                application.messageId === saved.messageId ? saved : application
              )
            )
          }
        />
      )}
    </div>
  );
}

export function ApplicationReviewPanel({
  initial: view,
  onClose,
}: {
  initial: ApplicationReviewView;
  onClose?: () => void;
  onSaved?: (view: ApplicationReviewView) => void;
}) {
  const router = useRouter();
  const closeMobileChat = useCareerMobileChatClose();
  const context = useOptionalCareerChatPanelContext();
  const t = useCareerT();
  const review = view.review;
  if (!review && !view.browser?.result) return null;
  const openDocument = (documentId: string) => {
    closeMobileChat?.();
    onClose?.();
    void router.push(getCareerDocumentHref(documentId));
  };
  const documentLink = (documentId: string, title: string) => (
    <MuteButton
      variant="link"
      key={documentId}
      type="button"
      onClick={() => openDocument(documentId)}
    >
      <FileText className="size-4" aria-hidden />
      {title}
    </MuteButton>
  );
  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {view.applicationUrl ? (
        <a
          className="text-sm underline underline-offset-4"
          href={view.applicationUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t("career.application.review.direct", "지원 사이트 열기")}
        </a>
      ) : null}
      {context &&
      view.submissionState === "not_submitted" &&
      !["queued", "running", "waiting"].includes(view.browser?.status ?? "") ? (
        <MuteButton
          variant="dark"
          disabled={context.chatPending}
          onClick={() => {
            onClose?.();
            void context.onSendChatMessage({
              text: [
                t(
                  "career.forms.legacyContinue",
                  "{role}에 이전에 준비한 내용을 바탕으로 지원을 도와줘.",
                  { values: { role: view.roleName } }
                ),
                ...(view.resumeDocumentId
                  ? [
                      `[${t("career.application.review.resumeFile", "이력서 열기")}](documentId:${view.resumeDocumentId})`,
                    ]
                  : []),
                ...(review?.documents ?? [])
                  .filter(
                    (document) => document.documentId !== view.resumeDocumentId
                  )
                  .map(
                    (document) =>
                      `[${document.title}](documentId:${document.documentId})`
                  ),
              ].join("\n"),
              ...(view.roleId
                ? {
                    opportunityMentions: [
                      { roleId: view.roleId, label: view.roleName },
                    ],
                  }
                : {}),
            });
          }}
        >
          {t("career.application.review.resume", "이어서 작성")}
        </MuteButton>
      ) : null}
    </div>
  );
  const content = (
    <div className="space-y-5">
      {view.resumeDocumentId
        ? documentLink(
            view.resumeDocumentId,
            t("career.application.review.resumeFile", "이력서 열기")
          )
        : null}
      {review?.documents?.map((document) =>
        documentLink(document.documentId, document.title)
      )}
      {view.browser?.result ? (
        <div className="space-y-2">
          <p className="font-medium">
            {view.submissionState === "confirmed"
              ? t("career.application.review.sent", "지원 완료")
              : view.submissionState === "unknown"
                ? t(
                    "career.application.review.uncertain",
                    "제출 여부 확인 필요"
                  )
                : t(
                    "career.application.review.incomplete",
                    "지원이 완료되지 않았어요"
                  )}
          </p>
          <p className="whitespace-pre-wrap text-sm">
            {view.browser.result.summary}
          </p>
        </div>
      ) : null}
      <dl className="space-y-4">
        {review?.form.fields.map((field, index) => {
          const answer = review.fields.find(
            (value) => value.fieldId === applicationFieldId(index)
          );
          return (
            <div key={applicationFieldId(index)}>
              <dt className="text-sm font-medium">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {answer?.documentId
                  ? documentLink(answer.documentId, field.label)
                  : answer?.values?.join(", ") || answer?.value || "—"}
              </dd>
            </div>
          );
        })}
      </dl>
      {view.batch?.review ? (
        <RichText content={view.batch.review.markdown} variant="career" />
      ) : null}
    </div>
  );
  if (onClose)
    return (
      <TalentCareerModal
        open
        onClose={onClose}
        title={view.roleName}
        ariaLabel={t("career.application.review.open", "지원서 확인")}
        panelClassName="max-w-3xl"
        bodyClassName="bg-bg-floating p-4 sm:p-5"
        footer={footer}
      >
        {content}
      </TalentCareerModal>
    );
  return (
    <section
      aria-label={t("career.application.review.open", "지원서 확인")}
      className="career-glass career-work-surface w-full min-w-0 p-[18px] text-neutral-primary"
    >
      <h3 className="mb-5 text-sm font-semibold leading-6">{view.roleName}</h3>
      {content}
      <div className="mt-5">{footer}</div>
    </section>
  );
}
