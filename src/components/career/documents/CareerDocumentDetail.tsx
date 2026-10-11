import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { ResumePreview } from "./ResumePreview";
import type { ResumeContent } from "@/lib/resumes/schema";
import { ChevronRight, Copy, Download, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { showToast } from "@/components/toast/toast";
import { useCareerT } from "@/i18n/useCareerT";
import {
  fetchWithInternalAuth,
  fetchResponseWithInternalAuth,
} from "@/lib/internalApiClient";
import type { CareerDocumentLink } from "@/lib/career/documentLinks";

type DocumentContent = {
  content: string;
  format?: "pdf" | "resume";
  resume?: ResumeContent;
  revision?: number;
  renderVersion?: string;
  previewUrl?: string;
  downloadUrl?: string;
  documentId: string;
  fileName: string;
  originType: string | null;
  updatedAt: string;
};

export function CareerDocumentDetail({
  document,
  onBack,
  updatedAt,
}: {
  document: CareerDocumentLink;
  updatedAt?: string;
  onBack: () => void;
}) {
  const t = useCareerT();
  const [loadedResult, setResult] = useState<DocumentContent | null>(null);
  const [failedDocumentId, setFailedDocumentId] = useState<string | null>(null);
  const result = loadedResult?.documentId === document.id ? loadedResult : null;
  const failed = failedDocumentId === document.id;
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const downloadController = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      downloadController.current?.abort();
    },
    [document.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchWithInternalAuth<DocumentContent>(
      `/api/talent/documents/${encodeURIComponent(document.id)}/content`,
      { cache: "no-store", signal: controller.signal }
    )
      .then((payload) => {
        if (
          payload.format === "resume" &&
          payload.renderVersion !== RESUME_RENDER_VERSION
        )
          throw new Error("Resume preview version changed. Reload the page.");
        if (!controller.signal.aborted) {
          setFailedDocumentId(null);
          setResult((previous) => {
            // A background resume refresh still checks access and revision, but
            // unchanged content keeps its iframe and completed page layout.
            if (
              payload.format === "resume" &&
              previous?.format === "resume" &&
              previous.documentId === payload.documentId &&
              previous.revision === payload.revision &&
              previous.renderVersion === payload.renderVersion
            ) {
              return { ...payload, resume: previous.resume };
            }
            return payload;
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedDocumentId(document.id);
      });
    return () => controller.abort();
  }, [document.id, attempt, updatedAt]);

  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 10 * 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

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

  const downloadPdf = async () => {
    if (!result || downloadController.current) return;
    if (result.format === "pdf") {
      window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const controller = new AbortController();
    downloadController.current = controller;
    setDownloading(true);
    try {
      const response = await fetchResponseWithInternalAuth(
        `/api/talent/documents/${encodeURIComponent(result.documentId)}/pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            expected_revision: result.revision,
            render_version: result.renderVersion,
          }),
        }
      );
      if (!response.ok) {
        if (response.status === 409) {
          setAttempt((value) => value + 1);
          throw new Error("conflict");
        }
        throw new Error("download");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName.replace(
        /[\\/:*?"<>|\u0000-\u001f]/g,
        "_"
      );
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      if (!controller.signal.aborted)
        showToast({
          message:
            error instanceof Error && error.message === "conflict"
              ? t(
                  "career.profile.documents.pdf_changed",
                  "문서가 변경되었습니다. 최신 내용을 확인한 뒤 다시 다운로드해 주세요."
                )
              : t(
                  "career.profile.documents.pdf_failed",
                  "PDF를 만들지 못했습니다. 다시 시도해 주세요."
                ),
          variant: "error",
        });
    } finally {
      downloadController.current = null;
      setDownloading(false);
    }
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
              {result?.format === "pdf" || result?.format === "resume" ? (
                <MuteButton
                  disabled={downloading || failed}
                  onClick={() => void downloadPdf()}
                >
                  {downloading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Download className="h-4 w-4" />
                  {t("career.profile.documents.download_pdf", "PDF 다운로드")}
                </MuteButton>
              ) : (
                <>
                  <MuteButton disabled={!result} onClick={() => void copy()}>
                    <Copy className="h-4 w-4" />
                    {t("career.profile.documents.copy_content", "복사")}
                  </MuteButton>
                  <MuteButton disabled={!result} onClick={exportMarkdown}>
                    <Download className="h-4 w-4" />
                    {t("career.profile.documents.export_markdown", "Export")}
                  </MuteButton>
                </>
              )}
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
                  setFailedDocumentId(null);
                  setAttempt((value) => value + 1);
                }}
              >
                {t("career.profile.documents.gmail_history_retry", "다시 시도")}
              </MuteButton>
            </div>
          ) : result ? (
            result.format === "resume" && result.resume ? (
              <ResumePreview
                key={`${result.documentId}:${result.revision}:${result.renderVersion}`}
                content={result.resume}
                title={title}
                documentId={result.documentId}
                onError={() => setFailedDocumentId(result.documentId)}
              />
            ) : result.format === "pdf" ? (
              <iframe
                key={result.previewUrl}
                src={`${result.previewUrl}#view=FitH&navpanes=0`}
                title={title}
                className="h-[75svh] min-h-[480px] w-full border-0"
              />
            ) : (
              <RichText
                variant="career"
                content={result.content}
                referenceLinks={result.originType === "company_research"}
              />
            )
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
