import { useLayoutEffect, useRef } from "react";
import { Tooltips } from "@/components/ui/tooltip";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { buildCareerLineage } from "@/lib/org/careerLineage";
import type {
  OrgProfileEducation,
  OrgProfileExperience,
} from "@/lib/org/server";

function CareerLineageLogo({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const fitName = () => {
      if (!box.isConnected || !box.clientWidth || !box.clientHeight) return;
      let size = 32;
      text.style.fontSize = `${size}px`;
      while (
        size > 1 &&
        (text.scrollWidth > box.clientWidth ||
          text.scrollHeight > box.clientHeight)
      ) {
        text.style.fontSize = `${--size}px`;
      }
    };

    fitName();
    const observer = new ResizeObserver(fitName);
    observer.observe(box);
    void document.fonts.ready.then(fitName);
    return () => observer.disconnect();
  }, [name]);

  return (
    <span
      aria-hidden
      className="relative flex size-28 shrink-0 overflow-hidden rounded-md bg-neutral-50 p-2"
    >
      <span
        ref={boxRef}
        className="flex size-full min-w-0 items-center justify-center"
      >
        <span
          ref={textRef}
          className="w-full shrink-0 text-center font-sans text-[32px] font-medium leading-[1.05] tracking-[-0.06em] text-neutral-primary"
        >
          {name.split(/(\s+)/).map((part, index) =>
            /\s/.test(part) ? (
              part
            ) : (
              <span key={index} className="inline-block whitespace-nowrap">
                {part}
              </span>
            )
          )}
        </span>
      </span>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={logoUrl}
          alt=""
          className="absolute inset-0 size-full bg-white object-contain p-1.5"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          src={logoUrl}
        />
      ) : null}
    </span>
  );
}

/** School and company marks above a connected row of duration tags. */
export function OrgCareerLineage({
  educations,
  experiences,
}: {
  educations: OrgProfileEducation[];
  experiences: OrgProfileExperience[];
}) {
  const { c } = useOrgLocale();
  const steps = buildCareerLineage({ educations, experiences });
  if (!steps.length) return null;
  const firstDurationIndex = steps.findIndex((step) => step.months);
  const lastDurationIndex = steps.reduce(
    (last, step, index) => (step.months ? index : last),
    -1
  );
  const duration = (months: number) => {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    if (years && rest) {
      return c("{y}년 {m}개월", "{y} yr {m} mo", { m: rest, y: years });
    }
    return years
      ? c("{y}년", "{y} yr", { y: years })
      : c("{m}개월", "{m} mo", { m: rest });
  };
  return (
    <section aria-label={c("학력·경력 흐름", "Education and career path")}>
      <div className="overflow-x-auto pb-2 scrollbar-none mt-12">
        <ol className="flex min-w-max gap-5">
          {steps.map((step, index) => {
            const item = (
              <li
                className="relative flex w-49 shrink-0 flex-col items-center rounded-sm text-center outline-none focus-visible:ring-2 focus-visible:ring-neutral-1000-a10"
                key={step.key}
                tabIndex={step.detail ? 0 : undefined}
              >
                <CareerLineageLogo name={step.name} logoUrl={step.logoUrl} />
                <div className="mt-2.5 flex-1 text-[13px] font-medium text-neutral-primary">
                  {step.name}
                </div>
                <div className="relative mt-2 flex h-7 w-full items-center justify-center">
                  {index >= firstDurationIndex && index < lastDurationIndex ? (
                    <span
                      aria-hidden
                      className="absolute left-1/2 top-1/2 h-px w-[calc(100%+1.25rem)] -translate-y-1/2 bg-neutral-1000-a10"
                    />
                  ) : null}
                  {step.months ? (
                    <span className="relative rounded-full border border-neutral-1000-a10 bg-bg-default px-2 py-1 text-sm font-light tabular-nums leading-4 text-neutral-800">
                      {duration(step.months)}
                    </span>
                  ) : null}
                </div>
              </li>
            );
            return step.detail ? (
              <Tooltips key={step.key} text={step.detail} variant="light">
                {item}
              </Tooltips>
            ) : (
              item
            );
          })}
        </ol>
      </div>
    </section>
  );
}
