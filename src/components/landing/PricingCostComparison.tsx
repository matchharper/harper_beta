import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";

// 비교 계산 설정 — 금액은 원, 수수료는 소수로 입력합니다 (0.25 = 25%).
const MONTHS = 6; // 비교 기간 (개월)
const HARPER_MONTHLY_KRW = 260_000; // Harper 월 이용료
const AD_MONTHLY_KRW = 840_000; // 공고 광고 월 예산 (기존 일 28,000원 × 30일 환산)
const HEADHUNTER_RATE = 0.2; // 헤드헌터 기본 수수료율
const HIRING_SERVICE_RATE = 0.07; // 플랫폼 채용 수수료율
const HEADHUNTER_RATE_OPTIONS = [0.15, 0.2, 0.25, 0.3];
const INITIAL_SALARY = 80_000_000; // 처음 표시할 연봉: 8,000만원
const MIN_SALARY = 30_000_000; // 슬라이더 최솟값
const MAX_SALARY = 300_000_000; // 슬라이더 최댓값
const SALARY_STEP = 500_000; // 슬라이더 조절 단위: 50만원
const INITIAL_HIRE_COUNT = 1; // 처음 표시할 채용 인원
const HIRE_COUNT_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 30]; // 선택 가능한 채용 인원

// Native range input: iOS-style visuals, with keyboard and touch behavior
// owned by the browser. Keep these literal utilities discoverable by Tailwind.
const salarySliderClassName = [
  "m-0 block h-12 w-full cursor-grab touch-pan-y appearance-none rounded-full border-0 bg-transparent p-0 [outline:none] [-webkit-tap-highlight-color:transparent]",
  "[--thumb-scale:1] [--thumb-opacity:1] hover:[--thumb-scale:1.03] active:[--thumb-scale:1.08] active:[--thumb-opacity:0.9] active:[--thumb-border:1px_solid_var(--color-white)] active:cursor-grabbing",
  "[--thumb-shadow:0_0_0_0.5px_color-mix(in_srgb,var(--color-white)_24%,transparent),0_2px_4px_color-mix(in_srgb,var(--color-black)_24%,transparent),0_6px_14px_color-mix(in_srgb,var(--color-black)_30%,transparent)]",
  "active:[--thumb-shadow:0_0_0_0.5px_color-mix(in_srgb,var(--color-white)_35%,transparent),0_3px_6px_color-mix(in_srgb,var(--color-black)_24%,transparent),0_8px_20px_color-mix(in_srgb,var(--color-black)_40%,transparent)]",
  "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--slider-fill)_var(--slider-progress),var(--slider-track)_var(--slider-progress))] [&::-webkit-slider-runnable-track]:shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--color-black)_16%,transparent)]",
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[var(--slider-track)] [&::-moz-range-track]:shadow-[inset_0_1px_2px_color-mix(in_srgb,var(--color-black)_16%,transparent)] [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[var(--slider-fill)]",
  "[&::-webkit-slider-thumb]:-mt-2 [&::-webkit-slider-thumb]:box-border [&::-webkit-slider-thumb]:h-[22px] [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[0.5px] [&::-webkit-slider-thumb]:border-white/50",
  "[&::-webkit-slider-thumb]:bg-[linear-gradient(180deg,var(--color-white),color-mix(in_srgb,var(--color-white)_94%,var(--color-black)))] [&::-webkit-slider-thumb]:[box-shadow:var(--thumb-shadow)] [&::-webkit-slider-thumb]:[transform:scale(var(--thumb-scale))] [&::-webkit-slider-thumb]:[opacity:var(--thumb-opacity)] [&::-webkit-slider-thumb]:[transition:transform_220ms_cubic-bezier(0.2,0.8,0.2,1),box-shadow_220ms_ease,opacity_180ms_ease,filter_180ms_ease]",
  "[&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:h-[22px] [&::-moz-range-thumb]:w-10 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[0.5px] [&::-moz-range-thumb]:border-white/50",
  "[&::-moz-range-thumb]:bg-[linear-gradient(180deg,var(--color-white),color-mix(in_srgb,var(--color-white)_94%,var(--color-black)))] [&::-moz-range-thumb]:[box-shadow:var(--thumb-shadow)] [&::-moz-range-thumb]:[transform:scale(var(--thumb-scale))] [&::-moz-range-thumb]:[opacity:var(--thumb-opacity)] [&::-moz-range-thumb]:[transition:transform_220ms_cubic-bezier(0.2,0.8,0.2,1),box-shadow_220ms_ease,opacity_180ms_ease,filter_180ms_ease]",
  "focus-visible:[&::-webkit-slider-thumb]:outline-2 focus-visible:[&::-webkit-slider-thumb]:outline-solid focus-visible:[&::-webkit-slider-thumb]:outline-[var(--slider-focus)] focus-visible:[&::-webkit-slider-thumb]:outline-offset-[5px]",
  "focus-visible:[&::-moz-range-thumb]:outline-2 focus-visible:[&::-moz-range-thumb]:outline-solid focus-visible:[&::-moz-range-thumb]:outline-[var(--slider-focus)] focus-visible:[&::-moz-range-thumb]:outline-offset-[5px]",
  "motion-reduce:[&::-webkit-slider-thumb]:transition-none motion-reduce:[&::-moz-range-thumb]:transition-none",
].join(" ");

const integer = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
const chartDecimal = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 3,
});
const compactKrw = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "KRW",
  notation: "compact",
  maximumFractionDigits: 1,
});

// 1억원 이상은 소수점 한 자리까지만 표시하고 그 아래 금액은 버립니다.
// 표시만 줄이고 비교 계산과 그래프 높이에는 원래 금액을 사용합니다.
function formatComparisonKrw(amount: number) {
  if (amount >= 100_000_000) {
    return `${decimal.format(Math.floor(amount / 10_000_000) / 10)}억원`;
  }
  return `${decimal.format(amount / 10_000)}만원`;
}

// 그래프 금액은 10만원 단위로 반올림합니다. 억원은 같은 정밀도의 소수점 세 자리까지.
function formatChartKrw(amount: number) {
  const rounded = Math.round(amount / 100_000) * 100_000;
  return rounded >= 100_000_000
    ? `${chartDecimal.format(rounded / 100_000_000)}억원`
    : `${integer.format(rounded / 10_000)}만원`;
}

function getComparisonCosts(
  salary: number,
  hireCount: number,
  headhunterRate: number,
  serviceRate: number
) {
  return [
    { id: "headhunter", cost: salary * headhunterRate * hireCount },
    { id: "advertising", cost: AD_MONTHLY_KRW * MONTHS * hireCount },
    { id: "service", cost: salary * serviceRate * hireCount },
    { id: "harper", cost: HARPER_MONTHLY_KRW * MONTHS * hireCount },
  ] as const;
}

function getCostOrder(
  salary: number,
  headhunterRate: number,
  serviceRate: number
) {
  // Every channel scales by the same headcount; rank depends on salary and rates.
  return [...getComparisonCosts(salary, 1, headhunterRate, serviceRate)]
    .sort((a, b) => b.cost - a.cost)
    .map(({ id }) => id);
}

function useComparisonValue(value: number) {
  const reducedMotion = useReducedMotion();
  const animated = useMotionValue(value);
  useEffect(() => {
    if (reducedMotion) {
      animated.jump(value);
      return;
    }
    const playback = animate(animated, value, {
      duration: 0.5,
      ease: [0.22, 1, 0.36, 1],
    });
    return () => playback.stop();
  }, [value, reducedMotion, animated]);
  return animated;
}

// Update only the text node during animation, without rendering the whole
// calculator on every frame. The accessible values below use settled targets.
function AnimatedNumber({
  value,
  decimals = false,
  className,
  formatValue,
}: {
  value: MotionValue<number>;
  decimals?: boolean;
  className?: string;
  formatValue?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = formatValue ?? (decimals ? decimal : integer).format;
  useMotionValueEvent(value, "change", (latest) => {
    if (ref.current) ref.current.textContent = format(latest);
  });
  return (
    <span ref={ref} className={className}>
      {format(value.get())}
    </span>
  );
}

function CostBar({
  id,
  locale,
  label,
  caption,
  value,
  maximum,
  highlight = false,
  isLight,
}: {
  id: string;
  locale: "ko" | "en";
  label: string;
  caption: string;
  value: MotionValue<number>;
  maximum: MotionValue<number>;
  highlight?: boolean;
  isLight: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const height = useTransform(
    [value, maximum],
    ([cost, max]: number[]) => `${(cost / max) * 100}%`
  );
  return (
    <motion.div
      layout={reducedMotion ? false : "position"}
      transition={{ layout: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }}
      className="group/bar relative h-full min-w-0"
      data-cost-bar={id}
      data-highlight={highlight || undefined}
    >
      <div className="flex h-full items-end justify-center">
        {/* 막대 색상: highlight는 Harper, 나머지는 비교 서비스 */}
        <motion.div
          className={cn(
            "relative w-full max-w-[67px] border border-b-0 transition-colors duration-200 motion-reduce:transition-none",
            highlight
              ? isLight
                ? "border-orange-700 bg-orange-600"
                : "border-orange-600 bg-orange-600/80"
              : isLight
                ? "border-neutral-1000/20 bg-neutral-1000/12"
                : "border-white/29 bg-white/16"
          )}
          style={{ height }}
        >
          <span
            className={cn(
              "absolute bottom-[calc(100%+11px)] left-1/2 -translate-x-1/2 text-[10px] leading-none tracking-[-0.03em] whitespace-nowrap tabular-nums md:text-[12px]",
              isLight
                ? "text-neutral-primary group-data-[highlight]/bar:text-orange-700"
                : "text-white/85 group-data-[highlight]/bar:text-orange-600"
            )}
          >
            <AnimatedNumber
              value={value}
              formatValue={locale === "ko" ? formatChartKrw : compactKrw.format}
            />
          </span>
        </motion.div>
      </div>
      <div className="absolute font-normal -right-1 -left-1 top-[calc(100%+18px)] flex flex-col items-center gap-1.5 text-center text-[11px] leading-[1.5] break-keep md:text-[12px]">
        <span
          className={cn(
            "max-w-[100px]",
            isLight
              ? "group-data-[highlight]/bar:text-orange-700"
              : "group-data-[highlight]/bar:text-orange-600"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-[10px] md:text-[11px]",
            isLight ? "text-neutral-muted" : "text-white/60"
          )}
        >
          {caption}
        </span>
      </div>
    </motion.div>
  );
}

function AxisLabel({
  maximum,
  fraction,
  locale,
  isLight,
}: {
  maximum: MotionValue<number>;
  fraction: number;
  locale: "ko" | "en";
  isLight: boolean;
}) {
  const value = useTransform(maximum, (max) =>
    locale === "ko" ? (max * fraction) / 10_000 : max * fraction
  );
  return (
    <span
      className={cn(
        "absolute -top-1.5 right-[calc(100%+10px)] font-mono text-[9px] leading-none tabular-nums",
        isLight ? "text-neutral-muted" : "text-white/56"
      )}
    >
      <AnimatedNumber
        value={value}
        formatValue={
          locale === "en"
            ? compactKrw.format
            : (amount) => integer.format(Math.round(amount / 10) * 10)
        }
      />
    </span>
  );
}

export function PricingCostComparison({ locale }: { locale: "ko" | "en" }) {
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);
  const formatKrw = (amount: number) =>
    c(`${decimal.format(amount / 10_000)}만원`, `₩${integer.format(amount)}`);
  const id = useId();
  const isLight = true;
  const [salary, setSalary] = useState(INITIAL_SALARY);
  const [hireCount, setHireCount] = useState(INITIAL_HIRE_COUNT);
  const [headhunterRate, setHeadhunterRate] = useState(HEADHUNTER_RATE);
  const serviceRate = HIRING_SERVICE_RATE;
  const headhunterRateOptions = HEADHUNTER_RATE_OPTIONS.map((rate) => ({
    value: rate,
    label: `${decimal.format(rate * 100)}%`,
  }));
  const hireCountOptions = HIRE_COUNT_OPTIONS.map((count) => ({
    value: count,
    label: c(`${count}명`, `${count} ${count === 1 ? "hire" : "hires"}`),
  }));
  const costs = getComparisonCosts(
    salary,
    hireCount,
    headhunterRate,
    serviceRate
  );
  const [barOrder, setBarOrder] = useState(() =>
    getCostOrder(INITIAL_SALARY, HEADHUNTER_RATE, HIRING_SERVICE_RATE)
  );
  const barOrderRef = useRef(barOrder);
  const animatedSalary = useComparisonValue(salary);
  const animatedHireCount = useComparisonValue(hireCount);
  const animatedHeadhunterRate = useComparisonValue(headhunterRate);
  const animatedServiceRate = useComparisonValue(serviceRate);
  const animatedOrder = useTransform(
    [animatedSalary, animatedHeadhunterRate, animatedServiceRate],
    ([salaryValue, headhunterValue, serviceValue]: number[]) =>
      getCostOrder(salaryValue, headhunterValue, serviceValue)
  );
  // Reorder when the displayed numbers cross. React updates only when rank
  // changes; Motion keeps the bar, number and label together during the swap.
  useMotionValueEvent(animatedOrder, "change", (next) => {
    if (next.some((costId, index) => costId !== barOrderRef.current[index])) {
      barOrderRef.current = next;
      setBarOrder(next);
    }
  });
  const totalSalary = useTransform(
    [animatedSalary, animatedHireCount],
    ([salaryValue, count]: number[]) => salaryValue * count
  );
  const headhunter = useTransform(
    [totalSalary, animatedHeadhunterRate],
    ([value, rate]: number[]) => value * rate
  );
  const service = useTransform(
    [totalSalary, animatedServiceRate],
    ([value, rate]: number[]) => value * rate
  );
  const advertising = useTransform(
    animatedHireCount,
    (count) => AD_MONTHLY_KRW * MONTHS * count
  );
  const harper = useTransform(
    animatedHireCount,
    (count) => HARPER_MONTHLY_KRW * MONTHS * count
  );
  const maximum = useComparisonValue(
    Math.ceil(Math.max(...costs.map(({ cost }) => cost)) / 10_000_000) *
      10_000_000
  );
  const progress = ((salary - MIN_SALARY) / (MAX_SALARY - MIN_SALARY)) * 100;
  const headhunterRateLabel = `${decimal.format(headhunterRate * 100)}%`;
  const serviceRateLabel = `${decimal.format(serviceRate * 100)}%`;
  const bars = {
    headhunter: {
      label: c("헤드헌터 수수료", "Headhunter fee"),
      caption: c(`연봉의 ${headhunterRateLabel}`, `${headhunterRateLabel} fee`),
      value: headhunter,
    },
    advertising: {
      label: c("잡플랫폼 채용 광고비", "Job platform advertising"),
      caption: c("월 광고 예산", "Monthly budget"),
      value: advertising,
    },
    service: {
      label: c("플랫폼 채용 수수료", "Platform hiring fee"),
      caption: c(`연봉의 ${serviceRateLabel}`, `${serviceRateLabel} fee`),
      value: service,
    },
    harper: {
      label: c("Harper 구독", "Harper subscription"),
      caption: c("성공보수 없음", "No success fee"),
      value: harper,
    },
  };

  return (
    <>
      <section
        id="pricing-comparison"
        aria-labelledby={`${id}-title`}
        data-theme="light"
        className={cn(
          "mt-16 md:mt-[100px] scroll-mt-[128px] border-y font-normal transition-colors duration-200 motion-reduce:transition-none",
          isLight
            ? "border-neutral-1000-a10 bg-bg-basement text-neutral-primary"
            : "border-white/8 bg-[color-mix(in_srgb,var(--color-black)_97%,var(--color-white))] text-white"
        )}
      >
        {/* 배경은 화면 전체 너비, 내용은 중앙 최대 1160px */}
        <PageContainer padding="none" className="max-w-[1160px] px-4">
          <div
            className={cn(
              "border-x",
              isLight ? "border-neutral-1000-a10" : "border-white/8"
            )}
          >
            <header
              className={cn(
                "border-b p-4 pb-8 md:flex md:items-end md:justify-between md:gap-8 md:p-6 md:pb-20",
                isLight ? "border-neutral-1000-a10" : "border-white/8"
              )}
            >
              <div>
                <h2
                  id={`${id}-title`}
                  className="md:text-2xl text-xl leading-[1.48] font-normal tracking-[-0.045em] break-keep"
                >
                  {c(
                    "예상 비용을 계산해보세요.",
                    "The cost of your next hire."
                  )}
                  {/* <br />
                {c("얼마나 달라질까요?", "See the difference.")} */}
                </h2>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-[0.88fr_1.3fr]">
              <div
                className={cn(
                  "min-w-0 border-b px-6 pt-7 pb-[18px] md:border-r md:border-b-0 md:px-8 md:py-8",
                  isLight ? "border-neutral-1000-a10" : "border-white/8"
                )}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-3 text-[18px] leading-[1.4] tracking-[-0.025em] md:text-[20px]">
                    <label
                      htmlFor={`${id}-salary`}
                      className={cn(
                        "shrink-0",
                        isLight ? "text-neutral-primary" : "text-white/80"
                      )}
                    >
                      {c("채용 연봉", "Annual salary")}
                    </label>
                    <div
                      className="flex items-baseline justify-end gap-1.5 whitespace-nowrap tabular-nums"
                      aria-hidden="true"
                    >
                      {locale === "ko" ? (
                        <span>{formatComparisonKrw(salary)}</span>
                      ) : (
                        <>
                          <span>{integer.format(salary / 10_000)}</span>
                          <span
                            className={
                              isLight ? "text-neutral-muted" : "text-white/64"
                            }
                          >
                            × ₩10,000
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <input
                      id={`${id}-salary`}
                      className={cn(
                        salarySliderClassName,
                        isLight
                          ? "[--slider-fill:var(--color-neutral-900)] [--slider-track:var(--color-neutral-1000-a10)] [--slider-focus:var(--color-orange-700)] [--thumb-shadow:0_0_0_0.5px_color-mix(in_srgb,var(--color-black)_10%,transparent),0_2px_4px_color-mix(in_srgb,var(--color-black)_10%,transparent),0_4px_10px_color-mix(in_srgb,var(--color-black)_12%,transparent)] active:[--thumb-shadow:0_0_0_0.5px_color-mix(in_srgb,var(--color-black)_10%,transparent),0_3px_6px_color-mix(in_srgb,var(--color-black)_12%,transparent),0_6px_16px_color-mix(in_srgb,var(--color-black)_16%,transparent)]"
                          : "[--slider-fill:color-mix(in_srgb,var(--color-white)_92%,transparent)] [--slider-track:color-mix(in_srgb,var(--color-white)_19%,transparent)] [--slider-focus:color-mix(in_srgb,var(--color-white)_65%,transparent)]"
                      )}
                      style={
                        { "--slider-progress": `${progress}%` } as CSSProperties
                      }
                      type="range"
                      min={MIN_SALARY}
                      max={MAX_SALARY}
                      step={SALARY_STEP}
                      value={salary}
                      aria-valuetext={c(
                        formatComparisonKrw(salary),
                        `${integer.format(salary)} Korean won`
                      )}
                      aria-describedby={`${id}-salary-help`}
                      onChange={(event) =>
                        setSalary(event.currentTarget.valueAsNumber)
                      }
                    />
                  </div>
                  <p id={`${id}-salary-help`} className="sr-only">
                    {c(
                      `연봉을 조절하면 ${hireCount}명 채용, ${MONTHS}개월 이용 기준의 비용이 바뀝니다.`,
                      `Adjust the salary to compare costs for ${hireCount} ${hireCount === 1 ? "hire" : "hires"} over ${MONTHS} months.`
                    )}
                  </p>
                </div>
                <div className="mt-5 flex items-center justify-between gap-4 text-[14px]">
                  <label
                    id={`${id}-hire-count-label`}
                    htmlFor={`${id}-hire-count`}
                    className={
                      isLight ? "text-neutral-primary" : "text-white/80"
                    }
                  >
                    {c("채용 인원", "Number of hires")}
                  </label>
                  <Select
                    items={hireCountOptions}
                    value={hireCount}
                    onValueChange={(value) => {
                      if (value != null) setHireCount(value);
                    }}
                  >
                    <SelectTrigger
                      id={`${id}-hire-count`}
                      aria-labelledby={`${id}-hire-count-label`}
                      className={cn(
                        "w-28",
                        !isLight &&
                          "border-white/14 bg-white/5 text-white hover:bg-white/10 focus-visible:border-white/40 focus-visible:ring-white/10"
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" alignItemWithTrigger={false}>
                      {hireCountOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {/* 비용 표: 배경·모서리·좌우 여백·기본 글자 크기 */}
                <dl
                  className={cn(
                    "mt-7 rounded-xl px-5 py-1 text-[14px] leading-[1.6] tracking-[-0.015em] transition-colors duration-200 motion-reduce:transition-none md:mt-8",
                    isLight ? "bg-bg-weak" : "bg-white/5"
                  )}
                >
                  {/* 헤드헌터 */}
                  <div className="flex items-center justify-between gap-3 py-4">
                    <dt
                      className={cn(
                        "max-w-[46%] break-keep",
                        isLight ? "text-neutral-muted" : "text-white/82"
                      )}
                    >
                      {c("헤드헌터 수수료", "Headhunter fee")}
                    </dt>
                    <dd className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                      <span>{c("연봉의", "Salary ×")}</span>
                      <Select
                        items={headhunterRateOptions}
                        value={headhunterRate}
                        onValueChange={(value) => {
                          if (value != null) setHeadhunterRate(value);
                        }}
                      >
                        <SelectTrigger
                          size="sm"
                          aria-label={c(
                            "헤드헌터 수수료율",
                            "Headhunter commission rate"
                          )}
                          className={cn(
                            "w-18 px-2 tabular-nums",
                            !isLight &&
                              "border-white/14 bg-white/5 text-white hover:bg-white/10 focus-visible:border-white/40 focus-visible:ring-white/10"
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="end"
                          alignItemWithTrigger={false}
                          className="min-w-20"
                        >
                          {headhunterRateOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="py-1.5"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </dd>
                  </div>

                  {/* 공고 광고 */}
                  <div
                    className={cn(
                      "flex items-start justify-between gap-3 py-4 border-t",
                      isLight ? "border-neutral-1000-a05" : "border-white/5"
                    )}
                  >
                    <dt
                      className={cn(
                        "max-w-[46%] break-keep",
                        isLight ? "text-neutral-muted" : "text-white/82"
                      )}
                    >
                      {c("잡플랫폼 채용 광고비", "Job platform advertising")}
                    </dt>
                    <dd className="shrink-0 text-right whitespace-nowrap">
                      {formatKrw(AD_MONTHLY_KRW)}
                      <span
                        className={
                          isLight ? "text-neutral-muted" : "text-white/50"
                        }
                      >
                        {c(" / 월", " / mo")}
                      </span>
                      {hireCount > 1 && (
                        <span className="ml-1.5 whitespace-nowrap">
                          × {hireCount}
                        </span>
                      )}
                    </dd>
                  </div>

                  {/* 채용 서비스 */}
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 py-4 border-t",
                      isLight ? "border-neutral-1000-a05" : "border-white/5"
                    )}
                  >
                    <dt
                      className={cn(
                        "max-w-[46%] break-keep",
                        isLight ? "text-neutral-muted" : "text-white/82"
                      )}
                    >
                      {c("플랫폼 채용 수수료", "Platform hiring fee")}
                    </dt>
                    <dd className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                      <span>{c("연봉의", "Salary ×")}</span>
                      <span>{serviceRateLabel}</span>
                    </dd>
                  </div>

                  {/* Harper: 행 간격은 py-5, 이름은 dt, 가격은 dd에서 수정 */}
                  <div
                    className={cn(
                      "flex items-start justify-between gap-3 py-4 border-t",
                      isLight ? "border-neutral-1000-a05" : "border-white/5"
                    )}
                  >
                    <dt
                      className={cn(
                        "max-w-[46%] break-keep",
                        isLight ? "text-orange-700" : "text-orange-600"
                      )}
                    >
                      {c("Harper 구독", "Harper subscription")}
                    </dt>
                    <dd className="shrink-0 text-right whitespace-nowrap">
                      {formatKrw(HARPER_MONTHLY_KRW)}
                      <span
                        className={
                          isLight ? "text-neutral-muted" : "text-white/50"
                        }
                      >
                        {c(" / 월", " / mo")}
                      </span>
                      {hireCount > 1 && (
                        <span className="ml-1.5 whitespace-nowrap">
                          × {hireCount}
                        </span>
                      )}
                      <span className="block text-neutral-muted">
                        {c("성공보수 없음", "No success fee")}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="min-w-0 px-5 pt-7 pb-6 md:px-6 md:py-8">
                <figure
                  className={cn(
                    "-mx-1 my-0 bg-size-[12px_12px] px-2.5 pt-5 pb-3 transition-colors duration-200 motion-reduce:transition-none md:mx-0 md:px-5 md:pt-6",
                    isLight
                      ? "bg-bg-weak/60 bg-[radial-gradient(color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)_0.8px,transparent_0.8px)]"
                      : "bg-white/3 bg-[radial-gradient(color-mix(in_srgb,var(--color-white)_8%,transparent)_0.8px,transparent_0.8px)]"
                  )}
                  aria-labelledby={`${id}-chart-title`}
                >
                  <figcaption
                    id={`${id}-chart-title`}
                    className="mb-12 flex items-center justify-between gap-4 text-[11px] font-normal md:mb-14 md:text-[12px]"
                  >
                    <span
                      className={
                        isLight ? "text-neutral-muted" : "text-white/76"
                      }
                    >
                      {c(
                        `${MONTHS}개월 ${hireCount}명 채용 기준`,
                        `Total cost for ${hireCount} ${hireCount === 1 ? "hire" : "hires"} over ${MONTHS} months`
                      )}
                    </span>
                  </figcaption>
                  <div
                    className="pb-20 pl-[35px] md:pl-[42px]"
                    aria-hidden="true"
                  >
                    <div className="relative h-[220px] md:h-[260px]">
                      <div className="absolute inset-0">
                        {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
                          <div
                            key={fraction}
                            className={cn(
                              "absolute w-full border-t",
                              isLight
                                ? "border-neutral-1000-a05 last:border-neutral-1000/25"
                                : "border-white/5 last:border-white/28"
                            )}
                            style={{ bottom: `${fraction * 100}%` }}
                          >
                            <AxisLabel
                              maximum={maximum}
                              fraction={fraction}
                              locale={locale}
                              isLight={isLight}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="absolute inset-0 grid grid-cols-4 gap-2.5 px-1.5 md:gap-3.5 md:px-[9px]">
                        {barOrder.map((costId) => (
                          <CostBar
                            key={costId}
                            id={costId}
                            locale={locale}
                            {...bars[costId]}
                            maximum={maximum}
                            highlight={costId === "harper"}
                            isLight={isLight}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <dl className="sr-only">
                    {[...costs]
                      .sort((a, b) => b.cost - a.cost)
                      .map(({ id: costId, cost }) => (
                        <div key={costId}>
                          <dt>{bars[costId].label}</dt>
                          <dd>{integer.format(cost)} KRW</dd>
                        </div>
                      ))}
                  </dl>
                </figure>
              </div>
            </div>
          </div>
        </PageContainer>
      </section>
    </>
  );
}
