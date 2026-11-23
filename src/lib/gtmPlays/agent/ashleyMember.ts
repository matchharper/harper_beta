/**
 * #5 The pure parts of a company's word reaching one of Ashley's candidates who is a Harper member (ashleyMember.server.ts
 * does the reads and writes): which way Harper's member connection request goes from the member's card, and what the
 * Career run that tells the member about a company's answer is given (never the company's words: those are in the chat
 * message it names, written as they are).
 */

/** talent_messages.payload key of a company's answer written into a member's chat (once per key). */
export const MEMBER_ANSWER_PAYLOAD_KEY = "gtmCompanyAnswer";
/** opportunity_discovery_run.trigger_payload key naming that message (the run that tells the member; once per message). */
export const MEMBER_ANSWER_RUN_KEY = "gtmCompanyAnswerMessageId";
/** external_intro_requests.result keys of a request that went on as Harper's member request. */
export const MEMBER_INTRO_DONE = "memberIntroDone";
export const MEMBER_INTRO_TRIES_KEY = "memberIntroTries";
export const MEMBER_INTRO_GAVE_UP = "memberIntroGaveUp";
/** external_intro_requests.result keys of an unreachable notice: its failed tries, and given up (a person tells the company). */
export const UNREACHABLE_NOTICE_TRIES_KEY = "unreachableNoticeTries";
export const UNREACHABLE_NOTICE_GAVE_UP = "unreachableNoticeGaveUp";

/**
 * The member's card in the company's Role (company_intro_candidates.status), for a company's request on Harper:
 * requested: the company already asked to connect (or it is under way, or done); request: Harper's member request is
 * made now; none: the card cannot take one (why).
 */
export function memberIntroStep(status: string | null | undefined): { step: "requested" } | { step: "request" } | { step: "none"; reason: string } {
  if (status === "awaiting_talent" || status === "connecting" || status === "connected") return { step: "requested" };
  if (status === "ready") return { step: "request" };
  return { step: "none", reason: status ? `회원 카드가 ${status} 상태예요` : "회사 역할에 회원 카드가 없어요" };
}

/**
 * A member request a tick left unconfirmed (ashleyMember.server.ts finishAshleyMemberIntro), from the member's card now,
 * the company's decision on Ashley's 외부 후보 card and the candidate now:
 * - done: the card is past ready (asked, under way, connected, declined or passed on it): nothing more to make. The
 *   requests closed before memberIntroDone was written end here too;
 * - stop, quiet: the company passed on the candidate meanwhile: nothing is made in its name, no person needed;
 * - stop, person: it can never be made (the candidate opted out or is gone, no card): a person takes it;
 * - request: the card is ready: Harper's member request is made now.
 */
export function memberIntroFinish(input: {
  cardStatus: string | null; companyDecision: string | null; candidate: { stopped: boolean } | null;
}): { step: "done" } | { step: "request" } | { step: "stop"; quiet: boolean; reason: string } {
  if (input.cardStatus && input.cardStatus !== "ready") return { step: "done" };
  if (input.companyDecision === "passed") return { step: "stop", quiet: true, reason: "회사가 이 후보를 넘겼어요" };
  if (!input.candidate) return { step: "stop", quiet: false, reason: "후보를 찾지 못했어요" };
  if (input.candidate.stopped) return { step: "stop", quiet: false, reason: "후보가 연락 받지 않기 목록에 있어요" };
  if (!input.cardStatus) return { step: "stop", quiet: false, reason: "회원 카드를 찾지 못했어요" };
  return { step: "request" };
}

/** The Career run's instruction: the message to tell them about, by id; no company text in it. */
export function memberAnswerRunInstruction(messageId: string | number): string {
  return [
    `A company's answer to a question this candidate asked Harper by email was added to this conversation as message ${messageId}.`,
    "Tell the candidate about it through their usual contact channel, pointing to that message, and help with what they want to do next using the normal Career tools.",
    "Do not restate, reword or add to the company's answer, and do not share anything with the company: this is not candidate consent for sharing.",
  ].join(" ");
}

/** The payload of the chat message (the relay row it is for, so it can be found from gtm_agent_relays). */
export function memberAnswerPayload(input: { key: string; relay: { companyEmail: string; personId: string; inboundMessageId: string } }) {
  return {
    [MEMBER_ANSWER_PAYLOAD_KEY]: {
      key: input.key, relayCompanyEmail: input.relay.companyEmail.trim().toLowerCase(), relayPersonId: input.relay.personId,
      inboundMessageId: input.relay.inboundMessageId, via: "ashley",
    },
  };
}
