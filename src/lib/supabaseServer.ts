import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getBearerToken(req: NextRequest): string | null {
  const authHeader =
    req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
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

export async function getRequestUser(req: NextRequest): Promise<User | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
