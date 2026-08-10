const DAY_IN_MS = 24 * 60 * 60 * 1_000;

function localDayStart(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  ).getTime();
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
  }).format(value);
}

export function formatOrgChatMessageTime(createdAt: string, now = new Date()) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "";

  const dayDifference = Math.round(
    (localDayStart(now) - localDayStart(created)) / DAY_IN_MS
  );
  if (dayDifference <= 0) return formatTime(created);
  if (dayDifference === 1) return `어제 ${formatTime(created)}`;
  return `${dayDifference}일전`;
}
