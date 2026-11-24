import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";

/**
 * Gmail connection steps in `logs`, one row per step:
 * - career_gmail_connect_started: the person pressed connect and was sent to Google (or was already connected).
 * - career_gmail_connect_start_failed: the connect request failed before reaching Google.
 * - career_gmail_connect_returned: the browser came back from Google with the provider's status.
 * A start with no return for the same connectedAccountId means the person stayed or stopped on Google's screen.
 */
export type GmailConnectLogType =
  | "career_gmail_connect_started"
  | "career_gmail_connect_start_failed"
  | "career_gmail_connect_returned";

export type GmailConnectLogMetadata = Record<
  string,
  string | number | boolean | null
>;

/** Writing the log never changes the connection's outcome. */
export async function logGmailConnectEvent(args: {
  admin: TalentAdminClient;
  metadata: GmailConnectLogMetadata;
  type: GmailConnectLogType;
  userId: string;
}) {
  try {
    const { error } = await args.admin.from("logs").insert({
      meta_data: args.metadata,
      type: args.type,
      user_id: args.userId,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[GmailConnect] log failed", {
      error: (error as { message?: string })?.message ?? String(error),
      type: args.type,
    });
  }
}
