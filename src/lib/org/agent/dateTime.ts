export function formatOrgAgentKstDateTime(
  value: unknown,
  options: { includeYear?: boolean } = {}
) {
  const date = new Date(String(value ?? "").trim());
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
    ...(options.includeYear ? { year: "numeric" } : {}),
  }).format(date);
}
