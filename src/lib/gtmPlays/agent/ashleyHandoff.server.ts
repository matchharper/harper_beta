import "server-only";

import { gtmRead, gtmWrite } from "../db.server";
import { latestDailyReportTs, postToGtmTalent } from "./slack.server";

/**
 * #5 Ashley's Slack lines go in the thread of the person's reply alert (design 5장): the alert is a comment under the
 * latest daily numbers post (or a post of its own before the first one), so that thread is remembered on the person
 * (gtm_agent_people.reply_slack_ts, set by replies.server.ts alertReply). Kept apart from ashleyReply.server.ts so the
 * reply sync can use it without importing the reply agent.
 */

const UNDEFINED_COLUMN = "42703";
const MISSING_TABLE = "42P01";
const missingSchema = (error: unknown) => [UNDEFINED_COLUMN, MISSING_TABLE].includes(String((error as { code?: string }).code));

/** Remembers the thread a person's latest reply alert went in (Ashley answers right after, in the same tick). */
export async function rememberReplyAlertThread(personId: string, threadTs: string | null): Promise<void> {
  if (!threadTs) return;
  try {
    await gtmWrite((sql) => sql`
      update public.gtm_agent_people set reply_slack_ts = ${threadTs} where id = ${personId}::uuid
    `);
  } catch (error) {
    if (!missingSchema(error)) console.warn("[gtm-agent] reply thread not remembered", personId, error instanceof Error ? error.message : String(error));
  }
}

/** The person's reply alert thread; the latest daily numbers post when there is none (or no person). */
export async function replyThreadTs(personId: string | null): Promise<string | null> {
  if (personId) {
    try {
      const [row] = await gtmRead((sql) => sql<Array<{ ts: string | null }>>`
        select reply_slack_ts as ts from public.gtm_agent_people where id = ${personId}::uuid
      `);
      if (row?.ts) return row.ts;
    } catch (error) {
      if (!missingSchema(error)) throw error;
    }
  }
  return latestDailyReportTs().catch(() => null);
}

/** One line in the person's reply thread. A Slack failure is logged, never thrown (the mail work is done). */
export async function postInReplyThread(text: string, personId: string | null, threadTs?: string | null): Promise<void> {
  try {
    const posted = await postToGtmTalent(text, undefined, { threadTs: threadTs !== undefined ? threadTs : await replyThreadTs(personId) });
    if (!posted.ok) console.warn("[gtm-agent] Ashley line not posted to Slack", personId, posted.error);
  } catch (error) {
    console.warn("[gtm-agent] Ashley line not posted to Slack", personId, error instanceof Error ? error.message : String(error));
  }
}

/**
 * The candidate joined Harper (the sign-up hook, same address as the mail) after a company's words or wish to talk
 * reached them: the join is recorded on each of their pairs (gtm_agent_relays.joined_noted_at, once), and nothing else
 * happens here. A join that does not come through here (signed up on their own) is found by the tick
 * (ashleyReply.server.ts relays.noteMemberJoins). Ashley's tick then tells the company, inside the sending hours (ashleyAgent.ts tellJoinedCompanies:
 * its joined mail, or Harper's connection request for a member when it asked on Harper), with no person in between
 * (Shaun 11/22 16:08; this used to @mention a person on Slack). Never throws: sign-up must go on.
 */
export async function noteJoinedRelays(mailId: string): Promise<number> {
  try {
    const rows = await gtmWrite((sql) => sql<Array<{ person_id: string }>>`
      update public.gtm_agent_relays r set joined_noted_at = now()
      from public.gtm_mails m
      where m.id = ${mailId}::uuid and r.person_id = m.agent_person_id and r.joined_noted_at is null
      returning r.person_id::text as person_id
    `);
    return rows.length;
  } catch (error) {
    if (!missingSchema(error)) console.warn("[gtm-agent] joined relay not recorded", mailId, error instanceof Error ? error.message : String(error));
    return 0;
  }
}
