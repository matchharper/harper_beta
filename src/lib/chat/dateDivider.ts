export function formatChatDateDividerLabel(
  createdAt: string,
  locale: "ko" | "en",
  now = new Date()
) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  const language = locale === "ko" ? "ko-KR" : "en-US";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const relativeDay =
    date.toDateString() === now.toDateString()
      ? 0
      : date.toDateString() === yesterday.toDateString()
        ? -1
        : null;
  let dateLabel =
    relativeDay === null
      ? new Intl.DateTimeFormat(language, {
          month: "long",
          day: "numeric",
          weekday: "long",
        }).format(date)
      : new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(
          relativeDay,
          "day"
        );
  if (locale === "en") {
    dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);
  }
  const timeLabel = new Intl.DateTimeFormat(language, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${dateLabel}${locale === "en" ? " at " : " "}${timeLabel}`;
}
