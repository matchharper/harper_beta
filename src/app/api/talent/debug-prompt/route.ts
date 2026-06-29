import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import {
  buildCareerTextChatDebugPrompt,
  buildCareerVoiceDebugPrompt,
  type CareerDebugPromptPayload,
} from "@/lib/career/debugPrompts";
import { sanitizeSingleLineDbText } from "@/lib/textSanitization";

export const runtime = "nodejs";

type Body = {
  conversationId?: string;
  conversationStarterId?: string;
  internalCallRequestId?: string;
  kind?: string;
  locale?: string;
};

function canUseCareerPromptDebug(user: User) {
  if (process.env.NODE_ENV !== "production") return true;

  const email = String(user.email ?? "")
    .trim()
    .toLowerCase();
  return (
    email.endsWith("@matchharper.com") ||
    email === "hyunbin.bk@gmail.com" ||
    email === "khj605123@gmail.com"
  );
}

function normalizePromptKind(value: unknown): "text" | "voice" {
  return value === "voice" ? "voice" : "text";
}

function optionalTrimmed(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function logCareerDebugPrompt(payload: CareerDebugPromptPayload) {
  const label = `[CareerPromptDebug:${payload.channel}]`;
  console.info(label, payload.summary);
  console.log(`${label} BEGIN\n${payload.renderedPrompt}\n${label} END`);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!canUseCareerPromptDebug(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const conversationId = sanitizeSingleLineDbText(body.conversationId, 80);
    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId is required" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const kind = normalizePromptKind(body.kind);
    const commonArgs = {
      admin,
      conversationId,
      conversationStarterId: optionalTrimmed(body.conversationStarterId),
      preferredLocale:
        optionalTrimmed(body.locale) ?? req.cookies.get("NEXT_LOCALE")?.value,
      userId: user.id,
    };

    const payload =
      kind === "voice"
        ? await buildCareerVoiceDebugPrompt({
            ...commonArgs,
            internalCallRequestId: optionalTrimmed(body.internalCallRequestId),
          })
        : await buildCareerTextChatDebugPrompt(commonArgs);

    logCareerDebugPrompt(payload);

    return NextResponse.json({
      ok: true,
      ...payload,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build debug prompt";
    console.error("[CareerPromptDebug] failed", {
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
