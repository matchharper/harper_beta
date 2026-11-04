import type { WorkScope } from "./store";
import { executeUseBrowser } from "../browser/tool";

/** Browser lifetime belongs to the provider; waiting work owns no idle browser. */
export async function releaseWorkBrowsers(scope: WorkScope, workId: string, cancel = false) {
  const { data, error } = await (scope.admin.from as any)("talent_external_operations")
    .select("id,status").eq("user_id", scope.userId).eq("conversation_id", scope.conversationId)
    .eq("kind", "browser_session").eq("request->>work_id", workId).neq("status", "closed");
  if (error) throw error;
  for (const session of data ?? []) {
    // Human-operated login keeps its short provider lease; a running task must
    // be observed before release. Cancellation uses the existing remote control.
    if (!cancel && session.status !== "idle") continue;
    const result = await executeUseBrowser({ action: cancel ? "close" : "release", session_id: session.id },
      { ...scope, workId, requestId: `work-cleanup:${workId}:${session.id}`, deadlineAt: Date.now() });
    if (cancel && result.session?.status !== "closed") throw new Error("Browser cancellation is not yet confirmed");
  }
}
