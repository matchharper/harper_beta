import { ChevronRight, Copy, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type { CareerDocumentLink } from "@/lib/career/documentLinks";

type DocumentContent = {
  content: string;
  documentId: string;
  fileName: string;
  updatedAt: string;
};

export function CareerDocumentDetail({
  document,
  onBack,
}: {
  document: CareerDocumentLink;
  onBack: () => void;
}) {
  const t = useCareerT();
  const [result, setResult] = useState<DocumentContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchWithInternalAuth<DocumentContent>(
      `/api/talent/documents/${encodeURIComponent(document.id)}/content`,
      { cache: "no-store", signal: controller.signal }
    )
      .then((payload) => {
        if (!controller.signal.aborted) setResult(payload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [document.id, attempt]);

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.content);
      showToast({
        message: t(
          "career.profile.documents.copy_success",
          "문서 내용을 복사했습니다."
        ),
        variant: "white",
      });
    } catch {
      showToast({
        message: t(
          "career.profile.documents.copy_failed",
          "문서 내용을 복사하지 못했습니다. 다시 시도해 주세요."
        ),
        variant: "error",
      });
    }
  };
  const exportMarkdown = () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([result.content], { type: "text/markdown;charset=utf-8" })
    );
    const anchor = window.document.createElement("a");
    const name = result.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
    anchor.href = url;
    anchor.download = /\.md$/i.test(name) ? name : `${name}.md`;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const title = result?.fileName ?? document.title;

  return (
    <section className="pb-24 pt-4 md:pt-0">
      <nav className="mb-4 flex min-h-8 min-w-0 items-center gap-1 text-[13px] leading-5 md:mt-4">
        <BareButton
          onClick={onBack}
          className="shrink-0 font-medium text-neutral-muted hover:text-neutral-primary"
        >
          {t("career.profile.documents.title", "내 문서")}
        </BareButton>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-soft" />
        <span
          className="truncate font-medium text-neutral-primary"
          title={title}
        >
          {title}
        </span>
      </nav>
      <article className="min-h-[480px] rounded-xl border border-neutral-1000-a05 bg-bg-floating px-5 py-6 shadow-sm sm:px-6 md:min-h-[calc(100svh-180px)]">
        <div className="mx-auto w-full max-w-[800px]">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-neutral-1000-a05 pb-5">
            <h1 className="min-w-0 break-words text-base font-medium text-neutral-primary sm:text-lg">
              {title}
            </h1>
            <div className="flex flex-wrap gap-2">
              <MuteButton disabled={!result} onClick={() => void copy()}>
                <Copy className="h-4 w-4" />
                {t(
                  "career.profile.documents.copy_content",
                  "문서 전체 내용 복사"
                )}
              </MuteButton>
              <MuteButton disabled={!result} onClick={exportMarkdown}>
                <Download className="h-4 w-4" />
                {t(
                  "career.profile.documents.export_markdown",
                  "Markdown 내보내기"
                )}
              </MuteButton>
            </div>
          </header>
          {failed ? (
            <div
              role="alert"
              className="space-y-3 py-6 text-sm text-neutral-primary"
            >
              <p>
                {t(
                  "career.profile.documents.preview_failed",
                  "문서를 불러오지 못했습니다. 삭제되었거나 접근할 수 없는 문서일 수 있습니다."
                )}
              </p>
              <MuteButton
                onClick={() => {
                  setFailed(false);
                  setAttempt((value) => value + 1);
                }}
              >
                {t("career.profile.documents.gmail_history_retry", "다시 시도")}
              </MuteButton>
            </div>
          ) : result ? (
            <RichText content={result.content} />
          ) : (
            <div
              role="status"
              className="flex items-center gap-2 py-8 text-sm text-neutral-primary"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t(
                "career.profile.documents.preview_loading",
                "문서를 불러오는 중입니다."
              )}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
