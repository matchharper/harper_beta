import Reveal from "@/components/landing/Animation/Reveal";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBar";
import CareerEmailOnboardingModal from "@/components/landing/career/CareerEmailOnboardingModal";
import CareerHeroSection from "@/components/landing/career/CareerHeroSection";
import LandingButton from "@/components/landing/career/CareerLandingButton";
import SocialProofSection from "@/components/landing/career/SocialProofSection";
import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  CAREER_LANDING_ABTEST_TYPE,
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_DEFAULT_SOURCE,
  CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
  readCareerUtmSourceFromSearch,
  resolveCareerUtmSource,
} from "@/lib/careerUtm";
import {
  buildLandingLoginEmailType,
  withLandingLogSource,
} from "@/lib/landingLogTypes";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangleIcon,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  FileX2,
  Mail,
  Minus,
  Radar,
  Scan,
  User2,
  UserRoundCheck,
} from "lucide-react";
import { motion } from "motion/react";
import DemoSection from "@/components/landing/career/DemoSection";
import {
  CAREER_EMAIL_ONBOARDING_ABTEST_TYPE,
  CAREER_EMAIL_ONBOARDING_VARIANT,
} from "@/lib/careerEmailOnboarding/constants";
import { resolveCareerOnboardingLandingVariant } from "@/lib/careerEmailOnboarding/experiment";

const CAREER_AUTHENTICATED_START_HREF = "/career";
const CAREER_ONBOARDING_HREF = "/career/onboarding";
const CAREER_EMAIL_ONBOARDING_OVERRIDE_PARAM = "career_onboarding_variant";
// Temporarily disable the email onboarding A/B route; CTA should use login.
const CAREER_EMAIL_ONBOARDING_AB_TEST_ENABLED = false;
const CAREER_LANDING_LAST_VISIT_AT_KEY = "harper_career_landing_last_visit_at";
const CAREER_LANDING_SESSION_GAP_MS = 30 * 60 * 1000;
const SHOW_LOCAL_EMAIL_ONBOARDING_TEST = process.env.NODE_ENV === "development";

const buildCareerLoginHref = (source: string, landingId: string) => {
  const params = new URLSearchParams({
    next: CAREER_ONBOARDING_HREF,
    source: resolveCareerUtmSource(source),
  });
  if (landingId) params.set("lid", landingId);
  return `/career_login?${params.toString()}`;
};

const createCareerLandingId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const workflowCards = [
  {
    title: "대화로 나를 소개",
    body: "전화나 채팅으로 Harper에게 커리어 이야기와 비자, 연봉, 팀 규모 같은 조건을 편하게 들려주세요. 이력서를 다시 쓸 필요 없어요.",
    visual: "conversation",
  },
  {
    title: "Harper가 중간에서 연결 및 제안",
    body: "Harper에게 인재 채용을 요청한 회사들 중, 회원님이 좋아하실 기회를 제안해드립니다.",
    visual: "jobs",
  },
  {
    title: "수락시 담당자와 직접 연결",
    body: "수락만 해주세요. Harper가 hiring manager 또는 창업자와 직접 미팅을 세팅하고, 그 자리에서 회원님이 빛날 수 있도록 준비까지 도와드려요.",
    visual: "intro",
  },
] as const;

const matchFlowCards = [
  {
    title: "기회를 먼저 추천합니다.",
    body: "회원님의 기준을 통과한 회사와 기회만 Harper가 먼저 브리핑합니다. 관심 있다고 답한 기회만 Founder 소개로 이어져요.",
    visual: "candidate-first",
  },
  {
    title: "회사에게 먼저 회원님을 제안합니다.",
    body: "양측 모두 좋아할 것이라는 확신이 들 때, 익명 요약 프로필을 먼저 회사에게 제안합니다. 회사가 확인 후 회원님에게 먼저 연결 요청이 오게됩니다.",
    visual: "company-first",
  },
] as const;

const howRows = [
  {
    icon: UserRoundCheck,
    title: "회사가 아니라, 탤런트가 중심.",
    body: (
      <>
        시장에 깔린 뻔한 선택지들에 나를 맞추지 마세요. 최고의 기회는 소리 없이
        움직입니다. Harper는 인재의 가치를 먼저 정의하고, 그 가치가 빛날 최적의
        순간을 포착해 연결합니다.
      </>
    ),
  },
  {
    icon: FileX2,
    title: "이력서의 시대는 끝났습니다.",
    body: (
      <>
        종이 한 장으로는 탤런트의 역량 5%도 채 담아낼 수 없기 때문입니다. 매번
        서류를 고치는 대신 Harper에게 최근의 성과를 편하게 들려주세요. 대화로
        실시간 업데이트되는 프로필이, 가만히 있어도 가장 최신의 나에게 맞는
        기회를 가져옵니다.
      </>
    ),
  },
  {
    icon: Scan,
    title: "항상 조용히 기회를 찾습니다.",
    body: (
      <>
        좋은 기회는 내가 이직을 결심한 순간에 맞춰 열리지 않습니다. 당신이
        지금의 일에 몰입하는 동안에도 Harper는 뒤에서 조용히 60만+개의 국내외
        기회를 살피고, 기준에 맞는 기회가 나타나는 순간만 골라 가져옵니다.
      </>
    ),
  },
  {
    icon: BriefcaseBusiness,
    title: "풀타임 뿐만 아니라 파트타임과 단건 작업까지.",
    body: (
      <>
        정규직이라는 틀을 넘어, 당신의 역량이 필요한 모든 곳을 연결합니다.
        본업을 유지하면서도 가치를 증명할 수 있는 단기 기술 자문부터
        파트타임까지, 당신의 역량이 빛날 모든 가능성을 제공합니다.
      </>
    ),
  },
] as const;

const voices = [
  {
    quote:
      "한국에서는 이런 글로벌 기회가 있다는 것조차 몰랐어요. 그런데 Harper에게 CTO를 직접 연결받았고, 이제 곧 합류할 예정이에요.",
    initial: "",
    name: "익명 요청",
    role: "ML Engineer → AI Engineer at SF Startup",
    status: "",
  },
  {
    quote:
      "제 전문성이 이런 식으로도 쓰일 수 있다는 걸 몰랐어요. 본업은 그대로 유지하고 있는데, Harper가 파트타임 두 건을 연결해줬어요.",
    initial: "/images/person3.png",
    name: "Soyeon L.",
    role: "Staff Engineer, Infrastructure",
    status: "파트타임 2건 진행",
  },
  {
    quote:
      "이미 한번 대화한 사람을 소개받으니 Harper의 추천은 인터뷰까지는 바로 진행했어요. 진짜 헤드헌터와 대화하는 줄 알았습니다.",
    initial: "P",
    name: "Patrick",
    role: "해외 유니콘 스타트업 채용담당자",
    status: "면접 진행 12건",
  },
] as const;

export const WavyTag = ({
  left,
  children,
}: {
  left: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="wavy-underline">
      <div className="text-[13px] flex flex-row gap-2 font-medium text-beige700">
        <span>{children}</span>
      </div>
    </div>
  );
};

const useCareerStartHref = (source: string, landingId: string) => {
  const user = useAuthStore((state) => state.user);
  const session = useAuthStore((state) => state.session);
  const authLoading = useAuthStore((state) => state.loading);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setNeedsOnboarding(null);
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setNeedsOnboarding(true);
      return;
    }

    let cancelled = false;

    const loadOnboardingStatus = async () => {
      setNeedsOnboarding(null);

      try {
        const response = await fetch("/api/talent/onboarding/status", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const payload = (await response.json().catch(() => ({}))) as {
          needsOnboarding?: boolean;
        };

        if (cancelled) return;

        if (!response.ok) {
          setNeedsOnboarding(true);
          return;
        }

        setNeedsOnboarding(payload.needsOnboarding !== false);
      } catch {
        if (!cancelled) {
          setNeedsOnboarding(true);
        }
      }
    };

    void loadOnboardingStatus();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, user]);

  if (authLoading || !user) {
    return buildCareerLoginHref(source, landingId);
  }

  if (needsOnboarding !== false) {
    return CAREER_ONBOARDING_HREF;
  }

  return CAREER_AUTHENTICATED_START_HREF;
};

const CheckIcon = () => {
  return (
    <div className="flex items-center justify-center h-3.5 w-3.5 rounded-full bg-green-700/90">
      <Check className="text-white h-2 w-2" strokeWidth={2.8} />
    </div>
  );
};

const UnknownIcon = () => {
  return (
    <div className="flex items-center justify-center h-3.5 w-3.5 rounded-full bg-beige900/10 text-[10px] font-medium">
      ?
    </div>
  );
};

function WorkflowVisual({
  type,
}: {
  type: (typeof workflowCards)[number]["visual"];
}) {
  if (type === "conversation") {
    const bubbleStyle =
      "rounded-xl font-medium px-3.5 py-2 text-[12.5px] leading-[1.45]";
    return (
      <>
        <div
          className={`${bubbleStyle} bg-beige900 text-beige50 ml-auto w-fit max-w-[85%]`}
        >
          나랑 잘 맞는 포지션 있어?
        </div>
        <div
          className={`${bubbleStyle} border border-neutral-1000-a10 bg-bg-floating text-neutral-primary w-fit max-w-[82%]`}
        >
          조건을 들려주시면 바로 찾아볼게요.
          <br />
          지금 얼마나 이직에 열려 있으세요?
        </div>
        <div
          className={`${bubbleStyle} bg-beige900 text-beige50 ml-auto w-fit max-w-[90%]`}
        >
          강하진 않아. 기준을 통과하는 곳들은 만나는 보고싶어
        </div>
      </>
    );
  }

  if (type === "jobs") {
    return (
      <>
        {[
          [
            "Anthropic · 풀타임",
            <>
              <CheckIcon />
              <CheckIcon />
              <CheckIcon />
            </>,
            "시니어 ML 엔지니어 · H-1B 스폰서",
          ],
          [
            "Cursor · 단기 파트타임",
            <>
              <CheckIcon />
              <CheckIcon />
              <UnknownIcon />
            </>,
            "데이터 보안 자문 · 월 약 10시간",
          ],
        ].map(([company, fit, body]) => (
          <div key={`${company}`} className="rounded-lg bg-beige50 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-beige900">
                {company}
              </span>
              <span className="flex flex-row items-center gap-1.5 text-xs">
                {fit}
              </span>
            </div>
            <div className="mt-1 text-[12px] leading-snug text-black/55">
              {body}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {[
        [
          "Harper",
          "Anthropic Hiring Manager와 커피챗",
          "Inference 팀 리더가 이번 주 30분을 비워뒀어요.",
          "방금",
        ],
        [
          "Harper",
          "Cursor Founder와 1:1",
          "Michael이 금요일 오전 가능하다고 전해왔어요.",
          "4시간 전",
        ],
      ].map(([sender, title, body, time]) => (
        <div
          key={title}
          className="flex items-start gap-2.5 rounded-xl border border-beige900/10 bg-white px-3 py-2.5"
        >
          <div
            aria-label="Gmail"
            className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-white bg-size-[24px_24px] bg-center bg-no-repeat"
            style={{ backgroundImage: "url('/svgs/gmail.svg')" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-semibold text-beige900">
                {sender}
              </span>
              <span className="shrink-0 text-[10px] text-black/40">{time}</span>
            </div>
            <div className="truncate text-[13px] font-semibold text-beige900">
              {title}
            </div>
            <div className="truncate text-[11px] text-black/55">{body}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function BranchArrow({
  d,
  delay,
  opacity = 1,
  strokeWidth = 2.6,
}: {
  d: string;
  delay: number;
  opacity?: number;
  strokeWidth?: number;
}) {
  return (
    <motion.path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={{
        hidden: { pathLength: 0, opacity: 0 },
        visible: {
          pathLength: 1,
          opacity,
          transition: {
            delay,
            duration: 0.95,
            ease: [0.22, 1, 0.36, 1],
          },
        },
      }}
    />
  );
}

function MatchFlowVisual({
  type,
}: {
  type: (typeof matchFlowCards)[number]["visual"];
}) {
  if (type === "candidate-first") {
    return (
      <div className="relative h-[280px] flex flex-col items-center justify-center overflow-hidden p-4">
        <Image
          src="/images/feat33.png"
          alt="회사에게 먼저 회원님을 제안하는 Harper 화면"
          width={400}
          height={225}
          className="h-auto max-h-[190px] w-auto max-w-full object-contain"
        />
        <div className="mt-2 px-0.5 text-[12px] font-medium text-beige900/75">
          Harper에게 인재 추천을 요청한 회사가 있는데, Chris님이 좋아하실 것
          같아요. 한번 만나보시겠어요? 아니면 우선 팔로우만 할까요?
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[280px] overflow-hidden bg-beige50">
      <Image
        src="/images/feat3.png"
        alt="회사에게 먼저 회원님을 제안하는 Harper 화면"
        width={571}
        height={375}
        className="h-full w-full object-cover object-top-left"
      />
    </div>
  );
}

export default function LandingKoVfPage() {
  const router = useRouter();
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const [landingId, setLandingId] = useState("");
  const marketingSource = useMemo(() => {
    const querySource =
      typeof router.query.source === "string"
        ? normalizeCareerUtmSource(router.query.source)
        : null;
    if (querySource) return querySource;
    if (typeof window === "undefined") return CAREER_UTM_DEFAULT_SOURCE;
    return (
      normalizeCareerUtmSource(
        localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
      ) ?? CAREER_UTM_DEFAULT_SOURCE
    );
  }, [router.query.source]);
  const careerStartHref = useCareerStartHref(marketingSource, landingId);
  const [emailOnboardingModalOpen, setEmailOnboardingModalOpen] =
    useState(false);
  const hasLoggedFirstScrollRef = useRef(false);

  const addLandingLog = useCallback(
    async (
      type: string,
      overrides?: { localId?: string; source?: string | null }
    ) => {
      const storedLocalId =
        typeof window !== "undefined"
          ? (localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY) ?? "")
          : "";
      const storedSource =
        typeof window !== "undefined"
          ? localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
          : null;
      const resolvedLocalId = overrides?.localId || landingId || storedLocalId;
      const resolvedSource = resolveCareerUtmSource(
        overrides?.source ?? marketingSource ?? storedSource
      );
      if (!resolvedLocalId) return false;

      try {
        const { error } = await supabase.from("landing_logs").insert({
          local_id: resolvedLocalId,
          type: withLandingLogSource(type, resolvedSource),
          abtest_type: CAREER_LANDING_ABTEST_TYPE,
          is_mobile: isMobile,
          country_lang: countryLang,
        });

        if (error) {
          console.error("career landing log insert error:", error);
          return false;
        }
        return true;
      } catch (error) {
        console.error("career landing log insert error:", error);
        return false;
      }
    },
    [countryLang, isMobile, landingId, marketingSource]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const querySource = readCareerUtmSourceFromSearch(window.location.search);
    const savedSource = normalizeCareerUtmSource(
      localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
    );
    const resolvedSource =
      querySource ?? savedSource ?? CAREER_UTM_DEFAULT_SOURCE;
    localStorage.setItem(CAREER_UTM_SOURCE_STORAGE_KEY, resolvedSource);

    const savedId = localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY);
    const resolvedLandingId = savedId || createCareerLandingId();

    if (!savedId) {
      localStorage.setItem(
        CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
        resolvedLandingId
      );
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      setLandingId(resolvedLandingId);
      void addLandingLog("new_visit", {
        localId: resolvedLandingId,
        source: resolvedSource,
      });
      return;
    }

    setLandingId(savedId);

    if (querySource && querySource !== savedSource) {
      localStorage.setItem(
        CAREER_LANDING_LAST_VISIT_AT_KEY,
        Date.now().toString()
      );
      void addLandingLog("new_session", {
        localId: savedId,
        source: querySource,
      });
    }
  }, [addLandingLog]);

  useEffect(() => {
    if (!landingId || typeof window === "undefined") return;

    const now = Date.now();
    const lastVisitRaw = localStorage.getItem(CAREER_LANDING_LAST_VISIT_AT_KEY);
    const lastVisitAt = lastVisitRaw ? Number(lastVisitRaw) : null;

    if (
      lastVisitAt &&
      Number.isFinite(lastVisitAt) &&
      now - lastVisitAt >= CAREER_LANDING_SESSION_GAP_MS
    ) {
      void addLandingLog("new_session");
    }

    localStorage.setItem(CAREER_LANDING_LAST_VISIT_AT_KEY, now.toString());
  }, [addLandingLog, landingId]);

  useEffect(() => {
    if (!landingId) return;

    const handleScroll = () => {
      if (hasLoggedFirstScrollRef.current || window.scrollY <= 0) return;

      hasLoggedFirstScrollRef.current = true;
      void addLandingLog("first_scroll_down");
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [addLandingLog, landingId]);

  useEffect(() => {
    if (
      !landingId ||
      !user?.id ||
      !user.email ||
      typeof window === "undefined"
    ) {
      return;
    }

    const email = user.email;
    const source = resolveCareerUtmSource(marketingSource);
    const storageKey = `${CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX}:${user.id}:${landingId}:${source}`;
    if (localStorage.getItem(storageKey)) return;

    void (async () => {
      const didLog = await addLandingLog(
        buildLandingLoginEmailType(email, source)
      );
      if (didLog) localStorage.setItem(storageKey, "1");
    })();
  }, [addLandingLog, landingId, marketingSource, user?.email, user?.id]);

  const handleCareerStartClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      void addLandingLog("click_start");

      if (CAREER_EMAIL_ONBOARDING_AB_TEST_ENABLED) {
        const override =
          typeof router.query[CAREER_EMAIL_ONBOARDING_OVERRIDE_PARAM] ===
          "string"
            ? router.query[CAREER_EMAIL_ONBOARDING_OVERRIDE_PARAM]
            : null;
        const variant = resolveCareerOnboardingLandingVariant({
          localId: landingId,
          override,
          salt: CAREER_EMAIL_ONBOARDING_ABTEST_TYPE,
        });

        if (
          !authLoading &&
          !user &&
          variant === CAREER_EMAIL_ONBOARDING_VARIANT
        ) {
          void addLandingLog("email_onboarding_modal_open");
          setEmailOnboardingModalOpen(true);
          return;
        }
      }

      void router.push(careerStartHref);
    },
    [addLandingLog, authLoading, careerStartHref, landingId, router, user]
  );

  const handleEmailOnboardingWebStart = useCallback(() => {
    void addLandingLog("email_onboarding_web_login_click");
    setEmailOnboardingModalOpen(false);
    void router.push(careerStartHref);
  }, [addLandingLog, careerStartHref, router]);

  const handleLocalEmailOnboardingTestClick = useCallback(() => {
    void addLandingLog("email_onboarding_local_test_open");
    setEmailOnboardingModalOpen(true);
  }, [addLandingLog]);

  const h1style =
    "text-[20px] font-semibold leading-[1.4] text-beige900 md:text-[36px]";
  const h3style =
    "text-black font-medium text-[16px] md:text-[20px] leading-[1.7]";
  const pstyle =
    "font-normal text-[13px] md:text-[14px] leading-[1.5] text-black/80";
  const descstyle =
    "font-normal text-[13px] md:text-[15px] leading-[1.5] text-black/60";

  return (
    <>
      <Head>
        <title>Harper — 나를 위한 완벽한 기회, 이제 agent가 찾아옵니다.</title>
        <meta
          name="description"
          content="Harper는 오직 탤런트만을 위한 AI 커리어 agent입니다. 풀타임 정규직부터 어드바이저리, 전문가 콜까지 당신의 전문성에 맞는 모든 기회를 대화로 전달합니다."
        />
        <link rel="alternate" hrefLang="en" href="https://matchharper.com/" />
        <link rel="alternate" hrefLang="ko" href="https://matchharper.com/ko" />
        <link
          rel="alternate"
          hrefLang="x-default"
          href="https://matchharper.com/"
        />
        <link rel="icon" href="/images/logo.ico" />
      </Head>

      <div
        id="top"
        className="min-h-screen overflow-x-clip break-keep bg-beige50 text-beige900 antialiased font-sans"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
        />

        <CareerEmailOnboardingModal
          abtestType={CAREER_EMAIL_ONBOARDING_ABTEST_TYPE}
          countryLang={countryLang}
          forceResend={SHOW_LOCAL_EMAIL_ONBOARDING_TEST}
          isMobile={isMobile}
          localId={landingId || "local-email-onboarding-test"}
          onClose={() => {
            void addLandingLog("email_onboarding_modal_close");
            setEmailOnboardingModalOpen(false);
          }}
          onSubmitted={() =>
            void addLandingLog("email_onboarding_submit_success")
          }
          onWebStart={handleEmailOnboardingWebStart}
          open={emailOnboardingModalOpen}
          variant={CAREER_EMAIL_ONBOARDING_VARIANT}
        />
        {SHOW_LOCAL_EMAIL_ONBOARDING_TEST ? (
          <button
            type="button"
            onClick={handleLocalEmailOnboardingTestClick}
            className="fixed bottom-4 left-4 z-[70] inline-flex h-9 items-center gap-2 rounded-lg border border-beige900/15 bg-beige50/95 px-3 text-xs font-semibold text-beige900 shadow-[0_10px_30px_rgba(37,20,6,0.14)] backdrop-blur transition hover:border-beige900/25 hover:bg-white"
          >
            <Mail className="h-3.5 w-3.5" />
            메일 온보딩 테스트
          </button>
        ) : null}

        <main>
          <CareerHeroSection
            careerStartHref={careerStartHref}
            onCareerStartClick={handleCareerStartClick}
          />

          <SocialProofSection />

          <DemoSection
            header={
              <Reveal once>
                <WavyTag left="1.">외부 기회 탐색</WavyTag>
                <h2 className={`${h1style} mt-5`}>
                  “이런 역할 찾아줘”
                  <br />
                  가벼운 대화 한 번이면 충분합니다.
                </h2>
                <p className={`${descstyle} mt-4`}>
                  채용 사이트를 뒤지며 비자 지원이 가능한 스타트업을 일일이
                  리서치할 필요가 없습니다.
                  <br />
                  원하는 조건을 가볍게 이야기해두면 Harper가 모든 기회를
                  스캔하여
                  <br />
                  풀타임, 파트타임, 단기 자문까지 찾아 알려드립니다.
                </p>
              </Reveal>
            }
          />

          <section
            id="workflow"
            className="mx-auto max-w-[1240px] px-4 py-20 text-center md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="mx-auto max-w-[860px]">
                <WavyTag left="2.">직접 연결</WavyTag>
                <h2 className={`${h1style} mt-5`}>
                  Founder에게 회원님을 직접 소개 합니다.
                </h2>
                <p className={`${descstyle} mt-4`}>
                  채용 공고를 뒤지고, 지원하고, 또 기다리고. 반복되는 구직의
                  피로는 이제 끝.
                  <br />
                  Harper는 좋은 인재를 찾는 회사들과 직접 이야기하며, 당신을
                  위한 헤드헌터처럼 일해요.
                </p>
              </div>
            </Reveal>

            <div className="mt-12 grid grid-cols-1 gap-10 text-left md:mt-16 lg:grid-cols-3 md:gap-5">
              {workflowCards.map((card, index) => (
                <Reveal key={card.title} once delay={index * 0.08}>
                  <div className="flex h-full flex-col">
                    <div className="relative rounded-[8px] overflow-hidden bg-orange-200/20 p-4 flex flex-col justify-center gap-3 h-[220px] md:h-[240px]">
                      {/* {card.visual === "conversation" && (
                        <div>
                          <Image
                            src="/images/orangesky2.jpg"
                            alt="Harper 대화 화면"
                            width={400}
                            height={225}
                            className="absolute top-0 left-0 -z-10 h-full w-full object-cover"
                          />
                        </div>
                      )} */}
                      <WorkflowVisual type={card.visual} />
                    </div>
                    <div className={`${h3style} mt-4 items-baseline`}>
                      {card.title}
                    </div>
                    <p className={`${pstyle} mt-1`}>{card.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.22 }}
              className="mx-auto mt-12 max-w-[980px] md:mt-0"
            >
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
                className="md:hidden mx-auto inline-flex items-center gap-2 rounded-full border border-beige900/10 bg-beige50/80 px-4 py-2 text-[13px] font-medium text-beige900/70 shadow-[0_10px_30px_rgba(46,23,6,0.06)]"
              >
                <span className="h-2 w-2 rounded-full bg-beige700" />
                Harper가 중간에서 연결 및 제안
              </motion.div>

              <div className="relative mx-auto mt-2 h-[150px] max-w-[880px] text-beige700 md:h-[198px]">
                <motion.svg
                  className="hidden h-full w-full overflow-visible md:block"
                  viewBox="0 0 900 210"
                  aria-hidden="true"
                >
                  <BranchArrow d="M450 8 C451 32 447 56 450 82" delay={0.12} />
                  <BranchArrow
                    d="M450 82 C414 103 360 121 306 149 C254 176 218 191 198 204"
                    delay={0.42}
                  />
                  <BranchArrow
                    d="M450 82 C486 103 540 121 594 149 C646 176 682 191 702 204"
                    delay={0.42}
                  />
                  <BranchArrow
                    d="M198 204 C201 192 204 185 211 178"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M198 204 C210 201 217 198 226 192"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M702 204 C699 192 696 185 689 178"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M702 204 C690 201 683 198 674 192"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M454 86 C419 109 363 128 312 153 C260 178 224 194 204 207"
                    delay={0.52}
                    opacity={0.28}
                    strokeWidth={1.2}
                  />
                  <BranchArrow
                    d="M446 86 C481 109 537 128 588 153 C640 178 676 194 696 207"
                    delay={0.52}
                    opacity={0.28}
                    strokeWidth={1.2}
                  />
                </motion.svg>

                <motion.svg
                  className="h-full w-full overflow-visible md:hidden"
                  viewBox="0 0 360 170"
                  aria-hidden="true"
                >
                  <BranchArrow d="M180 4 C182 28 178 50 180 68" delay={0.12} />
                  <BranchArrow
                    d="M180 68 C151 91 123 105 102 125 C90 136 82 147 78 160"
                    delay={0.42}
                  />
                  <BranchArrow
                    d="M180 68 C209 91 237 105 258 125 C270 136 278 147 282 160"
                    delay={0.42}
                  />
                  <BranchArrow d="M78 160 C82 151 86 146 93 141" delay={1.05} />
                  <BranchArrow
                    d="M78 160 C88 159 94 156 101 151"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M282 160 C278 151 274 146 267 141"
                    delay={1.05}
                  />
                  <BranchArrow
                    d="M282 160 C272 159 266 156 259 151"
                    delay={1.05}
                  />
                </motion.svg>
              </div>

              <div className="grid grid-cols-1 gap-5 text-left md:grid-cols-2">
                {matchFlowCards.map((card, index) => (
                  <Reveal key={card.title} once delay={0.18 + index * 0.1}>
                    <div className="flex h-full flex-col">
                      <div className="rounded-[8px] bg-orange-200/20 p-4 flex flex-col justify-center gap-3 h-[320px]">
                        <MatchFlowVisual type={card.visual} />
                      </div>
                      <h3 className={`${h3style} mt-4`}>{card.title}</h3>
                      <p className={`${pstyle} mt-1`}>{card.body}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </motion.div>
          </section>

          <section className="mx-auto max-w-[1400px] px-4 py-20 text-center md:px-10 md:py-40 bg-beige100">
            <h2 className="text-left md:text-center mx-auto mt-5 font-semibold text-[24px] leading-[1.4] text-beige900 md:text-[36px]">
              <span className="block">
                최고의 선수들에겐 <br className="block md:hidden" />
                전담 에이전트가 있습니다.
              </span>
              <span className="mt-1 block">
                나를 위한 에이전트, 한 번쯤 상상해 보지 않으셨나요?
              </span>
              <span className="mt-1 block">그래서 저희가 만들었습니다.</span>
            </h2>
            <div>
              <p
                className={`text-left md:text-center leading-[1.7] text-[13px] md:text-base mx-auto mt-10 max-w-[700px] text-beige900/50 font-medium`}
              >
                뛰어난 선수가 경기에만 집중하듯, 당신은{" "}
                <span className="text-beige900">지금의 일과 성장</span>
                에만 집중하세요. Harper가 대신해서 기회를 찾고 연결까지
                해드릴게요. 수수료를 위해 기업 편에 서는 헤드헌터와 달리,
                Harper는 철저히{" "}
                <span className="text-beige900">
                  당신의 이익만을 대변합니다.
                </span>{" "}
                허락하기 전까지{" "}
                <span className="text-beige900">완벽한 익명</span>을 보장하며,
                오직 당신이 설정한 까다로운 기준을 통과한 기회들만{" "}
                <span className="text-beige900">조용히 찾아옵니다.</span>
              </p>
            </div>
          </section>

          <section
            id="how"
            className="mx-auto max-w-[1200px] px-4 py-20 md:px-10 md:py-32"
          >
            <Reveal once>
              <div className="flex flex-col items-start gap-4 md:flex-row md:justify-between md:items-end">
                <h2 className={`${h1style}`}>
                  Harper는,
                  <br />
                  이렇게 달라요.
                </h2>
                <p
                  className={`${descstyle} max-w-[460px] text-left md:text-right`}
                >
                  지금까지 받아오신 리크루터 연락, 채용 공고, LinkedIn DM과{" "}
                  <br className="hidden md:block" />
                  Harper가 다른 네 가지 지점.
                </p>
              </div>
            </Reveal>

            <div className="mt-6 flex flex-col md:mt-12">
              {howRows.map((row, index) => {
                const Icon = row.icon;

                return (
                  <Reveal key={row.title} once delay={index * 0.06}>
                    <div className="grid grid-cols-1 gap-3 border-t border-beige900/10 py-8 md:grid-cols-[1fr_1fr] md:gap-10 md:py-10">
                      <div className="flex flex-row items-center justify-start gap-4">
                        <Icon
                          aria-hidden="true"
                          className="h-5 w-5 md:h-6 md:w-6 mt-0.5"
                          strokeWidth={2.2}
                        />
                        <h3 className={`${h3style}`}>{row.title}</h3>
                      </div>
                      <p className={`${pstyle}`}>{row.body}</p>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </section>

          <section
            id="voices"
            className="bg-beige900 px-4 py-20 text-beige50 md:px-10 md:py-32"
          >
            <div className="mx-auto max-w-[1200px]">
              <Reveal once>
                <WavyTag left="4.">먼저 경험한 분들의 이야기</WavyTag>
                <h2 className="mt-5 max-w-[860px] font-semibold text-[24px] leading-[1.4] md:text-[36px]">
                  Harper를 먼저 만난 사람들은
                  <br />
                  구직 중이 아니었습니다.
                  <br />
                  기회가 먼저 찾아왔죠.
                </h2>
              </Reveal>

              <div className="mt-14 grid grid-cols-1 gap-5 md:mt-16 lg:grid-cols-3">
                {voices.map((voice, index) => (
                  <Reveal key={voice.name} once delay={index * 0.08}>
                    <div className="h-full md:mt-0 mt-6">
                      <div className="text-[14px] text-white/90 font-sans leading-[1.5] px-8 h-[120px] md:h-[160px] font-medium flex items-center justify-center rounded-[8px] bg-orange-200/10">
                        {voice.quote}
                      </div>
                      <div className="mt-0 flex items-start gap-3 pt-3 md:pt-5">
                        {voice.initial.includes("images") ? (
                          <Image
                            src={voice.initial}
                            alt={voice.name}
                            width={28}
                            height={28}
                            className="h-7 w-7 rounded-full object-cover mt-1"
                          />
                        ) : (
                          <div className="flex mt-1 h-7 w-7 items-center justify-center rounded-full bg-beige700 text-base italic text-beige50">
                            <User2 className="w-5 h-5" strokeWidth={1.3} />
                          </div>
                        )}
                        <div>
                          <div className="text-[13px] font-medium">
                            {voice.name}
                          </div>
                          <div className="text-[13px] text-beige200/50 flex flex-row gap-2 items-center">
                            {voice.role}
                            {voice.status && (
                              <div className="flex items-center gap-1.5 text-[10px] font-medium text-beige700">
                                <span className="h-1.5 w-1.5 rounded-full bg-beige700" />
                                {voice.status}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>

          <section
            id="cta"
            className="bg-beige200 px-4 py-24 text-center md:px-10 md:py-40"
          >
            <Reveal once>
              <h2 className={`${h1style}`}>
                모두가 원했지만 누구도 가지지 못했던,
                <br />
                당신만을 위해 움직이는 Agent.
              </h2>
            </Reveal>
            <Reveal once delay={0.08}>
              <p className="mx-auto mt-6 max-w-[620px] text-[15px] leading-[1.75] text-beige900/80 md:text-lg">
                신청하고 기다릴 필요 없이 바로 시작하세요. 몇 분만 대화하면
                Harper가 회원님의 기준을 이해하고, 지금 맞는 기회를 조용히
                스캔하기 시작합니다.
              </p>
            </Reveal>
            <Reveal once delay={0.16} className="mt-10">
              <LandingButton
                href={careerStartHref}
                label="Talk to Harper"
                onClick={handleCareerStartClick}
              />
            </Reveal>
          </section>

          <CareerLandingFooter
            careerStartHref={careerStartHref}
            onCareerStartClick={handleCareerStartClick}
          />
        </main>
      </div>
    </>
  );
}
