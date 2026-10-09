import { after } from "next/server";
import { runApplicationBrowser } from "@/lib/career/simulation/applicationBrowserServer";
import { enqueueApplicationBrowser } from "@/lib/career/simulation/applicationBrowserQueue";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";
import {
  activityRecord,
  activityOutputMessages,
  activityOperation,
} from "@/lib/career/simulation/activityStore";
import {
  executePreparationRequest,
  preparationRequestSchema,
} from "@/lib/career/simulation/preparationService";
export const maxDuration = 300;
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/admin";

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
  const store = { userId: user.id, conversationId };
  const records = (rows ?? []).map((row) => activityRecord(row, store));
  // Card refreshes are read-only and never schedule a browser worker.
  if (requestedMessage) {
    const record = records.find(
      (r) =>
        r.messageId === Number(requestedMessage) ||
        r.state.activity?.outputs[requestedMessage]
    );
    const output = record?.state.activity?.outputs[requestedMessage];
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
  let active = records.findLast((r) => r.state.status === "active");
  if (active) {
    const refreshed = await activityOperation({
      ...store,
      admin,
      operation: "touch",
      messageId: active.messageId,
    });
    if (refreshed) {
      records[records.indexOf(active)] = refreshed;
      active = refreshed;
    }
  }
  const browser = active?.state.browser;
  if (
    active?.state.status === "active" &&
    browser &&
    !browser.resultMessageId &&
    browser.status !== "waiting" &&
    browser.status !== "cancelled" &&
    (!browser.leaseUntil || Date.parse(browser.leaseUntil) < Date.now())
  ) {
    if (process.env.NODE_ENV === "development")
      after(() => runApplicationBrowser({ ...store, admin }, active.messageId));
    else
      after(() =>
        enqueueApplicationBrowser(
          user.id,
          conversationId,
          active.messageId,
          active.state.revision
        )
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
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = preparationRequestSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = parsed.data;
  const admin = getTalentSupabaseAdmin();
  const { data: conversation } = await admin
    .from("talent_conversations")
    .select("id")
    .eq("id", input.conversationId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!conversation)
    return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  // Flush committed responses and the generation claim before awaiting the model.
  // The same request owns generation; retries remain guarded by the session revision/run ID.
  let disconnected = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const publish = (event: unknown) => {
        if (disconnected) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          disconnected = true;
        }
      };
      try {
        const result = await executePreparationRequest(
          { admin, userId: user.id, conversationId: input.conversationId },
          input,
          undefined,
          (session) =>
            publish({
              session: { messageId: session.messageId, state: session.state },
            })
        );
        publish({
          session: result
            ? { messageId: result.messageId, state: result.state }
            : null,
          done: true,
        });
      } catch (error) {
        console.error("[preparation] request failed", error);
        publish({
          error: "Unable to update preparation. Refresh its state and retry.",
        });
      } finally {
        if (!disconnected) controller.close();
      }
    },
    cancel() {
      disconnected = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
