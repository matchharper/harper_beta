import {
  Cable,
  ExternalLink,
  FileText,
  Globe2,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import React, { useMemo, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { getCareerLinkLabels } from "@/components/career/constants";
import LoadingState from "@/components/career/OnboardingLoadingState";
import { pickLinkedinProfileLink } from "@/hooks/career/careerHelpers";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { AttentionBadge } from "@/components/ui/badge";
import { SecondaryButton, BareButton } from "@/components/ui/button";
import { Input, Input as UiInput } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/panel";
import { useCareerT } from "@/i18n/useCareerT";

const CAREER_LINK_ITEMS = [
  {
    alt: "LinkedIn",
    iconSrc: "/images/logos/linkedin.svg",
    placeholder: "https://linkedin.com/in/username",
  },
  {
    alt: "Github",
    iconSrc: "/images/logos/github.svg",
    placeholder: "https://github.com/username",
  },
  {
    alt: "Google Scholar",
    iconSrc: "/images/logos/scholar.png",
    placeholder: "https://scholar.google.com/citations?user=",
  },
  {
    alt: "Website",
    iconSrc: null,
    placeholder: "https://yourname.com",
  },
  {
    alt: "X.com",
    iconSrc: "/images/logos/xcom.png",
    placeholder: "https://x.com/username",
  },
] as const;

const LinkItemIcon = ({ index }: { index: number }) => {
  const item = CAREER_LINK_ITEMS[index];

  if (item?.iconSrc) {
    return (
      <Image
        src={item.iconSrc}
        alt={item.alt}
        width={16}
        height={16}
        className="h-4 w-4 rounded-[4px] object-contain"
      />
    );
  }

  return <Globe2 className="h-4 w-4 text-neutral-muted" aria-hidden="true" />;
};

const CareerResumeLinksSettingsSection = () => {
  const t = useCareerT();
  const careerLinkLabels = useMemo(() => getCareerLinkLabels(t), [t]);

  const logCareerEvent = useCareerLogEvent();
  const {
    resumeFile,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileLinks,
    savedProfileLinks,
    profileSavePending,
    profileSaveError,
    onResumeFileChange,
    onProfileLinkChange,
    onAddProfileLink,
    onRemoveProfileLink,
    onSaveTalentProfile,
  } = useCareerSidebarContext();
  const [isProcessingSourceUpdate, setIsProcessingSourceUpdate] =
    useState(false);

  const hasSavedResume = useMemo(
    () => Boolean(savedResumeFileName || savedResumeStoragePath),
    [savedResumeFileName, savedResumeStoragePath]
  );

  const hasUnsavedLinkChanges = useMemo(() => {
    if (profileLinks.length !== savedProfileLinks.length) return true;

    return profileLinks.some(
      (link, index) => link.trim() !== (savedProfileLinks[index] ?? "").trim()
    );
  }, [profileLinks, savedProfileLinks]);

  const shouldShowSaveButton = Boolean(resumeFile) || hasUnsavedLinkChanges;
  const hasLinkedinChange = useMemo(() => {
    const previousLinkedinUrl = pickLinkedinProfileLink(savedProfileLinks);
    const nextLinkedinUrl = pickLinkedinProfileLink(profileLinks);
    return Boolean(nextLinkedinUrl && nextLinkedinUrl !== previousLinkedinUrl);
  }, [profileLinks, savedProfileLinks]);
  const shouldProcessProfileSources = Boolean(resumeFile) || hasLinkedinChange;

  const handleSaveClick = async () => {
    logCareerEvent("click_resume_links_save");
    if (shouldProcessProfileSources) {
      setIsProcessingSourceUpdate(true);
    }

    try {
      await onSaveTalentProfile();
    } finally {
      setIsProcessingSourceUpdate(false);
    }
  };

  return (
    <div className="">
      <Field
        label={t("career.common.career.0y7cerf", "저장된 이력서")}
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 py-4 shadow-sm">
          {hasSavedResume ? (
            <>
              <p className="mt-2 truncate text-sm text-neutral-primary">
                {savedResumeFileName ??
                  t("career.common.career.0w4x7qh", "파일명 정보 없음")}
              </p>
              {savedResumeStoragePath && (
                <p className="mt-1 truncate text-xs text-neutral-soft">
                  {savedResumeStoragePath}
                </p>
              )}
              {savedResumeDownloadUrl && (
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
              )}
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

          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor="career-settings-resume-upload"
              className="relative inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-neutral-1000-a10 bg-bg-floating px-3 text-xs font-medium text-neutral-primary hover:bg-bg-weak"
            >
              <Upload className="h-3.5 w-3.5" />
              {t("career.common.career.0j3w14l", "새 이력서 선택")}
              {!hasSavedResume ? (
                <AttentionBadge
                  label={t(
                    "career.profile.career_profile_workspace.0pv1jmq",
                    "저장된 이력서가 없습니다"
                  )}
                  className="-right-1 -top-1"
                />
              ) : null}
            </label>
            <UiInput
              unstyled
              id="career-settings-resume-upload"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(event) => {
                logCareerEvent("click_resume_select_file");
                onResumeFileChange(event.target.files?.[0] ?? null);
              }}
            />
          </div>
          {resumeFile && (
            <p className="mt-2 truncate text-xs text-neutral-muted">
              {t("career.common.career.0yu4vbj", "업로드 예정:")}{" "}
              {resumeFile.name}
            </p>
          )}
        </div>
      </Field>

      <div className="">
        <FieldLabel
          icon={<Cable className="h-4 w-4" />}
          label={t("career.common.career.1ominm4", "내 링크")}
        />
        <div className="mt-2 space-y-2">
          {profileLinks.map((link, index) => (
            <div
              key={`settings-profile-link-${index}`}
              className="flex items-center gap-2"
            >
              <div className="flex w-36 shrink-0 items-center gap-2 text-sm text-neutral-muted">
                <LinkItemIcon index={index} />
                <span className="truncate">
                  {careerLinkLabels[index] ??
                    t(
                      "career.chat.career_timeline_section.0ong27a",
                      "추가 링크"
                    )}
                </span>
              </div>
              <Input
                value={link}
                onChange={(event) =>
                  onProfileLinkChange(index, event.target.value)
                }
                placeholder={
                  CAREER_LINK_ITEMS[index]?.placeholder ?? "https://"
                }
                className="h-9 flex-1 rounded-lg border border-neutral-400 bg-bg-floating px-2 text-sm text-neutral-primary outline-none transition-colors focus:border-neutral-800"
              />
              {index >= CAREER_LINK_ITEMS.length && (
                <BareButton
                  type="button"
                  onClick={() => {
                    logCareerEvent("click_resume_links_remove_link");
                    onRemoveProfileLink(index);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-800 hover:bg-bg-weak hover:text-neutral-primary"
                >
                  <X className="h-4 w-4" />
                </BareButton>
              )}
            </div>
          ))}
        </div>

        <SecondaryButton
          onClick={() => {
            logCareerEvent("click_resume_links_add_link");
            onAddProfileLink();
          }}
          className="mt-5"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("career.chat.career_timeline_section.1gvzqes", "링크 추가")}
        </SecondaryButton>
      </div>

      {profileSaveError && (
        <p className="rounded-lg border border-neutral-1000-a10 bg-bg-floating px-3 py-2 text-sm text-neutral-primary shadow-sm">
          {profileSaveError}
        </p>
      )}

      {shouldShowSaveButton ? (
        <BareButton
          type="button"
          onClick={() => void handleSaveClick()}
          disabled={profileSavePending}
          className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-neutral-800 bg-black text-sm font-normal text-neutral-00 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {profileSavePending
            ? t(
                "career.profile.career_profile_settings_section.08zy6at",
                "저장 중..."
              )
            : t(
                "career.common.career.07vhdpu",
                "이력서/링크 저장 및 새로운 정보 업데이트"
              )}
        </BareButton>
      ) : null}

      <TalentCareerModal
        open={isProcessingSourceUpdate}
        onClose={() => undefined}
        ariaLabel={t("career.common.career.0tmpcjv", "프로필 업데이트 중")}
        closeOnBackdrop={false}
        showCloseButton={false}
        overlayClassName="z-120"
        panelClassName="max-w-none w-[min(1080px,94vw)] max-h-[92svh] border-0 bg-bg-floating/40"
        bodyClassName="max-h-[92svh] overflow-y-auto py-0"
      >
        <LoadingState isOnboarding={false} />
      </TalentCareerModal>
    </div>
  );
};

export default CareerResumeLinksSettingsSection;
