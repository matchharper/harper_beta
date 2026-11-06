import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";

export async function readPendingInternalProposals(args: {
  admin: TalentAdminClient; userId: string; offset?: number; limit?: number;
  companyNames?: string[]; postingUrl?: string | null;
}) {
  const offset = args.offset ?? 0, limit = args.limit ?? 8;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Invalid proposal page.");
  const { data, error } = await (args.admin.rpc as any)("read_career_internal_selections_v1", {
    p_talent: args.userId, p_offset: offset, p_limit: limit + 1,
    p_companies: args.companyNames?.length ? args.companyNames : null,
    p_posting_url: args.postingUrl ?? null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    role_id: string; selected_at: string; company_name: string; role_name: string; total_count: number;
  }>;
  return {
    proposals: rows.slice(0, limit).map(row => ({ roleId: row.role_id,
      company: row.company_name, title: row.role_name, selectedAt: formatLlmDateTime(row.selected_at) })),
    total: rows[0] ? Number(rows[0].total_count) : offset === 0 ? 0 : null,
    nextOffset: rows.length > limit ? offset + limit : null,
  };
}

export async function readInternalProposalContext(args: { admin: TalentAdminClient; userId: string }) {
  const page = await readPendingInternalProposals({ ...args, limit: 6 });
  return [
    `Harper-connected proposals already selected for this candidate, not yet published: ${page.total}. Times: Asia/Seoul.`,
    ...page.proposals.map(p => `- ${p.company} · ${p.title}; roleId ${p.roleId}; selected ${p.selectedAt}`),
    "read_recommended_opportunities reads recommendations and selected unpublished proposals; get_role_context reads details. This index does not measure all-role evaluation coverage or create new selections.",
    ...(page.nextOffset === null ? [] : [`Further selected proposals: read_recommended_opportunities with pendingOffset=${page.nextOffset}.`]),
  ].join("\n");
}
