export const CAREER_SESSION_START_NO_MESSAGE_MARKER = "__NO_SESSION_GREETING__";

export function normalizeNoMessageContent(content: string, marker?: string) {
  const visibleContent = content.replace(/^[`"'“”]+|[`"'“”]+$/g, "").trim();
  if (!visibleContent) return null;
  if (!marker) return visibleContent;

  const markerCandidate = visibleContent
    .replace(/\s+/g, " ")
    .replace(/^[`"'“”]+|[`"'“”.。]+$/g, "")
    .trim();
  return markerCandidate === marker ? null : visibleContent;
}
