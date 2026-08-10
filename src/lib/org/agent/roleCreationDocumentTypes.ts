export const MAX_ROLE_CREATION_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROLE_CREATION_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_ROLE_CREATION_FILES = 3;
export const ROLE_CREATION_FILE_EXTENSIONS = [
  "md",
  "markdown",
  "txt",
  "text",
  "pdf",
  "docx",
  "doc",
  "json",
  "csv",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "rtf",
] as const;
export const ROLE_CREATION_FILE_ACCEPT = ROLE_CREATION_FILE_EXTENSIONS.map(
  (extension) => `.${extension}`
).join(",");

export function isRoleCreationFileNameAllowed(fileName: string) {
  const extension = fileName.trim().toLowerCase().split(".").at(-1) ?? "";
  return (ROLE_CREATION_FILE_EXTENSIONS as readonly string[]).includes(
    extension
  );
}

const ROLE_CREATION_MIMES_BY_EXTENSION: Record<string, readonly string[]> = {
  csv: ["text/csv", "text/plain", "application/csv"],
  doc: ["application/msword", "application/vnd.ms-word"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  htm: ["text/html"],
  html: ["text/html"],
  json: ["application/json", "text/json", "text/plain"],
  markdown: ["text/markdown", "text/x-markdown", "text/plain"],
  md: ["text/markdown", "text/x-markdown", "text/plain"],
  pdf: ["application/pdf"],
  rtf: ["application/rtf", "text/rtf"],
  text: ["text/plain"],
  txt: ["text/plain"],
  xml: ["application/xml", "text/xml", "text/plain"],
  yaml: ["application/yaml", "application/x-yaml", "text/yaml", "text/plain"],
  yml: ["application/yaml", "application/x-yaml", "text/yaml", "text/plain"],
};

export function isRoleCreationFileMimeAllowed(
  fileName: string,
  mime: string | null | undefined
) {
  const normalizedMime = String(mime ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  // Browsers commonly leave local file MIME empty or use the generic binary
  // type. The extension still has to be on the allowlist and the parser will
  // validate the actual contents.
  if (!normalizedMime || normalizedMime === "application/octet-stream") {
    return isRoleCreationFileNameAllowed(fileName);
  }
  const extension = fileName.trim().toLowerCase().split(".").at(-1) ?? "";
  return (ROLE_CREATION_MIMES_BY_EXTENSION[extension] ?? []).includes(
    normalizedMime
  );
}

export function isRoleCreationMediaMime(mime: string | null | undefined) {
  return /^(image|video|audio)\//i.test(String(mime ?? "").trim());
}
