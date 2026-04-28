import {
  buildAttachmentKeywordText,
  createAttachmentContextBlock,
} from "@/lib/chatAttachments";
import type { ChatAttachmentPayload } from "@/types/chat";

const MAX_ATTACHMENT_CHARS = 12000;
export const MAX_CHAT_ATTACHMENT_FILE_BYTES = 10 * 1024 * 1024;

export type DraftChatAttachment =
  | {
      id: string;
      kind: "file";
      file: File;
      name: string;
      size: number;
      mime?: string;
    }
  | {
      id: string;
      kind: "link";
      url: string;
      name: string;
    };

function createDraftId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function normalizeAttachmentLinkUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    throw new Error("링크를 입력해주세요.");
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const parsed = new URL(withProtocol);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("http 또는 https 링크만 사용할 수 있습니다.");
  }

  return parsed.toString();
}

export function createDraftFileAttachment(file: File): DraftChatAttachment {
  return {
    id: createDraftId(),
    kind: "file",
    file,
    name: file.name,
    size: file.size,
    mime: file.type || undefined,
  };
}

export function createDraftLinkAttachment(rawUrl: string): DraftChatAttachment {
  const url = normalizeAttachmentLinkUrl(rawUrl);
  return {
    id: createDraftId(),
    kind: "link",
    url,
    name: getHostname(url),
  };
}

async function readFileAttachment(file: File): Promise<ChatAttachmentPayload> {
  let text = "";

  if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/pdf", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("파일을 읽지 못했습니다.");
    }

    const data = (await response.json()) as { text?: string };
    text = String(data?.text ?? "");
  } else {
    text = await file.text();
  }

  const normalized = normalizeText(text);
  if (!normalized) {
    throw new Error("파일에 읽을 수 있는 텍스트가 없습니다.");
  }

  const truncated = normalized.length > MAX_ATTACHMENT_CHARS;
  const finalText = clampText(normalized, MAX_ATTACHMENT_CHARS);

  return {
    kind: "file",
    name: file.name,
    size: file.size,
    mime: file.type || undefined,
    text: finalText,
    excerpt: finalText.slice(0, 600),
    truncated,
  };
}

async function readLinkAttachment(url: string): Promise<ChatAttachmentPayload> {
  const response = await fetch("/api/tool/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("링크 내용을 읽지 못했습니다.");
  }

  const data = (await response.json()) as {
    excerpt?: string;
    markdown?: string;
    title?: string;
    url?: string;
  };

  const resolvedUrl = String(data?.url ?? url);
  const markdown = normalizeText(String(data?.markdown ?? ""));
  const excerpt = normalizeText(String(data?.excerpt ?? ""));
  const text = markdown || excerpt;

  if (!text) {
    throw new Error("링크에 읽을 수 있는 본문이 없습니다.");
  }

  const truncated = text.length > MAX_ATTACHMENT_CHARS;
  const finalText = clampText(text, MAX_ATTACHMENT_CHARS);
  const finalName =
    normalizeText(String(data?.title ?? "")) || getHostname(url);

  return {
    kind: "link",
    name: finalName,
    text: finalText,
    excerpt: excerpt || finalText.slice(0, 600),
    truncated,
    url: resolvedUrl,
  };
}

export async function readDraftAttachments(
  attachments: DraftChatAttachment[]
): Promise<ChatAttachmentPayload[]> {
  return Promise.all(
    attachments.map((attachment) =>
      attachment.kind === "file"
        ? readFileAttachment(attachment.file)
        : readLinkAttachment(attachment.url)
    )
  );
}

export function dedupeDraftAttachments(
  current: DraftChatAttachment[],
  nextAttachment: DraftChatAttachment
) {
  if (nextAttachment.kind === "file") {
    const exists = current.some(
      (attachment) =>
        attachment.kind === "file" &&
        attachment.name === nextAttachment.name &&
        attachment.size === nextAttachment.size
    );
    if (exists) return current;
  }

  if (nextAttachment.kind === "link") {
    const exists = current.some(
      (attachment) =>
        attachment.kind === "link" && attachment.url === nextAttachment.url
    );
    if (exists) return current;

    return [
      ...current.filter((attachment) => attachment.kind !== "link"),
      nextAttachment,
    ];
  }

  return [...current, nextAttachment];
}

export function buildAttachmentFallbackPrompt(
  attachments: Array<Pick<DraftChatAttachment, "kind" | "name">>,
  locale: "ko" | "en"
) {
  if (attachments.length === 0) return "";

  if (attachments.length === 1) {
    const attachment = attachments[0];
    if (locale === "en") {
      return attachment.kind === "link"
        ? `Search based on attached link: ${attachment.name}`
        : `Search based on attached file: ${attachment.name}`;
    }

    return attachment.kind === "link"
      ? `첨부 링크 기반 검색: ${attachment.name}`
      : `첨부 파일 기반 검색: ${attachment.name}`;
  }

  if (locale === "en") {
    return `Search based on ${attachments.length} attached references`;
  }

  return `첨부 자료 ${attachments.length}개 기반 검색`;
}

export function buildAttachmentKeywordSource(args: {
  text?: string;
  attachments?: ChatAttachmentPayload[];
}) {
  return buildAttachmentKeywordText(args);
}

export function toSerializedAttachmentBlocks(
  attachments: ChatAttachmentPayload[]
) {
  return attachments.map((attachment) =>
    createAttachmentContextBlock(attachment)
  );
}
