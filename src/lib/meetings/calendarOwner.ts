import { GoogleCalendarError } from "@/lib/integrations/googleCalendarError";
import type { ComposioConnectedAccount } from "@/lib/integrations/composio";

export type MeetingCalendarOwner = {
  kind: "personal" | "harper";
  accountId: string;
  userId: string;
};

/** Persist this choice before the first external write. Retries never switch hosts. */
export async function resolveMeetingCalendarOwner(args: {
  organizerId: string;
  pinned?: MeetingCalendarOwner | null;
  personalAccount: (userId: string) => Promise<string>;
  getAccount: (id: string) => Promise<ComposioConnectedAccount>;
  authConfigId: string;
  hostedAccountId?: string;
  hostedUserId?: string;
}) {
  if (args.pinned) {
    const pinned = args.pinned;
    const account = await args.getAccount(pinned.accountId);
    if (
      account.id !== pinned.accountId ||
      account.user_id !== pinned.userId ||
      account.toolkit?.slug !== "googlecalendar" ||
      account.auth_config?.id !== args.authConfigId ||
      account.auth_config?.is_disabled ||
      account.is_disabled ||
      account.status !== "ACTIVE"
    )
      throw new Error(
        "The original meeting Calendar connection is unavailable. Reconnect it before retrying; the event host was preserved."
      );
    if (
      pinned.kind === "personal" &&
      (pinned.userId !== args.organizerId ||
        (await args.personalAccount(args.organizerId)) !== pinned.accountId)
    )
      throw new Error(
        "The original personal Calendar connection changed. The event host was preserved."
      );
    return pinned;
  }
  try {
    return {
      kind: "personal",
      accountId: await args.personalAccount(args.organizerId),
      userId: args.organizerId,
    } satisfies MeetingCalendarOwner;
  } catch (error) {
    // Provider outages and ownership errors must not silently switch organizers.
    if (
      !(error instanceof GoogleCalendarError) ||
      !["NOT_CONNECTED", "AUTH_EXPIRED"].includes(error.code)
    )
      throw error;
  }
  if (!args.hostedAccountId || !args.hostedUserId)
    throw new Error(
      "Harper's shared Google Calendar is not configured. Coordination can continue, but invitations cannot yet be created without a personal Calendar connection."
    );
  return resolveMeetingCalendarOwner({
    ...args,
    pinned: {
      kind: "harper",
      accountId: args.hostedAccountId,
      userId: args.hostedUserId,
    },
  });
}
