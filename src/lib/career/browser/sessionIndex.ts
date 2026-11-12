import type { ExternalToolContext } from "../externalOperations/store";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

type SessionIndexRow = {
  id: string; status: string; updated_at: string;
  work_id: string | null; role_refs: string[] | null;
  execution_id: string | null; browser_availability: string | null;
};
type ExecutionIndexRow = {
  id: string; parent_id: string; status: string;
  requested_url: string | null; observed_url: string | null;
};

/** A discovery page, not a browser observation or a replay of prior reports. */
export async function listBrowserSessions(
  context: Pick<ExternalToolContext, "admin" | "userId" | "conversationId" | "workId">,
  input: { offset?: number; work_id?: string; role_refs?: string[] },
) {
  const offset = input.offset ?? 0;
  const pageSize = 20;
  let query = (context.admin.from as any)("talent_external_operations")
    .select("id,status,updated_at,work_id:request->>work_id,role_refs:request->role_refs,execution_id:provider_refs->>current_execution_id,browser_availability:result->>browser_availability")
    .eq("user_id", context.userId).eq("conversation_id", context.conversationId)
    .eq("kind", "browser_session");
  // Caller-owned scope cannot be broadened by model arguments.
  if (context.workId) query = query.eq("request->>work_id", context.workId);
  if (input.work_id) query = query.eq("request->>work_id", input.work_id);
  if (input.role_refs?.length) query = query.contains("request", { role_refs: input.role_refs });
  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(offset, offset + pageSize);
  if (error) throw new Error("Browser session index unavailable");
  const rows = (data ?? []) as SessionIndexRow[];
  const sessions = rows.slice(0, pageSize);
  const ids = sessions.flatMap(row => row.execution_id ? [row.execution_id] : []);
  const executions = ids.length ? await (context.admin.from as any)("talent_external_operations")
    .select("id,parent_id,status,requested_url:request->>url,observed_url:result->>url")
    .eq("user_id", context.userId).eq("conversation_id", context.conversationId)
    .eq("kind", "browser_run").in("id", ids) : { data: [], error: null };
  if (executions.error) throw new Error("Browser execution index unavailable");
  const latest = new Map<string, ExecutionIndexRow>((executions.data ?? []).map((row: ExecutionIndexRow) => [row.id, row]));
  const entries = sessions.map(row => {
    const execution = row.execution_id ? latest.get(row.execution_id) : undefined;
    return { ...row, execution: execution?.parent_id === row.id ? execution : undefined };
  });
  const nextOffset = rows.length > pageSize ? offset + pageSize : null;
  return {
    sessions: entries, nextOffset,
    modelOutput: [
      "Saved browser sessions (Asia/Seoul). Recorded states only; this list does not check live pages or establish submission. use_browser read retrieves observations for a session_id or execution_id.",
      ...entries.map(row => [
        `- session_id ${row.id}; recorded status ${row.status}; updated ${formatLlmDateTime(row.updated_at)}`,
        row.work_id ? `  work_id ${row.work_id}` : "",
        row.role_refs?.length ? `  Role references: ${row.role_refs.join(", ")}` : "",
        row.browser_availability ? `  Last recorded browser availability: ${row.browser_availability}` : "",
        row.execution_id ? `  execution_id ${row.execution_id}${row.execution ? `; recorded status ${row.execution.status}` : "; observation unavailable in this index"}` : "",
        row.execution?.requested_url ? `  Requested page: ${row.execution.requested_url}` : "",
        row.execution?.observed_url ? `  Observed page: ${row.execution.observed_url}` : "",
      ].filter(Boolean).join("\n")),
      ...(!entries.length ? ["No matching saved browser sessions."] : []),
      `Next offset: ${nextOffset ?? "none"}.`,
    ].join("\n"),
  };
}
