import type { OrgAgentAdminClient } from "@/lib/org/agent/data";

export type PendingOrgAgentUpdateProposal = {
  expiresAt: string;
  preview: string;
  proposalId: string;
  summary: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Returns only the compact user-visible pointer. Exact before/final values stay
 * in the proposal payload and are consumed exclusively by the resolve RPC.
 */
export async function fetchPendingOrgAgentUpdateProposal(args: {
  admin: OrgAgentAdminClient;
  scopeKey: string;
  workspaceId: string;
}): Promise<PendingOrgAgentUpdateProposal | null> {
  const { data, error } = await (
    args.admin.from("company_agent_update_proposals" as any) as any
  )
    .select("id, summary, preview, expires_at")
    .eq("workspace_id", args.workspaceId)
    .eq("scope_key", args.scopeKey)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const proposalId = text(data.id);
  const summary = text(data.summary);
  if (!proposalId || !summary) return null;
  return {
    expiresAt: text(data.expires_at),
    preview: text(data.preview),
    proposalId,
    summary,
  };
}

export async function hasPendingOrgAgentUpdateProposal(args: {
  admin: OrgAgentAdminClient;
  scopeKey: string;
  workspaceId: string;
}) {
  const { data, error } = await (
    args.admin.from("company_agent_update_proposals" as any) as any
  )
    .select("id")
    .eq("workspace_id", args.workspaceId)
    .eq("scope_key", args.scopeKey)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function formatPendingOrgAgentUpdateProposal(
  proposal: PendingOrgAgentUpdateProposal | null
) {
  if (!proposal) return "-";
  const preview = Array.from(proposal.preview).slice(0, 800).join("");
  return [
    `proposalId: ${proposal.proposalId}`,
    `summary: ${proposal.summary}`,
    `preview: ${preview || "(미리보기 없음)"}`,
    "Only apply this exact stored proposal after direct confirmation. Never say its ID to the user.",
  ].join("\n");
}
