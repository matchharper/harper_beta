/**
 * 새 후보자 랜딩(`/temporal_index`)에서 여러 번 쓰는 외관을 Tailwind 클래스로 모은다.
 * 색과 표면은 Career Floating Sky(`career-floating-sky.css`) 토큰을 그대로 참조한다.
 * 페이지 루트에 `.career-landing-preview`를 함께 달아 glass·sky·radius 토큰을 받는다.
 *
 * 기준
 * - 색: 바탕 #F5F6F8→#E9ECF0의 하늘색 회색, 글자 #1D1D1F / #6E6E73 / #AEAEB2, 강조는 잉크 검정 하나.
 * - 표면: Career glass(white 52%→34%, blur 40px, 5중 그림자). 카드 모서리 18px, 큰 타일 28px.
 * - 글꼴: Career 시스템 글꼴. 제목은 600, 자간 -0.03em. 숫자는 300.
 * - 움직임: cubic-bezier(.22,1,.36,1) 하나. 동작 줄이기 설정에서는 반복 애니메이션을 멈춘다.
 *
 * 반복 애니메이션의 `@keyframes`(tl-live-breath·tl-working-dot·tl-shimmer·tl-caret)만
 * 클래스로 선언할 수 없어 `pages/temporal_index.tsx`의 전역 스타일에 둔다.
 * 호출부에서 `cn(tw.x, "...")`로 덮어쓰면 tailwind-merge가 같은 속성의 앞 클래스를 지운다.
 */

const EASE = "ease-[cubic-bezier(0.22,1,0.36,1)]";
const GLASS_FILTER =
  "backdrop-blur-(--career-glass-blur) backdrop-saturate-(--career-glass-saturation)";
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--career-focus)";

export const tw = {
  /* ---------- Page ---------- */
  page: [
    "relative min-h-screen overflow-x-clip break-keep antialiased [text-rendering:optimizeLegibility]",
    "bg-(--tl-base) font-(family-name:--career-font-family) text-(--tl-ink)",
    "[--tl-ink:var(--career-ink,#1d1d1f)] [--tl-ink-2:var(--career-ink-secondary,#6e6e73)]",
    "[--tl-ink-3:var(--career-ink-soft,#aeaeb2)] [--tl-hair:rgb(0_0_0/0.07)] [--tl-base:#f3f5f7]",
  ].join(" "),
  shell: "mx-auto w-full max-w-[1160px] px-5 md:px-10",

  /* ---------- Type ---------- */
  display:
    "text-[clamp(34px,5.4vw,64px)] font-semibold leading-[1.12] tracking-[-0.035em] text-[#1d1d1f] [&_em]:not-italic [&_em]:text-[#8a8a90]",
  h2: "text-[clamp(28px,3.5vw,44px)] font-semibold leading-[1.2] tracking-[-0.03em] text-[#1d1d1f] [&_em]:not-italic [&_em]:text-[#8a8a90]",
  lede: "text-[15.5px] leading-[1.7] tracking-[-0.005em] text-[#6e6e73] md:text-[17px]",
  statement:
    "text-[clamp(20px,2.1vw,27px)] font-medium leading-normal tracking-[-0.025em]",
  statValue:
    "text-[clamp(34px,4.2vw,52px)] font-light leading-[1.05] tracking-[-0.04em] tabular-nums text-[#1d1d1f]",
  statUnit: "ml-0.5 text-[0.5em] font-normal tracking-normal text-[#6e6e73]",

  /* ---------- Surfaces ---------- */
  sky: "bg-(image:--career-sky-background)",
  tile: [
    "relative isolate overflow-hidden rounded-[12px] md:rounded-[12px]",
  ].join(" "),
  glass: `rounded-(--career-radius-card) bg-(image:--career-glass-image) shadow-(--career-glass-shadow) ${GLASS_FILTER}`,
  glassStrong: `rounded-(--career-radius-card) bg-[linear-gradient(180deg,rgb(255_255_255/0.82),rgb(255_255_255/0.66))] shadow-(--career-glass-shadow) ${GLASS_FILTER}`,

  /* ---------- Pills & buttons ---------- */
  pill: [
    "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] leading-none text-[#1d1d1f]",
    "bg-[linear-gradient(180deg,rgb(255_255_255/0.62),rgb(255_255_255/0.4))]",
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_0_0_0.5px_rgb(0_0_0/0.08),0_6px_14px_-10px_rgb(30_25_20/0.35)]",
  ].join(" "),
  pillDark:
    "bg-[#1d1d1f] bg-none text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_8px_18px_-10px_rgb(20_20_30/0.6)]",
  pillGhost: "bg-transparent bg-none text-[#6e6e73] shadow-none",
  cta: [
    "group relative inline-flex h-[54px] items-center justify-center gap-2.5 rounded-full bg-[#1d1d1f] px-7",
    "text-base font-medium tracking-[-0.01em] text-white",
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.2),0_18px_36px_-18px_rgb(20_22_30/0.7)]",
    `transition-[transform,box-shadow,background-color] duration-180 ${EASE}`,
    "hover:bg-[#2c2c30] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(0_0_0/0.2),0_22px_40px_-18px_rgb(20_22_30/0.75)]",
    "active:translate-y-px active:scale-[0.99]",
    FOCUS,
  ].join(" "),
  ctaArrow: `transition-transform duration-220 ${EASE} group-hover:translate-x-[3px]`,
  focusRing: FOCUS,

  /* ---------- Live status ---------- */
  ticker: [
    "relative inline-flex h-9 items-center gap-2 rounded-full pl-1 pr-[18px] text-[13.5px] tracking-[-0.01em] text-[#4a4a50]",
    "backdrop-blur-[24px] backdrop-saturate-[1.6]",
  ].join(" "),
  liveDot:
    "size-1.5 flex-none rounded-full bg-[#34a06b] shadow-[0_0_0_3px_rgb(52_160_107/0.12)] animate-[tl-live-breath_2.8s_ease-in-out_infinite] motion-reduce:animate-none",
  workingDot:
    "size-1 rounded-full bg-current animate-[tl-working-dot_1s_ease-in-out_infinite] motion-reduce:animate-none",
  shimmerText:
    "bg-[linear-gradient(90deg,#aeaeb2_0%,#aeaeb2_40%,#1d1d1f_50%,#aeaeb2_60%,#aeaeb2_100%)] bg-size-[200%_100%] bg-clip-text text-transparent animate-[tl-shimmer_1.6s_linear_infinite] motion-reduce:animate-none",
  statusLine:
    "inline-flex items-center gap-1.5 text-[13px] leading-[22px] text-[#aeaeb2]",
  caret:
    "ml-px inline-block h-[1.05em] w-[1.5px] align-[-0.15em] bg-[#1d1d1f] animate-[tl-caret_1s_steps(1)_infinite] motion-reduce:animate-none",

  /* ---------- Rich answer content ---------- */
  answer: [
    "[&>*+*]:mt-3 [&_strong]:font-semibold",
    "[&_h4]:text-[14.5px] [&_h4]:font-semibold [&_h4]:leading-[1.6] [&_h4]:tracking-[-0.01em]",
    "[&_ul]:list-disc [&_ul]:pl-[18px] [&_li+li]:mt-1 [&_li]:marker:text-[#aeaeb2]",
  ].join(" "),
  sourceChip:
    "ml-0.5 inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-[#1d1d1f]/5 px-2 align-[1px] text-[11.5px] font-medium leading-none text-[#6e6e73]",

  /* ---------- Fields ---------- */
  fieldLabel: "text-[12.5px] leading-[1.4] text-[#6e6e73]",
  field: [
    "mt-1.5 min-h-9 rounded-xl px-3 py-2 text-[13.5px] leading-5 text-[#1d1d1f]",
    "bg-[linear-gradient(180deg,rgb(255_255_255/0.6),rgb(255_255_255/0.42))]",
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_0_0_0.5px_rgb(0_0_0/0.07)]",
  ].join(" "),

  /* ---------- Nav ---------- */
  navBar: [
    `fixed inset-x-0 top-0 z-60 transition-[background-color,box-shadow,backdrop-filter] duration-240 ${EASE}`,
    "data-[scrolled=true]:bg-[rgb(245_246_248/0.72)] data-[scrolled=true]:shadow-[0_0.5px_0_rgb(0_0_0/0.08)]",
    "data-[scrolled=true]:backdrop-blur-[24px] data-[scrolled=true]:backdrop-saturate-[1.6]",
  ].join(" "),
  navLink: [
    `inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-[#1d1d1f]/62 transition-colors duration-180 ${EASE}`,
    "hover:bg-[#1d1d1f]/[0.045] hover:text-[#1d1d1f]",
    "data-[open=true]:bg-[#1d1d1f]/[0.045] data-[open=true]:text-[#1d1d1f]",
  ].join(" "),
  // 상단 바가 스크롤 뒤 자체 blur를 갖기 때문에 그 안의 메뉴는 뒤를 흐리게 할 수 없다. 불투명한 흰 바탕을 쓴다.
  navMenu: [
    "absolute left-1/2 top-[calc(100%+8px)] min-w-[184px] rounded-[14px] bg-white p-1.5",
    "shadow-[0_0_0_0.5px_rgb(0_0_0/0.1),0_12px_32px_-12px_rgb(20_30_45/0.3),0_2px_4px_rgb(20_30_45/0.04)]",
  ].join(" "),
  navMenuItem: `flex items-center gap-1 whitespace-nowrap rounded-[9px] px-3 py-2 text-[14px] text-[#1d1d1f] transition-colors duration-160 ${EASE} hover:bg-[#1d1d1f]/[0.05] focus-visible:bg-[#1d1d1f]/[0.05] focus-visible:outline-none`,
} as const;

/** 위 클래스가 참조하는 반복 애니메이션. 페이지 전역 스타일에 한 번 넣는다. */
export const TEMPORAL_KEYFRAMES = `
@keyframes tl-live-breath {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 3px rgb(52 160 107 / 0.12); }
  50% { opacity: 0.55; box-shadow: 0 0 0 2px rgb(52 160 107 / 0.06); }
}
@keyframes tl-working-dot {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-1.5px); }
}
@keyframes tl-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
@keyframes tl-caret {
  50% { opacity: 0; }
}
`;
