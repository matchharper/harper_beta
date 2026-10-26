import { FileText } from "lucide-react";
import RichText from "@/components/ui/rich-text";
import { careerTimelineAssistantRichTextClassName, careerTimelineTypographyStyle } from "./careerTimelineTypography";
import { CompanyLogo } from "@/components/career/watchlist/CompanyLogo";
import { useState, useRef, useEffect } from "react";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { uploadTalentDocument } from "@/lib/talentOnboarding/documentUploadClient";
import { MuteButton } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useCareerT } from "@/i18n/useCareerT";
import type { ApplicationStartOffer } from "@/lib/career/simulation/startOffer";
import type { SimulationCardRequest } from "@/lib/career/simulation/session";
export function ApplicationStartCard({
  offer,
  messageId,
  disabled,
  onAction,
}: {
  offer: ApplicationStartOffer;
  messageId: number;
  disabled: boolean;
  onAction?: (
    request: SimulationCardRequest,
    text: string
  ) => void | Promise<void>;
}) {
  const t = useCareerT();
  const [documentId, setDocumentId] = useState(
    offer.selectedDocumentId ??
      offer.resumes.find((r) => r.primary)?.id ??
      offer.resumes[0]?.id ??
      "none"
  );
  const { fetchWithAuth } = useCareerApi();
  const [resumes, setResumes] = useState(offer.resumes);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbort.current?.abort(), []);
  useEffect(() => {
    const abort = new AbortController();
    fetchWithAuth("/api/talent/documents", { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || abort.signal.aborted) return;
        const next = (data.documents ?? [])
          .filter((d: { kind: string }) => d.kind === "resume")
          .map((d: { id: string; fileName: string; isPrimary: boolean }) => ({
            id: d.id,
            name: d.fileName,
            primary: d.isPrimary,
          }));
        setResumes(next);
        setDocumentId((current) =>
          next.some((d: { id: string }) => d.id === current)
            ? current
            : (next.find((d: { primary: boolean }) => d.primary)?.id ??
              next[0]?.id ??
              "none")
        );
      })
      .catch(() => {});
    return () => abort.abort();
  }, [fetchWithAuth]);
  const upload = async (file: File) => {
    setUploading(true);
    setUploadError("");
    const controller = new AbortController();
    uploadAbort.current = controller;
    try {
      const payload = await uploadTalentDocument({
        fetchWithAuth,
        file,
        kind: "resume",
        source: "chat",
        signal: controller.signal,
      });
      const id = payload.document?.id;
      if (typeof id !== "string") throw new Error("No document returned");
      if (controller.signal.aborted) return;
      const name =
        typeof payload.document?.fileName === "string"
          ? payload.document.fileName
          : file.name;
      setResumes((current) => [
        ...current.filter((d) => d.id !== id),
        { id, name, primary: false },
      ]);
      setDocumentId(id);
    } catch {
      if (!controller.signal.aborted)
        setUploadError(
          t(
            "career.apply.uploadError",
            "이력서를 업로드하지 못했어요. 파일을 확인하고 다시 시도해 주세요."
          )
        );
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  };

  const [pending, setPending] = useState(false);
  const started = offer.status === "started";
  const hasSelectedResume = resumes.some((resume) => resume.id === documentId);
  const start = async () => {
    if (
      !onAction ||
      disabled ||
      pending ||
      uploading ||
      started ||
      !hasSelectedResume
    )
      return;
    setPending(true);
    try {
      await onAction(
        {
          action: "start",
          sessionMessageId: messageId,
          expectedRevision: 1,
          documentId: documentId === "none" ? null : documentId,
        },
        t("career.apply.start", "함께 지원 시작하기")
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      {offer.introduction && (
        <div style={careerTimelineTypographyStyle}>
          <RichText content={offer.introduction} variant="career" className={careerTimelineAssistantRichTextClassName} />
        </div>
      )}
    <section className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm">
      <header className="p-4 pb-0">
        <h3 className="font-medium">
          {t("career.apply.title", "하퍼로 지원하기")}
        </h3>
      </header>
      <div className="space-y-2 p-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {t("career.apply.role", "지원할 포지션")}
          </p>
          <div className="flex items-center gap-3 rounded-xl border border-neutral-1000-a10 px-3 py-2">
            <CompanyLogo
              logoUrl={offer.companyLogoUrl ?? null}
              name={offer.companyName ?? offer.roleName}
              size="md"
            />
            <div className="min-w-0 space-y-0.5">
              <p className="break-words text-sm font-medium">
                {offer.roleTitle ?? offer.roleName}
              </p>
              {offer.companyName && (
                <p className="break-words text-sm text-neutral-muted">
                  {offer.companyName}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`resume-label-${messageId}`} className="text-sm font-medium">
              {t("career.apply.resume", "사용할 이력서")}
            </p>
            {!started && (
              <MuteButton
                variant="transparent"
                disabled={disabled || pending || uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading
                  ? t("career.apply.uploading", "이력서를 업로드하고 있어요…")
                  : t("career.apply.upload", "이력서 업로드")}
              </MuteButton>
            )}
          </div>
          <Select
            value={documentId}
            onValueChange={(v) => {
              if (v) setDocumentId(v);
            }}
            disabled={disabled || pending || uploading || started}
          >
            <SelectTrigger
              aria-labelledby={`resume-label-${messageId}`}
              className="data-[size=default]:h-auto min-h-12 gap-3 rounded-xl px-3 py-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-weak text-neutral-muted">
                <FileText className="h-5 w-5" aria-hidden />
              </span>
              <SelectValue className="whitespace-normal break-words text-xs">
                {resumes.find((r) => r.id === documentId)?.name ??
                  t("career.apply.noResume", "이력서를 업로드해 주세요")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {resumes.length ? (
                resumes.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  {t("career.apply.noResume", "이력서를 업로드해 주세요")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        {!started && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              aria-label={t("career.apply.upload", "이력서 업로드")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }}
            />

            {uploadError && (
              <p role="alert" className="text-sm text-critical">
                {uploadError}
              </p>
            )}
          </>
        )}
        <MuteButton
          variant="primary"
          size="md"
          className="w-full mt-2"
          disabled={
            disabled ||
            pending ||
            uploading ||
            started ||
            !onAction ||
            !hasSelectedResume
          }
          onClick={() => void start()}
        >
          {started
            ? t("career.apply.started", "지원 준비를 시작했어요")
            : t("career.apply.start", "함께 지원 시작하기")}
        </MuteButton>
      </div>
    </section>
    </div>
  );
}
