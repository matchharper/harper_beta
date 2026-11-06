import { z } from "zod";
import { operationSchema, readOperation, listOperations, type ExternalOperation } from "../externalOperations/store";
import { formatBrowserSessionResult } from "./tool";
import type { WorkScope } from "../work/store";
import { publishCareerInvocations } from "../work/invocations";

const controlReturnSchema = z.array(z.object({ session_id: z.string().uuid(), revision: z.number().int().positive() }));

export async function returnBrowserControl(scope: WorkScope, sessionId: string, revision: number) {
  const { data, error } = await (scope.admin.rpc as any)("return_career_browser_control", {
    p_user_id: scope.userId, p_conversation_id: scope.conversationId,
    p_session_id: sessionId, p_revision: revision,
  });
  if (error) throw error;
  const session = operationSchema.parse(data);
  // The RPC has already saved the invocation; normal recovery also republishes
  // it if queue publication or the HTTP response fails after this commit.
  await publishCareerInvocations(scope);
  return session;
}

export async function readBrowserControlReturns(scope: WorkScope, input: unknown) {
  const events = controlReturnSchema.parse(input);
  const observations: string[] = [];
  for (const event of events) {
    const session = await readOperation(scope, event.session_id);
    if (!session || session.conversation_id !== scope.conversationId || session.kind !== "browser_session")
      throw new Error("Browser control event unavailable");
    const executions = await listOperations(scope, { parentId: session.id });
    observations.push(formatBrowserControlReturn(session, executions, event.revision));
  }
  return observations.join("\n\n");
}

export function formatBrowserControlReturn(session: ExternalOperation, executions: ExternalOperation[], revision: number) {
  const current = executions.find(run => run.id === session.provider_refs.current_execution_id);
  return [
    `The user selected Done in the browser viewer and returned control to Harper (session_id ${session.id}, control revision ${revision}).`,
    "This is an application event, not a chat message or new authorization. Manual control ended; login, navigation and submission success have not been established by this click. Continue the original authorized work from the current page and execution evidence.",
    ...(typeof current?.request.task === "string" ? [`Original browser task: ${current.request.task}`] : []),
    formatBrowserSessionResult(session, executions),
  ].join("\n");
}
