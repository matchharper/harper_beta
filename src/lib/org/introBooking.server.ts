import "server-only";

import {
  markMeetingInvitationSentInIntro,
  releaseMeetingInvitationHeldForIntro,
  reserveMeetingInvitationForIntro,
} from "@/lib/meetings/invitationServer";
import {
  createMeetingScheduleDraft,
  prepareMeetingScheduleDraftForStage,
} from "@/lib/meetings/scheduleDraftServer";
import { findConnectionApproval } from "@/lib/org/billing/connections";
import { OrgHttpError, setOrgCandidateStage } from "@/lib/org/server";
import { traceStageStep } from "@/lib/org/stageTiming.server";

type StageInput = Omit<
  Parameters<typeof setOrgCandidateStage>[0],
  "introBookingLink"
>;

export type IntroBookingMeeting = {
  attendeeEmails?: string[];
  durationMinutes?: unknown;
  meetingCandidateMessage?: unknown;
  meetingPurpose?: unknown;
  title?: unknown;
};

/** The meeting's topic when nobody wrote one, as on the web dialog. */
export function defaultFirstMeetingPurpose(locale?: string | null) {
  return locale === "en"
    ? "A first conversation to get to know each other"
    : "서로를 알아 가는 첫 대화";
}

/** Whether this decision sends the first intro email, which can carry the link. */
export function canCarryIntroBookingLink(input: StageInput) {
  const stage = String(input.stage ?? "");
  return (
    (stage === "connected" || stage.startsWith("custom:")) &&
    input.expectedPreviousStage === "pending_connection" &&
    !input.contactDirectly &&
    !input.scheduleInterview &&
    !input.skipAutomaticContact
  );
}

/**
 * Accept Intro with the interview booking link inside the intro email, the
 * same way from the web, Slack, email buttons and Harper chat.
 *
 * - `required`: the person chose to include it (web). A Calendar or open
 *   times problem stops the move with its usual message.
 * - `if_ready`: added when the person's Calendar and open times are set;
 *   otherwise the intro email goes without it, as before.
 *
 * The link is reserved before the email so the email can carry it, and
 * marked delivered once the email went out. A failed attempt whose approval
 * was saved keeps it for the retry. Any other attempt that sent no email
 * (the candidate first has to confirm they want to continue, a teammate
 * decided first, an old screen re-submitted) releases it.
 */
export async function setOrgCandidateStageWithIntroBooking(args: {
  baseUrl: string;
  booking: "required" | "if_ready";
  /** For the default meeting topic. */
  locale?: string | null;
  meeting?: IntroBookingMeeting;
  stage: StageInput;
}) {
  const input = args.stage;
  const withoutLink = async () => ({
    bookingLinkIncluded: false,
    meeting: null,
    payload: await setOrgCandidateStage(input),
  });
  if (!canCarryIntroBookingLink(input)) {
    if (args.booking === "required") {
      throw new OrgHttpError(
        400,
        "연결 수락할 후보를 선택해 인터뷰를 요청해 주세요."
      );
    }
    return withoutLink();
  }

  const stage = String(input.stage);
  let reserved: {
    booking: Awaited<ReturnType<typeof reserveMeetingInvitationForIntro>>;
    meeting: Awaited<ReturnType<typeof createMeetingScheduleDraft>>;
  };
  try {
    const prepared = await traceStageStep("booking:prepare", async () =>
      prepareMeetingScheduleDraftForStage({
        attendeeEmails:
          args.meeting?.attendeeEmails ??
          (input.user.email ? [input.user.email] : []),
        durationMinutes: args.meeting?.durationMinutes,
        meetingCandidateMessage: args.meeting?.meetingCandidateMessage,
        // A custom stage keeps the topic saved for it: a topic passed here
        // would be saved over it.
        meetingPurpose:
          args.meeting?.meetingPurpose ??
          (stage === "connected"
            ? defaultFirstMeetingPurpose(args.locale)
            : undefined),
        recommendationId: input.recommendationId,
        roleId: input.roleId,
        sourceStage: input.expectedPreviousStage,
        stageId: stage.startsWith("custom:") ? stage.slice(7) : null,
        talentId: input.talentId,
        title: args.meeting?.title,
        user: input.user,
        workspaceId: input.workspaceId,
      })
    );
    if (args.booking === "if_ready" && prepared.draft?.draftBlocker) {
      return withoutLink();
    }
    const meeting = await traceStageStep("booking:draft", async () =>
      createMeetingScheduleDraft({
        ...prepared,
        sourceCompanyMessageId: null,
        webRequestKey: "initial-connection",
      })
    );
    const booking = await traceStageStep("booking:reserve", async () =>
      reserveMeetingInvitationForIntro({
        baseUrl: args.baseUrl,
        scheduleId: meeting.scheduleId,
        user: input.user,
        workspaceId: input.workspaceId,
      })
    );
    reserved = { booking, meeting };
  } catch (error) {
    if (args.booking === "required") throw error;
    // The intro still goes; only the link could not be set up.
    console.error("[intro-booking:skipped]", error);
    return withoutLink();
  }

  const { booking, meeting } = reserved;
  // The connection approval keeps the link for a retry once it is saved,
  // and a parallel attempt (a second click or tab) sends this same link.
  // Either way the link must stay; null when that could not be checked.
  const approvalKeepsLink = async () => {
    try {
      const approval = await findConnectionApproval(
        input.workspaceId,
        input.recommendationId
      );
      const kept = approval?.action_payload?.input?.introBookingLink;
      return Boolean(
        kept &&
          typeof kept === "object" &&
          (kept as { url?: unknown }).url === booking.invitationUrl
      );
    } catch (error) {
      console.error("[intro-booking:approval]", error);
      return null;
    }
  };
  // Takes back a link no email carried, so the candidate never sees it.
  const release = async () => {
    try {
      await releaseMeetingInvitationHeldForIntro({
        queueId: booking.queueId,
        roundId: booking.roundId,
        scheduleId: meeting.scheduleId,
      });
    } catch (error) {
      console.error("[intro-booking:release]", error);
    }
  };
  const releaseUnlessKept = async () => {
    if ((await approvalKeepsLink()) === false) await release();
  };

  let payload: Awaited<ReturnType<typeof setOrgCandidateStage>>;
  try {
    payload = await setOrgCandidateStage({
      ...input,
      introBookingLink: {
        label: booking.linkLabel,
        url: booking.invitationUrl,
      },
    });
  } catch (error) {
    // A teammate decided first, the Role closed, Intros ran out or the
    // email failed.
    await releaseUnlessKept();
    throw error;
  }
  if (!("stage" in payload)) {
    await releaseUnlessKept();
    return { bookingLinkIncluded: false, meeting: null, payload };
  }
  const introMessageId =
    "introEmailMessageId" in payload
      ? String(payload.introEmailMessageId ?? "")
      : "";
  if (!introMessageId) {
    // Already connected before (a repeated click, an old Slack or email
    // screen): this attempt sent no email. Only when the earlier email
    // carried this same link was it delivered, and that attempt records it.
    const kept = await approvalKeepsLink();
    if (kept === false) await release();
    const carried = kept === true;
    return {
      bookingLinkIncluded: carried,
      meeting: carried ? meeting : null,
      payload,
    };
  }
  try {
    await traceStageStep("booking:delivered", async () =>
      markMeetingInvitationSentInIntro({
        introMessageId,
        queueId: booking.queueId,
        roundId: booking.roundId,
      })
    );
  } catch (error) {
    // The email and its link already went out; only the reminder clock is
    // missing. Kept visible in the logs rather than failing the move.
    console.error("[intro-booking:delivered]", error);
  }
  return { bookingLinkIncluded: true, meeting, payload };
}
