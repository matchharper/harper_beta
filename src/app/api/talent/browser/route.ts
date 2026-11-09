import { after, NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  listOperations,
  readOperation,
} from "@/lib/career/externalOperations/store";
import { executeUseBrowser, observeBrowserSession } from "@/lib/career/browser/tool";
import { z } from "zod";
import { returnBrowserControl } from "@/lib/career/browser/control";
import { browserSessionTitles } from "@/lib/career/browser/sessionTitles.server";
export const runtime = "nodejs";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  const context = { admin: getTalentSupabaseAdmin(), userId: user.id };
  try {
    const id = request.nextUrl.searchParams.get("sessionId");
    if (id) {
      let session = await readOperation(context, id);
      if (!session || session.kind !== "browser_session")
        return NextResponse.json(
          { error: "Browser session unavailable" },
          { status: 404, headers }
        );
      const executions = await listOperations(context, {
        parentId: session.id,
      });
      let liveUrl: string | null = null;
      const observed = await observeBrowserSession(context, session);
      session = observed.session;
      if (session.conversation_id) after(async () => {
        const { reconcileCareerDependencies } = await import("@/lib/career/work/events");
        const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
        const scope = { ...context, conversationId: session!.conversation_id! };
        await reconcileCareerDependencies(scope);
        await publishCareerInvocations(scope);
      });
      if (request.nextUrl.searchParams.get("viewer") === "true") liveUrl = observed.liveUrl;
      const titles = await browserSessionTitles(context, [session]);
      // Never expose workspace credentials, authorization message content, or provider refs to the UI.
      return NextResponse.json(
        {
          session: {
            id: session.id,
            status: session.status,
            revision: session.revision,
            title: titles.get(session.id) || undefined,
          },
          executions: executions.map((op) => ({
            id: op.id,
            status: op.status,
            result: op.result,
          })),
          liveUrl,
          browserAvailability: observed.browserAvailability,
          observationFailed: observed.observationFailed ?? false,
        },
        { headers }
      );
    }
    const conversationId = z
      .string()
      .uuid()
      .parse(request.nextUrl.searchParams.get("conversationId"));
    const stored = await listOperations(context, {
      conversationId,
      kind: "browser_session",
    });
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const candidates = activeOnly ? stored.filter((session) =>
      session.status !== "closed"
      && !(session.status === "idle" && !session.provider_refs.session_id)
      && !(session.result.browser_availability === "stopped" && session.status === "idle")
    ) : stored;
    const sessions = await Promise.all(candidates.map((session) => observeBrowserSession(context, session)));
    const titles = await browserSessionTitles(context, stored);
    const observedById = new Map(sessions.map(observed => [observed.session.id, observed]));
    after(async () => {
      const { reconcileCareerDependencies } = await import("@/lib/career/work/events");
      const { publishCareerInvocations } = await import("@/lib/career/work/invocations");
      await reconcileCareerDependencies({ ...context, conversationId });
      await publishCareerInvocations({ ...context, conversationId });
    });
    return NextResponse.json(
      {
        // History links need durable labels and terminal state even when their
        // live viewer has gone away. Do not reopen/observe historical browsers.
        summaries: stored.map(storedSession => {
          const observed = observedById.get(storedSession.id);
          const session = observed?.session ?? storedSession;
          return {
            id: session.id,
            status: session.status,
            revision: session.revision,
            title: titles.get(session.id) || undefined,
            browserAvailability: observed?.browserAvailability ?? session.result.browser_availability,
          };
        }),
        sessions: sessions.filter(({ session, browserAvailability }) => !activeOnly || (session.status !== "closed" && !(browserAvailability === "stopped" && session.status === "idle"))).map(({ session, browserAvailability, liveUrl, observationFailed }) => ({
          id: session.id,
          status: session.status,
          revision: session.revision,
          title: titles.get(session.id) || undefined,
          browserAvailability,
          observationFailed: observationFailed ?? false,
          ...(request.nextUrl.searchParams.get("viewer") === "true" ? { liveUrl } : {}),
        })),
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { error: "Browser unavailable" },
      { status: 503, headers }
    );
  }
}
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user)
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers }
    );
  try {
    const body = z
      .object({
        action: z.enum(["handoff", "resume", "close"]),
        revision: z.number().int().positive().optional(),
        sessionId: z.string().uuid(),
      })
      .parse(await request.json());
    const admin = getTalentSupabaseAdmin();
    const session = await readOperation(
      { admin, userId: user.id },
      body.sessionId
    );
    if (!session?.conversation_id || session.kind !== "browser_session")
      return NextResponse.json(
        { error: "Browser session unavailable" },
        { status: 404, headers }
      );
    if (body.action === "resume") {
      if (body.revision === undefined) return NextResponse.json({ error: "Browser revision required" }, { status: 400, headers });
      const returned = await returnBrowserControl({ admin, userId: user.id, conversationId: session.conversation_id }, session.id, body.revision);
      return NextResponse.json({ status: returned.status }, { headers });
    }
    const result = await executeUseBrowser(
      { action: body.action, session_id: body.sessionId },
      {
        admin,
        userId: user.id,
        conversationId: session.conversation_id,
        requestId: crypto.randomUUID(),
        controlSource: "user",
      }
    );
    return NextResponse.json({ status: result.session?.status }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Browser action could not be completed" },
      { status: 409, headers }
    );
  }
}
