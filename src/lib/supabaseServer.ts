import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_USER_LOOKUP_TIMEOUT_MS = Number(
  process.env.SUPABASE_AUTH_USER_TIMEOUT_MS ?? 4000
);
const AUTH_USER_CACHE_TTL_MS = 60_000;
const AUTH_USER_CACHE_MAX_SIZE = 500;
const TRUST_LOCAL_JWT_FALLBACK =
  process.env.NODE_ENV !== "production" ||
  process.env.TRUST_SUPABASE_JWT_WITHOUT_LOOKUP === "true";

type CachedRequestUser = {
  expiresAt: number;
  user: User;
};

const requestUserCache = new Map<string, CachedRequestUser>();
const requestUserInFlight = new Map<string, Promise<User | null>>();

type SupabaseJwtPayload = {
  aud?: string;
  email?: string;
  exp?: number;
  role?: string;
  sub?: string;
  user_metadata?: Record<string, unknown>;
};

function getBearerToken(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function createTimeoutFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function isAbortLikeError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    message.includes("timeout") ||
    message.includes("aborted") ||
    message.includes("fetch failed")
  );
}

function getCachedRequestUser(token: string) {
  const cached = requestUserCache.get(token);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    requestUserCache.delete(token);
    return null;
  }

  return cached.user;
}

function setCachedRequestUser(token: string, user: User) {
  if (requestUserCache.size >= AUTH_USER_CACHE_MAX_SIZE) {
    const oldestToken = requestUserCache.keys().next().value;
    if (oldestToken) requestUserCache.delete(oldestToken);
  }

  requestUserCache.set(token, {
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
    user,
  });
}

function decodeLocalRequestUser(token: string): User | null {
  if (!TRUST_LOCAL_JWT_FALLBACK) return null;

  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SupabaseJwtPayload;
    if (!parsed.sub || !parsed.email) return null;
    if (
      process.env.NODE_ENV === "production" &&
      parsed.exp &&
      parsed.exp * 1000 <= Date.now()
    ) {
      return null;
    }

    const now = new Date().toISOString();
    return {
      id: parsed.sub,
      aud: parsed.aud ?? "authenticated",
      role: parsed.role ?? "authenticated",
      email: parsed.email,
      email_confirmed_at: now,
      app_metadata: {},
      user_metadata: parsed.user_metadata ?? {},
      created_at: now,
      updated_at: now,
    } as User;
  } catch {
    return null;
  }
}

export const supabaseServer = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const supabaseAuthServer = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: createTimeoutFetch(
        Number.isFinite(AUTH_USER_LOOKUP_TIMEOUT_MS)
          ? Math.max(1000, AUTH_USER_LOOKUP_TIMEOUT_MS)
          : 4000
      ),
    },
  }
);

async function fetchRequestUser(token: string): Promise<User | null> {
  try {
    const { data, error } = await supabaseAuthServer.auth.getUser(token);
    if (error || !data.user) return null;

    setCachedRequestUser(token, data.user);
    return data.user;
  } catch (error) {
    const localUser = decodeLocalRequestUser(token);
    if (localUser) {
      setCachedRequestUser(token, localUser);
      return localUser;
    }

    const label = isAbortLikeError(error)
      ? "timed out"
      : error instanceof Error
        ? error.message
        : "failed";
    console.warn(`getRequestUser: Supabase auth lookup ${label}`);
    return null;
  }
}

export async function getRequestUser(req: NextRequest): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const cachedUser = getCachedRequestUser(token);
  if (cachedUser) return cachedUser;

  const localUser = decodeLocalRequestUser(token);
  if (localUser) {
    setCachedRequestUser(token, localUser);
    return localUser;
  }

  const existing = requestUserInFlight.get(token);
  if (existing) return existing;

  const request = fetchRequestUser(token).finally(() => {
    requestUserInFlight.delete(token);
  });
  requestUserInFlight.set(token, request);
  return request;
}
