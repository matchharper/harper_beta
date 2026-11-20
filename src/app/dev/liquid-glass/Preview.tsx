"use client";

import { useState } from "react";
import { ArrowUp, Plus, Sparkles, Zap } from "lucide-react";
import { LiquidGlass } from "@/components/ui/liquid-glass";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { cn } from "@/lib/utils";

const TILES = [
  ["bg-[linear-gradient(135deg,#ffcc00,#ff4d00)] text-[#1a0a00]", "LUNCH O'CLOCK"],
  ["bg-[linear-gradient(160deg,#0f2027,#2c5364)] text-[#9fe7ff]", "Seedance"],
  ["bg-[linear-gradient(135deg,#ff6fd8,#3813c2)] text-white", "NEON NIGHT"],
  ["bg-[linear-gradient(180deg,#d9f99d,#16a34a)] text-[#052e16]", "숲"],
  ["bg-[repeating-linear-gradient(45deg,#111_0_14px,#f5f5f5_14px_28px)] text-white", ""],
  ["bg-[linear-gradient(135deg,#e11d48,#7f1d1d)] text-white", "FEATURE"],
  ["bg-[linear-gradient(120deg,#1e3a8a,#60a5fa)] text-[#e0f2fe]", "Harper"],
  ["bg-[conic-gradient(from_90deg,#f43f5e,#f59e0b,#22c55e,#3b82f6,#a855f7,#f43f5e)] text-white", ""],
] as const;

function DriftingTiles() {
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col justify-center gap-3">
      {[0, 1, 2].map((row) => {
        const order = TILES.map((_, i) => TILES[(i * 3 + row * 2) % TILES.length]);
        return (
          <div
            key={row}
            className={cn("lg-row flex w-max gap-3", row === 1 && "lg-row-reverse")}
          >
            {[...order, ...order].map(([tone, label], i) => (
              <div
                key={i}
                className={cn(
                  "flex h-[118px] w-[210px] flex-none items-end rounded-xl p-3 text-[28px] leading-none font-semibold tracking-tight",
                  tone,
                )}
              >
                {label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ChipButton({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full bg-white/5 px-3 text-sm font-medium hover:bg-white/10"
    >
      {children}
    </button>
  );
}

type Engine = "chromium" | "fallback";

export default function Preview() {
  const [engine, setEngine] = useState<Engine>("chromium");
  const refract = engine === "chromium";

  return (
    <main className="min-h-screen bg-neutral-1000 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">LiquidGlass</h1>
            <p className="text-sm text-white/60">
              Chromium에서는 가장자리 굴절, Safari·Firefox·iOS에서는 blur 표면으로 보입니다.
            </p>
          </div>
          <div className="rounded-xl bg-bg-floating p-1.5 text-neutral-1000">
            <TabBoxes
              activeValue={engine}
              aria-label="브라우저"
              className="w-auto"
              items={[
                { label: "Chromium", value: "chromium" },
                { label: "Safari · Firefox · iOS", value: "fallback" },
              ]}
              onValueChange={setEngine}
              size="sm"
            />
          </div>
        </header>

        <section className="relative h-[400px] overflow-hidden rounded-3xl bg-black">
          <DriftingTiles />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <LiquidGlass refract={refract} className="flex w-full max-w-4xl cursor-text flex-col gap-2 rounded-[32px] p-3">
              <textarea
                id="liquid-glass-prompt"
                rows={2}
                placeholder="아이디어를 설명하거나 편집할 이미지를 업로드하세요..."
                className="h-12 w-full resize-none border-0 bg-transparent px-2.5 py-1.5 text-base leading-6 outline-none placeholder:text-white/50"
              />
              <div className="flex items-center gap-1">
                <ChipButton label="이미지 추가">
                  <Plus className="size-4" />
                </ChipButton>
                <ChipButton>Auto</ChipButton>
                <ChipButton>
                  <Zap className="size-4" />
                  Fast
                </ChipButton>
                <button
                  type="button"
                  aria-label="이미지 생성"
                  className="ml-auto inline-flex size-9 items-center justify-center rounded-full bg-white text-black"
                >
                  <Sparkles className="size-4" />
                </button>
              </div>
            </LiquidGlass>
          </div>
        </section>

        <section className="relative h-[360px] overflow-hidden rounded-3xl bg-[url('/images/blueorangesky.png')] bg-cover bg-center">
          <DriftingTiles />
          <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-6 p-4">
            <LiquidGlass
              refract={refract}
              tone="light"
              className="flex w-full max-w-sm flex-col gap-1 rounded-3xl p-5 text-neutral-1000"
            >
              <span className="text-base font-semibold">tone=&quot;light&quot;</span>
              <span className="text-sm text-neutral-700">
                밝은 배경 위 카드. 굴절은 같고 유리 색만 밝습니다.
              </span>
            </LiquidGlass>
            <LiquidGlass refract={refract} tone="light" className="rounded-full p-1.5 text-neutral-1000">
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium"
              >
                작은 pill
                <ArrowUp className="size-4" />
              </button>
            </LiquidGlass>
          </div>
        </section>
      </div>
    </main>
  );
}
