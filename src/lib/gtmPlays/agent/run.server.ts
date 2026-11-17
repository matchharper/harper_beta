import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmRead } from "../db.server";
import { gtmMailsTable } from "../mailSend.server";
import { composeAgentMail } from "./compose.server";
import {
  EMAIL_LOOKUP_ESTIMATE_USD, EMAIL_LOOKUP_RUN_USD, emptyLookup, lookupTimedOut, needsEmailLookup,
  settleEmailLookup, type EmailLookupCheck, type EmailLookupDone,
} from "./emailLookup";
import { cancelEmailLookup, checkEmailLookup, startEmailLookup } from "./emailLookup.server";
import { exclusionFacts } from "./exclusion.server";
import { agentMailableAddress, agentSenderProblem } from "./mailRules";
import { matchAgentPostings } from "./match.server";
import { exclusionReason, kstClock, sumCounts } from "./people";
import { renderAgentMail } from "./render";
import { deliverAgentMail } from "./send.server";
import { mailsToSendNow, sendWindowNow, sentTimingNote, spendTickMail, tickMailBudget } from "./sendPace.server";
import { EXPLORE_SOURCE, readSignalLogEntry, type SignalHistoryRun } from "./signals";
import { searchSignalPeople } from "./signals.server";
import { exploreBudgetUsd, signalTuningVersion, tuningOf, type SignalTuning } from "./tuning";
import {
  agentCostToday, countRunningEmailLookups, createAgentRun, insertAgentPeople, leaseAgentRun, listAgentPeopleByStatus,
  readAgentPerson, readAgentSenderUser, readAgentSettings, readSignalLogs, releaseAgentRun, updateAgentPerson,
  writeSignalLog, type AgentRun,
} from "./store.server";
import type { AgentEmailLookup, AgentPerson, AgentSettings } from "./types";

/**
 * #5 dispatcher tick (a web cron every few minutes, /api/internal/gtm-agent/dispatch). One tick leases one run
 * (an import or manual run before the day's run) and handles a small batch of its new people, then does the steps
 * that are not about new people: noticing clicks / sign-ups / opt-outs, sending what is approved when the hours
 * allow, one follow-up after followupDays, and ending. A tick fits the time limit, and a stop in the middle loses
 * nothing: every step is a status on the person row. A person without an address the agent may mail gets an email
 * lookup (agent/emailLookup.ts), which runs on Exa for minutes: started on one tick, looked at on the next ones
 * (the person stays found meanwhile, its state in email_lookup), then the person goes on or is excluded no_email.
 */

const LEASE_MS = 4 * 60_000;
/** People a tick moves on (matching and writing take time); people waiting on an email lookup do not count. */
const BATCH = 6;
/**
 * found people a tick looks at: enough that people waiting on a lookup (minutes, across ticks) never hold back the
 * new ones behind them.
 */
const SCAN = BATCH * 10;
/** Email lookups a tick starts (one POST each; each runs on Exa for minutes). */
const LOOKUP_STARTS = 8;
/** Lookups looked at in parallel at the start of a tick (one GET each, a page read when one ended). */
const LOOKUP_CHECKS_PARALLEL = 6;
const DAY_MS = 86_400_000;
const AGENT = "agent";

type TickResult = { ran: boolean; reason?: string; runId?: string; counts?: Record<string, number> };

/** Today's daily run, made once per Korea-time day (test runs never make one). */
async function ensureDailyRun(day: string) {
  const [existing] = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select id from public.gtm_agent_runs where kind = 'daily' and run_date = ${day}::date and not is_test limit 1
  `);
  if (!existing) await createAgentRun({ kind: "daily", runDate: day, isTest: false, createdBy: null });
}

type LookupPoll = EmailLookupCheck | { state: "error"; error: unknown };

/** One look at each lookup still running, a few at a time (cheap: a GET, and a page read when one has ended). */
async function pollLookups(people: readonly AgentPerson[]): Promise<Map<string, LookupPoll>> {
  const running = people.filter((person) => person.emailLookup?.state === "running" && person.emailLookup.runId);
  const polls = new Map<string, LookupPoll>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LOOKUP_CHECKS_PARALLEL, running.length) }, async () => {
    while (next < running.length) {
      const person = running[next++];
      try {
        polls.set(person.id, await checkEmailLookup(person.emailLookup?.runId as string, person));
      } catch (error) {
        polls.set(person.id, { state: "error", error });
      }
    }
  }));
  return polls;
}

/**
 * A lookup started on an earlier tick: still running and under 15 minutes → "waiting" (the person stays found);
 * otherwise it ends here (an error or a run past 15 minutes ends as nothing found): its cost and timeline line are
 * recorded, and the address goes on the person when it passed the checks and the agent may mail it.
 */
async function settleLookup(
  person: AgentPerson, lookup: AgentEmailLookup, settings: AgentSettings, now: Date, poll: LookupPoll | undefined,
): Promise<"waiting" | { person: AgentPerson | null; costUsd: number; found: boolean }> {
  let done: EmailLookupDone;
  if (!lookup.runId) done = emptyLookup("failed", 0);
  else if (!poll) return "waiting"; // not looked at this tick
  else if (poll.state === "done") done = poll;
  else if (!lookupTimedOut(lookup, now)) return "waiting";
  else if (poll.state === "error") {
    console.error("[gtm-agent] email lookup unreachable", person.id, poll.error);
    // Exa may still charge for the run: count the price list's run.
    done = emptyLookup("failed", EMAIL_LOOKUP_RUN_USD);
  } else {
    await cancelEmailLookup(lookup.runId);
    done = emptyLookup("timeout", EMAIL_LOOKUP_RUN_USD);
  }
  const settled = settleEmailLookup(lookup, done, settings, now);
  const updated = await updateAgentPerson(person.id, {
    emailLookup: settled.emailLookup, addCostUsd: done.costUsd,
    ...(settled.email ? { email: settled.email, emailSource: "lookup" as const } : {}),
  }, { kind: "email_lookup", by: AGENT, note: settled.note }, ["found"]);
  return { person: updated, costUsd: done.costUsd, found: Boolean(settled.email) };
}

/** Starts a lookup (the person stays found until it ends); false when Exa refused it (recorded as nothing found). */
async function beginLookup(person: AgentPerson, settings: AgentSettings, now: Date): Promise<boolean> {
  const startedAt = now.toISOString();
  try {
    const { runId } = await startEmailLookup(person);
    await updateAgentPerson(person.id, { emailLookup: { runId, startedAt, state: "running" } },
      { kind: "email_lookup", by: AGENT, note: "이메일 찾기 시작" }, ["found"]);
    return true;
  } catch (error) {
    console.error("[gtm-agent] email lookup did not start", person.id, error);
    const settled = settleEmailLookup({ runId: null, startedAt, state: "running" }, emptyLookup("start_failed", 0), settings, now);
    await updateAgentPerson(person.id, { emailLookup: settled.emailLookup },
      { kind: "email_lookup", by: AGENT, note: settled.note }, ["found"]);
    return false;
  }
}

/**
 * What one person's step did: outcome (excluded_<reason>, no_fit, drafted, approved, moved, or lookup_started /
 * lookup_waiting / lookup_deferred while the person stays found) and how a lookup that ended here came out.
 */
type FoundStep = { outcome: string; lookup: "found" | "not_found" | null };

/**
 * found → excluded | no_fit | drafted / approved. Email only (Shaun 11/17): a person without an address the agent may
 * mail gets an email lookup first (when it is on), across ticks; without one in the end → excluded no_email. Every
 * cost recorded on the person is added to `paid` as it happens (so the run counts it even when a later step fails).
 */
async function handleFound(
  found: AgentPerson, settings: AgentSettings, now: Date,
  ctx: { paid: { usd: number }; poll?: LookupPoll; mayStartLookup: boolean },
): Promise<FoundStep> {
  let person = found;
  let lookup: FoundStep["lookup"] = null;
  if (person.emailLookup?.state === "running") {
    const settled = await settleLookup(person, person.emailLookup, settings, now, ctx.poll);
    if (settled === "waiting") return { outcome: "lookup_waiting", lookup };
    ctx.paid.usd += settled.costUsd;
    lookup = settled.found ? "found" : "not_found";
    if (!settled.person) return { outcome: "moved", lookup };
    person = settled.person;
  }

  // With a looked-up address, the rules that need one (member, opt-out, recent contact, staff) apply to it too.
  const facts = await exclusionFacts(person);
  const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
  const excluded = exclusionReason({
    method: person.method, email: person.email, signalAt: person.signalAt, isMember: facts.member,
    maxAgeDays: (settings.signals.sources[person.source] ?? settings.signals.explore).maxAgeDays,
    isSuppressed: facts.suppressed || facts.opted_out, isInternal, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
    lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: facts.active_elsewhere,
  }, new Date(), settings.quietDaysAfterEnd);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded }, { kind: "excluded", by: AGENT, note: excluded }, ["found"]);
    return { outcome: `excluded_${excluded}`, lookup };
  }

  // Email only: without an address the agent may mail, matching is not worth paying for. A lookup first (Shaun 11/17:
  // "이메일 검색해서 수율을 채우자"), when it is on and there is a profile or a link to start from.
  const email = agentMailableAddress(person.email, person.emailSource, settings) ? person.email : null;
  if (!email && needsEmailLookup(person, settings)) {
    // Over this tick's starts or today's money (lookups running count): the person waits for a later tick.
    if (!ctx.mayStartLookup) return { outcome: "lookup_deferred", lookup };
    if (await beginLookup(person, settings, now)) return { outcome: "lookup_started", lookup };
    lookup = "not_found";
  }
  if (!email) {
    const note = person.emailLookup || lookup ? "이메일 찾기로도 보낼 수 있는 주소가 없어요"
      : person.email ? "회사 메일 주소만 있어요" : "이메일 주소가 없어요";
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "no_email" }, { kind: "excluded", by: AGENT, note }, ["found"]);
    return { outcome: "excluded_no_email", lookup };
  }

  const match = await matchAgentPostings(person, { excludeCompanyNames: person.currentCompany ? [person.currentCompany] : [] });
  ctx.paid.usd += match.costUsd;
  if (match.notJobSeeking) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "not_job_seeking", addCostUsd: match.costUsd },
      { kind: "excluded", by: AGENT, note: match.reason }, ["found"]);
    return { outcome: "excluded_not_job_seeking", lookup };
  }
  if (match.postings.length < 2) {
    await updateAgentPerson(person.id, { status: "no_fit", language: match.language, addCostUsd: match.costUsd },
      { kind: "no_fit", by: AGENT, note: match.reason || "맞는 회사가 2곳이 안 돼요" }, ["found"]);
    return { outcome: "no_fit", lookup };
  }
  const matched = await updateAgentPerson(person.id, {
    status: "matched", postings: match.postings, language: match.language, addCostUsd: match.costUsd,
  }, { kind: "matched", by: AGENT, note: match.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ") }, ["found"]);
  if (!matched) return { outcome: "moved", lookup };

  const draft = await composeAgentMail({ person: matched, postings: match.postings, language: match.language, senderName: settings.senderName ?? "" });
  ctx.paid.usd += draft.costUsd;
  const approved = settings.sendMode === "auto";
  await updateAgentPerson(person.id, {
    status: approved ? "approved" : "drafted", channel: "email", draftSubject: draft.subject, draftBody: draft.body,
    messageKind: draft.messageKind, reason: draft.reason, addCostUsd: draft.costUsd,
  }, { kind: "drafted", by: AGENT, note: approved ? "메일을 썼어요 · 보내는 시간에 나가요" : "메일을 썼어요 · 승인 기다림" }, ["matched"]);
  return { outcome: approved ? "approved" : "drafted", lookup };
}

/**
 * approved → sent (or failed / blocked back to the timeline) on the chosen days and hours, spread over the day within
 * today's cap, newest signal first, and anyone whose 24 hours after the signal would end before the next chance goes
 * now (agent/sendTiming.ts). `limit`: paced mails in one tick at most.
 */
async function sendApproved(settings: AgentSettings, sentBy: string, now: Date, limit: number) {
  if (!sendWindowNow(settings, now) || agentSenderProblem(settings)) return 0;
  const budget = await tickMailBudget(settings, now);
  let sent = 0;
  for (const { person, due } of await mailsToSendNow(settings, now, limit)) {
    const subject = person.draftSubject ?? "";
    const body = person.draftBody ?? "";
    let result: Awaited<ReturnType<typeof deliverAgentMail>>;
    try {
      result = await deliverAgentMail({
        person, postings: person.postings, settings, sentBy, followup: false,
        render: (_mailId, links) => renderAgentMail({
          language: person.language ?? "ko", subject, body, name: person.name, harperUrl: links.harperUrl,
          postings: person.postings, senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "",
          unsubscribeUrl: links.unsubscribeUrl,
        }),
      });
    } catch (error) {
      // The provider refused it (the mail row is marked failed): the person stops here instead of retrying every tick.
      const message = error instanceof Error ? error.message : String(error);
      await updateAgentPerson(person.id, { status: "failed", skipReason: message.slice(0, 300) },
        { kind: "failed", by: AGENT, note: `메일을 보내지 못했어요 · ${message.slice(0, 160)}` }, ["approved"]);
      continue;
    }
    if (result.status === "sent") {
      sent += 1;
      spendTickMail(budget);
      await updateAgentPerson(person.id, {
        status: "sent", mailId: result.mailId, sentAt: result.sentAt,
        followupDueAt: new Date(now.getTime() + settings.followupDays * DAY_MS).toISOString(),
      }, { kind: "sent", by: AGENT, note: `메일 보냄 · ${subject}${sentTimingNote(person, result.sentAt, due)}` }, ["approved"]);
    } else if (result.reason.includes("오늘 보낼 수 있는")) {
      break; // today's cap: the rest waits for tomorrow
    } else {
      await updateAgentPerson(person.id, { status: "skipped", skipReason: result.reason, mailId: result.mailId },
        { kind: "skipped", by: AGENT, note: result.reason }, ["approved"]);
    }
  }
  return sent;
}

/** Clicks, sign-ups, opt-outs and bounces on sent mails become timeline lines (and stop the follow-up). */
async function noticeReactions(limit: number) {
  const rows = await gtmRead((sql) => sql<Array<{
    id: string; events: Array<{ kind: string }> | null; first_opened_at: string | Date | null; claimed_at: string | Date | null;
    unsubscribed_at: string | Date | null; delivery_status: string | null;
  }>>`
    select p.id, p.events, m.first_opened_at, m.claimed_at, m.unsubscribed_at, m.delivery_status
    from public.gtm_agent_people p
    join public.gtm_mails m on m.id in (p.mail_id, p.followup_mail_id)
    where p.status = 'sent'
      and (m.first_opened_at is not null or m.claimed_at is not null or m.unsubscribed_at is not null or m.delivery_status is not null)
    order by p.updated_at limit ${limit * 4}::int
  `);
  for (const row of rows) {
    const seen = new Set((row.events ?? []).map((event) => event.kind));
    if (row.unsubscribed_at && !seen.has("unsubscribed")) {
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null }, { kind: "unsubscribed", by: AGENT, note: "연락 받지 않기를 눌렀어요" });
    } else if (row.delivery_status && !seen.has("bounced")) {
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null }, { kind: "bounced", by: AGENT, note: row.delivery_status });
    } else if (row.claimed_at && !seen.has("signed_up")) {
      await updateAgentPerson(row.id, { followupDueAt: null }, { kind: "signed_up", by: AGENT, note: "메일로 가입했어요" });
    } else if (row.first_opened_at && !seen.has("clicked")) {
      await updateAgentPerson(row.id, { followupDueAt: null }, { kind: "clicked", by: AGENT, note: "공고 페이지를 열었어요" });
    }
  }
}

/**
 * One follow-up after followupDays without a reaction; after a second wait without one, the person ends. Follow-ups
 * go out on the same days and hours as first mails and share the tick's pace with them (agent/sendTiming.ts): the
 * ones to end first (no mail), then newest signal first.
 */
async function followUps(settings: AgentSettings, sentBy: string, now: Date, limit: number) {
  const due = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select id from public.gtm_agent_people where status = 'sent' and followup_due_at <= now()
    order by (events @> '[{"kind":"followup_sent"}]'::jsonb) desc, signal_at desc nulls last, followup_due_at
    limit ${limit}::int
  `);
  let cost = 0;
  for (const { id } of due) {
    const person = await readAgentPerson(id);
    if (!person) continue;
    const followedUp = person.events.some((event) => event.kind === "followup_sent");
    if (followedUp) {
      await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
        { kind: "ended", by: AGENT, note: "후속 연락 뒤에도 반응이 없어 끝냈어요" }, ["sent"]);
      continue;
    }
    if (person.channel === "email") {
      if (!sendWindowNow(settings, now) || agentSenderProblem(settings)) continue;
      const budget = await tickMailBudget(settings, now);
      if (budget.left <= 0 || budget.quota <= 0) continue;
      const draft = await composeAgentMail({ person, postings: person.postings, language: person.language ?? "ko", senderName: settings.senderName ?? "", followup: true });
      cost += draft.costUsd;
      let result: Awaited<ReturnType<typeof deliverAgentMail>>;
      try {
        result = await deliverAgentMail({
          person, postings: person.postings, settings, sentBy, followup: true,
          render: (_mailId, links) => renderAgentMail({
            language: person.language ?? "ko", subject: draft.subject, body: draft.body, name: person.name, harperUrl: links.harperUrl,
            postings: person.postings, senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "", unsubscribeUrl: links.unsubscribeUrl,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: draft.costUsd },
          { kind: "failed", by: AGENT, note: `후속 메일을 보내지 못했어요 · ${message.slice(0, 160)}` }, ["sent"]);
        continue;
      }
      if (result.status === "sent") {
        spendTickMail(budget);
        await updateAgentPerson(id, {
          followupMailId: result.mailId, followupDueAt: new Date(now.getTime() + settings.followupDays * DAY_MS).toISOString(), addCostUsd: draft.costUsd,
        }, { kind: "followup_sent", by: AGENT, note: `후속 메일 보냄 · ${draft.subject}` }, ["sent"]);
      } else if (!result.reason.includes("오늘 보낼 수 있는")) {
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: draft.costUsd },
          { kind: "ended", by: AGENT, note: `후속 메일을 보내지 않았어요 · ${result.reason}` }, ["sent"]);
      }
    }
  }
  return cost;
}

/** Per source and run: at most this share of what is left of today's money, and never more than SIGNAL_BUDGET_MAX. */
const SIGNAL_BUDGET_SHARE = 0.5;
const SIGNAL_BUDGET_MAX = 2;
/** Earlier runs of a source whose search logs its first plans read. */
const SIGNAL_HISTORY_RUNS = 5;

/** What earlier runs of a source learned (newest first, marked when the tuning was the same); none when it cannot be read. */
async function signalHistory(source: string, runId: string, tuning: SignalTuning): Promise<SignalHistoryRun[]> {
  try {
    const version = signalTuningVersion(source, tuning);
    return (await readSignalLogs(source, runId, SIGNAL_HISTORY_RUNS)).flatMap((value) => {
      const entry = readSignalLogEntry(value);
      return entry ? [{ ...entry, sameTuning: entry.tuningVersion === version }] : [];
    });
  } catch (error) {
    console.warn("[gtm-agent] signal history", source, error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * A day's run (and "지금 실행") searches each turned-on source once, then the open web with its share (Shaun 11/17:
 * default domains, not limited to them). One search per tick (a search takes a minute or two); the people found join
 * this run and are handled like uploaded ones. Each person keeps where they were found (the page's source or
 * domain), how, and the settings and tuning versions; new domains with kept people are kept on the run's counts
 * (new_domain:<domain>) for "기본 목록에 넣기".
 */
async function findSignalPeople(run: AgentRun, settings: AgentSettings, spent: number): Promise<{ cost: number; counts: Record<string, number> } | null> {
  // Uploads bring their own people.
  if (run.kind === "import") return null;
  const { sources, exploreShare, explore, blockedDomains } = settings.signals;
  const left = Math.max(0, settings.dailyCostUsd - spent);
  const runBudget = Math.min(SIGNAL_BUDGET_MAX, left * SIGNAL_BUDGET_SHARE);
  const turnedOn = Object.entries(sources).filter(([, setting]) => setting.enabled && setting.daily > 0);
  const next = turnedOn.find(([id]) => !run.counts[`searched_${id}`]);
  const exploring = !next && turnedOn.length > 0 && exploreShare > 0 && !run.counts[`searched_${EXPLORE_SOURCE}`];
  if (!next && !exploring) return null;
  const id = next ? next[0] : EXPLORE_SOURCE;
  const budget = next ? runBudget * (1 - exploreShare) : exploreBudgetUsd(runBudget, exploreShare);
  if (budget < 0.05) return { cost: 0, counts: { [`searched_${id}`]: 1, [`skipped_budget_${id}`]: 1 } };
  const maxPeople = next ? next[1].daily : Math.max(5, Math.round(turnedOn.reduce((sum, [, setting]) => sum + setting.daily, 0) * exploreShare));
  const tuning = next ? tuningOf(next[1]) : explore;
  const result = await searchSignalPeople({
    source: id, budgetUsd: budget, maxPeople, known: new Set(), blockedDomains, tuning,
    history: await signalHistory(id, run.id, tuning),
  });
  // What this search learned, for the next runs' first plans (a lost log never stops the run).
  await writeSignalLog(run.id, id, result.log).catch((error) => {
    console.warn("[gtm-agent] signal log", id, error instanceof Error ? error.message : String(error));
  });
  const keys = result.people.map((person) => person.personKey);
  const known = keys.length ? new Set((await gtmRead((sql) => sql<Array<{ person_key: string }>>`
    select distinct person_key from public.gtm_agent_people where person_key = any(${keys}::text[])
  `)).map((row) => row.person_key)) : new Set<string>();
  const fresh = result.people.filter((person) => !known.has(person.personKey));
  await insertAgentPeople(fresh.map((person) => ({
    runId: run.id, source: person.source, method: person.method, settingsVersion: settings.version,
    tuningVersion: person.tuningVersion, contactUrl: person.contactUrl, personKey: person.personKey,
    email: person.email, emailSource: person.email ? "post" : null,
    isTest: run.isTest, name: person.name, headline: person.headline, location: person.location,
    currentCompany: person.currentCompany, profileUrl: person.profileUrl, profileText: null, signalText: person.signalText,
    signalUrl: person.signalUrl, signalAt: person.signalAt,
    foundNote: `${person.method === "layoff_company" ? `구조조정 회사(${person.group})` : person.method === "open_to_work_profile" ? "구직 중 프로필" : "구직 글"} · 점수 ${person.score}`,
  })), AGENT);
  console.info("[gtm-agent] signals", id, JSON.stringify({ plans: result.plans.map((plan) => plan.reason ?? plan.plan.slice(0, 120)), yields: result.yields }));
  return {
    cost: result.costUsd,
    counts: {
      [`searched_${id}`]: 1, [`signal_found_${id}`]: fresh.length, [`signal_known_${id}`]: result.people.length - fresh.length,
      [`searches_${id}`]: result.yields.length,
      // The search's spend is the run's, not one person's: kept per source so /ops #5 can show it by source.
      [`signal_cost_${id}`]: result.costUsd,
      ...Object.fromEntries(result.newDomains.map((item) => [`new_domain:${item.domain}`, item.kept])),
    },
  };
}

/** One dispatcher tick. */
export async function runAgentTick(now = new Date()): Promise<TickResult> {
  const settings = await readAgentSettings();
  if (!settings.enabled) return { ran: false, reason: "off" };
  const today = kstClock(now).day;
  await ensureDailyRun(today);
  const leased = await leaseAgentRun(LEASE_MS);
  if (!leased) return { ran: false, reason: "nothing_to_do" };
  const { run, leaseToken } = leased;
  const counts: Record<string, number> = {};
  const bump = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };
  let cost = 0;
  // Counts add up over the run's ticks.
  const total = (added: Record<string, number>) => sumCounts(run.counts, added);
  try {
    const sentBy = await readAgentSenderUser();
    const spent = await gtmRead((sql) => agentCostToday(sql, today));
    const signals = spent < settings.dailyCostUsd ? await findSignalPeople(run, settings, spent) : null;
    if (signals) {
      // The search took this tick; its people are handled from the next tick on.
      await releaseAgentRun({ id: run.id, leaseToken, status: "queued", counts: total(signals.counts), addCostUsd: signals.cost });
      return { ran: true, runId: run.id, counts: signals.counts };
    }
    // New people first (the run's own), as long as today's money lasts. A wider look than one batch, so people
    // waiting on an email lookup (looked at once a tick, all together first) never hold back the new ones.
    const found = await listAgentPeopleByStatus("found", SCAN, run.id);
    const polls = spent < settings.dailyCostUsd ? await pollLookups(found) : new Map<string, LookupPoll>();
    // Lookups still running are money already promised: kept aside from today's cap before starting more.
    let lookupsReserved = found.length && settings.emailLookup ? (await countRunningEmailLookups()) * EMAIL_LOOKUP_ESTIMATE_USD : 0;
    let lookupsStarted = 0;
    let handled = 0;
    for (const person of found) {
      if (handled >= BATCH) break;
      if (spent + cost >= settings.dailyCostUsd) { bump("stopped_cost_cap"); break; }
      const paid = { usd: 0 };
      const mayStartLookup = lookupsStarted < LOOKUP_STARTS && spent + cost + lookupsReserved < settings.dailyCostUsd;
      let step: FoundStep;
      try {
        step = await handleFound(person, settings, now, { paid, poll: polls.get(person.id), mayStartLookup });
      } catch (error) {
        // One person's failure (a model or search error) never blocks the others or loops on the next tick.
        const message = error instanceof Error ? error.message : String(error);
        console.error("[gtm-agent] person failed", person.id, error);
        cost += paid.usd;
        await updateAgentPerson(person.id, { status: "failed", skipReason: message.slice(0, 300) },
          { kind: "failed", by: AGENT, note: message.slice(0, 160) }, ["found", "matched"]);
        handled += 1;
        bump("failed");
        continue;
      }
      cost += paid.usd;
      if (step.lookup) bump(`lookup_${step.lookup}`);
      // A lookup that ended here has its cost in `cost` now, no longer kept aside.
      if (step.lookup && person.emailLookup?.state === "running") lookupsReserved = Math.max(0, lookupsReserved - EMAIL_LOOKUP_ESTIMATE_USD);
      if (step.outcome === "lookup_started") {
        lookupsStarted += 1;
        lookupsReserved += EMAIL_LOOKUP_ESTIMATE_USD;
        bump("lookup_started");
        continue;
      }
      if (step.outcome === "lookup_waiting" || step.outcome === "lookup_deferred") continue;
      handled += 1;
      bump("found");
      if (step.outcome.startsWith("excluded")) bump("excluded");
      else if (step.outcome === "no_fit") bump("no_fit");
      else if (step.outcome !== "moved") {
        bump("matched");
        bump("drafted");
      }
    }
    if (sentBy) {
      await noticeReactions(BATCH * 2);
      // The sent count is the number of mails this tick (the run's "보냄" adds them up).
      const sent = await sendApproved(settings, sentBy, now, BATCH);
      if (sent) counts.sent = sent;
      if (spent + cost < settings.dailyCostUsd) cost += await followUps(settings, sentBy, now, BATCH);
    }
    const merged = total(counts);
    const next = await nextStatus(run, today);
    await releaseAgentRun({ id: run.id, leaseToken, status: next, counts: merged, addCostUsd: cost });
    return { ran: true, runId: run.id, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[gtm-agent] tick failed", run.id, error);
    await releaseAgentRun({
      id: run.id, leaseToken, status: "queued", counts: total({ ...counts, errors: 1 }), addCostUsd: cost, error: message.slice(0, 1_000),
    });
    return { ran: true, runId: run.id, counts: { ...counts, errors: 1 } };
  }
}

/**
 * A day's run stays open through its day (it carries sending and follow-ups); an import or manual run ends when its
 * people are handled.
 */
async function nextStatus(run: AgentRun, today: string): Promise<"queued" | "done"> {
  const [left] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where run_id = ${run.id}::uuid and status = 'found'
  `);
  if (Number(left?.n ?? 0) > 0) return "queued";
  if (run.kind === "daily") return run.runDate === today ? "queued" : "done";
  return "done";
}

/** Exposed for the Ops "지금 실행" and tests: one tick right away (same rules as the cron). */
export async function runAgentOnce() {
  return runAgentTick(new Date());
}

/** Used by the cron route: gtm_mails exists (the #5 migration needs it). */
export async function agentTablesReady(): Promise<boolean> {
  const { error } = await gtmMailsTable(getSupabaseAdmin()).select("agent_person_id").limit(1);
  return !error;
}
