export type CandidateDeliveryFacts = {
  availableInAppAt: string;
  emailSentAt: string | null;
};

/** Called only after workspace authorization. Never returns candidate feedback. */
export async function readCandidateDeliveryFacts(args: {
  admin: { rpc: (...args: any[]) => any };
  workspaceId: string;
  roleIds: string[];
  talentIds: string[];
}) {
  const facts = new Map<string, CandidateDeliveryFacts>();
  if (!args.roleIds.length || !args.talentIds.length) return facts;
  const { data, error } = await args.admin.rpc("read_company_candidate_delivery_v1", {
    p_company_workspace_id: args.workspaceId,
    p_role_ids: args.roleIds,
    p_talent_ids: args.talentIds,
  });
  if (error) {
    // Optional delivery evidence must not make the authorized board/detail
    // unreadable when its RPC is unavailable. Missing evidence stays unknown.
    console.warn("[company/candidate-delivery] facts unavailable", { code: error.code ?? "unknown" });
    return facts;
  }
  for (const row of data ?? []) {
    facts.set(`${row.talent_id}:${row.role_id}`, {
      availableInAppAt: row.available_in_app_at,
      emailSentAt: row.email_sent_at,
    });
  }
  return facts;
}
