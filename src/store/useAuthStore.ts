import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { postLogEvent } from "@/lib/logEvent";
import { buildLandingLoginEmailType } from "@/lib/landingLogTypes";
import { linkOfficialJobEventsToCurrentUser } from "@/lib/officialJobs/events";
import {
  CAREER_LANDING_ABTEST_TYPE,
  CAREER_LANDING_LOCAL_ID_STORAGE_KEY,
  CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX,
  CAREER_UTM_SOURCE_STORAGE_KEY,
  normalizeCareerUtmSource,
} from "@/lib/career/utm";

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

async function logPendingCareerUtmLogin(session: Session) {
  if (typeof window === "undefined") return;

  const email = String(session.user.email ?? "").trim();
  const localId = localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY);
  const source = normalizeCareerUtmSource(
    localStorage.getItem(CAREER_UTM_SOURCE_STORAGE_KEY)
  );
  if (!email || !localId || !source) return;

  const storageKey = `${CAREER_UTM_LOGIN_LOGGED_STORAGE_PREFIX}:${session.user.id}:${localId}:${source}`;
  if (localStorage.getItem(storageKey)) return;

  const { error } = await supabase.from("landing_logs").insert({
    local_id: localId,
    type: buildLandingLoginEmailType(email, source),
    abtest_type: CAREER_LANDING_ABTEST_TYPE,
    is_mobile: null,
    country_lang: null,
  });

  if (error) {
    console.warn("career UTM login log failed:", error.message);
    return;
  }

  localStorage.setItem(storageKey, "1");
}

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
      void linkOfficialJobEventsToCurrentUser(sess.access_token);
      void logPendingCareerUtmLogin(sess);
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, loading: false });
  },
}));
