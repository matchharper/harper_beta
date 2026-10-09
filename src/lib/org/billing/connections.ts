import { randomUUID } from "node:crypto";
import { billingDb, billingRpc, throwBillingDbError } from "./store";
import { WorkspaceBillingError } from "./types";

export type ConnectionApproval = {
  id: string;
  actor_id: string;
  completed_at: string | null;
  created_at: string;
  action_payload: {
    input: Record<string, unknown>;
    introEmails: string[];
    isIntroRequested: boolean;
    previousStage: string;
  };
};
export async function findConnectionApproval(
  workspaceId: string,
  recommendationId: string
) {
  const { data, error } = await billingDb()
    .from("company_workspace_credit_events")
    .select("id,actor_id,completed_at,created_at,action_payload")
    .eq("company_workspace_id", workspaceId)
    .eq("action_code", "connect")
    .eq("business_key", recommendationId)
    .maybeSingle();
  throwBillingDbError(error);
  return data as ConnectionApproval | null;
}
export async function approveConnection(args: {
  workspaceId: string;
  roleId: string;
  talentId: string;
  recommendationId: string;
  actorId: string;
  input: Record<string, unknown>;
  introEmails: string[];
  isIntroRequested: boolean;
  previousStage: string;
}) {
  const id = await billingRpc<string | null>("workspace_billing_debit_v1", {
    p_workspace: args.workspaceId,
    p_action: "connect",
    p_key: args.recommendationId,
    p_role: args.roleId,
    p_talent: args.talentId,
    p_actor: args.actorId,
    p_payload: {
      input: args.input,
      introEmails: args.introEmails,
      isIntroRequested: args.isIntroRequested,
      previousStage: args.previousStage,
    },
  });
  return id;
}
export async function claimConnection(id: string) {
  const token = randomUUID();
  const claimed = await billingRpc<boolean>(
    "workspace_billing_claim_action_v1",
    { p_event: id, p_token: token }
  );
  if (!claimed) throw new WorkspaceBillingError("billing_conflict");
  return token;
}
export async function completeConnection(id: string, token: string) {
  const completed = await billingRpc<boolean>(
    "workspace_billing_complete_action_v1",
    { p_event: id, p_token: token }
  );
  if (!completed) throw new WorkspaceBillingError("billing_conflict");
}

export async function releaseConnection(id: string, token: string) {
  try {
    await billingRpc("workspace_billing_release_action_v1", {
      p_event: id,
      p_token: token,
    });
  } catch (error) {
    console.error("[billing/release]", id, error);
  }
}
