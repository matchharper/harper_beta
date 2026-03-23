import Reveal from "@/components/landing/Animation/Reveal";
import StaggerText from "@/components/landing/Animation/StaggerText";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Plus, ShieldCheck, X } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";
import { Onboarding2Content } from "./onboarding2";

const companyRequests = [
  {
    company: "글로벌 유니콘 AI 스타트업 (Agent / LLM infra)",
    role: "Forward Deployed Engineer",
    compensation: "KRW 1.5억 - 2.5억 / year",
  },
  {
    company: "딥 테크 회사 (기업가치 2조+)",
    role: "Firmware / Silicon Engineer",
    compensation: "",
  },
  {
    company: "글로벌 B2C 스타트업",
    role: "ML / Agent Engineer (model training / inference)",
    compensation: "",
  },
  {
    company: "Silicon valley top vc-backed startup",
    role: "Part time Engineer (주 4-12시간)",
    compensation: "5-10만원 / hour",
  },
] as const;

const faqs = [
  {
    question: "등록해도 연락을 받는 사람은 소수인가요?",
    answer:
      "아니요. 특정 소수만 노출되는 구조가 아닙니다. 기업이 직접 검색하는 방식이 아니라, AI가 각 후보자의 실제 작업과 경험을 기반으로 매칭을 생성하기 때문에 다양한 후보자에게 기회가 열립니다.\
      또한 매칭은 지속적으로 업데이트되며, 시간이 지나도 새로운 기업과 연결될 수 있습니다.",
  },
  {
    question: "기존 채용공고나 헤드헌터랑 어떻게 다른가요?",
    answer:
      "Harper는 현재 일반적으로 발견할 수 없는 좋은 기회들을 연결해줍니다. AI가 각 후보자의 실제 작업과 경험을 기반으로 매칭을 생성하기 때문에 다양한 후보자에게 기회가 열립니다.",
  },
  {
    question: "기존 채용공고나 헤드헌터랑 어떻게 다른가요?",
    answer: "3개면 좋을 것 같아서 임시로 하나 넣음",
  },
] as const;

const sectionTagClassName =
  "inline-flex items-center rounded-lg bg-beige500/80 px-4 py-2 font-geist text-[15px] font-medium tracking-[-0.03em] text-beige900/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-xl";

const titleTextClassName =
  "font-halant text-4xl sm:text-5xl md:text-5xl lg:text-6xl leading-[0.95] tracking-[-0.08em]";

const SectionTag = ({ children }: { children: React.ReactNode }) => (
  <div className={sectionTagClassName}>{children}</div>
);

const schoolLogos = [
  {
    src: "/images/logos/sn.png",
    name: "서울대학교",
  },
  {
    src: "/images/logos/kaist.png",
    name: "KAIST",
  },
  {
    src: "/images/logos/stanford.png",
    name: "Stanford",
  },
];

const NetworkButton = ({
  label,
  size = "md",
  variant = "primary",
  showArrow = true,
  onClick,
  className = "",
}: {
  label: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary";
  showArrow?: boolean;
  onClick?: () => void;
  className?: string;
}) => {
  const isSmall = size === "sm";
  const isPrimary = variant === "primary";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      className={`group relative inline-flex items-center justify-center overflow-hidden font-geist font-medium tracking-[-0.03em] transition-shadow duration-300 ${
        isPrimary
          ? "rounded-[12px] bg-beige900 text-beige100 shadow-[0_10px_20px_rgba(46,23,6,0.08)] hover:shadow-[0_18px_40px_rgba(46,23,6,0.18)]"
          : "rounded-[12px] bg-beige500/70 text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
      } ${
        isSmall
          ? isPrimary
            ? "h-[44px] px-5 text-[14px]"
            : "h-[42px] px-4 text-[15px]"
          : "h-[50px] px-5 text-base"
      } ${className}`}
    >
      {!isPrimary && (
        <span className="absolute inset-0 bg-white/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
      )}
      <span className="relative flex h-full items-start overflow-hidden">
        <span
          className="flex flex-col transition-transform duration-500 group-hover:-translate-y-1/2"
          style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
          <span
            className={`flex items-center leading-none ${
              isSmall ? (isPrimary ? "h-[44px]" : "h-[42px]") : "h-[50px]"
            }`}
          >
            {label}
          </span>
        </span>
      </span>
      {showArrow && (
        <ArrowUpRight className="relative ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[2px]" />
      )}
    </motion.button>
  );
};

const RequestCard = ({
  company,
  role,
  compensation,
  onClick,
}: {
  company: string;
  role: string;
  compensation: string;
  onClick: () => void;
}) => (
  <div
    onClick={onClick}
    className="relative flex flex-col items-start justify-between gap-6 group rounded-xl p-5 cursor-pointer border border-beige900/10 hover:border-beige900/80 outline outline-[0.5px] outline-transparent hover:outline-beige900/80 transition-all duration-200"
  >
    <div className="font-inter text-[15px] md:text-base font-medium leading-[0.96] tracking-[-0.06em] text-beige900">
      {company}
    </div>
    <div className="flex flex-row items-center justify-between w-full gap-3 text-sm md:text-[15px]">
      <div className="font-medium">{role}</div>
      <div className="font-medium text-beige900/50">{compensation}</div>
    </div>
    <ArrowUpRight className="absolute right-4 top-4 w-0 h-4 group-hover:w-4 group-hover:translate-x-[2px] transition-all duration-300" />
  </div>
);

const NetworkPage = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

  useEffect(() => {
    if (!isOnboardingOpen) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOnboardingOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOnboardingOpen]);

  return (
    <>
      <Head>
        <title>Harper Network</title>
        <meta
          name="description"
          content="Top AI teams reach out to you privately."
        />
      </Head>

      <div className="min-h-screen overflow-x-clip bg-beige200 font-geist text-beige900 antialiased">
        <nav className="fixed inset-x-0 top-0 z-50 bg-beige200/80 backdrop-blur-lg">
          <div className="mx-auto flex h-[78px] max-w-[1160px] items-center justify-between px-4">
            <a
              href="#top"
              className="font-halant text-[28px] tracking-[-0.06em] text-beige900"
            >
              Harper
            </a>
            <NetworkButton
              label="Join"
              size="sm"
              variant="secondary"
              showArrow={false}
              onClick={() => setIsOnboardingOpen(true)}
              className="inline-flex"
            />
          </div>
        </nav>

        <main
          id="top"
          className="mx-auto flex max-w-[1160px] flex-col px-4 pb-24 pt-[72px] md:pt-[96px] "
        >
          <section className="py-10 text-center">
            <Reveal once delay={0.06} className="mx-auto mt-6 max-w-[900px]">
              <h2
                className={`${titleTextClassName} text-beige900 text-4xl md:text-5xl`}
              >
                <span className="block">
                  <StaggerText text="Top AI teams reach out" />
                </span>
                <span className="block">
                  <StaggerText text="to you privately." delay={0.14} />
                </span>
              </h2>
            </Reveal>

            <Reveal once delay={0.18} className="mt-8">
              <div className="flex flex-col justify-center items-center text-lg tracking-[-0.03em] text-beige900/70">
                <div>
                  Find global top-tier opportunities for your expertise.
                </div>
                <div>Available only on Harper.</div>
              </div>

              <div className="mt-4 flex flex-col items-center gap-0 text-base tracking-[-0.03em] text-beige900/50">
                <div>From Junior to C-level</div>
                <div>From Part-time to Full-time</div>
              </div>
            </Reveal>

            <Reveal once delay={0.24} className="mt-12">
              <NetworkButton
                label="Join talent network"
                onClick={() => setIsOnboardingOpen(true)}
              />
            </Reveal>

            {/* <Reveal
              once
              delay={0.3}
              className="mt-2 inline-flex items-center gap-2 text-base tracking-[-0.03em] text-beige900/55"
            >
              <ShieldCheck className="h-5 w-5" />
              <span>Your info is private. Not shared without consent</span>
            </Reveal> */}
          </section>

          <Reveal
            once
            className="text-center justify-center items-center mt-2 mb-12"
          >
            <div className="flex flex-row items-center justify-center gap-2">
              <div className="relative items-baseline gap-1 font-normal flex">
                <div>300+ in the network From </div>
              </div>
              <div className="flex -space-x-2">
                {schoolLogos.map((school) => (
                  <div
                    key={school.name}
                    className="h-9 w-9 rounded-full bg-beige500 border border-beige900/20"
                  >
                    <Image
                      src={school.src}
                      alt={school.name}
                      className="rounded-full"
                      width={36}
                      height={36}
                    />
                  </div>
                ))}
              </div>
            </div>
            {/* <p className="mt-3 text-[17px] leading-[1.55] tracking-[-0.03em] text-beige900/55">
              매칭을 위해 Active pool을 500명 이하로 관리 예정입니다.
            </p> */}
          </Reveal>

          <VCLogos />

          <Reveal once className="text-center mt-32">
            <div className={`w-full font-medium text-left text-beige900`}>
              최근 포지션
            </div>
          </Reveal>

          <div className="w-full mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {companyRequests.map((request, index) => (
              <Reveal
                key={`${request.company}-${request.role}`}
                once
                delay={0.05 * index}
              >
                <RequestCard
                  {...request}
                  onClick={() => setIsOnboardingOpen(true)}
                />
              </Reveal>
            ))}
            <div className="w-full text-left text-beige900/50 mt-2">
              and more
            </div>
          </div>

          <section id="faq" className="py-24">
            <Reveal once className="text-center">
              <SectionTag>FAQ</SectionTag>
            </Reveal>

            <div className="mx-auto mt-12 max-w-[860px] space-y-4 text-left">
              {faqs.map((faq, index) => {
                const isOpen = openFaqIndex === index;

                return (
                  <Reveal key={faq.question} once delay={index * 0.04}>
                    <motion.button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                      aria-expanded={isOpen}
                      className="w-full rounded-[24px] bg-beige100 px-6 py-6 shadow-[0_14px_30px_rgba(66,38,10,0.06)]"
                    >
                      <div className="flex items-center justify-between gap-8">
                        <div className="text-left text-sm md:text-base font-medium leading-[1.24] tracking-[-0.04em] text-beige900">
                          {faq.question}
                        </div>
                        <motion.div
                          animate={{ rotate: isOpen ? 405 : 0 }}
                          transition={{
                            duration: 0.28,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        >
                          <Plus className="h-5 w-5 text-beige900/60" />
                        </motion.div>
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
                              className="max-w-[720px] text-left text-sm md:text-[15px] leading-[1.6] tracking-[-0.03em] text-beige900/55"
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
          </section>
        </main>
        <br />
        <br />
        <br />
        <br />
        <Reveal once delay={0.24} className="w-full">
          <div className="flex items-center justify-center w-full mt-20 mb-4">
            <img
              src="/images/objects.png"
              alt="objects"
              className="w-44 sm:w-52 md:w-64"
            />
          </div>
        </Reveal>

        <footer className="border-t border-beige900/10 py-8">
          <div className="mx-auto flex max-w-[1160px] flex-col items-center justify-between gap-4 px-4 tracking-[-0.03em] text-beige900/60 md:flex-row">
            <div className="font-halant text-[28px] tracking-[-0.06em] text-beige900">
              Harper
            </div>
            <div className="flex items-center gap-4 text-base">
              <Link
                href="/terms"
                className="cursor-pointer transition hover:text-beige900"
              >
                Terms
              </Link>
              <Link
                href="/privacy"
                className="cursor-pointer transition hover:text-beige900"
              >
                Privacy
              </Link>
              <Link
                href="https://www.linkedin.com/company/matchharper/"
                className="cursor-pointer transition hover:text-beige900"
              >
                LinkedIn
              </Link>
            </div>
          </div>
        </footer>

        <AnimatePresence>
          {isOnboardingOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[140] bg-beige200"
            >
              <button
                type="button"
                onClick={() => setIsOnboardingOpen(false)}
                className="fixed right-4 top-4 z-[150] inline-flex h-10 w-10 items-center justify-center rounded-md text-beige900 transition hover:bg-beige900/10 md:right-8 md:top-6"
                aria-label="Close onboarding"
              >
                <X className="h-5 w-5" />
              </button>
              <Onboarding2Content />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default NetworkPage;

const vcLogos = [
  { key: "a16z2", src: "/svgs/a16z2.svg", width: 100 },
  { key: "yc2", src: "/svgs/yc2.svg", width: 152 },
  { key: "sequoia2", src: "/svgs/sequoia2.svg", width: 146 },
  { key: "index2", src: "/svgs/index2.svg", width: 136 },
  { key: "besemmer2", src: "/svgs/bessemer2.svg", width: 118 },
];

function VCLogos() {
  const items = [...vcLogos];

  return (
    <div className="relative w-[90%] mx-auto overflow-hidden mt-24">
      <Reveal once delay={0.08} className="w-full text-center">
        <div className="w-full text-center text-beige900 text-lg leading-[1.55] tracking-[-0.03em] font-medium">
          Trusted by Companies
          <br className="block md:hidden" /> backed by{" "}
          <span className="text-beige900/50">Top VCs</span>
        </div>
      </Reveal>
      <Reveal once delay={0.14} className="w-full text-center">
        <div className="w-full flex-row items-center justify-center gap-16 hidden md:flex">
          {items.slice(0, 5).map((vc, i) => (
            <div
              key={`${vc.key}-${i}`}
              className="flex h-28 md:h-32 min-w-[140px] md:min-w-[140px] items-center justify-center"
            >
              <Image
                src={vc.src}
                alt={vc.key}
                width={vc.width}
                height={100}
                className="object-contain opacity-90"
                priority={i < vcLogos.length}
              />
            </div>
          ))}
        </div>
        <div className="md:hidden mt-10 grid grid-cols-2 grid-rows-3 w-full justify-center items-center gap-4 flex-wrap">
          {items.slice(0, 6).map((vc, i) => (
            <div
              key={`${vc.key}-${i}`}
              className="flex items-center justify-center"
            >
              <Image
                src={vc.src}
                alt={vc.key}
                width={vc.width - 20}
                height={100}
                className="object-contain max-w-[36vw] opacity-90"
                priority={i < vcLogos.length}
              />
            </div>
          ))}
        </div>
      </Reveal>

      <style jsx>{`
        /* Move by 50% because we duplicated the list (2x). */
        .marquee {
          animation: marquee 32s linear infinite;
          will-change: transform;
        }
        /* pause on hover */
        .group:hover .marquee {
          animation-play-state: paused;
        }
        @keyframes marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        /* respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .marquee {
            animation: none !important;
            transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
