import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import ResumeDropzone from "@/components/career/ResumeDropzone";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import type { CareerTalentDocument } from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { useCareerT } from "@/i18n/useCareerT";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";

export type CareerDocumentUploadResult =
  | { type: "profile_apply" }
  | { documentId: string; type: "document_visibility" };

type CareerAddDocumentModalProps = {
  open: boolean;
  onClose: () => void;
  onUploadComplete: (result: CareerDocumentUploadResult) => void;
};

export const CareerAddDocumentModal = ({
  open,
  onClose,
  onUploadComplete,
}: CareerAddDocumentModalProps) => {
  const t = useCareerT();
  const {
    savedProfileLinks,
    profileSavePending,
    onSaveTalentProfile,
    onUploadTalentDocument,
  } = useCareerProfileContext();
  const [documentKind, setDocumentKind] = useState<"resume" | "document">(
    "resume"
  );
  const [documentFile, setDocumentFile] = useState<File | null>(null);

  const resetForm = () => {
    setDocumentFile(null);
    setDocumentKind("resume");
  };

  const handleClose = () => {
    if (profileSavePending) return;
    resetForm();
    onClose();
  };

  const finishUpload = (result: CareerDocumentUploadResult) => {
    resetForm();
    onClose();
    onUploadComplete(result);
  };

  const handleUpload = async () => {
    if (!documentFile) return;

    if (documentKind === "document") {
      const uploaded = await onUploadTalentDocument(documentFile);
      if (uploaded) {
        finishUpload({
          documentId: uploaded.id,
          type: "document_visibility",
        });
      }
      return;
    }

    const saved = await onSaveTalentProfile({
      applyProfileSources: false,
      links: savedProfileLinks,
      persistError: false,
      preserveLinkDrafts: true,
      resumeFile: documentFile,
    });
    if (saved) finishUpload({ type: "profile_apply" });
  };

  return (
    <TalentCareerModal
      open={open}
      onClose={handleClose}
      closeOnBackdrop={!profileSavePending}
      title={t("career.profile.documents.add_title", "문서 추가")}
      description={t(
        "career.profile.documents.add_description",
        "업로드할 파일의 종류를 선택해 주세요."
      )}
      mobileBottomSheet
      panelClassName="max-w-[560px] bg-bg-floating"
      bodyClassName="space-y-5 px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton onClick={handleClose} disabled={profileSavePending}>
            {t("career.common.cancel", "취소")}
          </MuteButton>
          <MuteButton
            variant="dark"
            onClick={() => void handleUpload()}
            disabled={!documentFile || profileSavePending}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("career.profile.documents.upload", "업로드")}
          </MuteButton>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <Radio
          name="career-document-kind"
          value="resume"
          checked={documentKind === "resume"}
          onChange={() => {
            setDocumentKind("resume");
            setDocumentFile(null);
          }}
          label={
            <span>
              <span className="block">
                {t("career.profile.documents.kind.resume", "이력서")}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-soft">
                {t(
                  "career.profile.documents.resume_kind_help",
                  "대표 이력서로 저장하고 프로필 반영 여부를 확인합니다."
                )}
              </span>
            </span>
          }
          className="rounded-lg bg-bg-basement p-3"
        />
        <Radio
          name="career-document-kind"
          value="document"
          checked={documentKind === "document"}
          onChange={() => {
            setDocumentKind("document");
            setDocumentFile(null);
          }}
          label={
            <span>
              <span className="block">
                {t("career.profile.documents.kind.document", "문서")}
              </span>
              <span className="mt-0.5 block text-xs text-neutral-soft">
                {t(
                  "career.profile.documents.document_kind_help",
                  "저장 후 회사 공개 여부만 선택합니다."
                )}
              </span>
            </span>
          }
          className="rounded-lg bg-bg-basement p-3"
        />
      </div>
      <ResumeDropzone
        inputId="career-settings-document-upload"
        variant="compact"
        accept={
          documentKind === "resume"
            ? ".pdf,.docx,.txt,.md"
            : ".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg"
        }
        fileName={documentFile?.name ?? ""}
        onFileSelect={(file) => setDocumentFile(file)}
        onFileReject={(_file, _source, reason) =>
          showToast({
            message:
              reason === "file-size"
                ? t(
                    "career.resume_dropzone.file_too_large_generic",
                    "파일은 최대 4MB까지 업로드할 수 있습니다."
                  )
                : t(
                    "career.profile.documents.unsupported_file",
                    "지원하는 파일 형식만 업로드해 주세요."
                  ),
            variant: "white",
          })
        }
        title={t(
          "career.profile.documents.dropzone_title",
          "파일을 끌어다 놓거나 선택하세요"
        )}
        description={
          documentKind === "resume"
            ? t(
                "career.profile.documents.resume_formats",
                "PDF, DOCX, TXT, MD · 최대 4MB"
              )
            : t(
                "career.profile.documents.document_formats",
                "PDF, Office, TXT, MD, PNG, JPG · 최대 4MB"
              )
        }
        dragTitle={t(
          "career.resume_dropzone.drag_title",
          "여기에 놓으면 업로드됩니다"
        )}
        dragDescription={t(
          "career.profile.documents.drag_description",
          "파일을 놓아 선택하세요."
        )}
        selectedDescription={t(
          "career.profile.documents.selected_description",
          "업로드 버튼을 누르면 저장됩니다."
        )}
      />
    </TalentCareerModal>
  );
};

type CareerDocumentModalProps = {
  document: CareerTalentDocument | null;
  onClose: () => void;
};

export const CareerDocumentVisibilityModal = ({
  document,
  onClose,
}: CareerDocumentModalProps) => {
  const t = useCareerT();
  const { profileSavePending, onUpdateTalentDocument } =
    useCareerProfileContext();

  const handleVisibility = async (isPublic: boolean) => {
    if (!document) return;
    if (!isPublic) {
      onClose();
      return;
    }
    const updated = await onUpdateTalentDocument(document.id, {
      isPublic: true,
    });
    if (updated) onClose();
  };

  return (
    <TalentCareerModal
      open={document !== null}
      onClose={() => {
        if (!profileSavePending) onClose();
      }}
      closeOnBackdrop={!profileSavePending}
      title={t(
        "career.profile.documents.visibility_title",
        "회사에 이 문서를 공개할까요?"
      )}
      description={document?.fileName ?? ""}
      panelClassName="max-w-[480px] bg-bg-floating"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton
            onClick={() => void handleVisibility(false)}
            disabled={profileSavePending}
          >
            <EyeOff className="h-4 w-4" />
            {t("career.profile.documents.keep_private", "비공개로 저장")}
          </MuteButton>
          <MuteButton
            variant="dark"
            onClick={() => void handleVisibility(true)}
            disabled={profileSavePending}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            {t("career.profile.documents.make_public", "공개하기")}
          </MuteButton>
        </div>
      }
    >
      <p className="text-sm leading-6 text-neutral-muted">
        {t(
          "career.profile.documents.visibility_help",
          "공개하면 회사가 프로필에서 이 문서를 열람할 수 있습니다. 언제든 다시 비공개로 전환할 수 있습니다."
        )}
      </p>
    </TalentCareerModal>
  );
};

const CareerDocumentRenameModalContent = ({
  document,
  onClose,
}: CareerDocumentModalProps) => {
  const t = useCareerT();
  const { profileSavePending, onUpdateTalentDocument } =
    useCareerProfileContext();
  const [documentName, setDocumentName] = useState(document?.fileName ?? "");

  const handleRename = async () => {
    if (!document || !documentName.trim()) return;
    const updated = await onUpdateTalentDocument(document.id, {
      fileName: documentName.trim(),
    });
    if (updated) onClose();
  };

  const handleClose = () => {
    if (!profileSavePending) onClose();
  };

  return (
    <TalentCareerModal
      open={document !== null}
      onClose={handleClose}
      closeOnBackdrop={!profileSavePending}
      title={t("career.profile.documents.rename_title", "문서 이름 수정")}
      panelClassName="max-w-[480px] bg-bg-floating"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton onClick={handleClose} disabled={profileSavePending}>
            {t("career.common.cancel", "취소")}
          </MuteButton>
          <MuteButton
            variant="dark"
            onClick={() => void handleRename()}
            disabled={!documentName.trim() || profileSavePending}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("career.common.save", "저장")}
          </MuteButton>
        </div>
      }
    >
      <Input
        value={documentName}
        onChange={(event) => setDocumentName(event.target.value)}
        maxLength={255}
        autoFocus
        aria-label={t("career.profile.documents.file_name", "문서 이름")}
      />
    </TalentCareerModal>
  );
};

export const CareerDocumentRenameModal = (props: CareerDocumentModalProps) => (
  <CareerDocumentRenameModalContent
    key={props.document?.id ?? "closed"}
    {...props}
  />
);

type GmailCareerHistoryContentPayload = {
  content: string;
  documentId: string;
  fileName: string;
  updatedAt: string;
};

const MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS = 50_000;

const CareerGmailHistoryEditModalContent = ({
  document,
  onClose,
}: CareerDocumentModalProps) => {
  const t = useCareerT();
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [loading, setLoading] = useState(document !== null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadContent = useCallback(async () => {
    if (!document) return;
    try {
      const payload =
        await fetchWithInternalAuth<GmailCareerHistoryContentPayload>(
          `/api/talent/documents/${encodeURIComponent(document.id)}/content`,
          { cache: "no-store" }
        );
      setContent(payload.content);
      setOriginalContent(payload.content);
      setUpdatedAt(payload.updatedAt);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [document]);

  useEffect(() => {
    // The modal is keyed by document ID, so this asynchronous fetch initializes
    // a fresh modal instance rather than synchronously deriving state from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadContent();
  }, [loadContent]);

  const handleRetryLoad = () => {
    setLoading(true);
    setLoadError(false);
    void loadContent();
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    if (!document || !updatedAt || saving) return;
    setSaving(true);
    try {
      const payload = await fetchWithInternalAuth<{
        ok: true;
        updatedAt: string;
      }>(`/api/talent/documents/${encodeURIComponent(document.id)}/content`, {
        body: JSON.stringify({ content, expectedUpdatedAt: updatedAt }),
        method: "PATCH",
      });
      setOriginalContent(content);
      setUpdatedAt(payload.updatedAt);
      showToast({
        message: t(
          "career.profile.documents.gmail_history_saved",
          "Gmail 커리어 이력을 저장했습니다."
        ),
        variant: "white",
      });
      onClose();
    } catch (error) {
      const isConflict =
        error instanceof Error && error.message.includes("changed after");
      showToast({
        message: isConflict
          ? t(
              "career.profile.documents.gmail_history_conflict",
              "다른 변경사항이 먼저 저장되었습니다. 문서를 다시 열어 주세요."
            )
          : t(
              "career.profile.documents.gmail_history_save_failed",
              "Gmail 커리어 이력을 저장하지 못했습니다. 다시 시도해 주세요."
            ),
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const contentTooLong =
    content.length > MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS;
  const canSave =
    !loading &&
    !loadError &&
    !saving &&
    Boolean(content.trim()) &&
    !contentTooLong &&
    content !== originalContent;

  return (
    <TalentCareerModal
      open={document !== null}
      onClose={handleClose}
      closeOnBackdrop={!saving}
      title={t(
        "career.profile.documents.gmail_history_edit_title",
        "Gmail 커리어 이력 수정"
      )}
      description={t(
        "career.profile.documents.gmail_history_edit_description",
        "Harper가 이메일에서 정리한 커리어 이력입니다. 필요한 내용을 직접 수정할 수 있습니다."
      )}
      mobileBottomSheet
      panelClassName="max-w-[760px] bg-bg-floating"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton onClick={handleClose} disabled={saving}>
            {t("career.common.cancel", "취소")}
          </MuteButton>
          <MuteButton
            variant="dark"
            onClick={() => void handleSave()}
            disabled={!canSave}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("career.common.save", "저장")}
          </MuteButton>
        </div>
      }
    >
      {loading ? (
        <div className="flex min-h-64 items-center justify-center">
          <Loader2
            className="h-5 w-5 animate-spin text-neutral-muted"
            aria-label={t(
              "career.profile.documents.gmail_history_loading",
              "Gmail 커리어 이력 불러오는 중"
            )}
          />
        </div>
      ) : loadError ? (
        <div className="rounded-md bg-critical-faded p-4 text-sm text-critical">
          <p>
            {t(
              "career.profile.documents.gmail_history_load_failed",
              "Gmail 커리어 이력을 불러오지 못했습니다."
            )}
          </p>
          <MuteButton
            className="mt-3"
            size="sm"
            onClick={handleRetryLoad}
          >
            {t("career.profile.documents.gmail_history_retry", "다시 시도")}
          </MuteButton>
        </div>
      ) : (
        <div>
          <Textarea
            aria-label={t(
              "career.profile.documents.gmail_history_content",
              "Gmail 커리어 이력 내용"
            )}
            className="min-h-[420px] font-mono text-[13px]"
            maxLength={MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS}
            onChange={(event) => setContent(event.target.value)}
            value={content}
          />
          <p className="mt-2 text-right text-xs text-neutral-soft">
            {content.length.toLocaleString()} /{" "}
            {MAX_GMAIL_CAREER_HISTORY_CONTENT_CHARS.toLocaleString()}
          </p>
        </div>
      )}
    </TalentCareerModal>
  );
};

export const CareerGmailHistoryEditModal = (
  props: CareerDocumentModalProps
) => (
  <CareerGmailHistoryEditModalContent
    key={props.document?.id ?? "closed"}
    {...props}
  />
);

export const CareerDocumentDeleteModal = ({
  document,
  onClose,
}: CareerDocumentModalProps) => {
  const t = useCareerT();
  const { profileSavePending, onDeleteTalentDocument } =
    useCareerProfileContext();

  const handleDelete = async () => {
    if (!document) return;
    const deleted = await onDeleteTalentDocument(document.id);
    if (deleted) onClose();
  };

  return (
    <TalentCareerModal
      open={document !== null}
      onClose={() => {
        if (!profileSavePending) onClose();
      }}
      closeOnBackdrop={!profileSavePending}
      title={t("career.profile.documents.delete_title", "문서를 삭제할까요?")}
      description={document?.fileName ?? ""}
      panelClassName="max-w-[480px] bg-bg-floating"
      bodyClassName="px-5 py-5"
      footer={
        <div className="flex justify-end gap-2">
          <MuteButton onClick={onClose} disabled={profileSavePending}>
            {t("career.common.cancel", "취소")}
          </MuteButton>
          <MuteButton
            variant="warn"
            onClick={() => void handleDelete()}
            disabled={profileSavePending}
          >
            {profileSavePending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {t("career.profile.documents.delete", "문서 삭제")}
          </MuteButton>
        </div>
      }
    >
      <p className="text-sm leading-6 text-neutral-muted">
        {t(
          "career.profile.documents.delete_help",
          "삭제한 문서는 다시 복구할 수 없습니다."
        )}
      </p>
    </TalentCareerModal>
  );
};
