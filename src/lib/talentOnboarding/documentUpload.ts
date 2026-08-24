export type TalentDocumentUploadKind = "document" | "resume";

export { MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES } from "./documentUploadLimits";

const MIME_TYPE_BY_EXTENSION = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

const RESUME_EXTENSIONS = new Set(["docx", "md", "pdf", "txt"]);
const DOCUMENT_EXTENSIONS = new Set(Object.keys(MIME_TYPE_BY_EXTENSION));
const TEXT_EXTRACTABLE_EXTENSIONS = new Set(["docx", "md", "pdf", "txt"]);

const RESUME_FILE_NAME_TERMS = [
  "resume",
  "curriculum vitae",
  "이력서",
  "경력기술서",
] as const;

export const TALENT_DOCUMENT_STORAGE_ALLOWED_MIME_TYPES = Array.from(
  new Set(Object.values(MIME_TYPE_BY_EXTENSION))
);

function getFileExtension(fileName: string) {
  const normalizedName = fileName.trim().toLowerCase();
  const separatorIndex = normalizedName.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === normalizedName.length - 1) {
    return null;
  }
  return normalizedName.slice(separatorIndex + 1);
}

export function inferTalentDocumentKindFromFileName(
  fileName: string
): TalentDocumentUploadKind {
  const extension = getFileExtension(fileName);
  const baseName = extension
    ? fileName.slice(0, -(extension.length + 1))
    : fileName;
  const normalized = baseName
    .normalize("NFKC")
    .replace(/résumé/gi, "resume")
    .toLowerCase();
  const hasResumeTerm = RESUME_FILE_NAME_TERMS.some((term) =>
    normalized.includes(term)
  );
  const hasCvToken = /(?:^|[^a-z0-9])cv(?:$|[^a-z0-9])/i.test(normalized);
  return hasResumeTerm || hasCvToken ? "resume" : "document";
}

export function isTalentDocumentTextExtractable(fileName: string) {
  const extension = getFileExtension(fileName);
  return Boolean(extension && TEXT_EXTRACTABLE_EXTENSIONS.has(extension));
}

export function resolveTalentDocumentUpload(args: {
  fileName: string;
  kind: TalentDocumentUploadKind;
}) {
  const extension = getFileExtension(args.fileName);
  if (!extension) return null;

  const allowedExtensions =
    args.kind === "resume" ? RESUME_EXTENSIONS : DOCUMENT_EXTENSIONS;
  if (!allowedExtensions.has(extension)) return null;

  const contentType =
    MIME_TYPE_BY_EXTENSION[extension as keyof typeof MIME_TYPE_BY_EXTENSION];
  if (!contentType) return null;

  return { contentType, extension };
}

const GENERIC_BINARY_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

/** Validate resume bytes before they are persisted or shared with a company. */
export function validateResumeFileContent(args: {
  bytes: Uint8Array;
  fileName: string;
  suppliedContentType?: string | null;
}) {
  const upload = resolveTalentDocumentUpload({
    fileName: args.fileName,
    kind: "resume",
  });
  if (!upload || args.bytes.byteLength === 0) return false;

  const suppliedContentType = String(args.suppliedContentType ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  const compatibleMimeTypes: Record<string, Set<string>> = {
    docx: new Set([
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/zip",
    ]),
    md: new Set(["text/markdown", "text/plain"]),
    pdf: new Set(["application/pdf"]),
    txt: new Set(["text/plain"]),
  };
  if (
    !GENERIC_BINARY_MIME_TYPES.has(suppliedContentType) &&
    !compatibleMimeTypes[upload.extension]?.has(suppliedContentType)
  ) {
    return false;
  }

  const bytes = args.bytes;
  if (upload.extension === "pdf") {
    return new TextDecoder("ascii")
      .decode(bytes.slice(0, 5))
      .startsWith("%PDF-");
  }
  if (upload.extension === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false;
    const archiveText = new TextDecoder("latin1").decode(bytes);
    return (
      archiveText.includes("[Content_Types].xml") &&
      archiveText.includes("word/")
    );
  }
  if (bytes.some((byte) => byte === 0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function startsWithBytes(bytes: Uint8Array, prefix: number[]) {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function hasCompatibleMimeType(args: {
  extension: string;
  suppliedContentType?: string | null;
}) {
  const suppliedContentType = String(args.suppliedContentType ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (GENERIC_BINARY_MIME_TYPES.has(suppliedContentType)) return true;

  const canonical =
    MIME_TYPE_BY_EXTENSION[
      args.extension as keyof typeof MIME_TYPE_BY_EXTENSION
    ];
  if (suppliedContentType === canonical) return true;
  if (args.extension === "jpg" || args.extension === "jpeg") {
    return suppliedContentType === "image/jpeg";
  }
  if (args.extension === "md") return suppliedContentType === "text/plain";
  if (["docx", "pptx", "xlsx"].includes(args.extension)) {
    return suppliedContentType === "application/zip";
  }
  return false;
}

/** Validate all file formats accepted by the general document uploader. */
export function validateTalentDocumentFileContent(args: {
  bytes: Uint8Array;
  fileName: string;
  suppliedContentType?: string | null;
}) {
  const upload = resolveTalentDocumentUpload({
    fileName: args.fileName,
    kind: "document",
  });
  if (!upload || args.bytes.byteLength === 0) return false;
  if (
    !hasCompatibleMimeType({
      extension: upload.extension,
      suppliedContentType: args.suppliedContentType,
    })
  ) {
    return false;
  }

  const bytes = args.bytes;
  if (upload.extension === "pdf") {
    return new TextDecoder("ascii")
      .decode(bytes.slice(0, 5))
      .startsWith("%PDF-");
  }
  if (["docx", "pptx", "xlsx"].includes(upload.extension)) {
    if (!startsWithBytes(bytes, [0x50, 0x4b])) return false;
    const archiveText = new TextDecoder("latin1").decode(bytes);
    const requiredFolder =
      upload.extension === "docx"
        ? "word/"
        : upload.extension === "pptx"
          ? "ppt/"
          : "xl/";
    return (
      archiveText.includes("[Content_Types].xml") &&
      archiveText.includes(requiredFolder)
    );
  }
  if (["doc", "ppt", "xls"].includes(upload.extension)) {
    return startsWithBytes(
      bytes,
      [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
    );
  }
  if (upload.extension === "png") {
    return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]);
  }
  if (upload.extension === "jpg" || upload.extension === "jpeg") {
    return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
  }
  if (bytes.some((byte) => byte === 0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function sliceTextWithoutBreakingSurrogate(value: string, maxChars: number) {
  const sliced = value.slice(0, maxChars);
  const lastCodeUnit = sliced.charCodeAt(sliced.length - 1);
  return lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff
    ? sliced.slice(0, -1)
    : sliced;
}

export async function extractTalentDocumentTextContent(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
  maxPdfPages?: number;
}) {
  if (!isTalentDocumentTextExtractable(args.fileName)) return null;

  const maxChars = Math.max(1, args.maxChars ?? 120_000);
  const lower = args.fileName.toLowerCase();
  const buffer = Buffer.from(args.bytes);
  let text = "";

  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    text = new TextDecoder("utf-8", { fatal: true }).decode(args.bytes);
  } else if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    text = String(parsed.value ?? "");
  } else {
    // @ts-ignore: pdf-parse-fork does not ship module declarations.
    const pdfModule = await import("pdf-parse-fork");
    const parsed = await pdfModule.default(buffer, {
      max: Math.max(1, args.maxPdfPages ?? 40),
    });
    text = String(parsed.text ?? "");
  }

  const normalized = text.trim();
  return normalized
    ? sliceTextWithoutBreakingSurrogate(normalized, maxChars)
    : null;
}

export async function extractTalentDocumentTextContentBestEffort(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
  maxPdfPages?: number;
  onError?: (error: unknown) => void;
}) {
  try {
    return await extractTalentDocumentTextContent(args);
  } catch (error) {
    args.onError?.(error);
    return null;
  }
}

export async function extractResumeTextContent(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
}) {
  return (
    (await extractTalentDocumentTextContent({
      ...args,
      maxChars: args.maxChars ?? 24_000,
      maxPdfPages: 8,
    })) ?? ""
  );
}

export async function extractResumeTextContentBestEffort(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
  onError?: (error: unknown) => void;
}) {
  try {
    return await extractResumeTextContent(args);
  } catch (error) {
    args.onError?.(error);
    return null;
  }
}
