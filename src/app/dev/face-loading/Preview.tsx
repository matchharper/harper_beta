"use client";

import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { cn } from "@/lib/utils";
import {
  FACE_LOADING_VARIANTS,
  FaceLoading,
  type FaceLoadingVariant,
} from "./FaceLoading";

const DRAFTS: Record<FaceLoadingVariant, { name: string; note: string }> = {
  scatter: { name: "흩어졌다 모이기", note: "눈썹·눈·코·입이 사방으로 튀었다가 제자리로 붙어요." },
  faces: { name: "표정 바꾸기", note: "평소 → 놀람 → 윙크 → 웃음을 번갈아 지어요." },
  turn: { name: "고개 휙", note: "살짝 뜸을 들였다가 고개를 한 바퀴 돌려요." },
  "turn-trail": { name: "고개 휙 · 파란 잔상", note: "돌리는 동안에만 파란 잔상이 한 박자 늦게 따라와요." },
  "turn-glint": { name: "고개 휙 · 눈빛", note: "돌아온 눈이 잠깐 파랗게 빛났다가 원래 색으로 식어요." },
  "turn-swoosh": { name: "고개 휙 · 속도선", note: "돌리는 방향으로 파란 선 두 줄이 머리를 감고 지나가요." },
  roll: { name: "굴러가기", note: "좌우로 굴러다니고 구르는 동안 눈을 감아요." },
  jelly: { name: "출렁", note: "납작해졌다 길쭉해지며 젤리처럼 흔들려요." },
  flip: { name: "공중제비", note: "웅크렸다 뛰어올라 한 바퀴 돌고 착지해요." },
  paint: { name: "색칠", note: "부위마다 다른 색으로 그린 뒤 한 번에 원래 색이 돼요." },
  stamp: { name: "도장 쾅쾅", note: "색 도장을 여기저기 찍고 마지막에 원래 얼굴을 찍어요." },
  echo: { name: "색 잔상", note: "빠르게 오갈 때 색 잔상이 따라오고 멈추면 하나로 겹쳐요." },
};

type Backdrop = "plain" | "over";
type SizeKey = "40" | "56" | "72";

function FakeScreen() {
  return (
    <div aria-hidden className="absolute inset-0 flex flex-col gap-3 p-5">
      <div className="h-3 w-1/3 rounded-full bg-neutral-300" />
      <div className="h-3 w-2/3 rounded-full bg-neutral-200" />
      <div className="mt-2 grid flex-1 grid-cols-2 gap-3">
        <div className="rounded-xl bg-neutral-200" />
        <div className="rounded-xl bg-action-100" />
        <div className="rounded-xl bg-accent-100" />
        <div className="rounded-xl bg-neutral-200" />
      </div>
    </div>
  );
}

function Stage({
  backdrop,
  className,
  children,
}: {
  backdrop: Backdrop;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative overflow-hidden bg-bg-basement", className)}>
      {backdrop === "over" ? <FakeScreen /> : null}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center",
          backdrop === "over" && "bg-bg-basement/70 backdrop-blur-[6px]"
        )}
      >
        {children}
      </div>
    </div>
  );
}

export default function Preview() {
  const [backdrop, setBackdrop] = useState<Backdrop>("plain");
  const [sizeKey, setSizeKey] = useState<SizeKey>("56");
  const [fullScreen, setFullScreen] = useState<FaceLoadingVariant | null>(null);
  const size = Number(sizeKey);

  useEffect(() => {
    if (!fullScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullScreen]);

  return (
    <main className="min-h-screen bg-bg-default px-4 py-10 text-neutral-primary md:px-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-xl font-semibold">전체 화면 로딩 시안</h1>
          <div className="flex flex-wrap items-center gap-2">
            <TabBoxes
              activeValue={backdrop}
              aria-label="배경"
              items={[
                { label: "빈 화면", value: "plain" },
                { label: "화면 위", value: "over" },
              ]}
              onValueChange={setBackdrop}
              size="sm"
              variant="neutral"
            />
            <TabBoxes
              activeValue={sizeKey}
              aria-label="크기"
              items={[
                { label: "40", value: "40" },
                { label: "56", value: "56" },
                { label: "72", value: "72" },
              ]}
              onValueChange={setSizeKey}
              size="sm"
              variant="neutral"
            />
          </div>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FACE_LOADING_VARIANTS.map((variant, index) => (
            <li
              className="flex flex-col overflow-hidden rounded-card border border-stroke-subtle bg-bg-floating"
              key={variant}
            >
              <Stage backdrop={backdrop} className="h-56">
                <FaceLoading size={size} variant={variant} />
              </Stage>
              <div className="flex items-start justify-between gap-3 border-t border-stroke-subtle p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {index + 1}. {DRAFTS[variant].name}
                  </span>
                  <span className="text-[13px] text-neutral-muted">
                    {DRAFTS[variant].note}
                  </span>
                </div>
                <MuteButton
                  aria-label={`${DRAFTS[variant].name} 전체 화면`}
                  onClick={() => setFullScreen(variant)}
                  size="sm"
                >
                  <Maximize2 className="size-3.5" />
                </MuteButton>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {fullScreen ? (
        <button
          aria-label="닫기"
          className="fixed inset-0 z-90 block w-full cursor-zoom-out"
          onClick={() => setFullScreen(null)}
          type="button"
        >
          <Stage backdrop={backdrop} className="h-full w-full">
            <FaceLoading size={size} variant={fullScreen} />
          </Stage>
        </button>
      ) : null}
    </main>
  );
}
