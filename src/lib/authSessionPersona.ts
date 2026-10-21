import type { Session } from "@supabase/supabase-js";
import { canViewOpsUtm } from "@/lib/internalAccess";

export type AuthPersona = "talent" | "company";
export const AUTH_PERSONA_STORAGE_KEY = "harper:auth-session-persona";

type AuthSession = Pick<Session, "access_token" | "user">;

export function canSwitchAuthPersonaWithoutLogout(
  email: string | null | undefined
): boolean {
  // Reuse Ops' authenticated-account access, including its email-only viewers.
  // This skips navigation confirmation; workspace/API permissions still apply.
  return canViewOpsUtm(email);
}

// This is a browser navigation preference, never an API/RLS authorization claim.
// session_id survives token refresh but changes when the same account logs in again.
export function getAuthSessionKey(session: AuthSession | null): string | null {
  if (!session) return null;
  try {
    const payload = session.access_token.split(".")[1];
    const claims = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof claims.session_id === "string" && claims.session_id
      ? `${session.user.id}:${claims.session_id}`
      : null;
  } catch {
    return null;
  }
}

export function serializeAuthPersona(
  session: AuthSession,
  persona: AuthPersona
): string | null {
  const sessionKey = getAuthSessionKey(session);
  return sessionKey ? JSON.stringify({ sessionKey, persona }) : null;
}

export function parseAuthPersona(
  stored: string | null,
  session: AuthSession | null
): AuthPersona | null {
  const sessionKey = getAuthSessionKey(session);
  if (!stored || !sessionKey) return null;
  try {
    const record = JSON.parse(stored);
    return record?.sessionKey === sessionKey &&
      (record.persona === "talent" || record.persona === "company")
      ? record.persona
      : null;
  } catch {
    return null;
  }
}

export function readAuthPersona(
  session: AuthSession | null
): AuthPersona | null {
  if (typeof window === "undefined") return null;
  try {
    return parseAuthPersona(
      window.localStorage.getItem(AUTH_PERSONA_STORAGE_KEY),
      session
    );
  } catch {
    return null;
  }
}

export function getPageAuthPersona(path: string): AuthPersona | null {
  const pathname = path.split(/[?#]/, 1)[0];
  if (
    pathname === "/career_login" ||
    pathname === "/career" ||
    pathname.startsWith("/career/")
  ) {
    return "talent";
  }
  if (
    pathname === "/org" ||
    pathname.startsWith("/org/") ||
    ["/search", "/find", "/radar"].includes(pathname)
  ) {
    return "company";
  }
  return null;
}

export function getPersonaLoginPath(
  path: string,
  persona: AuthPersona
): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    getPageAuthPersona(path) !== persona
  ) {
    return persona === "talent" ? "/career_login" : "/org";
  }
  if (persona === "company" || path.split(/[?#]/, 1)[0] === "/career_login") {
    return path;
  }
  return `/career_login?next=${encodeURIComponent(path)}`;
}
