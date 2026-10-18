import type { User } from "@supabase/supabase-js";
import { isOrgLocale } from "@/i18n/org/locale";
import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import { OrgAgentToolInputError } from "@/lib/org/agent/toolAvailability";
import { saveOrgMemberLocale } from "@/lib/org/memberLocale.server";
import { assertOrgWorkspacePermission, OrgHttpError } from "@/lib/org/server";
import { saveOrgWorkspaceLocale } from "@/lib/org/workspaceLocale.server";

const LANGUAGE_NAMES = { en: "English", ko: "Korean" } as const;

// The company-side LLM decides that a request is lasting; the server checks only
// the value, membership and, for the company language, workspace management.
export async function updateCompanyLanguageSetting(args: {
  admin: OrgAgentAdminClient; user: User; workspaceId: string; input: Record<string, unknown>;
}) {
  const { language, target } = args.input;
  if (!isOrgLocale(language) || (target !== "me" && target !== "company"))
    throw new OrgAgentToolInputError("language must be ko or en, and target must be me or company");
  if (target === "me") {
    await assertOrgWorkspacePermission({ admin: args.admin, user: args.user, workspaceId: args.workspaceId, permission: "view" });
    if (!(await saveOrgMemberLocale(args.user.id, language, args.admin)))
      throw new OrgAgentToolInputError("This user has no team member profile, so nothing was saved.");
    return { status: "saved", target, language, appliesTo: "Harper's replies to this user in web chat and Slack",
      replyLanguage: LANGUAGE_NAMES[language] };
  }
  try {
    await assertOrgWorkspacePermission({ admin: args.admin, user: args.user, workspaceId: args.workspaceId, permission: "manage_workspace" });
  } catch (error) {
    if (error instanceof OrgHttpError && error.status === 403)
      throw new OrgAgentToolInputError("Only an Owner or an organization-wide Admin can change the company language. Nothing was saved.");
    throw error;
  }
  if (!(await saveOrgWorkspaceLocale(args.workspaceId, language, args.admin)))
    throw new OrgAgentToolInputError("The company language cannot be saved yet. Nothing was saved, and company-wide messages keep their current language.");
  return { status: "saved", target, language,
    appliesTo: "company-wide messages in this workspace, such as channel notices, candidate introductions and company-first recommendations" };
}
