import { supabase } from "@/lib/supabase";

// Developer-only: the session the developer had before viewing a persona, so
// "원래 계정으로" can return without another login. Stays in this browser only.
const ORIGIN_KEY = "harper.devPersona.origin";

type OriginSession = {
  email: string | null;
  accessToken: string;
  refreshToken: string;
};

export function readDevPersonaOrigin(): OriginSession | null {
  try {
    const raw = window.localStorage.getItem(ORIGIN_KEY);
    return raw ? (JSON.parse(raw) as OriginSession) : null;
  } catch {
    return null;
  }
}

export async function enterDevPersona(tokenHash: string) {
  if (!readDevPersonaOrigin()) {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session) {
      window.localStorage.setItem(
        ORIGIN_KEY,
        JSON.stringify({
          email: session.user.email ?? null,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
        } satisfies OriginSession)
      );
    }
  }
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (error) throw error;
  window.location.assign("/career");
}

export async function leaveDevPersona() {
  const origin = readDevPersonaOrigin();
  if (!origin) return;
  const { error } = await supabase.auth.setSession({
    access_token: origin.accessToken,
    refresh_token: origin.refreshToken,
  });
  window.localStorage.removeItem(ORIGIN_KEY);
  if (error) {
    // The saved session expired; sign out so the developer can log in again.
    await supabase.auth.signOut({ scope: "local" });
  }
  window.location.assign("/career");
}
