import { useEffect, useMemo, useRef, useState } from "react";
import type { ResumeContent } from "@/lib/resumes/schema";
import { resumePreviewHtml, type ResumeAssets } from "@/lib/resumes/preview";
import { RESUME_RENDER_VERSION } from "@/lib/resumes/template";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { useCareerT } from "@/i18n/useCareerT";
import { Loader2 } from "lucide-react";

let assetsPromise: Promise<ResumeAssets> | undefined;
function loadAssets() {
  return (assetsPromise ??= Promise.all(
    ["400", "700", "script"].map(async (asset) => {
      const response = await fetch(
        `/api/resume-assets/${RESUME_RENDER_VERSION}?asset=${asset}`
      );
      if (!response.ok) throw new Error("Resume assets unavailable");
      return response.text();
    })
  )
    .then(([regular, bold, script]) => ({
      fontCss: `${regular}\n${bold}`,
      script,
    }))
    .catch((error) => {
      assetsPromise = undefined;
      throw error;
    }));
}

export function ResumePreview({
  content,
  title,
  documentId,
  onError,
  trackOpen = true,
}: {
  content: ResumeContent;
  title: string;
  documentId: string;
  onError: () => void;
  trackOpen?: boolean;
}) {
  const t = useCareerT();
  const frame = useRef<HTMLIFrameElement>(null);
  const [assets, setAssets] = useState<ResumeAssets | null>(null);
  const [layout, setLayout] = useState<{
    height: number;
    pageCount: number;
  } | null>(null);
  const fail = useRef(onError);
  useEffect(() => {
    fail.current = onError;
  }, [onError]);
  const html = useMemo(
    () => (assets ? resumePreviewHtml(content, assets) : undefined),
    [content, assets]
  );
  useEffect(() => {
    let disposed = false;
    void loadAssets()
      .then((a) => {
        if (!disposed) setAssets(a);
      })
      .catch(() => {
        if (!disposed) fail.current();
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    let reported = false;
    const timeout = window.setTimeout(() => fail.current(), 30_000);
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "resume-layout"
      )
        return;
      if (event.data.error) {
        window.clearTimeout(timeout);
        fail.current();
        return;
      }
      const { height, pageCount } = event.data;
      if (
        !Number.isFinite(height) ||
        height < 1 ||
        !Number.isSafeInteger(pageCount) ||
        pageCount < 1
      )
        return;
      window.clearTimeout(timeout);
      setLayout({ height, pageCount });
      if (!reported && trackOpen) {
        reported = true;
        void fetchWithInternalAuth(
          `/api/talent/documents/${encodeURIComponent(documentId)}/content`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "preview",
              pageCount,
              durationMs: event.data.durationMs,
            }),
          }
        ).catch(() => {});
      }
    };
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
    };
  }, [documentId, trackOpen]);
  return (
    <div>
      {!layout && (
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
      {layout && (
        <p className="mb-3 text-xs text-neutral-muted">
          A4 · {layout.pageCount}p
        </p>
      )}
      {html && (
        <iframe
          ref={frame}
          srcDoc={html}
          sandbox="allow-scripts"
          title={title}
          className="w-full border-0"
          style={{
            height: layout?.height ?? 1200,
            visibility: layout ? "visible" : "hidden",
          }}
        />
      )}
    </div>
  );
}
