import type { DocumentEditorCopy } from "@/components/ui/document-editor";
import { useOrgLocale } from "./OrgLocaleProvider";

export function useOrgDocumentEditorCopy() {
  const { locale, c } = useOrgLocale();
  const copy: DocumentEditorCopy = {
    openDocument: (title) => c("{title} 문서 열기", "Open {title}", { title }),
    documentContent: (title) =>
      c("{title} 문서 내용", "{title} content", { title }),
    showMore: c("더보기", "Show more"),
    showLess: c("접기", "Show less"),
    emptyPreview: c("내용을 작성해 주세요.", "Add content."),
    meta: (changedAt, count) =>
      c(
        "마지막 변경: {changedAt}, {count} 글자",
        "Last changed: {changedAt} · {count} characters",
        { changedAt, count }
      ),
    justNow: c("방금 전", "Just now"),
    minutesAgo: (count) => c("{count}분 전", "{count} min ago", { count }),
    hoursAgo: (count) => c("{count}시간 전", "{count} hr ago", { count }),
    daysAgo: (count) => c("{count}일 전", "{count} days ago", { count }),
    locale,
  };
  return {
    copy,
    copyLabel: c("복사", "Copy"),
    copySuccessMessage: c("문서 내용을 복사했어요.", "Document copied."),
    copyErrorMessage: c(
      "문서 내용을 복사하지 못했어요. 다시 시도해 주세요.",
      "Couldn't copy the document. Try again."
    ),
    loadingLabel: c("문서 불러오는 중", "Loading document"),
  };
}
