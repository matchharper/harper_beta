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
