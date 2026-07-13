import Head from "next/head";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileAudio,
  Globe2,
  MessageCircle,
  Mic2,
  Music2,
  Play,
  ShieldCheck,
  Sparkles,
  Volume2,
  Wand2,
} from "lucide-react";

const navItems = [
  "ElevenCreative",
  "ElevenAgents",
  "ElevenAPI",
  "Resources",
  "Enterprise",
  "Pricing",
];

const productTabs = [
  {
    label: "ElevenCreative",
    dot: "bg-[radial-gradient(circle_at_35%_35%,var(--color-accent-300),var(--color-primary)_72%)]",
  },
  {
    label: "ElevenAgents",
    dot: "bg-[radial-gradient(circle_at_35%_35%,var(--color-green-300),var(--color-blue-500)_72%)]",
  },
  {
    label: "ElevenAPI",
    dot: "bg-[radial-gradient(circle_at_35%_35%,var(--color-neutral-300),var(--color-neutral-1000)_72%)]",
  },
];

const creativeTabs = [
  "AI Voice Generator",
  "Text to Speech",
  "Music",
  "Speech to Text",
  "Voice Cloning",
  "Dubbing",
];

const voiceTypes = [
  {
    title: "Advertisement",
    copy: "Persuasive voices that drive action and brand recall.",
    tone: "from-accent-100 via-red-100 to-bg-floating",
    side: true,
  },
  {
    title: "Characters",
    copy: "Playful and engaging voices for cartoons or video games.",
    tone: "from-blue-300 via-violet-300 to-accent-300",
  },
  {
    title: "Narration",
    copy: "Expressive voices that bring audiobooks and podcasts to life.",
    tone: "from-red-300 via-blue-200 to-accent-300",
    active: true,
  },
  {
    title: "Conversational",
    copy: "Natural voices perfect for informal scenarios.",
    tone: "from-green-300 via-blue-200 to-accent-300",
  },
  {
    title: "Social Media",
    copy: "Trendy, attention-grabbing voices for short-form content.",
    tone: "from-red-100 via-accent-100 to-bg-floating",
    side: true,
  },
];

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

const platforms = [
  {
    name: "ElevenCreative",
    href: "/creative",
    copy: "Generate ultra-realistic speech, videos, music, and sound effects.",
    preview: "Creative workspace",
    rows: ["Voiceover", "Flow creation", "Voice cloning"],
    icon: Sparkles,
  },
  {
    name: "ElevenAgents",
    href: "/agents",
    copy: "Configure, deploy and monitor conversational agents.",
    preview: "Agent operations",
    rows: ["Call statistics", "Resolution alerts", "Live transcripts"],
    icon: Bot,
  },
];

const creativeCards = [
  {
    title: "All-in-one AI editor",
    copy: "Create podcasts, audiobooks and voiceovers in an editor built on ElevenLabs audio research.",
    icon: Wand2,
    wide: true,
  },
  {
    title: "Ultra-realistic speech",
    copy: "Create controllable, expressive speech layered across 70+ languages.",
    icon: Volume2,
    input: true,
  },
  {
    title: "Music",
    copy: "Generate studio-quality tracks instantly, any genre, any style, vocals or instrumental.",
    icon: Music2,
  },
  {
    title: "SFX",
    copy: "Create custom sound effects, soundscapes and ambient audio or search the SFX library.",
    icon: FileAudio,
  },
  {
    title: "Voices",
    copy: "Clone your voice, design one from a prompt, or explore 10,000+ voices from the library.",
    icon: Mic2,
  },
  {
    title: "Image & Video",
    copy: "Create or edit images and turn ideas into videos with leading generative models.",
    icon: Sparkles,
  },
];

const agentCards = [
  {
    title: "Omnichannel agents",
    copy: "Agents listen, read and interact just like humans across phone, chat, email and WhatsApp.",
    icon: MessageCircle,
  },
  {
    title: "Analytics",
    copy: "Measure success rates and CX metrics, optimizing flows over time.",
    icon: Globe2,
  },
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
    meta: ["Eleven Flash", "Eleven Multilingual", "Eleven v3"],
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
    meta: ["Eleven Scribe", "98% accuracy"],
    details: [["Eleven Scribe", "98% accuracy with speaker diarization"]],
    visual: "scribe",
    code: 'const result = await client.speechToText.convert({\n  file,\n  modelId: "scribe_v2"\n});',
  },
  {
    title: "Music API",
    copy: "Studio-grade music with natural language prompts in any genre.",
    meta: ["Licensed data", "Commercial use"],
    details: [
      ["Music", "Trained on licensed data and suitable for commercial use"],
    ],
    visual: "code",
    code: 'const plan = await client.music.compositionPlan.create({\n  prompt: "Fast-paced electronic track",\n  musicLengthMs: 10000\n});',
  },
];

const storyCards = [
  "ElevenLabs showcases multilingual AI voice technology with NVIDIA ACE at Computex",
  "ElevenLabs AI voice revives Salvador Dali with a surreal twist",
  "Ukrainian public services will speak through AI",
  "Bringing AI voice agents to customer service for Europe largest Telco",
  "Matthew McConaughey's Lyrics of Livin expands with ElevenLabs",
  "ElevenLabs Impact releases original docuseries",
];

const safetyItems = [
  ["Moderation", "We actively monitor content generated with our technology."],
  ["Accountability", "We believe misuse must have clear consequences."],
  ["Provenance", "We believe people should know if audio is AI-generated."],
];

const updates = [
  ["Introducing Flows in ElevenCreative", "Product", "Mar 11, 2026"],
  ["Introducing ElevenLabs for Government", "Product", "Feb 11, 2026"],
  ["Introducing Expressive Mode for ElevenAgents", "Product", "Feb 10, 2026"],
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

function VoiceOrb({
  tone,
  active,
  side,
}: {
  tone: string;
  active?: boolean;
  side?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto flex rounded-full bg-gradient-to-br ${tone} ${
        active
          ? "h-60 w-60 shadow-[inset_0_0_44px_rgba(255,255,255,0.42)] md:h-[256px] md:w-[256px]"
          : side
            ? "h-36 w-36 opacity-55 shadow-[inset_0_0_34px_rgba(255,255,255,0.55)] md:h-[146px] md:w-[146px]"
            : "h-44 w-44 opacity-85 shadow-[inset_0_0_36px_rgba(255,255,255,0.5)] md:h-[202px] md:w-[202px]"
      }`}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.68),transparent_30%),radial-gradient(circle_at_80%_82%,rgba(217,107,40,0.38),transparent_28%),radial-gradient(circle_at_55%_58%,rgba(31,28,24,0.08),transparent_56%)] opacity-90" />
      <div
        className="absolute inset-0 rounded-full opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(31, 28, 24, 0.22) 0.6px, transparent 0.8px)",
          backgroundSize: "3px 3px",
        }}
      />
      {active && (
        <button
          type="button"
          aria-label="Play preview"
          className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-bg-floating text-neutral-1000 shadow-lg"
        >
          <Play className="ml-1 h-5 w-5 fill-current" />
        </button>
      )}
    </div>
  );
}

function ShowcasePanel() {
  const positionClassNames = [
    "md:absolute md:left-[-84px] md:top-[96px]",
    "md:absolute md:left-[160px] md:top-[72px]",
    "md:absolute md:left-1/2 md:top-[46px] md:-translate-x-1/2",
    "md:absolute md:right-[160px] md:top-[72px]",
    "md:absolute md:right-[-84px] md:top-[96px]",
  ];

  return (
    <section className="eleven-frame mx-auto mt-10 w-full max-w-[1244px] px-5 md:px-8">
      <div className="overflow-hidden rounded-2xl border border-neutral-1000-a10 bg-bg-weak">
        <div className="flex overflow-x-auto border-b border-neutral-1000-a05 bg-bg-weak md:grid md:grid-cols-3 md:overflow-visible">
          {productTabs.map((tab, index) => (
            <button
              key={tab.label}
              type="button"
              className={`flex h-12 min-w-[228px] items-center justify-center gap-2 text-[16px] md:min-w-0 ${
                index === 0
                  ? "m-1 rounded-xl border border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm"
                  : "text-neutral-muted"
              }`}
            >
              <span className={`h-3 w-3 rounded-full ${tab.dot}`} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bg-bg-default px-5 pb-5 pt-12 md:px-10 md:pb-6 md:pt-4">
          <div className="relative mx-auto flex min-h-[390px] max-w-[1120px] items-start gap-8 overflow-x-auto overflow-y-hidden pb-4 md:block md:min-h-[430px] md:overflow-hidden md:pb-0">
            {voiceTypes.map((item, index) => (
              <div
                key={item.title}
                className={`min-w-[230px] text-center md:min-w-0 ${
                  item.side ? "hidden md:block" : ""
                } ${positionClassNames[index] ?? ""}`}
              >
                <VoiceOrb
                  tone={item.tone}
                  active={item.active}
                  side={item.side}
                />
                <h3
                  className={`mt-10 text-[18px] font-medium text-neutral-primary ${
                    item.side ? "md:opacity-0" : ""
                  }`}
                >
                  {item.title}
                  {item.active && <span className="ml-1">↗</span>}
                </h3>
                <p
                  className={`mx-auto mt-2 max-w-[220px] text-[14px] leading-[1.35] text-neutral-muted ${
                    item.side ? "md:opacity-0" : ""
                  }`}
                >
                  {item.copy}
                </p>
              </div>
            ))}
            <button
              type="button"
              aria-label="Previous voice category"
              className="absolute left-[37%] top-[348px] hidden h-8 w-8 items-center justify-center rounded-full text-neutral-muted md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next voice category"
              className="absolute right-[36%] top-[348px] hidden h-8 w-8 items-center justify-center rounded-full text-neutral-muted md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap justify-center gap-2 md:justify-start">
              {creativeTabs.map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  className={`h-10 rounded-full px-4 text-[15px] ${
                    index === 0
                      ? "border border-neutral-1000-a10 bg-bg-floating text-neutral-primary shadow-sm"
                      : "text-neutral-muted hover:bg-bg-weak"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <PillLink href="#" variant="dark">
              Sign up
            </PillLink>
          </div>
        </div>
      </div>
    </section>
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

function PlatformCards() {
  return (
    <section className="eleven-frame bg-bg-default pt-24 pb-14">
      <div className="mx-auto w-full max-w-[1244px] px-5 md:px-8">
        <h2 className="max-w-[650px] text-[40px] font-normal leading-[1.06] text-neutral-primary md:text-[48px]">
          Two platforms built on the same research foundation
        </h2>
        <div className="mt-8 grid gap-12 md:grid-cols-2">
          {platforms.map((platform) => (
            <div key={platform.name}>
              <Link
                href={platform.href}
                className="text-[17px] font-semibold text-neutral-primary"
              >
                {platform.name}
              </Link>
              <p className="mt-2 max-w-[360px] text-[17px] leading-[1.35] text-neutral-muted">
                {platform.copy}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-10 h-[520px] overflow-x-auto overflow-y-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-6 md:overflow-hidden md:p-8">
          <div className="grid h-[456px] min-w-[960px] grid-cols-[0.82fr_1.18fr] overflow-hidden rounded-xl border border-neutral-1000-a05 bg-bg-floating shadow-sm">
            <div className="grid grid-cols-[128px_1fr] border-r border-neutral-1000-a05">
              <div className="border-r border-neutral-1000-a05 bg-bg-default p-4">
                <p className="text-[11px] font-bold">ElevenLabs</p>
                {[
                  "ElevenCreative",
                  "Home",
                  "Voices",
                  "Studio",
                  "Flows",
                  "Templates",
                  "Assets",
                ].map((item, index) => (
                  <div
                    key={item}
                    className={`mt-2 rounded-md px-2 py-1.5 text-[10px] ${
                      index === 1
                        ? "bg-bg-weak text-neutral-primary"
                        : "text-neutral-muted"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div className="p-8">
                <p className="mt-8 text-[18px] font-medium">
                  What would you like to create?
                </p>
                <div className="mt-8 grid grid-cols-2 gap-3">
                  {["Voiceover for a Video", "Create a Flow"].map((item) => (
                    <div
                      key={item}
                      className="h-24 rounded-lg border border-neutral-1000-a05 bg-bg-default p-3"
                    >
                      <div className="h-8 rounded-md bg-[linear-gradient(90deg,var(--color-blue-100),var(--color-primary-faded))]" />
                      <p className="mt-3 text-[11px]">{item}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {["Product Shot", "Poster design", "Outfit change"].map(
                    (item) => (
                      <div
                        key={item}
                        className="h-24 rounded-lg bg-[linear-gradient(135deg,var(--color-bg-weak),var(--color-primary-faded))] p-2 text-[10px]"
                      >
                        {item}
                      </div>
                    )
                  )}
                </div>
                <div className="mt-8 flex items-center gap-4 border-b border-neutral-1000-a05 pb-2 text-[10px]">
                  <span className="text-neutral-primary">Templates</span>
                  <span className="text-neutral-muted">Recent</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {["Audio ad sequence", "Podcast opener"].map((item, index) => (
                    <div
                      key={item}
                      className={`h-24 rounded-lg p-3 text-[10px] ${
                        index === 0
                          ? "bg-[linear-gradient(135deg,var(--color-accent-300),var(--color-bg-weak))]"
                          : "bg-[linear-gradient(135deg,var(--color-blue-100),var(--color-bg-floating))]"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[128px_1fr]">
              <div className="border-r border-neutral-1000-a05 bg-bg-default p-4">
                <p className="text-[11px] font-bold">ElevenAgents</p>
                {[
                  "Home",
                  "Support Agent",
                  "Marketing Agent",
                  "Outbound Sales",
                  "Knowledge",
                  "Tools",
                  "Phone Numbers",
                ].map((item, index) => (
                  <div
                    key={item}
                    className={`mt-2 rounded-md px-2 py-1.5 text-[10px] ${
                      index === 0
                        ? "bg-bg-weak text-neutral-primary"
                        : "text-neutral-muted"
                    }`}
                  >
                    {item}
                  </div>
                ))}
              </div>
              <div className="p-8">
                <p className="text-[18px] font-medium">Good afternoon, John</p>
                <div className="mt-5 flex gap-4 border-b border-neutral-1000-a05 pb-3 text-[10px] text-neutral-muted">
                  {[
                    "General",
                    "Evaluation",
                    "Data Collection",
                    "Workflow",
                    "Audio",
                    "Tools",
                  ].map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {["High severity", "Low resolution rate"].map((item) => (
                    <div
                      key={item}
                      className="rounded-lg border border-neutral-1000-a05 bg-bg-default p-4"
                    >
                      <span className="rounded-full bg-critical-faded px-2 py-1 text-[10px] text-critical">
                        {item}
                      </span>
                      <p className="mt-3 text-[11px] text-neutral-muted">
                        Review failure patterns and update the knowledge base.
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-neutral-1000-a05 bg-bg-default p-4">
                  <div className="grid grid-cols-4 gap-3 text-[11px]">
                    {[
                      "Calls 77,258",
                      "Latency 2:51",
                      "CSAT 4.7",
                      "Avg. time 3:54",
                    ].map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  <div className="mt-5 h-32 rounded-md bg-[linear-gradient(180deg,transparent_55%,var(--color-blue-100)_55%),linear-gradient(110deg,transparent_8%,var(--color-blue-500)_9%,transparent_10%,transparent_28%,var(--color-blue-500)_29%,transparent_30%,transparent_48%,var(--color-blue-500)_49%,transparent_50%,transparent_68%,var(--color-blue-500)_69%,transparent_70%)]" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {["Solved user enquiry 88.2%", "Most used language: Text to Speech"].map(
                    (item) => (
                      <div
                        key={item}
                        className="rounded-lg border border-neutral-1000-a05 bg-bg-default p-3 text-[10px] text-neutral-muted"
                      >
                        {item}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CreativeSection() {
  return (
    <section className="eleven-frame bg-bg-default pt-24 pb-12">
      <div className="mx-auto grid w-full max-w-[1244px] gap-8 px-5 md:grid-cols-2 md:px-8">
        <div>
          <p className="mb-5 text-[16px] text-neutral-muted">ElevenCreative</p>
          <h2 className="max-w-[560px] text-[40px] font-normal leading-[1.06] md:text-[44px]">
            Create, edit, and localize
            <br />
            in one AI platform
          </h2>
          <div className="mt-8">
            <PillLink href="#" variant="dark">
              Learn more
            </PillLink>
          </div>
        </div>
        <p className="max-w-[560px] text-[18px] leading-[1.42] text-neutral-primary md:pt-16">
          Create ultra-realistic speech, turn ideas into videos, compose music
          in any genre, or design immersive sound effects. Craft your next film,
          ad, campaign, social content, audiobook, or podcast with our creative
          platform.
        </p>
      </div>
      <div className="mx-auto mt-10 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-2 md:px-8">
        <article className="relative min-h-[560px] overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-[radial-gradient(circle_at_18%_18%,var(--color-accent-300),transparent_30%),radial-gradient(circle_at_70%_82%,var(--color-blue-500),transparent_38%),linear-gradient(135deg,var(--color-bg-floating)_0_42%,var(--color-bg-weak)_42%_100%)]">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(31, 28, 24, 0.24) 0.6px, transparent 0.9px)",
              backgroundSize: "3px 3px",
            }}
          />
          <div className="relative m-8 overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating shadow-sm">
            <div className="grid min-h-[300px] grid-cols-[1fr_160px]">
              <div className="p-8">
                <p className="max-w-[360px] text-[15px] leading-[1.45] text-neutral-primary">
                  Amidst the outer atmosphere of the planet Aurora, the sky
                  shimmered with fractured light, as though the planet&apos;s
                  veil were made of stained glass suspended in space.
                </p>
                <p className="mt-7 max-w-[350px] text-[15px] leading-[1.45] text-neutral-soft">
                  Sensors pulsed with irregular patterns, the kind no algorithm
                  could quite reconcile.
                </p>
              </div>
              <div className="border-l border-neutral-1000-a05 bg-[linear-gradient(135deg,var(--color-blue-100),var(--color-primary-faded),var(--color-bg-floating))]" />
            </div>
            <div className="border-t border-neutral-1000-a05 p-4">
              <div className="mb-3 flex h-11 w-[250px] rounded-xl border-2 border-neutral-1000 bg-[repeating-linear-gradient(110deg,var(--color-blue-500)_0_38px,var(--color-accent-300)_38px_76px)]" />
              <div className="flex gap-2">
                <div className="h-10 flex-1 rounded-lg border border-neutral-1000-a10 bg-bg-floating px-4 py-2 text-[13px] text-neutral-muted">
                  Amidst the outer atmosphere of the planet ...
                </div>
                <button
                  type="button"
                  aria-label="Generate"
                  className="flex h-10 w-14 items-center justify-center rounded-lg border border-neutral-1000-a10 bg-bg-floating"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="absolute bottom-8 left-8 max-w-[470px] text-neutral-00">
            <h3 className="text-[18px] font-normal text-neutral-00/80">
              All-in-one AI editor
            </h3>
            <p className="mt-3 text-[17px] leading-[1.38]">
              Create podcasts, audiobooks and voiceovers in an editor built on
              all of ElevenLabs&apos; audio research.
            </p>
          </div>
        </article>
        <article className="flex min-h-[560px] flex-col justify-between rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-7">
          <div className="mx-auto mt-20 w-full max-w-[520px] rounded-2xl bg-bg-floating p-5 shadow-sm">
            <p className="text-[16px] leading-[1.42]">
              In the ancient land of Eldoria, where skies shimmered and forests,
              whispered secrets to the wind, lived a dragon named Zephyros.
              <span className="text-neutral-soft"> [sarcastically] </span>
              Not the &quot;burn it all down&quot; kind...
              <span className="text-neutral-soft"> [giggles] </span>
              but he was gentle, wise, with eyes like old stars.
              <span className="text-neutral-soft"> [whispers] </span>
              Even the birds fell silent when he passed.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="h-9 rounded-full px-3 text-[14px]"
              >
                English⌄
              </button>
              <button
                type="button"
                className="h-9 rounded-full px-3 text-[14px]"
              >
                Spuds Oxley⌄
              </button>
              <button
                type="button"
                className="ml-auto h-10 rounded-full bg-neutral-1000 px-5 text-[14px] text-neutral-00"
              >
                Play
              </button>
            </div>
          </div>
          <div className="max-w-[470px]">
            <h3 className="text-[18px] font-normal text-neutral-muted">
              Ultra-realistic speech
            </h3>
            <p className="mt-3 text-[17px] leading-[1.38] text-neutral-primary">
              Create controllable, expressive speech layered across 70+
              languages.
            </p>
          </div>
        </article>
      </div>
      <div className="mx-auto mt-5 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-4 md:px-8">
        {creativeCards.slice(2).map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="min-h-[230px] rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-7"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-1000-a05 bg-bg-floating">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-16 text-[18px] font-normal text-neutral-muted">
                {card.title}
              </h3>
              <p className="mt-2 text-[16px] leading-[1.35] text-neutral-primary">
                {card.copy}
              </p>
            </article>
          );
        })}
      </div>
      <div className="mx-auto mt-6 flex w-full max-w-[1244px] flex-col gap-4 px-5 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-3 overflow-x-auto pb-1 md:overflow-visible md:pb-0">
          {["NVIDIA", "Clay", "Duolingo"].map((item, index) => (
            <span
              key={item}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold ${
                index === 1
                  ? "bg-blue-500 text-neutral-00"
                  : "bg-bg-weak text-neutral-muted"
              }`}
            >
              {item.slice(0, 4)}
            </span>
          ))}
          <div>
            <p className="text-[16px] text-neutral-primary">Clay ↗</p>
            <p className="text-[15px] text-neutral-muted">
              Streamlining product updates and localization with AI voices
            </p>
          </div>
        </div>
        <PillLink href="#">Get started</PillLink>
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
        {agentCards.slice(2).map((card) => {
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
            <p className="text-[16px] text-neutral-primary">Meesho ↗</p>
            <p className="text-[15px] text-neutral-muted">
              Delivering real-time, multilingual customer support with voice agents
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

function ResearchSection() {
  return (
    <section className="eleven-frame bg-bg-default py-24">
      <div className="mx-auto max-w-[760px] px-5 text-center md:px-8">
        <h2 className="text-[38px] font-normal leading-[1.04] text-neutral-primary md:text-[48px]">
          Showcasing the global
          <br />
          impact of AI audio research
        </h2>
      </div>
      <div className="mx-auto mt-10 w-full max-w-[1244px] px-5 md:px-8">
        <div className="mx-auto mb-10 flex w-fit rounded-full border border-neutral-1000-a10 bg-bg-floating p-1">
          {["ElevenCreative", "ElevenAgents"].map((item, index) => (
            <button
              key={item}
              type="button"
              className={`h-10 rounded-full px-5 text-[14px] ${
                index === 0
                  ? "bg-neutral-1000 text-neutral-00"
                  : "text-neutral-muted"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="grid gap-5 md:grid-cols-4">
          {storyCards.map((story, index) => (
            <article
              key={story}
              className={`overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating ${
                index === 0 || index === 3 ? "md:col-span-2" : ""
              }`}
            >
              <div
                className={`flex min-h-[190px] items-end p-5 ${
                  index % 2 === 0
                    ? "bg-[linear-gradient(135deg,var(--color-primary-faded),var(--color-bg-weak),var(--color-blue-100)),radial-gradient(circle_at_72%_18%,rgba(31,28,24,0.18),transparent_28%)]"
                    : "bg-[linear-gradient(135deg,var(--color-bg-weak),var(--color-green-100),var(--color-primary-faded)),radial-gradient(circle_at_30%_20%,rgba(31,28,24,0.16),transparent_28%)]"
                }`}
              >
                <div>
                  <span className="rounded-full bg-bg-floating/80 px-3 py-1 text-[12px] text-neutral-muted shadow-sm">
                    Case study
                  </span>
                  <h3 className="mt-6 max-w-[460px] text-[21px] font-normal leading-[1.16] text-neutral-primary">
                    {story}
                  </h3>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-24 w-full max-w-[1244px] px-5 md:px-8">
        <div className="grid gap-8 md:grid-cols-2">
          <h2 className="text-[44px] font-normal leading-[1.05] md:text-[56px]">
            Research that redefines human technology interaction
          </h2>
          <p className="max-w-[530px] text-[17px] leading-[1.45] text-neutral-primary md:pt-2">
            Our vision is to make communication and creation with technology
            seamless. We build our own foundational models, beginning with the
            first human-like voice model and now extending far beyond voice.
          </p>
        </div>

        <div className="relative mt-12 min-h-[500px] overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-weak p-8">
          <button
            type="button"
            aria-label="Previous research event"
            className="absolute left-32 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating shadow-sm md:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next research event"
            className="absolute right-32 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-neutral-1000-a05 bg-bg-floating shadow-sm md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute left-[17%] right-[17%] top-[47%] flex h-10 items-center gap-2">
            {Array.from({ length: 54 }).map((_, index) => (
              <span
                key={index}
                className={`w-px bg-neutral-1000 ${
                  index % 9 === 0
                    ? "h-5 opacity-50"
                    : index % 3 === 0
                      ? "h-3 opacity-30"
                      : "h-2 opacity-10"
                }`}
              />
            ))}
          </div>
          <div className="absolute left-[73%] top-[27%] flex flex-col items-center text-center">
            <p className="mb-3 text-[17px] text-neutral-primary">Dubbing v2</p>
            <div className="h-36 w-5 rounded-full border border-neutral-1000-a10 bg-bg-floating shadow-sm">
              <div className="mx-auto mt-3 h-28 w-px bg-neutral-1000" />
            </div>
            <p className="mt-4 max-w-[300px] text-[15px] leading-[1.4] text-neutral-primary">
              For the first time, the emotion and performance of the original
              speaker carries across every language.
            </p>
            <p className="mt-3 text-[14px] text-neutral-muted">May 2026</p>
          </div>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-[0.75fr_1fr_1fr]">
          <div className="flex flex-col justify-between">
            <p className="max-w-[360px] text-[18px] leading-[1.38] text-neutral-primary">
              Advancing research beyond voice into transcription, music, voice
              cloning, intelligent agents, and more.
            </p>
            <PillLink href="#">
              <span className="inline-flex items-center gap-2">
                Learn more <ArrowRight className="h-4 w-4" />
              </span>
            </PillLink>
          </div>
          {["Introducing Dubbing v2", "Introducing Music v2"].map(
            (title, index) => (
              <article
                key={title}
                className="overflow-hidden rounded-2xl border border-neutral-1000-a05 bg-bg-floating shadow-sm"
              >
                <div
                  className={`h-44 p-4 ${
                    index === 0
                      ? "bg-[radial-gradient(circle_at_45%_45%,var(--color-red-300),var(--color-blue-500)_58%,var(--color-neutral-1000))]"
                      : "bg-[radial-gradient(circle_at_45%_45%,var(--color-green-300),var(--color-accent-300)_58%,var(--color-neutral-1000))]"
                  }`}
                >
                  <span className="rounded-full bg-bg-floating px-3 py-1 text-[13px] text-neutral-primary">
                    May 2026
                  </span>
                  <div className="mt-8 h-20 rounded-xl border border-white/30 bg-[linear-gradient(135deg,transparent_0_48%,rgba(255,255,255,0.28)_48%_50%,transparent_50%_100%)]" />
                </div>
                <h3 className="p-5 text-[17px] font-normal text-neutral-primary">
                  {title}
                </h3>
              </article>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function SafetyAndUpdates() {
  return (
    <section className="eleven-frame bg-bg-default py-24">
      <SectionHeader
        title="Safety, built in"
        copy="We design safeguards, provenance, and review systems directly into the product surface."
        action="Learn more"
      />
      <div className="mx-auto mt-12 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-3 md:px-8">
        {safetyItems.map(([title, copy], index) => (
          <article
            key={title}
            className="flex min-h-[330px] flex-col rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-5"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-faded text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="mt-10 rounded-xl bg-[linear-gradient(135deg,var(--color-primary-faded),var(--color-bg-weak),var(--color-bg-floating))] p-4">
              <div className="grid h-16 grid-cols-5 items-end gap-2">
                {[36, 54, 28, 62, 44].map((height, barIndex) => (
                  <span
                    key={barIndex}
                    className={`rounded-full ${
                      barIndex === index + 1
                        ? "bg-primary"
                        : "bg-neutral-1000-a10"
                    }`}
                    style={{ height }}
                  />
                ))}
              </div>
            </div>
            <h3 className="mt-auto pt-8 text-[24px] font-normal">{title}</h3>
            <p className="mt-2 text-[15px] leading-[1.42] text-neutral-muted">
              {copy}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-24">
        <SectionHeader title="Latest updates" action="All posts" />
        <div className="mx-auto mt-12 grid w-full max-w-[1244px] gap-5 px-5 md:grid-cols-3 md:px-8">
          {updates.map(([title, category, date], index) => (
            <article
              key={title}
              className="flex min-h-[360px] flex-col rounded-2xl border border-neutral-1000-a05 bg-bg-floating p-5"
            >
              <div className="mb-8 flex h-36 items-end rounded-xl bg-[linear-gradient(135deg,var(--color-bg-weak),var(--color-primary-faded),var(--color-bg-floating))] p-4">
                <span className="rounded-full bg-bg-floating/85 px-3 py-1 text-[12px] text-neutral-muted shadow-sm">
                  {index === 0 ? "Featured" : "Update"}
                </span>
              </div>
              <h3 className="text-[22px] font-normal leading-[1.16]">
                {title}
              </h3>
              <dl className="mt-auto grid grid-cols-2 gap-3 pt-8 text-[13px]">
                <div>
                  <dt className="text-neutral-soft">Category</dt>
                  <dd className="mt-1 text-neutral-muted">{category}</dd>
                </div>
                <div>
                  <dt className="text-neutral-soft">Date</dt>
                  <dd className="mt-1 text-neutral-muted">{date}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
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
      <main className="eleven-page min-h-screen bg-bg-default pt-16 text-neutral-primary">
        <header className="fixed left-0 right-0 top-0 z-[100] border-b border-neutral-1000-a05 bg-bg-default shadow-[0_1px_0_var(--color-neutral-1000-a05)]">
          <div className="mx-auto flex h-16 w-full max-w-[1244px] items-center px-5 md:px-8">
            <Link
              href="#"
              className="inline-flex items-center gap-1.5 text-[20px] font-bold"
            >
              <span
                className="flex h-4 w-3 items-end gap-[2px]"
                aria-hidden="true"
              >
                <span className="h-4 w-[3px] bg-neutral-1000" />
                <span className="h-4 w-[3px] bg-neutral-1000" />
              </span>
              ElevenLabs
            </Link>
            <nav className="ml-12 hidden items-center gap-8 text-[14px] md:flex">
              {navItems.map((item) => (
                <Link key={item} href="#" className="hover:text-neutral-muted">
                  {item}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex">
                <PillLink href="#">Contact sales</PillLink>
              </span>
              <PillLink href="#" variant="dark">
                Sign up
              </PillLink>
            </div>
          </div>
        </header>

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

        <ShowcasePanel />
        <LogoGrid />
        <PlatformCards />
        <CreativeSection />
        <AgentsSection />
        <ApiSection />
        <ResearchSection />
        <SafetyAndUpdates />

        <section className="eleven-frame bg-bg-default py-24">
          <div className="mx-auto flex w-full max-w-[1244px] flex-col gap-8 px-5 md:flex-row md:items-end md:justify-between md:px-8">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 text-[18px] font-semibold">
                <span className="flex h-4 w-3 items-end gap-[2px]" aria-hidden="true">
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
