import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { notifySlack } from "../../hello/utils";

const NETWORK_INQUIRY_SOURCE = "network-inquiry";

type NetworkInquiryBody = {
  email?: string;
  content?: string;
  pagePath?: string;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(req: NextRequest) {
  let body: NetworkInquiryBody;
  try {
    body = (await req.json()) as NetworkInquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const pagePath = String(body?.pagePath ?? "").trim() || "/network";

  if (!email) {
    return NextResponse.json(
      { error: "Missing inquiry email" },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Invalid inquiry email" },
      { status: 400 }
    );
  }

  if (!content) {
    return NextResponse.json(
      { error: "Missing inquiry content" },
      { status: 400 }
    );
  }

  const savedContent = `[Network Inquiry]\nEmail: ${email}\nPage: ${pagePath}\n\n${content}`;

  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: null,
      content: savedContent,
      from: NETWORK_INQUIRY_SOURCE,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to save inquiry" },
      { status: 500 }
    );
  }

  try {
    await notifySlack(`✉️ *Network Inquiry*

• *Email*: ${email}
• *Page*: ${pagePath}
• *Content*: ${content}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
  } catch (slackError) {
    console.error("network inquiry slack notify failed:", slackError);
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
