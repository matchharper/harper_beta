import { NextRequest, NextResponse } from "next/server";
import { postCareerInquirySlack, saveCareerInquiry } from "@/lib/careerInquiry.server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

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

  const inquiry = {
    userId: user.id,
    title: "Career Inquiry",
    fields: [["Email", email], ["Page", pagePath]] as Array<[string, string]>,
    content,
  };
  let saved: { id: number };
  try {
    saved = await saveCareerInquiry({ ...inquiry, db: supabaseServer, source: CAREER_INQUIRY_SOURCE });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save inquiry" },
      { status: 500 }
    );
  }

  try {
    await postCareerInquirySlack(inquiry);
  } catch (slackError) {
    console.error("career inquiry slack notify failed:", slackError);
  }

  return NextResponse.json({ ok: true, id: saved.id }, { status: 200 });
}
