import { AsyncLocalStorage } from "node:async_hooks";
import type { User } from "@supabase/supabase-js";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { OrgHttpError } from "./httpError";

type Admin = ReturnType<typeof getSupabaseAdmin>;
type OnboardingScope = { workspaceId: string; userId: string };
const onboardingScope = new AsyncLocalStorage<OnboardingScope>();

/** Server-owned exception for the existing Pitch onboarding turn only. */
export function withReviewOnboarding<T>(scope: OnboardingScope, run: () => T): T {
  return onboardingScope.run(scope, run);
}

export function isReviewOnboarding(workspaceId: string, userId: string) {
  const scope = onboardingScope.getStore();
  return scope?.workspaceId === workspaceId && scope.userId === userId;
}

export async function readWorkspaceReview(admin: Admin, workspaceId: string) {
  const { data, error } = await (admin.from("company_workspace") as any)
    .select("is_reviewing")
    .eq("company_workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new OrgHttpError(404, "Workspace not found");
  return data.is_reviewing === true;
}

export async function assertWorkspaceAvailable(args: {
  admin: Admin;
  workspaceId: string;
  user?: Pick<User, "id">;
  allowReviewSetup?: boolean;
}) {
  if (args.allowReviewSetup) return;
  if (args.user && isReviewOnboarding(args.workspaceId, args.user.id)) return;
  if (await readWorkspaceReview(args.admin, args.workspaceId)) {
    throw new OrgHttpError(403, "org_workspace_under_review");
  }
}

/** The onboarding exception cannot grant hiring, contact, or other document writes. */
export function assertReviewOnboardingTool(
  workspaceId: string,
  userId: string,
  name: string,
  input: Record<string, unknown>
) {
  if (!isReviewOnboarding(workspaceId, userId)) return;
  const companyRead =
    name === "get_more_data" &&
    Array.isArray(input.kinds) &&
    input.kinds.length > 0 &&
    input.kinds.every((kind) => kind === "company_details");
  const pitchWrite =
    name === "update_data" &&
    !input.proposalId &&
    !input.baseProposalId &&
    !input.proposalAction &&
    Array.isArray(input.changes) &&
    input.changes.length > 0 &&
    input.changes.every((change) => {
      if (!change || typeof change !== "object") return false;
      const item = change as Record<string, unknown>;
      return item.key === "pitch" && !item.roleId;
    });
  if (!companyRead && !pitchWrite) {
    throw new OrgHttpError(403, "org_workspace_under_review");
  }
}
