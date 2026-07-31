import { NextRequest, NextResponse } from "next/server";
import { getCareerRealtimeSessionConfig } from "@/lib/career/llm";
import {
  insertRealtimeLlmUsageLog,
  normalizeRealtimeBillingUsage,
} from "@/lib/llm/usageLogging";
import { getRequestUser } from "@/lib/supabaseServer";

type RealtimeUsageLogBody = {
  billing?: unknown;
  conversationId?: unknown;
  eventType?: unknown;
  hadAudioInResponse?: unknown;
  responseId?: unknown;
  status?: unknown;
  usage?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RealtimeUsageLogBody;
  try {
    body = (await req.json()) as RealtimeUsageLogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const billing = normalizeRealtimeBillingUsage(body.billing);
  if (!isRecord(body.usage) && !billing) {
    return NextResponse.json(
      { error: "usage or billing is required" },
      { status: 400 }
    );
  }

  const realtimeConfig = getCareerRealtimeSessionConfig({
    userCreatedAt: user.created_at,
    userId: user.id,
  });
  await insertRealtimeLlmUsageLog({
    model: realtimeConfig.model,
    response: {
      usage: body.usage ?? {},
    },
    billing,
    meta: {
      conversationId: cleanString(body.conversationId, 120) || null,
      eventType: cleanString(body.eventType, 80) || "response.done",
      hadAudioInResponse:
        typeof body.hadAudioInResponse === "boolean"
          ? body.hadAudioInResponse
          : null,
      provider: realtimeConfig.provider,
      responseId: cleanString(body.responseId, 120) || null,
      status: cleanString(body.status, 80) || null,
      userId: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
