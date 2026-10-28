import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";
import { isApplicationInspectionPending } from "@/lib/career/simulation/applicationForm";
import {
  applicationQuestionItems,
  pendingApplicationBatch,
} from "@/lib/career/simulation/applicationInput";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ArrowUp,
  Info,
  Loader2,
  Check,
} from "lucide-react";
import { MuteButton, CardButton } from "@/components/ui/button";
import { ChatComposerSurface } from "@/components/chat/ChatComposer";
import { ResponsiveLightTooltip } from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { uploadTalentDocument } from "@/lib/talentOnboarding/documentUploadClient";
import { Textarea } from "@/components/ui/textarea";
import type { SimulationSession } from "@/lib/career/simulation/session";
import { useApplicationPreparation } from "./ApplicationPreparationContext";
import { ApplicationEndConfirmation } from "./ApplicationEndConfirmation";
import { useApplicationComposerDraft } from "./useApplicationComposerDraft";
import { preparationKind } from "@/lib/career/simulation/preparation";
import type { PreparationResponse } from "@/lib/career/simulation/preparation";
import { cn } from "@/lib/utils";

const numberedOptionClassName =
  "flex w-full items-center justify-start gap-2 rounded-xl min-h-10 sm:min-h-9 px-2 py-1 text-left text-[length:inherit] text-sm font-normal leading-[inherit]";
const optionNumberClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black text-xs text-white";

export function PreparationDocumentPicker({
  resume = false,
  disabled,
  selectedId,
  onPick,
}: {
  resume?: boolean;
  disabled: boolean;
  selectedId?: string;
  onPick: (id: string) => void | Promise<void>;
}) {
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const [docs, setDocs] = useState<
    { id: string; fileName: string; kind: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetchWithAuth("/api/talent/documents", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [fetchWithAuth]);
  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const result = await uploadTalentDocument({
        fetchWithAuth,
        file,
        kind: resume ? "resume" : "document",
        source: "chat",
      });
      const d = result.document;
      if (typeof d?.id !== "string") throw new Error();
      const id = d.id;
      setDocs((prev) => [
        ...prev.filter((p) => p.id !== d.id),
        {
          id,
          fileName: typeof d.fileName === "string" ? d.fileName : file.name,
          kind: resume ? "resume" : "document",
        },
      ]);
      await onPick(id);
    } catch {
      setError(
        t(
          "career.prep.uploadError",
          "파일을 연결하지 못했어요. 다시 시도해 주세요."
        )
      );
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Select
        disabled={disabled || uploading}
        onValueChange={(id) => {
          if (id) void onPick(id);
        }}
        value={selectedId ?? ""}
      >
        <SelectTrigger aria-label={t("career.prep.selectDoc", "Docs에서 선택")}>
          <SelectValue
            placeholder={t("career.prep.selectDoc", "Docs에서 선택")}
          />
        </SelectTrigger>
        <SelectContent>
          {docs
            .filter((d) => !resume || d.kind === "resume")
            .map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.fileName}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <MuteButton
        disabled={disabled || uploading}
        onClick={() => ref.current?.click()}
      >
        {uploading
          ? t("career.prep.uploading", "업로드 중…")
          : t("career.prep.upload", "새 파일 첨부")}
      </MuteButton>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt,.md"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

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
    record.state.activity?.batches.some(
      (b) => b.status === "submitted" && b.continuation !== "done"
    );
  const canContinue =
    !pending &&
    !waitingForInspection &&
    record?.state.status === "active" &&
    record.state.activity?.batches.some(
      (b) =>
        b.status === "submitted" &&
        ["pending", "failed"].includes(b.continuation)
    );
  return shouldShowPreparationQuestions(record?.state) &&
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
            "답변을 저장했어요. 지원에 필요한 항목을 마저 확인하고 있어요."
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
            {t(
              "career.application.answers.continue",
              "저장된 답변으로 준비 계속하기"
            )}
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
  const [highlight, setHighlight] = useState<{
    key: string;
    index: number;
  } | null>(null);
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
          setHighlight(null);
        });
    }, 180);
  };
  const navigate = (offset: number) => {
    const next = items[index + offset];
    if (next && !busy && !lock.current) {
      setHighlight(null);
      void command({ operation: "navigate", itemId: next.id });
    }
  };
  useEffect(() => {
    if (!s || !item || !shouldShowPreparationQuestions(s)) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (
        busy ||
        endConfirmationOpen ||
        lock.current ||
        e.repeat ||
        e.isComposing ||
        e.keyCode === 229 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]'
        )
      )
        return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        navigate(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (!canDecide) return;
      if (e.key === "1" || e.key === "2") {
        e.preventDefault();
        answer({ decision: e.key === "1" ? "accept" : "ignore" });
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight({
          key: inputKey,
          index:
            highlight?.key === inputKey
              ? (highlight.index + 1) % 2
              : e.key === "ArrowUp"
                ? 1
                : 0,
        });
      } else if (e.key === "Enter" && highlight?.key === inputKey) {
        e.preventDefault();
        answer({ decision: highlight.index === 0 ? "accept" : "ignore" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (!s || !p || !item || !shouldShowPreparationQuestions(s)) return null;
  const selected =
    flash?.key === inputKey
      ? flash.decision
      : draftInputs[inputKey] === undefined
        ? p.responses[item.id]?.decision
        : undefined;
  const editable = (value: string, key: string) => (
    <Textarea
      key={key}
      unstyled
      autoResize
      rows={1}
      readOnly={busy}
      value={editedTexts[key] ?? value}
      aria-label={t("career.application.suggestions.edit", "제안 문구 수정")}
      placeholder={t("career.application.suggestions.deleted", "이 문구 삭제")}
      className="block w-full resize-none border-0 bg-transparent px-2 py-1.5 -mx-2 text-left text-[16px] font-[inherit] leading-[inherit] text-[color:inherit] whitespace-pre-wrap break-words outline-none shadow-none placeholder:text-[color:inherit] focus:bg-transparent focus:outline-none focus:ring-0 focus:shadow-none md:text-[length:inherit]"
      onChange={(e) =>
        setEditedTexts((prev) => ({ ...prev, [key]: e.target.value }))
      }
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
  return (
    <ChatComposerSurface
      data-preparation-questions=""
      data-suggestion-id={item.id}
      data-response-flash={flash?.key === inputKey ? flash.decision : undefined}
      aria-busy={busy}
      style={careerTimelineTypographyStyle}
      className={`flex max-h-[min(540px,70dvh)] flex-col p-3 md:p-4 transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none ${flash?.key === inputKey ? "ring-1 ring-primary/20" : ""} ${careerTimelineMessageTextClassName}`}
    >
      <div className="grid shrink-0 grid-cols-1 gap-2 pb-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="row-start-2 flex min-w-0 items-start gap-2 sm:row-start-1">
          <strong className="min-w-0 break-words text-inherit font-medium">
            {item.documentPurpose === "final_resume"
              ? t(
                  "career.application.method.title",
                  "어떤 방식으로 지원할까요?"
                )
              : item.title}
          </strong>
          {canDecide && item.reason.trim() && (
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
          )}
        </div>
        <div className="row-start-1 flex items-center justify-between gap-2 text-xs text-neutral-muted sm:col-start-2 sm:justify-end">
          <div className="flex items-center gap-1">
            <MuteButton
              variant="transparent"
              className="border-0 bg-transparent shadow-none"
              aria-label={t("career.prep.previous", "이전 항목")}
              disabled={busy || index <= 0}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </MuteButton>
            <span>
              {index + 1} / {items.length}
            </span>
            <MuteButton
              variant="transparent"
              className="border-0 bg-transparent shadow-none"
              aria-label={t("career.prep.next", "다음 항목")}
              disabled={busy || index >= items.length - 1}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </MuteButton>
          </div>
          <MuteButton
            variant="transparent"
            aria-label={t("career.application.end.label", "지원 과정 종료")}
            aria-haspopup="dialog"
            ref={endTriggerRef}
            disabled={busy}
            onClick={() => setEndConfirmationOpen(true)}
          >
            <X size={16} />
          </MuteButton>
        </div>
      </div>
      <div className="relative flex min-h-0 max-h-[min(300px,38dvh)] flex-col">
        <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain py-4 [overflow-wrap:anywhere]">
          {kind === "change" &&
            edits.map((edit, i) => (
              <div
                key={i}
                className="space-y-1.5 border-t border-neutral-1000-a05 pt-2"
              >
                {edit.target && (
                  <p className="text-xs text-neutral-muted">{edit.target}</p>
                )}
                {edit.originalText && (
                  <>
                    <p className="text-xs text-neutral-muted">
                      {t("career.prep.original", "원문")}
                    </p>
                    <del className="block whitespace-pre-wrap text-critical">
                      {edit.originalText}
                    </del>
                  </>
                )}
                {(edit.suggestedText ||
                  editedTexts[`${inputKey}:${i}`] !== undefined) && (
                  <>
                    <p className="text-xs text-neutral-muted">
                      {t("career.prep.example", "수정 예시")}
                    </p>
                    <div className="text-neutral-primary">
                      {editable(edit.suggestedText, `${inputKey}:${i}`)}
                    </div>
                  </>
                )}
              </div>
            ))}
          {kind === "question" && (
            <p className="whitespace-pre-wrap">
              {item.reason || item.proposal}
            </p>
          )}
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
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4 bg-linear-to-b from-white/50 to-transparent"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-4 bg-linear-to-t from-white/50 to-transparent"
        />
      </div>
      {canDecide && (
        <div className="grid auto-rows-fr grid-cols-2 shrink-0 gap-2 bg-linear-to-t from-white to-transparent">
          {(["ignore", "accept"] as const).map((decision, i) => (
            <MuteButton
              key={decision}
              className={cn(
                decision === "accept"
                  ? "bg-neutral-primary text-white hover:bg-neutral-primary/80"
                  : "text-red-600",
                selected === decision
                  ? "bg-action text-white hover:bg-action/80"
                  : "",
                "rounded-full"
              )}
              aria-pressed={selected === decision}
              disabled={busy}
              onClick={() => void answer({ decision })}
            >
              {decision === "accept"
                ? t("career.application.suggestions.accept", "적용")
                : t("career.application.suggestions.ignore", "적용하지 않기")}
            </MuteButton>
          ))}
        </div>
      )}
      {kind === "choice" && (
        <div className="grid auto-rows-fr max-h-[min(144px,20dvh)] shrink-0 gap-1 overflow-y-auto">
          {item.options?.map((option, i) => (
            <CardButton
              key={option.id}
              disabled={busy}
              className={numberedOptionClassName}
              selected={p.responses[item.id]?.text === option.label}
              onClick={() =>
                void answer({
                  decision: "answer",
                  text: option.label,
                  optionId: option.id,
                })
              }
            >
              <span className={optionNumberClassName}>{i + 1}</span>
              <span>
                {option.label}
                {option.description ? `: ${option.description}` : ""}
              </span>
            </CardButton>
          ))}
        </div>
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
      <form
        className="mt-2 flex shrink-0 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !busy) void answer({ decision: "answer", text });
        }}
      >
        <Textarea
          unstyled
          autoResize
          key={inputKey}
          rows={1}
          className="min-h-8 max-h-24 flex-1 resize-none bg-transparent outline-none focus:ring-0 focus:shadow-none focus:bg-transparent py-1 text-[16px] leading-[inherit] md:text-[length:inherit]"
          value={text}
          disabled={busy}
          aria-label={
            kind === "question"
              ? t("career.prep.answerInput", "답변 입력")
              : t("career.prep.directInput", "하퍼에게 직접 말하기…")
          }
          placeholder={
            kind === "question"
              ? t("career.prep.answerInput", "답변 입력")
              : t("career.prep.directInput", "하퍼에게 직접 말하기…")
          }
          onKeyDown={(e) => {
            // IME confirmation (including Safari's 229 event) must not submit Korean text.
            if (
              e.key !== "Enter" ||
              e.shiftKey ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return;
            e.preventDefault();
            if (!e.repeat && text.trim() && !busy)
              void answer({ decision: "answer", text });
          }}
          onChange={(e) => {
            setDraftInputs((prev) => ({ ...prev, [inputKey]: e.target.value }));
            setHighlight(null);
            if (p.responses[item.id])
              void command({ operation: "clear", itemId: item.id });
          }}
        />
        {text.trim() && (
          <MuteButton
            type="submit"
            variant="primary"
            className="size-8 rounded-full p-0"
            disabled={busy}
            aria-label={t("career.prep.saveNext", "답변 저장 후 다음")}
          >
            <ArrowUp size={16} />
          </MuteButton>
        )}
        <MuteButton
          type="button"
          disabled={busy}
          onClick={() => void answer({ decision: "skip" })}
        >
          {t("career.prep.skip", "건너뛰기")}
        </MuteButton>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-critical">
          {error}
        </p>
      )}
      <ApplicationEndConfirmation
        open={endConfirmationOpen}
        onClose={() => setEndConfirmationOpen(false)}
        onEnded={clearDrafts}
      />
    </ChatComposerSurface>
  );
}
