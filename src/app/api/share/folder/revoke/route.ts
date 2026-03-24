import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import { getSupabaseAdmin } from "../_shared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const folderId = Number(body?.folderId);
    if (!Number.isFinite(folderId)) {
      return NextResponse.json({ error: "folderId required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: folder, error: folderError } = await ((supabaseAdmin.from(
      "bookmark_folder" as any
    ) as any)
      .select("id")
      .eq("id", folderId)
      .eq("user_id", user.id)
      .maybeSingle());

    if (folderError) {
      return NextResponse.json({ error: folderError.message }, { status: 500 });
    }
    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404 }
      );
    }

    const revokedAt = new Date().toISOString();
    const { error: updateError } = await ((supabaseAdmin.from(
      "bookmark_folder_share" as any
    ) as any)
      .update({
        revoked_at: revokedAt,
        updated_at: revokedAt,
      })
      .eq("folder_id", folderId)
      .eq("created_by", user.id)
      .is("revoked_at", null));

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ revoked: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
