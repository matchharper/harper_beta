import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type BookmarkFolder = {
  id: number;
  user_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type UserCandidateArgs = {
  userId: string;
  candidId: string;
};

type UserCandidateFolderArgs = UserCandidateArgs & {
  folderId: number;
};

type CreateFolderArgs = {
  userId: string;
  name: string;
};

type UpdateFolderArgs = {
  userId: string;
  folderId: number;
  name: string;
};

type DeleteFolderArgs = {
  userId: string;
  folderId: number;
};

const isUniqueViolation = (error: any) => String(error?.code ?? "") === "23505";

export const bookmarkFoldersKey = (userId?: string) =>
  ["bookmarkFolders", userId] as const;

export const candidateBookmarkFolderIdsKey = (userId?: string, candidId?: string) =>
  ["candidateBookmarkFolderIds", userId, candidId] as const;

function invalidateBookmarkRelatedQueries(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  candidId?: string
) {
  qc.invalidateQueries({ queryKey: bookmarkFoldersKey(userId) });
  qc.invalidateQueries({ queryKey: ["connections", userId] });
  qc.invalidateQueries({ queryKey: ["connectionsCount", userId] });
  qc.invalidateQueries({ queryKey: ["candidate"] });
  qc.invalidateQueries({ queryKey: ["searchCandidatesByRun"] });
  if (candidId) {
    qc.invalidateQueries({
      queryKey: candidateBookmarkFolderIdsKey(userId, candidId),
    });
  } else {
    qc.invalidateQueries({ queryKey: ["candidateBookmarkFolderIds", userId] });
  }
}

export function useBookmarkFolders(userId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: bookmarkFoldersKey(userId),
    enabled: !!userId && enabled,
    queryFn: async () => {
      const { data, error } = await ((supabase.from("bookmark_folder" as any) as any)
        .select("id, user_id, name, is_default, created_at, updated_at")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true }));

      if (error) throw error;
      return (data ?? []) as BookmarkFolder[];
    },
    staleTime: 30_000,
  });
}

export function useCandidateBookmarkFolderIds(
  userId?: string,
  candidId?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: candidateBookmarkFolderIdsKey(userId, candidId),
    enabled: !!userId && !!candidId && enabled,
    queryFn: async () => {
      const { data, error } = await ((supabase.from(
        "bookmark_folder_item" as any
      ) as any)
        .select("folder_id")
        .eq("user_id", userId!)
        .eq("candid_id", candidId!));

      if (error) throw error;

      const ids = new Set<number>();
      for (const row of data ?? []) {
        const value = Number(row?.folder_id);
        if (Number.isFinite(value)) ids.add(value);
      }

      return Array.from(ids);
    },
    staleTime: 5_000,
  });
}

export function useCreateBookmarkFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, name }: CreateFolderArgs) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) {
        throw new Error("폴더 이름을 입력해주세요.");
      }

      const { data, error } = await ((supabase.from("bookmark_folder" as any) as any)
        .insert({
          user_id: userId,
          name: trimmed,
        })
        .select("id, user_id, name, is_default, created_at, updated_at")
        .single());

      if (error) throw error;
      return data as BookmarkFolder;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: bookmarkFoldersKey(vars.userId) });
    },
  });
}

export function useUpdateBookmarkFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, folderId, name }: UpdateFolderArgs) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) {
        throw new Error("폴더 이름을 입력해주세요.");
      }

      const { data, error } = await ((supabase.from("bookmark_folder" as any) as any)
        .update({
          name: trimmed,
          updated_at: new Date().toISOString(),
        })
        .eq("id", folderId)
        .eq("user_id", userId)
        .select("id, user_id, name, is_default, created_at, updated_at")
        .maybeSingle());

      if (error) throw error;
      if (!data) throw new Error("폴더를 찾을 수 없습니다.");
      return data as BookmarkFolder;
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: bookmarkFoldersKey(vars.userId) });
    },
  });
}

export function useAddCandidateToBookmarkFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId, folderId }: UserCandidateFolderArgs) => {
      const { error } = await ((supabase.from("bookmark_folder_item" as any) as any)
        .insert({
          user_id: userId,
          candid_id: candidId,
          folder_id: folderId,
        }));

      if (error && !isUniqueViolation(error)) throw error;
      return true;
    },
    onSuccess: (_res, vars) => {
      invalidateBookmarkRelatedQueries(qc, vars.userId, vars.candidId);
    },
  });
}

export function useRemoveCandidateFromBookmarkFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId, folderId }: UserCandidateFolderArgs) => {
      const { error } = await ((supabase.from("bookmark_folder_item" as any) as any)
        .delete()
        .eq("user_id", userId)
        .eq("candid_id", candidId)
        .eq("folder_id", folderId));

      if (error) throw error;
      return true;
    },
    onSuccess: (_res, vars) => {
      invalidateBookmarkRelatedQueries(qc, vars.userId, vars.candidId);
    },
  });
}

export function useClearCandidateBookmarks() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, candidId }: UserCandidateArgs) => {
      const { error } = await ((supabase.from("bookmark_folder_item" as any) as any)
        .delete()
        .eq("user_id", userId)
        .eq("candid_id", candidId));

      if (error) throw error;
      return true;
    },
    onSuccess: (_res, vars) => {
      invalidateBookmarkRelatedQueries(qc, vars.userId, vars.candidId);
    },
  });
}

export function useDeleteBookmarkFolder() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, folderId }: DeleteFolderArgs) => {
      const { data: folder, error: e0 } = await ((supabase.from(
        "bookmark_folder" as any
      ) as any)
        .select("id, name, is_default")
        .eq("id", folderId)
        .eq("user_id", userId)
        .maybeSingle());

      if (e0) throw e0;
      if (!folder) throw new Error("폴더를 찾을 수 없습니다.");
      if (folder?.is_default) throw new Error("기본 폴더는 삭제할 수 없습니다.");

      const { error } = await ((supabase.from("bookmark_folder" as any) as any)
        .delete()
        .eq("id", folderId)
        .eq("user_id", userId));

      if (error) throw error;
      return folder as { id: number; name: string; is_default: boolean };
    },
    onSuccess: (_res, vars) => {
      invalidateBookmarkRelatedQueries(qc, vars.userId);
    },
  });
}
