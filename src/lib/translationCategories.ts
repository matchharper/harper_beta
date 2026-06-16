export const TRANSLATION_CATEGORY_OPTIONS = [
  { id: "onboarding", label: "온보딩" },
  { id: "home", label: "홈" },
  { id: "chat", label: "채팅" },
  { id: "call", label: "통화" },
  { id: "history", label: "히스토리" },
  { id: "company", label: "회사" },
  { id: "profile", label: "프로필" },
  { id: "settings", label: "설정" },
  { id: "landing", label: "랜딩페이지" },
  { id: "preview", label: "프리뷰" },
  { id: "support", label: "문의" },
  { id: "common", label: "공통" },
  { id: "other", label: "기타" },
] as const;

export const TRANSLATION_CATEGORY_FILTER_OPTIONS = [
  { id: "all", label: "전체" },
  ...TRANSLATION_CATEGORY_OPTIONS,
] as const;

export type TranslationCategoryId =
  (typeof TRANSLATION_CATEGORY_OPTIONS)[number]["id"];

export type TranslationCategoryFilterId =
  (typeof TRANSLATION_CATEGORY_FILTER_OPTIONS)[number]["id"];

export type TranslationCategory = {
  id: TranslationCategoryId;
  label: string;
};

const translationCategoryLabelById = Object.fromEntries(
  TRANSLATION_CATEGORY_OPTIONS.map((category) => [category.id, category.label])
) as Record<TranslationCategoryId, string>;

const translationCategoryIds = new Set<string>(
  TRANSLATION_CATEGORY_OPTIONS.map((category) => category.id)
);

function getCategory(id: TranslationCategoryId): TranslationCategory {
  return {
    id,
    label: translationCategoryLabelById[id],
  };
}

export function normalizeTranslationCategoryFilter(
  value: string | null | undefined
): TranslationCategoryFilterId {
  if (value === "all") return "all";
  if (value && translationCategoryIds.has(value)) {
    return value as TranslationCategoryId;
  }
  return "all";
}

function getCategoryFromKey(key: string): TranslationCategory | null {
  const parts = key.toLowerCase().split(".");
  const category = parts[1];
  if (category && translationCategoryIds.has(category)) {
    return getCategory(category as TranslationCategoryId);
  }

  if (key.startsWith("ui.")) return getCategory("common");
  return null;
}

function includesAny(source: string, patterns: readonly string[]) {
  return patterns.some((pattern) => source.includes(pattern));
}

export function getTranslationCategory(
  keyOrSource: string | null | undefined
): TranslationCategory {
  const source = (keyOrSource ?? "").toLowerCase();
  if (!source) return getCategory("other");

  const keyCategory = getCategoryFromKey(source);
  if (keyCategory) return keyCategory;

  if (
    includesAny(source, [
      "/landing/",
      "landing",
      "careerlanding",
      "src/pages/index",
    ])
  ) {
    return getCategory("landing");
  }

  if (
    includesAny(source, [
      "onboarding",
      "careeremailonboarding",
      "internalconnectiononboarding",
    ])
  ) {
    return getCategory("onboarding");
  }

  if (
    includesAny(source, [
      "careercallscreen",
      "careercallcard",
      "careercallenvironmentnotice",
      "internalopportunitycallactions",
      "usecareervoiceinput",
      "voiceinput",
    ])
  ) {
    return getCategory("call");
  }

  if (
    includesAny(source, [
      "careerhomepanel",
      "careermobilehomeview",
      "careerworkspacenav",
      "src/components/career/constants",
    ])
  ) {
    return getCategory("home");
  }

  if (
    includesAny(source, [
      "/chat/",
      "careercomposersection",
      "careertimelinesection",
      "careerchatpanel",
      "careermobilechatlauncher",
      "careerwelcomescreen",
      "thinkinglogpanel",
      "timelinependingpanel",
      "recommendationsearchstatuspanel",
      "conversationstarters",
      "careerflowprovider",
    ])
  ) {
    return getCategory("chat");
  }

  if (
    includesAny(source, [
      "/history/",
      "careerhistorypanel",
      "mobile/jobs",
      "opportunitytype",
      "opportunityfeedbacknote",
      "opportunitypreviewcards",
      "feedbackmodal",
    ])
  ) {
    return getCategory("history");
  }

  if (
    includesAny(source, [
      "/watchlist/",
      "companydetailview",
      "careercompanywatchlistpanel",
      "companyemptystate",
    ])
  ) {
    return getCategory("company");
  }

  if (
    includesAny(source, [
      "/settings/",
      "careersettingsmodal",
      "careerprofilesettingssection",
      "careerresumelinkssettingssection",
      "careerupdatenotesmodal",
    ])
  ) {
    return getCategory("settings");
  }

  if (
    includesAny(source, [
      "/profile/",
      "careertalentprofilepanel",
      "careerprofileworkspace",
      "careerprofilemenu",
    ])
  ) {
    return getCategory("profile");
  }

  if (includesAny(source, ["/preview/", "careerworkspacepreview"])) {
    return getCategory("preview");
  }

  if (includesAny(source, ["support", "inquiry"])) {
    return getCategory("support");
  }

  if (
    includesAny(source, [
      "careerworkspacescreen",
      "careerinpagetabs",
      "careermobiletopbar",
      "src/lib/career",
      "src/hooks/career",
      "careertranslation",
    ])
  ) {
    return getCategory("common");
  }

  return getCategory("other");
}
