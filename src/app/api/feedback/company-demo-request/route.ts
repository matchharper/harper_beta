import { IncomingWebhook } from "@slack/webhook";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const COMPANY_DEMO_REQUEST_SOURCE = "company-demo-request";
const MAX_FIELD_LENGTH = 2000;

type CompanyDemoRequestBody = {
  name?: string;
  email?: string;
  organization?: string;
  purpose?: string;
  pagePath?: string;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function normalizeField(value: unknown) {
  return String(value ?? "")
    .trim()
    .slice(0, MAX_FIELD_LENGTH);
}

function getKstTimestamp() {
  return new Date().toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}

function getInternalSlackWebhook() {
  const webhookUrl = process.env.SLACK_INTERNAL_NOTI_TOKEN?.trim();
  if (!webhookUrl) {
    throw new Error("SLACK_INTERNAL_NOTI_TOKEN is required");
  }

  return new IncomingWebhook(webhookUrl);
}

function formatCompanyDemoRequestContent({
  name,
  email,
  organization,
  purpose,
  pagePath,
}: {
  name: string;
  email: string;
  organization: string;
  purpose: string;
  pagePath: string;
}) {
  return [
    "[Company Demo Request]",
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${organization}`,
    `Page: ${pagePath}`,
    `Time(Standard Korea Time): ${getKstTimestamp()}`,
    "",
    "Purpose:",
    purpose,
  ].join("\n");
}

export async function POST(req: NextRequest) {
  let body: CompanyDemoRequestBody;
  try {
    body = (await req.json()) as CompanyDemoRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = normalizeField(body?.name);
  const email = normalizeField(body?.email);
  const organization = normalizeField(body?.organization);
  const purpose = normalizeField(body?.purpose);
  const pagePath = normalizeField(body?.pagePath) || "/company";

  if (!name) {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  if (!organization) {
    return NextResponse.json({ error: "Missing company" }, { status: 400 });
  }

  if (!purpose) {
    return NextResponse.json({ error: "Missing purpose" }, { status: 400 });
  }

  const content = formatCompanyDemoRequestContent({
    name,
    email,
    organization,
    purpose,
    pagePath,
  });

  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: null,
      content,
      from: COMPANY_DEMO_REQUEST_SOURCE,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save meeting request" },
      { status: 500 }
    );
  }

  try {
    await getInternalSlackWebhook().send({ text: content });
  } catch (slackError) {
    console.error("company demo request slack notify failed:", slackError);
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
