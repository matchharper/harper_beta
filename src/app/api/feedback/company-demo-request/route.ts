import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";
import { postUserFeedbackSlackMessage } from "@/lib/userFeedbackSlack";

export const runtime = "nodejs";

const MAX_FIELD_LENGTH = 2000;
const WAITLIST_TYPE_CONTACT_SALES = "contact_sales";

type CompanyDemoRequestBody = {
  name?: string;
  email?: string;
  organization?: string;
  purpose?: string;
  requestType?: string;
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

function formatCompanyDemoRequestContent({
  name,
  email,
  organization,
  purpose,
  requestType,
  pagePath,
}: {
  name: string;
  email: string;
  organization: string;
  purpose: string;
  requestType: string;
  pagePath: string;
}) {
  return [
    "📝 *Company Contact Sales Request*",
    "",
    `• *Name*: ${name}`,
    `• *Email*: ${email}`,
    `• *Company*: ${organization}`,
    `• *Type*: ${WAITLIST_TYPE_CONTACT_SALES}`,
    `• *Request Type*: ${requestType || "N/A"}`,
    `• *Page*: ${pagePath}`,
    `• *Time(Standard Korea Time)*: ${getKstTimestamp()}`,
    "",
    "*Hiring Goal / Note:*",
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
  const requestType = normalizeField(body?.requestType);
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
    requestType,
    pagePath,
  });

  const additional = [
    "Source: company-demo-request",
    `Type: ${WAITLIST_TYPE_CONTACT_SALES}`,
    `Page: ${pagePath}`,
    requestType ? `Request type: ${requestType}` : null,
    `Submitted at(KST): ${getKstTimestamp()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const payload: Database["public"]["Tables"]["harper_waitlist_company"]["Insert"] =
    {
      email,
      name,
      company: organization,
      role: requestType || null,
      needs: purpose ? [purpose] : null,
      additional,
      is_submit: true,
      status: "pending",
      type: WAITLIST_TYPE_CONTACT_SALES,
    };

  const { data, error } = await supabaseServer
    .from("harper_waitlist_company")
    .upsert(payload, { onConflict: "email" })
    .select("email")
    .maybeSingle();

  if (error || !data?.email) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save company request" },
      { status: 500 }
    );
  }

  let slackNotified = true;
  try {
    await postUserFeedbackSlackMessage({ text: content });
  } catch (slackError) {
    slackNotified = false;
    console.error("company demo request slack notify failed:", slackError);
  }

  return NextResponse.json(
    { ok: true, email: data.email, slackNotified },
    { status: 200 }
  );
}
