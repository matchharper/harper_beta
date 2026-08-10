import "server-only";

import { extractResumeTextContent } from "@/lib/talentOnboarding/documentUpload";
import { MAX_ROLE_CREATION_FILE_BYTES } from "@/lib/org/agent/roleCreationDocumentTypes";

export { MAX_ROLE_CREATION_FILE_BYTES } from "@/lib/org/agent/roleCreationDocumentTypes";

const TEXT_EXTENSIONS = new Set([
  "csv",
  "html",
  "htm",
  "json",
  "markdown",
  "md",
  "text",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

function extension(name: string) {
  return name.trim().toLowerCase().split(".").at(-1) ?? "";
}

function normalize(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function extractLegacyDocText(bytes: Uint8Array) {
  // Legacy .doc is an OLE binary. This conservative fallback extracts only
  // long printable ASCII/UTF-16LE runs and never treats control bytes as text.
  const ascii = new TextDecoder("latin1").decode(bytes);
  const asciiRuns = ascii.match(/[\x20-\x7E\u00A0-\u00FF]{6,}/g) ?? [];
  let utf16 = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8);
    utf16 +=
      code === 9 || code === 10 || code === 13 || code >= 32
        ? String.fromCharCode(code)
        : " ";
  }
  const unicodeRuns = utf16.match(/[\p{L}\p{N}\p{P}\p{Zs}\n]{6,}/gu) ?? [];
  return normalize([...unicodeRuns, ...asciiRuns].join("\n"));
}

function extractRtf(value: string) {
  return normalize(
    value
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\'[0-9a-f]{2}/gi, " ")
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, " ")
  );
}

function extractHtml(value: string) {
  return normalize(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

export async function extractRoleCreationDocument(args: {
  bytes: Uint8Array;
  fileName: string;
  maxChars?: number;
}) {
  if (args.bytes.byteLength === 0) throw new Error("빈 파일입니다.");
  if (args.bytes.byteLength > MAX_ROLE_CREATION_FILE_BYTES) {
    throw new Error("파일은 10MB 이하여야 합니다.");
  }
  const ext = extension(args.fileName);
  const maxChars = Math.max(1, args.maxChars ?? 18_000);
  let extracted = "";
  if (ext === "pdf" || ext === "docx") {
    extracted = await extractResumeTextContent({
      bytes: args.bytes,
      fileName: args.fileName,
      maxChars: maxChars + 1,
    });
  } else if (ext === "doc") {
    extracted = extractLegacyDocText(args.bytes);
  } else if (ext === "rtf") {
    extracted = extractRtf(new TextDecoder("latin1").decode(args.bytes));
  } else if (TEXT_EXTENSIONS.has(ext)) {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
      args.bytes
    );
    if (ext === "json") JSON.parse(decoded);
    extracted =
      ext === "html" || ext === "htm"
        ? extractHtml(decoded)
        : normalize(decoded);
  } else {
    throw new Error("지원하지 않는 파일 형식입니다.");
  }
  const content = normalize(extracted);
  if (!content)
    throw new Error("파일에서 읽을 수 있는 텍스트를 찾지 못했습니다.");
  return {
    text: content.slice(0, maxChars),
    truncated: content.length > maxChars,
  };
}
