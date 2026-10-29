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
 * marked delivered once the email went out; a failed attempt keeps it for
 * the retry. When the candidate first has to confirm they want to continue,
 * nothing is sent and the link is released.
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
        meetingPurpose:
          args.meeting?.meetingPurpose ??
          defaultFirstMeetingPurpose(args.locale),
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
  const payload = await setOrgCandidateStage({
    ...input,
    introBookingLink: { label: booking.linkLabel, url: booking.invitationUrl },
  });
  if (!("stage" in payload)) {
    try {
      await releaseMeetingInvitationHeldForIntro({
        queueId: booking.queueId,
        roundId: booking.roundId,
        scheduleId: meeting.scheduleId,
      });
    } catch (error) {
      console.error("[intro-booking:release]", error);
    }
    return { bookingLinkIncluded: false, meeting: null, payload };
  }
  try {
    await traceStageStep("booking:delivered", async () =>
      markMeetingInvitationSentInIntro({
        introMessageId:
          "introEmailMessageId" in payload
            ? String(payload.introEmailMessageId ?? "")
            : "",
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
