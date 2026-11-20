import "server-only";

import { gtmRead, gtmWrite } from "../db.server";
import { GTM_HARPER_ORIGIN, gtmMailLinkOrigin } from "../shared";
import { ashleySignupLink, gmailThreadSearchLink, handoffSlackText } from "./ashleyMail";
import { agentPersonLink, OTHER_SENDER_REASON } from "./replies";
import { latestDailyReportTs, postToGtmTalent } from "./slack.server";
import { readAgentSettings } from "./store.server";

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
 * A reply in our thread from another address than the mail's recipient (stored decided hand_to_human by the reply
 * sync, so Ashley never answers it): the hand-off @mention in the alert's thread, with the same links as Ashley's.
 */
export async function handOffOtherSender(args: {
  personId: string | null; mailId: string; recipient: string; otherSender: string; mailbox: string | null; rfcMessageId: string | null;
  /** The Slack thread to post in; left out, the person's reply thread (a company thread: under the latest daily post). */
  threadTs?: string | null;
}): Promise<void> {
  const settings = await readAgentSettings();
  const text = handoffSlackText({
    mentionUserId: settings.handoffSlackUserId,
    reason: `${OTHER_SENDER_REASON} · 메일 받은 사람(${args.recipient})이 아닌 ${args.otherSender}에서 답장이 왔어요`,
    who: `<${args.recipient}>`,
    opsUrl: args.personId ? agentPersonLink(GTM_HARPER_ORIGIN, { id: args.personId, email: args.recipient })
      : new URL("/ops/gtm-plays?tab=5", GTM_HARPER_ORIGIN).toString(),
    gmailUrl: gmailThreadSearchLink(args.mailbox, args.rfcMessageId),
    // A company thread (no person) gets no candidate sign-up link.
    signupUrl: args.personId ? ashleySignupLink({ origin: gtmMailLinkOrigin(), rootMailId: args.mailId, next: "onboarding" }) : null,
  });
  await postInReplyThread(text, args.personId, args.threadTs);
}
