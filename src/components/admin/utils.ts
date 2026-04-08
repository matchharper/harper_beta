export function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

export function formatKST(iso?: string) {
  if (!iso) return "";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSectionName(sectionName: string) {
  return sectionName.replace(/_/g, " ");
}

export function formatTalentNetworkEventName(type: string) {
  return type
    .replace(/^talent_network_/, "")
    .replace(/:/g, " / ")
    .replace(/_/g, " ");
}
