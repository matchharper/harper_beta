import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  EditIcon,
  Eye,
  FileText,
  Globe2,
  ImagePlus,
  Loader2,
  MapPin,
  Trash2,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import type { CareerTalentUser } from "../types";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input, Input as UiInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { Tooltips } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerLinkLabels } from "@/components/career/constants";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { getResumeSignedUrlLogMetadata } from "@/lib/career/resumeSignedUrlLog";

export type CareerProfileInsightItem = {
  key: string;
  label: string;
  value: string;
};

type ProfileSourceIndicator = {
  Icon?: React.ComponentType<{ className?: string }>;
  iconSrc?: string;
  key: string;
  label: string;
};

const getProfileLinkIconSrc = (index: number) => {
  if (index === 0) return "/images/logos/linkedin.svg";
  if (index === 1) return "/images/logos/github.svg";
  if (index === 2) return "/images/logos/scholar.png";
  if (index === 4) return "/images/logos/xcom.png";
  return null;
};

const profileEditMobileFieldClassName =
  "rounded-md border border-neutral-1000-a10 bg-bg-floating px-2.5 text-[13px] font-normal leading-5 text-neutral-primary placeholder:text-neutral-placeholder hover:bg-bg-floating focus:border-neutral-400 focus:bg-bg-floating focus:ring-2 focus:ring-neutral-1000-a05";

const profileEditInputClassName = cn(
  profileEditMobileFieldClassName,
  "h-9 py-1.5 md:px-3 md:py-2"
);

const profileEditTextareaClassName = cn(
  profileEditMobileFieldClassName,
  "min-h-[72px] py-1.5 md:min-h-[92px] md:px-3 md:py-2 md:leading-6"
);

const profileNoticeClassName =
  "flex w-full items-start gap-2.5 rounded-[14px] border border-neutral-1000-a05 bg-linear-to-br from-bg-basement to-bg-default px-3.5 py-2.5 text-[12.5px] leading-5 text-neutral-muted";

const overviewEyebrowClassName = "text-[13px] font-medium text-neutral-muted";
const insightTermClassName = "text-[13px] font-medium text-neutral-muted";

export const RecruiterProfileNotice = ({ copy }: { copy: string }) => {
  const t = useCareerT();

  return (
    <div className={profileNoticeClassName}>
      <Eye className="mt-1 h-3.5 w-3.5 shrink-0 text-neutral-muted" />
      <div className="flex flex-col md:flex-row">
        <strong className="font-medium text-neutral-primary">{copy}</strong>
        <span>
          {t(
            "career.profile.career_talent_profile_panel.0rfzx4s",
            " · 연결이 성사된 회사에만 공유돼요"
          )}
        </span>
      </div>
    </div>
  );
};

const ProfileAvatar = ({
  imageUrl,
  name,
  onDeleteImage,
  onFileChange,
  uploadPending = false,
}: {
  imageUrl?: string | null;
  name: string;
  onDeleteImage?: () => void;
  onFileChange?: (file: File) => void;
  uploadPending?: boolean;
}) => {
  const t = useCareerT();
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const shouldShowImage =
    Boolean(imageUrl) && !String(imageUrl).includes("media.licdn.com");
  const hasStoredImage = Boolean(imageUrl);
  const imageActionDisabled =
    uploadPending || (!onFileChange && !onDeleteImage);

  return (
    <div className="relative h-14 w-14 shrink-0">
      <UiInput
        unstyled
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFileChange?.(file);
        }}
      />
      <ActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="start"
        side="bottom"
        sideOffset={8}
        contentClassName="w-[190px]"
        trigger={
          <BareButton
            type="button"
            aria-label="프로필 사진 메뉴"
            disabled={imageActionDisabled}
            className={cn(
              "group relative flex h-14 w-14 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-weak text-neutral-muted transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-positive/30",
              imageActionDisabled
                ? "cursor-default"
                : "cursor-pointer hover:border-positive/30"
            )}
          >
            <UserRound className="h-7 w-7" strokeWidth={1.7} />
            {shouldShowImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(imageUrl)}
                alt={name || "profile"}
                className="absolute inset-0 h-full w-full rounded-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            {uploadPending ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/30 text-neutral-00">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : null}
          </BareButton>
        }
      >
        <ActionDropdownItem
          disabled={!onFileChange || uploadPending}
          onSelect={() => {
            setMenuOpen(false);
            window.setTimeout(() => fileInputRef.current?.click(), 0);
          }}
          className="flex flex-row items-center gap-2.5 text-[13px]"
        >
          <ImagePlus className="h-4 w-4" />
          {t(
            "career.profile.career_talent_profile_panel.1rnsexk",
            "사진 변경/업로드"
          )}
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          disabled={!onDeleteImage || !hasStoredImage || uploadPending}
          onSelect={() => {
            setMenuOpen(false);
            onDeleteImage?.();
          }}
          tone="danger"
          className="flex flex-row items-center gap-2.5 text-[13px]"
        >
          <Trash2 className="h-4 w-4" />
          {t("career.profile.career_talent_profile_panel.1dp84h2", "사진 삭제")}
        </ActionDropdownItem>
      </ActionDropdown>
    </div>
  );
};

export const ProfileHeader = ({
  displayName,
  isEditing,
  locale,
  onEdit,
  onFieldChange,
  onOpenProfileSources,
  onProfileImageDelete,
  onProfileImageFileChange,
  profileUpdatedText,
  profileImageUploadPending,
  savedResumeDownloadUrl,
  savedResumeFileName,
  savedResumeStoragePath,
  savedProfileLinks,
  user,
}: {
  displayName: string;
  isEditing: boolean;
  locale: Locale;
  onEdit?: () => void;
  onFieldChange?: (
    field: keyof Omit<CareerTalentUser, "user_id">,
    value: string
  ) => void;
  onOpenProfileSources?: () => void;
  onProfileImageDelete?: () => void;
  onProfileImageFileChange?: (file: File) => void;
  profileUpdatedText: string | null;
  profileImageUploadPending?: boolean;
  savedResumeDownloadUrl?: string | null;
  savedResumeFileName?: string | null;
  savedResumeStoragePath?: string | null;
  savedProfileLinks?: string[];
  user: CareerTalentUser | null | undefined;
}) => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const profileSourceIndicators = useMemo<ProfileSourceIndicator[]>(() => {
    const items: ProfileSourceIndicator[] = [];
    const hasSavedResume = Boolean(
      savedResumeDownloadUrl || savedResumeFileName || savedResumeStoragePath
    );

    if (hasSavedResume) {
      items.push({
        Icon: FileText,
        key: "resume",
        label: t("career.common.career.0y7cerf", "저장된 이력서"),
      });
    }

    const linkLabels = getCareerLinkLabels(t);
    const links = savedProfileLinks ?? [];
    const hasAdditionalLink = links
      .slice(linkLabels.length)
      .some((link) => link.trim().length > 0);

    linkLabels.forEach((label, index) => {
      if (!links[index]?.trim()) return;
      const iconSrc = getProfileLinkIconSrc(index);
      items.push({
        ...(iconSrc ? { iconSrc } : { Icon: Globe2 }),
        key: `link-${index}`,
        label,
      });
    });

    if (hasAdditionalLink) {
      items.push({
        Icon: Globe2,
        key: "link-additional",
        label: t("career.chat.career_timeline_section.0ong27a", "추가 링크"),
      });
    }

    return items;
  }, [
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
    t,
  ]);

  return (
    <section
      className={cn("flex flex-col gap-4 px-1 pt-1 sm:flex-row items-start")}
    >
      <ProfileAvatar
        imageUrl={user?.profile_picture}
        name={isEditing ? user?.name || "Unknown" : displayName}
        onDeleteImage={onProfileImageDelete}
        onFileChange={onProfileImageFileChange}
        uploadPending={profileImageUploadPending}
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          {isEditing ? (
            <Input
              value={user?.name ?? ""}
              onChange={(event) => onFieldChange?.("name", event.target.value)}
              placeholder={t("career.onboarding.onboarding.1wh5aat", "이름")}
              aria-label="이름"
              className={cn(
                profileEditInputClassName,
                "max-w-[360px] md:h-10 md:font-hedvig md:text-[20px]"
              )}
            />
          ) : (
            <h2 className="font-hedvig text-[20px] leading-none text-neutral-primary">
              {displayName}
            </h2>
          )}
          {/* <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-weak px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-neutral-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            Active
          </span> */}
        </div>

        {isEditing ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input
              value={user?.headline ?? ""}
              onChange={(event) =>
                onFieldChange?.("headline", event.target.value)
              }
              placeholder={t(
                "career.profile.career_talent_profile_panel.0tgcq59",
                "한 줄 소개"
              )}
              aria-label="한 줄 소개"
              className={profileEditInputClassName}
            />
            <Input
              value={user?.location ?? ""}
              onChange={(event) =>
                onFieldChange?.("location", event.target.value)
              }
              placeholder={t(
                "career.profile.career_talent_profile_panel.0csjlpy",
                "지역"
              )}
              aria-label="지역"
              className={profileEditInputClassName}
            />
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5 text-neutral-muted">
            {user?.headline ? <span>{user.headline}</span> : null}
            {user?.headline && user?.location ? (
              <span className="text-neutral-1000-a10">|</span>
            ) : null}
            {user?.location ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {formatCareerLocation(user.location, locale)}
              </span>
            ) : null}
          </div>
        )}

        {profileUpdatedText ? (
          <div
            className={cn(
              "text-[11.5px] leading-5 tracking-[0.02em] text-neutral-soft",
              isEditing ? "mt-2" : "mt-1"
            )}
          >
            Last updated · {profileUpdatedText}
          </div>
        ) : null}

        {profileSourceIndicators.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {profileSourceIndicators.map(({ Icon, iconSrc, key, label }) => (
              <Tooltips key={key} text={label} side="bottom">
                <MuteButton
                  type="button"
                  variant="transparent"
                  onClick={onOpenProfileSources}
                  aria-label={`${label} 관리`}
                  className="shrink-0"
                >
                  {iconSrc ? (
                    <Image
                      src={iconSrc}
                      alt=""
                      width={16}
                      height={16}
                      className="h-4 w-4 rounded-[3px] object-contain"
                    />
                  ) : Icon ? (
                    <Icon className="h-3.5 w-3.5" />
                  ) : null}
                </MuteButton>
              </Tooltips>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "absolute right-0 top-[-4px] flex shrink-0 gap-1",
          isEditing ? "flex-wrap" : "flex-row items-end"
        )}
      >
        {!isEditing && savedResumeDownloadUrl && (
          <MuteButton asChild variant="default">
            <a
              href={savedResumeDownloadUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() =>
                logCareerEvent(
                  "click_profile_view_cv",
                  getResumeSignedUrlLogMetadata({
                    hasStoragePath: Boolean(savedResumeStoragePath),
                    signedUrl: savedResumeDownloadUrl,
                  })
                )
              }
            >
              <FileText className="h-3.5 w-3.5 text-neutral-muted" />
              View CV
            </a>
          </MuteButton>
        )}
        {!isEditing && onEdit ? (
          <MuteButton type="button" variant="default" onClick={onEdit}>
            <EditIcon className="h-3.5 w-3.5 text-neutral-muted" />
            {t(
              "career.profile.career_talent_profile_panel.1iq5xym",
              "수정하기"
            )}
          </MuteButton>
        ) : null}
      </div>
    </section>
  );
};

export const ProfileOverviewSection = ({
  allItems,
  isEditing,
  items,
  onInsightChange,
  onSummaryChange,
  showAllInsightsButton = false,
  summary,
}: {
  allItems?: CareerProfileInsightItem[];
  isEditing: boolean;
  items: CareerProfileInsightItem[];
  onInsightChange?: (key: string, value: string) => void;
  onSummaryChange?: (value: string) => void;
  showAllInsightsButton?: boolean;
  summary: string;
}) => {
  const t = useCareerT();
  const [showAllInsights, setShowAllInsights] = useState(false);
  const canShowAllInsights =
    showAllInsightsButton &&
    !isEditing &&
    Boolean(
      allItems?.some(
        (item) => !items.some((currentItem) => currentItem.key === item.key)
      )
    );
  const displayedItems =
    showAllInsights && canShowAllInsights && allItems?.length
      ? allItems
      : items;

  return (
    <section className="px-1">
      {isEditing || summary ? (
        <div className="mb-7">
          <div className={overviewEyebrowClassName}>Summary</div>
          {isEditing ? (
            <Textarea
              value={summary}
              onChange={(event) => onSummaryChange?.(event.target.value)}
              placeholder="Summary"
              aria-label="Summary"
              className={cn(profileEditTextareaClassName, "mt-2 md:mt-3")}
            />
          ) : (
            <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-neutral-primary">
              {summary}
            </p>
          )}
        </div>
      ) : null}

      <div className={overviewEyebrowClassName}>What They Are Looking For</div>
      <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-[112px_minmax(0,1fr)]">
        {displayedItems.map((item) => (
          <React.Fragment key={item.key}>
            <dt
              className={cn(
                insightTermClassName,
                isEditing ? "pt-2" : "pt-0.5"
              )}
            >
              {item.label}
            </dt>
            <dd className="m-0">
              {isEditing ? (
                <Textarea
                  rows={2}
                  value={item.value}
                  onChange={(event) =>
                    onInsightChange?.(item.key, event.target.value)
                  }
                  placeholder={t(
                    "career.profile.career_talent_profile_panel.093jpik",
                    "아직 확인 중"
                  )}
                  aria-label={item.label}
                  className={cn(
                    profileEditTextareaClassName,
                    "min-h-[56px] md:min-h-[52px]"
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "text-[14px] leading-6 font-normal",
                    item.value ? "text-neutral-primary" : "text-neutral-soft"
                  )}
                >
                  {item.value ||
                    t(
                      "career.profile.career_talent_profile_panel.093jpik",
                      "아직 확인 중"
                    )}
                </div>
              )}
            </dd>
          </React.Fragment>
        ))}
      </dl>
      {canShowAllInsights ? (
        <MuteButton
          type="button"
          onClick={() => setShowAllInsights((current) => !current)}
          className="mt-4 gap-1.5 text-[12px] font-medium"
        >
          {showAllInsights ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" />
              {t("career.profile.career_talent_profile_panel.0tftkys", "접기")}
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              {t(
                "career.profile.career_talent_profile_panel.1nc9ehf",
                "전체 insight 보기"
              )}
            </>
          )}
        </MuteButton>
      ) : null}
    </section>
  );
};
