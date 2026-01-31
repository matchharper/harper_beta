import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

export type UserSettings = {
  is_korean: boolean;
  is_exclude_shortlist: boolean;
  max_years_exp: number | null;
  min_years_exp: number | null;
};

const DEFAULT_SETTINGS: UserSettings = {
  is_korean: false,
  is_exclude_shortlist: false,
  max_years_exp: null,
  min_years_exp: null,
};

const settingsQueryKey = (userId?: string) => ["settings", userId];

export const useSettings = (userId?: string) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: settingsQueryKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return DEFAULT_SETTINGS;

      const { data: row, error } = await supabase
        .from("settings")
        .select("is_korean, is_exclude_shortlist, max_years_exp, min_years_exp")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      return {
        is_korean: row?.is_korean ?? false,
        is_exclude_shortlist: row?.is_exclude_shortlist ?? false,
        max_years_exp: row?.max_years_exp ?? null,
        min_years_exp: row?.min_years_exp ?? null,
      };
    },
    staleTime: 1000 * 60 * 10,
  });

  const mutation = useMutation({
    mutationFn: async (next: UserSettings) => {
      if (!userId) throw new Error("Missing user id");
      logger.log("saveSettings", next);

      const { data: row, error } = await supabase
        .from("settings")
        .upsert(
          {
            user_id: userId,
            is_korean: next.is_korean,
            is_exclude_shortlist: next.is_exclude_shortlist,
            max_years_exp: next.max_years_exp,
            min_years_exp: next.min_years_exp,
          }
        )
        .select("is_korean, is_exclude_shortlist, max_years_exp, min_years_exp")
        .single();

      if (error) throw error;

      return {
        is_korean: row?.is_korean ?? false,
        is_exclude_shortlist: row?.is_exclude_shortlist ?? false,
        max_years_exp: row?.max_years_exp ?? null,
        min_years_exp: row?.min_years_exp ?? null,
      };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsQueryKey(userId), updated);
    },
  });

  return {
    settings: data ?? DEFAULT_SETTINGS,
    isLoading,
    saveSettings: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
};
