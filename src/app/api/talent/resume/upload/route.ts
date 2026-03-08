import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  TALENT_RESUME_BUCKET,
  getTalentResumeSignedUrl,
  getTalentSupabaseAdmin,
} from "@/lib/talentOnboarding/server";

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    const admin = getTalentSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from(TALENT_RESUME_BUCKET)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
