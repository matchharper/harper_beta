export type TalentDocumentUploadKind = "document" | "resume";

export const MAX_TALENT_DOCUMENT_FILE_SIZE_BYTES = 20 * 1024 * 1024;

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

export async function extractResumeTextContent(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
}) {
  const maxChars = Math.max(1, args.maxChars ?? 24_000);
  const lower = args.fileName.toLowerCase();
  const buffer = Buffer.from(args.bytes);
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(args.bytes)
      .trim()
      .slice(0, maxChars);
  }
  if (lower.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const parsed = await mammoth.extractRawText({ buffer });
    return String(parsed.value ?? "")
      .trim()
      .slice(0, maxChars);
  }
  // @ts-ignore: pdf-parse-fork does not ship module declarations.
  const pdfModule = await import("pdf-parse-fork");
  const parsed = await pdfModule.default(buffer, { max: 8 });
  return String(parsed.text ?? "")
    .trim()
    .slice(0, maxChars);
}
