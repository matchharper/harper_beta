import { useEffect, useId, useState } from "react";
import RichText from "@/components/ui/rich-text";
import { useApplicationPreparation } from "./ApplicationPreparationContext";
import { extractCareerDocumentLinks } from "@/lib/career/documentLinks";
import { DocumentPreviewCards } from "./elements/DocumentPreviewCards";
import {
  careerTimelineAssistantRichTextClassName,
  careerTimelineMessageTextClassName,
  careerTimelineTypographyStyle,
} from "./careerTimelineTypography";
import { ChevronRight, CircleHelp } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCareerT } from "@/i18n/useCareerT";
import type { ApplicationQuestionHistory } from "@/lib/career/simulation/questionHistory";

export function ApplicationQuestionHistoryRow({
  batch,
}: {
  batch: ApplicationQuestionHistory;
}) {
  const t = useCareerT();
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const { onReviewRendered } = useApplicationPreparation();
  useEffect(() => {
    if (!batch.review || batch.status !== "waiting") return;
    const id = requestAnimationFrame(() =>
      onReviewRendered?.(batch.review!.id)
    );
    return () => cancelAnimationFrame(id);
  }, [batch.review, batch.status, onReviewRendered]);
  const introduction = extractCareerDocumentLinks(batch.introduction ?? "");
  const waiting = batch.status === "waiting";
  const includesSuggestions = batch.items?.some(
    (item) => item.inputKind === "change" || item.inputKind === "material"
  );
  const label = waiting
    ? t("career.application.questions.waiting", "답변을 기다리고 있어요")
    : batch.status === "cancelled"
      ? t("career.application.questions.cancelled", "취소된 질문")
      : includesSuggestions
        ? t("career.application.suggestions.reviewed", "제안 {count}개를 검토했어요")
            .replace("{count}", String(batch.itemIds.length))
        : t(
          "career.application.questions.answered",
          "질문 {count}개에 답변했어요"
        ).replace("{count}", String(batch.itemIds.length));
  return (
    <div
      data-application-question-anchor={waiting ? batch.id : undefined}
      style={careerTimelineTypographyStyle}
      className={`space-y-4 ${careerTimelineMessageTextClassName}`}
    >
      {introduction.content && (
        <p className="whitespace-pre-wrap">{introduction.content}</p>
      )}
      {introduction.documents.length > 0 && (
        <DocumentPreviewCards documents={introduction.documents} />
      )}
      {batch.review && (
        <div data-application-review={batch.review.id}>
          <RichText
            content={batch.review.markdown}
            variant="career"
            className={careerTimelineAssistantRichTextClassName}
          />
        </div>
      )}
      {waiting ? (
        <div className="flex items-center gap-2 text-neutral-muted">
          <CircleHelp size={16} aria-hidden />
          {label}
        </div>
      ) : (
        <div data-application-answer-history>
          <MuteButton
            variant="transparent"
            className="group -ml-2.5 justify-start"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span
              className={cn(
                "flex items-center gap-1.5 text-neutral-primary transition-opacity duration-150 motion-reduce:transition-none group-hover:opacity-100 group-focus-visible:opacity-100",
                expanded ? "opacity-90" : "opacity-65"
              )}
            >
              <ChevronRight
                size={14}
                aria-hidden
                className={cn(
                  "transition-transform duration-200 ease-out motion-reduce:transition-none",
                  expanded && "rotate-90"
                )}
              />
              <span>{label}</span>
            </span>
          </MuteButton>
          <div
            id={panelId}
            aria-hidden={!expanded}
            inert={!expanded}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <dl className="ml-2 mt-2 mb-1 space-y-5 border-l border-neutral-1000-a10 pl-4 text-[13px] leading-relaxed">
                {(batch.items ?? []).map((item) => {
                  const response = batch.responses[item.id];
                  const decision = response?.decision;
                  const answer =
                    response?.text ||
                    (response?.optionId &&
                      item.options?.find((o) => o.id === response.optionId)
                        ?.label) ||
                    (decision === "document"
                      ? response?.documentName ||
                        t(
                          "career.application.questions.document",
                          "선택한 자료"
                        )
                      : decision === "accept"
                        ? t("career.application.questions.accepted", "수락")
                        : decision === "ignore"
                          ? t("career.application.questions.declined", "아니요")
                          : decision === "help"
                            ? t(
                                "career.application.questions.help",
                                "준비 도움 요청"
                              )
                            : decision === "skip"
                              ? t(
                                  "career.application.questions.skipped",
                                  "건너뜀"
                                )
                              : t(
                                  "career.application.questions.unanswered",
                                  "답변 없음"
                                ));
                  const approvedText =
                    decision === "accept"
                      ? (response.draftText ??
                        item.draftText ??
                        (response.edits ?? item.edits)
                          ?.map((edit) => edit.suggestedText)
                          .filter(Boolean)
                          .join("\n\n"))
                      : undefined;
                  return (
                    <div key={item.id}>
                      <dt className="whitespace-pre-wrap break-words text-neutral-primary/85">
                        {item.title}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-neutral-muted">
                        <span
                          className={
                            approvedText
                              ? "text-xs text-neutral-muted"
                              : undefined
                          }
                        >
                          {answer}
                        </span>
                        {approvedText && (
                          <p className="mt-1.5 text-neutral-primary/80">
                            {approvedText}
                          </p>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
