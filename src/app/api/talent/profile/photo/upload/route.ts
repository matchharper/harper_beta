import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";

const CAREER_PROFILE_PHOTO_BUCKET = "company_logo";
const MAX_PROFILE_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;

  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/svg+xml") return "svg";
  return "img";
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

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are supported" },
        { status: 400 }
      );
    }

    if (file.size > MAX_PROFILE_PHOTO_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Profile image must be 5MB or smaller" },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(file.name?.trim() || "profile");
    const safeBaseName = safeName.replace(/\.[^.]+$/, "") || "profile";
    const extension = getFileExtension(file);
    const storagePath = `career-profile/photo/${user.id}/${Date.now()}_${safeBaseName}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const admin = getTalentSupabaseAdmin();

    const { error: uploadError } = await admin.storage
      .from(CAREER_PROFILE_PHOTO_BUCKET)
      .upload(storagePath, buffer, {
        upsert: false,
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload profile image" },
        { status: 500 }
      );
    }

    const { data } = admin.storage
      .from(CAREER_PROFILE_PHOTO_BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      ok: true,
      bucket: CAREER_PROFILE_PHOTO_BUCKET,
      profileImageUrl: data.publicUrl,
      storagePath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to upload profile image";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
