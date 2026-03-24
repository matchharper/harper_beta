import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CandidateTypeWithConnection } from "./useSearchChatCandidates";
import {
  createDefaultSharedFolderViewerName,
  SharedFolderCandidateNote,
  SharedFolderViewerIdentity,
} from "@/lib/sharedFolder";
import { supabase } from "@/lib/supabase";

export type BookmarkFolderShare = {
  id: string;
  folderId: number;
  token: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

type SharedBookmarkFolderPayload = {
  folder: {
    id: number;
    name: string;
  };
  items: CandidateTypeWithConnection[];
  total: number;
  pageIdx: number;
  pageSize: number;
};

type CreateFolderShareArgs = {
  userId: string;
  folderId: number;
};

type RevokeFolderShareArgs = {
  userId: string;
  folderId: number;
};

type SharedFolderNoteBaseArgs = {
  token: string;
  viewerKey: string;
  viewerName: string;
};

type CreateSharedFolderNoteArgs = SharedFolderNoteBaseArgs & {
  candidId: string;
  memo: string;
};

type UpdateSharedFolderNoteArgs = SharedFolderNoteBaseArgs & {
  noteId: number;
  memo: string;
};

type DeleteSharedFolderNoteArgs = Omit<SharedFolderNoteBaseArgs, "viewerName"> & {
  noteId: number;
};

export const bookmarkFolderSharesKey = (userId?: string) =>
  ["bookmarkFolderShares", userId] as const;

export const sharedBookmarkFolderPageKey = (
  token?: string,
  pageIdx: number = 0,
  pageSize: number = 10,
  viewerKey?: string
) => ["sharedBookmarkFolder", token, pageIdx, pageSize, viewerKey] as const;

function isMissingRelationError(error: any, relation: string) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  return (
    code === "PGRST205" ||
    message.includes(`public.${relation}`) ||
    message.includes(`relation "${relation}" does not exist`)
  );
}

function mapShareRow(row: any): BookmarkFolderShare | null {
  const id = String(row?.id ?? "").trim();
  const token = String(row?.token ?? "").trim();
  const folderId = Number(row?.folder_id);
  if (!id || !token || !Number.isFinite(folderId)) return null;

  return {
    id,
    folderId,
    token,
    createdAt: String(row?.created_at ?? ""),
    updatedAt: String(row?.updated_at ?? row?.created_at ?? ""),
    expiresAt: row?.expires_at ?? null,
    revokedAt: row?.revoked_at ?? null,
  };
}

function mapSharedFolderNote(row: any): SharedFolderCandidateNote | null {
  const id = Number(row?.id);
  const candidId = String(row?.candidId ?? row?.candid_id ?? "").trim();
  if (!Number.isFinite(id) || !candidId) return null;

  return {
    id,
    candidId,
    memo: String(row?.memo ?? ""),
    viewerName: String(row?.viewerName ?? row?.viewer_name ?? "게스트"),
    createdAt: String(row?.createdAt ?? row?.created_at ?? ""),
    updatedAt: String(row?.updatedAt ?? row?.updated_at ?? ""),
    canEdit: Boolean(row?.canEdit ?? row?.can_edit),
  };
}

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("로그인 세션이 만료되었습니다. 다시 로그인해 주세요.");
  }
  return accessToken;
}

function createViewerKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `viewer_${Math.random().toString(36).slice(2, 10)}`;
}

export function useBookmarkFolderShares(
  userId?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: bookmarkFolderSharesKey(userId),
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await ((supabase.from(
        "bookmark_folder_share" as any
      ) as any)
        .select("id, folder_id, token, created_at, updated_at, expires_at, revoked_at")
        .eq("created_by", userId!)
        .order("created_at", { ascending: false }));

      if (error) {
        if (isMissingRelationError(error, "bookmark_folder_share")) {
          return [] as BookmarkFolderShare[];
        }
        throw error;
      }

      return (data ?? [])
        .map(mapShareRow)
        .filter(Boolean) as BookmarkFolderShare[];
    },
    staleTime: 10_000,
  });
}

export function useCreateBookmarkFolderShare() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId }: CreateFolderShareArgs) => {
      const accessToken = await getAccessToken();

      const res = await fetch("/api/share/folder/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ folderId }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "폴더 공유 링크 생성에 실패했습니다.");
      }

      return json as {
        url: string;
        token: string;
      };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: bookmarkFolderSharesKey(vars.userId) });
    },
  });
}

export function useRevokeBookmarkFolderShare() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ folderId }: RevokeFolderShareArgs) => {
      const accessToken = await getAccessToken();

      const res = await fetch("/api/share/folder/revoke", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ folderId }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "폴더 공유 중단에 실패했습니다.");
      }

      return json as { revoked: boolean };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: bookmarkFolderSharesKey(vars.userId) });
    },
  });
}

export function useSharedFolderViewerIdentity(token?: string) {
  const [identity, setIdentity] = useState<SharedFolderViewerIdentity | null>(
    null
  );

  useEffect(() => {
    if (!token || typeof window === "undefined") {
      setIdentity(null);
      return;
    }

    const storageKey = `shared-folder-viewer:${token}`;
    const raw = window.localStorage.getItem(storageKey);

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const viewerKey = String(parsed?.viewerKey ?? "").trim();
        const viewerName = String(parsed?.viewerName ?? "").trim();
        if (viewerKey && viewerName) {
          setIdentity({ viewerKey, viewerName });
          return;
        }
      } catch {
        // ignore parse failure
      }
    }

    const viewerKey = createViewerKey();
    const next = {
      viewerKey,
      viewerName: createDefaultSharedFolderViewerName(viewerKey),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setIdentity(next);
  }, [token]);

  return identity;
}

export function useSharedBookmarkFolderPage(
  token?: string,
  pageIdx: number = 0,
  pageSize: number = 10,
  viewerKey?: string
) {
  return useQuery({
    queryKey: sharedBookmarkFolderPageKey(token, pageIdx, pageSize, viewerKey),
    enabled: !!token,
    queryFn: async () => {
      const params = new URLSearchParams({
        token: token!,
        page: String(pageIdx),
        pageSize: String(pageSize),
      });

      if (viewerKey) {
        params.set("viewerKey", viewerKey);
      }

      const res = await fetch(`/api/share/folder/get?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "공유 폴더를 불러오지 못했습니다.");
      }

      const items = Array.isArray(json?.items) ? json.items : [];
      return {
        folder: {
          id: Number(json?.folder?.id ?? 0),
          name: String(json?.folder?.name ?? ""),
        },
        items,
        total: Number(json?.total ?? 0),
        pageIdx: Number(json?.pageIdx ?? pageIdx),
        pageSize: Number(json?.pageSize ?? pageSize),
      } as SharedBookmarkFolderPayload;
    },
    staleTime: 10_000,
  });
}

export function useCreateSharedFolderNote() {
  return useMutation({
    mutationFn: async ({
      token,
      candidId,
      viewerKey,
      viewerName,
      memo,
    }: CreateSharedFolderNoteArgs) => {
      const res = await fetch("/api/share/folder/note", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          candidId,
          viewerKey,
          viewerName,
          memo,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "메모 생성에 실패했습니다.");
      }

      return mapSharedFolderNote(json?.note);
    },
  });
}

export function useUpdateSharedFolderNote() {
  return useMutation({
    mutationFn: async ({
      token,
      noteId,
      viewerKey,
      viewerName,
      memo,
    }: UpdateSharedFolderNoteArgs) => {
      const res = await fetch("/api/share/folder/note", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          noteId,
          viewerKey,
          viewerName,
          memo,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "메모 수정에 실패했습니다.");
      }

      return mapSharedFolderNote(json?.note);
    },
  });
}

export function useDeleteSharedFolderNote() {
  return useMutation({
    mutationFn: async ({
      token,
      noteId,
      viewerKey,
    }: DeleteSharedFolderNoteArgs) => {
      const res = await fetch("/api/share/folder/note", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          noteId,
          viewerKey,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "메모 삭제에 실패했습니다.");
      }

      return {
        noteId: Number(json?.noteId ?? noteId),
      };
    },
  });
}

export function useActiveBookmarkFolderShareMap(userId?: string) {
  const { data = [] } = useBookmarkFolderShares(userId, true);

  return useMemo(() => {
    const now = Date.now();
    const map = new Map<number, BookmarkFolderShare>();

    for (const share of data) {
      if (share.revokedAt) continue;
      if (share.expiresAt && new Date(share.expiresAt).getTime() < now) {
        continue;
      }
      if (!map.has(share.folderId)) {
        map.set(share.folderId, share);
      }
    }

    return map;
  }, [data]);
}
