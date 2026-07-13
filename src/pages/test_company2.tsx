import Head from "next/head";
import Link from "next/link";
import { ArrowRight, Bot, Check, Copy, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import Image from "next/image";

const fontMain =
  "text-[24px] font-normal leading-[1.5] text-neutral-900 md:text-[30px]";
const fontBig =
  "text-[20px] font-normal leading-[1.4] text-neutral-900 md:text-[26px]";
const fontMedium =
  "text-[15px] font-light leading-[1.4] text-neutral-900 md:text-[17px]";
const fontSmall =
  "text-[14px] font-light leading-[1.25] text-neutral-800 md:text-[16px]";

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
          title="어떤 인재를 원하는지 알려주세요."
          description="Harper는 회사의 요구사항을 이해하고, 그에 맞는 인재를 찾습니다. 정의된 이후 바로 슬랙 혹은 메일으로 인터뷰를 잡을 인재를 알려드립니다."
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(31, 28, 24, 0.24) 0.6px, transparent 0.9px)",
              backgroundSize: "3px 3px",
            }}
          />
          <Image
            src="/images/bluesky.jpg"
            alt="agent1"
            className="absolute top-0 right-0 -z-10"
            width={310}
            height={310}
          />
          <div className="relative mx-auto mt-16 max-w-[310px] space-y-4 text-[15px]">
            <div className="ml-auto w-fit rounded-full border border-white/45 px-5 py-2">
              Can I get a refund?
            </div>
            <div className="rounded-2xl bg-bg-floating px-5 py-4 text-neutral-primary">
              Sure. Can you share your order number please?
            </div>
            <div className="ml-auto w-fit rounded-full border border-white/45 px-5 py-2">
              It&apos;s EL4543490
            </div>
            <div className="rounded-2xl bg-bg-floating px-5 py-4 text-neutral-primary">
              Thank you. I have initiated the order refund process.
            </div>
            <div className="flex w-fit items-center gap-2 rounded-full bg-bg-floating px-4 py-2 text-neutral-primary">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-[11px] text-neutral-00">
                S
              </span>
              Refund completed
            </div>
          </div>
        </Card>
        <Card
          title="이미 검증된 인재를 소개합니다."
          description="무작위 인재를 대량으로 연결하지 않습니다. Harper는 모든 인재와 대화하고, 그들의 숨겨진 니즈와 역량을 이해하고, 인터뷰할 가치가 있는 인재만 전달합니다."
        >
          <div className="relative h-full w-full overflow-hidden">
            {/* 회사에게, 각 사람들의 프로필이 어떻게 전달될지를 예시로 보여주는 카드. 여기서 중요한건 회사측에서 자연스럽게 "아 이렇게 프로필이 오면 이미 검증이 된 사람이고, 내가 궁금한 것들이 미리 알 수 있구나" 등의 생각이 들게 만드는 것. */}
            <div className="absolute top-0 right-0 rounded-bl-2xl w-[94%] min-h-[90%] bg-bg-floating p-6 shadow-sm">
              <p className="text-[14px] text-neutral-primary">김호진</p>
              <div>현재 Harper 재직중</div>
              <div>요구사항 3개 만족</div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-positive" /> 요구사항 1
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-positive" /> 요구사항 2
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-positive" /> 요구사항 3
              </div>
              <div>
                Harper에게 작은 팀에서의 founding 역할을 찾고있다고 알렸습니다.
              </div>
              <div>인터뷰 잡기</div>
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function ApiSection() {
  return (
    <Section bgColor="bg-neutral-00">
      <div className="mx-auto grid w-full gap-8 md:grid-cols-2">
        <h2 className={cn(fontBig, "max-w-[620px]")}>
          Smarter hiring starts here
        </h2>
        <p
          className={cn(fontMedium, "max-w-[560px] flex items-end justify-end")}
        >
          Configure, deploy and monitor natural, human-sounding age
        </p>
      </div>
      <div className="mx-auto mt-10 grid w-full gap-4 md:grid-cols-3">
        <div></div>
        <div></div>
        <div></div>
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
          careerStartHref={"/contact"}
          onCareerStartClick={() => {}}
          labels={{
            workflow: "Product",
            difference: "Why Harper",
            voices: "Stories",
            forCompanies: "For Companies",
            join: "Join",
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
            <PillLink href="#" variant="dark">
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
            <div className="flex flex-col gap-2">
              <p className={fontMedium}>
                <span className="text-primary">$2B</span> AI-first Asia VC
              </p>
              <p className={fontMedium}>
                <span className="text-primary">$2B</span> Global Agentic Company
              </p>
              <p className={fontMedium}>
                <span className="text-primary">Sequoia-backed</span> Consumer AI
                Agent
              </p>
            </div>
          </div>
        </Section>
        <AgentsSection />
        <ApiSection />

        <section className="eleven-frame bg-bg-default py-24">
          <div className="mx-auto flex w-full max-w-[1244px] flex-col gap-8 px-5 md:flex-row md:items-end md:justify-between md:px-8">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 text-[18px] font-semibold">
                <span
                  className="flex h-4 w-3 items-end gap-[2px]"
                  aria-hidden="true"
                >
                  <span className="h-4 w-[3px] bg-neutral-1000" />
                  <span className="h-4 w-[3px] bg-neutral-1000" />
                </span>
                ElevenLabs
              </p>
              <p className="text-[44px] font-normal leading-[1.04] md:text-[64px]">
                AI Communication Platform
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <PillLink href="#">Talk to sales</PillLink>
              <PillLink href="#" variant="dark">
                <span className="inline-flex items-center gap-2">
                  Create an AI agent <ArrowRight className="h-4 w-4" />
                </span>
              </PillLink>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
