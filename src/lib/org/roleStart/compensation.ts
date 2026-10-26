/**
 * Fixed annual compensation choices, asked first when the JD states none.
 * Korean uses KRW and English uses USD; these are independent ranges, not FX
 * conversions. The selected localized text is saved on the Role.
 */
const COMPENSATION_BANDS: Array<[ko: string, en: string]> = [
  ["5,000만~7,000만 원", "USD 50,000–70,000 / year"],
  ["7,000만~9,000만 원", "USD 70,000–90,000 / year"],
  ["9,000만~1억 2,000만 원", "USD 90,000–120,000 / year"],
  ["1억 2,000만~1억 5,000만 원", "USD 120,000–150,000 / year"],
  ["1억 5,000만 원 이상", "USD 150,000+ / year"],
];

export function compensationChips() {
  return [
    ...COMPENSATION_BANDS.map(([ko, en]) => ({ ko: `연봉 ${ko}`, en })),
    { ko: "연봉 경력에 따라 협의", en: "Negotiable by experience" },
  ];
}
