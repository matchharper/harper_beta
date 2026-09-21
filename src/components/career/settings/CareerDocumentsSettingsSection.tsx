import {
  Ellipsis,
  Eye,
  EyeOff,
  File,
  FileImage,
  Files,
  FileSpreadsheet,
  FileText,
  FileType2,
  InfoIcon,
  Pencil,
  PhoneCall,
  Plus,
  Presentation,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import ResumeDropzone from "@/components/career/ResumeDropzone";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import type { CareerTalentDocument } from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/panel";
import { Tooltips } from "@/components/ui/tooltip";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerDate } from "@/lib/career/dateFormat";
import {
  getCareerDocumentFormat,
  type CareerDocumentFormat,
} from "@/lib/career/documentFormat";
import CareerProfileSourceCard from "./CareerProfileSourceCard";

type CareerDocumentsSettingsSectionProps = {
  documents: CareerTalentDocument[];
  onAddDocument: () => void;
  onDeleteDocument: (documentId: string) => void;
  onEditDocument: (document: CareerTalentDocument) => void;
  onOpenCallNote: (document: CareerTalentDocument) => void;
  onOpenDocument: (document: CareerTalentDocument) => void;
  onRenameDocument: (document: CareerTalentDocument) => void;
  onUploadComplete: (requestCompleted: boolean) => void;
};

type ResumeCompanyRequest = {
  companyName: string;
  requestId: string;
  roleName: string;
  token: string;
};

const DOCUMENT_FORMAT_ICONS: Record<CareerDocumentFormat, typeof File> = {
  document: FileText,
  image: FileImage,
  pdf: FileType2,
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  unknown: File,
};

const CareerDocumentFormatIcon = ({ fileName }: { fileName: string }) => {
  const Icon = DOCUMENT_FORMAT_ICONS[getCareerDocumentFormat(fileName)];
  return <Icon aria-hidden="true" className="h-5 w-5" />;
};

const CareerDocumentsSettingsSection = ({
  documents,
  onAddDocument,
  onDeleteDocument,
  onEditDocument,
  onOpenCallNote,
  onOpenDocument,
  onRenameDocument,
  onUploadComplete,
}: CareerDocumentsSettingsSectionProps) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const router = useRouter();
  const logCareerEvent = useCareerLogEvent();
  const [companyRequest, setCompanyRequest] =
    useState<ResumeCompanyRequest | null>(null);
  const {
    onResumeFileChange,
    onSaveTalentProfile,
    onUpdateTalentDocument,
    profileSavePending,
    resumeFile,
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
  } = useCareerProfileContext();

  const hasSavedResume = Boolean(
    savedResumeFileName ||
    savedResumeStoragePath ||
    documents.some((document) => document.kind === "resume")
  );
  const sortedDocuments = useMemo(
    () =>
      [...documents].sort((left, right) => {
        if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
        const leftTime = Date.parse(left.updatedAt || left.createdAt);
        const rightTime = Date.parse(right.updatedAt || right.createdAt);
        return rightTime - leftTime;
      }),
    [documents]
  );
  const hasResumeDocument = documents.some(
    (document) => document.kind === "resume"
  );
  const resumeEmptyNotice = t(
    "career.profile.sources.resume_empty_notice",
    "저장된 이력서가 없습니다. 이력서를 통해 회원님에 대해 알 수 있게되는 정보는 회사와의 연결 및 추천에 큰 영향을 미칩니다."
  );

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
    if (!saved) {
      onResumeFileChange(null);
      return;
    }
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
  };

  const openDocument = (document: CareerTalentDocument) => {
    const isGmailCareerHistory =
      document.originType === "gmail_career_history" &&
      document.originId === "singleton";
    if (document.kind === "call_note") {
      onOpenCallNote(document);
    } else if (isGmailCareerHistory) {
      onEditDocument(document);
    } else if (document.contentType === "text/markdown") {
      onOpenDocument(document);
    } else if (document.downloadUrl) {
      window.open(document.downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <section>
      <FieldLabel
        icon={<Files className="h-4 w-4" />}
        label={
          <span className="flex items-center gap-1.5">
            {t("career.profile.documents.title", "내 문서")}
          </span>
        }
      />

      <div className="mt-3 max-w-2xl text-[13px] rounded-[10px] border border-neutral-1000-a10 bg-white/10 px-3 py-2.5">
        {!hasSavedResume ? <>{resumeEmptyNotice}</> : null}
      </div>
      {companyRequest ? (
        <div className="mt-3 max-w-2xl rounded-[10px] border border-neutral-1000-a10 bg-info-faded px-4 py-3">
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

      <div className="mt-3 flex flex-wrap gap-3">
        {sortedDocuments.map((document) => {
          const isGmailCareerHistory =
            document.originType === "gmail_career_history" &&
            document.originId === "singleton";
          const dateValue = isGmailCareerHistory
            ? document.updatedAt
            : document.kind === "call_note"
              ? document.updatedAt || document.createdAt
              : document.createdAt;
          const title =
            document.kind === "call_note" &&
            document.fileName === "Harper call note"
              ? t("career.profile.documents.call_note_title", "Harper와의 통화")
              : document.fileName;
          const canOpen =
            document.kind === "call_note" ||
            isGmailCareerHistory ||
            document.contentType === "text/markdown" ||
            Boolean(document.downloadUrl);
          return (
            <CareerProfileSourceCard
              key={document.id}
              icon={
                document.kind === "call_note" ? (
                  <PhoneCall aria-hidden="true" className="h-5 w-5" />
                ) : (
                  <CareerDocumentFormatIcon fileName={document.fileName} />
                )
              }
              title={title}
              meta={formatCareerDate(dateValue, locale)}
              onActivate={canOpen ? () => openDocument(document) : undefined}
              ariaLabel={canOpen ? title : undefined}
              badge={
                <Badge
                  size="sm"
                  tone={
                    document.isPrimary || document.isPublic
                      ? "positive"
                      : "neutral"
                  }
                  variant="faded"
                >
                  {document.isPrimary
                    ? t(
                        "career.profile.documents.primary_resume",
                        "대표 이력서"
                      )
                    : document.kind === "call_note"
                      ? t("career.profile.documents.kind.call_note", "콜노트")
                      : document.kind === "resume"
                        ? t("career.profile.documents.kind.resume", "이력서")
                        : document.isPublic
                          ? t("career.profile.documents.public", "회사 공개")
                          : t("career.profile.documents.private", "비공개")}
                </Badge>
              }
              action={
                <ActionDropdown
                  align="start"
                  trigger={
                    <MuteButton
                      type="button"
                      variant="transparent"
                      size="sm"
                      disabled={profileSavePending}
                      aria-label={t(
                        "career.profile.documents.actions",
                        "문서 메뉴"
                      )}
                      className="h-7 min-h-7 w-7 px-0"
                    >
                      <Ellipsis className="h-4 w-4" />
                    </MuteButton>
                  }
                >
                  {document.kind === "call_note" ? (
                    <ActionDropdownItem
                      onSelect={() => onOpenCallNote(document)}
                    >
                      <Eye className="h-4 w-4" />
                      {t(
                        "career.profile.documents.open_call_note",
                        "통화 기록 열기"
                      )}
                    </ActionDropdownItem>
                  ) : document.kind === "resume" && !document.isPrimary ? (
                    <ActionDropdownItem
                      onSelect={() =>
                        void onUpdateTalentDocument(document.id, {
                          isPrimary: true,
                        })
                      }
                    >
                      <Star className="h-4 w-4" />
                      {t(
                        "career.profile.documents.set_primary",
                        "대표 이력서로 지정"
                      )}
                    </ActionDropdownItem>
                  ) : document.kind === "document" && !isGmailCareerHistory ? (
                    <ActionDropdownItem
                      onSelect={() =>
                        void onUpdateTalentDocument(document.id, {
                          isPublic: !document.isPublic,
                        })
                      }
                    >
                      {document.isPublic ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {document.isPublic
                        ? t(
                            "career.profile.documents.make_private",
                            "비공개로 전환"
                          )
                        : t("career.profile.documents.make_public", "공개하기")}
                    </ActionDropdownItem>
                  ) : null}
                  {document.kind !== "call_note" ? (
                    <ActionDropdownItem
                      onSelect={() => onRenameDocument(document)}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("career.profile.documents.rename", "이름 수정")}
                    </ActionDropdownItem>
                  ) : null}
                  <ActionDropdownSeparator />
                  <ActionDropdownItem
                    tone="danger"
                    onSelect={() => onDeleteDocument(document.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("career.profile.documents.delete", "문서 삭제")}
                  </ActionDropdownItem>
                </ActionDropdown>
              }
            />
          );
        })}

        {hasSavedResume && !hasResumeDocument ? (
          <CareerProfileSourceCard
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title={
              savedResumeFileName ??
              t("career.common.career.0w4x7qh", "파일명 정보 없음")
            }
            meta={t("career.profile.documents.primary_resume", "대표 이력서")}
            badge={
              <Badge size="sm" tone="positive" variant="faded">
                {t("career.profile.documents.primary_resume", "대표 이력서")}
              </Badge>
            }
            onActivate={
              savedResumeDownloadUrl
                ? () => {
                    logCareerEvent("click_resume_download");
                    window.open(
                      savedResumeDownloadUrl,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }
                : undefined
            }
          />
        ) : null}

        <ResumeDropzone
          inputId="career-settings-resume-upload"
          variant="source-card"
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
                : t("career.profile.sources.upload_resume", "이력서 업로드")
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

        <CareerProfileSourceCard
          icon={<Plus className="h-5 w-5" aria-hidden="true" />}
          title={t("career.profile.documents.add", "추가하기")}
          meta={t("career.profile.sources.add_document", "문서 추가")}
          className="border-dashed shadow-none"
          onActivate={onAddDocument}
          ariaLabel={t("career.profile.documents.add", "추가하기")}
        />
      </div>
    </section>
  );
};

export default CareerDocumentsSettingsSection;
