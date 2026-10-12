import {
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";
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
  Pencil,
  Info,
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
import {
  preparationKind,
  allPreparationAnswered,
} from "@/lib/career/simulation/preparation";
import type { PreparationResponse } from "@/lib/career/simulation/preparation";

const numberedOptionClassName =
  "flex w-full items-center justify-start gap-3 rounded-xl min-h-11 px-3 py-2 text-left text-[length:inherit] font-normal leading-[inherit]";
const optionNumberClassName =
  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-1000-a10 text-xs text-neutral-muted";

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

// The parent places this slot inside the same width/padding wrapper as the ordinary composer.
export function ApplicationPreparationComposerSlot({
  children,
}: {
  children: React.ReactNode;
}) {
  const { record, renderedReviewId, error, pending, command } = useApplicationPreparation();
  const t = useCareerT();
  const review = record ? pendingApplicationBatch(record.state)?.review : undefined;
  return shouldShowPreparationQuestions(record?.state) && (!review || renderedReviewId === review.id) ? (
    <ApplicationPreparationComposer />
  ) : (
    <>{error && <div role="alert" className="text-sm text-neutral-muted">{error}<MuteButton disabled={pending} onClick={() => void command({operation:"continue"})}>{t("career.application.answers.retry", "답변 전송 다시 시도")}</MuteButton></div>}{children}</>
  );
}
export function ApplicationPreparationReopen() {
  const { record, pending, command } = useApplicationPreparation();
  const t = useCareerT();
  const s = record?.state;
  if (
    !s ||
    s.status !== "active" ||
    s.preparation?.showInputs ||
    !applicationQuestionItems(s).length
  )
    return null;
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
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const s = record?.state,
    p = s?.preparation;
  const items = s ? applicationQuestionItems(s) : [];
  const item = items.find((a) => a.id === p?.currentItemId) ?? items[0];
  const index = items.findIndex((a) => a.id === item?.id);
  const inputKey = `${record?.messageId}:${item?.id}`;
  const text =
    draftInputs[inputKey] ?? (item && p?.responses[item.id]?.text) ?? "";
  if (!s || !p || !item || !shouldShowPreparationQuestions(s)) return null;
  const kind = preparationKind(item);
  const answer = async (response: PreparationResponse) => {
    const ok = await command({
      operation: "respond",
      itemId: item.id,
      response,
    });
    if (ok)
      setDraftInputs((prev) => {
        const next = { ...prev };
        delete next[inputKey];
        return next;
      });
  };
  const edits = item.edits?.length
    ? item.edits
    : item.originalText || item.suggestedText
      ? [
          {
            target: item.target,
            originalText: item.originalText ?? "",
            suggestedText: item.suggestedText ?? "",
          },
        ]
      : [];
  return (
    <ChatComposerSurface
      data-preparation-questions=""
      style={careerTimelineTypographyStyle}
      className={`flex max-h-[min(360px,55dvh)] flex-col p-3 md:p-4 ${careerTimelineMessageTextClassName}`}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 pb-3">
        <div className="flex min-w-0 items-start gap-2">
          <strong className="min-w-0 break-words text-inherit font-medium">
            {item.documentPurpose === "final_resume"
              ? t("career.application.method.title", "어떤 방식으로 지원할까요?")
              : item.title}
          </strong>
          {kind === "change" && item.reason.trim() && (
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
        <div className="flex shrink-0 items-center gap-1 text-xs text-neutral-muted">
          <MuteButton
            variant="transparent"
            className="border-0 bg-transparent shadow-none"
            aria-label={t("career.prep.previous", "이전 항목")}
            disabled={pending || index <= 0}
            onClick={() =>
              void command({
                operation: "navigate",
                itemId: items[index - 1].id,
              })
            }
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
            disabled={pending || index >= items.length - 1}
            onClick={() =>
              void command({
                operation: "navigate",
                itemId: items[index + 1].id,
              })
            }
          >
            <ChevronRight size={16} />
          </MuteButton>
          <MuteButton
            variant="transparent"
            className="border-0 bg-transparent shadow-none"
            aria-label={t("career.prep.collapse", "접고 채팅하기")}
            disabled={pending}
            onClick={() => void command({ operation: "hide" })}
          >
            <X size={16} />
          </MuteButton>
        </div>
      </div>
      <div className="min-h-0 max-h-[min(300px,35dvh)] space-y-3 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]">
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
              {edit.suggestedText && (
                <>
                  <p className="text-xs text-neutral-muted">
                    {t("career.prep.example", "수정 예시")}
                  </p>
                  <p className="whitespace-pre-wrap text-positive">
                    {edit.suggestedText}
                  </p>
                </>
              )}
            </div>
          ))}
        {kind === "question" && (
          <p className="whitespace-pre-wrap">
            {item.questions.length ? item.questions.join("\n") : item.proposal}
          </p>
        )}
        {kind === "choice" && item.proposal && (
          <p className="whitespace-pre-wrap">{item.proposal}</p>
        )}
        {kind === "material" && item.documentPurpose !== "final_resume" && (
          <p className="whitespace-pre-wrap">{item.proposal}</p>
        )}
        {kind === "material" && item.documentName && (
          <p className="break-words">{item.documentName}</p>
        )}

        {p.responses[item.id] && (
          <p className="text-xs text-neutral-muted">
            {t(
              "career.prep.saved",
              "이 항목의 응답이 저장됐어요. 다시 선택하거나 수정할 수 있어요."
            )}
          </p>
        )}
      </div>
      {kind === "change" && (
        <div className="mt-3 grid auto-rows-fr shrink-0 gap-1">
          {(["accept", "ignore"] as const).map((decision, i) => (
            <CardButton
              key={decision}
              selected={p.responses[item.id]?.decision === decision}
              aria-pressed={p.responses[item.id]?.decision === decision}
              disabled={pending}
              className={numberedOptionClassName}
              onClick={() => void answer({ decision })}
            >
              <span className={optionNumberClassName}>{i + 1}</span>
              {decision === "accept"
                ? t("career.prep.accept", "수락")
                : t("career.prep.no", "아니요")}
            </CardButton>
          ))}
        </div>
      )}
      {kind === "choice" && (
        <div className="mt-3 grid auto-rows-fr max-h-[min(144px,20dvh)] shrink-0 gap-1 overflow-y-auto">
          {item.options?.map((option, i) => (
            <CardButton
              key={option.id}
              disabled={pending}
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
      {kind === "material" && (
        <div className="mt-3 grid auto-rows-fr shrink-0 gap-1">
          {item.documentPurpose !== "final_resume" && (
            <CardButton
              className={numberedOptionClassName}
              disabled={pending}
              onClick={() => void answer({ decision: "help" })}
            >
              <span className={optionNumberClassName}>1</span>
              {t("career.prep.help", "자료 준비를 도와주세요")}
            </CardButton>
          )}
          {item.documentId && (
            <CardButton
              className={numberedOptionClassName}
              disabled={pending}
              onClick={() =>
                void answer({
                  decision: "document",
                  documentId: item.documentId,
                  ...(item.documentPurpose === "final_resume" ? {applicationMethod: "harper" as const, text: t("career.application.method.harper", "하퍼가 대신 지원하기: 브라우저로 지원을 진행하고, 실패하면 알려드려요.")} : {}),
                })
              }
            >
              <span className={optionNumberClassName}>{item.documentPurpose === "final_resume" ? 1 : 2}</span>
              {item.documentPurpose === "final_resume"
                ? t("career.application.method.harper", "하퍼가 대신 지원하기: 브라우저로 지원을 진행하고, 실패하면 알려드려요.")
                : t("career.application.file.use", "이 파일로 지원하기")}
            </CardButton>
          )}
          <CardButton
            className={numberedOptionClassName}
            disabled={pending}
            onClick={() =>
              void answer({
                ...(item.documentPurpose === "final_resume" ? {
                  decision: item.documentId ? "document" as const : "answer" as const,
                  documentId: item.documentId,
                  applicationMethod: "manual" as const,
                  text: t("career.application.method.manual", "직접 지원하기: 확정한 이력서와 부수 자료를 받아 직접 제출할게요."),
                } : {decision: "answer" as const,
                text: t(
                  "career.application.file.changeRequest",
                  "다른 파일을 사용할게요. 일반 채팅에서 파일을 첨부하거나 Docs에서 선택할게요."
                )}),
              })
            }
          >
            <span className={optionNumberClassName}>
              {(item.documentPurpose === "final_resume" ? 0 : 1) + (item.documentId ? 2 : 1)}
            </span>
            {item.documentPurpose === "final_resume"
              ? t("career.application.method.manual", "직접 지원하기: 확정한 이력서와 부수 자료를 받아 직접 제출할게요.")
              : t("career.application.file.change", "다른 파일 사용하기")}
          </CardButton>
        </div>
      )}
      <form
        className="mt-3 flex shrink-0 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !pending)
            void answer({ decision: "answer", text });
        }}
      >
        <Pencil size={16} className="mb-2 shrink-0 text-neutral-muted" />
        <Textarea
          unstyled
          autoResize
          key={inputKey}
          rows={1}
          className="min-h-8 max-h-24 flex-1 resize-none bg-transparent outline-none focus:ring-0 focus:shadow-none focus:bg-transparent py-1 text-[length:inherit] leading-[inherit]"
          value={text}
          disabled={pending}
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
            if (!e.repeat && text.trim() && !pending)
              void answer({ decision: "answer", text });
          }}
          onChange={(e) =>
            setDraftInputs((prev) => ({ ...prev, [inputKey]: e.target.value }))
          }
        />
        {text.trim() && (
          <MuteButton
            type="submit"
            disabled={pending}
            aria-label={t("career.prep.saveNext", "답변 저장 후 다음")}
          >
            <ArrowUp size={16} />
          </MuteButton>
        )}
        <MuteButton
          type="button"
          disabled={pending}
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
      {allPreparationAnswered(p, s.actions) && (
        <MuteButton
          className="mt-2"
          disabled={pending}
          onClick={() => void command({ operation: "generate" })}
        >
          {p.draftVersion
            ? t("career.prep.regenerate", "변경 내용으로 초안 다시 만들기")
            : t("career.prep.generate", "전체 초안 만들기")}
        </MuteButton>
      )}
    </ChatComposerSurface>
  );
}
