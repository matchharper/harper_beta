// Projection boundary: inferred salary is retrieval data, never a salary fact.
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
