import { z } from "zod";
import prompts from "./roleSalaryEstimation.prompts.json";

export const MAX_SALARY_ROLES = 20;
export const SALARY_PAGE_SIZE = 20;
export const SALARY_METHODS = {
  market_reasoning: "회사 채용시장 반영",
  baseline: "기본",
  mapping: "연봉표 추가",
} as const;
export type SalaryMethod = keyof typeof SALARY_METHODS;
export type SalaryCurrency = "KRW" | "USD";
export const salarySearchSchema = z.object({
  q: z.string().trim().max(120).default(""),
  country: z.enum(["KR", "US"]).default("KR"),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export const salaryRunSchema = z
  .object({
    roleIds: z.array(z.string().uuid()).min(1).max(MAX_SALARY_ROLES),
    method: z
      .enum(["market_reasoning", "baseline", "mapping"])
      .default("mapping"),
  })
  .strict();

export type PublishedSalary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: string | null;
};
export type SalaryRoleOption = {
  id: string;
  title: string;
  company: string;
  country: "KR" | "US";
  location: string | null;
  salary: PublishedSalary | null;
};
export type SalarySearchResult = {
  items: SalaryRoleOption[];
  hasMore: boolean;
};
export type SalaryEstimate = {
  min: number;
  max: number;
  currency: SalaryCurrency;
  midpoint: number;
  widthPct: number;
};
export type SalaryRunResult = {
  method: SalaryMethod;
  model: string;
  promptVersion: string;
  durationMs: number;
  costUsd: number | null;
  inputTokens: number | null;
  rows: Array<
    SalaryRoleOption & {
      estimate: SalaryEstimate | null;
      midpointErrorPct: number | null;
      error: string | null;
    }
  >;
  input: string;
};
export type SalaryModelRole = {
  case_id: string;
  currency: SalaryCurrency;
  country: string | null;
  company_name: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  company_context: Record<string, unknown>;
  jd: string;
};

export function buildSalaryDecisionRequest(
  roles: SalaryModelRole[],
  method: SalaryMethod,
  contract?: { anchors: Record<SalaryCurrency, number[]>; prompt: string }
) {
  if (
    !roles.length ||
    roles.length > MAX_SALARY_ROLES ||
    new Set(roles.map((r) => r.case_id)).size !== roles.length
  )
    throw new Error(`역할 1–${MAX_SALARY_ROLES}개를 선택하세요.`);
  return {
    model: prompts.model,
    input:
      (contract?.prompt ??
        prompts.basePrompt +
          (method === "baseline" ? "" : "\n" + prompts.methodPrompts[method])) +
      "\nRoles:\n" +
      JSON.stringify(roles),
    questions: roles.flatMap((role, index) =>
      ["lower", "upper"].map((endpoint) => ({
        name: `r${index}_${endpoint}`,
        type: "score" as const,
        instructions: `For ONLY case_id ${role.case_id}, estimate the most likely ${endpoint.toUpperCase()} endpoint of this employer's annual BASE salary hiring band in ${role.currency}. Choose the closest numeric anchor, not an uncertainty extreme. Other cases provide no evidence.`,
        levels: (contract?.anchors ?? prompts.anchors)[role.currency].map(
          (amount) => ({
            label: String(amount),
            description: `The best estimate of that endpoint is nearest ${amount.toLocaleString("en-US")} ${role.currency} per year.`,
          })
        ),
      }))
    ),
  };
}

const answerSchema = z.object({
  name: z.string(),
  type: z.literal("score"),
  probabilities: z
    .array(
      z.object({
        value: z.number().int().min(0).max(9),
        label: z.string(),
        probability: z.number().finite().min(0).max(1),
      })
    )
    .length(10),
});
export function decodeSalaryEstimate(
  raw: unknown,
  index: number,
  currency: SalaryCurrency,
  anchors = prompts.anchors[currency]
): SalaryEstimate {
  const response = z.object({ answers: z.array(z.unknown()) }).parse(raw);
  const values = ["lower", "upper"].map((endpoint) => {
    const name = `r${index}_${endpoint}`;
    const matches = response.answers.filter(
      (a) => a && typeof a === "object" && "name" in a && a.name === name
    );
    if (matches.length !== 1)
      throw new Error("추정 응답이 누락되거나 중복됐습니다.");
    const answer = answerSchema.parse(matches[0]);
    if (
      new Set(answer.probabilities.map((p) => p.value)).size !==
        anchors.length ||
      answer.probabilities.some((p) => p.label !== String(anchors[p.value]))
    )
      throw new Error("연봉 기준점이 응답과 일치하지 않습니다.");
    const mass = answer.probabilities.reduce(
      (sum, p) => sum + p.probability,
      0
    );
    if (Math.abs(mass - 1) > 0.02)
      throw new Error("추정 확률이 올바르지 않습니다.");
    return (
      answer.probabilities.reduce(
        (sum, p) => sum + p.probability * anchors[p.value],
        0
      ) / mass
    );
  });
  const [min, max] = values;
  if (min > max) throw new Error("하한이 상한보다 높게 반환됐습니다.");
  const midpoint = (min + max) / 2;
  return {
    min,
    max,
    currency,
    midpoint,
    widthPct: ((max - min) / midpoint) * 100,
  };
}

export function salaryMidpointError(
  estimate: SalaryEstimate,
  salary: PublishedSalary | null
) {
  if (
    !salary ||
    salary.currency?.toUpperCase() !== estimate.currency ||
    !["year", "yearly", "annual", "annually"].includes(
      salary.period?.toLowerCase() ?? ""
    ) ||
    salary.min === null ||
    salary.max === null ||
    salary.min <= 0 ||
    salary.max < salary.min
  )
    return null;
  return (
    (Math.abs(estimate.midpoint - (salary.min + salary.max) / 2) /
      ((salary.min + salary.max) / 2)) *
    100
  );
}

export function formatSalary(salary: PublishedSalary | SalaryEstimate | null) {
  if (!salary || (salary.min === null && salary.max === null)) return "—";
  const currency = salary.currency ?? "";
  const number = (value: number) =>
    currency === "KRW"
      ? `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`
      : `${currency === "USD" ? "$" : `${currency} `}${Math.round(value).toLocaleString("en-US")}`;
  const value =
    salary.min === null
      ? `${number(salary.max!)} 이하`
      : salary.max === null
        ? `${number(salary.min)} 이상`
        : salary.min === salary.max
          ? number(salary.min)
          : `${number(salary.min)}–${number(salary.max)}`;
  const period = "period" in salary ? salary.period?.toLowerCase() : "year";
  const label = {
    year: "년",
    yearly: "년",
    annual: "년",
    annually: "년",
    month: "월",
    monthly: "월",
    hour: "시간",
    hourly: "시간",
  }[period ?? ""];
  return value + (label ? ` / ${label}` : period ? ` / ${period}` : "");
}
