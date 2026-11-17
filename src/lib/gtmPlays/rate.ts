/**
 * A rate as the ops tables show it next to a count: "33%". "–" when nothing was in the denominator (no link or mail
 * went out), so an empty row never reads as 0%. The formula itself is in the column's header hint.
 */
export function ratePercent(part: number, whole: number) {
  if (!(whole > 0)) return "–";
  return `${Math.round((part / whole) * 100)}%`;
}
