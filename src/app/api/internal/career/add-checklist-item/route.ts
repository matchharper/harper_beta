import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getTalentSupabaseAdmin,
  normalizeTalentInsightKey,
  addCustomChecklistItem,
} from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireInternalApiUser(req);

    const body = await req.json();
    const { key, label, promptHint } = body as {
      key?: unknown;
      label?: unknown;
      promptHint?: unknown;
    };

    if (typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { error: "key is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (!/^[a-z0-9_]+$/.test(key.trim())) {
      return NextResponse.json(
        { error: "key must be English snake_case (lowercase letters, numbers, underscores only)" },
        { status: 400 }
      );
    }

    if (typeof label !== "string" || !label.trim()) {
      return NextResponse.json(
        { error: "label is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    const normalizedKey = normalizeTalentInsightKey(key.trim());
    if (!normalizedKey) {
      return NextResponse.json(
        { error: "key could not be normalized to a valid insight key" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();
    const item = await addCustomChecklistItem({
      admin,
      key: normalizedKey,
      label: label.trim(),
      promptHint: typeof promptHint === "string" && promptHint.trim() ? promptHint.trim() : undefined,
      createdBy: user.email ?? user.id,
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("duplicate") ||
        error.message.includes("unique") ||
        error.message.includes("already exists"))
    ) {
      return NextResponse.json(
        { error: "A checklist item with this key already exists" },
        { status: 409 }
      );
    }
    return toInternalApiErrorResponse(error, "Failed to add checklist item");
  }
}
