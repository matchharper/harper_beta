import { NextResponse } from "next/server";
import {
  fetchCandidateMarkByCandidateIdsForUser,
  fetchShortlistMemoByCandidateIdsForUser,
  getFolderShareState,
  getSupabaseAdmin,
  loadFolderShareByToken,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("token") ?? "").trim();
    const candidId = String(searchParams.get("candidId") ?? "").trim();

    if (!token || !candidId) {
      return NextResponse.json(
        { error: "token and candidId required" },
        { status: 400 }
      );
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
    const { data: folderItem, error: folderItemError } = await (
      (supabaseAdmin.from("bookmark_folder_item" as any) as any)
    )
      .select("id")
      .eq("folder_id", share!.folder_id)
      .eq("candid_id", candidId)
      .maybeSingle();

    if (folderItemError) {
      return NextResponse.json(
        { error: folderItemError.message },
        { status: 500 }
      );
    }
    if (!folderItem) {
      return NextResponse.json(
        { error: "Candidate not found in folder" },
        { status: 404 }
      );
    }

    const { data: folder, error: folderError } = await ((supabaseAdmin.from(
      "bookmark_folder" as any
    ) as any)
      .select("id, name")
      .eq("id", share!.folder_id)
      .maybeSingle());

    if (folderError) {
      return NextResponse.json({ error: folderError.message }, { status: 500 });
    }

    const { data: candid, error: candidError } = await ((supabaseAdmin.from(
      "candid" as any
    ) as any)
      .select(
        "id,name,headline,location,bio,profile_picture,linkedin_url,links,summary(*),edu_user(*),experience_user(*, company_db(*)),publications(*),extra_experience(*)"
      )
      .eq("id", candidId)
      .maybeSingle());

    if (candidError) {
      return NextResponse.json({ error: candidError.message }, { status: 500 });
    }
    if (!candid) {
      return NextResponse.json(
        { error: "Candidate not found" },
        { status: 404 }
      );
    }

    const [ownerCandidateMarkByCandidateId, ownerShortlistMemoByCandidateId] =
      await Promise.all([
        fetchCandidateMarkByCandidateIdsForUser(
          supabaseAdmin,
          share!.created_by,
          [candidId]
        ),
        fetchShortlistMemoByCandidateIdsForUser(
          supabaseAdmin,
          share!.created_by,
          [candidId]
        ),
      ]);

    return NextResponse.json({
      folder,
      candid: {
        ...candid,
        candidate_mark: ownerCandidateMarkByCandidateId.get(candidId) ?? null,
        shortlist_memo: ownerShortlistMemoByCandidateId.get(candidId) ?? "",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
