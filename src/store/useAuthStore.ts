import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { postLogEvent } from "@/lib/logEvent";

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
};

let subscribed = false; // ✅ onAuthStateChange 중복 방지
const LOGIN_COMPLETED_EVENT_TYPE = "login_completed";
const LOGIN_LOGGED_ACCESS_TOKEN_KEY = "harper_logged_login_access_token";

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

    supabase.auth.onAuthStateChange((event, sess) => {
      set({ session: sess ?? null, user: sess?.user ?? null, loading: false });

      if (typeof window === "undefined") return;

      if (event === "SIGNED_OUT") {
        window.sessionStorage.removeItem(LOGIN_LOGGED_ACCESS_TOKEN_KEY);
        return;
      }

      if (event !== "SIGNED_IN" || !sess?.access_token) return;

      const lastLoggedAccessToken = window.sessionStorage.getItem(
        LOGIN_LOGGED_ACCESS_TOKEN_KEY
      );
      if (lastLoggedAccessToken === sess.access_token) return;

      window.sessionStorage.setItem(
        LOGIN_LOGGED_ACCESS_TOKEN_KEY,
        sess.access_token
      );
      void postLogEvent(LOGIN_COMPLETED_EVENT_TYPE, {
        accessToken: sess.access_token,
      });
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, loading: false });
  },
}));
