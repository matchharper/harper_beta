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
