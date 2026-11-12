import { careerExecutionEnvironment } from "@/lib/career/executionEnvironment";
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

export function getTalentSupabaseAdmin(options?: { readOnly: boolean }): TalentAdminClient {
  const supabaseUrl = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }

  const request = createTimeoutFetch(
    Number.isFinite(SUPABASE_ADMIN_FETCH_TIMEOUT_MS)
      ? Math.max(1000, SUPABASE_ADMIN_FETCH_TIMEOUT_MS)
      : 5000
  );
  const readOnlyRpcs = new Set([
    "match_talent_context_memories",
    "read_career_internal_role_v1",
    "career_opportunity_list_revision",
    "set_timeout_and_execute_raw_sql",
  ]);
  const readOnlyRequest: typeof fetch = (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== new URL(supabaseUrl).origin || !url.pathname.startsWith("/rest/v1/"))
      throw new Error("Preview permits only database reads");
    // PostgREST GET and HEAD run in read-only transactions. Invoke the
    // approved readers with GET even when their normal call uses POST.
    const rpc = url.pathname.split("/").at(-1) ?? "";
    if (init?.method === "POST" && url.pathname.startsWith("/rest/v1/rpc/") && readOnlyRpcs.has(rpc)) {
      const params: Record<string, string | number> = JSON.parse(String(init.body));
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
      return request(url, { ...init, method: "GET", body: undefined, cache: "no-store" });
    }
    if (init?.method !== "GET" && init?.method !== "HEAD")
      throw new Error("Preview permits only database reads");
    return request(url, { ...init, cache: "no-store" });
  };
  return createClient<Database>(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: { "x-harper-career-runtime": careerExecutionEnvironment() },
      fetch: options?.readOnly ? readOnlyRequest : request,
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
