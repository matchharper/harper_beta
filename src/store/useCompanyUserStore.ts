// stores/useCompanyUserStore.ts
import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/database.types";
import { create } from "zustand";

type CompanyUser = Database["public"]["Tables"]["company_users"]["Row"];
type CompanyUserStatus = "idle" | "loading" | "ready" | "absent" | "error";

type S = {
  loading: boolean;
  initialized: boolean;
  loadedUserId: string | null;
  status: CompanyUserStatus;
  error: string | null;
  companyUser: CompanyUser | null;
  load: (
    userId: string,
    options?: { force?: boolean }
  ) => Promise<CompanyUser | null>;
  clear: () => void;
};

const inFlightLoads = new Map<string, Promise<CompanyUser | null>>();

export const useCompanyUserStore = create<S>((set, get) => ({
  loading: false,
  initialized: false,
  loadedUserId: null,
  status: "idle",
  error: null,
  companyUser: null,

  load: async (userId, options) => {
    const state = get();
    if (
      !options?.force &&
      state.loadedUserId === userId &&
      state.initialized &&
      state.status !== "error"
    ) {
      return state.companyUser;
    }

    const inFlightLoad = inFlightLoads.get(userId);
    if (inFlightLoad) {
      return inFlightLoad;
    }

    set({
      loading: true,
      initialized: false,
      loadedUserId: userId,
      status: "loading",
      error: null,
    });

    const loadPromise = (async () => {
      const { data, error } = await supabase
        .from("company_users")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        if (get().loadedUserId === userId) {
          set({
            companyUser: null,
            loading: false,
            initialized: true,
            status: "error",
            error: error.message,
          });
        }
        throw error;
      }

      const companyUser = data ?? null;
      if (get().loadedUserId === userId) {
        set({
          companyUser,
          loading: false,
          initialized: true,
          status: companyUser ? "ready" : "absent",
          error: null,
        });
      }

      return companyUser;
    })().finally(() => {
      if (inFlightLoads.get(userId) === loadPromise) {
        inFlightLoads.delete(userId);
      }
    });

    inFlightLoads.set(userId, loadPromise);
    return loadPromise;
  },

  clear: () =>
    set({
      companyUser: null,
      loading: false,
      initialized: false,
      loadedUserId: null,
      status: "idle",
      error: null,
    }),
}));
