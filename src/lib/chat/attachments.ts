import type {
  AttachmentContextBlock,
  ChatAttachmentKind,
  ChatAttachmentPayload,
  FileContextBlock,
} from "@/types/chat";

const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";

function normalizeText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function parseUiBlocks(rawContent: string) {
  const blocks: Array<{
    start: number;
    end: number;
    parsed: unknown;
    raw: string;
  }> = [];
  let cursor = 0;

  while (true) {
    const start = rawContent.indexOf(UI_START, cursor);
    if (start === -1) break;

    const afterStart = start + UI_START.length;
    const endMarker = rawContent.indexOf(UI_END, afterStart);
    if (endMarker === -1) break;

    const end = endMarker + UI_END.length;
    const raw = rawContent.slice(afterStart, endMarker).trim();
    let parsed: unknown = null;

    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    blocks.push({ start, end, parsed, raw });
    cursor = end;
  }

  return blocks;
}

function isAttachmentKind(value: unknown): value is ChatAttachmentKind {
  return value === "file" || value === "link";
}

function isAttachmentContextBlock(
  value: unknown
): value is AttachmentContextBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<AttachmentContextBlock>;
  return (
    block.type === "attachment_context" &&
    typeof block.name === "string" &&
    isAttachmentKind(block.kind)
  );
}

function isLegacyFileContextBlock(value: unknown): value is FileContextBlock {
  if (!value || typeof value !== "object") return false;
  const block = value as Partial<FileContextBlock>;
  return block.type === "file_context" && typeof block.name === "string";
}

function normalizeLegacyBlock(
  block: FileContextBlock | AttachmentContextBlock
): AttachmentContextBlock {
  if (block.type === "attachment_context") return block;
  return {
    type: "attachment_context",
    kind: "file",
    name: block.name,
    text: block.text,
    size: block.size,
    mime: block.mime,
    excerpt: block.excerpt,
    truncated: block.truncated,
  };
}

export function createAttachmentContextBlock(
  attachment: ChatAttachmentPayload
): AttachmentContextBlock {
  return {
    type: "attachment_context",
    kind: attachment.kind,
    name: attachment.name,
    text: attachment.text,
    size: attachment.size,
    mime: attachment.mime,
    excerpt: attachment.excerpt,
    truncated: attachment.truncated,
    url: attachment.url,
  };
}

export function extractAttachmentContextBlocks(rawContent: string) {
  return parseUiBlocks(rawContent)
    .flatMap(({ parsed }) => {
      if (
        isAttachmentContextBlock(parsed) ||
        isLegacyFileContextBlock(parsed)
      ) {
        return [normalizeLegacyBlock(parsed)];
      }
      return [];
    })
    .filter((block) => typeof block.name === "string" && block.name.trim());
}

export function extractAttachmentPayloads(rawContent: string) {
  return extractAttachmentContextBlocks(rawContent)
    .filter((block) => typeof block.text === "string" && block.text.trim())
    .map(
      (block): ChatAttachmentPayload => ({
        kind: block.kind,
        name: block.name,
        text: normalizeText(String(block.text ?? "")),
        size: block.size,
        mime: block.mime,
        excerpt: block.excerpt,
        truncated: block.truncated,
        url: block.url,
      })
    );
}

export function hasSerializedAttachments(rawContent: string) {
  return extractAttachmentContextBlocks(rawContent).length > 0;
}

export function serializeAttachmentBlocks(
  attachments: ChatAttachmentPayload[]
) {
  return attachments
    .map((attachment) => {
      const block = createAttachmentContextBlock(attachment);
      return `${UI_START}\n${JSON.stringify(block)}\n${UI_END}`;
    })
    .join("\n");
}

export function stripSerializedAttachmentBlocks(rawContent: string) {
  if (!rawContent) return "";

  let cursor = 0;
  let output = "";

  for (const block of parseUiBlocks(rawContent)) {
    output += rawContent.slice(cursor, block.start);

    if (
      !isAttachmentContextBlock(block.parsed) &&
      !isLegacyFileContextBlock(block.parsed)
    ) {
      output += rawContent.slice(block.start, block.end);
    }

    cursor = block.end;
  }

  output += rawContent.slice(cursor);
  return normalizeText(output);
}

export function buildUserMessageContent(args: {
  text?: string;
  attachments?: ChatAttachmentPayload[];
}) {
  const text = normalizeText(args.text ?? "");
  const serialized = serializeAttachmentBlocks(args.attachments ?? []);

  return [text, serialized].filter(Boolean).join("\n\n");
}

export function buildAttachmentKeywordText(args: {
  text?: string;
  attachments?: ChatAttachmentPayload[];
  maxChars?: number;
}) {
  const parts: string[] = [];
  const text = normalizeText(args.text ?? "");
  const attachments = args.attachments ?? [];

  if (text) parts.push(text);

  if (attachments.length > 0) {
    const attachmentText = attachments
      .map((attachment, index) => {
        const body = attachment.excerpt?.trim() || attachment.text.trim();
        const header =
          attachment.kind === "link"
            ? `링크 ${index + 1}: ${attachment.name}${attachment.url ? ` (${attachment.url})` : ""}`
            : `파일 ${index + 1}: ${attachment.name}`;
        return `${header}\n${clampText(body, 1200)}`;
      })
      .join("\n\n");

    if (attachmentText) parts.push(attachmentText);
  }

  return clampText(parts.join("\n\n"), args.maxChars ?? 6000);
}
