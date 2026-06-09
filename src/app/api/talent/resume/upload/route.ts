import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_RESUME_BUCKET,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";
import { insertTalentProfileSourceErrorLog } from "@/lib/talentOnboarding/errorLogs";

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function POST(req: NextRequest) {
  let admin: ReturnType<typeof getTalentSupabaseAdmin> | null = null;
  let userId: string | null = null;

  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const originalName = file.name?.trim() || "resume";
    const safeName = sanitizeFileName(originalName);
    const storagePath = `${user.id}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    admin = getTalentSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from(TALENT_RESUME_BUCKET)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error: uploadError,
        stage: "resume_upload",
        userId,
        metadata: {
          bucket: TALENT_RESUME_BUCKET,
          contentType: file.type || null,
          fileName: originalName,
          fileSize: file.size,
        },
      });
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload resume" },
        { status: 500 }
      );
    }

    const resumeDownloadUrl = await getTalentResumeSignedUrl({
      admin,
      storagePath,
    });

    return NextResponse.json({
      ok: true,
      resumeFileName: originalName,
      resumeStoragePath: storagePath,
      resumeDownloadUrl,
      bucket: TALENT_RESUME_BUCKET,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload resume";
    if (admin && userId) {
      await insertTalentProfileSourceErrorLog({
        admin,
        error,
        stage: "resume_upload_unhandled",
        userId,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
