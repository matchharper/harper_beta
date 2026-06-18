import React, { useMemo, useState, useSyncExternalStore } from "react";
import {
  AwardIcon,
  Building2,
  ChevronDown,
  ChevronUp,
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
import {
  ActionButton,
  PrimaryButton,
  SecondaryButton,
  BareButton,
} from "@/components/ui/button";
import { Input, Input as UiInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import RichText from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";
import {
  INSIGHT_CHECKLIST_ORDER_MAP,
  getInsightLabel,
} from "@/lib/talentOnboarding/insightChecklist";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";

type EditableExperience = CareerTalentExperience & { clientKey: string };
type EditableEducation = CareerTalentEducation & { clientKey: string };
type EditableExtra = CareerTalentExtra & { clientKey: string };

type EditableTalentProfile = {
  talentUser: CareerTalentUser;
  talentExperiences: EditableExperience[];
  talentEducations: EditableEducation[];
  talentExtras: EditableExtra[];
};

type CareerT = ReturnType<typeof useCareerT>;

const getProfileRerankingInsights = (t: CareerT) =>
  [
    {
      key: "next_scope",
      label: t(
        "career.profile.career_talent_profile_panel.1axs5u2",
        "다음 역할"
      ),
    },
    {
      key: "location",
      label: t(
        "career.profile.career_talent_profile_panel.00infjs",
        "근무 지역"
      ),
    },
    {
      key: "compensation",
      label: t("career.profile.career_talent_profile_panel.19jif2e", "보상"),
    },
    {
      key: "must_haves",
      label: t(
        "career.profile.career_talent_profile_panel.06cga7b",
        "필수 조건"
      ),
    },
    {
      key: "deal_breakers",
      label: t(
        "career.profile.career_talent_profile_panel.0qip38b",
        "회피 조건"
      ),
    },
  ] as const;

type ProfileInsightItem = {
  key: string;
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

const formatProfileMonthDate = (
  value: string | null | undefined,
  locale: Locale,
  t: CareerT
) => {
  if (!value || value === "Present") return "";

  if (/^\d{4}-01-01$/.test(value)) {
    return t("career.profile.date.year_only", "{year}년", {
      values: { year: value.slice(0, 4) },
    });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatRange = (
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  locale: Locale,
  t: CareerT
) => {
  const start = formatProfileMonthDate(startDate, locale, t);
  const end = formatProfileMonthDate(endDate, locale, t);
  if (!start && !end) return "";
  if (start && !end)
    return `${start} - ${t("career.profile.date.present", "현재")}`;
  if (!start && end) return end;
  return `${start} - ${end}`;
};

const formatMonth = (
  months: number | null | undefined,
  locale: Locale,
  t: CareerT
) => {
  if (!months || months <= 0) return "";
  const years = Math.floor(months / 12);
  const remain = months % 12;
  if (years > 0 && remain > 0) {
    if (years === 1 && remain === 1) {
      return t(
        "career.profile.duration.year_one_month_one",
        "{years}년 {months}개월",
        { values: { months: remain, years } }
      );
    }
    if (years === 1) {
      return t(
        "career.profile.duration.year_one_month_many",
        "{years}년 {months}개월",
        { values: { months: remain, years } }
      );
    }
    if (remain === 1) {
      return t(
        "career.profile.duration.year_many_month_one",
        "{years}년 {months}개월",
        { values: { months: remain, years } }
      );
    }
    return t(
      "career.profile.duration.year_many_month_many",
      "{years}년 {months}개월",
      { values: { months: remain, years } }
    );
  }
  if (years > 0) {
    if (years === 1) {
      return t(
        "career.profile.duration.year_one_month_zero",
        "{years}년 0개월",
        { values: { years } }
      );
    }
    return t(
      "career.profile.duration.year_many_month_zero",
      "{years}년 0개월",
      { values: { years } }
    );
  }
  if (remain === 1) {
    return t("career.profile.duration.month_one", "{months}개월", {
      values: { months: remain },
    });
  }
  return t("career.profile.duration.month_many", "{months}개월", {
    values: { months: remain },
  });
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

const formatLastUpdated = (value: string | null, locale: Locale) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const createClientKey = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const isLocalhostHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";

const subscribeToLocalhostSnapshot = () => () => {};

const getLocalhostSnapshot = () =>
  typeof window !== "undefined" &&
  isLocalhostHostname(window.location.hostname);

const getServerLocalhostSnapshot = () => false;

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
  const t = useCareerT();

  const badgeClassName =
    kind === "education"
      ? "bg-bg-weak text-neutral-muted"
      : kind === "extra"
        ? "bg-bg-weak text-neutral-muted"
        : "bg-bg-weak text-neutral-muted";
  const badgeLabel =
    kind === "education" ? "Education" : kind === "extra" ? "Extra" : "Work";
  const fallbackLogoText = (logoText ?? logoAlt ?? title)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-neutral-1000-a10 via-neutral-1000-a05 to-transparent" />
      )}
      <div className="relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-bg-default bg-bg-weak text-[17px] font-semibold leading-none text-neutral-muted shadow-sm">
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
            className={cn(
              "rounded-[4px] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]",
              badgeClassName
            )}
          >
            {badgeLabel}
          </span>
          {meta && (
            <span className="text-[11.5px] leading-5 text-neutral-soft">
              {meta}
            </span>
          )}
        </div>
        <div className="text-[14px] font-medium leading-[1.35] text-neutral-primary">
          {title}
        </div>
        {subtitle && (
          <div className="mt-1 text-[12.5px] leading-5 text-neutral-muted">
            {subtitle}
          </div>
        )}
        {description && (
          <RichText
            content={description}
            className="mt-2 text-neutral-muted [&_a]:text-neutral-muted [&_blockquote]:text-[13px] [&_code]:text-[12px] [&_em]:text-neutral-muted [&_li]:text-[13px] [&_ol]:text-[13px] [&_p]:text-[13px] [&_strong]:text-neutral-primary [&_ul]:text-[13px]"
          />
        )}
        {memo && (
          <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-bg-basement px-3.5 py-3">
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-neutral-muted" />
            <div className="min-w-0">
              <div className="mb-1 text-[11px] text-neutral-muted">
                {t(
                  "career.profile.career_talent_profile_panel.1d7d70h",
                  "Harper 메모"
                )}
              </div>
              <div className="text-[13px] leading-5 text-neutral-primary">
                {memo}
              </div>
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
    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-neutral-muted">
      {icon}
    </span>
    <span className="font-halant text-lg leading-none text-neutral-primary">
      {label}
    </span>
    {typeof count === "number" ? (
      <span className="text-[13px] leading-none text-neutral-soft">
        {count}
      </span>
    ) : null}
    <span className="h-px min-w-8 flex-1 bg-neutral-1000-a05" />
  </div>
);

const EmptyEditState = ({ label }: { label: string }) => (
  <div className="rounded-[10px] border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-4 text-sm text-neutral-muted">
    {label}
  </div>
);

const ItemRemoveButton = ({ onClick }: { onClick: () => void }) => {
  const t = useCareerT();

  return (
    <BareButton
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] border border-neutral-1000-a05 bg-bg-floating text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary md:h-8 md:w-8"
      aria-label={t(
        "career.profile.career_talent_profile_panel.18od9kw",
        "항목 삭제"
      )}
    >
      <Trash2 className="h-4 w-4" />
    </BareButton>
  );
};

const profileEditInputClassName =
  "h-11 border-neutral-1000-a10 bg-bg-floating text-base placeholder:text-neutral-placeholder md:h-9 md:text-[13px]";

const profileEditTextareaClassName =
  "min-h-[92px] border-neutral-1000-a10 bg-bg-floating text-base leading-6 placeholder:text-neutral-placeholder md:text-[13px]";

const profileEditPlainInputClassName =
  "h-auto rounded-[4px] border border-neutral-1000-a05 bg-bg-floating px-1.5 py-1 hover:bg-bg-weak focus:border-neutral-1000-a10 focus:bg-bg-floating focus:ring-1 focus:ring-neutral-1000-a05";

const profileEditPlainTextareaClassName =
  "min-h-[74px] rounded-[6px] border border-neutral-1000-a05 bg-bg-floating px-1.5 py-1.5 hover:bg-bg-weak focus:border-neutral-1000-a10 focus:bg-bg-floating focus:ring-1 focus:ring-neutral-1000-a05";

const profileNoticeClassName =
  "flex items-center gap-2.5 rounded-[14px] border border-neutral-1000-a05 bg-linear-to-br from-bg-basement to-bg-default px-3.5 py-2.5 text-[12.5px] leading-5 text-neutral-muted";

const overviewEyebrowClassName = "text-[13px] font-medium text-neutral-muted";

const insightTermClassName = "text-[13px] font-medium text-neutral-muted";

const RecruiterProfileNotice = ({ copy }: { copy: string }) => {
  const t = useCareerT();

  return (
    <div className={profileNoticeClassName}>
      <Eye className="h-3.5 w-3.5 shrink-0 text-neutral-muted" />
      <div>
        <strong className="font-medium text-neutral-primary">{copy}</strong>
        <span>
          {t(
            "career.profile.career_talent_profile_panel.0rfzx4s",
            "· 연결이 성사된 회사에만 공유돼요"
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
            aria-label={t(
              "career.profile.career_talent_profile_panel.05hwq9n",
              "프로필 사진 메뉴"
            )}
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

const ProfileHeader = ({
  displayName,
  isEditing,
  locale,
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
  locale: Locale;
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
}) => {
  const t = useCareerT();

  return (
    <section
      className={cn(
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
            <Input
              value={user?.name ?? ""}
              onChange={(event) => onFieldChange?.("name", event.target.value)}
              placeholder={t("career.onboarding.onboarding.1wh5aat", "이름")}
              aria-label={t("career.onboarding.onboarding.1wh5aat", "이름")}
              className={cn(
                profileEditInputClassName,
                "h-10 max-w-[360px] font-hedvig text-[24px]"
              )}
            />
          ) : (
            <h2 className="font-hedvig text-[24px] leading-none text-neutral-primary">
              {displayName}
            </h2>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-weak px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] text-neutral-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
            Active
          </span>
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
              aria-label={t(
                "career.profile.career_talent_profile_panel.0tgcq59",
                "한 줄 소개"
              )}
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
              aria-label={t(
                "career.profile.career_talent_profile_panel.0csjlpy",
                "지역"
              )}
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
                {locale === "en"
                  ? user.location
                  : locationEnToKo(user.location)}
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
      </div>

      <div
        className={cn(
          "absolute right-1 top-1 flex shrink-0 gap-2 sm:static sm:right-auto sm:top-auto",
          isEditing ? "flex-wrap" : "flex-col items-end"
        )}
      >
        {savedResumeDownloadUrl && (
          <ActionButton
            asChild
            actionVariant="secondary"
            className="h-9 gap-1.5 px-3.5 text-[12.5px]"
          >
            <a href={savedResumeDownloadUrl} target="_blank" rel="noreferrer">
              <FileText className="h-3.5 w-3.5 text-neutral-muted" />
              View CV
            </a>
          </ActionButton>
        )}
        {!isEditing && onEdit ? (
          <ActionButton
            type="button"
            actionVariant="secondary"
            onClick={onEdit}
            className="h-9 gap-1.5 px-3.5 text-[12.5px]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t(
              "career.profile.career_talent_profile_panel.1iq5xym",
              "수정하기"
            )}
          </ActionButton>
        ) : null}
      </div>
    </section>
  );
};

const ProfileOverviewSection = ({
  allItems,
  isEditing,
  items,
  onInsightChange,
  onSummaryChange,
  showAllInsightsButton = false,
  summary,
}: {
  allItems?: ProfileInsightItem[];
  isEditing: boolean;
  items: ProfileInsightItem[];
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
              className={cn(profileEditTextareaClassName, "mt-3")}
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
                  className={cn(profileEditTextareaClassName, "min-h-[52px]")}
                />
              ) : (
                <div
                  className={cn(
                    "text-[14px] leading-6",
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
        <BareButton
          type="button"
          onClick={() => setShowAllInsights((current) => !current)}
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-3 text-[12px] font-medium text-neutral-muted transition-colors hover:border-neutral-400 hover:bg-bg-weak hover:text-neutral-primary"
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
        </BareButton>
      ) : null}
    </section>
  );
};

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
  const t = useCareerT();

  const badgeClassName =
    kind === "education"
      ? "bg-bg-weak text-neutral-muted"
      : kind === "extra"
        ? "bg-bg-weak text-neutral-muted"
        : "bg-bg-weak text-neutral-muted";

  const badgeLabel =
    kind === "education" ? "Education" : kind === "extra" ? "Extra" : "Work";

  const fallbackLogoText = (logoText ?? logoAlt ?? badgeLabel)
    .trim()
    .slice(0, 1)
    .toUpperCase();

  return (
    <div
      className={cn(
        "relative grid grid-cols-[40px_minmax(0,1fr)] gap-4 py-3 first:pt-0 last:pb-0",
        !isLast && "pb-5"
      )}
    >
      {!isLast && (
        <div className="absolute bottom-[-8px] left-[19px] top-[46px] w-px bg-linear-to-b from-neutral-1000-a10 via-neutral-1000-a05 to-transparent" />
      )}
      <label
        className={cn(
          "relative z-1 flex h-10 w-10 items-center justify-center overflow-hidden rounded-[10px] border-2 border-bg-default bg-bg-weak text-[17px] font-semibold leading-none text-neutral-muted",
          onLogoFileChange &&
            "cursor-pointer transition-transform hover:scale-[1.03]",
          logoUploadPending && "pointer-events-none opacity-75"
        )}
        aria-label={
          onLogoFileChange
            ? t(
                "career.profile.career_talent_profile_panel.0a2iqu6",
                "로고 이미지 업로드"
              )
            : undefined
        }
      >
        {onLogoFileChange ? (
          <UiInput
            unstyled
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
          <span className="absolute bottom-[-3px] right-[-3px] z-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-bg-default bg-positive text-neutral-00">
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
            className={cn(
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
  const t = useCareerT();

  const { locale } = useMessages();
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
  const isLocalhost = useSyncExternalStore(
    subscribeToLocalhostSnapshot,
    getLocalhostSnapshot,
    getServerLocalhostSnapshot
  );

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
  const recruiterProfileName = talentUser?.name?.trim();
  const recruiterProfileCopy = recruiterProfileName
    ? t(
        "career.profile.recruiter_profile.named",
        "채용 담당자가 보는 {name}의 프로필",
        { values: { name: recruiterProfileName } }
      )
    : t(
        "career.profile.recruiter_profile.default",
        "채용 담당자가 보는 프로필"
      );
  const profileUpdatedText = formatLastUpdated(talentInsightsUpdatedAt, locale);
  const lookingForItems = useMemo(
    () =>
      getProfileRerankingInsights(t).map((item) => ({
        ...item,
        value: talentInsights?.[item.key]?.trim() ?? "",
      })),
    [talentInsights, t]
  );
  const allInsightItems = useMemo(
    () =>
      Object.entries(talentInsights ?? {})
        .map(([key, value]) => ({
          key,
          label: getInsightLabel(key),
          value: value.trim(),
        }))
        .filter((item) => item.value)
        .sort(
          (left, right) =>
            (INSIGHT_CHECKLIST_ORDER_MAP.get(left.key) ?? 999) -
              (INSIGHT_CHECKLIST_ORDER_MAP.get(right.key) ?? 999) ||
            left.label.localeCompare(right.label) ||
            left.key.localeCompare(right.key)
        ),
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
      setProfileImageError(
        t(
          "career.profile.career_talent_profile_panel.0anxi5z",
          "이미지 파일만 업로드할 수 있습니다."
        )
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileImageError(
        t(
          "career.profile.career_talent_profile_panel.1dup23s",
          "프로필 이미지는 5MB 이하로 업로드해 주세요."
        )
      );
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
        throw new Error(
          payload?.error ??
            t(
              "career.profile.career_talent_profile_panel.1gsvvpp",
              "프로필 사진 업로드에 실패했습니다."
            )
        );
      }

      const saved = await applyProfileImageUrl(payload.profileImageUrl);
      if (!saved) {
        throw new Error(
          t(
            "career.profile.career_talent_profile_panel.0seo81b",
            "프로필 사진 저장에 실패했습니다."
          )
        );
      }
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.career_talent_profile_panel.1gsvvpp",
              "프로필 사진 업로드에 실패했습니다."
            )
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
        throw new Error(
          t(
            "career.profile.career_talent_profile_panel.0tc2iu5",
            "프로필 사진 삭제에 실패했습니다."
          )
        );
      }
    } catch (error) {
      setProfileImageError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.career_talent_profile_panel.0tc2iu5",
              "프로필 사진 삭제에 실패했습니다."
            )
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
      setLogoUploadError(
        t(
          "career.profile.career_talent_profile_panel.0anxi5z",
          "이미지 파일만 업로드할 수 있습니다."
        )
      );
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLogoUploadError(
        t(
          "career.profile.career_talent_profile_panel.04441vu",
          "로고 이미지는 5MB 이하로 업로드해 주세요."
        )
      );
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
        throw new Error(
          payload?.error ??
            t(
              "career.profile.career_talent_profile_panel.0acdx91",
              "로고 업로드에 실패했습니다."
            )
        );
      }

      updateExperienceField(index, "company_logo", payload.logoUrl);
    } catch (error) {
      setLogoUploadError(
        error instanceof Error
          ? error.message
          : t(
              "career.profile.career_talent_profile_panel.0acdx91",
              "로고 업로드에 실패했습니다."
            )
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
    <div className={cn("space-y-5", isEditing && "pb-24", className)}>
      {isEditing && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+104px)] right-3 z-50 flex flex-wrap items-center justify-end gap-2 rounded-[12px] border border-neutral-1000-a05 bg-bg-floating/90 p-1 shadow-[0_16px_44px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)] backdrop-blur md:bottom-5 md:right-5">
          <SecondaryButton
            type="button"
            onClick={cancelEditing}
            disabled={profileSavePending || talentInsightsSavePending}
            className="gap-1.5"
          >
            {t("career.settings.career_settings_modal.0jiry9t", "취소")}
          </SecondaryButton>
          <PrimaryButton
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
              ? t(
                  "career.profile.career_profile_settings_section.08zy6at",
                  "저장 중..."
                )
              : t(
                  "career.profile.career_talent_profile_panel.0x4dx7a",
                  "저장하기"
                )}
          </PrimaryButton>
        </div>
      )}

      {profileSaveError && (
        <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
          {profileSaveError}
        </p>
      )}

      {talentInsightsSaveError && (
        <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
          {talentInsightsSaveError}
        </p>
      )}

      {logoUploadError && (
        <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
          {logoUploadError}
        </p>
      )}

      {profileImageError && (
        <p className="rounded-lg border border-critical/30 bg-critical-faded px-3 py-2 text-sm text-critical">
          {profileImageError}
        </p>
      )}

      {isEditing ? (
        <>
          <RecruiterProfileNotice copy={recruiterProfileCopy} />

          <ProfileHeader
            displayName={draft.talentUser.name || "Unknown"}
            isEditing
            locale={locale}
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
            allItems={allInsightItems}
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
              <SecondaryButton
                type="button"
                onClick={addExperience}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.0efzyx5",
                  "경력 추가"
                )}
              </SecondaryButton>
              <SecondaryButton
                type="button"
                onClick={addEducation}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.1efofsl",
                  "학력 추가"
                )}
              </SecondaryButton>
              <SecondaryButton
                type="button"
                onClick={addExtra}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-8 md:px-3 md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.0wjximy",
                  "추가 정보"
                )}
              </SecondaryButton>
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
                          <Input
                            value={exp.role ?? ""}
                            onChange={(event) =>
                              updateExperienceField(
                                entry.index,
                                "role",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.1qnltk8",
                              "직무"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.1qnltk8",
                              "직무"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "text-[14px] font-medium leading-[1.35]"
                            )}
                          />
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-neutral-muted">
                            <Input
                              value={exp.company_name ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_name",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.0uwqvnk",
                                "회사명"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.0uwqvnk",
                                "회사명"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[180px] text-[12.5px] leading-5 text-neutral-muted"
                              )}
                            />
                            <span className="text-neutral-1000-a10">·</span>
                            <Input
                              value={exp.company_location ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_location",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.00infjs",
                                "근무 지역"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.00infjs",
                                "근무 지역"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[150px] text-[12.5px] leading-5 text-neutral-muted"
                              )}
                            />
                            <span className="text-neutral-1000-a10">·</span>
                            <Input
                              value={exp.employment_type ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "employment_type",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.0rtdf2n",
                                "고용 형태"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.0rtdf2n",
                                "고용 형태"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[120px] text-[12.5px] leading-5 text-neutral-muted"
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-5 text-neutral-soft">
                            <Input
                              value={exp.start_date ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "start_date",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.11cor6u",
                                "시작일"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.11cor6u",
                                "시작일"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[92px] text-[11.5px] leading-5 text-neutral-soft"
                              )}
                            />
                            <span>-</span>
                            <Input
                              value={exp.end_date ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "end_date",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.0p5h1wt",
                                "현재"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.1iegi7w",
                                "종료일 또는 현재"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[92px] text-[11.5px] leading-5 text-neutral-soft"
                              )}
                            />
                            <span className="text-neutral-1000-a10">·</span>
                            <span className="rounded-[4px] bg-bg-weak px-1.5 py-1 text-[11.5px] leading-5 text-neutral-soft">
                              {formatMonth(
                                calculateExperienceMonths(
                                  exp.start_date,
                                  exp.end_date
                                ),
                                locale,
                                t
                              ) ||
                                t(
                                  "career.profile.career_talent_profile_panel.1u4ajdw",
                                  "기간 자동 계산"
                                )}
                            </span>
                            <span className="text-neutral-1000-a10">·</span>
                            <Input
                              value={exp.company_link ?? ""}
                              onChange={(event) =>
                                updateExperienceField(
                                  entry.index,
                                  "company_link",
                                  event.target.value
                                )
                              }
                              placeholder={t(
                                "career.profile.career_talent_profile_panel.07x414y",
                                "회사 링크"
                              )}
                              aria-label={t(
                                "career.profile.career_talent_profile_panel.07x414y",
                                "회사 링크"
                              )}
                              className={cn(
                                profileEditPlainInputClassName,
                                "min-w-[180px] flex-1 text-[11.5px] leading-5 text-neutral-soft"
                              )}
                            />
                          </div>
                          <Textarea
                            value={exp.description ?? ""}
                            onChange={(event) =>
                              updateExperienceField(
                                entry.index,
                                "description",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.051qjyj",
                              "주요 업무와 성과"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.051qjyj",
                              "주요 업무와 성과"
                            )}
                            className={cn(
                              profileEditPlainTextareaClassName,
                              "mt-2 text-[13px] leading-6 text-neutral-muted"
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
                        <Input
                          value={edu.school ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              entry.index,
                              "school",
                              event.target.value
                            )
                          }
                          placeholder={t(
                            "career.profile.career_talent_profile_panel.1afhauj",
                            "학교명"
                          )}
                          aria-label={t(
                            "career.profile.career_talent_profile_panel.1afhauj",
                            "학교명"
                          )}
                          className={cn(
                            profileEditPlainInputClassName,
                            "text-[14px] font-medium leading-[1.35]"
                          )}
                        />
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-neutral-muted">
                          <Input
                            value={edu.field ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "field",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.06x2f2q",
                              "전공"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.06x2f2q",
                              "전공"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[170px] text-[12.5px] leading-5 text-neutral-muted"
                            )}
                          />
                          <span className="text-neutral-1000-a10">·</span>
                          <Input
                            value={edu.degree ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "degree",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.0a7k434",
                              "학위"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.0a7k434",
                              "학위"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[150px] text-[12.5px] leading-5 text-neutral-muted"
                            )}
                          />
                          <span className="text-neutral-1000-a10">·</span>
                          <Input
                            value={edu.url ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "url",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.1ywstxy",
                              "학교/프로그램 링크"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.1ywstxy",
                              "학교/프로그램 링크"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "min-w-[180px] flex-1 text-[12.5px] leading-5 text-neutral-muted"
                            )}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] leading-5 text-neutral-soft">
                          <Input
                            value={edu.start_date ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "start_date",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.11cor6u",
                              "시작일"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.11cor6u",
                              "시작일"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[92px] text-[11.5px] leading-5 text-neutral-soft"
                            )}
                          />
                          <span>-</span>
                          <Input
                            value={edu.end_date ?? ""}
                            onChange={(event) =>
                              updateEducationField(
                                entry.index,
                                "end_date",
                                event.target.value
                              )
                            }
                            placeholder={t(
                              "career.profile.career_talent_profile_panel.13a39zc",
                              "종료일"
                            )}
                            aria-label={t(
                              "career.profile.career_talent_profile_panel.13a39zc",
                              "종료일"
                            )}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[92px] text-[11.5px] leading-5 text-neutral-soft"
                            )}
                          />
                        </div>
                        <Textarea
                          value={edu.description ?? ""}
                          onChange={(event) =>
                            updateEducationField(
                              entry.index,
                              "description",
                              event.target.value
                            )
                          }
                          placeholder={t(
                            "career.profile.career_talent_profile_panel.1trcux2",
                            "학력 설명"
                          )}
                          aria-label={t(
                            "career.profile.career_talent_profile_panel.1trcux2",
                            "학력 설명"
                          )}
                          className={cn(
                            profileEditPlainTextareaClassName,
                            "mt-2 text-[13px] leading-6 text-neutral-muted"
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
                      <Input
                        value={extra.title ?? ""}
                        onChange={(event) =>
                          updateExtraField(
                            extraIndex,
                            "title",
                            event.target.value
                          )
                        }
                        placeholder={t(
                          "career.profile.career_talent_profile_panel.1ub2ks6",
                          "제목"
                        )}
                        aria-label={t(
                          "career.profile.career_talent_profile_panel.1ub2ks6",
                          "제목"
                        )}
                        className={cn(
                          profileEditPlainInputClassName,
                          "text-[14px] font-medium leading-[1.35]"
                        )}
                      />
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] leading-5 text-neutral-muted">
                        <Input
                          value={extra.date ?? ""}
                          onChange={(event) =>
                            updateExtraField(
                              extraIndex,
                              "date",
                              event.target.value
                            )
                          }
                          placeholder={t(
                            "career.profile.career_talent_profile_panel.1pzl6hl",
                            "날짜"
                          )}
                          aria-label={t(
                            "career.profile.career_talent_profile_panel.1pzl6hl",
                            "날짜"
                          )}
                          className={cn(
                            profileEditPlainInputClassName,
                            "w-[160px] text-[12.5px] leading-5 text-neutral-muted"
                          )}
                        />
                      </div>
                      <Textarea
                        value={extra.description ?? ""}
                        onChange={(event) =>
                          updateExtraField(
                            extraIndex,
                            "description",
                            event.target.value
                          )
                        }
                        placeholder={t(
                          "career.profile.career_talent_profile_panel.07tjd6q",
                          "설명"
                        )}
                        aria-label={t(
                          "career.profile.career_talent_profile_panel.07tjd6q",
                          "설명"
                        )}
                        className={cn(
                          profileEditPlainTextareaClassName,
                          "mt-2 text-[13px] leading-6 text-neutral-muted"
                        )}
                      />
                    </div>
                  </TimelineEditBlock>
                ))}
              </div>
            ) : (
              <EmptyEditState
                label={t(
                  "career.profile.career_talent_profile_panel.0x0us78",
                  "경력, 학력, 추가 정보를 추가해 주세요."
                )}
              />
            )}
          </section>
        </>
      ) : hasAnyProfileData ? (
        <>
          <RecruiterProfileNotice copy={recruiterProfileCopy} />

          <ProfileHeader
            displayName={profileDisplayName}
            isEditing={false}
            locale={locale}
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
            allItems={allInsightItems}
            isEditing={false}
            items={lookingForItems}
            showAllInsightsButton={isLocalhost}
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
                        formatRange(exp.start_date, exp.end_date, locale, t),
                        formatMonth(exp.months, locale, t),
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
                        meta={formatRange(
                          edu.start_date,
                          edu.end_date,
                          locale,
                          t
                        )}
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
                      title={
                        extra.title ??
                        t(
                          "career.profile.career_talent_profile_panel.1syy18d",
                          "기타"
                        )
                      }
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
        <div className="rounded-[12px] border border-dashed border-neutral-1000-a10 bg-bg-floating px-5 py-6 text-sm leading-6 text-neutral-muted shadow-sm">
          <div>
            {t(
              "career.profile.career_talent_profile_panel.0q45tnt",
              "아직 저장된 프로필 내용이 없습니다. 수정하기를 눌러 직접 입력할 수 있습니다."
            )}
          </div>
          <ActionButton
            type="button"
            actionVariant="secondary"
            onClick={beginEditing}
            className="mt-4 h-11 gap-1.5 px-4 text-[13.5px] md:h-9 md:px-3.5 md:text-[12.5px]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t(
              "career.profile.career_talent_profile_panel.1iq5xym",
              "수정하기"
            )}
          </ActionButton>
        </div>
      )}
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
