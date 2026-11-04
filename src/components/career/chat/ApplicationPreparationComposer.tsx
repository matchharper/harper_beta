export { PreparationDocumentPicker } from "./PreparationDocumentPicker";
import { QuestionComposer } from "./QuestionComposer";
import {
  PreparationComposerView,
  PreparationEditableText,
  PreparationChangeEdit,
  PreparationDecisionActions,
  PreparationOptionList,
} from "./PreparationComposerView";
import { isApplicationInspectionPending } from "@/lib/career/simulation/applicationForm";
import {
  applicationQuestionItems,
  pendingApplicationBatch,
} from "@/lib/career/simulation/applicationInput";
import { useEffect, useRef, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import { MuteButton, CardButton } from "@/components/ui/button";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import { useCareerT } from "@/i18n/useCareerT";
import type { SimulationSession } from "@/lib/career/simulation/session";
import { useApplicationPreparation } from "./ApplicationPreparationContext";
import { ApplicationEndConfirmation } from "./ApplicationEndConfirmation";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";
import { preparationKind } from "@/lib/career/simulation/preparation";
import type { PreparationResponse } from "@/lib/career/simulation/preparation";

const numberedOptionClassName =
  "flex w-full items-center justify-start gap-2 rounded-xl min-h-10 sm:min-h-9 px-2 py-1 text-left text-[length:inherit] text-sm font-normal leading-[inherit]";
const optionNumberClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-inverse text-xs text-on-inverse";

export function shouldShowPreparationQuestions(s?: SimulationSession | null) {
  return Boolean(
    s?.preparation &&
    s.status === "active" &&
    s.analysisStatus === "completed" &&
    applicationQuestionItems(s).length > 0 &&
    s.preparation.showInputs &&
    s.preparation.generation.status !== "running"
  );
}

export function shouldShowPreparationReopen(s?: SimulationSession | null) {
  return Boolean(
    s?.status === "active" &&
    !s.preparation?.showInputs &&
    applicationQuestionItems(s).length > 0
  );
}

// The parent places this slot inside the same width/padding wrapper as the ordinary composer.
export function ApplicationPreparationComposerSlot({
  children,
}: {
  children: React.ReactNode;
}) {
  const { record, renderedReviewId, error, pending, command } =
    useApplicationPreparation();
  const t = useCareerT();
  const review = record
    ? pendingApplicationBatch(record.state)?.review
    : undefined;
  const waitingForInspection =
    record?.state.status === "active" &&
    isApplicationInspectionPending(record.state) &&
    Boolean(record.state.preparation?.resumeDelivery);
  const canContinue =
    !pending &&
    record?.state.status === "active" &&
    ((!isApplicationInspectionPending(record.state) &&
      ["pending", "failed"].includes(
        record.state.preparation?.applicationFollowUp?.status ?? ""
      )) ||
      record.state.activity?.batches.some(
        (b) =>
          b.status === "submitted" &&
          !(record.state.applicationReview && b.browser) &&
          ["pending", "failed"].includes(b.continuation)
      ));
  return !(
    record?.state.applicationReview &&
    pendingApplicationBatch(record.state)?.browser
  ) &&
    shouldShowPreparationQuestions(record?.state) &&
    (!review || renderedReviewId === review.id) ? (
    <ApplicationPreparationComposer />
  ) : (
    <>
      {waitingForInspection && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 text-sm text-neutral-muted"
        >
          <Loader2
            aria-hidden
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          {t(
            "career.application.inspection.waiting",
            "지원에 필요한 항목을 추가로 확인하고 있어요."
          )}
        </div>
      )}
      {error && (
        <div role="alert" className="text-sm text-neutral-muted">
          {error}
          <MuteButton
            disabled={pending}
            onClick={() => void command({ operation: "continue" })}
          >
            {t("career.application.answers.retry", "답변 전송 다시 시도")}
          </MuteButton>
        </div>
      )}
      {!error && canContinue && (
        <div className="mb-3">
          <MuteButton onClick={() => void command({ operation: "continue" })}>
            {t("career.application.steps.continue", "이어서 하기")}
          </MuteButton>
        </div>
      )}
      {children}
    </>
  );
}
export function ApplicationPreparationReopen() {
  const { record, pending, command } = useApplicationPreparation();
  const t = useCareerT();
  if (!shouldShowPreparationReopen(record?.state)) return null;
  return (
    <MuteButton
      disabled={pending}
      onClick={() => void command({ operation: "show" })}
    >
      {t("career.application.questions.reopen", "질문 보기")}
    </MuteButton>
  );
}
export function ApplicationPreparationComposer() {
  const { record, pending, error, command } = useApplicationPreparation();
  const t = useCareerT();
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const endTriggerRef = useRef<HTMLButtonElement>(null);
  const draftScope = `harper-application-composer:v1:${record?.state.sessionId}:${record ? pendingApplicationBatch(record.state)?.id : ""}`;
  const [draftInputs, setDraftInputs, clearInputs] =
    useApplicationComposerDraft(`${draftScope}:answers`);
  const [editedTexts, setEditedTexts, clearEdits] = useApplicationComposerDraft(
    `${draftScope}:edits`
  );
  const clearDrafts = () => {
    clearInputs();
    clearEdits();
  };
  const [flash, setFlash] = useState<{ key: string; decision: string } | null>(
    null
  );
  const lock = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const s = record?.state,
    p = s?.preparation;
  const items = s ? applicationQuestionItems(s) : [];
  const item = items.find((a) => a.id === p?.currentItemId) ?? items[0];
  const index = items.findIndex((a) => a.id === item?.id);
  const inputKey = `${record?.messageId}:${(s ? pendingApplicationBatch(s)?.id : undefined) ?? ""}:${item?.id}`;
  const text =
    draftInputs[inputKey] ?? (item && p?.responses[item.id]?.text) ?? "";
  const kind = item ? preparationKind(item) : "question";
  const canDecide =
    kind === "change" || (kind === "material" && item?.draftText !== undefined);
  const edits = item?.edits?.length
    ? item.edits
    : item?.originalText || item?.suggestedText
      ? [
          {
            target: item.target,
            originalText: item.originalText ?? "",
            suggestedText: item.suggestedText ?? "",
          },
        ]
      : [];
  const busy = pending || flash?.key === inputKey;
  const answer = (raw: PreparationResponse) => {
    if (!item || busy || lock.current) return;
    lock.current = true;
    const response = { ...raw };
    if (response.decision === "accept") {
      if (kind === "change")
        response.edits = edits.map((e, i) => ({
          ...e,
          suggestedText: editedTexts[`${inputKey}:${i}`] ?? e.suggestedText,
        }));
      if (item.draftText !== undefined)
        response.draftText =
          editedTexts[`${inputKey}:material`] ?? item.draftText;
    }
    setFlash({ key: inputKey, decision: response.decision });
    timer.current = setTimeout(() => {
      void command({ operation: "respond", itemId: item.id, response })
        .then((ok) => {
          if (ok && index === items.length - 1) {
            clearDrafts();
            return;
          }
          if (ok)
            setDraftInputs((prev) => {
              const next = { ...prev };
              delete next[inputKey];
              return next;
            });
        })
        .finally(() => {
          lock.current = false;
          setFlash(null);
        });
    }, 180);
  };
  const navigate = (offset: number) => {
    const next = items[index + offset];
    if (next && !busy && !lock.current && !endConfirmationOpen) {
      void command({ operation: "navigate", itemId: next.id });
    }
  };
  if (!s || !p || !item || !shouldShowPreparationQuestions(s)) return null;
  if (kind === "question")
    return (
      <QuestionComposer
        title={item.title}
        question={item.reason || item.proposal}
        index={index}
        count={items.length}
        value={text}
        busy={busy}
        error={error}
        closeLabel={t("career.application.end.label", "지원 과정 종료")}
        onClose={() => setEndConfirmationOpen(true)}
        onNavigate={navigate}
        onChange={(value) => {
          setDraftInputs((prev) => ({ ...prev, [inputKey]: value }));
          if (p.responses[item.id])
            void command({ operation: "clear", itemId: item.id });
        }}
        onAnswer={() => answer({ decision: "answer", text })}
        onSkip={() => answer({ decision: "skip" })}
      >
        <ApplicationEndConfirmation
          open={endConfirmationOpen}
          onClose={() => setEndConfirmationOpen(false)}
          onEnded={clearDrafts}
        />
      </QuestionComposer>
    );
  const selected =
    flash?.key === inputKey
      ? flash.decision
      : draftInputs[inputKey] === undefined
        ? p.responses[item.id]?.decision
        : undefined;
  const editable = (value: string, key: string) => (
    <PreparationEditableText
      key={key}
      busy={busy}
      value={editedTexts[key] ?? value}
      onChange={(value) =>
        setEditedTexts((previous) => ({ ...previous, [key]: value }))
      }
    />
  );
  return (
    <PreparationComposerView
      variant="suggestion"
      itemId={item.id}
      inputKey={inputKey}
      responseFlash={flash?.key === inputKey ? flash.decision : undefined}
      title={
        item.documentPurpose === "final_resume"
          ? t("career.application.method.title", "어떤 방식으로 지원할까요?")
          : item.title
      }
      titleAside={
        canDecide && item.reason.trim() ? (
          <ResponsiveLightTooltip
            className="w-auto shrink-0"
            mobileAriaLabel={t("career.simulation.basis", "판단 근거")}
            triggerClassName="shrink-0"
            trigger={
              <Info
                size={16}
                aria-label={t("career.simulation.basis", "판단 근거")}
              />
            }
          >
            {item.reason}
          </ResponsiveLightTooltip>
        ) : undefined
      }
      index={index}
      count={items.length}
      value={text}
      busy={busy}
      error={error}
      inputLabel={t("career.prep.directInput", "하퍼에게 직접 말하기…")}
      closeLabel={t("career.application.end.label", "지원 과정 종료")}
      closeHasDialog
      closeRef={endTriggerRef}
      onClose={() => setEndConfirmationOpen(true)}
      onNavigate={navigate}
      onChange={(value) => {
        setDraftInputs((previous) => ({ ...previous, [inputKey]: value }));
        if (p.responses[item.id])
          void command({ operation: "clear", itemId: item.id });
      }}
      onAnswer={() => void answer({ decision: "answer", text })}
      onSkip={() => void answer({ decision: "skip" })}
      body={
        <>
          {kind === "change" &&
            edits.map((edit, i) => (
              <PreparationChangeEdit
                key={i}
                target={edit.target}
                originalText={edit.originalText}
                value={editedTexts[`${inputKey}:${i}`] ?? edit.suggestedText}
                busy={busy}
                onChange={(value) =>
                  setEditedTexts((previous) => ({
                    ...previous,
                    [`${inputKey}:${i}`]: value,
                  }))
                }
              />
            ))}
          {kind === "choice" && item.proposal && (
            <p className="whitespace-pre-wrap">{item.proposal}</p>
          )}
          {kind === "material" &&
            item.draftText === undefined &&
            item.documentPurpose !== "final_resume" && (
              <p className="whitespace-pre-wrap">{item.proposal}</p>
            )}
          {kind === "material" &&
            item.draftText !== undefined &&
            editable(item.draftText, `${inputKey}:material`)}
          {kind === "material" && item.documentName && (
            <p className="break-words">{item.documentName}</p>
          )}
        </>
      }
      actions={
        <>
          {canDecide && (
            <PreparationDecisionActions
              busy={busy}
              positive={{
                id: "accept",
                label: t("career.application.suggestions.accept", "적용"),
                selected: selected === "accept",
                onClick: () => void answer({ decision: "accept" }),
              }}
              negative={{
                id: "ignore",
                label: t(
                  "career.application.suggestions.ignore",
                  "적용하지 않기"
                ),
                selected: selected === "ignore",
                onClick: () => void answer({ decision: "ignore" }),
              }}
            />
          )}
          {kind === "choice" && (
            <PreparationOptionList
              options={item.options ?? []}
              busy={busy}
              selectedIds={item.options
                ?.filter(
                  (option) => p.responses[item.id]?.text === option.label
                )
                .map((option) => option.id)}
              onSelect={(id) => {
                const option = item.options?.find((option) => option.id === id);
                if (option)
                  void answer({
                    decision: "answer",
                    text: option.label,
                    optionId: option.id,
                  });
              }}
            />
          )}
          {kind === "material" && item.draftText === undefined && (
            <div className="mt-3 grid auto-rows-fr shrink-0 gap-1">
              {item.documentPurpose !== "final_resume" && (
                <CardButton
                  className={numberedOptionClassName}
                  disabled={busy}
                  onClick={() => void answer({ decision: "help" })}
                >
                  <span className={optionNumberClassName}>1</span>
                  {t("career.prep.help", "자료 준비를 도와주세요")}
                </CardButton>
              )}
              {item.documentId && (
                <CardButton
                  className={numberedOptionClassName}
                  disabled={busy}
                  onClick={() =>
                    void answer({
                      decision: "document",
                      documentId: item.documentId,
                      ...(item.documentPurpose === "final_resume"
                        ? {
                            applicationMethod: "harper" as const,
                            text: t(
                              "career.application.method.harper",
                              "하퍼가 대신 지원하기: 브라우저로 지원을 진행하고, 실패하면 알려드려요."
                            ),
                          }
                        : {}),
                    })
                  }
                >
                  <span className={optionNumberClassName}>
                    {item.documentPurpose === "final_resume" ? 1 : 2}
                  </span>
                  {item.documentPurpose === "final_resume"
                    ? t(
                        "career.application.method.harper",
                        "하퍼가 대신 지원하기: 브라우저로 지원을 진행하고, 실패하면 알려드려요."
                      )
                    : t("career.application.file.use", "이 파일로 지원하기")}
                </CardButton>
              )}
              <CardButton
                className={numberedOptionClassName}
                disabled={busy}
                onClick={() =>
                  void answer({
                    ...(item.documentPurpose === "final_resume"
                      ? {
                          decision: item.documentId
                            ? ("document" as const)
                            : ("answer" as const),
                          documentId: item.documentId,
                          applicationMethod: "manual" as const,
                          text: t(
                            "career.application.method.manual",
                            "직접 지원하기: 확정한 이력서와 부수 자료를 받아 직접 제출할게요."
                          ),
                        }
                      : {
                          decision: "answer" as const,
                          text: t(
                            "career.application.file.changeRequest",
                            "다른 파일을 사용할게요. 일반 채팅에서 파일을 첨부하거나 Docs에서 선택할게요."
                          ),
                        }),
                  })
                }
              >
                <span className={optionNumberClassName}>
                  {(item.documentPurpose === "final_resume" ? 0 : 1) +
                    (item.documentId ? 2 : 1)}
                </span>
                {item.documentPurpose === "final_resume"
                  ? t(
                      "career.application.method.manual",
                      "직접 지원하기: 확정한 이력서와 부수 자료를 받아 직접 제출할게요."
                    )
                  : t("career.application.file.change", "다른 파일 사용하기")}
              </CardButton>
            </div>
          )}
        </>
      }
    >
      <ApplicationEndConfirmation
        open={endConfirmationOpen}
        onClose={() => setEndConfirmationOpen(false)}
        onEnded={clearDrafts}
      />
    </PreparationComposerView>
  );
}
