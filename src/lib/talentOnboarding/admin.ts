import {
  createClient,
  type SupabaseClient,
  type User,
} from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type TalentAdminClient = SupabaseClient<Database>;
const SUPABASE_ADMIN_FETCH_TIMEOUT_MS = Number(
  process.env.SUPABASE_ADMIN_FETCH_TIMEOUT_MS ?? 50000
);

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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

export function getTalentSupabaseAdmin(): TalentAdminClient {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  return createClient<Database>(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: createTimeoutFetch(
        Number.isFinite(SUPABASE_ADMIN_FETCH_TIMEOUT_MS)
          ? Math.max(1000, SUPABASE_ADMIN_FETCH_TIMEOUT_MS)
          : 5000
      ),
    },
  });
}

export function toTalentDisplayName(user: User) {
  return (
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    (typeof user.email === "string" ? user.email.split("@")[0] : null) ??
    "Candidate"
  );
}
