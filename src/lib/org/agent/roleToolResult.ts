import { formatPromptText } from "@/lib/llm/promptText";
import { formatOrgAgentToolResult, formatProfessionalTalentResult, formatPromptMarkdown, formatPromptSection } from "./promptFormat";

/** Use the same external-source projection in the main and Role-writing loops. */
export function formatRoleCreationToolResult(name: string, value: unknown): string {
  const result = value as Record<string, unknown> | null;
  if (result?.error || result?.ok === false) return formatPromptText(value);
  if (name === "web_search" || name === "open_url") return formatOrgAgentToolResult(name, value);
  return formatPromptText(value);
}

export function formatRoleCalibrationToolResult(name: string, value: unknown): string {
  const result = value as Record<string, any> | null;
  if (!result || result.error || result.ok === false) return formatPromptText(value);
  if (name === "read_talent") return formatProfessionalTalentResult(value);
  if (name === "open_url") {
    const pages = Array.isArray(result.pages) ? result.pages : [];
    const failed = Array.isArray(result.failed) ? result.failed : [];
    return [
      `opened_count=${pages.length} failed_count=${failed.length}`,
      ...pages.map((page, i) => formatPromptSection(`reference_${i + 1}`, formatRoleCreationToolResult("open_url", {
        title: page.label, url: page.url, resolvedUrl: page.url,
        markdown: page.content, markdownCharCount: String(page.content ?? "").length,
        truncated: page.truncated,
      }))),
      ...(failed.length ? [formatPromptSection("failed_sources", formatPromptText(failed))] : []),
      ...(result.instruction ? [formatPromptMarkdown(result.instruction, Number.MAX_SAFE_INTEGER)] : []),
    ].join("\n");
  }
  return formatPromptText(value);
}
