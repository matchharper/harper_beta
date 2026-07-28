import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AwardIcon,
  Building2,
  Eye,
  Pencil,
  Plus,
  SchoolIcon,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/router";
import { useCareerSidebarContext } from "../CareerSidebarContext";
import type {
  CareerTalentEducation,
  CareerTalentExperience,
  CareerTalentExtra,
  CareerTalentProfile,
  CareerTalentUser,
} from "../types";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { cn } from "@/lib/utils";
import {
  INSIGHT_CHECKLIST_ORDER_MAP,
  getInsightLabel,
} from "@/lib/talentOnboarding/insightChecklist";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { useCareerMobileChatLauncherVisibility } from "@/components/career/mobile/CareerMobileChatLauncherVisibilityContext";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import {
  ProfileHeader,
  ProfileOverviewSection,
  RecruiterProfileNotice,
} from "./CareerProfileOverview";
import CareerProfileEntryModal, {
  type CareerProfileEntryFormValues,
  type CareerProfileEntryKind,
} from "./CareerProfileEntryModal";
import CareerProfilePersonalInfo from "./CareerProfilePersonalInfo";
import CareerEmailChangeModal from "../account/CareerEmailChangeModal";
import {
  EmptyEditState,
  ProfileSectionHeader,
  TimelineBlock,
  TimelineEditBlock,
  profileEditPlainInputClassName,
  profileEditPlainTextareaClassName,
} from "./CareerProfileTimeline";

type EditableExperience = CareerTalentExperience & { clientKey: string };
type EditableEducation = CareerTalentEducation & { clientKey: string };
type EditableExtra = CareerTalentExtra & { clientKey: string };

type EditableTalentProfile = {
  talentUser: CareerTalentUser;
  talentExperiences: EditableExperience[];
  talentEducations: EditableEducation[];
  talentExtras: EditableExtra[];
};

type PendingProfileEntryRemoval = {
  index: number;
  kind: CareerProfileEntryKind;
  label: string;
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

const createBlankTalentUser = (
  userId?: string | null,
  email?: string | null
): CareerTalentUser => ({
  user_id: userId ?? "",
  email: email ?? null,
  phone_number: null,
  name: null,
  profile_picture: null,
  headline: null,
  bio: null,
  location: null,
});

const createEditableProfile = (
  profile: CareerTalentProfile,
  fallbackEmail?: string | null
): EditableTalentProfile => ({
  talentUser: profile.talentUser
    ? {
        ...profile.talentUser,
        email: profile.talentUser.email ?? fallbackEmail ?? null,
      }
    : createBlankTalentUser(undefined, fallbackEmail),
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
    phone_number: trimSingleLine(profile.talentUser?.phone_number),
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
    email: trimSingleLine(draft.talentUser.email),
    phone_number: trimSingleLine(draft.talentUser.phone_number),
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

const CareerTalentProfilePanel = ({
  className = "",
}: {
  className?: string;
}) => {
  const t = useCareerT();

  const { locale } = useMessages();
  const logCareerEvent = useCareerLogEvent();
  const router = useRouter();
  const { fetchWithAuth } = useCareerApi();
  const { setChatLauncherHidden } = useCareerMobileChatLauncherVisibility();
  const {
    user,
    savedProfileLinks,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
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
    onUpdateAccountProfile,
  } = useCareerSidebarContext();
  const { talentUser, talentExperiences, talentEducations, talentExtras } =
    talentProfile;
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<EditableTalentProfile>(() =>
    createEditableProfile(talentProfile, user?.email)
  );
  const [logoUploadPendingKeys, setLogoUploadPendingKeys] = useState<
    Record<string, boolean>
  >({});
  const [logoUploadError, setLogoUploadError] = useState("");
  const [profileImageUploadPending, setProfileImageUploadPending] =
    useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  const [entryModalKind, setEntryModalKind] =
    useState<CareerProfileEntryKind | null>(null);
  const [pendingRemoval, setPendingRemoval] =
    useState<PendingProfileEntryRemoval | null>(null);
  const [phoneNumberModalOpen, setPhoneNumberModalOpen] = useState(false);
  const [emailChangeModalOpen, setEmailChangeModalOpen] = useState(false);
  const isLocalhost = useSyncExternalStore(
    subscribeToLocalhostSnapshot,
    getLocalhostSnapshot,
    getServerLocalhostSnapshot
  );

  useEffect(() => {
    setChatLauncherHidden(isEditing);

    return () => {
      setChatLauncherHidden(false);
    };
  }, [isEditing, setChatLauncherHidden]);

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
  const personalInfoUser = isEditing
    ? {
        ...draft.talentUser,
        email: user?.email ?? draft.talentUser.email ?? null,
      }
    : talentUser
      ? {
          ...talentUser,
          email: user?.email ?? talentUser.email ?? null,
        }
      : createBlankTalentUser(user?.id, user?.email);

  const hasUnsavedChanges = useMemo(() => {
    return (
      JSON.stringify(toComparableProfile(draft)) !==
      JSON.stringify(toComparableProfile(talentProfile))
    );
  }, [draft, talentProfile]);

  const beginEditing = () => {
    logCareerEvent("click_profile_edit");
    setDraft(createEditableProfile(talentProfile, user?.email));
    setIsEditing(true);
  };

  const openProfileSources = () => {
    logCareerEvent("click_profile_header_source_icon");
    void router.push("/career/profile?profileSection=links");
  };

  const cancelEditing = () => {
    logCareerEvent("click_profile_cancel_edit");
    setDraft(createEditableProfile(talentProfile, user?.email));
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

  const openPhoneNumberModal = () => {
    logCareerEvent("click_profile_phone_number");
    if (!isEditing) beginEditing();
    setPhoneNumberModalOpen(true);
  };

  const openEmailChangeModal = () => {
    logCareerEvent("click_profile_email");
    setEmailChangeModalOpen(true);
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

  const openEntryModal = (kind: CareerProfileEntryKind) => {
    if (kind === "work") {
      logCareerEvent("click_profile_add_experience");
    } else if (kind === "education") {
      logCareerEvent("click_profile_add_education");
    } else {
      logCareerEvent("click_profile_add_extra");
    }
    setEntryModalKind(kind);
  };

  const addExperience = () => openEntryModal("work");
  const addEducation = () => openEntryModal("education");
  const addExtra = () => openEntryModal("extra");

  const getTalentId = () =>
    draft.talentUser.user_id ||
    talentProfile.talentUser?.user_id ||
    talentProfile.talentExperiences[0]?.talent_id ||
    talentProfile.talentEducations[0]?.talent_id ||
    "";

  const handleAddEntry = async (
    kind: CareerProfileEntryKind,
    values: CareerProfileEntryFormValues
  ) => {
    const talentId = getTalentId();

    if (kind === "work") {
      const experience: CareerTalentExperience = {
        id: Date.now(),
        talent_id: talentId,
        role: trimSingleLine(values.role),
        description: trimMultiline(values.description),
        employment_type: trimSingleLine(values.employmentType),
        start_date: trimDateText(values.startDate),
        end_date: trimDateText(values.endDate),
        months: calculateExperienceMonths(values.startDate, values.endDate),
        company_id: null,
        company_link: null,
        company_name: trimSingleLine(values.companyName),
        company_location: trimSingleLine(values.companyLocation),
        company_logo: null,
        memo: null,
      };

      if (isEditing) {
        setDraft((current) => ({
          ...current,
          talentExperiences: [
            ...current.talentExperiences,
            {
              ...experience,
              clientKey: createClientKey("exp"),
            },
          ],
        }));
        return true;
      }

      return await onSaveTalentProfile({
        structuredProfile: {
          ...talentProfile,
          talentExperiences: [...talentProfile.talentExperiences, experience],
        },
      });
    }

    if (kind === "education") {
      const education: CareerTalentEducation = {
        id: Date.now(),
        talent_id: talentId,
        school: trimSingleLine(values.school),
        degree: trimSingleLine(values.degree),
        description: trimMultiline(values.description),
        field: trimSingleLine(values.field),
        start_date: trimDateText(values.startDate),
        end_date: trimDateText(values.endDate),
        url: trimSingleLine(values.url),
        memo: null,
      };

      if (isEditing) {
        setDraft((current) => ({
          ...current,
          talentEducations: [
            ...current.talentEducations,
            {
              ...education,
              clientKey: createClientKey("edu"),
            },
          ],
        }));
        return true;
      }

      return await onSaveTalentProfile({
        structuredProfile: {
          ...talentProfile,
          talentEducations: [...talentProfile.talentEducations, education],
        },
      });
    }

    const extra: CareerTalentExtra = {
      title: trimSingleLine(values.title),
      description: trimMultiline(values.description),
      date: trimDateText(values.date),
      memo: null,
    };

    if (isEditing) {
      setDraft((current) => ({
        ...current,
        talentExtras: [
          ...current.talentExtras,
          {
            ...extra,
            clientKey: createClientKey("extra"),
          },
        ],
      }));
      return true;
    }

    return await onSaveTalentProfile({
      structuredProfile: {
        ...talentProfile,
        talentExtras: [...talentProfile.talentExtras, extra],
      },
    });
  };

  const requestRemoveExperience = (index: number) => {
    logCareerEvent("click_profile_remove_experience");
    const experience = draft.talentExperiences[index];
    setPendingRemoval({
      index,
      kind: "work",
      label:
        trimSingleLine(experience?.role) ??
        trimSingleLine(experience?.company_name) ??
        t("career.profile.career_talent_profile_panel.0efzyx5", "경력 추가"),
    });
  };

  const requestRemoveEducation = (index: number) => {
    logCareerEvent("click_profile_remove_education");
    const education = draft.talentEducations[index];
    setPendingRemoval({
      index,
      kind: "education",
      label:
        trimSingleLine(education?.school) ??
        t("career.profile.career_talent_profile_panel.1efofsl", "학력 추가"),
    });
  };

  const requestRemoveExtra = (index: number) => {
    logCareerEvent("click_profile_remove_extra");
    const extra = draft.talentExtras[index];
    setPendingRemoval({
      index,
      kind: "extra",
      label:
        trimSingleLine(extra?.title) ??
        t("career.profile.career_talent_profile_panel.0wjximy", "추가 정보"),
    });
  };

  const confirmRemoveEntry = () => {
    if (!pendingRemoval) return;

    setDraft((current) => ({
      ...current,
      talentExperiences:
        pendingRemoval.kind === "work"
          ? current.talentExperiences.filter(
              (_, itemIndex) => itemIndex !== pendingRemoval.index
            )
          : current.talentExperiences,
      talentEducations:
        pendingRemoval.kind === "education"
          ? current.talentEducations.filter(
              (_, itemIndex) => itemIndex !== pendingRemoval.index
            )
          : current.talentEducations,
      talentExtras:
        pendingRemoval.kind === "extra"
          ? current.talentExtras.filter(
              (_, itemIndex) => itemIndex !== pendingRemoval.index
            )
          : current.talentExtras,
    }));
    setPendingRemoval(null);
  };

  return (
    <div
      className={cn(
        "space-y-5 relative",
        isEditing && "pb-24 md:pb-0",
        className
      )}
    >
      {isEditing && (
        <div
          role="toolbar"
          className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-40 !mt-0 flex items-center justify-end gap-2 md:sticky md:inset-x-auto md:bottom-auto md:top-2 md:z-20 md:ml-auto md:w-fit"
        >
          <MuteButton
            type="button"
            size="lg"
            onClick={cancelEditing}
            disabled={profileSavePending || talentInsightsSavePending}
          >
            {t("career.settings.career_settings_modal.0jiry9t", "취소")}
          </MuteButton>
          <MuteButton
            type="button"
            size="lg"
            variant="dark"
            onClick={() => void handleSave()}
            disabled={
              profileSavePending ||
              talentInsightsSavePending ||
              (!hasUnsavedChanges && !hasUnsavedTalentInsightsChanges)
            }
          >
            {profileSavePending || talentInsightsSavePending
              ? t(
                  "career.profile.career_profile_settings_section.08zy6at",
                  "저장 중..."
                )
              : t(
                  "career.profile.career_talent_profile_panel.0x4dx7a",
                  "저장하기"
                )}
          </MuteButton>
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

      {/* <CareerProfilePersonalInfo
        isEditing={isEditing}
        onEdit={beginEditing}
        onFieldChange={(field, value) => updateTalentUserField(field, value)}
        onOpenEmailChangeModal={openEmailChangeModal}
        onOpenPhoneNumberModal={openPhoneNumberModal}
        user={personalInfoUser}
      /> */}

      <div className="flex flex-col items-start justify-start gap-3 pt-3 w-full">
        <div className="flex items-center text-[15px] font-medium leading-4 text-neutral-primary">
          {t("career.common.career_workspace_screen.0b0v9cr", "프로필")}
        </div>
        <RecruiterProfileNotice copy={recruiterProfileCopy} />
      </div>

      {isEditing ? (
        <>
          <ProfileHeader
            displayName={draft.talentUser.name || "Unknown"}
            isEditing
            locale={locale}
            onOpenProfileSources={openProfileSources}
            onProfileImageDelete={() => void deleteProfileImage()}
            onProfileImageFileChange={(file) => void uploadProfileImage(file)}
            onFieldChange={updateTalentUserField}
            profileUpdatedText={profileUpdatedText}
            profileImageUploadPending={
              profileImageUploadPending || profileSavePending
            }
            savedResumeDownloadUrl={savedResumeDownloadUrl}
            savedResumeFileName={savedResumeFileName}
            savedResumeStoragePath={savedResumeStoragePath}
            savedProfileLinks={savedProfileLinks}
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
              <MuteButton
                type="button"
                onClick={addExperience}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-auto md:px-[7px] md:py-[7px] md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.0efzyx5",
                  "경력 추가"
                )}
              </MuteButton>
              <MuteButton
                type="button"
                onClick={addEducation}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-auto md:px-[7px] md:py-[7px] md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.1efofsl",
                  "학력 추가"
                )}
              </MuteButton>
              <MuteButton
                type="button"
                onClick={addExtra}
                className="h-11 gap-1.5 px-4 text-[13px] md:h-auto md:px-[7px] md:py-[7px] md:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                {t(
                  "career.profile.career_talent_profile_panel.0wjximy",
                  "추가 정보"
                )}
              </MuteButton>
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
                        onRemove={() => requestRemoveExperience(entry.index)}
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
                            aria-label={"직무"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "md:text-[14px] md:font-medium md:leading-[1.35]"
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
                              aria-label={"회사명"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[180px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                              aria-label={"근무 지역"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[150px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                              aria-label={"고용 형태"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[120px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                              aria-label={"시작일"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[92px] md:text-[11.5px] md:leading-5 md:text-neutral-soft"
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
                              aria-label={"종료일 또는 현재"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "w-[92px] md:text-[11.5px] md:leading-5 md:text-neutral-soft"
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
                              aria-label={"회사 링크"}
                              className={cn(
                                profileEditPlainInputClassName,
                                "min-w-[180px] flex-1 md:text-[11.5px] md:leading-5 md:text-neutral-soft"
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
                            aria-label={"주요 업무와 성과"}
                            className={cn(
                              profileEditPlainTextareaClassName,
                              "mt-2 md:text-[13px] md:leading-6 md:text-neutral-muted"
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
                      onRemove={() => requestRemoveEducation(entry.index)}
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
                          aria-label={"학교명"}
                          className={cn(
                            profileEditPlainInputClassName,
                            "md:text-[14px] md:font-medium md:leading-[1.35]"
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
                            aria-label={"전공"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[170px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                            aria-label={"학위"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[150px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                            aria-label={"학교/프로그램 링크"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "min-w-[180px] flex-1 md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                            aria-label={"시작일"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[92px] md:text-[11.5px] md:leading-5 md:text-neutral-soft"
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
                            aria-label={"종료일"}
                            className={cn(
                              profileEditPlainInputClassName,
                              "w-[92px] md:text-[11.5px] md:leading-5 md:text-neutral-soft"
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
                          aria-label={"학력 설명"}
                          className={cn(
                            profileEditPlainTextareaClassName,
                            "mt-2 md:text-[13px] md:leading-6 md:text-neutral-muted"
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
                    onRemove={() => requestRemoveExtra(extraIndex)}
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
                        aria-label={"제목"}
                        className={cn(
                          profileEditPlainInputClassName,
                          "md:text-[14px] md:font-medium md:leading-[1.35]"
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
                          aria-label={"날짜"}
                          className={cn(
                            profileEditPlainInputClassName,
                            "w-[160px] md:text-[12.5px] md:leading-5 md:text-neutral-muted"
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
                        aria-label={"설명"}
                        className={cn(
                          profileEditPlainTextareaClassName,
                          "mt-2 md:text-[13px] md:leading-6 md:text-neutral-muted"
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
          <ProfileHeader
            displayName={profileDisplayName}
            isEditing={false}
            locale={locale}
            onEdit={beginEditing}
            onOpenProfileSources={openProfileSources}
            onProfileImageDelete={() => void deleteProfileImage()}
            onProfileImageFileChange={(file) => void uploadProfileImage(file)}
            profileUpdatedText={profileUpdatedText}
            profileImageUploadPending={
              profileImageUploadPending || profileSavePending
            }
            savedResumeDownloadUrl={savedResumeDownloadUrl}
            savedResumeFileName={savedResumeFileName}
            savedResumeStoragePath={savedResumeStoragePath}
            savedProfileLinks={savedProfileLinks}
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
                    const isFirstEntryOfKind = !mergedExperience
                      .slice(0, index)
                      .some((previous) => previous.kind === entry.kind);

                    if (entry.kind === "exp") {
                      const exp = entry.item;
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
                          subtitle={exp.company_name ?? ""}
                          subtitleTone="primary"
                          secondarySubtitle={exp.company_location ?? ""}
                          meta={meta}
                          description={exp.description ?? ""}
                          memo={exp.memo ?? ""}
                          icon={<Building2 className="h-4 w-4" />}
                          kind="work"
                          logoUrl={exp.company_logo}
                          logoAlt={exp.company_name ?? exp.role ?? "Company"}
                          logoText={exp.company_name ?? exp.role ?? ""}
                          isLast={isLast}
                          onAdd={isFirstEntryOfKind ? addExperience : undefined}
                          addLabel={t(
                            "career.profile.career_talent_profile_panel.0efzyx5",
                            "경력 추가"
                          )}
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
                        onAdd={isFirstEntryOfKind ? addEducation : undefined}
                        addLabel={t(
                          "career.profile.career_talent_profile_panel.1efofsl",
                          "학력 추가"
                        )}
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
                      onAdd={extraIndex === 0 ? addExtra : undefined}
                      addLabel={t(
                        "career.profile.career_talent_profile_panel.0wjximy",
                        "추가 정보"
                      )}
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
          <MuteButton
            type="button"
            onClick={beginEditing}
            className="mt-4 h-11 gap-1.5 px-4 text-[13.5px] md:h-auto md:px-[7px] md:py-[7px] md:text-[12.5px]"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t(
              "career.profile.career_talent_profile_panel.1iq5xym",
              "수정하기"
            )}
          </MuteButton>
        </div>
      )}

      <CareerProfileEntryModal
        key={entryModalKind ?? "closed"}
        kind={entryModalKind}
        onClose={() => setEntryModalKind(null)}
        onSubmit={handleAddEntry}
        error={isEditing ? null : profileSaveError}
      />

      <ConfirmModal
        open={Boolean(pendingRemoval)}
        onClose={() => setPendingRemoval(null)}
        onConfirm={confirmRemoveEntry}
        title={
          pendingRemoval
            ? t(
                "career.profile.career_talent_profile_panel.remove_confirm_title",
                "{label} 항목을 삭제할까요?",
                { values: { label: pendingRemoval.label } }
              )
            : null
        }
        description={t(
          "career.profile.career_talent_profile_panel.remove_confirm_description",
          "확인하면 편집 화면에서 이 항목이 제거됩니다. 최종 반영하려면 프로필을 저장해 주세요."
        )}
        confirmLabel={t(
          "career.profile.career_talent_profile_panel.18od9kw",
          "항목 삭제"
        )}
        cancelLabel={t(
          "career.profile.career_profile_settings_section.0jiry9t",
          "취소"
        )}
      />

      <TalentCareerModal
        open={phoneNumberModalOpen}
        onClose={() => setPhoneNumberModalOpen(false)}
        title={t(
          "career.profile.personal_info.phone_modal_title",
          "휴대폰 번호 수정"
        )}
        mobileBottomSheet
        panelClassName="max-w-[520px] border border-neutral-1000-a05 bg-bg-floating"
      >
        {null}
      </TalentCareerModal>

      <CareerEmailChangeModal
        currentEmail={user?.email ?? talentUser?.email ?? ""}
        onChanged={(profile) => {
          onUpdateAccountProfile(profile);
          setDraft((current) => ({
            ...current,
            talentUser: {
              ...current.talentUser,
              email: profile.email,
            },
          }));
        }}
        onClose={() => setEmailChangeModalOpen(false)}
        open={emailChangeModalOpen}
        returnPath="/career/profile"
      />
    </div>
  );
};

export default React.memo(CareerTalentProfilePanel);
