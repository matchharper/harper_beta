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
import React, { useMemo } from "react";
import { useCareerSidebarContext } from "@/components/career/CareerSidebarContext";
import { CAREER_LINK_LABELS } from "@/components/career/constants";
import {
  CareerField,
  CareerFieldLabel,
  CareerSecondaryButton,
  CareerTextInput,
} from "../ui/CareerPrimitives";

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
    alt: "개인 웹사이트",
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

  return <Globe2 className="h-4 w-4 text-[#2563eb]" aria-hidden="true" />;
};

const CareerResumeLinksSettingsSection = () => {
  const {
    resumeFile,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileLinks,
    savedProfileLinks,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    onResumeFileChange,
    onProfileLinkChange,
    onAddProfileLink,
    onRemoveProfileLink,
    onSaveTalentProfile,
  } = useCareerSidebarContext();

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

  return (
    <div className="font-geist">
      <CareerField
        label="저장된 이력서"
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="rounded-md bg-beige500 px-4 py-4">
          {hasSavedResume ? (
            <>
              <p className="mt-2 truncate text-sm text-hblack800">
                {savedResumeFileName ?? "파일명 정보 없음"}
              </p>
              {savedResumeStoragePath && (
                <p className="mt-1 truncate text-xs text-hblack500">
                  {savedResumeStoragePath}
                </p>
              )}
              {savedResumeDownloadUrl && (
                <a
                  href={savedResumeDownloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-beige900 underline underline-offset-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  다운로드
                </a>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-hblack500">
              저장된 이력서가 없습니다.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <label
              htmlFor="career-settings-resume-upload"
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-beige900/15 bg-white/45 px-3 text-xs font-medium text-beige900 hover:bg-beige900/10"
            >
              <Upload className="h-3.5 w-3.5" />새 이력서 선택
            </label>
            <input
              id="career-settings-resume-upload"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={(event) => {
                onResumeFileChange(event.target.files?.[0] ?? null);
              }}
            />
          </div>
          {resumeFile && (
            <p className="mt-2 truncate text-xs text-hblack700">
              업로드 예정: {resumeFile.name}
            </p>
          )}
        </div>
      </CareerField>

      <div className="">
        <CareerFieldLabel
          icon={<Cable className="h-4 w-4" />}
          label="내 링크"
        />
        <div className="mt-2 space-y-2">
          {profileLinks.map((link, index) => (
            <div
              key={`settings-profile-link-${index}`}
              className="flex items-center gap-2"
            >
              <div className="flex w-36 shrink-0 items-center gap-2 text-sm text-beige900/60">
                <LinkItemIcon index={index} />
                <span className="truncate">
                  {CAREER_LINK_LABELS[index] ?? "추가 링크"}
                </span>
              </div>
              <CareerTextInput
                value={link}
                onChange={(event) =>
                  onProfileLinkChange(index, event.target.value)
                }
                placeholder={CAREER_LINK_ITEMS[index]?.placeholder ?? "https://"}
                className="h-9 flex-1 rounded-lg border border-hblack300 bg-hblack000 px-2 text-sm text-hblack900 outline-none transition-colors focus:border-beige900"
              />
              {index >= CAREER_LINK_ITEMS.length && (
                <button
                  type="button"
                  onClick={() => onRemoveProfileLink(index)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-hblack50 text-hblack600 transition-colors hover:border-beige900 hover:text-beige900"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <CareerSecondaryButton onClick={onAddProfileLink} className="mt-5">
          <Plus className="h-3.5 w-3.5" />
          링크 추가
        </CareerSecondaryButton>
      </div>

      {profileSaveError && (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {profileSaveError}
        </p>
      )}
      {profileSaveInfo && (
        <p className="rounded-lg border border-hblack200 bg-hblack100 px-3 py-2 text-sm text-hblack700">
          {profileSaveInfo}
        </p>
      )}

      {shouldShowSaveButton ? (
        <button
          type="button"
          onClick={() => void onSaveTalentProfile()}
          disabled={profileSavePending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-beige900 bg-beige900 text-sm font-normal text-hblack000 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {profileSavePending
            ? "저장 중..."
            : "이력서/링크 저장 및 새로운 정보 업데이트"}
        </button>
      ) : null}
    </div>
  );
};

export default CareerResumeLinksSettingsSection;
