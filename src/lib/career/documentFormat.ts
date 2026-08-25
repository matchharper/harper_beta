export type CareerDocumentFormat =
  | "document"
  | "image"
  | "pdf"
  | "presentation"
  | "spreadsheet"
  | "unknown";

const FORMAT_BY_EXTENSION: Record<string, CareerDocumentFormat> = {
  doc: "document",
  docx: "document",
  jpeg: "image",
  jpg: "image",
  md: "document",
  pdf: "pdf",
  png: "image",
  ppt: "presentation",
  pptx: "presentation",
  txt: "document",
  xls: "spreadsheet",
  xlsx: "spreadsheet",
};

export const getCareerDocumentFormat = (
  fileName: string
): CareerDocumentFormat => {
  const normalizedFileName = fileName.trim().toLowerCase();
  const extensionSeparatorIndex = normalizedFileName.lastIndexOf(".");

  if (
    extensionSeparatorIndex <= 0 ||
    extensionSeparatorIndex === normalizedFileName.length - 1
  ) {
    return "unknown";
  }

  const extension = normalizedFileName.slice(extensionSeparatorIndex + 1);
  return FORMAT_BY_EXTENSION[extension] ?? "unknown";
};
