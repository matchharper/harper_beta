import {
  requireInternalApiUser,
  toInternalApiErrorResponse,
} from "@/lib/internalApi";
import { getTalentSupabaseAdmin } from "@/lib/talentOnboarding/server";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BLOG_ASSET_BUCKET = "files";
const MAX_THUMBNAIL_BYTES = 8 * 1024 * 1024;
const THUMBNAIL_MIME_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

function getFileExtension(file: File) {
  return THUMBNAIL_MIME_TYPES.get(file.type.toLowerCase()) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    await requireInternalApiUser(req);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "썸네일 이미지 파일을 선택해 주세요." },
        { status: 400 }
      );
    }

    const extension = getFileExtension(file);
    if (!extension) {
      return NextResponse.json(
        { error: "PNG, JPG, WebP, AVIF 이미지만 업로드할 수 있습니다." },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_THUMBNAIL_BYTES) {
      return NextResponse.json(
        { error: "썸네일 이미지는 8MB 이하여야 합니다." },
        { status: 400 }
      );
    }

    const now = new Date();
    const storagePath = [
      "blog",
      "thumbnails",
      String(now.getUTCFullYear()),
      `${randomUUID()}.${extension}`,
    ].join("/");
    const admin = getTalentSupabaseAdmin();
    const { error: uploadError } = await admin.storage
      .from(BLOG_ASSET_BUCKET)
      .upload(storagePath, Buffer.from(await file.arrayBuffer()), {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw new Error(uploadError.message);

    const { data } = admin.storage
      .from(BLOG_ASSET_BUCKET)
      .getPublicUrl(storagePath);

    return NextResponse.json({
      bucket: BLOG_ASSET_BUCKET,
      ok: true,
      storagePath,
      thumbnailUrl: data.publicUrl,
    });
  } catch (error) {
    return toInternalApiErrorResponse(
      error,
      "썸네일 이미지를 업로드하지 못했습니다."
    );
  }
}
