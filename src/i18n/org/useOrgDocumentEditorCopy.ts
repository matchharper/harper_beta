import type { DocumentEditorCopy } from "@/components/ui/document-editor";
import { useOrgLocale, useOrgT } from "./OrgLocaleProvider";

export function useOrgDocumentEditorCopy() {
  const t = useOrgT();
  const { locale } = useOrgLocale();
  const copy: DocumentEditorCopy = {
    openDocument: (title) => t("document.open", "{title} 문서 열기", { title }),
    documentContent: (title) => t("document.content", "{title} 문서 내용", { title }),
    showMore: t("document.showMore", "더보기"),
    showLess: t("document.showLess", "접기"),
    emptyPreview: t("document.emptyPreview", "내용을 작성해 주세요."),
    meta: (changedAt, count) => t("document.meta", "마지막 변경: {changedAt}, {count} 글자", { changedAt, count }),
    justNow: t("document.justNow", "방금 전"),
    minutesAgo: (count) => t("document.minutesAgo", "{count}분 전", { count }),
    hoursAgo: (count) => t("document.hoursAgo", "{count}시간 전", { count }),
    daysAgo: (count) => t("document.daysAgo", "{count}일 전", { count }),
    locale,
  };
  return {
    copy,
    copyLabel: t("document.copyLabel", "복사"),
    copySuccessMessage: t("document.copySuccess", "문서 내용을 복사했어요."),
    copyErrorMessage: t("document.copyError", "문서 내용을 복사하지 못했어요. 다시 시도해 주세요."),
    loadingLabel: t("document.loading", "문서 불러오는 중"),
  };
}
