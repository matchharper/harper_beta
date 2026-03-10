import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import { logger } from "@/utils/logger";

export const runtime = "nodejs";

type Body = {
  links?: string[];
  resumeText?: string;
  resumeFileName?: string;
  resumeStoragePath?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    const links = (body.links ?? [])
      .map((link) => String(link ?? "").trim())
      .filter(Boolean);

    if (links.length === 0) {
      return NextResponse.json(
        { error: "At least one link is required" },
        { status: 400 }
      );
    }
    if (!links.some((link) => /linkedin\.com\/in\//i.test(link))) {
      return NextResponse.json(
        { error: "A LinkedIn profile link is required in links" },
        { status: 400 }
      );
    }

    logger.log("[TalentIngestAPI] request", {
      userId: user.id,
      linkCount: links.length,
      hasResumeText: Boolean(body.resumeText?.trim()),
    });

    const admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const result = await ingestTalentProfileFromLinkedin({
      admin,
      userId: user.id,
      links,
      resumeText: body.resumeText ?? null,
      resumeFileName: body.resumeFileName ?? null,
      resumeStoragePath: body.resumeStoragePath ?? null,
    });

    return NextResponse.json({
      ok: true,
      ingestion: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to ingest talent profile";
    logger.log("[TalentIngestAPI] error", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
