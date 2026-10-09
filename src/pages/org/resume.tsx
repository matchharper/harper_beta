import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Download, Loader2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { ResumePreview } from "@/components/career/documents/ResumePreview";
import {
  fetchWithInternalAuth,
  fetchResponseWithInternalAuth,
} from "@/lib/internalApiClient";
import { useCareerT } from "@/i18n/useCareerT";
import type { ResumeContent } from "@/lib/resumes/schema";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";

type Document = {
  documentId: string;
  fileName: string;
  revision: number;
  renderVersion: string;
  content: ResumeContent;
};
export default function SharedResumePage() {
  const router = useRouter();
  const t = useCareerT();
  const [loaded, setLoaded] = useState<{
    key: string;
    document: Document | null;
    failed: boolean;
  } | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const query = new URLSearchParams(
    Object.fromEntries(
      ["documentId", "talentId", "workspaceId"].map((key) => [
        key,
        typeof router.query[key] === "string"
          ? (router.query[key] as string)
          : "",
      ])
    )
  );
  const endpoint = `/api/org/generated-resume?${query}`;
  const accessKind =
    router.query.kind === "storage" || router.query.kind === "document"
      ? router.query.kind
      : null;
  const accessBody = JSON.stringify({
    kind: accessKind,
    documentId: query.get("documentId"),
    talentId: query.get("talentId"),
    workspaceId: query.get("workspaceId"),
  });
  const requestKey = `${accessKind ? accessBody : endpoint}:${attempt}`;
  const document = loaded?.key === requestKey ? loaded.document : null;
  const failed = loaded?.key === requestKey && loaded.failed;
  useEffect(() => {
    if (!router.isReady) return;
    const controller = new AbortController();
    const request = accessKind
      ? fetchWithInternalAuth<{ url: string }>("/api/org/resume-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: accessBody,
          cache: "no-store",
          signal: controller.signal,
        }).then((result) => {
          if (!controller.signal.aborted) {
            const target = new URL(result.url, window.location.origin);
            if (!["https:", "http:"].includes(target.protocol))
              throw new Error("Invalid document address");
            window.location.replace(target.href);
          }
          return null;
        })
      : fetchWithInternalAuth<Document>(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
    void request
      .then((result) => {
        if (result && result.renderVersion !== RESUME_RENDER_VERSION)
          throw new Error("Reload required");
        if (!controller.signal.aborted)
          setLoaded({ key: requestKey, document: result, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoaded({ key: requestKey, document: null, failed: true });
      });
    return () => controller.abort();
  }, [accessBody, accessKind, endpoint, router.isReady, requestKey]);
  async function download() {
    if (!document || busy.current) return;
    busy.current = true;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const response = await fetchResponseWithInternalAuth(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_revision: document.revision,
          render_version: document.renderVersion,
        }),
      });
      if (!response.ok) {
        if ([403, 404, 409].includes(response.status)) setAttempt((n) => n + 1);
        throw new Error("Download failed");
      }
      const url = URL.createObjectURL(await response.blob());
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.fileName;
      window.document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setDownloadFailed(true);
    } finally {
      busy.current = false;
      setDownloading(false);
    }
  }
  return (
    <main className="min-h-screen bg-bg-default p-4 sm:p-8">
      <div className="mx-auto max-w-[960px]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h1 className="break-all text-lg text-neutral-primary">
            {document?.fileName ?? "Harper"}
          </h1>
          <MuteButton
            disabled={!document || downloading || failed}
            onClick={() => void download()}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {t("career.profile.documents.download_pdf", "PDF 다운로드")}
          </MuteButton>
        </header>
        {downloadFailed && (
          <p role="alert">
            {t(
              "career.profile.documents.pdf_failed",
              "PDF를 만들지 못했습니다. 다시 시도해 주세요."
            )}
          </p>
        )}
        {failed ? (
          <div role="alert">
            <p>
              {t(
                "career.profile.documents.preview_failed",
                "문서를 불러오지 못했습니다. 삭제되었거나 접근할 수 없는 문서일 수 있습니다."
              )}
            </p>
            <MuteButton onClick={() => setAttempt((n) => n + 1)}>
              {t("career.profile.documents.gmail_history_retry", "다시 시도")}
            </MuteButton>
          </div>
        ) : document ? (
          <ResumePreview
            key={`${endpoint}:${document.revision}:${attempt}`}
            content={document.content}
            title={document.fileName}
            documentId={document.documentId}
            trackOpen={false}
            onError={() =>
              setLoaded({ key: requestKey, document: null, failed: true })
            }
          />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin" />
        )}
      </div>
    </main>
  );
}
