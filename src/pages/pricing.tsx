import { showToast } from "@/components/toast/toast";
import router from "next/router";
import React from "react";

type Plan = {
  name: string;
  price: string;
  blurb: string;
  bullets: string[];
  cta: string;
  highlight?: "popular" | "enterprise";
};
const plans: Plan[] = [
  {
    name: "Starter",
    price: "$49/month",
    blurb: "Find high-signal AI/ML talent\nfaster with Harper.",
    bullets: [
      "Search AI/ML Researchers & Engineers",
      "Profiles from Top Universities & Labs",
      "Google Scholar & Open-source Signals",
      "Basic Candidate Summaries",
    ],
    cta: "Get Started",
  },
  {
    name: "Pro",
    price: "$199/month",
    blurb: "Go deeper with AI-powered\ncandidate discovery.",
    bullets: [
      "Everything in Starter",
      "Advanced Semantic Talent Search",
      "AI-Generated Candidate Insights",
      "Experience & Research Signal Scoring",
      "Saved Searches & Shortlists",
    ],
    cta: "Get Started",
    highlight: "popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    blurb: "Hire world-class AI talent\nat scale.",
    bullets: [
      "Everything in Pro",
      "Direct Outreach & Introductions",
      "Custom Talent Pipelines",
      "Internal Hiring Workflow Integration",
      "Dedicated Support & API Access",
    ],
    cta: "Talk to sales",
    highlight: "enterprise",
  },
];

function CheckDot({ variant }: { variant: "blue" | "gray" }) {
  return (
    <span
      className={[
        "mt-[7px] inline-block h-1.5 w-1.5 rounded-full",
        variant === "blue" ? "bg-accenta1" : "bg-zinc-400",
      ].join(" ")}
    />
  );
}

function AvatarStack() {
  // simple initials placeholders (replace with real images if you want)
  const items = [
    { label: "A", bg: "bg-zinc-700" },
    { label: "B", bg: "bg-zinc-600" },
    { label: "C", bg: "bg-zinc-500" },
  ];
  return (
    <div className="flex items-center justify-center gap-3">
      <div className="flex -space-x-2">
        {items.map((it, i) => (
          <div
            key={i}
            className={[
              "h-8 w-8 rounded-full ring-2 ring-black/70 grid place-items-center text-xs font-semibold text-white",
              it.bg,
            ].join(" ")}
          >
            {it.label}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-start">
        <div className="flex items-center gap-1 text-white">
          {"★★★★★".split("").map((s, i) => (
            <span key={i} className="text-[12px] leading-none">
              {s}
            </span>
          ))}
        </div>
        <div className="text-[12px] text-zinc-400">1M+ Experts In-Network</div>
      </div>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isPopular = plan.highlight === "popular";
  const isEnterprise = plan.highlight === "enterprise";

  const shell =
    "relative w-full rounded-2xl border shadow-[0_20px_80px_rgba(0,0,0,0.6)]";

  const darkCard =
    "bg-gradient-to-b from-zinc-950/60 to-zinc-950/30 border-white/10";
  const enterpriseCard =
    "bg-white text-zinc-900 border-white/30 shadow-[0_30px_120px_rgba(0,0,0,0.65)]";

  return (
    <div
      className={[shell, isEnterprise ? enterpriseCard : darkCard].join(" ")}
    >
      {/* subtle inner border */}
      {!isEnterprise && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/5" />
      )}

      <div className="p-8 md:p-9">
        <div className="flex items-start justify-between gap-4 font-normal text-2xl">
          <div>
            <div className={isEnterprise ? "" : " text-white"}>{plan.name}</div>
            <div
              className={[
                "mt-1 text-3xl font-normal tracking-tight",
                isEnterprise ? "text-zinc-600" : "text-zinc-500",
              ].join(" ")}
            >
              {plan.price}
            </div>
          </div>

          {isPopular && (
            <div className="absolute top-3 right-3 inline-flex items-center rounded-full bg-accenta1 px-2 h-6 py-0 text-[11px] font-normal tracking-wide text-black">
              MOST POPULAR
            </div>
          )}
        </div>

        <div
          className={[
            "mt-6 whitespace-pre-line text-sm leading-relaxed",
            isEnterprise ? "text-zinc-600" : "text-zinc-500",
          ].join(" ")}
        >
          {plan.blurb}
        </div>

        <div
          className={[
            "my-6 h-px w-full",
            isEnterprise ? "bg-zinc-200" : "bg-white/10",
          ].join(" ")}
        />

        <ul className="space-y-3">
          {plan.bullets.map((b, idx) => (
            <li key={idx} className="flex gap-3">
              <CheckDot variant={isEnterprise ? "gray" : "blue"} />
              <span
                className={[
                  "text-sm",
                  isEnterprise ? "text-zinc-700" : "text-zinc-300",
                ].join(" ")}
              >
                {b}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-10">
          <button
            onClick={() => {
              showToast({
                message: "Coming soon",
                variant: "white",
              });
            }}
            className={[
              "w-full rounded-full px-4 py-3 text-sm font-medium transition",
              isEnterprise
                ? "bg-black text-white hover:bg-accenta1 hover:text-black"
                : "bg-white text-zinc-900 hover:bg-accenta1",
            ].join(" ")}
          >
            {plan.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PricingSection() {
  return (
    <section className="relative min-h-screen w-full overflow-hidden bg-black font-inter">
      {/* soft vignette / glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.08),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(255,255,255,0.06),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.10),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(236,72,153,0.10),transparent_45%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-16 md:py-20">
        {/* Header */}
        <div className="text-center">
          <h1 className="font-hedvig text-5xl tracking-tight text-white md:text-6xl">
            Pricing
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-hgray600 font-normal md:text-base">
            Subscribe to access our AI capabilities.
            <br />
            Pay-as-you-go to source experts.
          </p>

          {/* <div className="mt-6">
            <AvatarStack />
          </div> */}
        </div>

        {/* Cards */}
        <div className="mt-12 grid gap-6 md:mt-14 md:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.name} plan={p} />
          ))}
        </div>

        <div className="flex flex-row gap-4 mt-[30vh] items-center justify-center text-hgray600 font-light text-sm">
          <div
            className="hover:text-white hover:underline cursor-pointer"
            onClick={() => {
              window.open(
                "https://peat-find-598.notion.site/Terms-Conditions-2e684af768c68093aa9bc758db8659a5",
                "_blank"
              );
            }}
          >
            Terms & Conditions
          </div>
          <div
            className="hover:text-white hover:underline cursor-pointer"
            onClick={() => {
              window.open(
                "https://peat-find-598.notion.site/Privacy-2e684af768c680fe8983fb88fa6d8677",
                "_blank"
              );
            }}
          >
            Privacy Policy
          </div>
          <div
            className="hover:text-white hover:underline cursor-pointer"
            onClick={() => {
              window.open(
                "https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4",
                "_blank"
              );
            }}
          >
            Refund Policy
          </div>
        </div>
        <div
          onClick={() => router.push("/companies")}
          className="text-white underline cursor-pointer w-full text-center mt-4"
        >
          Home
        </div>
      </div>
    </section>
  );
}
