import { useEffect } from "react";
import RichText from "@/components/ui/rich-text";
import { useApplicationPreparation } from "./ApplicationPreparationContext";
import { extractCareerDocumentLinks } from "@/lib/career/documentLinks";
import { DocumentPreviewCards } from "./elements/DocumentPreviewCards";
import {careerTimelineAssistantRichTextClassName, careerTimelineMessageTextClassName, careerTimelineTypographyStyle} from "./careerTimelineTypography";
import { CircleHelp } from "lucide-react";
import { useCareerT } from "@/i18n/useCareerT";
import type { ApplicationQuestionHistory } from "@/lib/career/simulation/questionHistory";

export function ApplicationQuestionHistoryRow({batch}: {batch: ApplicationQuestionHistory}) {
  const t = useCareerT();
  const { onReviewRendered } = useApplicationPreparation();
  useEffect(() => {
    if (!batch.review || batch.status !== "waiting") return;
    const id = requestAnimationFrame(() => onReviewRendered?.(batch.review!.id));
    return () => cancelAnimationFrame(id);
  }, [batch.review, batch.status, onReviewRendered]);
  const introduction = extractCareerDocumentLinks(batch.introduction ?? "");
  const waiting = batch.status === "waiting";
  const label = waiting
    ? t("career.application.questions.waiting", "답변을 기다리고 있어요")
    : batch.status === "cancelled"
      ? t("career.application.questions.cancelled", "취소된 질문")
      : t("career.application.questions.answered", "질문 {count}개에 답변했어요").replace("{count}", String(batch.itemIds.length));
  return <div data-application-question-anchor={waiting ? batch.id : undefined} style={careerTimelineTypographyStyle} className={`space-y-4 ${careerTimelineMessageTextClassName}`}>
    {introduction.content && <p className="whitespace-pre-wrap">{introduction.content}</p>}
    {introduction.documents.length > 0 && <DocumentPreviewCards documents={introduction.documents} />}
    {batch.review && <div data-application-review={batch.review.id}><RichText content={batch.review.markdown} variant="career" className={careerTimelineAssistantRichTextClassName} /></div>}
    {waiting ? <div className="flex items-center gap-2 text-neutral-muted"><CircleHelp size={16} aria-hidden />{label}</div> :
      <details className="text-neutral-muted">
        <summary className="cursor-pointer"><CircleHelp className="mr-2 inline" size={16} aria-hidden />{label}</summary>
        <dl className="mt-4 space-y-4">
          {(batch.items ?? []).map(item => {
            const response = batch.responses[item.id];
            const decision = response?.decision;
            const answer = response?.text || (response?.optionId && item.options?.find(o => o.id === response.optionId)?.label) ||
              (decision === "document" ? response?.documentName || t("career.application.questions.document", "선택한 자료") :
              decision === "accept" ? t("career.application.questions.accepted", "수락") :
              decision === "ignore" ? t("career.application.questions.declined", "아니요") :
              decision === "help" ? t("career.application.questions.help", "준비 도움 요청") :
              decision === "skip" ? t("career.application.questions.skipped", "건너뜀") : t("career.application.questions.unanswered", "답변 없음"));
            return <div key={item.id}><dt className="whitespace-pre-wrap">{item.title}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-neutral-soft">{answer}</dd></div>;
          })}
        </dl>
      </details>}
  </div>;
}
