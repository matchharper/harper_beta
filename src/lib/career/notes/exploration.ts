import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { readPoolSummary } from "../matching/poolRead";

type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;

/**
 * What the records say this matching's exploration has covered: options and
 * reactions, each route's searches and best new rank, web searches and the
 * last search. Recomputed on every read and never stored in a note.
 */
export async function readExplorationSummary(admin: TalentAdminClient, args: { userId: string; matchingId: string }) {
  const [pool, runs, web] = await Promise.all([
    readPoolSummary(admin, args).catch(() => undefined),
    db(admin, "external_recommendation_runs").select("created_at")
      .eq("talent_id", args.userId).eq("matching_id", args.matchingId).order("created_at", { ascending: false }).limit(1),
    db(admin, "talent_external_operations").select("created_at", { count: "exact" })
      .eq("user_id", args.userId).eq("kind", "resource_search")
      .eq("request->>matchingId", args.matchingId).eq("request->>source", "web")
      .order("created_at", { ascending: false }).limit(1),
  ]);
  const webCount = web.error ? null : web.count ?? 0;
  const last = [runs.data?.[0]?.created_at, web.data?.[0]?.created_at].filter(Boolean)
    .sort((a: string, b: string) => Date.parse(b) - Date.parse(a))[0];
  const lines = [
    pool ?? "No options evaluated for this matching yet.",
    webCount ? `Web searches linked to this matching: ${webCount}.` : "",
    last ? `Last search: ${formatLlmDateTime(last)}.` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

