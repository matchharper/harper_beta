import React, { useMemo, useState } from "react";
import {
  AwardIcon,
  Building2,
  Eye,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Save,
  SchoolIcon,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import type {
  CareerTalentEducation,
  CareerTalentExperience,
  CareerTalentExtra,
  CareerTalentProfile,
  CareerTalentUser,
} from "../types";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { locationEnToKo } from "@/utils/language_map";
import { dateToFormat } from "@/utils/textprocess";
import {
  CareerPrimaryButton,
  CareerSecondaryButton,
  CareerTextInput,
  CareerTextarea,
  careerCx,
} from "../ui/CareerPrimitives";
import { CareerActionButton } from "../ui/CareerActionButton";
import {
  BeigeActionDropdown,
  BeigeActionDropdownItem,
  BeigeActionDropdownSeparator,
} from "@/components/ui/beige/action-dropdown";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";

type EditableExperience = CareerTalentExperience & { clientKey: string };
type EditableEducation = CareerTalentEducation & { clientKey: string };
type EditableExtra = CareerTalentExtra & { clientKey: string };

type EditableTalentProfile = {
  talentUser: CareerTalentUser;
  talentExperiences: EditableExperience[];
  talentEducations: EditableEducation[];
  talentExtras: EditableExtra[];
};

const PROFILE_RERANKING_INSIGHTS = [
  { key: "next_scope", label: "다음 역할" },
  { key: "location", label: "근무 지역" },
  { key: "compensation", label: "보상" },
  { key: "must_haves", label: "필수 조건" },
  { key: "deal_breakers", label: "회피 조건" },
] as const;

type ProfileInsightKey = (typeof PROFILE_RERANKING_INSIGHTS)[number]["key"];

type ProfileInsightItem = {
  key: ProfileInsightKey;
  label: string;
  value: string;
};

type MergedTimelineEntry<
  TExperience extends CareerTalentExperience,
  TEducation extends CareerTalentEducation,
> =
  | { index: number; item: TExperience; kind: "exp" }
  | { index: number; item: TEducation; kind: "edu" };

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatRange = (startDate?: string | null, endDate?: string | null) => {
  const start = dateToFormat(startDate);
  const end = dateToFormat(endDate);
  if (!start && !end) return "";
  if (start && !end) return `${start} - 현재`;
  if (!start && end) return end;
  return `${start} - ${end}`;
};

const formatMonth = (months?: number | null) => {
  if (!months || months <= 0) return "";
  const years = Math.floor(months / 12);
  const remain = months % 12;
  return `${years > 0 ? `${years}년 ` : ""}${remain}개월`;
};

const parseProfileMonthDate = (
  value?: string | null,
  fallbackToToday = false
) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  if (/^(present|current|now|현재)$/i.test(normalized)) {
    return fallbackToToday ? new Date() : null;
  }

  const yearMonthMatch = normalized.match(/^(\d{4})[./-](\d{1,2})$/);
  if (yearMonthMatch) {
    const year = Number(yearMonthMatch[1]);
    const month = Number(yearMonthMatch[2]);
    if (month >= 1 && month <= 12) return new Date(year, month - 1, 1);
  }

  const yearMatch = normalized.match(/^(\d{4})$/);
  if (yearMatch) return new Date(Number(yearMatch[1]), 0, 1);

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const calculateExperienceMonths = (
  startDate?: string | null,
  endDate?: string | null
) => {
  const start = parseProfileMonthDate(startDate);
  if (!start) return null;

  const end =
    parseProfileMonthDate(endDate, true) ??
    (!String(endDate ?? "").trim() ? new Date() : null);
  if (!end || end.getTime() < start.getTime()) return null;

  const monthDiff =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  return Math.max(0, monthDiff);
};

const formatLastUpdated = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const createClientKey = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const createBlankTalentUser = (userId?: string | null): CareerTalentUser => ({
  user_id: userId ?? "",
  name: null,
  profile_picture: null,
  headline: null,
  bio: null,
  location: null,
});

const createEditableProfile = (
  profile: CareerTalentProfile
): EditableTalentProfile => ({
  talentUser: profile.talentUser
    ? { ...profile.talentUser }
    : createBlankTalentUser(),
  talentExperiences: profile.talentExperiences.map((item) => ({
    ...item,
    clientKey: createClientKey("exp"),
  })),
  talentEducations: profile.talentEducations.map((item) => ({
    ...item,
    clientKey: createClientKey("edu"),
  })),
  talentExtras: profile.talentExtras.map((item) => ({
    ...item,
    clientKey: createClientKey("extra"),
  })),
});

const trimSingleLine = (value: string | null | undefined) => {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || null;
};

const trimMultiline = (value: string | null | undefined) => {
  const normalized = String(value ?? "")
    .replace(/\r/g, "")
    .trim();
  return normalized || null;
};

const trimDateText = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const toComparableProfile = (
  profile: CareerTalentProfile | EditableTalentProfile
) => ({
  talentUser: {
    name: trimSingleLine(profile.talentUser?.name),
    profile_picture: trimSingleLine(profile.talentUser?.profile_picture),
    headline: trimSingleLine(profile.talentUser?.headline),
    bio: trimMultiline(profile.talentUser?.bio),
    location: trimSingleLine(profile.talentUser?.location),
  },
  talentExperiences: profile.talentExperiences.map((item) => ({
    role: trimSingleLine(item.role),
    description: trimMultiline(item.description),
    employment_type: trimSingleLine(item.employment_type),
    start_date: trimDateText(item.start_date),
    end_date: trimDateText(item.end_date),
    months: calculateExperienceMonths(item.start_date, item.end_date),
    company_id: trimSingleLine(item.company_id),
    company_link: trimSingleLine(item.company_link),
    company_name: trimSingleLine(item.company_name),
    company_location: trimSingleLine(item.company_location),
    company_logo: trimSingleLine(item.company_logo),
    memo: trimMultiline(item.memo),
  })),
  talentEducations: profile.talentEducations.map((item) => ({
    school: trimSingleLine(item.school),
    degree: trimSingleLine(item.degree),
    description: trimMultiline(item.description),
    field: trimSingleLine(item.field),
    start_date: trimDateText(item.start_date),
    end_date: trimDateText(item.end_date),
    url: trimSingleLine(item.url),
    memo: trimMultiline(item.memo),
  })),
  talentExtras: profile.talentExtras.map((item) => ({
    title: trimSingleLine(item.title),
    description: trimMultiline(item.description),
    date: trimDateText(item.date),
    memo: trimMultiline(item.memo),
  })),
});

const toStructuredProfile = (
  draft: EditableTalentProfile,
  fallbackUserId: string | null | undefined
): CareerTalentProfile => ({
  talentUser: {
    user_id: draft.talentUser.user_id || fallbackUserId || "",
    name: trimSingleLine(draft.talentUser.name),
    profile_picture: trimSingleLine(draft.talentUser.profile_picture),
    headline: trimSingleLine(draft.talentUser.headline),
    bio: trimMultiline(draft.talentUser.bio),
    location: trimSingleLine(draft.talentUser.location),
  },
  talentExperiences: draft.talentExperiences.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      role: trimSingleLine(item.role),
      description: trimMultiline(item.description),
      employment_type: trimSingleLine(item.employment_type),
      start_date: trimDateText(item.start_date),
      end_date: trimDateText(item.end_date),
      months: calculateExperienceMonths(item.start_date, item.end_date),
      company_id: trimSingleLine(item.company_id),
      company_link: trimSingleLine(item.company_link),
      company_name: trimSingleLine(item.company_name),
      company_location: trimSingleLine(item.company_location),
      company_logo: trimSingleLine(item.company_logo),
      memo: trimMultiline(item.memo),
    })
  ),
  talentEducations: draft.talentEducations.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      school: trimSingleLine(item.school),
      degree: trimSingleLine(item.degree),
      description: trimMultiline(item.description),
      field: trimSingleLine(item.field),
      start_date: trimDateText(item.start_date),
      end_date: trimDateText(item.end_date),
      url: trimSingleLine(item.url),
      memo: trimMultiline(item.memo),
    })
  ),
  talentExtras: draft.talentExtras.map(
    ({ clientKey: _clientKey, ...item }) => ({
      ...item,
      title: trimSingleLine(item.title),
      description: trimMultiline(item.description),
      date: trimDateText(item.date),
      memo: trimMultiline(item.memo),
    })
  ),
});

const mergeExperienceAndEducation = <
  TExperience extends CareerTalentExperience,
  TEducation extends CareerTalentEducation,
>(
  talentExperiences: readonly TExperience[],
  talentEducations: readonly TEducation[]
): MergedTimelineEntry<TExperience, TEducation>[] => {
  const expItems = talentExperiences.map((item, index) => ({
    kind: "exp" as const,
    item,
    index,
  }));
  const eduItems = talentEducations.map((item, index) => ({
    kind: "edu" as const,
    item,
    index,
  }));

  const datedItems: MergedTimelineEntry<TExperience, TEducation>[] = [
    ...expItems,
    ...eduItems.filter((edu) => Boolean(parseDate(edu.item.start_date))),
  ];

  datedItems.sort((a, b) => {
    const aIsOngoing = !parseDate(a.item.end_date);
    const bIsOngoing = !parseDate(b.item.end_date);
    if (aIsOngoing !== bIsOngoing) return aIsOngoing ? -1 : 1;

    const aStartDate = parseDate(a.item.start_date);
    const bStartDate = parseDate(b.item.start_date);
    if (aStartDate && bStartDate) {
      return bStartDate.getTime() - aStartDate.getTime();
    }
    if (aStartDate && !bStartDate) return -1;
    if (!aStartDate && bStartDate) return 1;
    return 0;
  });

  const undatedEdu = eduItems.filter((edu) => !parseDate(edu.item.start_date));
  if (undatedEdu.length === 0) return datedItems;

  const merged = [...datedItems];
  undatedEdu.forEach((edu) => {
    const nextDatedEdu = eduItems
      .slice(edu.index + 1)
      .find((next) => Boolean(parseDate(next.item.start_date)));

    if (!nextDatedEdu) {
      merged.push(edu);
      return;
    }

    const insertAt = merged.findIndex(
      (entry) => entry.kind === "edu" && entry.index === nextDatedEdu.index
    );

    if (insertAt === -1) merged.push(edu);
    else merged.splice(insertAt, 0, edu);
  });

  return merged;
};

const TimelineBlock = ({
  title,
  subtitle,
  description,
  memo,
  meta,
  icon,
  kind = "work",
  logoUrl,
  logoAlt,
  logoText,
  isLast,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  memo?: string;
  meta?: string;
  icon: React.ReactNode;
  kind?: "work" | "education" | "extra";
  logoUrl?: string | null;
  logoAlt?: string;
  logoText?: string;
  isLast?: boolean;
}) => {
  const badgeClassName =
    kind === "education"
      ? "bg-beige900/10 text-beige900/60"
      : kind === "extra"
        ? "bg-beige200 text-beige900/60"
        : "bg-beige700/10 text-beige700";
  const badgeLabel =
    kind === "education" ? "Education" : kind === "extra" ? "Extra" : "Work";
  const fallbackLogoText = (logoText ?? logoAlt ?? title)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={careerCx(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-beige900/15 via-beige900/10 to-transparent" />
      )}
      <div className="relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-white bg-beige500 text-[17px] font-semibold leading-none text-beige900/65 shadow-[0_1px_2px_rgba(46,23,6,0.05)]">
        <span className="absolute inset-0 flex items-center justify-center">
          {fallbackLogoText || icon}
        </span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={logoAlt ?? title}
            className="relative h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span
            className={careerCx(
              "rounded-[4px] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
              badgeClassName
            )}
          >
            {badgeLabel}
          </span>
          {meta && (
            <span className="text-[11.5px] leading-5 text-beige900/40">
              {meta}
            </span>
          )}
        </div>
        <div className="text-[14px] font-medium leading-[1.35] text-beige900">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-[12.5px] leading-5 text-beige900/65">
            {subtitle}
          </div>
        )}
        {description && (
          <div className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-beige900/65">
            {description}
          </div>
        )}
        {memo && (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-beige100 px-3.5 py-3">
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-beige700" />
            <div className="min-w-0">
              <div className="mb-1 text-[11px] text-beige700">Harper 메모</div>
              <div className="text-[13px] leading-5 text-beige900">{memo}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ProfileSectionHeader = ({
  count,
  icon,
  label,
}: {
  count?: number;
  icon: React.ReactNode;
  label: string;
}) => (
  <div className="flex items-center gap-2 px-1 pt-4">
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-beige900/65">
      {icon}
    </span>
    <span className="font-halant text-lg leading-none text-beige900">
      {label}
    </span>
    {typeof count === "number" ? (
      <span className="text-[13px] leading-none text-beige900/45">{count}</span>
    ) : null}
    <span className="h-px min-w-8 flex-1 bg-beige900/10" />
  </div>
);

const EmptyEditState = ({ label }: { label: string }) => (
  <div className="rounded-[10px] border border-dashed border-beige900/20 bg-white/30 px-4 py-4 text-sm text-beige900/55">
    {label}
  </div>
);

const ItemRemoveButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-beige900/10 bg-white/60 text-beige900/60 transition-colors hover:border-beige900/25 hover:text-beige900 md:h-8 md:w-8"
    aria-label="항목 삭제"
  >
    <Trash2 className="h-4 w-4" />
  </button>
);

const profileEditInputClassName =
  "h-11 border-beige900/15 bg-white/70 text-base placeholder:text-beige900/35 md:h-9 md:text-[13px]";

const profileEditTextareaClassName =
  "min-h-[92px] border-beige900/15 bg-white/70 text-base leading-6 placeholder:text-beige900/35 md:text-[13px]";

const profileEditPlainInputClassName =
  "h-auto rounded-[4px] border border-white/50 bg-white/80 px-1.5 py-1 shadow-none hover:bg-white/45 focus:border-beige900/15 focus:bg-white/75 focus:ring-1 focus:ring-beige900/20";

const profileEditPlainTextareaClassName =
  "min-h-[74px] rounded-[6px] border border-white/50 bg-white/80 px-1.5 py-1.5 shadow-none hover:bg-white/45 focus:border-beige900/15 focus:bg-white/75 focus:ring-1 focus:ring-beige900/20";

const profileNoticeClassName =
  "flex items-center gap-2.5 rounded-[14px] border border-beige900/10 bg-linear-to-br from-beige100 to-white/80 px-3.5 py-2.5 text-[12.5px] leading-5 text-beige900/65";

const overviewEyebrowClassName = "text-[13px] font-medium text-beige900/70";

const insightTermClassName = "text-[13px] font-medium text-beige900/70";

const RecruiterProfileNotice = ({ copy }: { copy: string }) => (
  <div className={profileNoticeClassName}>
    <Eye className="h-3.5 w-3.5 shrink-0 text-beige700" />
    <div>
      <strong className="font-medium text-beige900">{copy}</strong>
      <span> · 연결이 성사된 회사에만 공유돼요</span>
    </div>
  </div>
);

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
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const shouldShowImage =
    Boolean(imageUrl) && !String(imageUrl).includes("media.licdn.com");
  const hasStoredImage = Boolean(imageUrl);
  const imageActionDisabled =
    uploadPending || (!onFileChange && !onDeleteImage);

  return (
    <div className="relative h-14 w-14 shrink-0">
      <input
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
      <BeigeActionDropdown
        open={menuOpen}
        onOpenChange={setMenuOpen}
        align="start"
        side="bottom"
        sideOffset={8}
        contentClassName="w-[190px]"
        trigger={
          <button
            type="button"
            aria-label="프로필 사진 메뉴"
            disabled={imageActionDisabled}
            className={careerCx(
              "group relative flex h-14 w-14 items-center justify-center rounded-full border border-beige900/10 bg-beige500 text-beige900/55 shadow-[0_2px_10px_rgba(46,23,6,0.06)] transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#22c55e]/20",
              imageActionDisabled
                ? "cursor-default"
                : "cursor-pointer hover:border-[#22c55e]/45"
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
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-beige900/30 text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : null}
          </button>
        }
      >
        <BeigeActionDropdownItem
          disabled={!onFileChange || uploadPending}
          onSelect={() => {
            setMenuOpen(false);
            window.setTimeout(() => fileInputRef.current?.click(), 0);
          }}
          className="flex flex-row items-center gap-2.5 text-[13px]"
        >
          <ImagePlus className="h-4 w-4" />
          사진 변경/업로드
        </BeigeActionDropdownItem>
        <BeigeActionDropdownSeparator />
        <BeigeActionDropdownItem
          disabled={!onDeleteImage || !hasStoredImage || uploadPending}
          onSelect={() => {
            setMenuOpen(false);
            onDeleteImage?.();
          }}
          tone="danger"
          className="flex flex-row items-center gap-2.5 text-[13px]"
        >
          <Trash2 className="h-4 w-4" />
          사진 삭제
        </BeigeActionDropdownItem>
      </BeigeActionDropdown>
    </div>
  );
};

const ProfileHeader = ({
  displayName,
  isEditing,
  onEdit,
  onFieldChange,
  onProfileImageDelete,
  onProfileImageFileChange,
  profileUpdatedText,
  profileImageUploadPending,
  savedResumeDownloadUrl,
  user,
}: {
  displayName: string;
  isEditing: boolean;
  onEdit?: () => void;
  onFieldChange?: (
    field: keyof Omit<CareerTalentUser, "user_id">,
    value: string
  ) => void;
  onProfileImageDelete?: () => void;
  onProfileImageFileChange?: (file: File) => void;
  profileUpdatedText: string | null;
  profileImageUploadPending?: boolean;
  savedResumeDownloadUrl?: string | null;
  user: CareerTalentUser | null | undefined;
}) => (
  <section
    className={careerCx(
      "relative flex flex-col gap-4 px-1 pt-1 sm:flex-row",
      isEditing ? "sm:items-start" : "sm:items-center"
    )}
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
          <CareerTextInput
            value={user?.name ?? ""}
            onChange={(event) => onFieldChange?.("name", event.target.value)}
            placeholder="이름"
            aria-label="이름"
            className={careerCx(
              profileEditInputClassName,
              "h-10 max-w-[360px] font-hedvig text-[24px]"
            )}
          />
        ) : (
          <h2 className="font-hedvig text-[24px] leading-none text-beige900">
            {displayName}
          </h2>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-beige700/10 px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-beige700">
          <span className="h-1.5 w-1.5 rounded-full bg-beige700" />
          Active
        </span>
      </div>

      {isEditing ? (
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <CareerTextInput
            value={user?.headline ?? ""}
            onChange={(event) =>
              onFieldChange?.("headline", event.target.value)
            }
            placeholder="한 줄 소개"
            aria-label="한 줄 소개"
            className={profileEditInputClassName}
          />
          <CareerTextInput
            value={user?.location ?? ""}
            onChange={(event) =>
              onFieldChange?.("location", event.target.value)
            }
            placeholder="지역"
            aria-label="지역"
            className={profileEditInputClassName}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] leading-5 text-beige900/65">
          {user?.headline ? <span>{user.headline}</span> : null}
          {user?.headline && user?.location ? (
            <span className="text-beige900/25">|</span>
          ) : null}
          {user?.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {locationEnToKo(user.location)}
            </span>
          ) : null}
        </div>
      )}

      {profileUpdatedText ? (
        <div
          className={careerCx(
            "text-[11.5px] leading-5 tracking-[0.02em] text-beige900/45",
            isEditing ? "mt-2" : "mt-1"
          )}
        >
          Last updated · {profileUpdatedText}
        </div>
      ) : null}
    </div>

    <div
      className={careerCx(
        "absolute right-1 top-1 flex shrink-0 gap-2 sm:static sm:right-auto sm:top-auto",
        isEditing ? "flex-wrap" : "flex-col items-end"
      )}
    >
      {savedResumeDownloadUrl && (
        <CareerActionButton
          asChild
          actionVariant="secondary"
          className="h-9 gap-1.5 px-3.5 text-[12.5px]"
        >
          <a href={savedResumeDownloadUrl} target="_blank" rel="noreferrer">
            <FileText className="h-3.5 w-3.5 text-beige900/60" />
            View CV
          </a>
        </CareerActionButton>
      )}
      {!isEditing && onEdit ? (
        <CareerActionButton
          type="button"
          actionVariant="secondary"
          onClick={onEdit}
          className="h-9 gap-1.5 px-3.5 text-[12.5px]"
        >
          <Pencil className="h-3.5 w-3.5" />
          수정하기
        </CareerActionButton>
      ) : null}
    </div>
  </section>
);

const ProfileOverviewSection = ({
  isEditing,
  items,
  onInsightChange,
  onSummaryChange,
  summary,
}: {
  isEditing: boolean;
  items: ProfileInsightItem[];
  onInsightChange?: (key: ProfileInsightKey, value: string) => void;
  onSummaryChange?: (value: string) => void;
  summary: string;
}) => (
  <section className="px-1">
    {isEditing || summary ? (
      <div className="mb-7">
        <div className={overviewEyebrowClassName}>Summary</div>
        {isEditing ? (
          <CareerTextarea
            value={summary}
            onChange={(event) => onSummaryChange?.(event.target.value)}
            placeholder="Summary"
            aria-label="Summary"
            className={careerCx(profileEditTextareaClassName, "mt-3")}
          />
        ) : (
          <p className="mt-3 whitespace-pre-line text-[14px] leading-6 text-beige900">
            {summary}
          </p>
        )}
      </div>
    ) : null}

    <div className={overviewEyebrowClassName}>What they are looking for</div>
    <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-[112px_minmax(0,1fr)]">
      {items.map((item) => (
        <React.Fragment key={item.key}>
          <dt
            className={careerCx(
              insightTermClassName,
              isEditing ? "pt-2" : "pt-0.5"
            )}
          >
            {item.label}
          </dt>
          <dd className="m-0">
            {isEditing ? (
              <CareerTextarea
                rows={2}
                value={item.value}
                onChange={(event) =>
                  onInsightChange?.(item.key, event.target.value)
                }
                placeholder="아직 확인 중"
                aria-label={item.label}
                className={careerCx(
                  profileEditTextareaClassName,
                  "min-h-[52px]"
                )}
              />
            ) : (
              <div
                className={careerCx(
                  "text-[14px] leading-6",
                  item.value ? "text-beige900" : "text-beige900/40"
                )}
              >
                {item.value || "아직 확인 중"}
              </div>
            )}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  </section>
);

const TimelineEditBlock = ({
  children,
  kind = "work",
  logoUrl,
  logoAlt,
  logoText,
  isLast,
  onRemove,
  onLogoFileChange,
  logoUploadPending = false,
}: {
  children: React.ReactNode;
  kind?: "work" | "education" | "extra";
  logoUrl?: string | null;
  logoAlt?: string;
  logoText?: string;
  isLast?: boolean;
  onRemove: () => void;
  onLogoFileChange?: (file: File) => void;
  logoUploadPending?: boolean;
}) => {
  const badgeClassName =
    kind === "education"
      ? "bg-beige900/10 text-beige900/60"
      : kind === "extra"
        ? "bg-beige200 text-beige900/60"
        : "bg-beige700/10 text-beige700";

  const badgeLabel =
    kind === "education" ? "Education" : kind === "extra" ? "Extra" : "Work";

  const fallbackLogoText = (logoText ?? logoAlt ?? badgeLabel)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={careerCx(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-beige900/15 via-beige900/10 to-transparent" />
      )}
      <label
        className={careerCx(
          "relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-white bg-beige500 text-[17px] font-semibold leading-none text-beige900/65 shadow-[0_1px_2px_rgba(46,23,6,0.05)]",
          onLogoFileChange &&
            "cursor-pointer transition-transform hover:scale-[1.03]",
          logoUploadPending && "pointer-events-none opacity-75"
        )}
        aria-label={onLogoFileChange ? "로고 이미지 업로드" : undefined}
      >
        {onLogoFileChange ? (
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onLogoFileChange(file);
            }}
          />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center">
          {fallbackLogoText}
        </span>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={logoAlt ?? badgeLabel}
            className="relative h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
        {onLogoFileChange ? (
          <span className="absolute bottom-[-3px] right-[-3px] z-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#22c55e] text-white shadow-[0_2px_7px_rgba(21,128,61,0.28)]">
            {logoUploadPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
          </span>
        ) : null}
      </label>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span
            className={careerCx(
              "rounded-[4px] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
              badgeClassName
            )}
          >
            {badgeLabel}
          </span>
          <ItemRemoveButton onClick={onRemove} />
        </div>
        {children}
      </div>
    </div>
  );
};

const CareerTalentProfilePanel = ({
  className = "",
}: {
  className?: string;
}) => {
  const logCareerEvent = useCareerLogEvent();
  const { fetchWithAuth } = useCareerApi();
  const {
    savedResumeDownloadUrl,
    talentProfile,
    talentInsights,
    talentInsightsUpdatedAt,
    talentInsightsSavePending,
    talentInsightsSaveError,
    hasUnsavedTalentInsightsChanges,
    onTalentInsightsChange,
    onSaveTalentInsights,
    onResetTalentInsights,
    profileSavePending,
    profileSaveError,
    onSaveTalentProfile,
  } = useCareerSidebarContext();
  const { talentUser, talentExperiences, talentEducations, talentExtras } =
    talentProfile;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableTalentProfile>(() =>
    createEditableProfile(talentProfile)
  );
  const [logoUploadPendingKeys, setLogoUploadPendingKeys] = useState<
    Record<string, boolean>
  >({});
  const [logoUploadError, setLogoUploadError] = useState("");
  const [profileImageUploadPending, setProfileImageUploadPending] =
    useState(false);
  const [profileImageError, setProfileImageError] = useState("");

  const mergedExperience = useMemo(
    () => mergeExperienceAndEducation(talentExperiences, talentEducations),
    [talentEducations, talentExperiences]
  );

  const draftMergedExperience = useMemo(
    () =>
      mergeExperienceAndEducation(
        draft.talentExperiences,
        draft.talentEducations
      ),
    [draft.talentEducations, draft.talentExperiences]
  );

  const hasAnyProfileData =
    Boolean(
      talentUser?.name ||
      talentUser?.headline ||
      talentUser?.bio ||
      talentUser?.location
    ) ||
    mergedExperience.length > 0 ||
    talentExtras.length > 0;
  const profileDisplayName = talentUser?.name?.trim() || "Unknown";
  const recruiterProfileCopy = talentUser?.name?.trim()
    ? `채용 담당자가 보는 ${talentUser.name.trim()}의 프로필`
    : "채용 담당자가 보는 프로필";
  const profileUpdatedText = formatLastUpdated(talentInsightsUpdatedAt);
  const lookingForItems = useMemo(
    () =>
      PROFILE_RERANKING_INSIGHTS.map((item) => ({
        ...item,
        value: talentInsights?.[item.key]?.trim() ?? "",
      })),
    [talentInsights]
  );
  const profileSummary = talentUser?.bio?.trim() ?? "";
  const backgroundCount = mergedExperience.length + talentExtras.length;
  const draftBackgroundCount =
    draftMergedExperience.length + draft.talentExtras.length;

  const hasUnsavedChanges = useMemo(() => {
    return (
      JSON.stringify(toComparableProfile(draft)) !==
      JSON.stringify(toComparableProfile(talentProfile))
    );
  }, [draft, talentProfile]);

  const beginEditing = () => {
    logCareerEvent("click_profile_edit");
    setDraft(createEditableProfile(talentProfile));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    logCareerEvent("click_profile_cancel_edit");
    setDraft(createEditableProfile(talentProfile));
    onResetTalentInsights();
    setIsEditing(false);
  };

  const handleSave = async () => {
    logCareerEvent("click_profile_save");
    const profileSaved = hasUnsavedChanges
      ? await onSaveTalentProfile({
          structuredProfile: toStructuredProfile(
            draft,
            talentProfile.talentUser?.user_id ?? null
          ),
        })
      : true;
    const insightsSaved = hasUnsavedTalentInsightsChanges
      ? await onSaveTalentInsights()
      : true;
    const saved = profileSaved && insightsSaved;

    if (saved) {
      setIsEditing(false);
    }
  };

  const updateTalentUserField = (
    field: keyof Omit<CareerTalentUser, "user_id">,
    value: string
  ) => {
    setDraft((current) => ({
      ...current,
      talentUser: {
        ...current.talentUser,
        [field]: value,
      },
    }));
  };

  const applyProfileImageUrl = async (imageUrl: string | null) => {
    setProfileImageError("");

    if (isEditing) {
      updateTalentUserField("profile_picture", imageUrl ?? "");
      return true;
    }

    const nextTalentUser = {
      ...(talentProfile.talentUser ?? createBlankTalentUser()),
      profile_picture: imageUrl,
    };

    return await onSaveTalentProfile({
      structuredProfile: {
        ...talentProfile,
        talentUser: nextTalentUser,
      },
    });
  };

  const uploadProfileImage = async (file: File) => {
    logCareerEvent("click_profile_upload_image");
    if (!file.type.startsWith("image/")) {
      setProfileImageError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileImageError("프로필 이미지는 5MB 이하로 업로드해 주세요.");
      return;
    }

    setProfileImageError("");
    setProfileImageUploadPending(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithAuth("/api/talent/profile/photo/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || typeof payload?.profileImageUrl !== "string") {
        throw new Error(payload?.error ?? "프로필 사진 업로드에 실패했습니다.");
      }

      const saved = await applyProfileImageUrl(payload.profileImageUrl);
      if (!saved) {
        throw new Error("프로필 사진 저장에 실패했습니다.");
      }
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : "프로필 사진 업로드에 실패했습니다."
      );
    } finally {
      setProfileImageUploadPending(false);
    }
  };

  const deleteProfileImage = async () => {
    logCareerEvent("click_profile_delete_image");
    setProfileImageError("");
    setProfileImageUploadPending(true);

    try {
      const saved = await applyProfileImageUrl(null);
      if (!saved) {
        throw new Error("프로필 사진 삭제에 실패했습니다.");
      }
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : "프로필 사진 삭제에 실패했습니다."
      );
    } finally {
      setProfileImageUploadPending(false);
    }
  };

  const updateExperienceField = (
    index: number,
    field: keyof CareerTalentExperience,
    value: string | number | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentExperiences: current.talentExperiences.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const uploadCompanyLogo = async (
    index: number,
    clientKey: string,
    file: File
  ) => {
    logCareerEvent("click_profile_upload_company_logo");
    if (!file.type.startsWith("image/")) {
      setLogoUploadError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoUploadError("로고 이미지는 5MB 이하로 업로드해 주세요.");
      return;
    }

    setLogoUploadError("");
    setLogoUploadPendingKeys((current) => ({
      ...current,
      [clientKey]: true,
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithAuth("/api/talent/profile/logo/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || typeof payload?.logoUrl !== "string") {
        throw new Error(payload?.error ?? "로고 업로드에 실패했습니다.");
      }

      updateExperienceField(index, "company_logo", payload.logoUrl);
    } catch (error) {
      setLogoUploadError(
        error instanceof Error ? error.message : "로고 업로드에 실패했습니다."
      );
    } finally {
      setLogoUploadPendingKeys((current) => {
        const next = { ...current };
        delete next[clientKey];
        return next;
      });
    }
  };

  const updateEducationField = (
    index: number,
    field: keyof CareerTalentEducation,
    value: string | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentEducations: current.talentEducations.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const updateExtraField = (
    index: number,
    field: keyof CareerTalentExtra,
    value: string | null
  ) => {
    setDraft((current) => ({
      ...current,
      talentExtras: current.talentExtras.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const addExperience = () => {
    logCareerEvent("click_profile_add_experience");
    setDraft((current) => ({
      ...current,
      talentExperiences: [
        ...current.talentExperiences,
        {
          id: Date.now(),
          talent_id:
            current.talentUser.user_id ||
            talentProfile.talentUser?.user_id ||
            "",
          role: null,
          description: null,
          employment_type: null,
          start_date: null,
          end_date: null,
          months: null,
          company_name: null,
          company_location: null,
          company_logo: null,
          company_id: null,
          company_link: null,
          memo: null,
          clientKey: createClientKey("exp"),
        },
      ],
    }));
  };

  const addEducation = () => {
    logCareerEvent("click_profile_add_education");
    setDraft((current) => ({
      ...current,
      talentEducations: [
        ...current.talentEducations,
        {
          id: Date.now(),
          talent_id:
            current.talentUser.user_id ||
            talentProfile.talentUser?.user_id ||
            "",
          school: null,
          degree: null,
          description: null,
          field: null,
          start_date: null,
          end_date: null,
          url: null,
          memo: null,
          clientKey: createClientKey("edu"),
        },
      ],
    }));
  };

  const addExtra = () => {
    logCareerEvent("click_profile_add_extra");
    setDraft((current) => ({
      ...current,
      talentExtras: [
        ...current.talentExtras,
        {
          title: null,
          description: null,
          date: null,
          memo: null,
          clientKey: createClientKey("extra"),
        },
      ],
    }));
  };

  const removeExperience = (index: number) => {
    logCareerEvent("click_profile_remove_experience");
    setDraft((current) => ({
      ...current,
      talentExperiences: current.talentExperiences.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  const removeEducation = (index: number) => {
    logCareerEvent("click_profile_remove_education");
    setDraft((current) => ({
      ...current,
      talentEducations: current.talentEducations.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  const removeExtra = (index: number) => {
    logCareerEvent("click_profile_remove_extra");
    setDraft((current) => ({
      ...current,
      talentExtras: current.talentExtras.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }));
  };

  return (
    <div className={careerCx("space-y-5", isEditing && "pb-24", className)}>
      {isEditing && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] right-3 z-50 flex flex-wrap items-center justify-end gap-2 rounded-[12px] bg-beige50/40 p-1 shadow-[0_16px_44px_rgba(46,23,6,0.16)] backdrop-blur md:bottom-5 md:right-5">
          <CareerSecondaryButton
            type="button"
            onClick={cancelEditing}
            disabled={profileSavePending || talentInsightsSavePending}
            className="gap-1.5"
          >
            취소
          </CareerSecondaryButton>
          <CareerPrimaryButton
            type="button"
            onClick={() => void handleSave()}
            disabled={
              profileSavePending ||
              talentInsightsSavePending ||
              (!hasUnsavedChanges && !hasUnsavedTalentInsightsChanges)
            }
            className="gap-1.5"
          >
            <Save className="h-4 w-4" />
            {profileSavePending || talentInsightsSavePending
              ? "저장 중..."
              : "저장하기"}
          </CareerPrimaryButton>
        </div>
      )}

      {profileSaveError && (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {profileSaveError}
        </p>
      )}

      {talentInsightsSaveError && (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {talentInsightsSaveError}
        </p>
      )}

      {logoUploadError && (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {logoUploadError}
        </p>
      )}

      {profileImageError && (
        <p className="rounded-lg border border-beige900/20 bg-beige900/10 px-3 py-2 text-sm text-beige900">
          {profileImageError}
        </p>
      )}

      {isEditing ? (
        <>
          <RecruiterProfileNotice copy={recruiterProfileCopy} />

          <ProfileHeader
            displayName={draft.talentUser.name || "Unknown"}
            isEditing
            onProfileImageDelete={() => void deleteProfileImage()}
            onProfileImageFileChange={(file) => void uploadProfileImage(file)}
            onFieldChange={updateTalentUserField}
            profileUpdatedText={profileUpdatedText}
            profileImageUploadPending={
              profileImageUploadPending || profileSavePending
            }
            savedResumeDownloadUrl={savedResumeDownloadUrl}
            user={draft.talentUser}
          />

          <ProfileSectionHeader
            icon={<Eye className="h-4 w-4" />}
            label="Overview"
          />

          <ProfileOverviewSection
            isEditing
            items={lookingForItems}
            onInsightChange={(key, value) =>
              onTalentInsightsChange((current) => ({
                ...(current ?? {}),
                [key]: value,
              }))
            }
            onSummaryChange={(value) => updateTalentUserField("bio", value)}
            summary={draft.talentUser.bio ?? ""}
          />

          <ProfileSectionHeader
            count={draftBackgroundCount}
            icon={<Building2 className="h-4 w-4" />}
            label="Background"
          />

          <section className="px-1">
            <div className="mb-4 flex flex-wrap gap-2">
              <CareerSecondaryButton
                type="button"
                onClick={addExperience}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                경력 추가
              </CareerSecondaryButton>
              <CareerSecondaryButton
                type="button"
                onClick={addEducation}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                학력 추가
              </CareerSecondaryButton>
              <CareerSecondaryButton
                type="button"
                onClick={addExtra}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                추가 정보
              </CareerSecondaryButton>
            </div>

            {draftBackgroundCount > 0 ? (
              <div className="relative">
                {draftMergedExperience.map((entry, index) => {
                  const isLast =
                    index === draftMergedExperience.length - 1 &&
                    draft.talentExtras.length === 0;

                  if (entry.kind === "exp") {
                    const exp = entry.item;
                    return (
                      <TimelineEditBlock
                        key={exp.clientKey}
                        kind="work"
                        logoUrl={exp.company_logo}
                        logoAlt={exp.company_name ?? exp.role ?? "Company"}
                        logoText={exp.company_name ?? exp.role ?? ""}
                        isLast={isLast}
                        onRemove={() => removeExperience(entry.index)}
                        onLogoFileChange={(file) =>
                          void uploadCompanyLogo(
                            entry.index,
                            exp.clientKey,
                            file
                          )
                        }
                        logoUploadPending={Boolean(
                          logoUploadPendingKeys[exp.clientKey]
                        )}
                      >
                        <div className="space-y-1.5">
                          <CareerTextInput
                            value={exp.role ?? ""}
                            onChange={(event) =>
                              updateExperienceField(
                                entry.index,
                                "role",
                                event.target.value
                              )
                            }
                            placeholder="직무"
                            aria-label="직무"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "text-[14px] font-medium leading-[1.35]"
                            )}
                          />
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-beige900/65">
                            <CareerTextInput
                              value={exp.company_name ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_name",
                                  event.target.value
                                )
                              }
                              placeholder="회사명"
                              aria-label="회사명"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "w-[180px] text-[12.5px] leading-5 text-beige900/65"
                              )}
                            />
                            <span className="text-beige900/25">·</span>
                            <CareerTextInput
                              value={exp.company_location ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_location",
                                  event.target.value
                                )
                              }
                              placeholder="근무 지역"
                              aria-label="근무 지역"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "w-[150px] text-[12.5px] leading-5 text-beige900/65"
                              )}
                            />
                            <span className="text-beige900/25">·</span>
                            <CareerTextInput
                              value={exp.employment_type ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "employment_type",
                                  event.target.value
                                )
                              }
                              placeholder="고용 형태"
                              aria-label="고용 형태"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "w-[120px] text-[12.5px] leading-5 text-beige900/65"
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-5 text-beige900/40">
                            <CareerTextInput
                              value={exp.start_date ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "start_date",
                                  event.target.value
                                )
                              }
                              placeholder="시작일"
                              aria-label="시작일"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "w-[92px] text-[11.5px] leading-5 text-beige900/40"
                              )}
                            />
                            <span>-</span>
                            <CareerTextInput
                              value={exp.end_date ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "end_date",
                                  event.target.value
                                )
                              }
                              placeholder="현재"
                              aria-label="종료일 또는 현재"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "w-[92px] text-[11.5px] leading-5 text-beige900/40"
                              )}
                            />
                            <span className="text-beige900/25">·</span>
                            <span className="rounded-[4px] bg-white/30 px-1.5 py-1 text-[11.5px] leading-5 text-beige900/45">
                              {formatMonth(
                                calculateExperienceMonths(
                                  exp.start_date,
                                  exp.end_date
                                )
                              ) || "기간 자동 계산"}
                            </span>
                            <span className="text-beige900/25">·</span>
                            <CareerTextInput
                              value={exp.company_link ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_link",
                                  event.target.value
                                )
                              }
                              placeholder="회사 링크"
                              aria-label="회사 링크"
                              className={careerCx(
                                profileEditPlainInputClassName,
                                "min-w-[180px] flex-1 text-[11.5px] leading-5 text-beige900/40"
                              )}
                            />
                          </div>
                          <CareerTextarea
                            value={exp.description ?? ""}
                            onChange={(event) =>
                              updateExperienceField(
                                entry.index,
                                "description",
                                event.target.value
                              )
                            }
                            placeholder="주요 업무와 성과"
                            aria-label="주요 업무와 성과"
                            className={careerCx(
                              profileEditPlainTextareaClassName,
                              "mt-2 text-[13px] leading-6 text-beige900/65"
                            )}
                          />
                        </div>
                      </TimelineEditBlock>
                    );
                  }

                  const edu = entry.item;
                  return (
                    <TimelineEditBlock
                      key={edu.clientKey}
                      kind="education"
                      logoText={edu.school ?? "Education"}
                      isLast={isLast}
                      onRemove={() => removeEducation(entry.index)}
                    >
                      <div className="space-y-1.5">
                        <CareerTextInput
                          value={edu.school ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              entry.index,
                              "school",
                              event.target.value
                            )
                          }
                          placeholder="학교명"
                          aria-label="학교명"
                          className={careerCx(
                            profileEditPlainInputClassName,
                            "text-[14px] font-medium leading-[1.35]"
                          )}
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-beige900/65">
                          <CareerTextInput
                            value={edu.field ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "field",
                                event.target.value
                              )
                            }
                            placeholder="전공"
                            aria-label="전공"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "w-[170px] text-[12.5px] leading-5 text-beige900/65"
                            )}
                          />
                          <span className="text-beige900/25">·</span>
                          <CareerTextInput
                            value={edu.degree ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "degree",
                                event.target.value
                              )
                            }
                            placeholder="학위"
                            aria-label="학위"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "w-[150px] text-[12.5px] leading-5 text-beige900/65"
                            )}
                          />
                          <span className="text-beige900/25">·</span>
                          <CareerTextInput
                            value={edu.url ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "url",
                                event.target.value
                              )
                            }
                            placeholder="학교/프로그램 링크"
                            aria-label="학교/프로그램 링크"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "min-w-[180px] flex-1 text-[12.5px] leading-5 text-beige900/65"
                            )}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-5 text-beige900/40">
                          <CareerTextInput
                            value={edu.start_date ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "start_date",
                                event.target.value
                              )
                            }
                            placeholder="시작일"
                            aria-label="시작일"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "w-[92px] text-[11.5px] leading-5 text-beige900/40"
                            )}
                          />
                          <span>-</span>
                          <CareerTextInput
                            value={edu.end_date ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "end_date",
                                event.target.value
                              )
                            }
                            placeholder="종료일"
                            aria-label="종료일"
                            className={careerCx(
                              profileEditPlainInputClassName,
                              "w-[92px] text-[11.5px] leading-5 text-beige900/40"
                            )}
                          />
                        </div>
                        <CareerTextarea
                          value={edu.description ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              entry.index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder="학력 설명"
                          aria-label="학력 설명"
                          className={careerCx(
                            profileEditPlainTextareaClassName,
                            "mt-2 text-[13px] leading-6 text-beige900/65"
                          )}
                        />
                      </div>
                    </TimelineEditBlock>
                  );
                })}

                {draft.talentExtras.map((extra, extraIndex) => (
                  <TimelineEditBlock
                    key={extra.clientKey}
                    kind="extra"
                    logoText={extra.title ?? "Extra"}
                    isLast={extraIndex === draft.talentExtras.length - 1}
                    onRemove={() => removeExtra(extraIndex)}
                  >
                    <div className="space-y-1.5">
                      <CareerTextInput
                        value={extra.title ?? ""}
                        onChange={(event) =>
                          updateExtraField(
                            extraIndex,
                            "title",
                            event.target.value
                          )
                        }
                        placeholder="제목"
                        aria-label="제목"
                        className={careerCx(
                          profileEditPlainInputClassName,
                          "text-[14px] font-medium leading-[1.35]"
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-beige900/65">
                        <CareerTextInput
                          value={extra.date ?? ""}
                          onChange={(event) =>
                            updateExtraField(
                              extraIndex,
                              "date",
                              event.target.value
                            )
                          }
                          placeholder="날짜"
                          aria-label="날짜"
                          className={careerCx(
                            profileEditPlainInputClassName,
                            "w-[160px] text-[12.5px] leading-5 text-beige900/65"
                          )}
                        />
                      </div>
                      <CareerTextarea
                        value={extra.description ?? ""}
                        onChange={(event) =>
                          updateExtraField(
                            extraIndex,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="설명"
                        aria-label="설명"
                        className={careerCx(
                          profileEditPlainTextareaClassName,
                          "mt-2 text-[13px] leading-6 text-beige900/65"
                        )}
                      />
                    </div>
                  </TimelineEditBlock>
                ))}
              </div>
            ) : (
              <EmptyEditState label="경력, 학력, 추가 정보를 추가해 주세요." />
            )}
          </section>
        </>
      ) : hasAnyProfileData ? (
        <>
          <RecruiterProfileNotice copy={recruiterProfileCopy} />

          <ProfileHeader
            displayName={profileDisplayName}
            isEditing={false}
            onEdit={beginEditing}
            onProfileImageDelete={() => void deleteProfileImage()}
            onProfileImageFileChange={(file) => void uploadProfileImage(file)}
            profileUpdatedText={profileUpdatedText}
            profileImageUploadPending={
              profileImageUploadPending || profileSavePending
            }
            savedResumeDownloadUrl={savedResumeDownloadUrl}
            user={talentUser}
          />

          <ProfileSectionHeader
            icon={<Eye className="h-4 w-4" />}
            label="Overview"
          />

          <ProfileOverviewSection
            isEditing={false}
            items={lookingForItems}
            summary={profileSummary}
          />

          {backgroundCount > 0 ? (
            <>
              <ProfileSectionHeader
                count={backgroundCount}
                icon={<Building2 className="h-4 w-4" />}
                label="Background"
              />
              <section className="px-1">
                <div className="relative">
                  {mergedExperience.map((entry, index) => {
                    const isLast =
                      index ===
                      mergedExperience.length + talentExtras.length - 1;

                    if (entry.kind === "exp") {
                      const exp = entry.item;
                      const subtitle = [exp.company_name, exp.company_location]
                        .filter(Boolean)
                        .join(" · ");
                      const meta = [
                        formatRange(exp.start_date, exp.end_date),
                        formatMonth(exp.months),
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <TimelineBlock
                          key={`exp-${exp.id}-${index}`}
                          title={exp.role ?? "Employee"}
                          subtitle={subtitle}
                          meta={meta}
                          description={exp.description ?? ""}
                          memo={exp.memo ?? ""}
                          icon={<Building2 className="h-4 w-4" />}
                          kind="work"
                          logoUrl={exp.company_logo}
                          logoAlt={exp.company_name ?? exp.role ?? "Company"}
                          logoText={exp.company_name ?? exp.role ?? ""}
                          isLast={isLast}
                        />
                      );
                    }

                    const edu = entry.item;

                    return (
                      <TimelineBlock
                        key={`edu-${edu.id}-${index}`}
                        title={edu.school ?? "Student"}
                        subtitle={[edu.field, edu.degree]
                          .filter(Boolean)
                          .join(" · ")}
                        meta={formatRange(edu.start_date, edu.end_date)}
                        description={edu.description ?? ""}
                        memo={edu.memo ?? ""}
                        icon={<SchoolIcon className="h-4 w-4" />}
                        kind="education"
                        logoText={edu.school ?? "Education"}
                        isLast={isLast}
                      />
                    );
                  })}

                  {talentExtras.map((extra, extraIndex) => (
                    <TimelineBlock
                      key={`extra-${extraIndex}-${extra.title ?? "untitled"}`}
                      title={extra.title ?? "기타"}
                      subtitle={extra.date ?? ""}
                      description={extra.description ?? ""}
                      memo={extra.memo ?? ""}
                      icon={<AwardIcon className="h-4 w-4" />}
                      kind="extra"
                      logoText={extra.title ?? "Extra"}
                      isLast={extraIndex === talentExtras.length - 1}
                    />
                  ))}
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : (
        <div className="rounded-[12px] border border-dashed border-beige900/20 bg-white/35 px-5 py-6 text-sm leading-6 text-beige900/60">
          <div>
            아직 저장된 프로필 내용이 없습니다. 수정하기를 눌러 직접 입력할 수
            있습니다.
          </div>
          <CareerActionButton
            type="button"
            actionVariant="secondary"
            onClick={beginEditing}
            className="mt-4 h-11 gap-1.5 px-4 text-[13.5px] md:h-9 md:px-3.5 md:text-[12.5px]"
          >
            <Pencil className="h-3.5 w-3.5" />
            수정하기
          </CareerActionButton>
        </div>
      )}
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
