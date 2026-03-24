import { NextRequest, NextResponse } from "next/server";
import { getRequestUser } from "@/lib/supabaseServer";
import {
  getBaseUrl,
  getSupabaseAdmin,
  makeFolderShareToken,
} from "../_shared";

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
      .select("id, name, user_id")
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

    const nowIso = new Date().toISOString();
    const { data: shares, error: shareError } = await ((supabaseAdmin.from(
      "bookmark_folder_share" as any
    ) as any)
      .select("id, token, expires_at, revoked_at")
      .eq("folder_id", folderId)
      .eq("created_by", user.id)
      .order("created_at", { ascending: false }));

    if (shareError) {
      return NextResponse.json({ error: shareError.message }, { status: 500 });
    }

    const activeShare = (shares ?? []).find((row: any) => {
      if (row?.revoked_at) return false;
      if (!row?.expires_at) return true;
      return new Date(row.expires_at).getTime() >= Date.now();
    });

    const baseUrl = getBaseUrl(req);
    if (activeShare?.token) {
      return NextResponse.json({
        token: activeShare.token,
        url: `${baseUrl}/share/folder/${activeShare.token}`,
        reused: true,
      });
    }

    const token = makeFolderShareToken();
    const expiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 14
    ).toISOString();

    const { error: insertError } = await ((supabaseAdmin.from(
      "bookmark_folder_share" as any
    ) as any).insert({
      folder_id: folderId,
      created_by: user.id,
      token,
      expires_at: expiresAt,
      updated_at: nowIso,
    }));

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      token,
      url: `${baseUrl}/share/folder/${token}`,
      reused: false,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
