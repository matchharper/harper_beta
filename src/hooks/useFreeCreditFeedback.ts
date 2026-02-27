import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export const FREE_CREDIT_SOURCE = "free-credit-onetime";
export const FREE_CREDIT_AMOUNT = 5;

export const freeCreditFeedbackKey = (userId?: string) =>
  ["freeCreditFeedback", userId] as const;

async function fetchFreeCreditFeedbackClaimed(userId: string) {
  const { data, error } = await supabase
    .from("feedback")
    .select("id")
    .eq("user_id", userId)
    .eq("from", FREE_CREDIT_SOURCE)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

export function useFreeCreditFeedback(userId?: string) {
  const queryClient = useQueryClient();
  const enabled = Boolean(userId);

  const query = useQuery({
    queryKey: freeCreditFeedbackKey(userId),
    queryFn: () => fetchFreeCreditFeedbackClaimed(userId!),
    enabled,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  const markClaimed = () => {
    if (!userId) return;
    queryClient.setQueryData(freeCreditFeedbackKey(userId), true);
  };

  return {
    hasClaimedFreeCredit: Boolean(query.data),
    isCheckingFreeCredit: !enabled || query.isLoading,
    markClaimed,
    refetch: query.refetch,
  };
}
