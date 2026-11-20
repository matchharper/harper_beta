import "server-only";

import { gtmRead } from "../db.server";
import type { ConversationStore } from "./conversation";
import { isHumanOwned } from "./conversation.server";
import { findFollowupPostings, type FollowupFound, type SentPosting } from "./followup";
import { applicantListCompany } from "./applicantList";
import { matchAgentPostings } from "./match.server";
import { reviewAgentPostings } from "./review.server";
import { recordAgentSpend } from "./spend.server";
import type { AgentPerson } from "./types";

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
  }, { match: matchAgentPostings, review: reviewAgentPostings, spend });
}

/**
 * Whether a human (Shaun, from Ashley's Gmail) wrote in the thread of this first mail: no automatic follow-up goes
 * there then (the reply store, conversation.server.ts).
 */
export const followupThreadHumanOwned: ConversationStore["isHumanOwned"] = isHumanOwned;
