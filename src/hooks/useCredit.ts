import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";

const creditQueryKey = (userId?: string) => ["credits", userId] as const;

export const useCredits = () => {
  const queryClient = useQueryClient();
  const authUserId = useAuthStore((s) => s.user?.id);

  // 1. 현재 잔여 이용량 조회
  const { data: credits, isLoading, refetch } = useQuery({
    queryKey: creditQueryKey(authUserId),
    queryFn: async () => {
      let userId = authUserId;
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id;
      }
      if (!userId) throw new Error("No user logged in");

      const { data, error } = await supabase
        .from("credits")
        .select("remain_credit, charged_credit")
        .eq("user_id", userId);

      if (error) throw error;
      return {
        remain_credit: data?.[0]?.remain_credit ?? 0,
        charged_credit: data?.[0]?.charged_credit ?? 0,
      };
    },
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: true,
  });

  // 2. 이용량 차감
  const mutation = useMutation({
    mutationFn: async (amount: number) => {
      const { data: newBalance, error } = await supabase.rpc(
        "deduct_user_credits",
        {
          amount_to_deduct: amount,
        }
      );

      if (error) throw error;
      return newBalance;
    },
    // 성공 시 캐시를 직접 업데이트하여 UI를 즉시 갱신
    onSuccess: (newBalance) => {
      queryClient.setQueryData(creditQueryKey(authUserId), {
        remain_credit: newBalance,
        charged_credit: credits?.charged_credit ?? 0,
      });
    },
    onError: (error: any) => {
      if (error.message.includes("Insufficient credits")) {
        alert("이번 달 월 검색 한도를 모두 사용했습니다.");
      } else {
        console.error("Deduction error:", error);
      }
    },
  });

  return {
    credits,
    isLoading,
    refetch,
    deduct: mutation.mutateAsync,
    isDeducting: mutation.isPending,
  };
};
