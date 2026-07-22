import { IncomingWebhook } from "@slack/webhook";
import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

const ORG_ACCESS_REQUEST_SOURCE = "org-access-request";
const MAX_MESSAGE_LENGTH = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type OrgAccessRequestBody = {
  email?: string;
  message?: string;
  pagePath?: string;
};

function normalizeSingleLine(value: unknown, maxLength = 500) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function escapeSlackText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getOrgAccessWebhook() {
  const webhookUrl =
    process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim() ||
    process.env.SLACK_COMPANY_NOTIFICATION_TOKEN?.trim();
  if (!webhookUrl)
    throw new Error("Org access Slack webhook is not configured");
  return new IncomingWebhook(webhookUrl);
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  let body: OrgAccessRequestBody;
  try {
    body = (await req.json()) as OrgAccessRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const submittedEmail = normalizeSingleLine(body.email, 320).toLowerCase();
  const email =
    normalizeSingleLine(user?.email, 320).toLowerCase() || submittedEmail;
  const message = String(body.message ?? "")
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
  const pagePath = normalizeSingleLine(body.pagePath) || "/org";

  if (!email) {
    return NextResponse.json(
      { error: "답장받을 이메일을 입력해 주세요." },
      { status: 400 }
    );
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "이메일 형식을 확인해 주세요." },
      { status: 400 }
    );
  }
  if (!message) {
    return NextResponse.json(
      { error: "Harper 팀과 나눈 내용을 간단히 적어 주세요." },
      { status: 400 }
    );
  }

  const savedContent = [
    "[Organization Access Request]",
    `Email: ${email}`,
    `Authenticated: ${user ? "yes" : "no"}`,
    `Page: ${pagePath}`,
    "",
    message,
  ].join("\n");
  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      content: savedContent,
      from: ORG_ACCESS_REQUEST_SOURCE,
      user_id: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "접근 요청을 저장하지 못했습니다." },
      { status: 500 }
    );
  }

  try {
    await getOrgAccessWebhook().send({
      text: [
        "🔗 *Organization 초대 링크 요청*",
        "",
        `• *Email*: ${escapeSlackText(email)}`,
        `• *Authenticated*: ${user ? "yes" : "no"}`,
        `• *Page*: ${escapeSlackText(pagePath)}`,
        "• *Message*:",
        escapeSlackText(message),
      ].join("\n"),
    });
  } catch (slackError) {
    console.error("[org/access-request] Slack notification failed", slackError);
  }

  return NextResponse.json({ id: data.id, ok: true }, { status: 200 });
}
