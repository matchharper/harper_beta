import { createClient, RealtimeClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const PUBLIC_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
// Browser/client runtime only. Keep anon key here; never expose service role.
export const supabase = createClient<Database>(SUPABASE_URL, PUBLIC_ANON_KEY, {
  realtime: { accessToken: getRealtimeAccessToken },
});

// Private subscriptions need a transport owned by their authenticated lifetime.
// Closing an old session must not deliver its late channel-close frames to a
// new session reusing the same topic on the shared SDK socket.
export function createAuthenticatedRealtimeClient() {
  return new RealtimeClient(`${SUPABASE_URL}/realtime/v1`, {
    params: { apikey: PUBLIC_ANON_KEY },
    accessToken: getRealtimeAccessToken,
  });
}

async function getRealtimeAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  // The SDK's default callback ignores session errors and falls back to the
  // public key. Realtime keeps its last token when this callback throws, so a
  // retryable refresh failure cannot downgrade an authenticated connection.
  if (error) throw error;
  return data.session?.access_token ?? null;
}
