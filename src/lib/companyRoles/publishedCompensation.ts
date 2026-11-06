// Public compensation remains employer-disclosed. Private assessments can use
// the separately labelled estimate below without turning it into a salary fact.
export function publishedCompensation<
  T extends { salary_is_predicted?: boolean },
>(role: T): T {
  return role.salary_is_predicted === true
    ? {
        ...role,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
        salary_range: null,
      }
    : role;
}

export function estimatedBaseSalaryText(row: {
  salary_is_predicted?: boolean;
  salary_min?: number | string | null;
  salary_max?: number | string | null;
  salary_currency?: string | null;
  salary_period?: string | null;
}) {
  if (!row.salary_is_predicted || !row.salary_currency || !row.salary_period) return null;
  const amount = (value: unknown) => value != null && Number.isFinite(Number(value)) && Number(value) > 0
    ? Number(value).toLocaleString("en-US") : null;
  const min = amount(row.salary_min), max = amount(row.salary_max);
  if (!min && !max) return null;
  const range = min && max ? `${min}–${max}` : min ? `≥${min}` : `≤${max}`;
  return `Model-estimated base salary: ${row.salary_currency} ${range} per ${row.salary_period}; rough prediction; may be substantially inaccurate; not employer-disclosed; bonus and equity excluded.`;
}
