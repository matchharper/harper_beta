import "server-only";

import { gtmRead, gtmWrite } from "../db.server";
import { GTM_HARPER_ORIGIN } from "../shared";
import { handoffSlackText } from "./ashleyMail";
import { agentPersonLink } from "./replies";
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
 * The candidate joined Harper (the sign-up hook, same address as the mail) after a company's words or wish to talk
 * reached them, and that relay said "가입하시면 제가 회사와 이어드릴게요": the company is not on Harper, so a person is
 * @mentioned to connect them, once per company and candidate (gtm_agent_relays.joined_noted_at, claimed first).
 * Never throws: sign-up must go on.
 */
export async function handOffJoinedRelays(mailId: string): Promise<number> {
  try {
    const rows = await gtmWrite((sql) => sql<Array<{ company_email: string; kind: string; person_id: string; email: string | null }>>`
      update public.gtm_agent_relays r set joined_noted_at = now()
      from public.gtm_mails m, public.gtm_agent_people p
      where m.id = ${mailId}::uuid and r.person_id = m.agent_person_id and p.id = r.person_id and r.joined_noted_at is null
      returning r.company_email, r.kind, r.person_id::text as person_id, p.email
    `);
    if (!rows.length) return 0;
    const settings = await readAgentSettings();
    for (const row of rows) {
      const what = row.kind === "answer" ? "후보 질문에 답했던" : "이 후보와 이야기하고 싶어 했던";
      await postInReplyThread(handoffSlackText({
        mentionUserId: settings.handoffSlackUserId,
        reason: `후보가 Harper에 가입했어요. ${what} 회사(${row.company_email})와 이어 주세요 (메일에서 "가입하시면 이어드릴게요"라고 했어요)`,
        who: `<${row.email ?? ""}>`,
        opsUrl: agentPersonLink(GTM_HARPER_ORIGIN, { id: row.person_id, email: row.email }),
        gmailUrl: null,
        signupUrl: null,
      }), row.person_id);
    }
    return rows.length;
  } catch (error) {
    if (!missingSchema(error)) console.warn("[gtm-agent] joined relay hand-off not posted", mailId, error instanceof Error ? error.message : String(error));
    return 0;
  }
}
