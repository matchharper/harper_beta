import { v5 as uuidv5 } from "uuid";
import { isInternalDomainEmail } from "@/lib/internalAccess";
import type { getSupabaseAdmin } from "@/lib/server/candidateAccess";

// A stable primary key makes simultaneous opens and cross-channel retries atomic.
export function candidateProfileViewId(
  workspaceId: string,
  companyUserId: string,
  talentId: string
) {
  return uuidv5(
    JSON.stringify([
      "org_candidate_profile_first_view",
      workspaceId.toLowerCase(),
      companyUserId.toLowerCase(),
      talentId.toLowerCase(),
    ]),
    uuidv5.URL
  );
}

// Call only after the surface has authorized and displayed this candidate.
export async function recordCandidateProfileView(args: {
  admin: ReturnType<typeof getSupabaseAdmin>;
  companyUserId: string;
  email: string | null | undefined;
  roleId: string;
  source: "web" | "slack";
  talentId: string;
  workspaceId: string;
}) {
  if (isInternalDomainEmail(args.email)) return;
  const { error } = await (args.admin.from("talent_progress") as any).upsert(
    {
      id: candidateProfileViewId(
        args.workspaceId,
        args.companyUserId,
        args.talentId
      ),
      company_user_id: args.companyUserId,
      talent_id: args.talentId,
      role_id: args.roleId,
      user_id: args.email,
      kind: "org_candidate_profile_first_view",
      text: "후보자 프로필을 처음 열람했습니다.",
      metadata: { workspaceId: args.workspaceId, source: args.source },
      open_to_company: false,
      open_to_talent: false,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw error;
}
