import Animate from "@/components/landing/Animate";
import GithubFooter from "@/components/landing/GithubFooter";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Head1 from "@/components/landing/Head1";
import CandidateGithubCardDark from "@/components/landing/Rad";
import ScholarProfile from "@/components/landing/ScholarProfile";
import { DropdownMenu } from "@/components/ui/menu";
import { useMessages } from "@/i18n/useMessage";
import { en } from "@/lang/en";
import { supabase } from "@/lib/supabase";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  FolderOpen,
  Github,
  GraduationCap,
  Menu,
  Search,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import dynamic from "next/dynamic";
import Head from "next/head";
import Link from "next/link";
import router from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import CompareSection from "@/components/landing/Compare";
import PricingSection from "@/components/landing/PricingScholar";
import { FallingTagsMl } from "@/components/landing/FallingTagsML";
import { OrbitIconsSmall } from "@/components/landing/Orbit";
import Reveal from "@/components/landing/Animation/Reveal";

const LoginModal = dynamic(() => import("@/components/Modal/LoginModal"));
const RADAR_LOGIN_MODAL_LANGUAGE = "en" as const;
const RADAR_LOGIN_MODAL_COPY = {
  sessionExpired: "Your login session has expired. Please sign in again.",
  bootstrapFailed: "Failed to initialize your account. Please try again.",
};

const START_BUTTON_LABEL = "Try for Free";
const PLACEHOLDER_SWITCH_MS = 2800;
const PLACEHOLDER_SLIDE_MS = 450;
const PLACEHOLDER_LINE_HEIGHT_PX = 24;

const HERO_DOT_BACKGROUND_STYLE = {
  opacity: 0.4,
  backgroundImage:
    "radial-gradient(rgba(255,255,255,0.16) 0.9px, transparent 0.9px)",
  backgroundSize: "20px 20px",
};

enum RadarSection {
  Intro = "intro",
  Coverage = "coverage",
  Outputs = "outputs",
  Pricing = "pricing",
}

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

const RADAR_SECTION_LABELS: Record<RadarSection, string> = {
  [RadarSection.Intro]: "Intro",
  [RadarSection.Coverage]: "Coverage",
  [RadarSection.Outputs]: "Outputs",
  [RadarSection.Pricing]: "Pricing",
};

const RADAR_NAV_SECTIONS: RadarSection[] = [
  RadarSection.Intro,
  RadarSection.Coverage,
  RadarSection.Outputs,
  RadarSection.Pricing,
];

const navItems = RADAR_NAV_SECTIONS.map((section) => ({
  section,
  label: RADAR_SECTION_LABELS[section],
}));

function getRadarSectionHref(section: RadarSection) {
  return `#${section}`;
}

function NavItem({
  label,
  onClick,
  isArrowRight = false,
}: {
  label: string;
  onClick: () => void;
  isArrowRight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-full py-2 transition-colors duration-200 hover:bg-white/5 hover:opacity-95 ${
        isArrowRight ? "pl-5 pr-3" : "px-5"
      }`}
    >
      <span>{label}</span>
      {isArrowRight && <ArrowUpRight className="h-3 w-3" />}
    </button>
  );
}

const StartButton = React.memo(function StartButton({
  onClick,
  label,
  size = "md",
}: {
  onClick: () => void;
  label: string;
  size?: "md" | "sm";
}) {
  const sizeClass =
    size === "sm" ? "px-6 py-3 text-xs" : "mt-10 px-8 py-4 text-base";

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
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 mx-auto">
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
    <form onSubmit={onSubmit} className="w-full rounded-[28px] p-3 md:p-5">
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

        <div className="absolute bottom-4 right-4 flex items-center justify-center gap-2 md:bottom-5 md:right-5">
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Submit search"
            className={[
              "inline-flex h-10 w-10 items-center justify-center rounded-full transition active:scale-[0.98] md:h-11 md:w-11",
              canSend
                ? "bg-accenta1 text-black hover:opacity-90"
                : "cursor-not-allowed bg-white/10 text-white/35",
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

function RadarHeader({ onStartClick }: { onStartClick: () => void }) {
  const navigateToSection = useCallback((section: RadarSection) => {
    if (typeof window === "undefined") return;

    if (section === RadarSection.Intro) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const target = document.getElementById(section);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <header className="fixed left-0 top-0 z-20 w-full text-sm text-white transition-all duration-300">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 md:h-20 md:px-8">
        <Link
          href="/"
          className="shrink-0 text-left font-garamond text-[26px] font-semibold"
        >
          Harper
        </Link>

        <nav className="hidden items-center justify-center gap-2 rounded-full bg-[#444444aa] px-4 py-2 text-sm font-normal text-white backdrop-blur md:flex">
          {navItems.map((item) => (
            <NavItem
              key={item.section}
              label={item.label}
              onClick={() => navigateToSection(item.section)}
            />
          ))}
        </nav>

        <div className="hidden shrink-0 items-center justify-end md:flex">
          <StartButton
            onClick={onStartClick}
            label={START_BUTTON_LABEL}
            size="sm"
          />
        </div>

        <div className="block md:hidden">
          <DropdownMenu
            buttonLabel={<Menu className="h-4 w-4" />}
            items={navItems.map((item) => ({
              label: item.label,
              onClick: () => navigateToSection(item.section),
            }))}
          />
        </div>
      </div>
    </header>
  );
}

export default function RadarLandingPage() {
  const { m } = useMessages();

  const [query, setQuery] = useState("");
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);

  const openLoginModal = useCallback((draft?: string) => {
    if (typeof window !== "undefined") {
      const value = draft?.trim();
      if (value) {
        localStorage.setItem("harper_radar_query_draft", value);
      }
    }
    setIsOpenLoginModal(true);
  }, []);

  const handleStart = useCallback(() => {
    openLoginModal(query);
  }, [openLoginModal, query]);

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!query.trim()) return;
      openLoginModal(query);
    },
    [openLoginModal, query]
  );

  const handleCloseLoginModal = useCallback(() => {
    setIsOpenLoginModal(false);
  }, []);

  const login = useCallback(async () => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/callback`
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
  }, []);

  const customLogin = useCallback(async (email: string, password: string) => {
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

      setIsOpenLoginModal(false);
      router.push("/invitation");
      return null;
    } catch (error) {
      if (error instanceof Error && error.message) {
        return { message: error.message };
      }
      return { message: en.auth.invalidAccount };
    }
  }, []);

  return (
    <>
      <Head>
        <title>Harper | Find Real Engineers and Researchers</title>
        <meta
          name="description"
          content="Find under-the-radar engineers and researchers through GitHub, shipped projects, papers, and Scholar signals."
        />
      </Head>

      <main className="min-h-screen w-full overflow-x-hidden bg-black font-inter text-white">
        {isOpenLoginModal && (
          <LoginModal
            open={isOpenLoginModal}
            onClose={handleCloseLoginModal}
            onGoogle={login}
            onConfirm={customLogin}
            language={RADAR_LOGIN_MODAL_LANGUAGE}
          />
        )}

        <RadarHeader onStartClick={handleStart} />

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
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(180,255,120,0.12),transparent_34%)]" />
          </div>

          <Reveal delay={0.08}>
            <div className="relative z-10 mx-auto mt-10 flex w-full max-w-[980px] flex-col items-center text-center md:mt-12">
              <h1 className="mt-6 max-w-[920px] text-3xl font-medium leading-[1.08] tracking-[-0.03em] md:text-5xl">
                Find real engineers and researchers.
              </h1>

              <p className="mt-5 max-w-[700px] text-[15px] font-light leading-7 text-hgray700 md:text-[20px] md:leading-8">
                Search by GitHub profiles, shipped projects, and Publications
                not by polished profiles.
              </p>

              <div className="mt-12 w-full max-w-[920px] md:mt-16">
                <div className="overflow-hidden rounded-[30px] bg-gradpastel2 p-[1px] shadow-[0_40px_120px_rgba(0,0,0,0.38)]">
                  <div className="rounded-[29px] p-2 md:p-4">
                    <SearchInputPanel
                      query={query}
                      onQueryChange={setQuery}
                      onSubmit={handleSearchSubmit}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 text-sm text-white/45">
                We don&apos;t connect or provide contact information.
              </div>
              <div className="mt-6 text-white/80"></div>
            </div>
          </Reveal>
        </section>

        {/* <div className="h-20 md:h-28" />
        <Animate>
          <BaseSectionLayout>
            <div className="flex flex-col md:flex-row mt-12 gap-8 w-full">
              <WhyImageSection title="" desc="" imageSrc="drops" />
              <WhyImageSection title="" desc="" imageSrc="orbit" />
            </div>
          </BaseSectionLayout>
        </Animate> */}
        <div id={RadarSection.Coverage} className="h-20 md:h-28" />
        <Reveal delay={0.08}>
          <BaseSectionLayout>
            <div className="flex w-full flex-col items-center justify-center px-4 text-left md:px-0">
              {/* <Head1 className="text-white">Coverage</Head1> */}
              <h2 className="mt-8 max-w-[720px] text-center text-xl font-normal text-white md:text-2xl md:leading-[1.2]">
                Every day, Reading more projects and publications.
              </h2>

              <div className="mt-10 grid w-full grid-cols-1 gap-6 md:grid-cols-3 md:gap-7">
                {coverageStats.map((stat) => (
                  <CoverageCard key={stat.label} {...stat} />
                ))}
              </div>
            </div>
          </BaseSectionLayout>
        </Reveal>

        <div id={RadarSection.Outputs} className="h-24 md:h-48" />
        <BaseSectionLayout>
          <div className="flex w-full flex-col items-center justify-center px-4 text-center md:px-0">
            <Reveal delay={0.08}>
              <div className="flex flex-col items-center justify-center">
                <Head1 className="text-white">
                  Who&apos;s actually Shipping?
                </Head1>
                <h2 className="mb-12 mt-8 max-w-[760px] text-lg font-light text-white md:mb-20 md:text-xl md:leading-[1.2]">
                  Harper&apos;s proprietary algorithm tracks commits, repos, and
                  social activity <br />
                  to reveal the actual developers pushing insane code.
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
        <CompareSection />

        <div id={RadarSection.Pricing} className="h-28 md:h-40" />
        <PricingSection onClick={handleStart} />
        <div className="h-28 md:h-40" />

        <Animate>
          <BaseSectionLayout>
            <div className="w-full max-w-[600px] px-4 md:px-0">
              <div className="flex flex-col items-start gap-4 rounded-2xl bg-white/20 px-5 py-6 md:px-[30px] md:py-8">
                <div className="text-left text-[13px] font-normal leading-[26px] text-hgray700 md:text-base md:leading-[30px]">
                  Harper is not just a filter-based search engine.
                  <br />
                  It reads what people have actually built: their code and
                  papers.
                  <br />
                  It infers ability from real work,
                  <br />
                  and finds the talent that truly fits.
                </div>
                <div className="mt-6 flex flex-row items-center justify-start gap-4">
                  <div className="shrink-0">
                    <Image
                      src="/images/cofounder.png"
                      alt="person1"
                      width={60}
                      height={60}
                    />
                  </div>
                  <div className="flex flex-col items-start justify-start gap-1">
                    <div className="text-sm">Chris & Daniel</div>
                    <div className="text-hgray700 text-xs">
                      {m.companyLanding.testimonial.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </BaseSectionLayout>
        </Animate>

        <div className="h-28 md:h-40" />
        <Animate duration={0.8}>
          <section className="relative w-full overflow-hidden bg-black py-10">
            <PixelBackground count={380} className="absolute inset-0" />
            <div className="absolute left-0 top-0 h-[50%] w-full bg-gradient-to-t from-transparent to-black" />

            <div className="relative z-10 mx-auto flex w-full max-w-[1000px] flex-col items-center justify-center px-4 py-20 text-white md:py-36 md:pb-48">
              <h2 className="mt-7 text-center text-[32px] font-medium leading-[1.15] text-white/95 md:text-4xl">
                Repos and Papers
                <br />
                are our talent pool.
              </h2>

              <p className="mt-5 max-w-[620px] text-center text-[15px] leading-7 text-hgray700 md:text-[18px]">
                GitHub and Scholar reveal serious builders long before polished
                profiles do.
              </p>

              <StartButton onClick={handleStart} label={START_BUTTON_LABEL} />
              <div className="mt-32 w-full md:flex hidden">
                <FallingTagsMl theme="dark" startDelay={800} />
              </div>
            </div>
          </section>
        </Animate>

        <GithubFooter onClickStart={handleStart} />
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

function WhyImageSection({
  title,
  desc,
  imageSrc,
}: {
  title: string;
  desc: string;
  imageSrc: string;
}) {
  const imgReturn = () => {
    if (imageSrc === "drops") {
      return (
        <div className="relative flex h-[280px] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradpastel2 md:h-[380px]">
          <div className="w-full md:mr-8">
            <FallingTagsMl theme="dark" startDelay={800} />
          </div>
        </div>
      );
    }

    if (imageSrc === "orbit") {
      return (
        <div className="relative flex h-[280px] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradpastel2 md:h-[380px]">
          <OrbitIconsSmall />
        </div>
      );
    }
    return (
      <div className="relative flex h-[220px] w-full items-end justify-end overflow-hidden rounded-2xl bg-gradpastel2 md:h-[280px]">
        <Image
          src={imageSrc}
          alt={title}
          width={400}
          height={320}
          className="max-w-[90%]"
        />
      </div>
    );
  };
  return (
    <div className="flex max-w-full w-full flex-col items-center justify-center gap-8 px-5 md:items-start md:justify-start md:px-0">
      {imgReturn()}
      <div className="flex flex-col items-start justify-start w-full gap-4 text-left">
        <h3
          className="text-[26px] md:text-3xl font-normal leading-[2.2rem] md:leading-[2.5rem]"
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <div
          className="text-sm md:text-base leading-6 font-light text-hgray700"
          dangerouslySetInnerHTML={{ __html: desc }}
        />
      </div>
    </div>
  );
}
