import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  CRISP_FEEDBACK_KIND,
  CRISP_FEEDBACK_SOURCE,
  buildCrispThread,
  createCrispId,
  createCrispMessage,
  isValidCrispEmail,
  normalizeCrispText,
  serializeCrispFeedbackPayload,
  type CrispFeedbackPayload,
} from "@/lib/feedback/crisp";
import { notifyCrispFeedbackSlack } from "@/lib/feedback/crispServer";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type CreateCrispFeedbackBody = {
  content?: string;
  guestEmail?: string;
  guestName?: string;
  locale?: string;
  pagePath?: string;
  wantsEmailReply?: boolean | null;
};

function getUserName(user: User | null) {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  return (
    normalizeCrispText(metadata.full_name, 120) ||
    normalizeCrispText(metadata.name, 120) ||
    normalizeCrispText(metadata.display_name, 120) ||
    normalizeCrispText(user.email?.split("@")[0], 120) ||
    null
  );
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);

  let body: CreateCrispFeedbackBody;
  try {
    body = (await req.json()) as CreateCrispFeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = normalizeCrispText(body?.content);
  const pagePath = normalizeCrispText(body?.pagePath, 500) || "/";
  const locale = normalizeCrispText(body?.locale, 16) || null;
  const guestName = normalizeCrispText(body?.guestName, 120) || null;
  const guestEmail = normalizeCrispText(body?.guestEmail, 240) || null;

  if (!content) {
    return NextResponse.json({ error: "Missing content" }, { status: 400 });
  }

  if (guestEmail && !isValidCrispEmail(guestEmail)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const userName = getUserName(user);
  const userEmail = normalizeCrispText(user?.email, 240) || null;
  const message = createCrispMessage("user", content, {
    email: userEmail ?? guestEmail,
    name: userName ?? guestName,
  });
  const payload: CrispFeedbackPayload = {
    emailReplyAskedAt: user ? now : null,
    emailReplyAnsweredAt: null,
    guestEmail,
    guestName,
    identityRequestedAt: user ? null : now,
    kind: CRISP_FEEDBACK_KIND,
    lastSlackNotifiedAt: now,
    locale,
    messages: [message],
    pagePath,
    status: "open",
    token: createCrispId("thread"),
    userEmail,
    userId: user?.id ?? null,
    userName,
    version: 1,
    wantsEmailReply:
      typeof body?.wantsEmailReply === "boolean" ? body.wantsEmailReply : null,
  };

  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      content: serializeCrispFeedbackPayload(payload),
      from: CRISP_FEEDBACK_SOURCE,
      user_id: user?.id ?? null,
    })
    .select("id, created_at, user_id, content")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save feedback" },
      { status: 500 }
    );
  }

  try {
    await notifyCrispFeedbackSlack({
      authenticated: Boolean(user),
      feedbackId: data.id,
      message,
      payload,
      req,
    });
  } catch (slackError) {
    console.error("crisp feedback slack notify failed:", slackError);
  }

  return NextResponse.json({
    feedback: buildCrispThread(data, payload),
    ok: true,
    token: payload.token,
  });
}
