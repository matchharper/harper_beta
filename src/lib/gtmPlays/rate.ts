/**
 * A rate with its formula, as the ops tables show it next to a count: "33% = 1/3". "–" when nothing was in the
 * denominator (no link or mail went out), so an empty row never reads as 0%.
 */
export function rateWithFormula(part: number, whole: number) {
  if (!(whole > 0)) return "–";
  return `${Math.round((part / whole) * 100)}% = ${part}/${whole}`;
}
