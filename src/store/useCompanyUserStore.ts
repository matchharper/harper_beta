// stores/useCompanyUserStore.ts
import { supabase } from "@/lib/supabase";
import { create } from "zustand";

type CompanyUser = any;

type S = {
  loading: boolean;
  initialized: boolean;
  companyUser: CompanyUser | null;
  load: (userId: string) => Promise<void>;
  clear: () => void;
};

export const useCompanyUserStore = create<S>((set) => ({
  loading: false,
  initialized: false,
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
      initialized: true,
    });
  },

  clear: () => set({ companyUser: null, loading: false, initialized: false }),
}));
