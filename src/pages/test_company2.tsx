import Head from "next/head";
import Link from "next/link";
import { ArrowRight, Bot, Check, Copy, ShieldCheck } from "lucide-react";

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
  "T",
  "meesho",
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
      className={
        variant === "dark"
          ? "inline-flex h-11 items-center justify-center rounded-full bg-neutral-1000 px-6 text-[15px] font-medium text-neutral-00 transition-colors hover:bg-neutral-900"
          : "inline-flex h-11 items-center justify-center rounded-full border border-neutral-1000-a10 bg-bg-floating px-6 text-[15px] font-medium text-neutral-primary shadow-sm transition-colors hover:bg-bg-weak"
      }
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

function LogoGrid() {
  return (
    <section className="eleven-frame mx-auto w-full max-w-[1244px] px-5 py-16 md:px-8 md:py-24">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-[16px] text-neutral-primary">
          Trusted by leading developers and enterprises
        </h2>
        <PillLink href="#">Read all stories</PillLink>
      </div>
      <div className="grid grid-cols-2 border border-neutral-1000-a05 bg-bg-default sm:grid-cols-3 md:grid-cols-6">
        {logos.map((logo, index) => (
          <div
            key={logo}
            className="flex h-20 items-center justify-center gap-2 border-b border-r border-neutral-1000-a05 px-4 text-center text-[18px] font-semibold text-neutral-500 grayscale last:border-r-0"
          >
            <span
              className={`hidden h-5 w-5 shrink-0 ${
                index % 3 === 0
                  ? "rounded-full bg-neutral-300"
                  : index % 3 === 1
                    ? "rounded-sm bg-neutral-300"
                    : "bg-[linear-gradient(135deg,var(--color-neutral-300)_0_45%,transparent_45%_55%,var(--color-neutral-300)_55%)]"
              } md:inline-flex`}
              aria-hidden="true"
            />
            <span>{logo}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentsSection() {
  return (
    <section className="eleven-frame bg-bg-default py-24">
      <div className="mx-auto grid w-full max-w-[1244px] gap-8 px-5 md:grid-cols-2 md:px-8">
        <div>
          <p className="mb-5 text-[16px] text-neutral-muted">ElevenAgents</p>
          <h2 className="max-w-[620px] text-[40px] font-normal leading-[1.06] md:text-[44px]">
            Deploy agents that talk,
            <br />
            type, and take action
          </h2>
          <div className="mt-8">
            <PillLink href="#" variant="dark">
              Learn more
            </PillLink>
          </div>
        </div>
        <p className="max-w-[560px] text-[18px] leading-[1.42] text-neutral-primary md:pt-16">
          Configure, deploy and monitor natural, human-sounding agents in 70+
          languages with leading accuracy and ultra-low latency across voice or
          chat.
        </p>
      </div>
      <div className="mx-auto mt-10 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-2 md:px-8">
        <article className="relative min-h-[560px] overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-[linear-gradient(135deg,var(--color-green-700)_0%,var(--color-accent-300)_44%,var(--color-blue-500)_100%)] p-8 text-neutral-00">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_16%,rgba(255,255,255,0.18),transparent_24%),radial-gradient(circle_at_54%_56%,rgba(31,28,24,0.26),transparent_24%),radial-gradient(circle_at_90%_92%,rgba(255,255,255,0.2),transparent_30%)] opacity-85" />
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(31, 28, 24, 0.24) 0.6px, transparent 0.9px)",
              backgroundSize: "3px 3px",
            }}
          />
          <div className="relative flex items-center justify-between text-[13px] text-neutral-00/75">
            <span>Support agent</span>
            <span>Live</span>
          </div>
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
          <div className="relative mt-24 max-w-[470px]">
            <h3 className="text-[18px] text-neutral-00/80">
              Omnichannel agents
            </h3>
            <p className="mt-3 text-[17px] leading-[1.38]">
              Agents listen, read and interact just like humans would across
              phone, chat, email and WhatsApp.
            </p>
          </div>
        </article>
        <article className="min-h-[560px] rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-8">
          <div className="flex items-center justify-between text-[13px] text-neutral-muted">
            <span>Evaluation</span>
            <span>Last 7 days</span>
          </div>
          <div className="mt-12 rounded-2xl bg-bg-floating p-6 shadow-sm">
            <p className="text-[15px] text-neutral-primary">Resolution Rate</p>
            <p className="mt-1 text-[22px] text-neutral-muted">83.4%</p>
            <div className="mt-5 grid h-48 grid-cols-[48px_1fr] gap-3 text-[12px] text-neutral-muted">
              <div className="flex flex-col justify-between">
                <span>100%</span>
                <span>50%</span>
                <span>0%</span>
              </div>
              <div className="relative rounded-sm bg-[linear-gradient(180deg,transparent_33%,var(--color-neutral-1000-a05)_33%,var(--color-neutral-1000-a05)_34%,transparent_34%,transparent_66%,var(--color-neutral-1000-a05)_66%,var(--color-neutral-1000-a05)_67%,transparent_67%)]">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 420 190"
                  aria-hidden="true"
                >
                  <path
                    d="M0 128 C46 116 84 136 122 126 C170 114 210 132 256 122 C302 112 354 120 420 112 L420 190 L0 190 Z"
                    fill="var(--color-blue-100)"
                    opacity="0.36"
                  />
                  <path
                    d="M0 72 C28 60 50 64 78 55 C112 44 136 70 162 66 C190 62 206 46 232 58 C260 72 288 74 312 66 C346 54 378 48 420 66"
                    fill="none"
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                  />
                  <path
                    d="M0 104 C24 92 48 88 76 96 C104 106 130 86 160 98 C190 110 214 112 238 104 C264 94 290 120 316 114 C352 104 382 92 420 102"
                    fill="none"
                    stroke="var(--color-blue-500)"
                    strokeWidth="3"
                  />
                </svg>
                <div className="absolute left-[54%] top-0 h-full w-px bg-neutral-1000-a10" />
                <div className="absolute left-[44%] top-[30%] rounded-lg bg-bg-floating px-3 py-2 text-[12px] shadow">
                  <span className="text-primary">●</span> V1: 87.37%
                  <br />
                  <span className="text-blue-500">●</span> V2: 61.71%
                </div>
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-neutral-muted">
              <span>17 Aug</span>
              <span>24 Aug</span>
            </div>
          </div>
          <h3 className="mt-24 text-[18px] text-neutral-muted">Analytics</h3>
          <p className="mt-3 text-[17px] leading-[1.38] text-neutral-primary">
            Easily measure success rates and CX metrics, optimizing flows over
            time.
          </p>
        </article>
      </div>
      <div className="mx-auto mt-5 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-3 md:px-8">
        {agentCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="min-h-[270px] rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-8"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-20 text-[18px] text-neutral-muted">
                {card.title}
              </h3>
              <p className="mt-3 text-[17px] leading-[1.38] text-neutral-primary">
                {card.copy}
              </p>
            </article>
          );
        })}
        <article className="min-h-[270px] rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating">
            <Bot className="h-5 w-5" />
          </div>
          <h3 className="mt-20 text-[18px] text-neutral-muted">Workflows</h3>
          <p className="mt-3 text-[17px] leading-[1.38] text-neutral-primary">
            Handle complex conversation flows, apply business logic and connect
            securely to systems.
          </p>
        </article>
      </div>
      <div className="mx-auto mt-8 flex w-full max-w-[1244px] flex-col gap-4 px-5 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
          {["Deliveroo", "Meesho", "Cars24"].map((item, index) => (
            <span
              key={item}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold ${
                index === 1
                  ? "bg-[linear-gradient(135deg,var(--color-blue-500),var(--color-neutral-1000))] text-neutral-00"
                  : "bg-bg-floating text-neutral-muted"
              }`}
            >
              {item.slice(0, 4)}
            </span>
          ))}
          <div>
            <p className="text-[16px] text-neutral-primary">Meesho</p>
            <p className="text-[15px] text-neutral-muted">
              Delivering real-time, multilingual customer support with voice
              agents
            </p>
          </div>
        </div>
        <PillLink href="#">Get started</PillLink>
      </div>
    </section>
  );
}

function ApiSection() {
  return (
    <section className="eleven-frame bg-bg-default py-24">
      <SectionHeader
        eyebrow="ElevenAPI"
        title="Or build anything with a powerful host of APIs"
        action="Explore docs"
      />
      <div className="mx-auto mt-12 w-full max-w-[1244px] border-y border-neutral-1000-a05 px-5 md:px-8">
        {apiCards.map((card) => (
          <article
            key={card.title}
            className="grid border-b border-neutral-1000-a05 last:border-b-0 md:min-h-[300px] md:grid-cols-2"
          >
            <div className="py-10 pr-8 md:py-12 md:pr-14">
              <h3 className="text-[22px] font-normal text-neutral-primary">
                {card.title}
              </h3>
              <p className="mt-3 max-w-[520px] text-[18px] leading-[1.45] text-neutral-muted">
                {card.copy}
              </p>
              <div className="mt-9 grid gap-x-10 gap-y-6 md:grid-cols-2">
                {card.details.map(([title, detail]) => (
                  <div key={title}>
                    <h4 className="text-[17px] font-normal text-neutral-primary">
                      {title}
                    </h4>
                    <p className="mt-1 text-[16px] leading-[1.35] text-neutral-muted">
                      {detail}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t border-neutral-1000-a05 py-8 md:border-l md:border-t-0 md:pl-8">
              {card.visual === "scribe" ? (
                <div className="relative min-h-[300px] overflow-hidden rounded-2xl bg-bg-default">
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0_49%,var(--color-neutral-1000-a05)_49%_50%,transparent_50%_100%)]" />
                  <div
                    className="absolute left-[48%] top-[-80px] h-[520px] w-24 rounded-full border border-neutral-1000-a05 bg-bg-floating shadow-sm"
                    style={{ transform: "rotate(-32deg)" }}
                  >
                    <div className="absolute left-1/2 top-10 h-10 w-28 -translate-x-1/2 rounded-full border border-neutral-1000-a05 bg-bg-floating text-center text-[16px] font-semibold leading-10 shadow-sm">
                      Scribe
                    </div>
                    {["Gemini 2.0 Flash", "Whisper Large v3"].map(
                      (label, index) => (
                        <div
                          key={label}
                          className="absolute left-1/2 w-36 -translate-x-1/2 rounded-md bg-bg-weak px-3 py-2 text-center text-[13px] text-neutral-muted"
                          style={{ top: 150 + index * 68 }}
                        >
                          {label}
                        </div>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-7 shadow-sm">
                  <button
                    type="button"
                    aria-label="Copy code"
                    className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-md bg-bg-weak"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <pre className="overflow-x-auto pr-9 text-[14px] leading-[1.75] text-neutral-primary">
                    <code>{card.code}</code>
                  </pre>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

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

        .eleven-page {
          --eleven-rail-half: 590px;
          position: relative;
          isolation: isolate;
          background: var(--color-bg-default);
        }

        .eleven-page::before,
        .eleven-page::after {
          content: "";
          position: absolute;
          top: 64px;
          bottom: 0;
          width: 1px;
          background: var(--color-neutral-1000-a05);
          pointer-events: none;
          z-index: 1;
        }

        .eleven-page::before {
          left: calc(50% - var(--eleven-rail-half));
        }

        .eleven-page::after {
          left: calc(50% + var(--eleven-rail-half));
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
      <main className="eleven-page min-h-screen bg-bg-default text-neutral-primary">
        <section className="mx-auto w-full max-w-[1244px] px-5 pt-24 md:px-8 md:pt-28">
          <div className="grid gap-10 md:grid-cols-[0.95fr_1fr] md:items-end">
            <div>
              <h1 className="max-w-[620px] text-[48px] font-normal leading-[1.05] text-neutral-primary md:text-[51px]">
                Bringing
                <br />
                technology to life
              </h1>
              <div className="mt-7 flex flex-wrap gap-2">
                <PillLink href="#" variant="dark">
                  Sign up
                </PillLink>
                <PillLink href="#">Contact sales</PillLink>
              </div>
            </div>
            <p className="max-w-[560px] text-[18px] leading-[1.42] text-neutral-primary md:pb-8">
              Powering the best enterprises, creators, and developers. From
              ElevenAgents for customer experience, ElevenCreative for content
              creation, to the leading AI voice generator.
            </p>
          </div>
        </section>

        <LogoGrid />
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
