import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import {
  listOperations,
  readOperation,
} from "@/lib/career/externalOperations/store";
import { executeUseBrowser, observeBrowserSession } from "@/lib/career/browser/tool";
import { z } from "zod";
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
      if (request.nextUrl.searchParams.get("viewer") === "true") liveUrl = observed.liveUrl;
      // Never expose workspace credentials, authorization message content, or provider refs to the UI.
      return NextResponse.json(
        {
          session: {
            id: session.id,
            status: session.status,
            revision: session.revision,
          },
          executions: executions.map((op) => ({
            id: op.id,
            status: op.status,
            result: op.result,
          })),
          liveUrl,
          browserAvailability: observed.browserAvailability,
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
      && !(session.result.browser_availability === "stopped" && ["idle", "human"].includes(session.status))
    ) : stored;
    const sessions = await Promise.all(candidates.map((session) => observeBrowserSession(context, session)));
    return NextResponse.json(
      {
        sessions: sessions.filter(({ session, browserAvailability }) => !activeOnly || (session.status !== "closed" && !(browserAvailability === "stopped" && ["idle", "human"].includes(session.status)))).map(({ session, browserAvailability, liveUrl }) => ({
          id: session.id,
          status: session.status,
          revision: session.revision,
          browserAvailability,
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
        action: z.enum(["handoff", "close"]),
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
