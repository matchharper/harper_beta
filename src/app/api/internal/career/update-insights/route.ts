import { NextRequest, NextResponse } from "next/server";
import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import {
  getTalentSupabaseAdmin,
  fetchTalentInsights,
  upsertTalentInsights,
} from "@/lib/talentOnboarding/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);

    const body = await req.json();
    const { userId, updates } = body as {
      userId?: unknown;
      updates?: unknown;
    };

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
      return NextResponse.json(
        { error: "updates must be a non-empty object of key-value pairs" },
        { status: 400 }
      );
    }

    const admin = getTalentSupabaseAdmin();

    // Fetch existing content
    const existing = await fetchTalentInsights({ admin, userId });
    const currentContent = {
      ...((existing?.content as Record<string, string> | null) ?? {}),
    };

    // Apply updates (overwrite specified keys)
    for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
      if (typeof value === "string") {
        currentContent[key] = value;
      }
    }

    // Upsert full content
    await upsertTalentInsights({ admin, userId, content: currentContent });

    return NextResponse.json({ ok: true, insights: currentContent });
  } catch (error) {
    return toInternalApiErrorResponse(error, "Failed to update insights");
  }
}
