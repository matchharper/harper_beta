import type { ChatAttachmentPayload } from "@/types/chat";

export const MAX_SLACK_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SLACK_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SLACK_FILES = 3;
export const MAX_SLACK_FILE_TEXT_CHARS = 12_000;
export const MAX_SLACK_TOTAL_FILE_TEXT_CHARS = 24_000;

const SUPPORTED_MIMES_BY_EXTENSION: Record<string, readonly string[]> = {
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
};

export type HarperSlackFile = {
  file_access?: string;
  filetype?: string;
  id?: string;
  mimetype?: string;
  name?: string;
  size?: number;
  title?: string;
  url_private?: string;
  url_private_download?: string;
};

export type HarperSlackMessageWithFiles = {
  bot_id?: string;
  files?: HarperSlackFile[];
  ts?: string;
  user?: string;
};

type ExtractDocument = (args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
}) => Promise<{ text: string; truncated: boolean }>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeFileName(file: HarperSlackFile) {
  return (text(file.name) || text(file.title) || text(file.id) || "Slack file")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 240);
}

function extension(fileName: string) {
  return fileName.toLowerCase().split(".").at(-1) ?? "";
}

function normalizedMime(value: unknown) {
  return text(value).split(";", 1)[0]!.toLowerCase();
}

function normalizedSize(value: unknown) {
  const size = Number(value);
  return Number.isSafeInteger(size) && size >= 0 ? size : 0;
}

export function isSupportedHarperSlackFile(file: HarperSlackFile) {
  const name = safeFileName(file);
  const ext = extension(name);
  const mime = normalizedMime(file.mimetype);
  const allowedMimes = SUPPORTED_MIMES_BY_EXTENSION[ext];
  if (!allowedMimes) return false;
  return (
    !mime || mime === "application/octet-stream" || allowedMimes.includes(mime)
  );
}

export function needsHarperSlackFileInfo(file: HarperSlackFile) {
  return (
    text(file.file_access) === "check_file_info" ||
    !text(file.url_private_download || file.url_private) ||
    !text(file.name || file.title) ||
    !text(file.mimetype)
  );
}

export function compactHarperSlackFilesForQueue(
  files: HarperSlackFile[] | undefined
) {
  return (files ?? []).slice(0, 10).map((file) => ({
    id: text(file.id).slice(0, 80) || undefined,
    mimetype: normalizedMime(file.mimetype).slice(0, 160) || undefined,
    name: safeFileName(file),
    size: normalizedSize(file.size),
  }));
}

export function parseQueuedHarperSlackFiles(value: unknown): HarperSlackFile[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const file = item as Record<string, unknown>;
    const id = text(file.id).slice(0, 80);
    const name = text(file.name)
      .replace(/[\r\n\t]/g, " ")
      .slice(0, 240);
    if (!id && !name) return [];
    return [
      {
        id: id || undefined,
        mimetype: normalizedMime(file.mimetype).slice(0, 160) || undefined,
        name: name || undefined,
        size: normalizedSize(file.size),
      },
    ];
  });
}

export function selectPendingHarperSlackFiles(args: {
  botUserId: string;
  currentMessageTs: string;
  messages: HarperSlackMessageWithFiles[];
}) {
  const currentMessageIndex = args.messages.findIndex(
    (message) => text(message.ts) === text(args.currentMessageTs)
  );
  if (currentMessageIndex < 0) return [];

  let latestBotMessageIndex = -1;
  for (let index = 0; index < currentMessageIndex; index += 1) {
    const message = args.messages[index]!;
    if (text(message.user) === text(args.botUserId) || message.bot_id) {
      latestBotMessageIndex = index;
    }
  }
  return args.messages
    .slice(latestBotMessageIndex + 1, currentMessageIndex + 1)
    .filter(
      (message) =>
        text(message.user) !== text(args.botUserId) && !message.bot_id
    )
    .flatMap((message) => message.files ?? []);
}

export function mergeHarperSlackFiles(files: HarperSlackFile[]) {
  const merged = new Map<string, HarperSlackFile>();
  files.forEach((file, index) => {
    const key =
      text(file.id) ||
      `${safeFileName(file)}:${normalizedSize(file.size)}:${index}`;
    const existing = merged.get(key);
    if (
      !existing ||
      (needsHarperSlackFileInfo(existing) && !needsHarperSlackFileInfo(file))
    ) {
      merged.set(key, file);
    }
  });
  return Array.from(merged.values());
}

export function buildHarperSlackFileFallbackPrompt(
  rawText: unknown,
  files: HarperSlackFile[] | undefined
) {
  const message = text(rawText);
  if (message) return message;
  const names = (files ?? []).map(safeFileName).filter(Boolean);
  if (names.length === 0) return "";
  return names.length === 1
    ? `첨부된 ${names[0]} 파일을 읽어 주세요.`
    : `첨부된 파일(${names.join(", ")})을 읽어 주세요.`;
}

function validatedSlackDownloadUrl(file: HarperSlackFile) {
  const raw = text(file.url_private_download || file.url_private);
  if (!raw) throw new Error("Slack에서 다운로드 주소를 받지 못했습니다.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "files.slack.com") {
    throw new Error("안전한 Slack 다운로드 주소가 아닙니다.");
  }
  return url.toString();
}

async function readResponseBytes(response: Response, maxBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("파일은 10MB 이하여야 합니다.");
  }
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error("파일은 10MB 이하여야 합니다.");
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("파일은 10MB 이하여야 합니다.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadSlackFile(args: {
  fetchImpl: typeof fetch;
  file: HarperSlackFile;
  token: string;
}) {
  const response = await args.fetchImpl(validatedSlackDownloadUrl(args.file), {
    headers: { Authorization: `Bearer ${args.token}` },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Slack 파일 다운로드에 실패했습니다 (${response.status}).`);
  }
  return readResponseBytes(response, MAX_SLACK_FILE_BYTES);
}

export async function extractHarperSlackFileAttachments(args: {
  extractDocument?: ExtractDocument;
  fetchImpl?: typeof fetch;
  files: HarperSlackFile[];
  token: string;
}): Promise<{
  attachments: ChatAttachmentPayload[];
  errors: string[];
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const extractDocument =
    args.extractDocument ??
    (await import("@/lib/org/agent/roleCreationDocuments"))
      .extractRoleCreationDocument;
  const attachments: ChatAttachmentPayload[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let acceptedBytes = 0;
  let extractedChars = 0;

  for (const file of args.files) {
    const name = safeFileName(file);
    const identity = text(file.id) || `${name}:${normalizedSize(file.size)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    if (!isSupportedHarperSlackFile(file)) {
      errors.push(`${name}: PDF, DOCX, TXT 파일만 읽을 수 있습니다.`);
      continue;
    }
    if (attachments.length >= MAX_SLACK_FILES) {
      errors.push(
        `${name}: 한 메시지에서는 파일을 최대 3개까지 읽을 수 있습니다.`
      );
      continue;
    }
    const size = normalizedSize(file.size);
    if (size <= 0) {
      errors.push(`${name}: 빈 파일이거나 파일 크기를 확인할 수 없습니다.`);
      continue;
    }
    if (size > MAX_SLACK_FILE_BYTES) {
      errors.push(`${name}: 파일은 10MB 이하여야 합니다.`);
      continue;
    }
    if (acceptedBytes + size > MAX_SLACK_TOTAL_FILE_BYTES) {
      errors.push(`${name}: 첨부 파일의 전체 크기는 25MB 이하여야 합니다.`);
      continue;
    }

    try {
      const bytes = await downloadSlackFile({
        fetchImpl,
        file,
        token: args.token,
      });
      const remainingChars = MAX_SLACK_TOTAL_FILE_TEXT_CHARS - extractedChars;
      if (remainingChars <= 0) {
        errors.push(
          `${name}: 앞선 파일에서 읽은 내용이 길어 이 파일은 생략했습니다.`
        );
        continue;
      }
      const maxChars = Math.min(MAX_SLACK_FILE_TEXT_CHARS, remainingChars);
      const extracted = await extractDocument({
        bytes,
        fileName: name,
        maxChars,
      });
      acceptedBytes += size;
      extractedChars += extracted.text.length;
      attachments.push({
        kind: "file",
        mime: normalizedMime(file.mimetype) || undefined,
        name,
        size,
        text: extracted.text,
        excerpt: extracted.text.slice(0, 600),
        truncated: extracted.truncated,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "파일을 읽지 못했습니다.";
      errors.push(`${name}: ${message}`);
    }
  }

  return { attachments, errors };
}

export function buildHarperSlackFileLlmMessage(args: {
  attachments: ChatAttachmentPayload[];
  errors?: string[];
  message: string;
}) {
  const attachmentContext = args.attachments.map((attachment, index) => ({
    index: index + 1,
    mime: attachment.mime ?? null,
    name: attachment.name,
    text: attachment.text,
    truncated: Boolean(attachment.truncated),
  }));
  return [
    text(args.message),
    attachmentContext.length > 0
      ? `<untrusted_slack_file_attachments>\n${JSON.stringify(attachmentContext, null, 2)}\n</untrusted_slack_file_attachments>`
      : "",
    (args.errors ?? []).length > 0
      ? `<slack_file_read_errors>\n${JSON.stringify(args.errors, null, 2)}\n</slack_file_read_errors>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
