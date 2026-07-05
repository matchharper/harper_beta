import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  CRISP_FEEDBACK_SOURCE,
  buildCrispThread,
  createCrispMessage,
  getRequesterFromPayload,
  normalizeCrispText,
  parseCrispFeedbackContent,
  serializeCrispFeedbackPayload,
  type CrispFeedbackPayload,
} from "@/lib/feedback/crisp";
import { sendCrispFeedbackReplyEmail } from "@/lib/feedback/crispServer";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type FeedbackRow = {
  content: string | null;
  created_at: string;
  id: number;
  user_id: string | null;
};

type ReplyBody = {
  id?: number;
  message?: string;
};

function getUserName(user: User) {
  const metadata = user.user_metadata ?? {};
  return (
    normalizeCrispText(metadata.full_name, 120) ||
    normalizeCrispText(metadata.name, 120) ||
    normalizeCrispText(metadata.display_name, 120) ||
    normalizeCrispText(user.email?.split("@")[0], 120) ||
    null
  );
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

function buildListItems(rows: FeedbackRow[]) {
  return rows
    .map((row) => {
      const payload = parseCrispFeedbackContent(row.content);
      if (!payload) return null;
      return buildCrispThread(row, payload);
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function GET(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const { data, error } = await supabaseServer
      .from("feedback")
      .select("id, created_at, user_id, content")
      .eq("from", CRISP_FEEDBACK_SOURCE)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({
      items: buildListItems((data ?? []) as FeedbackRow[]),
      ok: true,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to load feedback");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);

    let body: ReplyBody;
    try {
      body = (await req.json()) as ReplyBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const id = Number(body.id);
    const replyText = normalizeCrispText(body.message);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid feedback id" }, { status: 400 });
    }
    if (!replyText) {
      return NextResponse.json({ error: "Missing reply message" }, { status: 400 });
    }

    const row = await getFeedbackRow(id);
    if (!row) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const payload = parseCrispFeedbackContent(row.content);
    if (!payload) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const operatorEmail = normalizeCrispText(user.email, 240);
    if (!operatorEmail) {
      return NextResponse.json({ error: "Missing operator email" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const operatorName = getUserName(user);
    const replyMessage = createCrispMessage("admin", replyText, {
      email: operatorEmail,
      name: operatorName,
    });
    const nextPayload: CrispFeedbackPayload = {
      ...payload,
      emailSendError: null,
      lastRepliedAt: now,
      messages: [...payload.messages, replyMessage],
      status: "replied",
    };

    let emailError: string | null = null;
    let emailSent = false;
    const requester = getRequesterFromPayload(payload);
    if (payload.wantsEmailReply === true && requester.email) {
      try {
        await sendCrispFeedbackReplyEmail({
          feedbackId: id,
          operatorEmail,
          operatorName,
          payload: nextPayload,
          replyText,
        });
        emailSent = true;
        nextPayload.emailSentAt = now;
      } catch (error) {
        emailError =
          error instanceof Error ? error.message : "Failed to send email";
        nextPayload.emailSendError = emailError;
      }
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
        { error: error?.message ?? "Failed to save reply" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      emailError,
      emailSent,
      feedback: buildCrispThread(data as FeedbackRow, nextPayload),
      ok: true,
    });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to save reply");
  }
}
