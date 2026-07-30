import { NextRequest, NextResponse } from "next/server";
import {
  isHarperSlackAppId,
  verifyHarperSlackSignature,
} from "@/lib/org/slackHarper";
import { queueHarperSlackEvent } from "@/lib/org/slackHarperEvents";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") ?? "";
  const signature = req.headers.get("x-slack-signature") ?? "";
  if (!verifyHarperSlackSignature(rawBody, timestamp, signature))
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let body: Record<string, any>;
  try {
    body = JSON.parse(rawBody) as Record<string, any>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.type === "url_verification")
    return NextResponse.json({ challenge: body.challenge });
  if (!isHarperSlackAppId(body.api_app_id))
    return NextResponse.json({ error: "wrong_app" }, { status: 403 });

  try {
    await queueHarperSlackEvent(body);
  } catch (error) {
    console.error("[harper-slack/events]", error);
    return NextResponse.json({ error: "queue_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
