import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

const FEEDBACK_SOURCE = "general-feedback";

export async function POST(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
  }

  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let content = "";
  try {
    const body = await req.json();
    content = String(body?.content ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!content) {
    return NextResponse.json({ error: "Missing feedback content" }, { status: 400 });
  }

  const { data: insertedFeedback, error: insertFeedbackError } = await supabaseServer
    .from("feedback")
    .insert({
      user_id: user.id,
      content,
      from: FEEDBACK_SOURCE,
    })
    .select("id")
    .single();

  if (insertFeedbackError || !insertedFeedback?.id) {
    return NextResponse.json(
      { error: insertFeedbackError?.message ?? "Failed to save feedback" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: insertedFeedback.id }, { status: 200 });
}
