import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import {
  assertOrgRoleAccess,
  fetchOrgBoard,
  OrgHttpError,
} from "@/lib/org/server";
import {
  candidateSaveId,
  ORG_CANDIDATE_SAVE_KIND,
} from "@/lib/org/candidateSaved.server";
import { isOrgInboxStage } from "@/lib/org/pipelineStage";

/**
 * Saves or unsaves a candidate for a Role (the company's bookmark). The
 * candidate never sees it. The decision record picks it up from the progress
 * row (record_company_progress_decision_v1).
 */
export async function setOrgCandidateSaved(args: {
  /** Where the company decided. The web leaves it out, as before. */
  channel?: "web" | "chat" | "slack" | "email";
  /** The caller's key for this decision (see setOrgCandidateStage). */
  decisionKey?: string | null;
  recommendationId: string;
  roleId: string;
  saved: boolean;
  sourceMessageId?: number | null;
  talentId: string;
  user: User;
  workspaceId: string;
}) {
  const admin = getSupabaseAdmin();
  await assertOrgRoleAccess({
    admin,
    user: args.user,
    workspaceId: args.workspaceId,
    roleId: args.roleId,
  });
  // Reuse authoritative company visibility, including ready proposals.
  const board = await fetchOrgBoard({
    user: args.user,
    workspaceId: args.workspaceId,
    roleId: args.roleId,
    includeProfileLabels: false,
  });
  const item = board.items.find(
    (item) =>
      item.talentId === args.talentId &&
      item.recommendationId === args.recommendationId
  );
  if (!item) throw new OrgHttpError(404, "Candidate not found");
  if (args.saved && !isOrgInboxStage(item.stage))
    throw new OrgHttpError(409, "This candidate has already left the inbox");
  const savedAt = args.saved ? new Date().toISOString() : null;
  const { error } = await admin.from("talent_progress").upsert(
    {
      id: candidateSaveId(args.workspaceId, item),
      kind: ORG_CANDIDATE_SAVE_KIND,
      role_id: item.roleId,
      talent_id: item.talentId,
      recommendation_id:
        item.source === "recommendation" ? item.recommendationId : null,
      user_id: args.user.email ?? args.user.id,
      text: args.saved ? "saved" : "unsaved",
      created_at: savedAt ?? new Date().toISOString(),
      open_to_talent: false,
      open_to_company: false,
      metadata: {
        workspaceId: args.workspaceId,
        saved: args.saved,
        stage: item.stage,
        actorUserId: args.user.id,
        ...(args.channel && args.channel !== "web"
          ? { decisionChannel: args.channel }
          : {}),
        ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
        ...(args.decisionKey ? { decisionKey: args.decisionKey } : {}),
      },
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  return { ok: true as const, savedAt };
}
