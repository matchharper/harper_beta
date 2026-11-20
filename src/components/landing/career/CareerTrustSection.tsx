import {
  Check,
  ChevronDown,
  FileText,
  Mail,
  Pause,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import Reveal from "@/components/landing/Animation/Reveal";
import { cn } from "@/lib/cn";

type SharingMode = "open" | "review" | "paused";
type SentKind = "application" | "email";

export type CareerTrustCopy = {
  title: readonly string[];
  body: string;
  sharing: {
    title: string;
    body: string;
    menuLabel: string;
    options: Record<SharingMode, { label: string; summary: string }>;
  };
  exclude: {
    title: string;
    body: string;
    message: string;
    fieldLabel: string;
    hint: string;
    existing: readonly string[];
    added: string;
  };
  sent: {
    title: string;
    body: string;
    panelLabel: string;
    times: readonly string[];
    items: readonly { kind: SentKind; company: string; detail: string }[];
  };
  free: {
    title: string;
    body: string;
    brand: string;
    lines: readonly string[];
    amount: string;
    totalLabel: string;
  };
};

const EASE = [0.22, 1, 0.36, 1] as const;

const MOCK_SURFACE =
  "bg-bg-floating shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.04),0_12px_28px_-10px_rgb(0_0_0/0.14)]";

/**
 * 카드가 화면에 보이는 동안에만 장면을 순서대로 넘긴다.
 * 동작 줄이기 설정에서는 대표 장면 하나에 머문다.
 */
function useSceneLoop(
  durations: readonly number[],
  active: boolean,
  staticScene: number
) {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    if (!active) return;
    const timeoutId = window.setTimeout(() => {
      setScene((current) => (current + 1) % durations.length);
    }, durations[scene]);

    return () => window.clearTimeout(timeoutId);
  }, [active, durations, scene]);

  return active ? scene : staticScene;
}

const STAGE_WIDTH = 248;
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * 목업은 고정 크기로 그리고 카드 너비에 맞춰 축소·확대한다.
 * 카드가 좁아도 줄바꿈이나 잘림 없이 같은 화면을 보여 준다.
 */
function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const update = () => {
      const next = (node.clientWidth * 0.84) / STAGE_WIDTH;
      setScale(Math.min(1.16, Math.max(0.7, next)));
    };
    update();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return scale;
}

function TrustCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: (active: boolean) => React.ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef, { amount: 0.45 });
  const reduceMotion = useReducedMotion();
  const active = inView && !reduceMotion;
  const scale = useStageScale(stageRef);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={stageRef}
        aria-hidden="true"
        className="relative flex aspect-[1/1.04] select-none items-center justify-center overflow-hidden rounded-2xl bg-neutral-100 ring-1 ring-inset ring-neutral-1000-a05"
      >
        <div
          className="flex shrink-0 justify-center"
          style={{ width: STAGE_WIDTH, transform: `scale(${scale})` }}
        >
          {children(active)}
        </div>
      </div>
      <p className="mt-5 px-1 text-[15px] leading-[1.6] md:text-[16px]">
        <strong className="font-semibold text-neutral-950">{title}</strong>{" "}
        <span className="text-neutral-700">{body}</span>
      </p>
    </div>
  );
}

const SHARING_MODES: readonly SharingMode[] = ["open", "review", "paused"];
const SHARING_ICONS: Record<SharingMode, typeof Send> = {
  open: Send,
  review: ShieldCheck,
  paused: Pause,
};
const SHARING_SCENES = [
  { hover: "review", selected: "review", duration: 2600 },
  { hover: "paused", selected: "review", duration: 900 },
  { hover: "paused", selected: "paused", duration: 2600 },
  { hover: "review", selected: "paused", duration: 900 },
] as const satisfies readonly {
  hover: SharingMode;
  selected: SharingMode;
  duration: number;
}[];
const SHARING_DURATIONS = SHARING_SCENES.map((scene) => scene.duration);
const MENU_PADDING = 6;
const MENU_HEADER_HEIGHT = 28;
const MENU_ROW_HEIGHT = 32;
const MENU_ROW_GAP = 2;

function MouseCursor() {
  return (
    <svg
      width="15"
      height="20"
      viewBox="0 0 15 20"
      fill="none"
      className="drop-shadow-[0_2px_3px_rgb(0_0_0/0.22)]"
    >
      <path
        d="M1.2 1.2v15.1l3.7-3.6 2.5 5.7 2.6-1.1-2.5-5.6h5.2L1.2 1.2Z"
        className="fill-neutral-1000 stroke-white"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SharingModeVisual({
  active,
  copy,
}: {
  active: boolean;
  copy: CareerTrustCopy["sharing"];
}) {
  const sceneIndex = useSceneLoop(SHARING_DURATIONS, active, 0);
  const scene = SHARING_SCENES[sceneIndex];
  const hoverIndex = SHARING_MODES.indexOf(scene.hover);
  const cursorTop =
    MENU_PADDING +
    MENU_HEADER_HEIGHT +
    hoverIndex * (MENU_ROW_HEIGHT + MENU_ROW_GAP) +
    MENU_ROW_HEIGHT / 2 -
    3;

  return (
    <div className="flex w-[248px] flex-col items-start gap-2">
      <div
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-[12.5px] font-medium text-neutral-900",
          MOCK_SURFACE
        )}
      >
        <span className="grid">
          {SHARING_MODES.map((mode) => {
            const Icon = SHARING_ICONS[mode];
            return (
              <motion.span
                key={mode}
                className="col-start-1 row-start-1 flex items-center gap-1.5"
                initial={false}
                animate={{
                  opacity: scene.selected === mode ? 1 : 0,
                  y: scene.selected === mode ? 0 : 3,
                }}
                transition={{ duration: 0.32, ease: EASE }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.9} />
                <span className="whitespace-nowrap">
                  {copy.options[mode].label}
                </span>
              </motion.span>
            );
          })}
        </span>
        <ChevronDown
          className="h-3.5 w-3.5 text-neutral-600"
          strokeWidth={1.9}
        />
      </div>

      <div
        className={cn("relative w-full rounded-xl", MOCK_SURFACE)}
        style={{ padding: MENU_PADDING }}
      >
        <div
          className="flex items-center px-2.5 text-[11.5px] text-neutral-600"
          style={{ height: MENU_HEADER_HEIGHT }}
        >
          {copy.menuLabel}
        </div>
        <div className="flex flex-col" style={{ gap: MENU_ROW_GAP }}>
          {SHARING_MODES.map((mode) => {
            const Icon = SHARING_ICONS[mode];
            const isHovered = scene.hover === mode;
            const isSelected = scene.selected === mode;

            return (
              <div
                key={mode}
                className="relative flex items-center gap-2 px-2.5 text-[13px] text-neutral-900"
                style={{ height: MENU_ROW_HEIGHT }}
              >
                {isHovered ? (
                  <motion.span
                    layoutId={`trust-sharing-hover-${copy.menuLabel}`}
                    className="absolute inset-0 rounded-lg bg-neutral-200"
                    transition={{ type: "spring", stiffness: 420, damping: 38 }}
                  />
                ) : null}
                <Icon
                  className="relative h-3.5 w-3.5 shrink-0 text-neutral-700"
                  strokeWidth={1.9}
                />
                <span className="relative flex-1 truncate">
                  {copy.options[mode].label}
                </span>
                <AnimatePresence initial={false}>
                  {isSelected ? (
                    <motion.span
                      key="check"
                      className="relative"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.24, ease: EASE }}
                    >
                      <Check
                        className="h-3.5 w-3.5 text-neutral-950"
                        strokeWidth={2.2}
                      />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
        <div className="mx-1 mt-1.5 border-t border-neutral-1000-a05 px-1.5 pb-1 pt-2.5">
          <div className="grid text-[11.5px] leading-[1.45] text-neutral-700">
            {SHARING_MODES.map((mode) => (
              <motion.span
                key={mode}
                className="col-start-1 row-start-1"
                initial={false}
                animate={{ opacity: scene.hover === mode ? 1 : 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                {copy.options[mode].summary}
              </motion.span>
            ))}
          </div>
        </div>

        {active ? (
          <motion.div
            className="pointer-events-none absolute right-7 top-0"
            initial={{ opacity: 0, y: cursorTop + 10 }}
            animate={{ opacity: 1, y: cursorTop }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
          >
            <motion.div
              key={scene.selected}
              initial={{ scale: 1 }}
              animate={{ scale: [1, 0.84, 1] }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <MouseCursor />
            </motion.div>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

const EXCLUDE_DURATIONS = [1300, 1000, 3600, 700] as const;

function ExcludeCompanyVisual({
  active,
  copy,
}: {
  active: boolean;
  copy: CareerTrustCopy["exclude"];
}) {
  const scene = useSceneLoop(EXCLUDE_DURATIONS, active, 2);
  const showMessage = scene >= 1 && scene <= 2;
  const showAdded = scene === 2;
  const chips = showAdded ? [copy.added, ...copy.existing] : copy.existing;

  return (
    <motion.div
      className="flex w-[248px] flex-col gap-2.5"
      animate={{ opacity: scene === 3 ? 0 : 1 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <div className="flex h-[52px] items-end justify-end">
        <AnimatePresence>
          {showMessage ? (
            <motion.div
              key="message"
              className="max-w-[210px] rounded-2xl rounded-br-md bg-neutral-950 px-3.5 py-2 text-[12.5px] leading-[1.45] text-on-inverse"
              style={{ transformOrigin: "100% 100%" }}
              initial={{ opacity: 0, scale: 0.9, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.42, ease: EASE }}
            >
              {copy.message}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className={cn("rounded-xl px-3.5 pb-3.5 pt-3", MOCK_SURFACE)}>
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-800">
          <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.9} />
          {copy.fieldLabel}
        </div>
        <div className="mt-3 flex min-h-7 flex-wrap content-start gap-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {chips.map((company) => {
              const isAdded = company === copy.added;
              return (
                <motion.span
                  key={company}
                  layout
                  className="relative inline-flex h-7 items-center gap-1 overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-floating pl-2.5 pr-1.5 text-[12.5px] text-neutral-900 shadow-(--shadow-xs)"
                  initial={{ opacity: 0, scale: 0.86 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  {isAdded && active ? (
                    <motion.span
                      className="absolute inset-0 bg-action/12"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: 1.6,
                        delay: 0.35,
                        ease: "easeOut",
                      }}
                    />
                  ) : null}
                  <span className="relative">{company}</span>
                  <X
                    className="relative h-3 w-3 text-neutral-500"
                    strokeWidth={2}
                  />
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>
        <p className="mt-3 text-[11px] leading-[1.45] text-neutral-600">
          {copy.hint}
        </p>
      </div>
    </motion.div>
  );
}

const SENT_DURATIONS = [3200] as const;
const SENT_VISIBLE_ROWS = 4;
const SENT_ICONS: Record<SentKind, typeof Mail> = {
  application: FileText,
  email: Mail,
};

function SentLogVisual({
  active,
  copy,
}: {
  active: boolean;
  copy: CareerTrustCopy["sent"];
}) {
  const [head, setHead] = useState(0);
  const count = copy.items.length;

  useEffect(() => {
    if (!active) return;
    const intervalId = window.setInterval(() => {
      setHead((current) => (current + 1) % count);
    }, SENT_DURATIONS[0]);

    return () => window.clearInterval(intervalId);
  }, [active, count]);

  const rows = Array.from({ length: SENT_VISIBLE_ROWS }, (_, position) => {
    const index = (head - position + count * 2) % count;
    return { index, item: copy.items[index] };
  });

  return (
    <div className={cn("w-[248px] overflow-hidden rounded-xl", MOCK_SURFACE)}>
      <div className="flex h-9 items-center border-b border-neutral-1000-a05 px-3.5 text-[12px] font-medium text-neutral-800">
        {copy.panelLabel}
      </div>
      <ul
        className="relative h-[184px] overflow-hidden px-1.5 py-1"
        style={{
          maskImage: "linear-gradient(to bottom, #000 72%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 72%, transparent)",
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map(({ index, item }, position) => {
            const Icon = SENT_ICONS[item.kind];
            return (
              <motion.li
                key={index}
                layout
                className="relative flex h-11 items-center gap-2.5 rounded-lg px-2"
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
              >
                {position === 0 && active ? (
                  <motion.span
                    key={`highlight-${head}`}
                    className="absolute inset-0 rounded-lg bg-neutral-100"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.8, delay: 0.5, ease: "easeOut" }}
                  />
                ) : null}
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-700 ring-1 ring-inset ring-neutral-1000-a05">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium leading-tight text-neutral-900">
                    {item.company}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] leading-tight text-neutral-600">
                    {item.detail}
                  </span>
                </span>
                <span className="relative shrink-0 text-[10.5px] tabular-nums text-neutral-600">
                  {copy.times[position]}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

const RECEIPT_EDGE_MASK =
  "linear-gradient(#000 0 0) top / 100% calc(100% - 5px) no-repeat, conic-gradient(from -45deg at 50% 100%, #000 90deg, #0000 0) bottom / 10px 5px repeat-x";
const RECEIPT_BARCODE = [
  2, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 3, 1, 2, 2, 1, 1, 3, 1, 1, 2, 1, 2,
  3, 1, 1, 2, 1, 1, 3, 2, 1, 2, 1, 1, 2, 1,
] as const;

export function FreeReceiptVisual({ copy }: { copy: CareerTrustCopy["free"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const printed = useInView(ref, { once: true, amount: 0.5 });
  const reduceMotion = useReducedMotion();
  const visible = printed || reduceMotion;

  return (
    <div ref={ref} className="relative flex w-[248px] flex-col items-center">
      <div className="relative z-10 h-3 w-full rounded-full bg-neutral-300 shadow-[inset_0_1px_2px_rgb(0_0_0/0.14),0_1px_0_rgb(255_255_255/0.9)]" />
      <div className="-mt-1.5 w-full overflow-hidden px-4 pb-6">
        <motion.div
          className="mx-auto w-[214px] drop-shadow-[0_10px_14px_rgb(0_0_0/0.07)]"
          initial={reduceMotion ? false : { y: "-102%" }}
          animate={visible ? { y: "0%" } : { y: "-102%" }}
          transition={{ duration: 1.9, delay: 0.2, ease: [0.33, 1, 0.68, 1] }}
        >
          <div
            className="bg-bg-floating px-4 pb-5 pt-4"
            style={{ mask: RECEIPT_EDGE_MASK, WebkitMask: RECEIPT_EDGE_MASK }}
          >
            <div className="text-center text-[12.5px] font-semibold tracking-[0.02em] text-neutral-950">
              {copy.brand}
            </div>
            <div className="my-2.5 border-t border-dashed border-neutral-400" />
            <div className="space-y-1.5">
              {copy.lines.map((line) => (
                <div
                  key={line}
                  className="flex items-center justify-between gap-3 text-[11.5px] text-neutral-700"
                >
                  <span className="truncate">{line}</span>
                  <span className="tabular-nums">{copy.amount}</span>
                </div>
              ))}
            </div>
            <div className="my-2.5 border-t border-dashed border-neutral-400" />
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12px] font-medium text-neutral-900">
                {copy.totalLabel}
              </span>
              <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-neutral-950 tabular-nums">
                {copy.amount}
              </span>
            </div>
            <div className="mt-3.5 flex h-4 items-stretch justify-center gap-[1.5px] opacity-80">
              {RECEIPT_BARCODE.map((width, index) => (
                <span
                  key={index}
                  className="bg-neutral-900"
                  style={{ width }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function CareerTrustSection({
  copy,
  className,
}: {
  copy: CareerTrustCopy;
  className?: string;
}) {
  return (
    <section
      id="trust"
      className={cn("px-4 py-20 md:px-10 md:py-32", className)}
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <Reveal once blur={0} distance={20}>
          <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
            <h2 className="text-[30px] font-semibold leading-[1.22] tracking-[-0.01em] text-neutral-950 sm:text-[36px] md:text-[42px]">
              {copy.title.map((line, index) => (
                <span key={line} className="block">
                  {line}
                  {index < copy.title.length - 1 ? " " : null}
                </span>
              ))}
            </h2>
            <p className="mt-4 text-[15px] leading-[1.5] text-neutral-700 md:mt-6 md:text-[18px]">
              {copy.body}
            </p>
          </div>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 md:mt-20 lg:grid-cols-4">
          <Reveal once blur={0} distance={20} delay={0}>
            <TrustCard title={copy.sharing.title} body={copy.sharing.body}>
              {(active) => (
                <SharingModeVisual active={active} copy={copy.sharing} />
              )}
            </TrustCard>
          </Reveal>
          <Reveal once blur={0} distance={20} delay={0.07}>
            <TrustCard title={copy.exclude.title} body={copy.exclude.body}>
              {(active) => (
                <ExcludeCompanyVisual active={active} copy={copy.exclude} />
              )}
            </TrustCard>
          </Reveal>
          <Reveal once blur={0} distance={20} delay={0.14}>
            <TrustCard title={copy.sent.title} body={copy.sent.body}>
              {(active) => <SentLogVisual active={active} copy={copy.sent} />}
            </TrustCard>
          </Reveal>
          <Reveal once blur={0} distance={20} delay={0.21}>
            <TrustCard title={copy.free.title} body={copy.free.body}>
              {() => <FreeReceiptVisual copy={copy.free} />}
            </TrustCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
