import { NextResponse } from "next/server";
import {
  fetchCandidateMarkByCandidateIdsForUser,
  fetchScholarPreviewByCandidateIds,
  fetchShortlistMemoByCandidateIdsForUser,
  getFolderShareState,
  getSupabaseAdmin,
  loadFolderShareByToken,
} from "../_shared";
import {
  applyListRevealState,
  fetchRevealMapForUser,
} from "@/lib/server/candidateAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("token") ?? "").trim();
    const pageIdx = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);
    const pageSize = Math.min(
      30,
      Math.max(1, Number(searchParams.get("pageSize") ?? 10) || 10)
    );
    const viewerKey = String(searchParams.get("viewerKey") ?? "").trim();

    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const share = await loadFolderShareByToken(token);
    const shareState = getFolderShareState(share);
    if (shareState === "missing") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (shareState === "revoked") {
      return NextResponse.json({ error: "Revoked" }, { status: 410 });
    }
    if (shareState === "expired") {
      return NextResponse.json({ error: "Expired" }, { status: 410 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: folder, error: folderError } = await (
      supabaseAdmin.from("bookmark_folder" as any) as any
    )
      .select("id, name")
      .eq("id", share!.folder_id)
      .maybeSingle();

    if (folderError) {
      return NextResponse.json({ error: folderError.message }, { status: 500 });
    }
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    const from = pageIdx * pageSize;
    const to = from + pageSize - 1;
    const {
      data: folderItems,
      count,
      error: folderItemsError,
    } = await (supabaseAdmin.from("bookmark_folder_item" as any) as any)
      .select("candid_id", { count: "exact" })
      .eq("folder_id", folder.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (folderItemsError) {
      return NextResponse.json(
        { error: folderItemsError.message },
        { status: 500 }
      );
    }

    const ids = (folderItems ?? [])
      .map((row: any) => String(row?.candid_id ?? "").trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({
        folder,
        items: [],
        total: count ?? 0,
        pageIdx,
        pageSize,
      });
    }

    const { data: candidates, error: candidateError } = await (
      supabaseAdmin.from("candid" as any) as any
    )
      .select(
        `
          id,
          headline,
          bio,
          linkedin_url,
          links,
          location,
          name,
          profile_picture,
          edu_user (
            school,
            degree,
            field,
            start_date,
            end_date,
            url
          ),
          experience_user (
            role,
            description,
            start_date,
            end_date,
            company_id,
            company_db (
              name,
              logo,
              linkedin_url
            )
          )
        `
      )
      .in("id", ids);

    if (candidateError) {
      return NextResponse.json(
        { error: candidateError.message },
        { status: 500 }
      );
    }

    const scholarPreviewByCandidateId = await fetchScholarPreviewByCandidateIds(
      supabaseAdmin,
      ids
    );
    const ownerCandidateMarkByCandidateId =
      await fetchCandidateMarkByCandidateIdsForUser(
        supabaseAdmin,
        share!.created_by,
        ids
      );
    const ownerShortlistMemoByCandidateId =
      await fetchShortlistMemoByCandidateIdsForUser(
        supabaseAdmin,
        share!.created_by,
        ids
      );
    const revealMap = await fetchRevealMapForUser(
      supabaseAdmin as any,
      share!.created_by,
      ids
    );
    const { data: noteRows, error: noteError } = await (
      supabaseAdmin.from("bookmark_folder_share_note" as any) as any
    )
      .select(
        "id, candid_id, memo, viewer_name, viewer_key, created_at, updated_at"
      )
      .eq("folder_id", folder.id)
      .in("candid_id", ids)
      .order("created_at", { ascending: true });

    if (noteError) {
      return NextResponse.json({ error: noteError.message }, { status: 500 });
    }

    const notesByCandidateId = new Map<string, any[]>();
    for (const row of noteRows ?? []) {
      const candidId = String(row?.candid_id ?? "").trim();
      if (!candidId) continue;
      const note = {
        id: Number(row?.id ?? 0),
        candidId,
        memo: String(row?.memo ?? ""),
        viewerName: String(row?.viewer_name ?? "게스트"),
        createdAt: String(row?.created_at ?? ""),
        updatedAt: String(row?.updated_at ?? row?.created_at ?? ""),
        canEdit: viewerKey
          ? String(row?.viewer_key ?? "") === viewerKey
          : false,
      };
      const existing = notesByCandidateId.get(candidId) ?? [];
      existing.push(note);
      notesByCandidateId.set(candidId, existing);
    }

    const candidateById = new Map(
      (candidates ?? []).map((candidate: any) => [candidate.id, candidate])
    );
    const items = ids
      .map((id: any) => {
        const candidate = candidateById.get(id);
        if (!candidate) return null;
        const isRevealed = revealMap.get(id) === true;
        return {
          ...applyListRevealState(
            {
              ...candidate,
              scholar_profile_preview: scholarPreviewByCandidateId.get(id) ?? null,
              candidate_mark: isRevealed
                ? ownerCandidateMarkByCandidateId.get(id) ?? null
                : null,
              shortlist_memo: isRevealed
                ? ownerShortlistMemoByCandidateId.get(id) ?? ""
                : "",
            },
            isRevealed
          ),
          connection: [],
          shared_folder_notes: notesByCandidateId.get(id) ?? [],
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      folder,
      items,
      total: count ?? 0,
      pageIdx,
      pageSize,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
