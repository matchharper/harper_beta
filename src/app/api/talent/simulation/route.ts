import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  readActivityRecord,
  activityOutputMessages,
} from "@/lib/career/simulation/activityStore";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";
import { browserUseAgents } from "@/lib/career/simulation/browserUseAgents";
import { applicationBrowserPreviewSession } from "@/lib/career/simulation/applicationBrowserPreview";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let conversationId = req.nextUrl.searchParams.get("conversationId");
  const requestedMessage =
    req.nextUrl.searchParams.get("messageId") ??
    req.nextUrl.searchParams.get("sessionMessageId");
  const admin = getTalentSupabaseAdmin();
  if (requestedMessage) {
    const id = Number(requestedMessage);
    if (!Number.isSafeInteger(id) || id <= 0)
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    const { data: anchor, error } = await admin
      .from("talent_messages")
      .select("conversation_id")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle();
    if (error)
      return NextResponse.json(
        { error: "Message unavailable" },
        { status: 503 }
      );
    if (
      !anchor ||
      (conversationId && conversationId !== anchor.conversation_id)
    )
      return NextResponse.json(
        { error: "Message unavailable" },
        { status: 404 }
      );
    conversationId = anchor.conversation_id;
  }
  if (!conversationId)
    return NextResponse.json(
      { error: "Conversation required" },
      { status: 400 }
    );
  const { data: rows, error } = await admin
    .from("talent_simulate_application")
    .select("*")
    .eq("user_id", user.id)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error)
    return NextResponse.json(
      { error: "Application storage unavailable" },
      { status: 503 }
    );
  const store = { admin, userId: user.id, conversationId };
  const records = await Promise.all((rows ?? []).map((row) => readActivityRecord(row, store)));
  // Card refreshes are read-only and never schedule a browser worker.
  if (requestedMessage) {
    const record = records.find(
      (r) =>
        r.messageId === Number(requestedMessage) ||
        r.state.activity?.outputs[requestedMessage]
    );
    const output = record?.state.activity?.outputs[requestedMessage];
    if (req.nextUrl.searchParams.get("browserPreview") === "true") {
      const sessionId = applicationBrowserPreviewSession(record?.state);
      try {
        return NextResponse.json(
          { sessionId, liveUrl: sessionId ? await browserUseAgents.livePreview(sessionId) : null },
          { headers: { "Cache-Control": "private, no-store" } }
        );
      } catch {
        return NextResponse.json(
          { error: "Browser preview unavailable" },
          { status: 502, headers: { "Cache-Control": "private, no-store" } }
        );
      }
    }
    return NextResponse.json(
      {
        simulation:
          output?.messageType === "application_simulation"
            ? output.payload
            : null,
        actionSession: record ?? null,
        session: record?.state ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const current =
    records.findLast((r) => r.state.status === "active") ??
    records.at(-1) ??
    null;
  const resultIds = records.flatMap((r) =>
    r.state.browser?.resultMessageId ? [r.state.browser.resultMessageId] : []
  );
  const { data: resultMessages } = resultIds.length
    ? await admin
        .from("talent_messages")
        .select("*")
        .eq("user_id", user.id)
        .eq("conversation_id", conversationId)
        .in("id", resultIds)
    : { data: [] };
  return NextResponse.json(
    {
      session: current,
      drafts: [],
      outputs: [
        ...records.flatMap((r) => activityOutputMessages(r, store)),
        ...(resultMessages ?? []).map((row) =>
          toTalentMessageResponse(row as TalentMessageRow)
        ),
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "This saved application is read-only. Continue in chat." }, { status: 410 });
}
