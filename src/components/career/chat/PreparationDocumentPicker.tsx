import { FileText } from "lucide-react";
import { useRouter } from "next/router";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { useEffect, useRef, useState } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { useCareerMobileChatClose } from "@/components/career/mobile/CareerMobileChatCloseContext";
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
export function PreparationDocumentPicker({
  resume = false,
  readOnly = false,
  disabled,
  selectedId,
  id,
  onPick,
}: {
  resume?: boolean;
  readOnly?: boolean;
  disabled: boolean;
  selectedId?: string;
  id?: string;
  onPick: (id: string) => void | Promise<void>;
}) {
  const router = useRouter();
  const closeMobileChat = useCareerMobileChatClose();
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
  if (readOnly)
    return selectedId ? (
      <BareButton
        id={id}
        type="button"
        onClick={() => {
          closeMobileChat?.();
          void router.push(getCareerDocumentHref(selectedId));
        }}
        className="flex w-full min-w-0 items-start gap-2 rounded-lg border border-neutral-1000-a10 bg-bg-floating px-3 py-2.5 text-left text-sm text-neutral-primary underline-offset-4 hover:underline"
      >
        <FileText className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {docs.find((document) => document.id === selectedId)?.fileName ??
            t("career.application.review.attachedFile", "첨부 파일")}
        </span>
      </BareButton>
    ) : (
      <span id={id} className="text-sm text-neutral-muted">
        —
      </span>
    );
  return (
    <div className="space-y-2">
      <Select
        disabled={disabled || uploading}
        onValueChange={(id) => {
          if (id) void onPick(id);
        }}
        value={selectedId ?? ""}
      >
        <SelectTrigger
          id={id}
          aria-label={
            id ? undefined : t("career.prep.selectDoc", "Docs에서 선택")
          }
        >
          <SelectValue
            placeholder={t("career.prep.selectDoc", "Docs에서 선택")}
          >
            {docs.find((document) => document.id === selectedId)?.fileName ??
              t("career.prep.selectDoc", "Docs에서 선택")}
          </SelectValue>
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
