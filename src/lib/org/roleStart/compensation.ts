import type { RoleStartBrief } from "./brief";

/**
 * The fixed compensation question, asked first when the JD states none. Its
 * chips come at once from the Brief's minimum years (no model call); the
 * answer is the Role's 보상 field, never part of the Brief or the question count.
 */
const COMPENSATION_BANDS: Array<{ belowYears: number; bands: Array<[ko: string, en: string]> }> = [
  { belowYears: 3, bands: [["3,500만~5,000만 원", "KRW 35M–50M / year"], ["5,000만~7,000만 원", "KRW 50M–70M / year"], ["7,000만 원 이상", "KRW 70M+ / year"]] },
  { belowYears: 7, bands: [["5,000만~7,000만 원", "KRW 50M–70M / year"], ["7,000만~9,000만 원", "KRW 70M–90M / year"], ["9,000만 원 이상", "KRW 90M+ / year"]] },
  { belowYears: Infinity, bands: [["7,000만~9,000만 원", "KRW 70M–90M / year"], ["9,000만~1억 2,000만 원", "KRW 90M–120M / year"], ["1억 2,000만 원 이상", "KRW 120M+ / year"]] },
];

/** Each chip's text as saved on the Role (ko, prefixed with 연봉) and as shown on English screens. */
export function compensationChips(brief: Pick<RoleStartBrief, "hardConditions">) {
  const years = Math.max(0, ...brief.hardConditions.map((item) => (item.kind === "min_years" ? Number(item.years) || 0 : 0)));
  const { bands } = COMPENSATION_BANDS.find((item) => years < item.belowYears)!;
  return [
    ...bands.map(([ko, en]) => ({ ko: `연봉 ${ko}`, en })),
    { ko: "연봉 경력에 따라 협의", en: "Negotiable by experience" },
  ];
}
