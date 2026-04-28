import Animate from "@/components/landing/Animate";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Head1 from "@/components/landing/Head1";
import CandidateGithubCardDark from "@/components/landing/Rad";
import ScholarProfile from "@/components/landing/ScholarProfile";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMessages } from "@/i18n/useMessage";
import { en } from "@/lang/en";
import SearchRequestAccessModal from "@/components/Modal/SearchRequestAccessModal";
import type { RequestAccessValues } from "@/components/Modal/RequestAccessModal";
import { showToast } from "@/components/toast/toast";
import {
  createSearchLandingId,
  resolveSearchLandingAssignmentType,
  SEARCH_LANDING_ABTEST_TYPE_A,
  SEARCH_LANDING_ABTEST_TYPE_B,
  SEARCH_LANDING_ABTEST_TYPE_KEY,
  SEARCH_LANDING_LAST_VISIT_AT_KEY,
  SEARCH_LANDING_LOCAL_ID_KEY,
  SEARCH_LANDING_SESSION_GAP_MS,
  usesSearchLandingBExperience,
  type SearchLandingAssignmentType,
} from "@/lib/searchLandingLogs";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import {
  ArrowUp,
  BookOpen,
  FolderOpen,
  Github,
  GraduationCap,
  Quote,
  Search,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import PricingSection from "@/components/landing/Pricing";
import { FallingTagsMl } from "@/components/landing/FallingTagsML";
import Reveal from "@/components/landing/Animation/Reveal";
import Footer from "@/components/landing/Footer";
import SearchHeader, {
  getRadarSectionHref,
  navItems,
  RadarSection,
} from "@/components/landing/SearchHeader";
import QuestionAnswer from "@/components/landing/Questions";
import StaggerText from "@/components/landing/Animation/StaggerText";
import WhySection from "@/components/landing/WhySection";
import FounderNote from "@/components/landing/FounderNote";
import LinkedinHarperCompare from "@/components/landing/LinkedinHarperCompare";
import AsteriskIcon from "@/assets/icons/asterisk";

const LoginModal = dynamic(() => import("@/components/Modal/LoginModal"));
const RADAR_LOGIN_MODAL_LANGUAGE = "ko" as const;
const RADAR_LOGIN_MODAL_COPY = {
  sessionExpired: "Your login session has expired. Please sign in again.",
  bootstrapFailed: "Failed to initialize your account. Please try again.",
};

export const START_BUTTON_LABEL = "Try for Free";
const PLACEHOLDER_SWITCH_MS = 2800;
const PLACEHOLDER_SLIDE_MS = 450;
const PLACEHOLDER_LINE_HEIGHT_PX = 24;
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://matchharper.com")
  .trim()
  .replace(/\/$/, "");
const SEARCH_CANONICAL_URL = `${SITE_URL}/search`;
const SEARCH_OG_IMAGE_URL = `${SITE_URL}/images/usemain.png`;
const SEARCH_OG_IMAGE_ALT = "Harper talent search product preview";
const SEARCH_SEO_TITLE = "Harper | Find Real Engineers and Researchers";
const SEARCH_SEO_DESCRIPTION =
  "Find under-the-radar engineers and researchers through GitHub, shipped projects, papers, and Scholar signals.";
const SEARCH_OG_IMAGE_WIDTH = 2906;
const SEARCH_OG_IMAGE_HEIGHT = 1898;
const SEARCH_REQUEST_ACCESS_QUERY_KEY = "requestAccess";
const SEARCH_REQUEST_ACCESS_CALLBACK_PATH = "/search?requestAccess=1";

const HERO_DOT_BACKGROUND_STYLE = {
  opacity: 0.4,
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.16) 0.9px, transparent 0.9px)",
  backgroundSize: "20px 20px",
};

const stripHtmlForMetadata = (value: string) =>
  value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

type OutputItem = {
  key: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  stats: Array<{ label: string; value: string }>;
  queryPlaceholder: string;
  avatars: string[];
  ctaLabel: string;
};

const outputItems: OutputItem[] = [
  {
    key: "repo_signals",
    icon: <Github className="h-5 w-5 text-white/80" />,
    title: "GitHub signals",
    desc: "Find engineers through merged PRs, maintained repos, and real contribution history.",
    stats: [
      { label: "Reads", value: "PRs / repos / ownership" },
      { label: "Best for", value: "hidden builders" },
    ],
    queryPlaceholder:
      "Backend engineer who has maintained production services and contributed meaningful PRs to well-known open-source repositories.",
    avatars: ["/images/profiles/avatar7.png", "/images/profiles/avatar8.png"],
    ctaLabel: "Search GitHub evidence ->",
  },
  {
    key: "project_signals",
    icon: <FolderOpen className="h-5 w-5 text-white/80" />,
    title: "Shipped projects",
    desc: "Search by what people actually built: pipelines, infra, datasets, tools, and systems.",
    stats: [
      { label: "Reads", value: "systems / datasets / delivery" },
      { label: "Best for", value: "0→1 operators" },
    ],
    queryPlaceholder:
      "Research engineer who built a large-scale multimodal dataset pipeline with data quality filtering, deduplication, and evaluation tooling.",
    avatars: [
      "/images/profiles/avatar11.png",
      "/images/profiles/avatar5.png",
      "/images/profiles/avatar6.png",
    ],
    ctaLabel: "Search shipped work ->",
  },
  {
    key: "publication_signals",
    icon: <BookOpen className="h-5 w-5 text-white/80" />,
    title: "Scholar & papers",
    desc: "Find researchers through paper history, venue quality, and technical focus before the market notices.",
    stats: [
      { label: "Reads", value: "papers / venues / Scholar" },
      { label: "Best for", value: "real research depth" },
    ],
    queryPlaceholder:
      "Vision or multimodal AI researcher with strong publication history in top venues and hands-on experience in representation learning.",
    avatars: [
      "/images/profiles/avatar1.png",
      "/images/profiles/avatar2.png",
      "/images/profiles/avatar3.png",
    ],
    ctaLabel: "Search research signals ->",
  },
];

const heroPlaceholderTexts = outputItems.map((item) => item.queryPlaceholder);

const coverageStats: Array<{
  icon: LucideIcon;
  value: string;
  label: string;
}> = [
  {
    icon: Github,
    value: "3M+",
    label: "Projects tracked on Github",
  },
  {
    icon: GraduationCap,
    value: "7M+",
    label: "Paper / Publications",
  },
  {
    icon: Search,
    value: "10M+",
    label: "Projects and Publications",
  },
];

const socialProofItems = [
  {
    quote:
      "There is a clear '<span class='text-white'>before and after</span>' in our recruiting.<br /><span class='text-white'>Harper changed everything.</span>",
    attribution: "VP at a global startup backed by $200M+",
  },
  {
    quote:
      "Harper는 <span class='text-white'>링크드인</span>에 없는 <span class='text-white'>최상위 인재</span>를<br />발견할 수 있는 유일한 <span class='text-white'>플랫폼</span>입니다.",
    // "Harper is the only platform where we can find top talent that isn't on LinkedIn.",
    attribution: "Fast-growing AI avatar startup",
  },
] as const;

export const StartButton = React.memo(function StartButton({
  onClick,
  label,
  size = "md",
}: {
  onClick: () => void;
  label: string;
  size?: "md" | "sm";
}) {
  const sizeClass =
    size === "sm"
      ? "px-6 py-3 text-xs"
      : "mt-10 px-8 py-4 text-sm md:text-base";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "group relative z-10 cursor-pointer rounded-full bg-accenta1 font-medium text-black",
        "ring-1 ring-white/10",
        "shadow-[0_12px_40px_rgba(180,255,120,0.25)]",
        "transition-all duration-200",
        "hover:-translate-y-[1px] hover:shadow-[0_18px_60px_rgba(180,255,120,0.35)]",
        "active:translate-y-0 active:shadow-[0_8px_20px_rgba(180,255,120,0.2)]",
        sizeClass,
      ].join(" ")}
    >
      {label}
    </button>
  );
});

function CoverageCard({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="w-full rounded-2xl text-center px-6 py-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 mx-auto">
        <Icon className="h-5 w-5 text-white/80" />
      </div>
      <div className="mt-6 text-5xl md:text-6xl font-medium text-white">
        {value}
      </div>
      <div className="mt-6 text-lg md:text-xl font-light text-white/85">
        {label}
      </div>
    </div>
  );
}

function SearchInputPanel({
  query,
  onQueryChange,
  onSubmit,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
}) {
  const canSend = query.trim().length > 0;
  const isQueryEmpty = query.trim().length === 0;

  const placeholderOptions = useMemo(() => heroPlaceholderTexts, []);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [nextPlaceholderIdx, setNextPlaceholderIdx] = useState<number | null>(
    null
  );
  const [isPlaceholderAnimating, setIsPlaceholderAnimating] = useState(false);

  const activePlaceholder =
    placeholderOptions[placeholderIdx % placeholderOptions.length] ??
    placeholderOptions[0] ??
    "";

  useEffect(() => {
    if (placeholderOptions.length === 0) return;
    setPlaceholderIdx((prev) => prev % placeholderOptions.length);
    setNextPlaceholderIdx(null);
    setIsPlaceholderAnimating(false);
  }, [placeholderOptions.length]);

  useEffect(() => {
    if (!isQueryEmpty) {
      setNextPlaceholderIdx(null);
      setIsPlaceholderAnimating(false);
      return;
    }

    if (placeholderOptions.length <= 1 || isPlaceholderAnimating) return;

    const timer = window.setTimeout(() => {
      setNextPlaceholderIdx((placeholderIdx + 1) % placeholderOptions.length);
      setIsPlaceholderAnimating(true);
    }, PLACEHOLDER_SWITCH_MS);

    return () => window.clearTimeout(timer);
  }, [
    isPlaceholderAnimating,
    isQueryEmpty,
    placeholderIdx,
    placeholderOptions.length,
  ]);

  useEffect(() => {
    if (!isPlaceholderAnimating || nextPlaceholderIdx === null) return;

    const timer = window.setTimeout(() => {
      setPlaceholderIdx(nextPlaceholderIdx);
      setNextPlaceholderIdx(null);
      setIsPlaceholderAnimating(false);
    }, PLACEHOLDER_SLIDE_MS);

    return () => window.clearTimeout(timer);
  }, [isPlaceholderAnimating, nextPlaceholderIdx]);

  return (
    <form onSubmit={onSubmit} className="w-full rounded-[28px] p-2 md:p-5">
      <div className="relative w-full rounded-[24px] border border-white/10 bg-hgray200 p-1">
        <div className="relative rounded-[20px] backdrop-blur-xl">
          {isQueryEmpty && (
            <div
              className="pointer-events-none absolute left-4 right-16 top-4 overflow-hidden text-sm leading-6 text-hgray600 md:right-20 md:text-[15px]"
              aria-hidden="true"
            >
              <div
                className="flex flex-col"
                style={{
                  transition: isPlaceholderAnimating
                    ? `transform ${PLACEHOLDER_SLIDE_MS}ms ease-out`
                    : "none",
                  transform: isPlaceholderAnimating
                    ? `translateY(-${PLACEHOLDER_LINE_HEIGHT_PX}px)`
                    : "translateY(0)",
                }}
              >
                <div className="h-6 overflow-hidden text-ellipsis whitespace-nowrap">
                  {activePlaceholder}
                </div>
              </div>
            </div>
          )}

          <textarea
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            placeholder=""
            aria-label="Search talent"
            rows={2}
            className={[
              "w-full resize-none rounded-[20px] bg-transparent",
              "min-h-[104px] px-4 py-4 pr-16 text-sm leading-6 text-white/95 md:min-h-[96px] md:text-[15px] md:pr-20",
              "placeholder:text-transparent outline-none",
            ].join(" ")}
          />
        </div>

        <div className="absolute bottom-2 right-2 flex items-center justify-center gap-2 md:bottom-3 md:right-3">
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Submit search"
            className={[
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-[0.98] md:h-11 md:w-11 bg-accenta1 text-black hover:opacity-90",
            ].join(" ")}
          >
            <ArrowUp size={20} />
          </button>
        </div>
      </div>

      <div className="mt-4 text-left text-sm text-hgray700"></div>
    </form>
  );
}

export default function RadarLandingPage() {
  const { m, locale } = useMessages();
  const router = useRouter();
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();
  const { user, loading: authLoading, init } = useAuthStore();
  const { companyUser, load: loadCompanyUser } = useCompanyUserStore();

  const [query, setQuery] = useState("");
  const [landingId, setLandingId] = useState("");
  const [abtestType, setAbtestType] =
    useState<SearchLandingAssignmentType | null>(null);
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);
  const [isOpenRequestAccessModal, setIsOpenRequestAccessModal] =
    useState(false);
  const [hasSubmittedRequestAccess, setHasSubmittedRequestAccess] =
    useState(false);
  const [requestAccessSeed, setRequestAccessSeed] = useState<
    Partial<RequestAccessValues>
  >({});
  const hasLoggedFirstScrollRef = useRef(false);
  const hasHandledRequestAccessQueryRef = useRef(false);

  const addLandingLog = useCallback(
    async (
      type: string,
      overrides?: {
        localId?: string;
        abtestType?: SearchLandingAssignmentType | null;
      }
    ) => {
      const storedLocalId =
        typeof window !== "undefined"
          ? (localStorage.getItem(SEARCH_LANDING_LOCAL_ID_KEY) ?? "")
          : "";
      const storedAbtestType =
        typeof window !== "undefined"
          ? (localStorage.getItem(SEARCH_LANDING_ABTEST_TYPE_KEY) ?? "")
          : "";
      const resolvedLocalId =
        overrides?.localId || landingId || storedLocalId || "";
      const resolvedAbtestType =
        overrides?.abtestType || abtestType || storedAbtestType || "";

      if (!resolvedLocalId || !resolvedAbtestType) return;

      try {
        await supabase.from("landing_logs").insert({
          local_id: resolvedLocalId,
          type,
          abtest_type: resolvedAbtestType,
          is_mobile: isMobile,
          country_lang: countryLang,
        });
      } catch (error) {
        console.error("search landing log insert error:", error);
      }
    },
    [abtestType, countryLang, isMobile, landingId]
  );

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const savedAbtestType = localStorage.getItem(
      SEARCH_LANDING_ABTEST_TYPE_KEY
    );
    const resolvedAbtestType =
      resolveSearchLandingAssignmentType(savedAbtestType);
    localStorage.setItem(SEARCH_LANDING_ABTEST_TYPE_KEY, resolvedAbtestType);
    setAbtestType(resolvedAbtestType);

    const savedId = localStorage.getItem(SEARCH_LANDING_LOCAL_ID_KEY);
    if (!savedId) {
      const newId = createSearchLandingId();
      localStorage.setItem(SEARCH_LANDING_LOCAL_ID_KEY, newId);
      localStorage.setItem(
        SEARCH_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      setLandingId(newId);
      void addLandingLog("new_visit", {
        localId: newId,
        abtestType: resolvedAbtestType,
      });
      return;
    }

    setLandingId(savedId);
  }, [addLandingLog]);

  useEffect(() => {
    if (!landingId || typeof window === "undefined") return;

    const now = Date.now();
    const lastVisitRaw = localStorage.getItem(SEARCH_LANDING_LAST_VISIT_AT_KEY);
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (
      lastVisitAt &&
      Number.isFinite(lastVisitAt) &&
      now - lastVisitAt >= SEARCH_LANDING_SESSION_GAP_MS
    ) {
      void addLandingLog("new_session");
    }

    localStorage.setItem(SEARCH_LANDING_LAST_VISIT_AT_KEY, now.toString());
  }, [addLandingLog, landingId]);

  useEffect(() => {
    const handleScroll = () => {
      if (!landingId) return;
      if (hasLoggedFirstScrollRef.current) return;
      if (window.scrollY <= 0) return;

      hasLoggedFirstScrollRef.current = true;
      void addLandingLog("first_scroll_down");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [addLandingLog, landingId]);

  const clearRequestAccessQueryParam = useCallback(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (!url.searchParams.has(SEARCH_REQUEST_ACCESS_QUERY_KEY)) return;

    url.searchParams.delete(SEARCH_REQUEST_ACCESS_QUERY_KEY);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

  const handleCloseRequestAccessModal = useCallback(() => {
    setIsOpenRequestAccessModal(false);
    clearRequestAccessQueryParam();
  }, [clearRequestAccessQueryParam]);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const continueToRequestAccess = useCallback(async () => {
    const resolvedUser =
      useAuthStore.getState().user ??
      (await supabase.auth.getUser()).data.user ??
      null;

    if (!resolvedUser) {
      setIsOpenRequestAccessModal(false);
      setIsOpenLoginModal(true);
      return;
    }

    const resolvedMetadataName = [
      resolvedUser.user_metadata?.full_name,
      resolvedUser.user_metadata?.name,
    ]
      .map((value) => String(value ?? "").trim())
      .find(Boolean);
    if (resolvedMetadataName) {
      setRequestAccessSeed((current) => ({
        ...current,
        name: current.name || resolvedMetadataName,
      }));
    }

    try {
      await loadCompanyUser(resolvedUser.id);
    } catch (error) {
      console.error("failed to load company user on search:", error);
    }

    const latestCompanyUser = useCompanyUserStore.getState().companyUser;
    if (latestCompanyUser?.is_authenticated) {
      setIsOpenLoginModal(false);
      setIsOpenRequestAccessModal(false);
      clearRequestAccessQueryParam();
      void router.push("/my");
      return;
    }

    setIsOpenLoginModal(false);
    setIsOpenRequestAccessModal(true);
    clearRequestAccessQueryParam();
  }, [clearRequestAccessQueryParam, loadCompanyUser, router]);

  useEffect(() => {
    if (!router.isReady || authLoading) return;

    const requestAccessValue = router.query[SEARCH_REQUEST_ACCESS_QUERY_KEY];
    if (requestAccessValue !== "1") {
      hasHandledRequestAccessQueryRef.current = false;
      return;
    }

    if (hasHandledRequestAccessQueryRef.current) return;
    hasHandledRequestAccessQueryRef.current = true;

    void continueToRequestAccess();
  }, [authLoading, continueToRequestAccess, router.isReady, router.query]);

  const openLoginModal = useCallback(
    (args?: { draft?: string; eventType?: string }) => {
      if (typeof window !== "undefined") {
        const value = args?.draft?.trim();
        if (value) {
          localStorage.setItem("harper_radar_query_draft", value);
        }
      }

      if (args?.eventType) {
        void addLandingLog(args.eventType);
      }

      void (async () => {
        const currentUser =
          useAuthStore.getState().user ??
          (await supabase.auth.getUser()).data.user ??
          null;

        if (currentUser) {
          await continueToRequestAccess();
          return;
        }

        setIsOpenLoginModal(true);
      })();
    },
    [addLandingLog, continueToRequestAccess]
  );

  const handlePrimaryStart = useCallback(() => {
    openLoginModal({
      draft: query,
      eventType: "click_start",
    });
  }, [openLoginModal, query]);

  const handleHeaderStart = useCallback(() => {
    openLoginModal({
      draft: query,
      eventType: "click_nav_start",
    });
  }, [openLoginModal, query]);

  const handleFooterStart = useCallback(
    (eventType: string) => {
      openLoginModal({
        draft: query,
        eventType,
      });
    },
    [openLoginModal, query]
  );

  const handlePricingPlanClick = useCallback(
    (plan: string, _billing: "monthly" | "yearly") => {
      openLoginModal({
        draft: query,
        eventType: `click_pricing_${plan}`,
      });
    },
    [openLoginModal, query]
  );

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;

      openLoginModal({
        draft: query,
        eventType: "click_query_start",
      });
    },
    [openLoginModal, query]
  );

  const handleCloseLoginModal = useCallback(() => {
    setIsOpenLoginModal(false);
  }, []);

  const requestAccessInitialValues = useMemo<
    Partial<RequestAccessValues>
  >(() => {
    const resolvedMetadataName = [
      requestAccessSeed.name,
      user?.user_metadata?.full_name,
      user?.user_metadata?.name,
    ]
      .map((value) => String(value ?? "").trim())
      .find(Boolean);

    const resolvedName = isMissingDisplayName(companyUser?.name)
      ? (resolvedMetadataName ?? "")
      : String(companyUser?.name ?? "").trim();

    return {
      name: resolvedName,
      company: String(
        companyUser?.company ?? requestAccessSeed.company ?? ""
      ).trim(),
      role: String(companyUser?.role ?? requestAccessSeed.role ?? "").trim(),
    };
  }, [
    companyUser?.company,
    companyUser?.name,
    companyUser?.role,
    requestAccessSeed.company,
    requestAccessSeed.name,
    requestAccessSeed.role,
    user,
  ]);

  const submitRequestAccess = useCallback(
    async (values: RequestAccessValues) => {
      const normalizedValues = {
        name: values.name.trim(),
        company: values.company.trim(),
        role: values.role.trim(),
        hiringNeed: values.hiringNeed.trim(),
      };

      if (!normalizedValues.name || !normalizedValues.company) {
        showToast({
          message: m.invitation.requestAccess.errors.invalidForm,
          variant: "white",
        });
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        showToast({
          message: m.invitation.requestAccess.errors.missingSession,
          variant: "white",
        });
        setIsOpenRequestAccessModal(false);
        setIsOpenLoginModal(true);
        return;
      }

      const response = await fetch("/api/request-access/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...normalizedValues,
          isMobile,
        }),
      });

      if (!response.ok) {
        showToast({
          message: m.invitation.requestAccess.errors.submitFailed,
          variant: "white",
        });
        return;
      }

      await addLandingLog("submit_request_access");
      setHasSubmittedRequestAccess(true);
      showToast({
        message: m.invitation.requestAccess.submitted,
        variant: "white",
      });
    },
    [addLandingLog, getAccessToken, isMobile, m.invitation.requestAccess]
  );

  const logCompletedLogin = useCallback(
    async (email: string | null | undefined) => {
      const resolvedEmail = String(email ?? "").trim();
      if (!resolvedEmail) return;

      await addLandingLog(`login_email:${resolvedEmail}`);
    },
    [addLandingLog]
  );

  const login = useCallback(async () => {
    void addLandingLog("click_login_google");

    const resolvedLandingId =
      landingId ||
      (typeof window !== "undefined"
        ? (localStorage.getItem(SEARCH_LANDING_LOCAL_ID_KEY) ?? "")
        : "");
    const resolvedAbtestType =
      abtestType ||
      (typeof window !== "undefined"
        ? (localStorage.getItem(SEARCH_LANDING_ABTEST_TYPE_KEY) ?? "")
        : "");

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/callback?lid=${resolvedLandingId}&cl=${encodeURIComponent(countryLang)}&ab=${encodeURIComponent(resolvedAbtestType)}&next=${encodeURIComponent(SEARCH_REQUEST_ACCESS_CALLBACK_PATH)}`
        : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) throw error;

    if (data?.url && typeof window !== "undefined") {
      window.location.assign(data.url);
    }

    return data;
  }, [abtestType, addLandingLog, countryLang, landingId]);

  const usesVariantB = usesSearchLandingBExperience(abtestType);
  const heroTitleLines = usesVariantB
    ? ["Describe what you need.", "Get who you want."]
    : ["Find who actually", "builds and publishes."];
  const heroSubtitle = usesVariantB
    ? "AI가 경력과 GitHub, 논문 등을 분석해<br/>상위 1%의 후보자 리스트를 만들어 드립니다."
    : m.companyLanding.hero.subtitle;
  const heroStartLabel =
    abtestType === SEARCH_LANDING_ABTEST_TYPE_A ||
    abtestType === SEARCH_LANDING_ABTEST_TYPE_B
      ? "무료로 시작하기"
      : "무료로 시작하기";

  const customLogin = useCallback(
    async (email: string, password: string) => {
      void addLandingLog("click_login_email");

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          return { message: error.message };
        }

        const user = data.user;
        if (!user) {
          return { message: en.auth.invalidAccount };
        }

        const resolvedMetadataName = [
          user.user_metadata?.full_name,
          user.user_metadata?.name,
        ]
          .map((value) => String(value ?? "").trim())
          .find(Boolean);
        if (resolvedMetadataName) {
          setRequestAccessSeed((current) => ({
            ...current,
            name: current.name || resolvedMetadataName,
          }));
        }

        const isEmailConfirmed = Boolean(
          user.email_confirmed_at || user.user_metadata?.email_verified
        );

        if (!isEmailConfirmed) {
          return { message: en.auth.emailConfirmationSent };
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        const accessToken = session?.access_token;

        if (!accessToken) {
          return {
            message: RADAR_LOGIN_MODAL_COPY.sessionExpired,
          };
        }

        const bootstrapRes = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!bootstrapRes.ok) {
          const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
          return {
            message:
              bootstrapJson?.error ?? RADAR_LOGIN_MODAL_COPY.bootstrapFailed,
          };
        }

        await logCompletedLogin(user.email ?? email.trim());
        await continueToRequestAccess();
        return null;
      } catch (error) {
        if (error instanceof Error && error.message) {
          return { message: error.message };
        }
        return { message: en.auth.invalidAccount };
      }
    },
    [addLandingLog, continueToRequestAccess, logCompletedLogin]
  );

  const searchPageLanguage = locale === "en" ? "en-US" : "ko-KR";
  const searchPageOgLocale = locale === "en" ? "en_US" : "ko_KR";
  const alternateOgLocale = locale === "en" ? "ko_KR" : "en_US";

  const searchPageStructuredData = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: SEARCH_SEO_TITLE,
      headline: "Find who actually builds and publishes.",
      description: SEARCH_SEO_DESCRIPTION,
      url: SEARCH_CANONICAL_URL,
      inLanguage: searchPageLanguage,
      isPartOf: {
        "@type": "WebSite",
        name: "Harper",
        url: SITE_URL,
      },
      about: [
        "AI recruiting",
        "talent sourcing",
        "engineer search",
        "researcher search",
      ],
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: SEARCH_OG_IMAGE_URL,
        width: SEARCH_OG_IMAGE_WIDTH,
        height: SEARCH_OG_IMAGE_HEIGHT,
      },
      publisher: {
        "@type": "Organization",
        name: "Harper",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/images/logo.png`,
        },
      },
    }),
    [searchPageLanguage]
  );

  const faqStructuredData = useMemo(() => {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: searchPageLanguage,
      mainEntity: m.companyLanding.faq.items.map((item) => ({
        "@type": "Question",
        name: stripHtmlForMetadata(item.question),
        acceptedAnswer: {
          "@type": "Answer",
          text: stripHtmlForMetadata(item.answer),
        },
      })),
    };
  }, [m, searchPageLanguage]);

  return (
    <>
      <Head>
        <title>{SEARCH_SEO_TITLE}</title>
        <meta
          key="description"
          name="description"
          content={SEARCH_SEO_DESCRIPTION}
        />
        <meta
          key="robots"
          name="robots"
          content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
        />
        <link key="canonical" rel="canonical" href={SEARCH_CANONICAL_URL} />
        <meta key="og:type" property="og:type" content="website" />
        <meta key="og:site_name" property="og:site_name" content="Harper" />
        <meta
          key="og:locale"
          property="og:locale"
          content={searchPageOgLocale}
        />
        <meta
          key="og:locale:alternate"
          property="og:locale:alternate"
          content={alternateOgLocale}
        />
        <meta key="og:title" property="og:title" content={SEARCH_SEO_TITLE} />
        <meta
          key="og:description"
          property="og:description"
          content={SEARCH_SEO_DESCRIPTION}
        />
        <meta key="og:url" property="og:url" content={SEARCH_CANONICAL_URL} />
        <meta
          key="og:image"
          property="og:image"
          content={SEARCH_OG_IMAGE_URL}
        />
        <meta
          key="og:image:secure_url"
          property="og:image:secure_url"
          content={SEARCH_OG_IMAGE_URL}
        />
        <meta
          key="og:image:alt"
          property="og:image:alt"
          content={SEARCH_OG_IMAGE_ALT}
        />
        <meta
          key="og:image:type"
          property="og:image:type"
          content="image/png"
        />
        <meta
          key="og:image:width"
          property="og:image:width"
          content={String(SEARCH_OG_IMAGE_WIDTH)}
        />
        <meta
          key="og:image:height"
          property="og:image:height"
          content={String(SEARCH_OG_IMAGE_HEIGHT)}
        />
        <meta
          key="twitter:card"
          name="twitter:card"
          content="summary_large_image"
        />
        <meta
          key="twitter:title"
          name="twitter:title"
          content={SEARCH_SEO_TITLE}
        />
        <meta
          key="twitter:description"
          name="twitter:description"
          content={SEARCH_SEO_DESCRIPTION}
        />
        <meta
          key="twitter:image"
          name="twitter:image"
          content={SEARCH_OG_IMAGE_URL}
        />
        <meta
          key="twitter:image:alt"
          name="twitter:image:alt"
          content={SEARCH_OG_IMAGE_ALT}
        />
        <script
          key="ld-search-page"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(searchPageStructuredData),
          }}
        />
        {faqStructuredData ? (
          <script
            key="ld-search-faq"
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(faqStructuredData),
            }}
          />
        ) : null}
      </Head>

      <main className="min-h-screen w-full overflow-x-hidden bg-black font-inter text-white">
        {isOpenLoginModal && (
          <LoginModal
            open={isOpenLoginModal}
            onClose={handleCloseLoginModal}
            onGoogle={login}
            onConfirm={customLogin}
            language={RADAR_LOGIN_MODAL_LANGUAGE}
            callbackPath={SEARCH_REQUEST_ACCESS_CALLBACK_PATH}
          />
        )}
        {isOpenRequestAccessModal ? (
          <SearchRequestAccessModal
            open={isOpenRequestAccessModal}
            onClose={handleCloseRequestAccessModal}
            onSubmit={submitRequestAccess}
            title={m.invitation.title}
            description={m.invitation.description}
            requestCopy={m.invitation.requestAccess}
            submitted={hasSubmittedRequestAccess}
            submittedMessage={m.invitation.requestAccess.submitted}
            initialValues={requestAccessInitialValues}
          />
        ) : null}

        <SearchHeader onStartClick={handleHeaderStart} />

        <nav className="sr-only" aria-label="Radar section links">
          {navItems.map((item) => (
            <a key={item.section} href={getRadarSectionHref(item.section)}>
              {item.label}
            </a>
          ))}
        </nav>

        <section
          id={RadarSection.Intro}
          className="relative flex min-h-[78vh] w-full flex-col items-center justify-center overflow-hidden bg-black px-4 pt-20 text-white md:min-h-[84vh] md:px-8 md:pt-28"
        >
          <div className="absolute left-0 top-0 h-full w-full">
            <div
              className="pointer-events-none absolute inset-0"
              style={HERO_DOT_BACKGROUND_STYLE}
            />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(180,255,120,0.1),transparent_15%)]" />
          </div>

          <Reveal delay={0.08} className="w-full max-w-[980px]">
            <div className="relative z-10 mx-auto mt-10 flex w-full flex-col items-center text-center md:mt-24 min-h-[64vh] md:min-h-[66vh]">
              <h1 className="mt-6 max-w-[920px] text-3xl font-medium leading-relaxed tracking-[-0.03em] md:text-5xl">
                <StaggerText text={heroTitleLines[0] ?? ""} />
                <div className="mt-0 md:mt-3.5" />
                <StaggerText text={heroTitleLines[1] ?? ""} delay={0.14} />
              </h1>

              <p
                className="mt-6 md:mt-8 max-w-[700px] text-base font-light leading-7 text-hgray700 md:text-lg md:leading-8"
                dangerouslySetInnerHTML={{
                  __html: heroSubtitle,
                }}
              />
              {/* <div className="hidden md:flex mt-12 w-full max-w-[820px] md:mt-16">
                <div className="w-full overflow-hidden rounded-[30px] bg-gradpastel2 p-1">
                  <SearchInputPanel
                    query={query}
                    onQueryChange={setQuery}
                    onSubmit={handleSearchSubmit}
                  />
                </div>
              </div> */}
              {/* <div className="mt-4 flex md:hidden"> */}
              <div className="mt-4 flex">
                <StartButton
                  onClick={handlePrimaryStart}
                  label={heroStartLabel}
                />
              </div>
            </div>

            {locale === "ko" && (
              // <Reveal delay={0.08} duration={1.2}>
              <div className="w-full mb-20 mt-4 md:mt-0 flex flex-col items-center justify-center">
                <div className="max-w-[1280px] bg-gradpastel2 overflow-hidden md:rounded-[30px] rounded-2xl pt-8 md:pt-0 flex flex-col items-center justify-center">
                  <video
                    src="/videos/newclipharper.mov"
                    poster="/images/usemain.png"
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-[90%] h-full object-cover  md:rounded-t-[30px] rounded-t-2xl md:translate-y-[40px] translate-y-0 shadow-lg"
                  />
                </div>
              </div>
              // </Reveal>
            )}
            <div className="mt-6 text-white/80"></div>
          </Reveal>
        </section>

        <div className="h-12 md:h-24" />
        <Reveal delay={0.08}>
          <BaseSectionLayout>
            <section className="relative rounded-2xl bg-white/5 border border-white/10 w-full px-4 py-12 md:px-8">
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  opacity: 0.4,
                  backgroundImage:
                    "radial-gradient(rgba(255,255,255,0.3) 1.1px, transparent 1.1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              <div className="text-white flex flex-row items-center justify-center gap-3 w-full text-center text-xl md:text-2xl font-medium font-hedvig">
                <AsteriskIcon className="w-6 h-6 text-accenta1/90" />
                Harper를 신뢰하는 팀들
              </div>

              <div className="grid md:grid-cols-2">
                {socialProofItems.map((item, index) => (
                  <div
                    key={item.quote}
                    className={`relative flex h-full flex-col`}
                  >
                    <p
                      className="font-geist mt-12 text-center max-w-[560px] text-[16px] text-white/65 md:text-[20px]"
                      dangerouslySetInnerHTML={{
                        __html: item.quote,
                      }}
                    />

                    <div
                      className="text-center w-full mt-4 text-hgray700 text-lg font-light"
                      dangerouslySetInnerHTML={{
                        __html: item.attribution,
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>
          </BaseSectionLayout>
        </Reveal>

        <div className="h-12 md:h-24" />
        <Reveal>
          <BaseSectionLayout>
            <div className="gap-2 w-full flex flex-col items-center justify-center text-center py-8 md:py-10 px-0">
              <Head1 as="h2">{m.companyLanding.section1.title}</Head1>
              <h3 className="text-lg md:text-xl text-white font-normal mt-10">
                {m.companyLanding.section1.headlineLine1}
                <br />
                {m.companyLanding.section1.headlineLine2}
              </h3>
            </div>
          </BaseSectionLayout>
          {/* <VCLogosWidth /> */}
        </Reveal>
        <div className="h-20 md:h-40" />
        <WhySection />
        <div className="h-20 md:h-40" />
        <Reveal delay={0.08} duration={1.2}>
          <BaseSectionLayout>
            <div className="flex w-full flex-col items-center justify-center px-4 text-left md:px-0">
              {/* <h2 className="mt-8 max-w-[720px] text-center text-xl font-normal text-white md:text-2xl md:leading-[1.2]">
              </h2> */}

              <div className="text-[22px] md:text-3xl text-white font-normal mt-8">
                데이터는 지금도 계속 확장되고 있습니다.
              </div>

              <div className="mt-10 grid w-full grid-cols-1 gap-6 md:grid-cols-3 md:gap-7">
                {coverageStats.map((stat) => (
                  <CoverageCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          </BaseSectionLayout>
        </Reveal>

        <div id={RadarSection.Outputs} className="h-20 md:h-40" />
        <BaseSectionLayout>
          <div className="flex w-full flex-col items-center justify-center px-4 text-center md:px-0">
            <Reveal delay={0.08} duration={1.2}>
              <div className="flex flex-col items-center justify-center">
                <Head1 className="text-white">
                  Who&apos;s Not on LinkedIn?
                </Head1>
                <h2 className="mb-12 mt-8 max-w-[760px] text-sm font-light text-hgray700 md:mb-20 md:text-lg">
                  Harper는 링크드인 뿐만 아니라 코드, 논문 등 다양한 출처를
                  분석해
                  <br />
                  링크드인 계정이 없는 인재도 발견합니다.
                </h2>
              </div>
            </Reveal>

            <Reveal
              delay={0.08}
              className="w-full flex items-center justify-center"
            >
              <CandidateGithubCardDark />
            </Reveal>
            <Reveal
              delay={0.08}
              className="w-full flex items-center justify-center"
            >
              <ScholarProfile />
            </Reveal>
          </div>
        </BaseSectionLayout>

        <div className="h-24 md:h-48" />
        <LinkedinHarperCompare />
        {/* <div className="h-28 md:h-40" /> */}
        {/* <CompareSection /> */}

        <div id={RadarSection.Pricing} className="h-28 md:h-40" />
        <PricingSection onClick={handlePricingPlanClick} />

        <div className="h-28 md:h-40" />
        <FounderNote />

        <div className="h-28 md:h-40" />
        <Reveal delay={0.08}>
          <BaseSectionLayout>
            <div className="flex flex-col items-center justify-center w-full pt-4">
              <div className="w-full flex flex-col items-center justify-center pb-2">
                <Head1 className="text-white">
                  {m.companyLanding.faq.title}
                </Head1>
                <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-12 px-4 md:px-0">
                  {m.companyLanding.faq.items.map((item, index) => (
                    <QuestionAnswer
                      key={item.question}
                      question={item.question}
                      answer={item.answer}
                      index={index}
                      onOpen={() => {}}
                      length={m.companyLanding.faq.items.length}
                    />
                  ))}
                </div>
              </div>
            </div>
          </BaseSectionLayout>
        </Reveal>

        <div className="h-28 md:h-40" />
        <Animate duration={0.8}>
          <section className="relative w-full overflow-hidden bg-black py-10">
            <PixelBackground count={380} className="absolute inset-0" />
            <div className="absolute left-0 top-0 h-[50%] w-full bg-gradient-to-t from-transparent to-black" />

            <div className="relative z-10 mx-auto flex w-full max-w-[1000px] flex-col items-center justify-center px-4 py-20 text-white md:py-36 md:pb-48">
              <h2 className="mt-7 text-center text-3xl font-medium leading-[1.15] text-white/95 md:text-4xl">
                Repos and Papers
                <br />
                are our talent pool.
              </h2>

              <p className="mt-5 max-w-[620px] text-center text-[15px] leading-7 text-hgray700 md:text-[18px]">
                하퍼와 함께 진짜 인재를 찾아보세요.
              </p>

              <StartButton
                onClick={handlePrimaryStart}
                label={"무료로 시작하기"}
              />
              <div className="mt-32 w-full md:flex hidden">
                <FallingTagsMl theme="dark" startDelay={800} />
              </div>
            </div>
          </section>
        </Animate>

        <Footer onClickStart={handleFooterStart} />
      </main>
    </>
  );
}

type PixelBackgroundProps = {
  count?: number;
  className?: string;
};

function PixelBackground({
  count = 120,
  className = "",
}: PixelBackgroundProps) {
  const pixels = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: Math.random() > 0.85 ? "w-1 h-1" : "w-px h-px",
        opacity:
          Math.random() > 0.7
            ? "opacity-100"
            : Math.random() > 0.4
              ? "opacity-70"
              : "opacity-40",
      })),
    [count]
  );

  return (
    <div className="absolute inset-0">
      {pixels.map((pixel) => (
        <span
          key={pixel.id}
          className={`absolute block bg-white ${pixel.size} ${pixel.opacity} hover:bg-[#00A335]`}
          style={{
            left: pixel.left,
            top: pixel.top,
          }}
        />
      ))}
    </div>
  );
}
