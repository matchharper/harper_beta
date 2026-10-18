import "server-only";

import { isOrgLocale, type OrgLocale } from "@/i18n/org/locale";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";

type Admin = ReturnType<typeof getSupabaseAdmin>;

// company_users.locale is the team member's own language for Harper's replies.
export async function getOrgMemberLocale(
  userId: string,
  admin: Admin = getSupabaseAdmin()
): Promise<OrgLocale | null> {
  const { data, error } = await admin
    .from("company_users")
    .select("locale")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return isOrgLocale(data?.locale) ? data.locale : null;
}

// Returns the saved language, or null when the member has no company_users row.
export async function saveOrgMemberLocale(
  userId: string,
  locale: OrgLocale,
  admin: Admin = getSupabaseAdmin()
): Promise<OrgLocale | null> {
  const { data, error } = await admin
    .from("company_users")
    .update({ locale })
    .eq("user_id", userId)
    .select("locale")
    .maybeSingle();
  if (error) throw error;
  return isOrgLocale(data?.locale) ? data.locale : null;
}

// Web chat sends the screen language. A saved member language wins, so a
// language changed in conversation applies before the screen reloads.
export async function resolveOrgChatResponseLocale(args: {
  admin?: Admin;
  screenLocale?: OrgLocale;
  userId: string;
}): Promise<OrgLocale | undefined> {
  try {
    return (await getOrgMemberLocale(args.userId, args.admin)) ?? args.screenLocale;
  } catch (error) {
    console.warn("[org/member-locale:read]", error);
    return args.screenLocale;
  }
}
