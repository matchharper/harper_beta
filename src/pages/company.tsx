import Reveal from "@/components/landing/Animation/Reveal";
import { ContributionGrid } from "@/components/landing/ContributionGrid";
import FullBleedSection from "@/components/landing/FullBleedSection";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Check,
  MoveDiagonal2,
  Play,
  Plus,
  Quote,
  Volume2,
  X,
} from "lucide-react";
import Head from "next/head";
import React, { CSSProperties, useEffect, useMemo, useState } from "react";

const papers = [
  {
    title: "Noise Conditional Flow Model for Learning ...",
    authors: "S Chatrchyan ...",
    journal: "CVPR 2024",
    citations: 660,
    year: 2024,
    is_featured: true,
  },
];

const BOOKING_URL = "https://calendly.com/chris-matchharper/30min";

const trustedCompanies = [
  {
    name: "Pickle",
    render: (
      <img src="/images/logos/pickle.png" alt="pickle" className="h-[54px]" />
    ),
  },
  {
    name: "Moss",
    render: (
      <img src="/images/logos/moss.png" alt="moss" className="h-[54px]" />
    ),
  },
  {
    name: "aleph",
    render: (
      <img src="/images/logos/aleph.svg" alt="aleph" className="h-[30px]" />
    ),
  },
  {
    name: "optimizerai",
    render: (
      <img
        src="/images/logos/optimizerai.png"
        alt="optimizerai"
        className="h-[54px]"
      />
    ),
  },
];

const valueCards = [
  {
    number: "01",
    title: "Deep indexing",
    meta: "Within 24 hours",
    description:
      "After request, We run our AI recruiting system.<br />Harper talks to candidates and analyzes their papers and code to find real talent.",
  },
  {
    number: "02",
    title: "High-velocity, 4x faster matching",
    meta: "Weeks 2-4",
    description:
      "Skip the months of waiting.<br />We leverage AI across search, communication, and matching to maximize speed and eliminate friction.",
  },
  {
    number: "03",
    title: "Harper remembers",
    meta: "Optimize",
    description:
      "Your technical preferences are stored in our memory, ensuring matching quality compounds as your team grows.",
  },
];

const processSteps = [
  {
    title: "Understanding",
    number: "01",
    description:
      "Share your ideal candidate : skills, experience, team fit, and any edge cases.",
    image: "/images/feature1.png",
  },
  {
    title: "Finding",
    number: "02",
    description:
      "We search across GitHub, papers, and our proprietary data layer, then use AI to analyze real work. We automate outreach and candidate conversations to extract useful insights beyond what’s publicly visible.",
    image: "/images/feature2.png",
  },
  {
    title: "Matching",
    number: "03",
    description:
      "AI evaluates all data and matches the best candidates by recommendation system. Get a curated list of candidates in your dashboard or Slack, ready to review.",
    image: "/images/feature3.png",
  },
  {
    title: "Interview",
    number: "04",
    description:
      "Not a fit? We refine instantly with your feedback. Like someone? We handle the interview connection for you.",
    image: "/images/feature4.png",
  },
];

const faqs = [
  {
    question: "How does the system work?",
    answer:
      "Get a whole recruiting team started in just 1 hour with the founding team. We fill interviewing capacity in typically in the first day.\
<br />\
<br />\
1. We intake with you for about 45 minutes to deeply understand your preferences. Our system also surfaces candidates for you to give realtime feedback on. We probe deeply on your nuanced criteria and edge cases.<br />\
2. We kickstart our sourcing to thousands of candidates. Each candidate is screened and only the best enter your portal.<br />\
3. You provide feedback on each candidate, which makes our system more accurate.<br />\
4. For candidates you accept, we send them your calendar link for a first discussion.",
  },
  {
    question: "How does removing the human component produce better results?",
    answer:
      "Traditional agencies are bottlenecked by how many people they could screen. In reality, candidates are tired of repetitive recruiter screens.<br />\
<br />\
We believe the best sales people are the hiring managers themselves. We do a quick handoff which maximizes our ability to reach out to the very best in the candidate pool, while allowing hiring managers to make an immediate impression.",
  },
  {
    question: "How long until you fill my role?",
    answer:
      "We typically fill hard-to-fill engineering roles in 2-4 weeks. It’s not a matter of how fast we can find candidates, it’s a matter of how fast you can interview them.",
  },
  {
    question: "How much does it cost?",
    answer:
      "We reduce costs by up to 70% compared to traditional agencies. Get in touch to learn more.",
  },
  {
    question: "What are next steps?",
    answer:
      "Use any CTA on the page to open the Calendly link and start the conversation. All major buttons in this page point to your requested booking URL.",
  },
];

const sectionTagClassName =
  "inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 font-geist text-[15px] md:text-[16px] font-medium tracking-[-0.03em] text-beige900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl";

const titleTextClassName =
  "font-halant text-4xl sm:text-4xl md:text-5xl leading-[0.98] tracking-[-0.08em] text-beige900";

type ButtonProps = {
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
  size?: "sm" | "md";
  href?: string;
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
    href="/search"
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
  href = BOOKING_URL,
}: ButtonProps) => {
  const isPrimary = variant === "primary";
  const isSmall = size === "sm";

  return (
    <motion.a
      href={href}
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
          ? "h-[42px] rounded-[12px] px-4 text-[15px]"
          : "h-[58px] rounded-[14px] px-7 text-[15px]"
      } ${className}`}
    >
      <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      <span className="relative flex h-full items-start overflow-hidden">
        <span className="flex flex-col transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1/2">
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[42px]" : "h-[58px]"
            }`}
          >
            {label}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? "h-[42px]" : "h-[58px]"
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

const TestimonialPlaceholder = () => (
  <div
    className={`relative overflow-hidden rounded-[32px] border border-white/40 bg-beige500/50 shadow-[0_30px_80px_rgba(89,57,24,0.12)] h-[500px] w-full max-[1199px]:h-[460px] max-[809px]:h-[420px]"`}
  >
    <img
      src="/images/orangesky2.jpg"
      alt="Testimonial"
      className="w-full h-full object-cover"
    />
    <div className="absolute inset-0 bg-black/20" />
  </div>
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
  <div
    className={`relative overflow-hidden rounded-[32px] border border-white/40 bg-beige500/50 shadow-[0_30px_80px_rgba(89,57,24,0.12)] w-full px-10 py-12 md:px-16 md:py-24`}
  >
    <img
      src="/images/underwater.png"
      alt="Results"
      className="w-full h-full object-cover absolute inset-0"
    />
    <div className="absolute inset-0 bg-black/30" />
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
          className="rounded-[28px] bg-white/20 px-9 py-9 text-white backdrop-blur-md"
        >
          <div className="font-halant text-4xl sm:text-5xl md:text-6xl leading-[0.95] tracking-[-0.06em]">
            {item.title}
          </div>
          <p className="w-full mt-4 text-base md:text-lg leading-[1.44] tracking-[-0.03em] text-white/90">
            {item.copy}
          </p>
        </div>
      ))}
    </div>
  </div>
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
    className={`relative h-[340px] p-10 max-[1199px]:h-[260px] max-[809px]:min-h-0 max-[809px]:p-7 ${className || ""}`}
    style={style}
  >
    <div className="absolute z-0 top-0 left-0 inset-0 w-full h-full object-cover opacity-90">
      <img
        src={isPositive ? "/images/street1.jpg" : "/images/street2.jpg"}
        alt="Check"
        className="w-full h-full object-cover"
      />
    </div>
    <div className="relative z-10 flex h-full flex-col justify-between">
      <h3
        className={`${!isPositive ? "font-geist" : "font-halant "} text-white text-3xl sm:text-3xl md:text-3xl lg:text-4xl leading-[0.96] tracking-[-0.06em]`}
      >
        {title}
      </h3>
      <div className="space-y-4 text-lg leading-[1.42] tracking-[-0.00em] max-[809px]:text-[16px] text-white/90">
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
        <title>Harper</title>
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
                <div className="font-halant text-7xl tracking-[-0.08em] text-beige900">
                  <StaggerText text="Harper" by="char" delay={0.08} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <nav className="fixed inset-x-0 top-0 z-50 bg-beige200/80 backdrop-blur-lg">
            <div className="h-[78px] flex flex-row items-center justify-between px-6 md:px-28">
              <a
                href="#top"
                className="font-halant text-[26px] tracking-[-0.06em] text-beige900"
              >
                Harper
              </a>
              <div className="justify-self-end">
                <div className="flex items-center gap-3 max-[809px]:flex-wrap max-[809px]:justify-center">
                  <CalendlyButton
                    label="Use Search"
                    variant="secondary"
                    size="sm"
                    href="/search"
                    className="hidden md:block"
                  />
                  <CalendlyButton label="Schedule Demo" size="sm" />
                </div>
              </div>
            </div>
          </nav>

          <main
            id="top"
            className="mx-auto flex max-w-[1160px] flex-col px-4 pb-24 pt-[132px] max-[809px]:pt-[156px]"
          >
            <section className="flex flex-col items-center text-center bg-beige200">
              <Reveal once className="mt-2">
                <SectionTag>Harper : AI native recruiting agency</SectionTag>
              </Reveal>

              <Reveal once delay={0.06} className="mt-10 max-w-[1040px]">
                <h1 className="font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.93] tracking-[-0.08em] text-beige900">
                  <span className="block">
                    <StaggerText text="Hire the top 1% of AI/ML talent" />
                  </span>
                  <span className="block">
                    <StaggerText text="in days, not months." delay={0.14} />
                  </span>
                </h1>
              </Reveal>

              <Reveal
                once
                delay={0.12}
                className="mt-8 max-w-[560px] text-base md:text-[19px] font-normal leading-[1.58] tracking-[-0.03em] text-beige900/50"
              >
                Skip the months of searching. Connect with proven researchers
                and engineers for both full-time roles and part-time for today.
              </Reveal>

              <Reveal once delay={0.18} className="mt-10">
                <CalendlyButton
                  label="Get Started Now"
                  className="h-[58px] px-8 text-lg font-medium max-[809px]:h-[52px] max-[809px]:px-6 max-[809px]:text-[15px]"
                />
              </Reveal>

              <Reveal once delay={0.24} className="w-full">
                <div className="flex items-center justify-center w-full mt-20 mb-4">
                  <img
                    src="/images/objects.png"
                    alt="objects"
                    className="w-52 sm:w-64 md:w-80"
                  />
                </div>
              </Reveal>

              <Reveal once delay={0.32} className="mt-14 w-full">
                <div className="grid grid-cols-[160px_1fr] items-center gap-12 max-[1199px]:grid-cols-1 max-[1199px]:gap-8">
                  <p className="w-full md:max-w-[132px] text-left font-geist text-[14px] leading-[1.55] tracking-[-0.02em] text-beige900/40">
                    Trusted by AI Companies like Pickle, Moss, Aleph lab,
                    OptimizerAI and many others.
                  </p>
                  <div className="w-full flex items-center justify-between gap-4 max-[1199px]:flex-wrap max-[1199px]:justify-center">
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
              <br />
              <br />
            </section>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="grid grid-cols-[1.06fr_0.94fr] gap-16 max-[1199px]:grid-cols-1 max-[1199px]:gap-12 py-24"
            >
              <Reveal once direction="left" className="pr-4 max-[1199px]:pr-0">
                <SectionTag>Our Approach</SectionTag>
                <h2 className="mt-7 max-w-[520px] font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.08em] text-beige900">
                  Hire at the speed of AI
                  <br />
                  engineered for depth, optimized for speed.
                </h2>
                <p className="mt-8 max-w-[540px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  We automate search, outreach, communication for screening, and
                  matching.
                  <br /> Harper leverages deep technical indexing to replace
                  manual filtering with high-precision matching for your most
                  critical AI/ML roles.
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
                  <Reveal
                    key={item.number}
                    once
                    direction="right"
                    delay={index * 0.08}
                  >
                    <div className="grid grid-cols-[42px_1fr] gap-8">
                      <div className="pt-1 font-geist text-2xl font-medium leading-none tracking-[-0.08em] text-beige900/60 max-[809px]:pt-2">
                        {item.number}
                      </div>
                      <div>
                        <div className="flex items-start gap-3 max-[809px]:flex-col-reverse max-[809px]:gap-2">
                          <h3 className="text-xl font-medium leading-[1.12] tracking-[-0.05em] text-beige900 max-[809px]:mt-2">
                            {item.title}
                          </h3>
                          <span className="rounded-md bg-beige500/80 px-3 py-1 text-sm font-medium tracking-[-0.02em] text-beige900/80">
                            {item.meta}
                          </span>
                        </div>
                        <p
                          className="mt-2 max-w-[420px] text-[18px] leading-[1.5] tracking-[-0.03em] text-beige900/50"
                          dangerouslySetInnerHTML={{ __html: item.description }}
                        />
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
              <Reveal once direction="left">
                <div className="relative">
                  <TestimonialPlaceholder />
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-16 text-beige100 max-[1199px]:p-12 max-[809px]:p-8">
                    <Quote fill="currentColor" size={64} />
                    <div>
                      <h2 className="max-w-[920px] font-halant text-[36px] sm:text-[42px] md:text-[50px] lg:text-[58px] leading-[1.04] tracking-[-0.07em]">
                        Harper isn&apos;t just a tool; it&apos;s our entire
                        hiring infrastructure for AI talent. The speed of
                        matching is simply on another level
                      </h2>
                      <div className="mt-10 text-[18px] leading-[1.4] tracking-[-0.03em] text-beige100/90 max-[809px]:text-[15px]">
                        SJ Lee
                        <br />
                        Co-Founder at Pickle (YC W25)
                      </div>
                    </div>
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

                <h2
                  className={`mx-auto mt-7 max-w-[860px] ${titleTextClassName}`}
                >
                  Hiring, simplified
                </h2>
                <p className="mx-auto mt-6 max-w-[680px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  Tell us who you need. We find, shortlist, and deliver
                  candidates you can review and interview right away.
                </p>
              </Reveal>

              <div className="mt-14 grid grid-cols-[0.52fr_0.48fr] gap-14 max-[1199px]:grid-cols-1 max-[1199px]:gap-6">
                <div className="space-y-3 md:space-y-5">
                  {processSteps.map((step, index) => {
                    const active = activeProcessIndex === index;

                    return (
                      <motion.button
                        key={step.title}
                        type="button"
                        onClick={() => setActiveProcessIndex(index)}
                        whileHover={{ x: 4 }}
                        className={`flex w-full items-start justify-between rounded-xl md:rounded-[28px] border px-4 py-3 md:px-8 md:py-6 text-left transition-all duration-300 ${
                          active
                            ? "border-transparent bg-beige500/60"
                            : "border-transparent bg-transparent text-beige900/70 hover:bg-white/30"
                        }`}
                      >
                        <span
                          className={`font-halant text-[28px] sm:text-[36px] md:text-[40px] lg:text-[48px] leading-[0.98] tracking-[-0.07em] ${
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

                <Reveal once direction="right" delay={0.08}>
                  <div className="relative min-h-[33rem] max-[1199px]:min-h-0">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeProcess.title}
                        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -18, filter: "blur(10px)" }}
                        transition={{
                          duration: 0.2,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="space-y-8"
                      >
                        <div
                          className={`relative overflow-hidden rounded-[32px] border border-white/40 bg-beige500/50 shadow-[0_30px_80px_rgba(89,57,24,0.12)] aspect-[1.6/1] w-full`}
                        >
                          <img
                            src={activeProcess.image}
                            alt="Process"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <h3 className="text-[28px] sm:text-[30px] md:text-[32px] lg:text-[34px] font-semibold leading-[1.08] tracking-[-0.05em] text-beige900">
                            {activeProcess.title}
                          </h3>
                          <p className="mt-4 max-w-[520px] text-[19px] leading-[1.56] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[17px]">
                            {activeProcess.description}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </Reveal>
              </div>
            </FullBleedSection>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="grid grid-cols-[0.96fr_0.84fr] gap-14 max-[1199px]:grid-cols-1 max-[1199px]:gap-12 py-24"
            >
              <Reveal once direction="left">
                <SectionTag>Proven impact</SectionTag>
                <h2 className="mt-7 max-w-[540px] font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.97] tracking-[-0.08em] text-beige900">
                  From 50 hours of sourcing
                  <br />
                  to 2 hours of interviewing.
                </h2>
                <div className="mt-8 max-w-[540px] space-y-6 text-[18px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[16px]">
                  <p>
                    For a leading tech organization known for its rigorous
                    engineering standards, manual sourcing was a massive
                    bottleneck.
                  </p>
                  <p>
                    What previously required 50 hours of intense technical
                    filtering was compressed into just 2 hours with Harper.
                  </p>
                  <p></p>
                </div>
                <div className="mt-10 grid max-w-[560px] grid-cols-2 gap-4 max-[809px]:grid-cols-1">
                  {[
                    {
                      stat: "25x",
                      label: "Better",
                      sublabel: "Sourcing Efficiency",
                    },
                    {
                      stat: "7 days",
                      label: "Time to match",
                      sublabel: "faster",
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

              <Reveal once direction="right" delay={0.08}>
                <div className="relative h-full hidden md:flex">
                  <SuccessPortraitPlaceholder />
                </div>
              </Reveal>
            </FullBleedSection>

            <section className="py-24">
              <Reveal once className="text-left">
                <SectionTag>Our Results</SectionTag>
                <div className="mt-6 flex flex-row items-center justify-between w-full">
                  <h2 className={`${titleTextClassName} text-left`}>
                    Faster, Cheaper,{" "}
                    <span className="text-beige900/50">Better</span>
                  </h2>
                  <p className="text-right text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                    We replace manual recruiting with
                    <br />
                    AI-driven search, evaluation, and matching.
                  </p>
                </div>
              </Reveal>
              <Reveal once delay={0.08} className="mt-12">
                <ResultsPanel />
              </Reveal>
            </section>

            <section className="py-24">
              <Reveal once className="text-center">
                <SectionTag>Why Harper</SectionTag>
                <h2 className={`mt-7 ${titleTextClassName}`}>
                  Hyper-focused on{" "}
                  <span className="text-beige900/40">AI/ML</span>
                </h2>
                <p className="mx-auto mt-6 max-w-[640px] text-[20px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  We are your{" "}
                  <span className="text-beige900">recruiting partner</span> for
                  the 1% of technical talent
                </p>
              </Reveal>

              <div className="mt-12 grid grid-cols-2 gap-4 max-[1199px]:grid-cols-1">
                <Reveal once>
                  <ComparisonCard
                    title="Traditional agencies"
                    items={[
                      "Weeks of manual filtering for generic, mismatched profiles.",
                      "Every search starts from zero : no learning, no context.",
                      "Expensive placement fees that act as a tax on your growth.",
                    ]}
                    isPositive={false}
                  />
                </Reveal>
                <Reveal once delay={0.06}>
                  <ComparisonCard
                    title="Harper"
                    items={[
                      "With in 7 days, research-grade matching for the top of AI Talent.",
                      "Infinite memory that learns and evolves with your technical bar.",
                      "White-glove search intelligence with a success model built for elite scaling.",
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
              <Reveal direction="left" className="max-w-[620px]">
                <div className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-4 py-2 font-geist text-[13px] font-medium tracking-[-0.03em] text-white/70">
                  The Engine
                </div>
                <h2
                  className={`mt-7 text-beige100 font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.96] tracking-[-0.08em]`}
                >
                  Autonomous Intelligence. Evidence-First.
                </h2>
                <p className="mt-7 max-w-[560px] font-geist text-[20px] leading-[1.58] tracking-[-0.03em] text-white/70 max-[809px]:text-[18px]">
                  {/* Search across real research output, open-source evidence, and
                  technical project history in one place. */}
                  The same infrastructure our specialists use to scale teams.
                  Harper Search bypasses resumes to index technical truth :
                  mapping research footprints and code contributions directly.
                </p>
                <div className="mt-10">
                  <RadarButton />
                </div>
              </Reveal>

              <Reveal direction="right" delay={0.08}>
                <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(196,168,255,0.18),transparent_24%),radial-gradient(circle_at_72%_22%,rgba(255,222,173,0.16),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_26px_80px_rgba(0,0,0,0.28)]">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.04)_100%)]" />
                  <div className="relative">
                    <div className="rounded-[22px]">
                      <div className="max-w-[28rem] font-geist text-lg leading-[1.55] tracking-[-0.03em] text-white/90">
                        Find multimodal ML engineers who shipped production
                        systems and also published or contributed meaningful
                        research work.
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-3 max-[809px]:grid-cols-1">
                      {[
                        ["7M+", "Scholarly Artifacts"],
                        ["3M+", "Open-Source Repositories"],
                        ["10M+", "Relational Data Points / Neural Signals"],
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

                    <ContributionGrid
                      className="mt-4"
                      monthsToShow={6}
                      minCellSize={10}
                      labelColumnWidth={36}
                      showWeekLabels={false}
                      rowsToShow={5}
                    />
                    {/* Table */}
                    <div className="mt-6 text-left">
                      <div className="grid grid-cols-[1fr_50px_50px] bg-neutral-900 text-xs font-medium px-2 py-1 text-neutral-300">
                        <div>Title</div>
                        <div className="text-right">Citations</div>
                        <div className="text-right pr-1">Year</div>
                      </div>
                      <div className="divide-y divide-neutral-800">
                        {papers.map((paper, i) => (
                          <div
                            key={i}
                            className="relative grid grid-cols-[1fr_30px_30px] gap-4 px-2 py-2"
                          >
                            <div>
                              <p className="text-blue-400 hover:underline text-sm font-light leading-4">
                                {paper.title}
                              </p>
                              <p className="text-sm text-neutral-400 mt-0.5">
                                {paper.authors}
                              </p>
                              <p className="text-xs text-neutral-400">
                                {paper.journal}
                              </p>
                            </div>

                            <div className="flex items-start justify-end text-right text-xs text-neutral-400">
                              {paper.citations}
                            </div>
                            <div className="flex items-start justify-end text-right text-xs text-neutral-400">
                              {paper.year}
                            </div>

                            {paper.is_featured && (
                              <div className="absolute bottom-2 right-1 rounded-full px-2 py-1 bg-blue-500 text-[10px]">
                                Most relevant paper
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {[
                        "GitHub contribution evidence",
                        "Research publication footprint",
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
                          <span className="flex items-center gap-2">
                            <span className="font-geist text-[13px] tracking-[-0.02em] text-white/30">
                              {index === 0 ? "Verified" : "Indexed"}
                            </span>
                            <span
                              aria-hidden="true"
                              className="relative flex h-2 w-2 shrink-0"
                            >
                              <span
                                className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70"
                                style={{ animationDuration: "2.2s" }}
                              />
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                            </span>
                          </span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </FullBleedSection>

            <FullBleedSection
              backgroundClassName="bg-beige100"
              contentClassName="mx-auto w-full max-w-[860px] text-center py-24"
            >
              <Reveal once>
                <SectionTag>FAQ</SectionTag>
                <h2 className={`mt-7 ${titleTextClassName}`}>
                  We are open for{" "}
                  <span className="text-beige900/40">questions</span>
                </h2>
                <p className="mx-auto mt-6 max-w-[500px] text-[19px] leading-[1.5] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[17px]">
                  Or request access to learn more.
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
                          <div className="text-[20px] text-left font-medium leading-[1.24] tracking-[-0.04em] text-beige900 max-[809px]:text-[16px]">
                            {faq.question}
                          </div>
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                            <motion.div
                              animate={{ rotate: isOpen ? 405 : 0 }}
                              transition={{
                                duration: 0.28,
                                ease: [0.22, 1, 0.36, 1],
                              }}
                              className="flex items-center justify-center"
                            >
                              <Plus className="h-5 w-5 text-beige900/60" />
                            </motion.div>
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
                              <p
                                className="text-left max-w-[720px] text-[17px] md:text-[18px] leading-[1.58] tracking-[-0.03em] text-beige900/50"
                                dangerouslySetInnerHTML={{ __html: faq.answer }}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.button>
                    </Reveal>
                  );
                })}
              </div>
            </FullBleedSection>
          </main>

          <footer className="bg-beige500/350">
            <div className="mx-auto flex max-w-[1160px] flex-col items-center px-4 pb-16 pt-24 text-center max-[809px]:pt-16">
              <Reveal>
                <h2 className="font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.97] tracking-[-0.08em] text-beige900">
                  Harper
                </h2>
                <p className="mt-4 text-[22px] leading-[1.45] tracking-[-0.03em] text-beige900/50 max-[809px]:text-[18px]">
                  Fill roles in days, not months
                </p>
                <div className="mt-10">
                  <CalendlyButton
                    label="Get Started Now"
                    className="text-lg font-medium"
                  />
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
