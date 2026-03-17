import Reveal from "@/components/landing/Animation/Reveal";
import FullBleedSection from "@/components/landing/FullBleedSection";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  Minus,
  MoveDiagonal2,
  Play,
  Plus,
  Volume2,
  X,
} from "lucide-react";
import Head from "next/head";
import React, { CSSProperties, useEffect, useMemo, useState } from "react";

const BOOKING_URL = "https://calendly.com/chris-matchharper/30min";

const trustedCompanies = [
  {
    name: "Corgi",
    render: (
      <div className="text-[44px] font-extrabold tracking-[-0.05em] text-[#ff6a00]">
        Corgi
      </div>
    ),
  },
  {
    name: "Giga",
    render: (
      <div className="flex h-[62px] w-[84px] items-center justify-center bg-[#6e8798] text-[28px] font-semibold tracking-[-0.05em] text-white">
        Giga
      </div>
    ),
  },
  {
    name: "LlamaIndex",
    render: (
      <div className="flex items-center gap-4">
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-[14px] bg-black text-[28px] text-white">
          L
        </div>
        <div className="text-[52px] font-semibold tracking-[-0.06em] text-black">
          LlamaIndex
        </div>
      </div>
    ),
  },
  {
    name: "Porter",
    render: (
      <div className="flex items-center gap-4">
        <div className="h-[42px] w-[42px] rounded-[14px] bg-[#2ecc71]" />
      </div>
    ),
  },
];

const valueCards = [
  {
    number: "01",
    title: "Fill your interviewing schedule",
    meta: "Within 24 hours",
    description:
      "After intake, we kickstart our AI recruiting system. You'll get interview-ready candidates the same day.",
  },
  {
    number: "02",
    title: "Fill your roles 4x faster",
    meta: "Weeks 2-4",
    description:
      "We typically fill hard roles within 2-4 weeks. Candidates are far more likely to pass your interviews.",
  },
  {
    number: "03",
    title: "Longterm recruiting partner",
    meta: "The Future",
    description:
      "The system stores context over time, so the matching and outreach quality compounds every role.",
  },
];

const processSteps = [
  {
    title: "Understanding",
    number: "01",
    description:
      "Our intake process uses AI to store and analyze more preference info than any recruiter could, from culture fit to team chemistry and edge cases.",
    visual:
      "radial-gradient(circle at 48% 26%, rgba(255,236,214,0.95) 0, rgba(255,236,214,0.35) 14%, transparent 24%), radial-gradient(circle at 52% 38%, rgba(255,165,110,0.95) 0, rgba(255,165,110,0.15) 16%, transparent 30%), linear-gradient(135deg, rgba(127,143,190,1) 0%, rgba(115,93,173,1) 48%, rgba(69,61,113,1) 100%)",
  },
  {
    title: "Source",
    number: "02",
    description:
      "We use recommender-system thinking to find high-fit candidates across the market instead of relying on a small recruiter Rolodex.",
    visual:
      "radial-gradient(circle at 25% 35%, rgba(255,255,255,0.82) 0, rgba(255,255,255,0.1) 12%, transparent 24%), radial-gradient(circle at 68% 58%, rgba(255,211,161,0.88) 0, rgba(255,211,161,0.1) 15%, transparent 30%), linear-gradient(135deg, rgba(85,123,121,1) 0%, rgba(72,104,120,1) 50%, rgba(49,68,80,1) 100%)",
  },
  {
    title: "Outreach",
    number: "03",
    description:
      "Our AI system sends thousands of targeted outreaches overnight, compressing weeks of recruiter work into a single cycle.",
    visual:
      "radial-gradient(circle at 22% 26%, rgba(255,247,231,0.9) 0, rgba(255,247,231,0.08) 16%, transparent 28%), radial-gradient(circle at 72% 68%, rgba(255,147,79,0.8) 0, rgba(255,147,79,0.08) 16%, transparent 30%), linear-gradient(135deg, rgba(56,95,114,1) 0%, rgba(33,64,90,1) 55%, rgba(22,35,51,1) 100%)",
  },
  {
    title: "Optimize",
    number: "04",
    description:
      "Every feedback point gets stored. The model only gets sharper over time, so each new role starts with more context than the last.",
    visual:
      "radial-gradient(circle at 62% 20%, rgba(255,243,224,0.92) 0, rgba(255,243,224,0.08) 14%, transparent 24%), radial-gradient(circle at 34% 74%, rgba(87,207,214,0.78) 0, rgba(87,207,214,0.12) 18%, transparent 32%), linear-gradient(135deg, rgba(103,124,111,1) 0%, rgba(63,95,110,1) 48%, rgba(28,54,76,1) 100%)",
  },
];

const faqs = [
  {
    question: "How does the system work?",
    answer:
      "We intake your role, use the system to source candidates, and continuously adjust using your feedback so the shortlist sharpens after every interaction.",
  },
  {
    question: "How does removing the human component produce better results?",
    answer:
      "The system scales search and outreach faster than a recruiter-heavy workflow. Hiring teams then spend time where it matters most: evaluating the best candidates.",
  },
  {
    question: "How long until you fill my role?",
    answer:
      "The original site positions hard engineering roles at roughly 2-4 weeks depending on interview throughput and candidate responsiveness.",
  },
  {
    question: "How much does it cost?",
    answer:
      "The original FAQ frames pricing as materially lower than traditional agencies. This implementation keeps the structure and interaction, not the pricing policy.",
  },
  {
    question: "What are next steps?",
    answer:
      "Use any CTA on the page to open the Calendly link and start the conversation. All major buttons in this page point to your requested booking URL.",
  },
];

const sectionTagClassName =
  "inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 font-geist text-[15px] font-medium tracking-[-0.03em] text-beige900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl";

type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
  size?: "sm" | "md";
};

type PlaceholderProps = {
  children?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
};

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <div className={sectionTagClassName}>{children}</div>
);

const RadarButton = ({
  className = "",
  label = "Explore Harper Search",
}: {
  className?: string;
  label?: string;
}) => (
  <motion.a
    href="/radar"
    whileHover={{ y: -1 }}
    whileTap={{ scale: 0.985 }}
    className={`group inline-flex h-[50px] items-center gap-2 rounded-full bg-beige100 px-6 font-geist text-[15px] font-medium tracking-[-0.03em] text-black shadow-[0_14px_30px_rgba(0,0,0,0.22)] transition-shadow duration-300 hover:shadow-[0_18px_40px_rgba(0,0,0,0.3)] ${className}`}
  >
    <span>{label}</span>
    <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
  </motion.a>
);

const CalendlyButton = ({
  label,
  variant = "primary",
  className = "",
  size = "md",
}: ButtonProps) => {
  const isPrimary = variant === "primary";
  const isSmall = size === "sm";

  return (
    <motion.a
      href={BOOKING_URL}
      target="_blank"
      rel="noreferrer"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${
        isPrimary
          ? "bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.08)]"
          : "bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      } ${
        isSmall
          ? "h-[34px] rounded-[12px] px-4 text-[13px]"
          : "h-[58px] rounded-[14px] px-7 text-[15px]"
      } ${className}`}
    >
      <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="relative flex h-full items-start overflow-hidden">
        <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1/2">
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[34px]" : "h-[58px]"
            }`}
          >
            {label}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[34px]" : "h-[58px]"
            }`}
          >
            {label}
          </span>
        </span>
      </span>
    </motion.a>
  );
};

const PlaceholderShell = ({
  children,
  className = "",
  style,
}: PlaceholderProps) => (
  <div
    className={`relative overflow-hidden rounded-[32px] border border-white/40 bg-beige500/50 shadow-[0_30px_80px_rgba(89,57,24,0.12)] ${className}`}
    style={style}
  >
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),transparent_48%)]" />
    {children}
  </div>
);

const HeroVideoPlaceholder = () => (
  <PlaceholderShell
    className="mt-16 aspect-[1.82/1] w-full bg-[#6f5948]"
    style={{
      backgroundImage:
        "radial-gradient(circle at 64% 32%, rgba(255,229,192,0.24), transparent 14%), radial-gradient(circle at 79% 18%, rgba(255,255,255,0.18), transparent 10%), radial-gradient(circle at 70% 72%, rgba(7,13,24,0.28), transparent 24%), linear-gradient(92deg, rgba(114,90,68,1) 0%, rgba(154,127,95,1) 48%, rgba(36,28,27,1) 100%)",
    }}
  >
    <div className="absolute inset-y-0 left-0 w-[41%] bg-[linear-gradient(180deg,rgba(94,72,53,0.92),rgba(119,91,68,0.8))]" />
    <div className="absolute left-[43%] top-[18%] h-[36%] w-[12%] rounded-full bg-black/40 blur-[26px]" />
    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/40 to-transparent" />
    <div className="absolute bottom-6 left-6 flex items-center gap-5 text-beige100/90 max-[809px]:bottom-4 max-[809px]:left-4 max-[809px]:gap-3">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-black/20 backdrop-blur-md max-[809px]:h-9 max-[809px]:w-9"
      >
        <Play size={16} fill="currentColor" />
      </button>
      <span className="text-[15px] tracking-[-0.03em] max-[809px]:text-[13px]">
        0:00 / 1:15
      </span>
      <Volume2 size={18} />
      <MoveDiagonal2 size={18} />
    </div>
  </PlaceholderShell>
);

const TestimonialPlaceholder = () => (
  <PlaceholderShell
    className="h-[540px] w-full max-[1199px]:h-[500px] max-[809px]:h-[420px]"
    style={{
      backgroundImage:
        "radial-gradient(circle at 16% 28%, rgba(58,123,112,0.96), transparent 22%), radial-gradient(circle at 72% 36%, rgba(255,143,57,0.95), transparent 28%), radial-gradient(circle at 88% 78%, rgba(229,71,23,0.92), transparent 22%), radial-gradient(circle at 42% 54%, rgba(255,232,204,0.24), transparent 20%), linear-gradient(135deg, rgba(23,88,89,1) 0%, rgba(189,128,66,1) 45%, rgba(192,58,29,1) 100%)",
    }}
  />
);

const SuccessPortraitPlaceholder = () => (
  <PlaceholderShell
    className="h-[520px] w-full max-[1199px]:h-[460px] max-[809px]:h-[400px]"
    style={{
      backgroundImage:
        "linear-gradient(180deg, rgba(241,226,214,1), rgba(214,191,173,0.95)), linear-gradient(90deg, rgba(117,96,87,0.16) 1px, transparent 1px), linear-gradient(rgba(117,96,87,0.16) 1px, transparent 1px)",
      backgroundSize: "100% 100%, 42px 42px, 42px 42px",
    }}
  >
    <div className="absolute inset-x-[22%] bottom-0 top-[16%] rounded-[160px_160px_24px_24px] bg-[linear-gradient(180deg,#1b2230,#222a3b_60%,#0f1726)]" />
    <div className="absolute inset-x-[33%] top-[7%] h-24 rounded-full bg-[#f4c9a6]" />
    <div className="absolute inset-x-[14%] bottom-20 h-16 rounded-full bg-[#0c1724]/90 blur-[22px]" />
  </PlaceholderShell>
);

const ResultsPanel = () => (
  <PlaceholderShell
    className="w-full p-14 max-[1199px]:p-10 max-[809px]:p-6"
    style={{
      backgroundImage:
        "radial-gradient(circle at 14% 18%, rgba(255,169,89,0.92), transparent 16%), radial-gradient(circle at 78% 18%, rgba(120,246,255,0.42), transparent 18%), linear-gradient(135deg, rgba(22,166,168,1) 0%, rgba(31,132,153,1) 52%, rgba(11,73,98,1) 100%)",
    }}
  >
    <div className="grid grid-cols-2 gap-4 max-[809px]:grid-cols-1">
      {[
        {
          title: "2x more precise",
          copy: "Than traditional agencies at candidate sourcing",
        },
        {
          title: "4x faster",
          copy: "At filling roles than traditional agencies",
        },
      ].map((item) => (
        <div
          key={item.title}
          className="rounded-[28px] border border-white/30 bg-white/20 px-8 py-9 text-white backdrop-blur-xl"
        >
          <div className="font-halant text-[36px] sm:text-[40px] md:text-[46px] lg:text-[52px] leading-[0.95] tracking-[-0.06em]">
            {item.title}
          </div>
          <p className="mt-6 max-w-[18rem] text-[18px] leading-[1.44] tracking-[-0.03em] text-white/90 max-[809px]:text-[16px]">
            {item.copy}
          </p>
        </div>
      ))}
    </div>
  </PlaceholderShell>
);

const ComparisonCard = ({
  title,
  items,
  className,
  style,
  isPositive,
}: {
  title: string;
  items: string[];
  className?: string;
  style?: CSSProperties;
  isPositive?: boolean;
}) => (
  <PlaceholderShell
    className={`relative h-[320px] p-10 max-[1199px]:h-[240px] max-[809px]:min-h-0 max-[809px]:p-7 ${className || ""}`}
    style={style}
  >
    <div className="absolute z-0 top-0 left-0 inset-0 w-full h-full object-cover opacity-70">
      <img
        src="/images/sky1.jpg"
        alt="Check"
        className="w-full h-full object-cover"
      />
    </div>
    <div className="relative z-10 flex h-full flex-col justify-between text-white/80">
      <h3
        className={`${!isPositive ? "font-geist" : "font-halant "} text-3xl sm:text-3xl md:text-3xl lg:text-4xl leading-[0.96] tracking-[-0.06em]`}
      >
        {title}
      </h3>
      <div className="space-y-4 text-lg leading-[1.42] tracking-[-0.00em] max-[809px]:text-[16px]">
        {items.map((item) => (
          <p key={item} className="flex flex-row items-center gap-2">
            {isPositive ? <Check size={16} /> : <X size={16} />}
            {item}
          </p>
        ))}
      </div>
    </div>
  </PlaceholderShell>
);

const Beige = () => {
  const [activeProcessIndex, setActiveProcessIndex] = useState(0);
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [showPreloader, setShowPreloader] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShowPreloader(false);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, []);

  const activeProcess = useMemo(
    () => processSteps[activeProcessIndex],
    [activeProcessIndex]
  );

  return (
    <>
      <Head>
        <title>Harper Beige</title>
      </Head>
      <div className="min-h-screen overflow-x-clip bg-beige200 font-geist text-beige900 antialiased">
        <div className="w-full">
          <AnimatePresence>
            {showPreloader && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{
                  y: "-100%",
                  transition: {
                    duration: 0.9,
                    ease: [0.76, 0, 0.24, 1],
                  },
                }}
                className="fixed inset-0 z-[120] flex items-center justify-center bg-beige500"
              >
                <div className="font-halant text-[56px] sm:text-[68px] md:text-[80px] lg:text-[96px] tracking-[-0.08em] text-beige900">
                  <StaggerText text="Harper" by="char" delay={0.08} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <nav className="fixed inset-x-0 top-0 z-50 bg-beige200/80 backdrop-blur-lg">
            <div className="mx-auto grid h-[78px] max-w-[1160px] grid-cols-[1fr_auto_1fr] items-center px-4 max-[809px]:h-auto max-[809px]:grid-cols-1 max-[809px]:justify-items-center max-[809px]:gap-3 max-[809px]:py-4">
              <div className="max-[809px]:hidden" />
              <a
                href="#top"
                className="font-halant text-[26px] tracking-[-0.06em] text-beige900"
              >
                Harper
              </a>
              <div className="justify-self-end">
                <div className="flex items-center gap-3 max-[809px]:flex-wrap max-[809px]:justify-center">
                  <CalendlyButton
                    label="For Candidates"
                    variant="secondary"
                    size="sm"
                  />
                  <CalendlyButton label="Schedule Demo" size="sm" />
                </div>
              </div>
            </div>
          </nav>

          <main
            id="top"
            className="mx-auto flex max-w-[1160px] flex-col px-4 pb-24 pt-[132px] max-[1199px]:gap-24 max-[809px]:gap-20 max-[809px]:pt-[156px]"
          >
            <section className="flex flex-col items-center text-center bg-beige200">
              <Reveal once className="mt-2">
                <SectionTag>Backed by Y Combinator</SectionTag>
              </Reveal>

              <Reveal once delay={0.06} className="mt-10 max-w-[1040px]">
                <h1 className="font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.93] tracking-[-0.08em] text-beige900">
                  <span className="block">
                    <StaggerText text="Fill startup roles with" />
                  </span>
                  <span className="block">
                    <StaggerText
                      text="candidates 2x better, 4x faster"
                      delay={0.14}
                    />
                  </span>
                </h1>
              </Reveal>

              <Reveal
                once
                delay={0.12}
                className="mt-8 max-w-[560px] text-lg font-medium leading-[1.58] tracking-[-0.03em] text-beige900/50 max-[809px]:text-base"
              >
                Harper is the first ever AI native recruiting agency. It shrinks
                weeks of work that a whole recruiting team would do, into days.
              </Reveal>

              <Reveal once delay={0.18} className="mt-10">
                <CalendlyButton
                  label="Get Started Now"
                  className="h-[58px] px-8 text-lg font-medium max-[809px]:h-[52px] max-[809px]:px-6 max-[809px]:text-[15px]"
                />
              </Reveal>

              <Reveal once delay={0.24} className="w-full">
                <HeroVideoPlaceholder />
              </Reveal>

              <Reveal once delay={0.32} className="mt-14 w-full">
                <div className="grid grid-cols-[160px_1fr] items-center gap-12 max-[1199px]:grid-cols-1 max-[1199px]:gap-8">
                  <p className="max-w-[132px] text-left font-geist text-[14px] leading-[1.55] tracking-[-0.02em] text-beige900/40">
                    Trusted by top Companies like Corgi, Giga, Llamaindex,
                    Mintlify, Porter and many others.
                  </p>
                  <div className="flex items-center justify-between gap-8 max-[1199px]:flex-wrap max-[1199px]:justify-start">
                    {trustedCompanies.map((company, index) => (
                      <motion.div
                        key={company.name}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.45, delay: index * 0.04 }}
                        className="shrink-0 max-[809px]:origin-left max-[809px]:scale-[0.9]"
                      >
                        {company.render}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </section>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="grid grid-cols-[1.06fr_0.94fr] gap-16 max-[1199px]:grid-cols-1 max-[1199px]:gap-12 py-24"
            >
              <Reveal once className="pr-4 max-[1199px]:pr-0">
                <SectionTag>How we work</SectionTag>
                <h2 className="mt-7 max-w-[520px] font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.08em] text-beige900">
                  AI speed, recommender
                  <br />
                  system accuracy.
                </h2>
                <p className="mt-8 max-w-[540px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  We&apos;re ML scientists who built large-scale recommender
                  systems. We model what makes candidates succeed, then rank by
                  how likely they are to pass your interviews and perform on the
                  job.
                </p>
                <div className="mt-10">
                  <CalendlyButton
                    label="Get Started"
                    className="text-lg font-medium"
                  />
                </div>
              </Reveal>

              <div className="space-y-8 pt-[54px] max-[1199px]:pt-0">
                {valueCards.map((item, index) => (
                  <Reveal key={item.number} once delay={index * 0.08}>
                    <div className="grid grid-cols-[42px_1fr] gap-8">
                      <div className="pt-1 font-geist text-2xl font-medium leading-none tracking-[-0.08em] text-beige900/60">
                        {item.number}
                      </div>
                      <div>
                        <div className="flex items-start gap-3 max-[809px]:flex-col max-[809px]:gap-2">
                          <h3 className="text-xl font-medium leading-[1.12] tracking-[-0.05em] text-beige900">
                            {item.title}
                          </h3>
                          <span className="rounded-md bg-beige500/80 px-3 py-1 text-sm font-medium tracking-[-0.02em] text-beige900/80">
                            {item.meta}
                          </span>
                        </div>
                        <p className="mt-2 max-w-[420px] text-[19px] leading-[1.5] tracking-[-0.03em] text-beige900/50">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </FullBleedSection>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="py-24"
            >
              <Reveal once>
                <div className="relative">
                  <TestimonialPlaceholder />
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-14 text-beige100 max-[1199px]:p-10 max-[809px]:p-6">
                    <div className="text-[64px] sm:text-[76px] md:text-[88px] lg:text-[98px] leading-none">
                      “
                    </div>
                    <div>
                      <h2 className="max-w-[920px] font-halant text-[36px] sm:text-[42px] md:text-[50px] lg:text-[58px] leading-[1.04] tracking-[-0.07em]">
                        We moved off Paraform and canceled our Juicebox
                        subscription because of the velocity we saw from Harper
                      </h2>
                      <div className="mt-10 text-[18px] leading-[1.4] tracking-[-0.03em] text-beige100/90 max-[809px]:text-[15px]">
                        Caleb Burns
                        <br />
                        Founding Team at Series A stealth startup
                      </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            </FullBleedSection>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="grid grid-cols-[0.96fr_0.84fr] gap-14 max-[1199px]:grid-cols-1 max-[1199px]:gap-12 py-24"
            >
              <Reveal once>
                <SectionTag>Success stories</SectionTag>
                <h2 className="mt-7 max-w-[540px] font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.97] tracking-[-0.08em] text-beige900">
                  2x interview pass
                  <br />
                  rate for top startup
                </h2>
                <div className="mt-8 max-w-[540px] space-y-6 text-[18px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[16px]">
                  <p>
                    Our client&apos;s a top stealth startup backed by top VCs
                    urgently hiring founding engineers.
                  </p>
                  <p>
                    They hired the best agencies in the Bay but were provided
                    only a few candidates a week that didn&apos;t fit the role.
                  </p>
                  <p>
                    After trying Harper, they saw a 10x surge in interviewing,
                    and fired their other agencies.
                  </p>
                </div>
                <div className="mt-10 grid max-w-[560px] grid-cols-2 gap-4 max-[809px]:grid-cols-1">
                  {[
                    {
                      stat: "10x",
                      label: "Interview volume",
                      sublabel: "within the first week",
                    },
                    {
                      stat: "12 weeks",
                      label: "Faster",
                      sublabel: "role filled",
                    },
                  ].map((item, index) => (
                    <Reveal key={item.stat} once delay={0.08 * index}>
                      <div className="rounded-3xl bg-beige500/80 p-6">
                        <div className="font-halant font-medium text-[56px] leading-[0.95] tracking-[-0.06em] text-beige900">
                          {item.stat}
                        </div>
                        <div className="mt-4 text-[17px] font-medium tracking-[-0.03em] text-beige900">
                          {item.label}
                        </div>
                        <div className="mt-1 text-[17px] tracking-[-0.03em] text-beige900/70">
                          {item.sublabel}
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </Reveal>

              <Reveal once delay={0.08}>
                <div className="relative h-full">
                  <SuccessPortraitPlaceholder />
                  <div className="absolute bottom-8 left-8 text-[19px] leading-[1.35] tracking-[-0.03em] text-white/90">
                    Caleb Burns
                    <br />
                    Founding Team
                  </div>
                </div>
              </Reveal>
            </FullBleedSection>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="py-24"
            >
              <Reveal once className="text-center">
                <SectionTag>Our Process</SectionTag>
                <h2 className="mx-auto mt-7 max-w-[860px] font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.96] tracking-[-0.08em] text-beige900">
                  A <span className="text-beige900/40">thousand</span>{" "}
                  recruiters, in your palm
                </h2>
                <p className="mx-auto mt-6 max-w-[680px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  Within an hour, enable a whole team of recruiters to fill your
                  roles 24/7.
                </p>
              </Reveal>

              <div className="mt-14 grid grid-cols-[0.52fr_0.48fr] gap-14 max-[1199px]:grid-cols-1 max-[1199px]:gap-10">
                <div className="space-y-5">
                  {processSteps.map((step, index) => {
                    const active = activeProcessIndex === index;

                    return (
                      <motion.button
                        key={step.title}
                        type="button"
                        onClick={() => setActiveProcessIndex(index)}
                        whileHover={{ x: 4 }}
                        className={`flex w-full items-start justify-between rounded-[28px] border px-8 py-6 text-left transition-all duration-300 max-[809px]:px-6 max-[809px]:py-5 ${
                          active
                            ? "border-transparent bg-beige500/60"
                            : "border-transparent bg-transparent text-beige900/70 hover:bg-white/30"
                        }`}
                      >
                        <span
                          className={`font-halant text-[32px] sm:text-[38px] md:text-[44px] lg:text-[48px] leading-[0.98] tracking-[-0.07em] ${
                            active ? "text-beige900" : "text-beige900/40"
                          }`}
                        >
                          {step.title}
                        </span>
                        <span
                          className={`mt-2 text-[20px] leading-none tracking-[-0.06em] ${
                            active ? "text-beige900/70" : "text-beige900/40"
                          }`}
                        >
                          {step.number}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                <Reveal once delay={0.08}>
                  <div className="relative min-h-[33rem] max-[1199px]:min-h-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeProcess.title}
                        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -18, filter: "blur(10px)" }}
                        transition={{
                          duration: 0.38,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="space-y-8"
                      >
                        <PlaceholderShell
                          className="aspect-[1.35/1] w-full"
                          style={{ backgroundImage: activeProcess.visual }}
                        >
                          <div className="absolute inset-x-10 bottom-10 h-[1px] bg-white/30" />
                        </PlaceholderShell>
                        <div>
                          <h3 className="text-[28px] sm:text-[30px] md:text-[32px] lg:text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-beige900">
                            {activeProcess.title}
                          </h3>
                          <p className="mt-4 max-w-[450px] text-[19px] leading-[1.56] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[17px]">
                            {activeProcess.description}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </Reveal>
              </div>
            </FullBleedSection>

            <section className="py-24">
              <Reveal once className="text-center">
                <SectionTag>Our Results</SectionTag>
                <h2 className="mt-7 font-halant text-[40px] sm:text-[48px] md:text-[56px] lg:text-[66px] leading-[0.96] tracking-[-0.08em] text-beige900">
                  Faster, Cheaper, Better
                </h2>
                <p className="mx-auto mt-6 max-w-[720px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  Our recruiting system is built by ML scientists and prominent
                  recruiting leaders.
                </p>
              </Reveal>
              <Reveal once delay={0.08} className="mt-12">
                <ResultsPanel />
              </Reveal>
            </section>

            <section className="py-24">
              <Reveal once className="text-center">
                <SectionTag>Why choose us</SectionTag>
                <h2 className="mt-7 font-halant text-[40px] sm:text-[48px] md:text-[56px] lg:text-[66px] leading-[0.96] tracking-[-0.08em] text-beige900">
                  Recruiting in the{" "}
                  <span className="text-beige900/40">AI age</span>
                </h2>
                <p className="mx-auto mt-6 max-w-[640px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  We&apos;re your longterm recruiting partner with infinite
                  memory and context.
                </p>
              </Reveal>

              <div className="mt-12 grid grid-cols-2 gap-4 max-[1199px]:grid-cols-1">
                <Reveal once>
                  <ComparisonCard
                    title="Traditional agencies"
                    items={[
                      "Deliver only 2-3 candidates a week.",
                      "Lack background to understand your work.",
                      "If your role is too hard to fill, you're deprioritized.",
                    ]}
                    isPositive={false}
                  />
                </Reveal>
                <Reveal once delay={0.06}>
                  <ComparisonCard
                    title="Harper"
                    items={[
                      "We find you as many candidates as you tell us to.",
                      "Our AI algorithm acts like a dedicated domain expert.",
                      "Our workflows scale so you are never deprioritized.",
                    ]}
                    isPositive={true}
                  />
                </Reveal>
              </div>
            </section>

            <FullBleedSection
              backgroundClassName="bg-black"
              contentClassName="grid grid-cols-[0.98fr_0.82fr] gap-16 py-24 text-beige100 max-[1199px]:grid-cols-1 max-[1199px]:gap-12 max-[809px]:py-20"
            >
              <Reveal once className="max-w-[620px]">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-4 py-2 font-geist text-[13px] font-medium tracking-[-0.03em] text-white/70">
                  Search
                </div>
                <h2 className="mt-7 font-halant text-[40px] sm:text-[46px] md:text-[54px] lg:text-[64px] leading-[0.96] tracking-[-0.08em] text-beige100">
                  Perfect tool for finding AI/ML talents
                </h2>
                <p className="mt-7 max-w-[560px] font-geist text-[20px] leading-[1.58] tracking-[-0.03em] text-white/70 max-[809px]:text-[18px]">
                  Search across real research output, open-source evidence, and
                  technical project history in one place.
                </p>
                <div className="mt-10">
                  <RadarButton />
                </div>
              </Reveal>

              <Reveal once delay={0.08}>
                <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(196,168,255,0.18),transparent_24%),radial-gradient(circle_at_72%_22%,rgba(255,222,173,0.16),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_26px_80px_rgba(0,0,0,0.28)]">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.04)_100%)]" />
                  <div className="relative">
                    <div className="rounded-[22px] border border-white/10 bg-black/40 p-5 backdrop-blur-xl">
                      <div className="font-geist text-[12px] uppercase tracking-[0.24em] text-white/40">
                        Search
                      </div>
                      <div className="mt-4 max-w-[28rem] font-geist text-lg leading-[1.55] tracking-[-0.03em] text-white/90">
                        Find multimodal ML engineers who shipped production
                        systems and also published or contributed meaningful
                        research work.
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 max-[809px]:grid-cols-1">
                      {[
                        ["7M+", "papers & publications"],
                        ["3M+", "tracked technical projects"],
                        ["10M+", "cross-linked signals"],
                      ].map(([value, label]) => (
                        <div
                          key={value}
                          className="rounded-[20px] bg-white/5 p-4"
                        >
                          <div className="font-halant text-[32px] leading-none tracking-[-0.06em] text-beige100">
                            {value}
                          </div>
                          <div className="mt-2 font-geist text-[13px] leading-[1.45] tracking-[-0.02em] text-white/50">
                            {label}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {[
                        "GitHub contribution evidence",
                        "Research publication footprint",
                        "Technical project & systems history",
                      ].map((item, index) => (
                        <motion.div
                          key={item}
                          initial={{ opacity: 0, x: 18 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{
                            duration: 0.45,
                            delay: 0.1 + index * 0.06,
                          }}
                          className="flex items-center justify-between rounded-[18px] border border-white/10 bg-white/10 px-4 py-3"
                        >
                          <span className="font-geist text-[15px] tracking-[-0.02em] text-white/70">
                            {item}
                          </span>
                          <span className="font-geist text-[13px] tracking-[-0.02em] text-white/30">
                            indexed
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </FullBleedSection>

            <section className="mx-auto w-full max-w-[860px] text-center">
              <Reveal once>
                <SectionTag>FAQ</SectionTag>
                <h2 className="mt-7 font-halant text-[40px] sm:text-[46px] md:text-[54px] lg:text-[64px] leading-[0.98] tracking-[-0.08em] text-beige900">
                  We put <span className="text-beige900/40">transparency</span>{" "}
                  first
                </h2>
                <p className="mx-auto mt-6 max-w-[500px] text-[19px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[17px]">
                  Or request access and we&apos;ll walk you through it.
                </p>
              </Reveal>

              <div className="mt-12 space-y-4 text-left">
                {faqs.map((faq, index) => {
                  const isOpen = openFaqIndex === index;

                  return (
                    <Reveal key={faq.question} once delay={index * 0.04}>
                      <motion.button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                        className="w-full rounded-[20px] bg-beige200 px-6 py-6 shadow-[0_14px_30px_rgba(66,38,10,0.06)] max-[809px]:px-5 max-[809px]:py-5"
                      >
                        <div className="flex items-center justify-between gap-8">
                          <div className="text-[20px] font-medium leading-[1.24] tracking-[-0.04em] text-beige900 max-[809px]:text-[20px]">
                            {faq.question}
                          </div>
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-beige900/10 bg-beige100/70">
                            {isOpen ? (
                              <Minus className="h-5 w-5 text-beige900/60" />
                            ) : (
                              <Plus className="h-5 w-5 text-beige900/60" />
                            )}
                          </div>
                        </div>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0, marginTop: 0 }}
                              animate={{
                                height: "auto",
                                opacity: 1,
                                marginTop: 20,
                              }}
                              exit={{ height: 0, opacity: 0, marginTop: 0 }}
                              transition={{
                                duration: 0.35,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="overflow-hidden"
                            >
                              <p className="text-left max-w-[620px] text-base leading-[1.58] tracking-[-0.03em] text-beige900/50">
                                {faq.answer}
                              </p>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          </main>

          <footer className="bg-beige500/30">
            <div className="mx-auto flex max-w-[1160px] flex-col items-center px-4 pb-16 pt-24 text-center max-[809px]:pt-20">
              <Reveal>
                <h2 className="font-halant text-[40px] sm:text-[48px] md:text-[58px] lg:text-[68px] leading-[0.97] tracking-[-0.08em] text-beige900">
                  Harper
                </h2>
                <p className="mt-4 text-[22px] leading-[1.45] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  Fill roles in days, not months
                </p>
                <div className="mt-10">
                  <CalendlyButton label="Get Started Now" />
                </div>
              </Reveal>
              <div className="mt-20 h-px w-full max-w-[740px] bg-beige900/10" />
              <div className="mt-10 self-start max-w-[740px] text-sm tracking-[-0.03em] text-beige900/40">
                © 2026 Harper. All rights reserved.
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
};

export default Beige;
