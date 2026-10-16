import type { CountryWeight } from "./countries";

// Input: company_capped contains only scored ANN candidates after the global
// per-company cap. Output: selected, ordered by the existing relevance score.
export function buildCountrySelectionCtes(countries: CountryWeight[], limit: number) {
  const order = "search_rank DESC, distance, posted_at DESC NULLS LAST, role_id";
  if (countries.length === 1) return `selected AS MATERIALIZED (
 SELECT * FROM company_capped ORDER BY ${order} LIMIT ${limit}
)`;

  // Capped proportional allocation: quota_i = min(capacity_i, weight_i * scale).
  // Sort countries by capacity/weight. Each possible exhausted prefix gives a
  // scale for the remaining countries; the maximum is the feasible scale.
  // This redistributes shortages without recursive scans of the role pool.
  // Largest remainders then turn fractional quotas into an exact integer budget.
  // Country codes/positive finite weights have already passed countriesSchema.
  const weights = countries.map((c, i) =>
    `('${c.countryCode}',${c.weight}::numeric,${i})`
  ).join(",");
  return `country_weights(country_code, weight, country_order) AS (VALUES ${weights}),
 country_ranked AS MATERIALIZED (
 SELECT *, row_number() OVER (PARTITION BY country_code ORDER BY ${order}) AS country_rank
 FROM company_capped
), country_capacity AS (
 SELECT w.country_code, w.weight, w.country_order, count(*) AS capacity
 FROM country_ranked r JOIN country_weights w USING (country_code)
 GROUP BY w.country_code, w.weight, w.country_order
), country_capacity_ordered AS (
 SELECT *, least(${limit}, sum(capacity) OVER ()) AS budget,
 coalesce(sum(capacity) OVER (
   ORDER BY capacity/weight, country_order ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
 ),0) AS exhausted_capacity,
 sum(weight) OVER (
   ORDER BY capacity/weight, country_order ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
 ) AS remaining_weight
 FROM country_capacity
), country_fractional AS (
 SELECT *, least(capacity, weight * max((budget-exhausted_capacity)/remaining_weight) OVER ()) AS exact_quota
 FROM country_capacity_ordered
), country_quotas AS (
 SELECT country_code, floor(exact_quota) + CASE WHEN
   row_number() OVER (ORDER BY exact_quota-floor(exact_quota) DESC, country_order)
     <= budget-sum(floor(exact_quota)) OVER ()
   AND floor(exact_quota) < capacity THEN 1 ELSE 0 END AS quota
 FROM country_fractional
), selected AS MATERIALIZED (
 SELECT r.* FROM country_ranked r JOIN country_quotas q USING (country_code)
 WHERE r.country_rank <= q.quota
 ORDER BY ${order} LIMIT ${limit}
)`;
}
