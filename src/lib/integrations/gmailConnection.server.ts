import { scheduleCareerConversationContinuation } from "@/lib/career/onboardingContinuation.server";
import { wakeMailSyncForUser } from "@/lib/career/emailWriting/sync";
import { notifyApplicationAwaitingEmailCode, scheduleLocalGmailReview } from "@/lib/career/background/gmailReview";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import type { OpportunityRunRow } from "@/lib/opportunityDiscovery/types";

/** Call only after checking the authenticated user's live provider grant. */
export async function confirmCareerGmailConnection(args: {
  admin: TalentAdminClient;
  talentId: string;
  connectedAccountId: string;
  conversationId?: string | null;
  previousConnection?: string | null;
  readGranted: boolean;
}) {
  const { data, error } = await args.admin.rpc(
    "confirm_career_gmail_connection_v1",
    {
      p_user: args.talentId,
      p_account: args.connectedAccountId,
      p_conversation: args.conversationId ?? null,
      p_read_granted: args.readGranted,
      p_previous_connection: args.previousConnection ?? null,
    }
  );
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  const receipt = data as {
    conversationId: string | null;
    connectionChanged?: boolean;
    run?: OpportunityRunRow;
    review?: { id: string } | null;
  };
  // Before the 20261123070000 migration the connection itself started the inbox review; after it, the review
  // waits its turn (career/background/gmailReview.ts) and only an application waiting for an emailed code hears now.
  if (receipt.run) scheduleCareerConversationContinuation(receipt.run);
  if (receipt.review) scheduleLocalGmailReview(args.admin, args.talentId);
  if (args.readGranted)
    await notifyApplicationAwaitingEmailCode(args.admin, args.talentId).catch((error) =>
      console.warn("[career-gmail] Waiting application not told about the connection", {
        error: String(error),
      })
    );
  if (receipt.connectionChanged && args.readGranted)
    await wakeMailSyncForUser({
      admin: args.admin,
      userId: args.talentId,
    }).catch((error) =>
      console.warn("[career-mail] Reconnect catch-up deferred", {
        error: String(error),
      })
    );
  return { conversationId: receipt.conversationId };
}
