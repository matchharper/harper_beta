// stores/useCompanyUserStore.ts
import { supabase } from "@/lib/supabase";
import { create } from "zustand";

type CompanyUser = any;

type S = {
  loading: boolean;
  initialized: boolean; // ✅ 추가
  companyUser: CompanyUser | null;
  load: (userId: string) => Promise<void>;
  clear: () => void;
};

export const useCompanyUserStore = create<S>((set) => ({
  loading: false,
  initialized: false, // ✅ 초기에는 "아직 확인 안 함"
  companyUser: null,

  load: async (userId) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from("company_users")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      set({ loading: false, initialized: true });
      throw error;
    }

    set({
      companyUser: data ?? null,
      loading: false,
      initialized: true, // ✅ 여기서 "확인 완료"
    });
  },

  clear: () => set({ companyUser: null, loading: false, initialized: false }),
}));
