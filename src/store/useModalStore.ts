import { create } from "zustand";
import { CompanyType } from "@/types/type";
import { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export async function fetchCompanyDb(companyId: number) {
  const { data, error } = await supabase
    .from("company_db")
    .select("*")
    .eq("id", companyId)
    .maybeSingle(); // 없으면 null

  if (error) throw error;
  return data ?? null;
}

type ModalPayload = {
  company: CompanyType;
  closeOnBackdrop?: boolean;
  tone?: "default" | "career";
};

type ModalState = {
  isOpen: boolean;
  payload: ModalPayload | null;
  open: (payload: ModalPayload) => void;
  close: () => void;
  // 새로 추가될 액션
  handleOpenCompany: (params: {
    companyId: number | string;
    fallbackUrl?: string | null;
    openWhenIncomplete?: boolean;
    queryClient: QueryClient;
    tone?: ModalPayload["tone"];
  }) => Promise<void>;
};

export const useCompanyModalStore = create<ModalState>((set, get) => ({
  isOpen: false,
  payload: null,

  open: (payload) => set({ isOpen: true, payload }),

  close: () => {
    const { isOpen } = get();
    if (!isOpen) return;
    set({ isOpen: false, payload: null });
  },

  handleOpenCompany: async ({
    companyId,
    fallbackUrl,
    openWhenIncomplete = false,
    queryClient,
    tone = "default",
  }) => {
    const id = Number(companyId);

    if (!Number.isFinite(id) || id === 0) {
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    try {
      // 2. Query Fetch (이미 있으면 캐시 사용, 없으면 fetch)
      const data = await queryClient.fetchQuery({
        queryKey: ["company_db", id],
        queryFn: () => fetchCompanyDb(id),
        staleTime: 1000 * 60 * 30,
        gcTime: 1000 * 60 * 60 * 6,
      });

      // 3. 결과에 따른 분기
      if (data && (openWhenIncomplete || data.founded_year != null)) {
        get().open({ company: data, tone });
      } else {
        window.open(
          data?.linkedin_url ?? fallbackUrl ?? "https://www.linkedin.com",
          "_blank",
          "noopener,noreferrer"
        );
      }
    } catch (error) {
      console.error("Failed to fetch company data:", error);
      if (fallbackUrl) {
        window.open(fallbackUrl, "_blank", "noopener,noreferrer");
      }
    }
  },
}));
