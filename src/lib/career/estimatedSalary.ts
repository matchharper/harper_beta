export type EstimatedAnnualSalary = {
  min: number;
  max: number;
  currency: string;
};

// Estimates are shown and stored in 100,000 KRW steps; finer digits imply
// precision the estimate does not have.
export function roundEstimatedKrw(value: number) {
  return Math.round(value / 100_000) * 100_000;
}

export type EstimatedSalaryFields = {
  salary_is_predicted?: boolean | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_period?: string | null;
};

// Keep estimates separate from published compensation and never label monthly
// or hourly amounts as annual salary.
export function getEstimatedAnnualSalary(
  role: EstimatedSalaryFields
): EstimatedAnnualSalary | null {
  const { salary_min: min, salary_max: max, salary_currency: currency } = role;
  if (
    role.salary_is_predicted !== true ||
    role.salary_period !== "year" ||
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max < min ||
    !currency
  ) return null;
  return { min, max, currency };
}

export function formatEstimatedAnnualSalary(
  salary: EstimatedAnnualSalary,
  locale: string
) {
  const number = new Intl.NumberFormat(locale === "ko" ? "ko-KR" : "en-US");
  const krw = salary.currency === "KRW";
  const min = krw ? roundEstimatedKrw(salary.min) : salary.min;
  const max = krw ? roundEstimatedKrw(salary.max) : salary.max;
  if (krw && locale === "ko") {
    return `${number.format(min / 10_000)} ~ ${number.format(max / 10_000)}만원`;
  }
  return `${salary.currency} ${number.format(min)} ~ ${number.format(max)}`;
}
