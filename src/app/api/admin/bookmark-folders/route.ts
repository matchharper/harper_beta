import { NextRequest, NextResponse } from "next/server";
import { isValidAdminPassword } from "@/lib/admin";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const FOLDER_ITEM_LIMIT = 200;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function sanitizeSearchQuery(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

function getAdminPassword(req: NextRequest) {
  return (
    req.headers.get("x-admin-password") ??
    req.headers.get("X-Admin-Password") ??
    ""
  );
}

function mapUser(row: any, folderCount: number, bookmarkCount: number) {
  return {
    userId: String(row?.user_id ?? ""),
    name: row?.name ?? null,
    email: row?.email ?? null,
    company: row?.company ?? null,
    folderCount,
    bookmarkCount,
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY is required" },
        { status: 500 }
      );
    }

    if (!isValidAdminPassword(getAdminPassword(req))) {
      return unauthorized();
    }

    const searchParams = req.nextUrl.searchParams;
    const query = sanitizeSearchQuery(
      String(searchParams.get("query") ?? "")
    );
    const userId = String(searchParams.get("userId") ?? "").trim();
    const folderIdParam = String(searchParams.get("folderId") ?? "").trim();
    const folderId =
      folderIdParam.length > 0 ? Number(folderIdParam) : null;

    if (userId && folderId !== null && Number.isFinite(folderId)) {
      const { data: folder, error: folderError } = await ((supabaseServer.from(
        "bookmark_folder" as any
      ) as any)
        .select("id, name, is_default, created_at, updated_at, user_id")
        .eq("id", folderId)
        .eq("user_id", userId)
        .maybeSingle());

      if (folderError) {
        return NextResponse.json(
          { error: folderError.message },
          { status: 500 }
        );
      }
      if (!folder) {
        return NextResponse.json({ error: "Folder not found" }, { status: 404 });
      }

      const { data: user, error: userError } = await ((supabaseServer.from(
        "company_users" as any
      ) as any)
        .select("user_id, name, email, company")
        .eq("user_id", userId)
        .maybeSingle());

      if (userError) {
        return NextResponse.json(
          { error: userError.message },
          { status: 500 }
        );
      }

      const { data: folderItems, error: folderItemsError, count } = await (
        (supabaseServer.from("bookmark_folder_item" as any) as any)
      )
        .select("id, candid_id, created_at", { count: "exact" })
        .eq("user_id", userId)
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false })
        .range(0, FOLDER_ITEM_LIMIT - 1);

      if (folderItemsError) {
        return NextResponse.json(
          { error: folderItemsError.message },
          { status: 500 }
        );
      }

      const candidateIds = (folderItems ?? [])
        .map((row: any) => String(row?.candid_id ?? "").trim())
        .filter(Boolean);

      const candidateById = new Map<string, any>();
      const memoByCandidateId = new Map<string, any>();

      if (candidateIds.length > 0) {
        const { data: candidates, error: candidateError } = await (
          (supabaseServer.from("candid" as any) as any)
        )
          .select("id, name, headline, linkedin_url")
          .in("id", candidateIds);

        if (candidateError) {
          return NextResponse.json(
            { error: candidateError.message },
            { status: 500 }
          );
        }

        for (const candidate of candidates ?? []) {
          const candidateId = String(candidate?.id ?? "").trim();
          if (!candidateId) continue;
          candidateById.set(candidateId, candidate);
        }

        const { data: memos, error: memoError } = await ((supabaseServer.from(
          "shortlist_memo" as any
        ) as any)
          .select("candid_id, memo, updated_at")
          .eq("user_id", userId)
          .in("candid_id", candidateIds));

        if (memoError) {
          return NextResponse.json(
            { error: memoError.message },
            { status: 500 }
          );
        }

        for (const memo of memos ?? []) {
          const candidateId = String(memo?.candid_id ?? "").trim();
          if (!candidateId) continue;
          memoByCandidateId.set(candidateId, memo);
        }
      }

      const items = (folderItems ?? []).map((row: any) => {
        const candidateId = String(row?.candid_id ?? "").trim();
        const candidate = candidateById.get(candidateId) ?? null;
        const memo = memoByCandidateId.get(candidateId) ?? null;

        return {
          folderItemId: Number(row?.id ?? 0),
          candidId: candidateId,
          name: candidate?.name ?? null,
          headline: candidate?.headline ?? null,
          memo: String(memo?.memo ?? ""),
          memoUpdatedAt: memo?.updated_at ?? null,
          linkedinUrl: candidate?.linkedin_url ?? null,
          profileHref: `/my/p/${candidateId}`,
          createdAt: row?.created_at ?? null,
        };
      });

      return NextResponse.json({
        user: user ? mapUser(user, 0, 0) : null,
        folder: {
          id: Number(folder.id),
          name: String(folder.name ?? ""),
          isDefault: Boolean(folder.is_default),
          createdAt: String(folder.created_at ?? ""),
          updatedAt: String(folder.updated_at ?? ""),
          itemCount: Number(count ?? items.length),
        },
        total: Number(count ?? items.length),
        limit: FOLDER_ITEM_LIMIT,
        items,
      });
    }

    if (userId) {
      const { data: user, error: userError } = await ((supabaseServer.from(
        "company_users" as any
      ) as any)
        .select("user_id, name, email, company")
        .eq("user_id", userId)
        .maybeSingle());

      if (userError) {
        return NextResponse.json(
          { error: userError.message },
          { status: 500 }
        );
      }
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const { data: folders, error: foldersError } = await ((supabaseServer.from(
        "bookmark_folder" as any
      ) as any)
        .select("id, name, is_default, created_at, updated_at")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }));

      if (foldersError) {
        return NextResponse.json(
          { error: foldersError.message },
          { status: 500 }
        );
      }

      const folderIds = (folders ?? []).map((row: any) => Number(row?.id));
      const countsByFolderId = new Map<number, number>();

      if (folderIds.length > 0) {
        const { data: folderItems, error: folderItemsError } = await (
          (supabaseServer.from("bookmark_folder_item" as any) as any)
        )
          .select("folder_id")
          .eq("user_id", userId)
          .in("folder_id", folderIds);

        if (folderItemsError) {
          return NextResponse.json(
            { error: folderItemsError.message },
            { status: 500 }
          );
        }

        for (const row of folderItems ?? []) {
          const currentFolderId = Number(row?.folder_id);
          if (!Number.isFinite(currentFolderId)) continue;
          countsByFolderId.set(
            currentFolderId,
            (countsByFolderId.get(currentFolderId) ?? 0) + 1
          );
        }
      }

      const bookmarkCount = Array.from(countsByFolderId.values()).reduce(
        (sum, value) => sum + value,
        0
      );

      return NextResponse.json({
        user: mapUser(user, (folders ?? []).length, bookmarkCount),
        folders: (folders ?? []).map((folder: any) => ({
          id: Number(folder?.id ?? 0),
          name: String(folder?.name ?? ""),
          isDefault: Boolean(folder?.is_default),
          createdAt: String(folder?.created_at ?? ""),
          updatedAt: String(folder?.updated_at ?? ""),
          itemCount: countsByFolderId.get(Number(folder?.id ?? 0)) ?? 0,
        })),
      });
    }

    if (!query) {
      return NextResponse.json({ users: [] });
    }

    const { data: users, error: usersError } = await ((supabaseServer.from(
      "company_users" as any
    ) as any)
      .select("user_id, name, email, company")
      .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(20));

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    const userIds = (users ?? [])
      .map((row: any) => String(row?.user_id ?? "").trim())
      .filter(Boolean);
    const folderCountByUserId = new Map<string, number>();
    const bookmarkCountByUserId = new Map<string, number>();

    if (userIds.length > 0) {
      const { data: folders, error: foldersError } = await ((supabaseServer.from(
        "bookmark_folder" as any
      ) as any)
        .select("id, user_id")
        .in("user_id", userIds));

      if (foldersError) {
        return NextResponse.json(
          { error: foldersError.message },
          { status: 500 }
        );
      }

      for (const folder of folders ?? []) {
        const currentUserId = String(folder?.user_id ?? "").trim();
        if (!currentUserId) continue;
        folderCountByUserId.set(
          currentUserId,
          (folderCountByUserId.get(currentUserId) ?? 0) + 1
        );
      }

      const { data: folderItems, error: folderItemsError } = await (
        (supabaseServer.from("bookmark_folder_item" as any) as any)
      )
        .select("user_id")
        .in("user_id", userIds);

      if (folderItemsError) {
        return NextResponse.json(
          { error: folderItemsError.message },
          { status: 500 }
        );
      }

      for (const folderItem of folderItems ?? []) {
        const currentUserId = String(folderItem?.user_id ?? "").trim();
        if (!currentUserId) continue;
        bookmarkCountByUserId.set(
          currentUserId,
          (bookmarkCountByUserId.get(currentUserId) ?? 0) + 1
        );
      }
    }

    return NextResponse.json({
      users: (users ?? []).map((row: any) =>
        mapUser(
          row,
          folderCountByUserId.get(String(row?.user_id ?? "").trim()) ?? 0,
          bookmarkCountByUserId.get(String(row?.user_id ?? "").trim()) ?? 0
        )
      ),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
