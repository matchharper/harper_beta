import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatToolError } from "@/lib/llm/toolError";
import { formatLlmDateTime, PROMPT_TIME_ZONE } from "@/lib/llm/promptDateTime";

const EVENT = "career_document_pdf_export";

/** Reuse the existing event log; document contents/revisions remain unchanged. */
export async function recordPdfExport(args: {
  admin: TalentAdminClient; userId: string; documentId: string; revision: number;
  outcome: "succeeded" | "failed"; error?: unknown; pageCount?: number;
}) {
  try {
    const { error } = await args.admin.from("logs").insert({
      user_id: args.userId, type: EVENT,
      meta_data: {
        documentId: args.documentId, revision: args.revision, outcome: args.outcome,
        ...(args.error !== undefined ? { error: formatToolError(args.error) } : {}),
        ...(args.pageCount !== undefined ? { pageCount: args.pageCount } : {}),
      },
    });
    if (error) throw error;
  } catch (error) {
    console.warn("PDF export diagnostic could not be recorded", formatToolError(error));
  }
}

export async function readPdfExportDiagnostics(args: {
  admin: TalentAdminClient; userId: string; documentIds: string[];
}) {
  const latest = new Map<string, Record<string, unknown>>();
  if (!args.documentIds.length) return latest;
  try {
    const { data, error } = await args.admin.from("logs")
      .select("created_at,meta_data").eq("user_id", args.userId).eq("type", EVENT)
      .in("meta_data->>documentId", args.documentIds)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    for (const row of data ?? []) {
      const detail = row.meta_data as Record<string, unknown> | null;
      if (!detail || typeof detail.documentId !== "string" || latest.has(detail.documentId)) continue;
      latest.set(detail.documentId, {
        revision: detail.revision, outcome: detail.outcome,
        at: formatLlmDateTime(row.created_at), timeZone: PROMPT_TIME_ZONE,
        error: detail.error == null ? undefined : formatToolError(detail.error),
        pageCount: detail.pageCount,
        // Server generation never proves receipt or saving on the user's device.
        downloadReceivedByUser: "unknown",
      });
    }
  } catch (error) {
    // A diagnostic read must not make the saved document itself unavailable.
    console.warn("PDF export diagnostics unavailable", formatToolError(error));
  }
  return latest;
}
