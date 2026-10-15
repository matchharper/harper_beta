import fx from "./salaryFx.json";

// Adapted from roleSalaryEstimation.prompts.json's responsibility/market reasoning,
// applied to the candidate's demonstrated capability rather than an employer's JD.
export const SALARY_MARKET_VALUE_INSTRUCTION = `targetSalaryKrw is your best estimate of this candidate's professional market value expressed as one annual pre-tax BASE salary in Korean won. Estimate what an employer competing for their demonstrated capabilities would typically pay in the hiring market of this search. Exclude bonuses, commissions, equity, benefits and retirement contributions.
Ground the estimate primarily in career history, actual responsibilities, ownership, delivered results, technical depth and transferable expertise. Use your hiring-market knowledge actively when disclosed compensation is absent. Infer the real responsibility level: years and titles are clues, not pay rules. Production-scale systems, difficult research, architecture and technical/team ownership can command scarce-market pay with fewer years; an AI title alone does not establish scarce expertise. Distinguish independently demonstrated capability from interests or ambitions.
Infer the relevant employer compensation market from the person's experience and credible next-role scope. Do not assign everyone a national average, assume a small company has a low cash ceiling, or treat a prestigious client as the candidate's employer. Estimate in the actual local hiring market; foreign headquarters alone does not imply US pay. For a multi-country search, give a representative benchmark for the intended country mix, rather than choosing the highest-paying country by default. Use a concrete central estimate, not an aspirational ceiling or a low fallback for uncertainty. Do not invent confirmed salary or employer facts.
The user's desired salary and willingness to trade compensation for another benefit do not define this estimate. Confirmed current base pay may provide context, but is neither a floor nor a ceiling. Even if the user says compensation is irrelevant, accepts any pay, or withdraws a previous minimum, still infer a positive benchmark from their career evidence. Do not copy a requested salary into this field just because it was stated. Return null only when there is no credible professional context from which to estimate market pay.
This is a tentative soft retrieval signal for professional level, never a confirmed preference, minimum eligibility rule or reason to reject a role. Unknown role salary stays eligible. Explicit user compensation requirements remain separate facts for downstream fit judgment; this estimate must not overwrite them. Do not write this inference into Brief/Memory. Reassess it from the current evidence and search market even when reusing a search plan; a run-specific market change belongs only to that run.`;

export const SALARY_TARGET_UNIT_INSTRUCTION = `Every targetSalaryKrw amount is Korean won, including for foreign postings. First estimate annual base pay in the actual hiring market's local currency, then multiply by the supplied KRW-per-one-currency-unit rate. Convert inferred expectations as well as disclosed pay. For scale: JPY 10,000,000/year is about ${Math.round(10_000_000 * fx.krwPerUnit.JPY).toLocaleString("en-US")} KRW/year; USD 100,000/year is about ${Math.round(100_000 * fx.krwPerUnit.USD).toLocaleString("en-US")} KRW/year. Neither local-currency amounts nor amounts in thousands/millions may be returned directly in the KRW field.`;
export const SALARY_TARGET_FX_CONTEXT = `FX, KRW per one currency unit, ${fx.asOf}: ${JSON.stringify(fx.krwPerUnit)}`;

// Comparable annual pay only. Never guess an omitted currency or period.
export function annualSalaryKrw(row: {
  salary_min?: unknown;
  salary_max?: unknown;
  salary_currency?: string | null;
  salary_period?: string | null;
}) {
  const rate = (fx.krwPerUnit as Record<string, number>)[
    row.salary_currency?.toUpperCase() ?? ""
  ];
  const period = (
    {
      year: 1,
      yearly: 1,
      annual: 1,
      annually: 1,
      month: 12,
      monthly: 12,
    } as Record<string, number>
  )[row.salary_period?.toLowerCase() ?? ""];
  const value = (v: unknown) =>
    v != null && Number.isFinite(Number(v)) && Number(v) > 0 && rate && period
      ? Number(v) * rate * period
      : null;
  if (
    [row.salary_min, row.salary_max].some(
      (v) => v != null && (!Number.isFinite(Number(v)) || Number(v) <= 0)
    )
  )
    return { min: null, max: null };
  const min = value(row.salary_min),
    max = value(row.salary_max);
  return min !== null && max !== null && max < min
    ? { min: null, max: null }
    : { min, max };
}

// Expected capped utility across the disclosed band. Meeting the target saturates:
// extreme upper bounds never buy unlimited rank; below-target pay falls smoothly.
// A partial band stays neutral unless its known bound establishes enough/too-low pay.
export function salarySatisfaction(
  min: number | null,
  max: number | null,
  target: number | null
) {
  if (!target || (min === null && max === null)) return 0.5;
  if (max === null) return min! >= target ? 1 : 0.5;
  if (min === null) return max < target ? 0.5 * (max / target) ** 2 : 0.5;
  const lo = min ?? max!,
    hi = max ?? min!;
  if (lo >= target) return 1;
  if (hi === lo) return Math.min(1, (lo / target) ** 2);
  const integral = (x: number) =>
    x <= target ? x ** 3 / (3 * target ** 2) : x - (2 * target) / 3;
  return (integral(hi) - integral(lo)) / (hi - lo);
}
export function salaryRank(
  topical: number,
  satisfaction: number,
  weight = 0.35
) {
  return topical * (1 - weight + 2 * weight * satisfaction);
}
export function salarySatisfactionSql(target: number | null | undefined) {
  if (!target) return "0.5::double precision";
  if (!Number.isFinite(target) || target <= 0)
    throw new Error("Invalid annual salary target");
  return `public.external_role_salary_satisfaction(cr.salary_min,cr.salary_max,cr.salary_currency,cr.salary_period,${target})`;
}
