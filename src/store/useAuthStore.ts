import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
};

let subscribed = false; // ✅ onAuthStateChange 중복 방지

export const useAuthStore = create<AuthState>((set, get) => ({
  loading: true,
  session: null,
  user: null,

  init: async () => {
    // 이미 init 되었으면 세션만 빠르게 반영하고 끝 (원하면 더 단순히 return 해도 됨)
    const { data } = await supabase.auth.getSession();
    set({
      session: data.session ?? null,
      user: data.session?.user ?? null,
      loading: false,
    });

    if (subscribed) return;
    subscribed = true;

    supabase.auth.onAuthStateChange((_event, sess) => {
      set({ session: sess ?? null, user: sess?.user ?? null, loading: false });
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, loading: false });
  },
}));
