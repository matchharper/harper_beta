import { NextRequest, NextResponse } from "next/server";
import { getCareerLiveSessionConfig } from "@/lib/career/llm";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { insertLiveLlmUsageLog } from "@/lib/llm/usageLogging";
import { getRequestUser } from "@/lib/supabaseServer";

type LiveUsageLogBody = {
  audioSeconds?: unknown;
  conversationId?: unknown;
  kind?: unknown;
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
  if (!canUseCareerDevControls(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: LiveUsageLogBody;
  try {
    body = (await req.json()) as LiveUsageLogBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "audio" ? "audio" : "delegation";
  if (kind === "delegation" && !isRecord(body.usage)) {
    return NextResponse.json({ error: "usage is required" }, { status: 400 });
  }

  const liveConfig = getCareerLiveSessionConfig();
  const audioSeconds =
    typeof body.audioSeconds === "number" &&
    Number.isFinite(body.audioSeconds) &&
    body.audioSeconds >= 0
      ? body.audioSeconds
      : null;
  await insertLiveLlmUsageLog({
    audioSeconds,
    model:
      kind === "delegation" ? liveConfig.delegationModel : liveConfig.model,
    response: kind === "delegation" ? { usage: body.usage } : undefined,
    usageKind: kind,
    meta: {
      conversationId: cleanString(body.conversationId, 120) || null,
      responseId: cleanString(body.responseId, 120) || null,
      status: cleanString(body.status, 80) || null,
      userId: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
