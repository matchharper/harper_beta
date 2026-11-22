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
