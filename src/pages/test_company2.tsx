import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  Copy,
  MessageCircle,
  SearchCheck,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { cn } from "@/lib/utils";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import Image from "next/image";

const fontMain =
  "text-[22px] font-normal leading-[1.5] text-neutral-900 md:text-[28px]";
const fontBig =
  "text-[20px] font-normal leading-[1.4] text-neutral-900 md:text-[26px]";
const fontMedium =
  "text-[15px] font-light leading-[1.4] text-neutral-900 md:text-[17px]";
const fontSmall =
  "text-[14px] font-light leading-[1.25] text-neutral-800 md:text-[16px]";

const CONTACT_SALES_HREF = "/ko/contact-sales?source=hero_request_demo";

const logos = [
  "twilio",
  "Disney",
  "kpn",
  "TVS",
  "TELUS Digital",
  "cisco",
  "EPIC GAMES",
  "NVIDIA",
  "Revolut",
  "Meta",
  "BERTELSMANN",
  "Ukraine",
  "deliveroo",
  "Chess.com",
  "Harvey",
  "salesforce",
];

const agentCards = [
  {
    title: "Testing",
    copy: "Simulate real-world conversations before deployment.",
    icon: Check,
  },
  {
    title: "Guardrails",
    copy: "Keep agent responses aligned with policy and compliance rules.",
    icon: ShieldCheck,
  },
];

const apiCards = [
  {
    title: "Text to Speech API",
    copy: "Choose a model to optimize for consistency, latency, or emotional control.",
    details: [
      ["Eleven Flash", "75ms latency for conversational use cases"],
      ["Eleven Multilingual", "Best lifelike consistent speech"],
      ["Eleven v3", "Our most expressive model yet"],
    ],
    visual: "code",
    code: 'await client.textToSpeech.convert("voice_id", {\n  text: "The first move sets everything in motion.",\n  modelId: "eleven_multilingual_v2"\n});',
  },
  {
    title: "Speech to Text API",
    copy: "Accurate ASR with diarization and character level timestamps.",
    details: [["Eleven Scribe", "98% accuracy with speaker diarization"]],
    visual: "scribe",
    code: 'const result = await client.speechToText.convert({\n  file,\n  modelId: "scribe_v2"\n});',
  },
  {
    title: "Music API",
    copy: "Studio-grade music with natural language prompts in any genre.",
    details: [
      ["Music", "Trained on licensed data and suitable for commercial use"],
    ],
    visual: "code",
    code: 'const plan = await client.music.compositionPlan.create({\n  prompt: "Fast-paced electronic track",\n  musicLengthMs: 10000\n});',
  },
];

function PillLink({
  children,
  href = "#",
  variant = "light",
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "dark" | "light";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-11 items-center justify-center rounded-full px-6 text-[15px] font-light",
        variant === "dark"
          ? "bg-neutral-950 text-neutral-00 transition-colors hover:bg-neutral-900"
          : "border border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm transition-colors hover:bg-bg-weak"
      )}
    >
      {children}
    </Link>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  action?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1244px] flex-col gap-5 px-5 md:flex-row md:items-start md:justify-between md:px-8">
      <div className="max-w-[680px]">
        {eyebrow && (
          <p className="mb-4 text-[16px] font-normal text-neutral-muted">
            {eyebrow}
          </p>
        )}
        <h2 className="text-[38px] font-normal leading-[1.04] text-neutral-primary md:text-[56px]">
          {title}
        </h2>
      </div>
      {copy && (
        <p className="max-w-[470px] text-[17px] leading-[1.45] text-neutral-muted md:pt-3">
          {copy}
        </p>
      )}
      {action && <PillLink href="#">{action}</PillLink>}
    </div>
  );
}

const Card = ({
  className,
  children,
  title,
  description,
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description: string;
}) => {
  return (
    <div
      className={cn(
        "relative min-h-[640px] flex flex-col overflow-hidden rounded-2xl bg-neutral-100 border border-neutral-1000-a05",
        className
      )}
    >
      <div className="h-[75%]">{children}</div>
      <div className="h-[25%] p-8 flex flex-col gap-4 mb-4">
        <div className={cn(fontSmall, "font-medium")}>{title}</div>
        <div className={fontSmall}>{description}</div>
      </div>
    </div>
  );
};

function AgentsSection() {
  return (
    <Section bgColor="bg-neutral-00">
      <div className="mx-auto grid w-full gap-8 md:grid-cols-2">
        <h2 className={cn(fontBig, "max-w-[620px]")}>Harper가 일하는 방법</h2>
        <p
          className={cn(fontMedium, "max-w-[560px] flex items-end justify-end")}
        >
          Configure, deploy and monitor natural, human
        </p>
      </div>
      <div className="mx-auto mt-10 grid w-full gap-4 md:grid-cols-2">
        <Card
          title="원하는 인재를 자세히 알려주세요."
          description="역할명보다 팀 상황, 기술적 기준, 꼭 맞아야 하는 맥락을 알려주세요. Harper가 후보자와 직접 대화해 fit이 명확할 때만 Slack 또는 메일로 연결합니다."
        >
          <div className="relative h-full w-full overflow-hidden bg-neutral-950">
            <Image
              src="/images/bluesky.jpg"
              alt=""
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-neutral-950/15" />
            <div className="absolute inset-x-7 top-7 rounded-xl border border-white/35 bg-bg-floating/90 p-4 shadow-sm xl:p-5">
              <div className="flex items-start justify-between gap-6 border-b border-neutral-1000-a10 pb-4">
                <div>
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    Company request
                  </p>
                  <p className={cn(fontMedium, "mt-2 max-w-[410px]")}>
                    한국/APAC 확장을 리드할 senior backend engineer를 찾고
                    있습니다.
                  </p>
                </div>
                <p className={cn(fontSmall, "shrink-0 text-neutral-muted")}>
                  Today
                </p>
              </div>
              <div className="mt-4 grid gap-3">
                <div className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    ML/data infrastructure 운영 경험
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    작은 senior team에서 제품과 고객 맥락 이해
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-positive" />
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    Korea-facing role을 진지하게 검토 중
                  </p>
                </div>
              </div>
            </div>
            <div className="absolute inset-x-8 bottom-8 rounded-xl bg-neutral-950/92 p-5 text-neutral-00 shadow-sm">
              <div className="flex items-center justify-between gap-6">
                <div>
                  <p className={cn(fontSmall, "text-neutral-00/55")}>
                    Harper delivery
                  </p>
                  <p className={cn(fontMedium, "mt-1 text-neutral-00")}>
                    Slack 또는 메일로 바로 소개
                  </p>
                </div>
                <div className={cn(fontSmall, "text-right text-neutral-00/70")}>
                  No setup
                  <br />
                  No sourcing
                </div>
              </div>
            </div>
          </div>
        </Card>
        <Card
          title="이미 대화하고 검증한 인재만 연결합니다."
          description="Harper는 후보자와 직접 대화해 요구사항, 관심도, 연봉 범위, 이동 의향을 확인합니다. 그래서 소개를 받는 순간 바로 인터뷰 여부를 판단할 수 있습니다."
        >
          <div className="relative h-full w-full overflow-hidden bg-[#f3f1eb]">
            <div className="absolute inset-x-6 bottom-4 top-5 overflow-hidden rounded-xl border border-neutral-1000-a10 bg-bg-floating p-4 shadow-sm xl:p-5">
              <div className="flex items-start justify-between gap-5 border-b border-neutral-1000-a10 pb-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-200">
                    <span className={cn(fontSmall, "blur-[3px]")}>H-204</span>
                  </div>
                  <div className="min-w-0">
                    <p className={cn(fontSmall, "text-neutral-muted")}>
                      Candidate brief
                    </p>
                    <p className={cn(fontMedium, "mt-1")}>Candidate H-204</p>
                    <p className={cn(fontSmall, "mt-1 text-neutral-muted")}>
                      Senior Backend Engineer · AI Infra
                    </p>
                  </div>
                </div>
                <div
                  className={cn(
                    fontSmall,
                    "shrink-0 rounded-full bg-neutral-950 px-4 py-2 text-neutral-00"
                  )}
                >
                  인터뷰 일정 잡기
                </div>
              </div>
              <p className={cn(fontMedium, "mt-4 max-w-[540px]")}>
                Built ML/data infra and owned customer-facing reliability.
                한국/APAC 확장 팀에 필요한 technical depth와 ownership이 모두
                맞습니다.
              </p>
              <div className="mt-4 divide-y divide-neutral-1000-a10 border-y border-neutral-1000-a10">
                <div className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    Requirement
                  </p>
                  <p className={fontSmall}>
                    AI infra owner · small senior team
                  </p>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    Harper learned
                  </p>
                  <p className={fontSmall}>
                    Korea role · 연봉 범위 · leadership scope 확인
                  </p>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-4 py-2.5">
                  <p className={cn(fontSmall, "text-neutral-muted")}>
                    Verified
                  </p>
                  <p className={fontSmall}>
                    Ready to interview · timing · intro consent
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function WhySection() {
  const whyItems = [
    {
      title: "Understand quality.",
      description:
        "기술 스택, 제품 단계, 도메인 제약, 팀의 의사결정 방식을 함께 봅니다. 키워드가 아니라 실제로 함께 일할 수 있는지를 판단합니다.",
      Icon: SearchCheck,
    },
    {
      title: "Faster, cheaper.",
      description:
        "검색, 아웃리치, 1차 확인에 쓰는 시간을 줄입니다. 많은 이력서 대신 이미 관심도와 조건이 확인된 소수만 받습니다.",
      Icon: TimerReset,
    },
    {
      title: "Nothing new to operate.",
      description:
        "새 툴을 관리할 필요 없습니다. 후보자에 대한 짧은 피드백만 주면 Harper가 다음 소개를 더 정확하게 만듭니다.",
      Icon: MessageCircle,
    },
  ];

  return (
    <Section bgColor="bg-neutral-00">
      <div className="mx-auto grid w-full gap-8 md:grid-cols-2">
        <h2 className={cn(fontBig, "max-w-[620px]")}>
          Smarter hiring starts here
        </h2>
        <p
          className={cn(fontMedium, "max-w-[560px] flex items-end justify-end")}
        >
          Harper는 더 많은 후보자를 보여주는 도구가 아니라, 바로 대화할 만한
          사람을 더 빠르게 좁히는 방식입니다.
        </p>
      </div>
      <div className="mx-auto mt-10 grid w-full border-y border-neutral-1000-a10 bg-neutral-00 md:grid-cols-3">
        {whyItems.map(({ title, description, Icon }, index) => (
          <div
            key={title}
            className={cn(
              "min-h-[200px] border-neutral-1000-a10 py-8 md:px-8",
              index > 0 && "border-t md:border-l md:border-t-0",
              index === 0 && "md:pl-0",
              index === whyItems.length - 1 && "md:pr-0"
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-1000-a10 text-neutral-muted">
              <Icon className="h-4 w-4" strokeWidth={1.6} />
            </div>
            <div className="pt-5">
              <h3 className={fontMedium}>{title}</h3>
              <p
                className={cn(
                  fontSmall,
                  "mt-4 max-w-[330px] text-neutral-muted"
                )}
              >
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

const Section = ({
  children,
  bgColor = "bg-neutral-100",
  className,
}: {
  children: React.ReactNode;
  bgColor?: string;
  className?: string;
}) => {
  return (
    <div className={cn("w-full py-16 md:py-24", bgColor, className)}>
      <section className="mx-auto w-full max-w-[1244px] px-5 md:px-10">
        {children}
      </section>
    </div>
  );
};

const PillBtn = ({
  icon = null,
  text,
  onClick,
  variant = "light",
}: {
  icon?: React.ReactNode;
  text: string;
  onClick: () => void;
  variant?: "light" | "dark";
}) => {
  return (
    <div
      className={cn(
        variant === "light"
          ? "bg-neutral-00 border border-neutral-1000-a10 hover:bg-neutral-100"
          : "bg-neutral-950 border border-neutral-1000-a10 hover:bg-neutral-900",
        "px-4 py-1.5 rounded-full shadow-xs transition-colors text-sm font-light inline-flex items-center gap-2"
      )}
      onClick={onClick}
    >
      {icon}
      {text}
    </div>
  );
};

export default function TestCompanyPage() {
  return (
    <>
      <Head>
        <title>ElevenLabs Style Test</title>
        <meta
          name="description"
          content="A static ElevenLabs-inspired company page mockup."
        />
      </Head>
      <style jsx global>{`
        #crisp-chatbox,
        .crisp-client,
        div.fixed.bottom-4.right-4 {
          display: none !important;
        }

        .eleven-frame {
          position: relative;
        }

        .eleven-frame::before {
          content: "";
          position: absolute;
          left: 50%;
          top: -2px;
          width: 100vw;
          height: 5px;
          transform: translateX(-50%);
          pointer-events: none;
          z-index: 2;
          background:
            radial-gradient(
              circle at calc(50% - var(--eleven-rail-half)) 2px,
              var(--color-neutral-1000) 0 1.8px,
              transparent 2.2px
            ),
            radial-gradient(
              circle at calc(50% + var(--eleven-rail-half)) 2px,
              var(--color-neutral-1000) 0 1.8px,
              transparent 2.2px
            ),
            linear-gradient(
              to bottom,
              transparent 2px,
              var(--color-neutral-1000-a05) 2px 3px,
              transparent 3px
            );
        }

        @media (max-width: 1279px) {
          .eleven-page::before,
          .eleven-page::after,
          .eleven-frame::before {
            display: none;
          }
        }
      `}</style>
      <main className="min-h-screen text-neutral-primary">
        <CareerAppBar
          careerStartHref={CONTACT_SALES_HREF}
          onCareerStartClick={() => {}}
          labels={{
            workflow: "Product",
            difference: "Why Harper",
            voices: "Stories",
            forCompanies: "For Companies",
            join: "미팅 신청하기",
          }}
        />
        <Section bgColor="bg-neutral-100" className="md:pt-36 md:pb-20">
          <div className="grid gap-10 md:grid-cols-[0.95fr_1fr] md:items-end">
            <h1 className={`max-w-[620px] ${fontMain}`}>
              채용 공고로는 닿기 어려운
              <br />
              Top talent를 연결해드립니다.
            </h1>
            <p className={`max-w-[560px] ${fontMedium}`}>
              Harper는 인재들과 직접 대화하며 회사가 찾는 역할의 기술 스택,
              제품/도메인 맥락, 경력과 관심도를 바탕으로 대화해볼 만한 인재만
              선별해 소개합니다.
            </p>
          </div>
          <div className="mt-6">
            <PillLink href={CONTACT_SALES_HREF} variant="dark">
              미팅 신청하기&nbsp; <ArrowRight className="h-4 w-4" />
            </PillLink>
          </div>
        </Section>

        <Section className="pt-0 md:pt-0">
          <div className="mb-8 grid grid-cols-[0.6fr_0.4fr] gap-8">
            <div className={cn(fontMedium, "text-neutral-muted")}>
              이 곳의 인재들이 신뢰합니다.
            </div>
            <div className={cn(fontMedium, "text-neutral-muted")}>
              최고의 팀들과 함께하고 있습니다.
            </div>
          </div>
          <div className="grid grid-cols-[0.6fr_0.4fr] gap-8">
            <div className="grid grid-cols-4 gap-2">
              {logos.map((logo, index) => (
                <div
                  key={`${index}`}
                  className="flex h-24 items-center justify-center rounded-sm gap-2 bg-neutral-200/80 border border-neutral-200 px-4 text-center text-[16px] font-normal text-neutral-900"
                >
                  <span>{logo}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col justify-between items-start">
              <div className="flex flex-col gap-2">
                <p className={fontMedium}>
                  <span className="text-primary">$2B</span> AI-first Asia VC
                </p>
                <p className={fontMedium}>
                  <span className="text-primary">$2B</span> Global Agentic
                  Company
                </p>
                <p className={fontMedium}>
                  <span className="text-primary">Sequoia-backed</span> Consumer
                  AI Agent
                </p>
              </div>
              <div className="flex flex-col items-start justify-between min-h-[240px] bg-neutral-200/80 rounded-sm p-5 border border-neutral-200 w-full">
                <div className="font-light text-neutral-primary text-[16px]">
                  {'"'}
                  Harper는 최고의 채용파트너입니다. 까다로운 조건을 붙였지만
                  모든 조건을 만족하는 사람을 한달만에 20명을 연결받았고,
                  채용까지 바로 이어졌습니다.
                  {'"'}
                </div>
                <div className="flex flex-row items-center gap-2">
                  <Image
                    src="/images/profiles/avatar9.png"
                    alt="logo"
                    width={40}
                    height={40}
                    className="rounded-full"
                  />
                  <div className="flex flex-col items-center gap-2">
                    <div></div>
                    <div></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>
        <AgentsSection />
        <WhySection />

        <section className="eleven-frame bg-bg-default py-24">
          <div className="mx-auto flex w-full max-w-[1244px] flex-col gap-8 px-5 md:flex-row md:items-end md:justify-between md:px-8">
            <div>
              <p className="text-[44px] font-normal leading-[1.04] md:text-[64px]">
                AI Communication Platform
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PillLink href={CONTACT_SALES_HREF}>미팅 신청하기</PillLink>

              <div>
                <PillBtn
                  text="Linkedin"
                  onClick={() => {
                    window.open(
                      "https://www.linkedin.com/company/matchharper/",
                      "_blank"
                    );
                  }}
                />
                <PillBtn
                  text="인재 페이지"
                  onClick={() => {
                    window.open(
                      "https://www.linkedin.com/company/matchharper/",
                      "_blank"
                    );
                  }}
                />
                <PillBtn
                  text="궁금한 점이 있으신가요?"
                  onClick={() => {
                    window.open(
                      "https://www.linkedin.com/company/matchharper/",
                      "_blank"
                    );
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
