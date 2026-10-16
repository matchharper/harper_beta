import { z } from "zod";
import type { ExternalSearchPlan } from "../talentOnboarding/jobPostingRecommendations";

// ISO 3166-1 alpha-2 identifiers, not a language/keyword interpretation rule.
const codes = new Set(
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " "
  )
);
export const countriesSchema = z
  .array(
    z.object({
      countryCode: z
        .string()
        .refine(
          (v) => codes.has(v),
          "Expected ISO alpha-2 country code (KR, not KO)"
        ),
      weight: z.number().finite().positive().max(100),
      remoteOnly: z.boolean(),
    })
  )
  .min(1)
  .max(12)
  .refine(
    (rows) => new Set(rows.map((r) => r.countryCode)).size === rows.length,
    "Countries must be unique"
  );
export type CountryWeight = z.infer<typeof countriesSchema>[number];
export type V2SearchPlan = Omit<ExternalSearchPlan, "locations"> & {
  countries: CountryWeight[];
};

// Largest remainder allocation preserves the exact requested total, including small weights.
export function countryQuotas(countries: CountryWeight[], total: number) {
  const rows = countriesSchema.parse(countries);
  const sum = rows.reduce((n, c) => n + c.weight, 0);
  const result = rows.map((c) => ({
    ...c,
    quota: Math.floor((total * c.weight) / sum),
  }));
  const remaining = total - result.reduce((n, c) => n + c.quota, 0);
  const order = rows
    .map((c, i) => ({
      i,
      remainder: (total * c.weight) / sum - result[i].quota,
    }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of order.slice(0, remaining)) result[i].quota++;
  return result;
}
