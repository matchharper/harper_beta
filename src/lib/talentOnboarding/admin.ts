import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type TalentAdminClient = SupabaseClient<Database>;

function readEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
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
