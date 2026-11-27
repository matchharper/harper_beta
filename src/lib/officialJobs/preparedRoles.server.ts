import "server-only";

import { randomUUID } from "node:crypto";
import { v2CompletionRequest } from "@/lib/externalRecommendationsV2/engine";
import { embedSearchTitles, retrieveRoles } from "@/lib/externalRecommendationsV2/retrieval";
import { internalRoles } from "@/lib/gtmPlays/agent/match.server";
import { getTalentSupabaseAdmin, type TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { runTalentAssistantCompletion } from "@/lib/talentOnboarding/llm";
import {
  OFFICIAL_JOB_PREPARED_ROLES_TABLE,
  PREPARED_PUBLIC_POSTINGS,
  type PreparedRolesHarperCandidate,
  type PreparedRolesPosting,
} from "./preparedRoles";
import {
  PREPARED_ROLES_PROMPT,
  buildPreparedRolesInput,
  parsePreparedRolesPick,
  preparedRoleRows,
  type PreparedRoleRow,
  type PreparedRolesPick,
} from "./preparedRolesBuild";

/** Postings built at the same time: each is one planner call, one embedding and one posting search. */
const CONCURRENCY = 3;

/** Published /jobs postings with no Harper Role behind them, as their public pages show them. */
async function noRolePostings(admin: TalentAdminClient, slugs?: readonly string[]): Promise<PreparedRolesPosting[]> {
  let query = admin
    .from("official_jobs")
    .select("id, slug, company_name, role_title, location, vertical, employment_type, seniority, short_description, role_description_markdown")
    .eq("is_published", true)
    .is("role_id", null);
  if (slugs?.length) query = query.in("slug", [...slugs]);
  const { data, error } = await query;
  if (error) throw new Error(`official_jobs: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    companyName: row.company_name,
    roleTitle: row.role_title,
    location: row.location,
    vertical: row.vertical,
    employmentType: row.employment_type,
    seniority: row.seniority,
    shortDescription: row.short_description,
    roleDescription: row.role_description_markdown,
  }));
}

/** The Harper-connected Roles Harper's own outreach may propose to people who are not members yet. */
async function harperCandidates(): Promise<PreparedRolesHarperCandidate[]> {
  return (await internalRoles()).flatMap((item) =>
    item.meta.roleId
      ? [{
          roleId: item.meta.roleId,
          companyName: item.meta.companyName,
          title: item.title,
          location: item.meta.location ?? null,
          description: item.snippet,
        }]
      : []
  );
}

/** Career's planner (same model and limits as a member's search plan) for the posting, once more if it gives no plan. */
async function pick(posting: PreparedRolesPosting, candidates: readonly PreparedRolesHarperCandidate[]): Promise<PreparedRolesPick> {
  const ids = new Set(candidates.map((role) => role.roleId));
  const input = buildPreparedRolesInput(posting, candidates);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runTalentAssistantCompletion({
        ...v2CompletionRequest(PREPARED_ROLES_PROMPT, input, "plan"),
        openAIResponsesReasoningEffort: "medium",
        usageLabel: "official_jobs:prepared_roles",
      });
      return parsePreparedRolesPick(JSON.parse(raw), ids);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("planner failed");
}

/** Career's posting search without a person: open public postings only, Harper-connected companies left to the pick. */
async function searchPublic(admin: TalentAdminClient, chosen: PreparedRolesPick): Promise<string[]> {
  const vectors = await embedSearchTitles(chosen.plan.roleTitles);
  const { rows } = await retrieveRoles({
    admin,
    plan: chosen.plan,
    vectors,
    targetSalaryKrw: chosen.targetSalaryKrw,
    // Only used to leave out postings already recommended to a member; nobody has this id.
    userId: randomUUID(),
    blockedCompanies: [],
    excludeInternalCompanies: true,
    limit: PREPARED_PUBLIC_POSTINGS,
    listOnly: true,
  });
  return rows.map((row) => String(row.role_id ?? "")).filter(Boolean);
}

export type PreparedRolesSources = {
  postings: (admin: TalentAdminClient, slugs?: readonly string[]) => Promise<PreparedRolesPosting[]>;
  harperCandidates: () => Promise<PreparedRolesHarperCandidate[]>;
  pick: typeof pick;
  searchPublic: typeof searchPublic;
  /** Replaces a posting's rows: the new ones first, then the older ones (no moment without a list). */
  write: (admin: TalentAdminClient, postingId: string, rows: PreparedRoleRow[], preparedAt: string) => Promise<void>;
  /** Removes the rows of postings that are no longer published or got a Harper Role. */
  prune: (admin: TalentAdminClient, keepPostingIds: readonly string[]) => Promise<void>;
};

const table = (admin: TalentAdminClient) => admin.from(OFFICIAL_JOB_PREPARED_ROLES_TABLE as never) as any;

const LIVE_SOURCES: PreparedRolesSources = {
  postings: noRolePostings,
  harperCandidates,
  pick,
  searchPublic,
  async write(admin, postingId, rows, preparedAt) {
    if (rows.length) {
      const { error } = await table(admin).upsert(rows, { onConflict: "official_job_id,role_id" });
      if (error) throw new Error(`write: ${error.message}`);
    }
    const { error } = await table(admin).delete().eq("official_job_id", postingId).lt("prepared_at", preparedAt);
    if (error) throw new Error(`replace: ${error.message}`);
  },
  async prune(admin, keepPostingIds) {
    const query = table(admin).delete();
    const { error } = await (keepPostingIds.length
      ? query.not("official_job_id", "in", `(${keepPostingIds.join(",")})`)
      : query.gte("rank", 0));
    if (error) throw new Error(`prune: ${error.message}`);
  },
};

export type PreparedRolesPostingResult = {
  slug: string;
  ok: boolean;
  harperRoles: Array<{ roleId: string; reason: string }>;
  publicPostings: number;
  roleTitles: string[];
  error?: string;
};

/**
 * Prepares every published posting with no Harper Role (or only the given slugs). A posting whose build fails keeps
 * its previous list; dryRun returns the picks without writing.
 */
export async function buildOfficialJobPreparedRoles(args: {
  admin?: TalentAdminClient;
  dryRun?: boolean;
  slugs?: readonly string[];
  sources?: PreparedRolesSources;
  now?: Date;
} = {}) {
  const admin = args.admin ?? getTalentSupabaseAdmin();
  const sources = args.sources ?? LIVE_SOURCES;
  const preparedAt = (args.now ?? new Date()).toISOString();
  const [postings, candidates] = await Promise.all([sources.postings(admin, args.slugs), sources.harperCandidates()]);
  const results: PreparedRolesPostingResult[] = new Array(postings.length);
  let next = 0;
  const worker = async () => {
    while (next < postings.length) {
      const index = next++;
      const posting = postings[index];
      try {
        const chosen = await sources.pick(posting, candidates);
        const publicRoleIds = await sources.searchPublic(admin, chosen);
        const rows = preparedRoleRows({ postingId: posting.id, harperRoles: chosen.harperRoles, publicRoleIds, preparedAt });
        if (!args.dryRun) await sources.write(admin, posting.id, rows, preparedAt);
        results[index] = {
          slug: posting.slug, ok: true, harperRoles: chosen.harperRoles,
          publicPostings: rows.filter((row) => row.kind === "public").length, roleTitles: chosen.plan.roleTitles,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[official-jobs:prepared-roles] posting failed", { slug: posting.slug, error: message });
        results[index] = { slug: posting.slug, ok: false, harperRoles: [], publicPostings: 0, roleTitles: [], error: message.slice(0, 300) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, postings.length) }, worker));
  // Only a full build knows which postings still need a list.
  if (!args.dryRun && !args.slugs?.length) await sources.prune(admin, postings.map((posting) => posting.id));
  return {
    preparedAt,
    harperCandidates: candidates.length,
    prepared: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    postings: results,
  };
}
