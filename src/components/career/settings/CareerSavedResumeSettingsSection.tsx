import { Ellipsis, ExternalLink, FileText, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
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
  onUploadComplete: (requestCompleted: boolean) => void;
};

type ResumeCompanyRequest = {
  companyName: string;
  requestId: string;
  roleName: string;
  token: string;
};

const CareerSavedResumeSettingsSection = ({
  primaryResumeDocument,
  onDeleteDocument,
  onRenameDocument,
  onUploadComplete,
}: CareerSavedResumeSettingsSectionProps) => {
  const t = useCareerT();
  const router = useRouter();
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
  const [companyRequest, setCompanyRequest] =
    useState<ResumeCompanyRequest | null>(null);

  useEffect(() => {
    const rawToken = router.query.resumeRequest;
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    let active = true;
    void fetch(
      token
        ? `/api/talent/company-requests/active?token=${encodeURIComponent(token)}`
        : "/api/talent/company-requests/active"
    )
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload?.error ?? ""));
        return payload?.request as ResumeCompanyRequest | null;
      })
      .then((request) => {
        if (active) setCompanyRequest(request?.requestId ? request : null);
      })
      .catch(() => {
        if (active) setCompanyRequest(null);
      });
    return () => {
      active = false;
    };
  }, [router.query.resumeRequest]);

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
      resumeRequestToken: companyRequest?.token ?? null,
    });
    if (saved) {
      const completedRequest = Boolean(companyRequest);
      if (completedRequest) {
        setCompanyRequest(null);
        const query = { ...router.query };
        delete query.resumeRequest;
        void router.replace({ pathname: router.pathname, query }, undefined, {
          shallow: true,
        });
      }
      onUploadComplete(completedRequest);
    } else {
      onResumeFileChange(null);
    }
  };

  return (
    <Field
      label={t("career.common.career.0y7cerf", "저장된 이력서")}
      icon={<FileText className="h-4 w-4" />}
    >
      {companyRequest ? (
        <div className="mb-3 rounded-md border border-neutral-1000-a10 bg-info-faded px-4 py-3">
          <p className="text-sm font-medium text-neutral-primary">
            {t(
              "career.profile.resume_request.banner_title",
              "{companyName}에서 {roleName} 검토를 위해 이력서 공유를 요청했습니다.",
              {
                values: {
                  companyName: companyRequest.companyName,
                  roleName: companyRequest.roleName,
                },
              }
            )}
          </p>
          <p className="mt-1 text-xs leading-5 text-neutral-muted">
            {t(
              "career.profile.resume_request.banner_description",
              "아래에서 업로드하면 이 요청과 연결해 해당 회사에만 전달됩니다. 업로드하지 않거나 답하지 않으셔도 됩니다."
            )}
          </p>
        </div>
      ) : null}
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
            onFileReject={(_file, _source, reason) => {
              showToast({
                message:
                  reason === "file-size"
                    ? t(
                        "career.resume_dropzone.file_too_large",
                        "이력서 파일은 최대 4MB까지 업로드할 수 있습니다."
                      )
                    : t(
                        "career.resume_dropzone.unsupported_file",
                        "지원하는 이력서 파일 형식만 업로드해 주세요."
                      ),
                variant: "white",
              });
            }}
            title={
              companyRequest
                ? t(
                    "career.profile.resume_request.upload_cta",
                    "업로드하고 {companyName}에 전달",
                    { values: { companyName: companyRequest.companyName } }
                  )
                : hasSavedResume
                  ? t("career.common.career.0j3w14l", "새 이력서 선택")
                  : t(
                      "career.resume_dropzone.empty_title",
                      "이력서를 끌어다 놓거나 선택하세요"
                    )
            }
            description={t(
              "career.resume_dropzone.settings_description",
              "PDF, DOCX, TXT, MD · 최대 4MB"
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
