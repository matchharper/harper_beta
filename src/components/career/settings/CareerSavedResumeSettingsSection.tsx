import { Ellipsis, ExternalLink, FileText, Pencil, Trash2 } from "lucide-react";
import ResumeDropzone from "@/components/career/ResumeDropzone";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import type { CareerTalentDocument } from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { AttentionBadge, Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Field } from "@/components/ui/panel";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";

type CareerSavedResumeSettingsSectionProps = {
  primaryResumeDocument: CareerTalentDocument | null;
  onDeleteDocument: (documentId: string) => void;
  onRenameDocument: (document: CareerTalentDocument) => void;
  onUploadComplete: () => void;
};

const CareerSavedResumeSettingsSection = ({
  primaryResumeDocument,
  onDeleteDocument,
  onRenameDocument,
  onUploadComplete,
}: CareerSavedResumeSettingsSectionProps) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const {
    resumeFile,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    savedProfileLinks,
    profileSavePending,
    onResumeFileChange,
    onSaveTalentProfile,
  } = useCareerProfileContext();
  const hasSavedResume = Boolean(savedResumeFileName || savedResumeStoragePath);

  const handleResumeFileSelect = async (
    file: File | null,
    source: "dialog" | "drop"
  ) => {
    if (!file) return;

    logCareerEvent(
      source === "drop" ? "drop_resume_select_file" : "click_resume_select_file"
    );
    onResumeFileChange(file);

    const saved = await onSaveTalentProfile({
      applyProfileSources: false,
      links: savedProfileLinks,
      persistError: false,
      preserveLinkDrafts: true,
      resumeFile: file,
    });
    if (saved) {
      onUploadComplete();
    } else {
      onResumeFileChange(null);
    }
  };

  return (
    <Field
      label={t("career.common.career.0y7cerf", "저장된 이력서")}
      icon={<FileText className="h-4 w-4" />}
    >
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm">
        {hasSavedResume ? (
          <>
            <div className="mt-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm text-neutral-primary">
                {savedResumeFileName ??
                  t("career.common.career.0w4x7qh", "파일명 정보 없음")}
              </p>
              <Badge size="sm" tone="primary" variant="faded">
                {t("career.profile.documents.primary_resume", "대표 이력서")}
              </Badge>
              {primaryResumeDocument ? (
                <ActionDropdown
                  align="end"
                  trigger={
                    <MuteButton
                      type="button"
                      variant="transparent"
                      size="sm"
                      aria-label={t(
                        "career.profile.documents.actions",
                        "문서 메뉴"
                      )}
                    >
                      <Ellipsis className="h-4 w-4" />
                    </MuteButton>
                  }
                >
                  <ActionDropdownItem
                    onSelect={() => onRenameDocument(primaryResumeDocument)}
                  >
                    <Pencil className="h-4 w-4" />
                    {t("career.profile.documents.rename", "이름 수정")}
                  </ActionDropdownItem>
                  <ActionDropdownSeparator />
                  <ActionDropdownItem
                    tone="danger"
                    onSelect={() => onDeleteDocument(primaryResumeDocument.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("career.profile.documents.delete", "문서 삭제")}
                  </ActionDropdownItem>
                </ActionDropdown>
              ) : null}
            </div>
            {savedResumeStoragePath ? (
              <p className="mt-1 truncate text-xs text-neutral-soft">
                {savedResumeStoragePath}
              </p>
            ) : null}
            {savedResumeDownloadUrl ? (
              <a
                href={savedResumeDownloadUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => logCareerEvent("click_resume_download")}
                className="mt-2 inline-flex items-center gap-1 text-xs text-neutral-primary underline underline-offset-2"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("career.common.career.07r9xc5", "다운로드")}
              </a>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm leading-6 text-neutral-muted">
            {t("career.common.career.0jt5nqc", "저장된 이력서가 없습니다.")}
            <br />
            {t(
              "career.common.career.0vrhfby",
              "이력서를 통해 회원님에 대해 알 수 있게되는 정보는 회사와의 연결 및 추천에 큰 영향을 미칩니다."
            )}
          </p>
        )}

        <div className="relative mt-4">
          <ResumeDropzone
            inputId="career-settings-resume-upload"
            variant="compact"
            accept=".pdf,.docx,.txt,.md"
            disabled={profileSavePending}
            fileName={resumeFile?.name ?? ""}
            onFileSelect={(file, source) =>
              void handleResumeFileSelect(file, source)
            }
            onFileReject={() => {
              showToast({
                message: t(
                  "career.resume_dropzone.unsupported_file",
                  "지원하는 이력서 파일 형식만 업로드해 주세요."
                ),
                variant: "white",
              });
            }}
            title={
              hasSavedResume
                ? t("career.common.career.0j3w14l", "새 이력서 선택")
                : t(
                    "career.resume_dropzone.empty_title",
                    "이력서를 끌어다 놓거나 선택하세요"
                  )
            }
            description={t(
              "career.resume_dropzone.settings_description",
              "PDF, DOCX, TXT, MD 파일을 업로드할 수 있습니다."
            )}
            dragTitle={t(
              "career.resume_dropzone.drag_title",
              "여기에 놓으면 업로드됩니다"
            )}
            dragDescription={t(
              "career.resume_dropzone.drag_description",
              "파일을 놓아 이력서를 선택하세요."
            )}
            selectedDescription={t(
              "career.resume_dropzone.settings_selected_description",
              "선택한 이력서를 저장하고 있습니다."
            )}
          />
          {!hasSavedResume ? (
            <AttentionBadge
              label={t(
                "career.profile.career_profile_workspace.0pv1jmq",
                "저장된 이력서가 없습니다"
              )}
              className="right-2 top-2"
            />
          ) : null}
        </div>
      </div>
    </Field>
  );
};

export default CareerSavedResumeSettingsSection;
