import type { ChatAttachmentPayload } from "@/types/chat";
import type { LlmImageInput } from "@/lib/llm/imageInput";

export const MAX_SLACK_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SLACK_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SLACK_FILES = 3;
export const MAX_SLACK_FILE_TEXT_CHARS = 12_000;
export const MAX_SLACK_TOTAL_FILE_TEXT_CHARS = 24_000;

const DOCUMENT_MIMES_BY_EXTENSION: Record<string, readonly string[]> = {
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
};

const IMAGE_MIMES_BY_EXTENSION: Record<
  string,
  readonly LlmImageInput["mime"][]
> = {
  gif: ["image/gif"],
  jpeg: ["image/jpeg"],
  jpg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
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
  return (text(file.name) || text(file.title) || text(file.id) || "Slack 파일")
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
  const allowedMimes =
    DOCUMENT_MIMES_BY_EXTENSION[ext] ?? IMAGE_MIMES_BY_EXTENSION[ext];
  if (!allowedMimes) return false;
  return (
    !mime || mime === "application/octet-stream" || allowedMimes.includes(mime)
  );
}

export function isSupportedHarperSlackImage(file: HarperSlackFile) {
  const allowedMimes = IMAGE_MIMES_BY_EXTENSION[extension(safeFileName(file))];
  const mime = normalizedMime(file.mimetype);
  return Boolean(
    allowedMimes &&
    (!mime ||
      mime === "application/octet-stream" ||
      allowedMimes.includes(mime as LlmImageInput["mime"]))
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

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function detectedImageMime(bytes: Uint8Array): LlmImageInput["mime"] | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  return null;
}

function skipGifSubBlocks(bytes: Uint8Array, start: number) {
  let offset = start;
  while (offset < bytes.length) {
    const blockSize = bytes[offset] ?? 0;
    offset += 1;
    if (blockSize === 0) return offset;
    offset += blockSize;
    if (offset > bytes.length) return -1;
  }
  return -1;
}

function isSingleFrameGif(bytes: Uint8Array) {
  if (bytes.length < 13) return false;
  const globalColorTableSize =
    bytes[10]! & 0x80 ? 3 * 2 ** ((bytes[10]! & 0x07) + 1) : 0;
  let offset = 13 + globalColorTableSize;
  let frameCount = 0;

  while (offset < bytes.length) {
    const marker = bytes[offset];
    if (marker === 0x3b) return frameCount === 1;
    if (marker === 0x21) {
      if (offset + 2 >= bytes.length) return false;
      offset = skipGifSubBlocks(bytes, offset + 2);
      if (offset < 0) return false;
      continue;
    }
    if (marker !== 0x2c || offset + 10 > bytes.length) return false;

    frameCount += 1;
    if (frameCount > 1) return false;
    const localColorTableSize =
      bytes[offset + 9]! & 0x80
        ? 3 * 2 ** ((bytes[offset + 9]! & 0x07) + 1)
        : 0;
    offset += 10 + localColorTableSize;
    if (offset >= bytes.length) return false;
    offset = skipGifSubBlocks(bytes, offset + 1);
    if (offset < 0) return false;
  }
  return false;
}

function imageInputFromBytes(args: {
  bytes: Uint8Array;
  file: HarperSlackFile;
  name: string;
  size: number;
}): LlmImageInput {
  const mime = detectedImageMime(args.bytes);
  const allowedMimes = IMAGE_MIMES_BY_EXTENSION[extension(args.name)] ?? [];
  if (!mime || !allowedMimes.includes(mime)) {
    throw new Error("이미지의 실제 형식이 파일 이름과 일치하지 않습니다.");
  }
  const declaredMime = normalizedMime(args.file.mimetype);
  if (
    declaredMime &&
    declaredMime !== "application/octet-stream" &&
    declaredMime !== mime
  ) {
    throw new Error(
      "이미지의 실제 형식이 Slack 파일 정보와 일치하지 않습니다."
    );
  }
  if (mime === "image/gif" && !isSingleFrameGif(args.bytes)) {
    throw new Error("움직이는 GIF는 읽을 수 없습니다.");
  }
  return {
    dataUrl: `data:${mime};base64,${Buffer.from(args.bytes).toString("base64")}`,
    detail: "auto",
    mime,
    name: args.name,
    size: args.size,
  };
}

export async function extractHarperSlackFileAttachments(args: {
  extractDocument?: ExtractDocument;
  fetchImpl?: typeof fetch;
  files: HarperSlackFile[];
  token: string;
}): Promise<{
  attachments: ChatAttachmentPayload[];
  errors: string[];
  images: LlmImageInput[];
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  let extractDocument = args.extractDocument;
  const attachments: ChatAttachmentPayload[] = [];
  const errors: string[] = [];
  const images: LlmImageInput[] = [];
  const seen = new Set<string>();
  let acceptedBytes = 0;
  let extractedChars = 0;

  for (const file of args.files) {
    const name = safeFileName(file);
    const identity = text(file.id) || `${name}:${normalizedSize(file.size)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    if (!isSupportedHarperSlackFile(file)) {
      errors.push(
        `${name}: PDF, DOCX, TXT 문서나 PNG, JPG, WEBP, GIF 이미지만 읽을 수 있습니다.`
      );
      continue;
    }
    if (attachments.length + images.length >= MAX_SLACK_FILES) {
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
      if (acceptedBytes + bytes.byteLength > MAX_SLACK_TOTAL_FILE_BYTES) {
        errors.push(`${name}: 첨부 파일의 전체 크기는 25MB 이하여야 합니다.`);
        continue;
      }
      if (isSupportedHarperSlackImage(file)) {
        images.push(
          imageInputFromBytes({ bytes, file, name, size: bytes.byteLength })
        );
        acceptedBytes += bytes.byteLength;
        continue;
      }
      extractDocument ??= (
        await import("@/lib/org/agent/roleCreationDocuments")
      ).extractRoleCreationDocument;
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
      acceptedBytes += bytes.byteLength;
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

  return { attachments, errors, images };
}

export function buildHarperSlackFileLlmMessage(args: {
  attachments: ChatAttachmentPayload[];
  errors?: string[];
  images?: LlmImageInput[];
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
    (args.images ?? []).length > 0
      ? `<untrusted_slack_image_attachments>\n${JSON.stringify(
          (args.images ?? []).map((image, index) => ({
            index: index + 1,
            mime: image.mime,
            name: image.name,
            size: image.size,
          })),
          null,
          2
        )}\n</untrusted_slack_image_attachments>`
      : "",
    (args.errors ?? []).length > 0
      ? `<slack_file_read_errors>\n${JSON.stringify(args.errors, null, 2)}\n</slack_file_read_errors>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
