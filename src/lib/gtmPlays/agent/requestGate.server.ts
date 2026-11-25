import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmWritesEnabled } from "../constants";
import { kstDayWindow } from "../sendLimit";
import { channelRoomLeft, normalizeChannelSettings } from "./channels";

/**
 * Whether the job page may offer "비슷한 공고 추천받기" now (agent/request.ts): the agent on, the request channel on and
 * today's requests (Korea-time day, not counting tests and rate-limited ones) under the channel's daily max.
 *
 * Read by a Pages Router page's getServerSideProps (/jobs/[slug], through officialJobs/similarRequest.server.ts), so it
 * imports only the database client and no "server-only" marker (the Pages Router refuses that and the agent code the
 * steps pull in: agent/request.server.ts). Never import it from client code: it uses the service-role client.
 * Any error closes it, and so does a database without the request column yet (the count filters on it).
 */
export async function isJobPageRequestOpen(now = new Date()): Promise<boolean> {
  if (!gtmWritesEnabled()) return false;
  try {
    // The #5 tables are not in the generated Database types.
    const admin = getSupabaseAdmin() as unknown as { from: (table: string) => any };
    const day = kstDayWindow(now);
    const [settings, today] = await Promise.all([
      admin.from("gtm_agent_settings").select("enabled,channels").eq("id", true).maybeSingle(),
      admin.from("gtm_agent_people").select("id", { count: "exact", head: true })
        .eq("method", "request").eq("is_test", false).not("request", "is", null)
        .gte("created_at", day.start).lt("created_at", day.end)
        .or("skip_reason.is.null,skip_reason.neq.rate_limit"),
    ]);
    if (settings.error || today.error) {
      console.warn("[gtm-agent] job-page request gate", settings.error?.message ?? today.error?.message);
      return false;
    }
    const row = settings.data as { enabled?: boolean; channels?: unknown } | null;
    if (!row?.enabled) return false;
    const setting = normalizeChannelSettings(row.channels ?? {}).settings.request;
    return channelRoomLeft(setting, Number(today.count ?? 0)) > 0;
  } catch (error) {
    console.warn("[gtm-agent] job-page request gate", error instanceof Error ? error.message : String(error));
    return false;
  }
}
