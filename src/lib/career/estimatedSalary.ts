export type EstimatedAnnualSalary = {
  min: number;
  max: number;
  currency: string;
};

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
  if (salary.currency === "KRW" && locale === "ko") {
    return `${number.format(salary.min / 10_000)} ~ ${number.format(salary.max / 10_000)}만원`;
  }
  return `${salary.currency} ${number.format(salary.min)} ~ ${number.format(salary.max)}`;
}
