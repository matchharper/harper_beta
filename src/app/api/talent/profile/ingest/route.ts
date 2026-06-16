import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  ensureTalentUserRecord,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";
import { ingestTalentProfileFromLinkedin } from "@/lib/talentOnboarding/profileIngestion";
import { logger } from "@/utils/logger";
import {
  sanitizeMultilineDbText,
  sanitizeSingleLineDbText,
} from "@/lib/textSanitization";

export const runtime = "nodejs";
export const maxDuration = 240;

type Body = {
  links?: string[];
  resumeText?: string;
  resumeFileName?: string;
  resumeStoragePath?: string;
};

export async function POST(req: NextRequest) {
  let admin: ReturnType<typeof getTalentSupabaseAdmin> | null = null;
  let logMetadata: Record<string, unknown> | undefined;
  let userId: string | null = null;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const body = (await req.json()) as Body;
    const links = (body.links ?? [])
      .map((link) => sanitizeSingleLineDbText(link, 2000) ?? "")
      .filter(Boolean);
    const resumeText = sanitizeMultilineDbText(body.resumeText, 24000);
    const resumeFileName = sanitizeSingleLineDbText(body.resumeFileName, 240);
    const resumeStoragePath = sanitizeSingleLineDbText(
      body.resumeStoragePath,
      2000
    );

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

    logMetadata = {
      hasLinkedin: true,
      hasResumeFile: Boolean(resumeFileName || resumeStoragePath),
      hasResumeText: Boolean(resumeText),
      linkCount: links.length,
      resumeFileName,
    };

    logger.log("[TalentIngestAPI] request", {
      userId: user.id,
      linkCount: links.length,
      hasResumeText: Boolean(resumeText),
    });

    admin = getTalentSupabaseAdmin();
    await ensureTalentUserRecord({ admin, user });

    const result = await ingestTalentProfileFromLinkedin({
      admin,
      userId: user.id,
      links,
      resumeText,
      resumeFileName,
      resumeStoragePath,
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
    if (admin && userId) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error,
        stage: "profile_ingest",
        userId,
        metadata: logMetadata,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
