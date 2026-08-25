const CAREER_MESSAGE_ATTACHMENT_MARKER_PATTERN =
  /\n*\[\[HARPER_CAREER_MESSAGE_ATTACHMENTS_V1:([^\]]+)\]\]/g;

export type CareerMessageAttachment = {
  mime?: string;
  name: string;
  size?: number;
};

function normalizeSingleLine(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

export function normalizeCareerMessageAttachments(
  value: unknown
): CareerMessageAttachment[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = normalizeSingleLine(record.name, 240);
    if (!name) return [];
    const mime = normalizeSingleLine(record.mime, 160) || undefined;
    const rawSize = record.size;
    const size =
      typeof rawSize === "number" && Number.isFinite(rawSize) && rawSize >= 0
        ? Math.floor(rawSize)
        : undefined;
    const key = `${name}\u0000${mime ?? ""}\u0000${size ?? ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ mime, name, size }];
  });
}

export function extractCareerMessageAttachments(
  content: string
): CareerMessageAttachment[] {
  const attachments: CareerMessageAttachment[] = [];
  for (const match of content.matchAll(
    CAREER_MESSAGE_ATTACHMENT_MARKER_PATTERN
  )) {
    try {
      attachments.push(
        ...normalizeCareerMessageAttachments(
          JSON.parse(decodeURIComponent(match[1] ?? ""))
        )
      );
    } catch {
      // Ignore malformed metadata and keep the visible message usable.
    }
  }
  return normalizeCareerMessageAttachments(attachments);
}

export function stripCareerMessageAttachmentMetadata(content: string) {
  let foundMarker = false;
  const visibleContent = content.replace(
    CAREER_MESSAGE_ATTACHMENT_MARKER_PATTERN,
    () => {
      foundMarker = true;
      return "";
    }
  );
  return foundMarker ? visibleContent.trimEnd() : content;
}

export function appendCareerMessageAttachmentMetadata(
  content: string,
  attachments: CareerMessageAttachment[]
) {
  const normalizedAttachments = normalizeCareerMessageAttachments(attachments);
  const visibleContent = stripCareerMessageAttachmentMetadata(content);
  if (normalizedAttachments.length === 0) return visibleContent;
  const encoded = encodeURIComponent(JSON.stringify(normalizedAttachments));
  return `${visibleContent}\n\n[[HARPER_CAREER_MESSAGE_ATTACHMENTS_V1:${encoded}]]`;
}

export function formatCareerMessageAttachmentsForLlm(content: string) {
  const attachments = extractCareerMessageAttachments(content);
  const visibleContent = stripCareerMessageAttachmentMetadata(content);
  if (attachments.length === 0) return visibleContent;

  const files = attachments
    .map((attachment) => `- ${attachment.name}`)
    .join("\n");
  return `${visibleContent}\n\n[Files attached to this user message]\n${files}`;
}
