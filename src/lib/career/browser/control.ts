import { z } from "zod";
import { operationSchema, readOperation, listOperations, type ExternalOperation } from "../externalOperations/store";
import { formatBrowserSessionResult } from "./tool";
import type { WorkScope } from "../work/store";
import { publishCareerInvocations } from "../work/invocations";
import { enableSavedLogin, readSavedLogin, savedLoginProfileId } from "./savedLogin";

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
  const savedLogin = events.length ? await readSavedLogin(scope) : null;
  for (const event of events) {
    const session = await readOperation(scope, event.session_id);
    if (!session || session.conversation_id !== scope.conversationId || session.kind !== "browser_session")
      throw new Error("Browser control event unavailable");
    const executions = await listOperations(scope, { parentId: session.id });
    observations.push(formatBrowserControlReturn(session, executions, event.revision, {
      savedLoginTurnedOn: Boolean(savedLoginProfileId(savedLogin)) && savedLogin?.result.consent_session_id === session.id
        && !session.provider_refs.profile_id,
    }));
  }
  return observations.join("\n\n");
}

export function formatBrowserControlReturn(session: ExternalOperation, executions: ExternalOperation[], revision: number,
  options: { savedLoginTurnedOn?: boolean } = {}) {
  const current = executions.find(run => run.id === session.provider_refs.current_execution_id);
  const lastPage = executions.map(run => run.result.url).find((url): url is string => typeof url === "string" && /^https?:\/\//i.test(url));
  return [
    ...(options.savedLoginTurnedOn ? [
      `Before signing in, the user checked "keep me signed in for later applications" in the browser viewer, which turned saved login on and returned control to Harper (session_id ${session.id}, control revision ${revision}).`,
      `This browser started without saved login, so a sign-in in it would not be kept. A browser started now (run without session_id) begins with saved login${lastPage ? `; the page waiting for sign-in was ${lastPage}` : ""}. This browser stays open until it is closed or expires.`,
      "This is an application event, not a chat message or new authorization. The user has not signed in yet; continue the original authorized work.",
    ] : [
      `The user selected Done in the browser viewer and returned control to Harper (session_id ${session.id}, control revision ${revision}).`,
      "This is an application event, not a chat message or new authorization. Manual control ended; login, navigation and submission success have not been established by this click. Continue the original authorized work from the current page and execution evidence.",
    ]),
    ...(typeof current?.request.task === "string" ? [`Original browser task: ${current.request.task}`] : []),
    formatBrowserSessionResult(session, executions),
  ].join("\n");
}

/**
 * The viewer's "다음 지원부터 로그인 유지하기" check, made while the user controls a browser and before they sign in.
 * The check is the consent: it turns saved login on and returns control to Harper, so Harper can reopen the sign-in
 * page in a browser that keeps it (a browser keeps the login setting it started with). A browser that already started
 * with saved login, or a check after control moved on, changes nothing.
 */
export async function turnOnSavedLoginFromViewer(scope: WorkScope, sessionId: string, revision: number) {
  const session = await readOperation(scope, sessionId);
  if (!session || session.conversation_id !== scope.conversationId || session.kind !== "browser_session")
    throw new Error("Browser session unavailable");
  if (session.status !== "human" || session.revision !== revision || session.provider_refs.profile_id) return session;
  await enableSavedLogin({ ...scope, requestId: crypto.randomUUID(), controlSource: "user" }, { viewerSessionId: session.id });
  return returnBrowserControl(scope, session.id, revision);
}
