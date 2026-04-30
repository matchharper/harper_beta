import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";
import { notifySlack } from "../../hello/utils";

const CAREER_INQUIRY_SOURCE = "career-inquiry";

type CareerInquiryBody = {
  email?: string;
  content?: string;
  pagePath?: string;
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CareerInquiryBody;
  try {
    body = (await req.json()) as CareerInquiryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body?.email ?? user.email ?? "").trim();
  const content = String(body?.content ?? "").trim();
  const pagePath = String(body?.pagePath ?? "").trim() || "/career";

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

  const savedContent = `[Career Inquiry]\nUser ID: ${user.id}\nEmail: ${email}\nPage: ${pagePath}\n\n${content}`;

  const { data, error } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: user.id,
      content: savedContent,
      from: CAREER_INQUIRY_SOURCE,
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
    await notifySlack(`✉️ *Career Inquiry*

• *User ID*: ${user.id}
• *Email*: ${email}
• *Page*: ${pagePath}
• *Content*: ${content}
• *Time(Standard Korea Time)*: ${new Date().toLocaleString("ko-KR")}`);
  } catch (slackError) {
    console.error("career inquiry slack notify failed:", slackError);
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}
