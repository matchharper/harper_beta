import { NextResponse } from "next/server";
import {
  getFolderShareState,
  getSupabaseAdmin,
  loadFolderShareByToken,
} from "../_shared";

export const runtime = "nodejs";

function normalizeViewerKey(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeViewerName(value: unknown) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "게스트";
  return trimmed.slice(0, 40);
}

function normalizeMemo(value: unknown) {
  return String(value ?? "").trim();
}

async function loadActiveShare(token: string) {
  const share = await loadFolderShareByToken(token);
  const shareState = getFolderShareState(share);
  if (shareState !== "active") {
    const error =
      shareState === "missing"
        ? "Not found"
        : shareState === "revoked"
          ? "Revoked"
          : "Expired";
    return { share: null, error };
  }
  return { share, error: null };
}

async function ensureFolderCandidate(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  folderId: number,
  candidId: string
) {
  const { data, error } = await ((supabaseAdmin.from(
    "bookmark_folder_item" as any
  ) as any)
    .select("id")
    .eq("folder_id", folderId)
    .eq("candid_id", candidId)
    .maybeSingle());

  if (error) throw error;
  return Boolean(data);
}

function mapNote(row: any) {
  return {
    id: Number(row?.id ?? 0),
    candidId: String(row?.candid_id ?? ""),
    memo: String(row?.memo ?? ""),
    viewerName: String(row?.viewer_name ?? "게스트"),
    createdAt: String(row?.created_at ?? ""),
    updatedAt: String(row?.updated_at ?? row?.created_at ?? ""),
    canEdit: true,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const candidId = String(body?.candidId ?? "").trim();
    const viewerKey = normalizeViewerKey(body?.viewerKey);
    const viewerName = normalizeViewerName(body?.viewerName);
    const memo = normalizeMemo(body?.memo);

    if (!token || !candidId || !viewerKey || !memo) {
      return NextResponse.json(
        { error: "token, candidId, viewerKey, memo required" },
        { status: 400 }
      );
    }

    const { share, error } = await loadActiveShare(token);
    if (!share) {
      return NextResponse.json({ error }, { status: error === "Not found" ? 404 : 410 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const exists = await ensureFolderCandidate(supabaseAdmin, share.folder_id, candidId);
    if (!exists) {
      return NextResponse.json(
        { error: "Candidate not found in folder" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const { data, error: insertError } = await ((supabaseAdmin.from(
      "bookmark_folder_share_note" as any
    ) as any)
      .insert({
        folder_id: share.folder_id,
        candid_id: candidId,
        viewer_key: viewerKey,
        viewer_name: viewerName,
        memo,
        updated_at: now,
      })
      .select("id, candid_id, memo, viewer_name, created_at, updated_at")
      .single());

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ note: mapNote(data) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const noteId = Number(body?.noteId);
    const viewerKey = normalizeViewerKey(body?.viewerKey);
    const viewerName = normalizeViewerName(body?.viewerName);
    const memo = normalizeMemo(body?.memo);

    if (!token || !Number.isFinite(noteId) || !viewerKey || !memo) {
      return NextResponse.json(
        { error: "token, noteId, viewerKey, memo required" },
        { status: 400 }
      );
    }

    const { share, error } = await loadActiveShare(token);
    if (!share) {
      return NextResponse.json({ error }, { status: error === "Not found" ? 404 : 410 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await ((supabaseAdmin.from(
      "bookmark_folder_share_note" as any
    ) as any)
      .select("id, viewer_key")
      .eq("id", noteId)
      .eq("folder_id", share.folder_id)
      .maybeSingle());

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (String(existing.viewer_key ?? "") !== viewerKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const { data, error: updateError } = await ((supabaseAdmin.from(
      "bookmark_folder_share_note" as any
    ) as any)
      .update({
        memo,
        viewer_name: viewerName,
        updated_at: now,
      })
      .eq("id", noteId)
      .eq("folder_id", share.folder_id)
      .select("id, candid_id, memo, viewer_name, created_at, updated_at")
      .single());

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ note: mapNote(data) });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "").trim();
    const noteId = Number(body?.noteId);
    const viewerKey = normalizeViewerKey(body?.viewerKey);

    if (!token || !Number.isFinite(noteId) || !viewerKey) {
      return NextResponse.json(
        { error: "token, noteId, viewerKey required" },
        { status: 400 }
      );
    }

    const { share, error } = await loadActiveShare(token);
    if (!share) {
      return NextResponse.json({ error }, { status: error === "Not found" ? 404 : 410 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await ((supabaseAdmin.from(
      "bookmark_folder_share_note" as any
    ) as any)
      .select("id, viewer_key")
      .eq("id", noteId)
      .eq("folder_id", share.folder_id)
      .maybeSingle());

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 }
      );
    }
    if (!existing) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    if (String(existing.viewer_key ?? "") !== viewerKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: deleteError } = await ((supabaseAdmin.from(
      "bookmark_folder_share_note" as any
    ) as any)
      .delete()
      .eq("id", noteId)
      .eq("folder_id", share.folder_id));

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ noteId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
