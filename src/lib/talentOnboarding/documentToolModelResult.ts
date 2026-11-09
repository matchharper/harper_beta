import { formatPromptText } from "@/lib/llm/promptText";

type Data = Record<string, unknown>;
const record = (value: unknown): Data =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const pick = (data: Data, keys: string[]): Data =>
  Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key, data[key]]));

function metadata(value: unknown) {
  const data = record(value);
  return pick(data, ["documentId", "fileName", "description", "kind", "source", "revision", "createdAt", "isPrimary", "isPublic", "hasExtractedText", "pdfExport"]);
}

/** Source bodies stay intact; storage/transport details and duplicate metadata stay out. */
export function formatDocumentToolModelResult(name: string, result: Data): string {
  if (name === "list_documents") {
    return formatPromptText({
      ...pick(result, ["ok", "error", "offset", "limit", "hasMore", "nextOffset"]),
      documents: Array.isArray(result.documents) ? result.documents.map(metadata) : [],
    });
  }
  if (name === "read_document") {
    const projectRead = (entry: Data) => ({
      ...(entry.document ? { document: metadata(entry.document) } : pick(entry, ["documentId"])),
      ...pick(entry, ["ok", "error", "structuredContent", "excerpt", "textAvailable", "offset", "hasMore", "nextOffset", "matchFound", "matchOffset", "pdfExport"]),
    });
    return formatPromptText(Array.isArray(result.documents)
      ? { documents: result.documents.map(entry => projectRead(record(entry))) }
      : projectRead(result));
  }
  return formatPromptText({
    ...pick(result, ["ok", "error", "action", "type", "contentSaved", "isDeleted"]),
    ...(result.document ? { document: metadata(result.document) } : pick(result, ["documentId", "fileName", "description", "revision", "isPrivate", "kind", "isPrimary"])),
    ...pick(result, ["documentLink"]),
    ...(result.ok === true && result.contentSaved === true ? {
      fileGeneration: "Content is saved. This write did not generate or deliver a PDF; PDF generation happens when downloading or preparing an application attachment.",
    } : {}),
  });
}
