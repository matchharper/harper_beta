import { canUseCareerDevControls } from "@/lib/internalAccess";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { CAREER_BROWSER_SERVICE_TIER_HEADER, resolveCareerBrowserServiceTier } from "./browserServiceTier";

export function resolveCareerRequestBrowserServiceTier(
  request: Pick<Request, "headers">,
  user: { email?: string | null },
) {
  return resolveCareerBrowserServiceTier(canUseCareerDevControls(user.email)
    ? request.headers.get(CAREER_BROWSER_SERVICE_TIER_HEADER) : undefined);
}

/** Read the server-authorized selection, including after a form or background continuation.
 * A later user turn must not change the selection of an already admitted turn. */
export async function readCareerBrowserServiceTier(args: {
  admin: TalentAdminClient; userId: string; conversationId: string; userMessageId?: number;
}) {
  let query = args.admin.from("talent_messages").select("payload")
    .eq("user_id", args.userId).eq("conversation_id", args.conversationId).eq("role", "user")
    .not("payload->>careerBrowserServiceTier", "is", null);
  if (args.userMessageId) query = query.lte("id", args.userMessageId);
  const { data, error } = await query.order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const payload = data?.payload as Record<string, unknown> | null | undefined;
  return resolveCareerBrowserServiceTier(payload?.careerBrowserServiceTier);
}
