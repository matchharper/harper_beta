import { NextRequest, NextResponse } from "next/server";
import {
  CRISP_FEEDBACK_SOURCE,
  buildCrispThread,
  createCrispMessage,
  isValidCrispEmail,
  normalizeCrispText,
  parseCrispFeedbackContent,
  serializeCrispFeedbackPayload,
  type CrispFeedbackPayload,
} from "@/lib/feedback/crisp";
import { notifyCrispFeedbackSlack } from "@/lib/feedback/crispServer";
import { isInternalEmail } from "@/lib/internalAccess";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type PatchCrispFeedbackBody = {
  content?: string;
  deleteFromMessageId?: string;
  guestEmail?: string;
  guestName?: string;
  token?: string;
  wantsEmailReply?: boolean;
};

type FeedbackRow = {
  content: string | null;
  created_at: string;
  id: number;
  user_id: string | null;
};

async function readRouteId(context: RouteContext) {
  const params = await context.params;
  const id = Number(params.id);
  return Number.isFinite(id) ? id : null;
}

async function getFeedbackRow(id: number) {
  const { data, error } = await supabaseServer
    .from("feedback")
    .select("id, created_at, user_id, content")
    .eq("from", CRISP_FEEDBACK_SOURCE)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data as FeedbackRow | null;
}

async function isAuthorizedForPayload({
  bodyToken,
  payload,
  req,
}: {
  bodyToken?: string | null;
  payload: CrispFeedbackPayload;
  req: NextRequest;
}) {
  const queryToken = req.nextUrl.searchParams.get("token");
  const token = normalizeCrispText(bodyToken ?? queryToken, 200);
  if (token && token === payload.token) {
    return true;
  }

  const user = await getRequestUser(req);
  if (!user) return false;
  if (isInternalEmail(user.email)) return true;
  return Boolean(payload.userId && payload.userId === user.id);
}

function rowNotFoundResponse() {
  return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const id = await readRouteId(context);
  if (!id) {
    return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
  }

  const row = await getFeedbackRow(id);
  if (!row) return rowNotFoundResponse();

  const payload = parseCrispFeedbackContent(row.content);
  if (!payload) return rowNotFoundResponse();

  const authorized = await isAuthorizedForPayload({ payload, req });
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    feedback: buildCrispThread(row, payload),
    ok: true,
  });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const id = await readRouteId(context);
  if (!id) {
    return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
  }

  let body: PatchCrispFeedbackBody;
  try {
    body = (await req.json()) as PatchCrispFeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const row = await getFeedbackRow(id);
  if (!row) return rowNotFoundResponse();

  const payload = parseCrispFeedbackContent(row.content);
  if (!payload) return rowNotFoundResponse();

  const authorized = await isAuthorizedForPayload({
    bodyToken: body.token,
    payload,
    req,
  });
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  const nextPayload: CrispFeedbackPayload = { ...payload };
  let shouldNotifySlack = false;
  let appendedMessage = null as ReturnType<typeof createCrispMessage> | null;
  let deletedMessages = false;

  const content = normalizeCrispText(body.content);
  if (content) {
    appendedMessage = createCrispMessage("user", content, {
      email: payload.userEmail ?? payload.guestEmail ?? null,
      name: payload.userName ?? payload.guestName ?? null,
    });
    nextPayload.messages = [...payload.messages, appendedMessage];
    nextPayload.status = "open";
    nextPayload.lastSlackNotifiedAt = now;
    shouldNotifySlack = true;
  }

  const deleteFromMessageId = normalizeCrispText(body.deleteFromMessageId, 200);
  if (deleteFromMessageId) {
    const deleteFromIndex = nextPayload.messages.findIndex(
      (message) => message.id === deleteFromMessageId
    );
    const targetMessage = nextPayload.messages[deleteFromIndex];

    if (deleteFromIndex < 0 || targetMessage?.role !== "user") {
      return NextResponse.json(
        { error: "Message not found" },
        { status: 404 }
      );
    }

    nextPayload.messages = nextPayload.messages.map((message, index) =>
      index >= deleteFromIndex
        ? {
            ...message,
            deletedAt: message.deletedAt ?? now,
            deletedBy: message.deletedBy ?? "user",
          }
        : message
    );
    deletedMessages = true;
  }

  const guestName = normalizeCrispText(body.guestName, 120);
  const guestEmail = normalizeCrispText(body.guestEmail, 240);
  if (guestEmail && !isValidCrispEmail(guestEmail)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  if (guestName || guestEmail) {
    nextPayload.guestName = guestName || nextPayload.guestName || null;
    nextPayload.guestEmail = guestEmail || nextPayload.guestEmail || null;
    nextPayload.identityProvidedAt = now;
  }

  if (typeof body.wantsEmailReply === "boolean") {
    nextPayload.wantsEmailReply = body.wantsEmailReply;
    nextPayload.emailReplyAnsweredAt = now;
    nextPayload.emailReplyAskedAt = nextPayload.emailReplyAskedAt ?? now;
  }

  if (
    !content &&
    !deletedMessages &&
    !guestName &&
    !guestEmail &&
    typeof body.wantsEmailReply !== "boolean"
  ) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("feedback")
    .update({
      content: serializeCrispFeedbackPayload(nextPayload),
    })
    .eq("from", CRISP_FEEDBACK_SOURCE)
    .eq("id", id)
    .select("id, created_at, user_id, content")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to update feedback" },
      { status: 500 }
    );
  }

  if (shouldNotifySlack && appendedMessage) {
    try {
      await notifyCrispFeedbackSlack({
        authenticated: Boolean(nextPayload.userId),
        feedbackId: id,
        message: appendedMessage,
        payload: nextPayload,
        req,
      });
    } catch (slackError) {
      console.error("crisp feedback slack notify failed:", slackError);
    }
  }

  return NextResponse.json({
    feedback: buildCrispThread(data, nextPayload),
    ok: true,
  });
}
