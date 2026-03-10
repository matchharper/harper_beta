import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, supabaseServer } from "@/lib/supabaseServer";

const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";

type LaunchBody = {
  queryId?: string;
  messageId?: number;
};

function parseLocaleFromRequest(req: NextRequest): "ko" | "en" {
  const locale = req.cookies.get("NEXT_LOCALE")?.value;
  return locale === "en" ? "en" : "ko";
}

function extractUiJsonFromMessage(content: string): any | null {
  if (!content) return null;

  const start = content.lastIndexOf(UI_START);
  const end = content.lastIndexOf(UI_END);

  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = content.slice(start + UI_START.length, end).trim();
  if (!jsonText) return null;

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: LaunchBody;
  try {
    body = (await req.json()) as LaunchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const queryId = String(body.queryId ?? "").trim();
  const messageId = Number(body.messageId);

  if (!queryId || !Number.isFinite(messageId)) {
    return NextResponse.json(
      { error: "Missing queryId or messageId" },
      { status: 400 }
    );
  }

  const { data: queryRow, error: queryError } = await supabaseServer
    .from("queries")
    .select("query_id")
    .eq("query_id", queryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (queryError) {
    return NextResponse.json(
      { error: queryError.message ?? "Failed to load query" },
      { status: 500 }
    );
  }
  if (!queryRow) {
    return NextResponse.json({ error: "Query not found" }, { status: 404 });
  }

  const { data: messageRow, error: messageError } = await supabaseServer
    .from("messages")
    .select("id, content")
    .eq("id", messageId)
    .eq("query_id", queryId)
    .maybeSingle();

  if (messageError) {
    return NextResponse.json(
      { error: messageError.message ?? "Failed to load message" },
      { status: 500 }
    );
  }
  if (!messageRow?.content) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const parsed = extractUiJsonFromMessage(messageRow.content);
  if (!parsed || !Array.isArray(parsed.criteria)) {
    return NextResponse.json(
      { error: "No criteria parsed from message" },
      { status: 400 }
    );
  }

  const locale = parseLocaleFromRequest(req);
  const { data: runRow, error: runError } = await supabaseServer
    .from("runs")
    .insert({
      query_id: queryId,
      message_id: messageId,
      criteria: parsed.criteria,
      query_text: String(parsed.thinking ?? ""),
      user_id: user.id,
      status: "queued", // 여기서 queued_test를 넣어서 테스트
      locale,
    })
    .select("id")
    .single();

  if (runError || !runRow?.id) {
    return NextResponse.json(
      { error: runError?.message ?? "Failed to create run" },
      { status: 500 }
    );
  }

  return NextResponse.json({ runId: runRow.id }, { status: 200 });
}
