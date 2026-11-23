import "server-only";

import { gtmRead } from "../db.server";
import type { ConversationStore } from "./conversation";
import { personAnswered } from "./conversation.server";
import { findFollowupPostings, type FollowupFound, type SentPosting } from "./followup";
import { applicantListCompany } from "./applicantList";
import { matchAgentPostings } from "./match.server";
import { reviewAgentPostings } from "./review.server";
import { recordAgentSpend } from "./spend.server";
import { storedOffer } from "./channels";
import { EVENTS_PER_MAIL, findAgentEvents } from "./events.server";
import type { AgentOfferEvent, AgentPerson } from "./types";

/**
 * #5 follow-up I/O (rules and words in followup.ts): the postings already sent to the person, the search for new ones
 * with the first mail's live matcher and grader (spend logged under the follow-up step), and whether a human owns the
 * thread.
 */

/** Every posting a sent candidate mail proposed to this person or address (#4 and #5, the first mail included). */
async function sentPostingsTo(person: Pick<AgentPerson, "id" | "email" | "postings">): Promise<SentPosting[]> {
  const email = person.email?.trim().toLowerCase() ?? "";
  const rows = await gtmRead((sql) => sql<Array<{
    postings: SentPosting[] | null; posting: { companyName?: string | null; url?: string | null } | null;
    role_id: string | null; posting_url: string | null; company_name: string | null;
  }>>`
    select m.postings, m.posting, m.role_id::text as role_id, m.posting_url, m.company_name
    from public.gtm_mails m
    where m.audience = 'candidate' and m.status = 'sent'
      and (m.agent_person_id = ${person.id}::uuid or (${email} <> '' and m.to_email = ${email}))
  `);
  return [
    ...person.postings,
    ...rows.flatMap((row) => [
      ...(Array.isArray(row.postings) ? row.postings : []),
      { roleId: row.role_id, url: row.posting_url ?? row.posting?.url ?? null, companyName: row.company_name ?? row.posting?.companyName ?? undefined },
    ]),
  ];
}

/** New postings for the person's follow-up (followup.ts findFollowupPostings) with the live matcher and grader. */
export async function searchFollowupPostings(person: AgentPerson, ctx: { runId: string; configId: string | null }): Promise<FollowupFound> {
  const spend = (usd: number) => recordAgentSpend({
    step: "followup", usd, runId: ctx.runId, personId: person.id, configId: ctx.configId, isTest: person.isTest,
  });
  return findFollowupPostings(person, {
    sent: await sentPostingsTo(person),
    // As the first mail: never their current company, nor the company whose own applicant list they came from.
    excludeCompanyNames: [person.currentCompany, applicantListCompany(person.source)],
    anyIntent: storedOffer(person.messageKind) === "general",
  }, { match: matchAgentPostings, review: reviewAgentPostings, spend });
}

/**
 * New events for a general mail's follow-up (followup.ts planGeneralFollowup): as the first mail's (events.server.ts),
 * none already sent to the person (by page), spend logged under the events step. A failed search gives none.
 */
export async function searchFollowupEvents(person: AgentPerson, ctx: { runId: string; configId: string | null; now: Date }): Promise<{
  events: AgentOfferEvent[]; costUsd: number;
}> {
  const sent = new Set((await sentEventsTo(person)).map((event) => eventKey(event.url)).filter(Boolean));
  const found = await findAgentEvents(person, { language: person.language ?? "ko", max: EVENTS_PER_MAIL + sent.size, now: ctx.now });
  await recordAgentSpend({ step: "events", usd: found.costUsd, runId: ctx.runId, personId: person.id, configId: ctx.configId, isTest: person.isTest });
  return { events: found.events.filter((event) => !sent.has(eventKey(event.url))).slice(0, EVENTS_PER_MAIL), costUsd: found.costUsd };
}

const eventKey = (url: string | null | undefined) => String(url ?? "").trim().toLowerCase().replace(/\/+$/, "");

/** Every event a sent candidate mail proposed to this person (gtm_mails.events), and the ones on the person now. */
async function sentEventsTo(person: Pick<AgentPerson, "id" | "offerEvents">): Promise<AgentOfferEvent[]> {
  const rows = await gtmRead((sql) => sql<Array<{ events: AgentOfferEvent[] | null }>>`
    select m.events from public.gtm_mails m
    where m.audience = 'candidate' and m.status = 'sent' and m.agent_person_id = ${person.id}::uuid and m.events is not null
  `);
  return [...person.offerEvents, ...rows.flatMap((row) => (Array.isArray(row.events) ? row.events : []))];
}

/**
 * Whether a person (Shaun, from Ashley's Gmail) ever wrote in the thread of this first mail: no automatic follow-up goes
 * there then (the reply store, conversation.server.ts).
 */
export const followupThreadHumanOwned = (rootMailId: string): Promise<boolean> => personAnswered(rootMailId);
