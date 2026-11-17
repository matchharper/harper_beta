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
import { exclusionReason, kstClock } from "./people";
import { agentPostingList, renderAgentMail } from "./render";
import { followUpsOnHold } from "./replies.server";
import { closePendingAgentMail, deliverAgentMail, listPendingAgentMails, resendAgentMail } from "./send.server";
import { AgentSendError, IDEMPOTENCY_WINDOW_MS } from "./sendErrors";
import { mailsToSendNow, sendWindowNow, sentTimingNote, spendTickMail, tickMailBudget } from "./sendPace.server";
import { EXPLORE_SOURCE, RECENT_MEMORY_DAYS, YIELD_OUTCOMES, readSignalLogEntry, roleFamilyCounts, type SignalHistoryRun, type SignalYield } from "./signals";
import { searchHnPeople } from "./signals.hn.server";
import { searchSignalPeople, type SignalSearchResult } from "./signals.server";
import { lookupSettleUsd } from "./spend";
import { agentSpentToday, mayAgentSpend, recordAgentSpend } from "./spend.server";
import {
  DRAFT_EXPIRED_REASON, DRAFT_MAX_AGE_DAYS, KILLED_TICK_NOTE, SEARCH_MAX_ATTEMPTS, STEP_MAX_ATTEMPTS, bodyWithPostings,
  draftExpired, draftedAt, mayStartPerson, maySendNow, retryDelayMs, runErrorAfterTick, searchDeadline, searchStep,
  sendCallTimeoutMs, sendQueueFull, stillOpenPostings,
} from "./tickRules";
import { exploreBudgetUsd, signalTuningVersion, type SignalTuning } from "./tuning";
import {
  addAgentRunCounts, countAgentSendQueue, ensureDailyAgentRun, insertAgentPeople, leaseAgentRun, listAgentPeopleToHandle,
  listRunningEmailLookups, readAgentPerson, readAgentSenderUser, readAgentSettings, readOpenRoleTitles, readSignalLogs,
  readSignalMemory, releaseAgentRun, resumeAgentRuns, updateAgentPerson, writeSignalLog, type AgentRun,
} from "./store.server";
import type { AgentEmailLookup, AgentExcludeReason, AgentPerson, AgentPosting, AgentSettings } from "./types";

/**
 * #5 dispatcher tick (a web cron every few minutes, /api/internal/gtm-agent/dispatch). One tick leases one run
 * (turns: the run taken longest ago) and, in this order (agent/tickRules.ts has the time slices):
 *   1. notices clicks / sign-ups / opt-outs / bounces and expires mails written too long ago;
 *   2. sends: mails stuck mid-send first, then what is approved (re-checked right before), then follow-ups, while
 *      the hours, the caps and the tick's time allow; a provider or settings error stops sending for the tick and
 *      keeps everyone approved;
 *   3. looks at email lookups started earlier (any run);
 *   4. moves on a few of the run's new people (lookup → postings → mail), unless the written mails already cover
 *      days of sending;
 *   5. searches one source, only when the run has nobody left to handle and the tick still has time for a search.
 * Sending comes before every paid step, so a slow search never holds back mails, follow-ups or reactions. A stop in
 * the middle loses nothing: every step is a status on the person row, every cost is in the spend log the moment it
 * is spent (agent/spend.ts), and the next tick notes a tick that never ended on the run.
 * A person without an address the agent may mail gets an email lookup (agent/emailLookup.ts), which runs on Exa for
 * minutes: started on one tick, looked at on the next ones (the person stays found meanwhile, its state in
 * email_lookup), then the person goes on or is excluded no_email.
 */

/** Longer than the rest of a tick can take (the route stops at 300 s), so no second tick takes the run meanwhile. */
const LEASE_MS = 330_000;
/** Mails one tick sends at most by the pace (the 24-hour rule may add some), and follow-ups. */
const BATCH = 6;
/** New people one tick handles: picking postings reads full JDs (about 30-50 s a person). */
const PEOPLE_PER_TICK = 3;
/** The run's people a tick looks at (people waiting on a lookup or a retry are not in it). */
const SCAN = BATCH * 10;
/** Email lookups a tick starts (one POST each; each runs on Exa for minutes). */
const LOOKUP_STARTS = 8;
/** Running lookups a tick looks at (any run, the longest running first), a few in parallel. */
const LOOKUP_CHECKS = 30;
const LOOKUP_CHECKS_PARALLEL = 6;
/** Mails stuck in "sending" a tick settles; younger than the grace they may still be in flight. */
const PENDING_MAILS = 10;
const PENDING_GRACE_MS = 2 * 60_000;
/** Written mails expired per tick. */
const EXPIRE_BATCH = 50;
/** Sent people whose new clicks / sign-ups / opt-outs / bounces are recorded per tick. */
const REACTIONS = 48;
const DAY_MS = 86_400_000;
const AGENT = "agent";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type TickResult = { ran: boolean; reason?: string; runId?: string; counts?: Record<string, number> };

/** One tick's shared facts: the run, the settings, its clock and what it adds to the run's counts and error. */
type Tick = {
  run: AgentRun;
  settings: AgentSettings;
  now: Date;
  /** When the dispatch request started (ms): the tick's time slices count from it. */
  startedAt: number;
  counts: Record<string, number>;
  /** Shown on the run (its error) until a tick without problems. */
  problems: string[];
  bump: (key: string, by?: number) => void;
};

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
 * recorded (the spend log gets the rest of what its start logged), and the address goes on the person when it passed
 * the checks and the agent may mail it.
 */
async function settleLookup(
  person: AgentPerson, lookup: AgentEmailLookup, now: Date, poll: LookupPoll | undefined,
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
  const settled = settleEmailLookup(lookup, done, now);
  const updated = await updateAgentPerson(person.id, {
    emailLookup: settled.emailLookup, addCostUsd: done.costUsd,
    ...(settled.email ? { email: settled.email, emailSource: "lookup" as const } : {}),
  }, { kind: "email_lookup", by: AGENT, note: settled.note }, ["found"], { lookupRunId: lookup.runId });
  // Settled by another tick already: its spend is logged there.
  if (lookup.runId && !updated) return { person: null, costUsd: 0, found: false };
  await recordAgentSpend({
    step: "lookup", usd: lookupSettleUsd(done.costUsd, lookup.reservedUsd), runId: person.runId, personId: person.id, isTest: person.isTest,
  });
  return { person: updated, costUsd: done.costUsd, found: Boolean(settled.email) };
}

/** The lookups still running, any run's (people beyond a run's own look are never left waiting past their time). */
async function settleLookups(tick: Tick): Promise<void> {
  const running = await listRunningEmailLookups(LOOKUP_CHECKS);
  if (!running.length) return;
  const polls = await pollLookups(running);
  for (const person of running) {
    if (!person.emailLookup) continue;
    const settled = await settleLookup(person, person.emailLookup, tick.now, polls.get(person.id));
    if (settled === "waiting" || (!settled.person && settled.costUsd === 0)) continue;
    const key = settled.found ? "lookup_found" : "lookup_not_found";
    if (person.runId === tick.run.id) tick.bump(key);
    else if (person.runId) await addAgentRunCounts(person.runId, { [key]: 1 });
  }
}

/**
 * Starts a lookup (the person stays found until it ends; the spend log gets its estimate now). When Exa does not
 * start it: tried again after a wait (retryDelayMs), and after STEP_MAX_ATTEMPTS recorded as nothing found.
 */
async function beginLookup(person: AgentPerson, now: Date): Promise<"started" | "retry" | "failed"> {
  const startedAt = now.toISOString();
  let runId: string;
  try {
    ({ runId } = await startEmailLookup(person));
  } catch (error) {
    console.error("[gtm-agent] email lookup did not start", person.id, error);
    const attempt = (person.attempts ?? 0) + 1;
    const delay = retryDelayMs(attempt);
    if (delay !== null) {
      await updateAgentPerson(person.id, { attempts: attempt, retryAt: new Date(now.getTime() + delay).toISOString() }, {
        kind: "note", by: AGENT,
        note: `이메일 찾기를 시작하지 못해 ${Math.round(delay / 60_000)}분 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${errorText(error).slice(0, 120)}`,
      }, ["found"]);
      return "retry";
    }
    const settled = settleEmailLookup({ runId: null, startedAt, state: "running" }, emptyLookup("start_failed", 0), now);
    await updateAgentPerson(person.id, { emailLookup: settled.emailLookup, attempts: attempt, retryAt: null },
      { kind: "email_lookup", by: AGENT, note: settled.note }, ["found"]);
    return "failed";
  }
  // Exa runs it now (and charges for it): logged at its estimate first; the rest when it ends.
  await recordAgentSpend({ step: "lookup", usd: EMAIL_LOOKUP_ESTIMATE_USD, runId: person.runId, personId: person.id, isTest: person.isTest });
  await updateAgentPerson(person.id, {
    emailLookup: { runId, startedAt, state: "running", reservedUsd: EMAIL_LOOKUP_ESTIMATE_USD }, attempts: 0, retryAt: null,
  }, { kind: "email_lookup", by: AGENT, note: "이메일 찾기 시작" }, ["found"]);
  return "started";
}

/**
 * The first rule that keeps the person from being mailed, or null. `atSend`: the last look before sending, which
 * leaves out the duplicate rule (two rows of one person written at once would otherwise stop each other).
 */
async function exclusionNow(person: AgentPerson, settings: AgentSettings, atSend = false): Promise<AgentExcludeReason | null> {
  const facts = await exclusionFacts(person);
  const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
  return exclusionReason({
    method: person.method, email: person.email, signalAt: person.signalAt, isMember: facts.member,
    maxAgeDays: settings.signals.tuning.maxAgeDays,
    isSuppressed: facts.suppressed || facts.opted_out, isInternal, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
    lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: !atSend && facts.active_elsewhere,
  }, new Date(), settings.quietDaysAfterEnd);
}

/**
 * What one person's step did: excluded_<reason>, no_fit, approved, matched (the mail not written: the row moved on),
 * matched_cost_cap (matched, then today's money ran out), moved, lookup_started / lookup_retry / lookup_deferred while
 * the person stays found, or cost_cap (today's money is used up: the person waits). For a person matched earlier:
 * written, moved or cost_cap.
 */
type FoundStep = { outcome: string };

/**
 * found → excluded | no_fit | matched → approved (and matched → approved for a person whose mail was not written yet).
 * Email only (Shaun 11/17): a person without an address the agent may mail gets an email lookup first (across ticks);
 * without one in the end → excluded no_email. Today's cap is read from the spend log before every paid call, and
 * every paid call is logged as soon as it returns.
 */
async function handleFound(found: AgentPerson, tick: Tick, ctx: { mayStartLookup: () => Promise<boolean> }): Promise<FoundStep> {
  const { settings, now } = tick;
  const person = found;
  if (person.status === "matched") return writeMail(person, person.postings, person.language ?? "ko", tick);

  // With a looked-up address, the rules that need one (member, opt-out, recent contact, staff) apply to it too.
  const excluded = await exclusionNow(person, settings);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded }, { kind: "excluded", by: AGENT, note: excluded }, ["found"]);
    return { outcome: `excluded_${excluded}` };
  }

  // Email only: without an address the agent may mail, matching is not worth paying for. A lookup first (Shaun 11/17:
  // "이메일 검색해서 수율을 채우자"), when there is a profile or a link to start from. A post-sourced address on a
  // non-personal domain counts only on the page's own domain (the page where the person was found).
  const email = agentMailableAddress(person.email, person.emailSource, [person.signalUrl]) ? person.email : null;
  let looked = Boolean(person.emailLookup);
  if (!email && needsEmailLookup(person)) {
    // Over this tick's starts or today's money: the person waits for a later tick.
    if (!(await ctx.mayStartLookup())) return { outcome: "lookup_deferred" };
    const begun = await beginLookup(person, now);
    if (begun !== "failed") return { outcome: begun === "started" ? "lookup_started" : "lookup_retry" };
    looked = true;
  }
  if (!email) {
    const note = looked ? "이메일 찾기로도 보낼 수 있는 주소가 없어요"
      : person.email ? "회사 메일 주소만 있어요" : "이메일 주소가 없어요";
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "no_email" }, { kind: "excluded", by: AGENT, note }, ["found"]);
    return { outcome: "excluded_no_email" };
  }

  if (!(await mayAgentSpend(settings.dailyCostUsd))) return { outcome: "cost_cap" };
  const match = await matchAgentPostings(person, { excludeCompanyNames: person.currentCompany ? [person.currentCompany] : [] });
  await recordAgentSpend({ step: "match", usd: match.costUsd, runId: tick.run.id, personId: person.id, isTest: person.isTest });
  // When the first posting search was weak and the plan was revised once, the log says why.
  const revised = match.plans.find((plan) => plan.revised);
  if (revised) {
    await updateAgentPerson(person.id, {}, { kind: "note", by: AGENT, note: `공고 검색 계획을 이렇게 바꿨어요 · ${revised.reason}`.slice(0, 300) }, ["found"]);
  }
  if (match.notJobSeeking) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "not_job_seeking", addCostUsd: match.costUsd },
      { kind: "excluded", by: AGENT, note: match.reason }, ["found"]);
    return { outcome: "excluded_not_job_seeking" };
  }
  if (match.postings.length < 2) {
    await updateAgentPerson(person.id, { status: "no_fit", language: match.language, addCostUsd: match.costUsd },
      { kind: "no_fit", by: AGENT, note: match.reason || "맞는 회사가 2곳이 안 돼요" }, ["found"]);
    return { outcome: "no_fit" };
  }
  const matched = await updateAgentPerson(person.id, {
    status: "matched", postings: match.postings, language: match.language, addCostUsd: match.costUsd, attempts: 0, retryAt: null,
  }, { kind: "matched", by: AGENT, note: match.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ") }, ["found"]);
  if (!matched) return { outcome: "moved" };
  const written = await writeMail(matched, match.postings, match.language, tick);
  // Matched, the mail to write later (today's money ran out, or the row moved on).
  return { outcome: written.outcome === "written" ? "approved" : written.outcome === "cost_cap" ? "matched_cost_cap" : "matched" };
}

/** matched → approved: the mail written (today's money allowing; otherwise the person waits, matched). */
async function writeMail(person: AgentPerson, postings: AgentPosting[], language: "ko" | "en", tick: Tick): Promise<FoundStep> {
  if (!(await mayAgentSpend(tick.settings.dailyCostUsd))) return { outcome: "cost_cap" };
  const draft = await composeAgentMail({ person, postings, language, senderName: tick.settings.senderName ?? "" });
  await recordAgentSpend({ step: "compose", usd: draft.costUsd, runId: tick.run.id, personId: person.id, isTest: person.isTest });
  const approved = await updateAgentPerson(person.id, {
    // No approval step (Shaun 11/17): every mail goes out within the hours and caps; quality is checked on the log.
    status: "approved", channel: "email", draftSubject: draft.subject, draftBody: draft.body,
    messageKind: draft.messageKind, reason: draft.reason, addCostUsd: draft.costUsd, attempts: 0, retryAt: null,
  }, { kind: "drafted", by: AGENT, note: "메일을 썼어요 · 보내는 시간에 나가요" }, ["matched"]);
  return { outcome: approved ? "written" : "moved" };
}

/**
 * The run's people a tick moves on (found, and matched ones still without a mail), a few within the tick's time slice
 * and today's money. A step that fails for a passing reason (a model error) is tried again after a wait, and the
 * person fails after STEP_MAX_ATTEMPTS. Returns whether the run had anyone to handle now.
 */
async function handlePeople(tick: Tick): Promise<boolean> {
  const people = await listAgentPeopleToHandle(tick.run.id, SCAN);
  if (!people.length) return false;
  let lookupsStarted = 0;
  let handled = 0;
  const mayStartLookup = async () => lookupsStarted < LOOKUP_STARTS && mayAgentSpend(tick.settings.dailyCostUsd, EMAIL_LOOKUP_ESTIMATE_USD);
  for (const person of people) {
    if (handled >= PEOPLE_PER_TICK) break;
    if (!mayStartPerson(tick.startedAt, Date.now())) { tick.bump("stopped_time"); break; }
    // Turned off since the tick started: no new paid step.
    if (!(await readAgentSettings()).enabled) break;
    let step: FoundStep;
    try {
      step = await handleFound(person, tick, { mayStartLookup });
    } catch (error) {
      // One person's failure (a model or search error) never blocks the others; it is tried again after a wait.
      const message = errorText(error);
      console.error("[gtm-agent] person failed", person.id, error);
      const attempt = (person.attempts ?? 0) + 1;
      const delay = retryDelayMs(attempt);
      if (delay !== null) {
        await updateAgentPerson(person.id, { attempts: attempt, retryAt: new Date(Date.now() + delay).toISOString() }, {
          kind: "note", by: AGENT, note: `오류로 ${Math.round(delay / 60_000)}분 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${message.slice(0, 140)}`,
        }, ["found", "matched"]);
        tick.bump("retry");
      } else {
        await updateAgentPerson(person.id, { status: "failed", skipReason: message.slice(0, 300), attempts: attempt, retryAt: null },
          { kind: "failed", by: AGENT, note: message.slice(0, 160) }, ["found", "matched"]);
        tick.bump("failed");
      }
      handled += 1;
      continue;
    }
    if (step.outcome === "cost_cap") { tick.bump("stopped_cost_cap"); break; }
    if (step.outcome === "lookup_started") {
      lookupsStarted += 1;
      tick.bump("lookup_started");
      continue;
    }
    if (step.outcome === "lookup_retry") { tick.bump("lookup_retry"); continue; }
    if (step.outcome === "lookup_deferred") continue;
    handled += 1;
    // A person matched on an earlier tick was counted as found and matched then.
    if (person.status === "matched") {
      if (step.outcome === "written") tick.bump("drafted");
      continue;
    }
    tick.bump("found");
    if (step.outcome.startsWith("excluded")) tick.bump("excluded");
    else if (step.outcome === "no_fit") tick.bump("no_fit");
    else if (step.outcome === "matched") tick.bump("matched");
    else if (step.outcome === "matched_cost_cap") {
      tick.bump("matched");
      tick.bump("stopped_cost_cap");
      break;
    } else if (step.outcome !== "moved") {
      tick.bump("matched");
      tick.bump("drafted");
    }
  }
  return true;
}

/** The Roles among `postings` that are no longer open (gone, expired, or not active any more). */
async function closedRoleIds(postings: readonly AgentPosting[]): Promise<Set<string>> {
  const ids = [...new Set(postings.map((posting) => posting.roleId).filter((id): id is string => Boolean(id && UUID.test(id))))];
  if (!ids.length) return new Set();
  const rows = await gtmRead((sql) => sql<Array<{ role_id: string }>>`
    select wanted.id::text as role_id
    from unnest(${ids}::uuid[]) as wanted(id)
    left join public.company_roles r on r.role_id = wanted.id
    where r.role_id is null or coalesce(r.is_expired, false) or (r.expires_at is not null and r.expires_at <= now())
      or coalesce(lower(btrim(r.status)), 'active') not in ('active', 'top_priority')
  `);
  return new Set(rows.map((row) => row.role_id.toLowerCase()));
}

/** The person's postings with the closed ones marked by lower-cased Role id (stillOpenPostings compares as stored). */
function closedOf(postings: readonly AgentPosting[], closed: ReadonlySet<string>): Set<string> {
  return new Set(postings.flatMap((posting) => (posting.roleId && closed.has(posting.roleId.toLowerCase()) ? [posting.roleId] : [])));
}

/**
 * The last look before a first mail goes out (a mail may have waited days): an expired draft is skipped; the rules
 * (member, opt-out, recent contact, stale signal …) exclude; postings closed since are dropped from the mail, and
 * with fewer than 2 left the person is skipped. Returns what to send, or null when the person does not get it.
 */
async function readyToSend(person: AgentPerson, tick: Tick): Promise<{ subject: string; body: string; postings: AgentPosting[] } | null> {
  if (draftExpired(draftedAt(person.events, person.updatedAt), tick.now)) {
    await updateAgentPerson(person.id, { status: "skipped", skipReason: DRAFT_EXPIRED_REASON },
      { kind: "expired", by: AGENT, note: DRAFT_EXPIRED_REASON }, ["approved"]);
    tick.bump("expired");
    return null;
  }
  const excluded = await exclusionNow(person, tick.settings, true);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded },
      { kind: "excluded", by: AGENT, note: `보내기 전에 다시 보니 · ${excluded}` }, ["approved"]);
    tick.bump("excluded_before_send");
    return null;
  }
  const subject = person.draftSubject ?? "";
  const body = person.draftBody ?? "";
  const { kept, dropped, skip } = stillOpenPostings(person.postings, closedOf(person.postings, await closedRoleIds(person.postings)));
  if (!dropped.length) return { subject, body, postings: person.postings };
  const names = dropped.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ").slice(0, 200);
  const rebuilt = skip ? null : bodyWithPostings(body, agentPostingList(person.postings), agentPostingList(kept));
  if (rebuilt === null) {
    const reason = skip ? `공고가 닫혀 2곳이 안 남았어요 · ${names}` : `닫힌 공고를 메일에서 뺄 수 없어 보내지 않았어요 · ${names}`;
    await updateAgentPerson(person.id, { status: "skipped", skipReason: reason }, { kind: "skipped", by: AGENT, note: reason }, ["approved"]);
    tick.bump("skipped_closed_postings");
    return null;
  }
  const updated = await updateAgentPerson(person.id, { postings: kept, draftBody: rebuilt },
    { kind: "note", by: AGENT, note: `닫힌 공고를 메일에서 뺐어요 · ${names}` }, ["approved"]);
  return updated ? { subject, body: rebuilt, postings: kept } : null;
}

/** What a sending step did: first mails sent, and why sending stopped for the tick (the provider), if it did. */
type SendOutcome = { sent: number; paused: string | null };

/**
 * Mails stuck in "sending" (a tick killed during the provider call, a timeout or a provider error whose outcome is
 * unknown), settled before anything new goes out:
 * - the run already recorded it as sent (only the row's own update was lost): asked again for its id, sent either way;
 * - the person still waits for it (approved, or sent and due a follow-up): asked again with the same request and key
 *   inside the send window (a mail the provider already took is not sent twice); past the key's 24 hours the
 *   outcome cannot be known, so the row fails and the person is not mailed again;
 * - the person moved on meanwhile (skipped by Ops, replied, ended): the row fails.
 * `pending`: people whose mail is still unsettled (nothing new goes to them this tick).
 */
async function settlePendingMails(tick: Tick): Promise<SendOutcome & { pending: Set<string> }> {
  const { settings, now } = tick;
  const pending = new Set<string>();
  let paused: string | null = null;
  let sent = 0;
  for (const mail of await listPendingAgentMails(PENDING_GRACE_MS, PENDING_MAILS)) {
    const person = mail.personId ? await readAgentPerson(mail.personId) : null;
    const stale = Date.now() - Date.parse(mail.createdAt) > IDEMPOTENCY_WINDOW_MS;
    if (person && (person.mailId === mail.id || person.followupMailId === mail.id)) {
      if (!stale && !paused) {
        try {
          await resendAgentMail(mail, sendCallTimeoutMs(tick.startedAt, Date.now()));
          continue;
        } catch (error) {
          console.warn("[gtm-agent] sent mail's id not read back", mail.id, errorText(error));
        }
      }
      await closePendingAgentMail(mail.id, "sent", null);
      continue;
    }
    const first = person?.status === "approved";
    const followup = person?.status === "sent" && Boolean(person.mailId) && !person.followupMailId;
    if (!person || (!first && !followup)) {
      await closePendingAgentMail(mail.id, "failed", "보내는 중에 멈췄고, 그사이 사람이 다른 상태가 됐어요");
      continue;
    }
    if (stale) {
      const reason = "보냈는지 확인할 수 없어 다시 보내지 않아요 (24시간 지남)";
      await closePendingAgentMail(mail.id, "failed", reason);
      if (first) {
        await updateAgentPerson(person.id, { status: "skipped", skipReason: reason }, { kind: "skipped", by: AGENT, note: reason }, ["approved"]);
      } else {
        await updateAgentPerson(person.id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
          { kind: "ended", by: AGENT, note: `후속 메일을 ${reason}` }, ["sent"]);
      }
      continue;
    }
    pending.add(person.id);
    if (paused || !sendWindowNow(settings, now) || agentSenderProblem(settings) || !maySendNow(tick.startedAt, Date.now())) continue;
    try {
      const result = await resendAgentMail(mail, sendCallTimeoutMs(tick.startedAt, Date.now()));
      pending.delete(person.id);
      spendTickMail(await tickMailBudget(settings, now));
      const followupDueAt = new Date(now.getTime() + settings.followupDays * DAY_MS).toISOString();
      if (first) {
        sent += 1;
        await updateAgentPerson(person.id, { status: "sent", mailId: result.mailId, sentAt: result.sentAt, followupDueAt },
          { kind: "sent", by: AGENT, note: `메일 보냄 · ${mail.subject} (멈췄던 보내기를 이어서)` }, ["approved"]);
      } else {
        await updateAgentPerson(person.id, { followupMailId: result.mailId, followupDueAt },
          { kind: "followup_sent", by: AGENT, note: `후속 메일 보냄 · ${mail.subject} (멈췄던 보내기를 이어서)` }, ["sent"]);
      }
    } catch (error) {
      if (!(error instanceof AgentSendError)) throw error;
      if (error.kind === "recipient") {
        pending.delete(person.id);
        if (first) {
          await updateAgentPerson(person.id, { status: "failed", skipReason: error.message.slice(0, 300) },
            { kind: "failed", by: AGENT, note: `메일을 보내지 못했어요 · ${error.message.slice(0, 160)}` }, ["approved"]);
        } else {
          await updateAgentPerson(person.id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
            { kind: "failed", by: AGENT, note: `후속 메일을 보내지 못했어요 · ${error.message.slice(0, 160)}` }, ["sent"]);
        }
        continue;
      }
      // Refused (the row failed: a later tick writes a new one) or unknown (asked again next tick): sending waits.
      if (error.kind === "refused") pending.delete(person.id);
      paused = error.message;
    }
  }
  return { sent, paused, pending };
}

/**
 * approved → sent (or failed / skipped / excluded, on the timeline) on the chosen days and hours, spread over the day
 * within today's cap, newest signal first, and anyone whose 24 hours after the signal would end before the next
 * chance goes now (agent/sendTiming.ts). `limit`: paced mails in one tick at most. A provider or settings error (not
 * the person's) stops sending for the tick and the person stays approved.
 */
async function sendApproved(tick: Tick, sentBy: string, limit: number, pending: ReadonlySet<string>): Promise<SendOutcome> {
  const { settings, now } = tick;
  if (!sendWindowNow(settings, now) || agentSenderProblem(settings)) return { sent: 0, paused: null };
  const budget = await tickMailBudget(settings, now);
  let sent = 0;
  for (const { person, due } of await mailsToSendNow(settings, now, limit)) {
    if (pending.has(person.id)) continue;
    if (!maySendNow(tick.startedAt, Date.now())) { tick.bump("stopped_send_time"); break; }
    // Turned off since the tick started: nothing more goes out.
    if (!(await readAgentSettings()).enabled) break;
    const ready = await readyToSend(person, tick);
    if (!ready) continue;
    let result: Awaited<ReturnType<typeof deliverAgentMail>>;
    try {
      result = await deliverAgentMail({
        person, postings: ready.postings, settings, sentBy, followup: false, timeoutMs: sendCallTimeoutMs(tick.startedAt, Date.now()),
        render: (_mailId, links) => renderAgentMail({
          language: person.language ?? "ko", subject: ready.subject, body: ready.body, name: person.name, harperUrl: links.harperUrl,
          postings: ready.postings, senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "",
          unsubscribeUrl: links.unsubscribeUrl,
        }),
      });
    } catch (error) {
      // The provider or the sender settings, not this person: everyone stays approved; the next tick tries again.
      if (error instanceof AgentSendError && error.kind !== "recipient") return { sent, paused: error.message };
      // This mail cannot go (the address, or a failure before the provider): the person stops here.
      const message = errorText(error);
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
      }, { kind: "sent", by: AGENT, note: `메일 보냄 · ${ready.subject}${sentTimingNote(person, result.sentAt, due)}` }, ["approved"]);
    } else if (result.reason.includes("오늘 보낼 수 있는")) {
      break; // today's cap: the rest waits for tomorrow
    } else {
      await updateAgentPerson(person.id, { status: "skipped", skipReason: result.reason, mailId: result.mailId },
        { kind: "skipped", by: AGENT, note: result.reason }, ["approved"]);
    }
  }
  return { sent, paused: null };
}

type ReactionRow = {
  id: string; events: Array<{ kind: string }> | null; first_opened_at: string | Date | null; claimed_at: string | Date | null;
  unsubscribed_at: string | Date | null; delivery_status: string | null;
};

/**
 * Clicks, sign-ups, opt-outs and bounces on sent mails become timeline lines (and stop the follow-up). Only rows with
 * a reaction not recorded yet are read, so however many people reacted before, new reactions are always seen.
 */
async function noticeReactions(limit: number) {
  const rows = await gtmRead((sql) => sql<ReactionRow[]>`
    select p.id, p.events, m.first_opened_at, m.claimed_at, m.unsubscribed_at, m.delivery_status
    from public.gtm_agent_people p
    join public.gtm_mails m on m.id in (p.mail_id, p.followup_mail_id)
    where p.status = 'sent' and (
      (m.unsubscribed_at is not null and not p.events @> '[{"kind": "unsubscribed"}]'::jsonb)
      or (m.delivery_status is not null and not p.events @> '[{"kind": "bounced"}]'::jsonb)
      or (m.claimed_at is not null and not p.events @> '[{"kind": "signed_up"}]'::jsonb)
      or (m.first_opened_at is not null and not p.events @> '[{"kind": "clicked"}]'::jsonb))
    order by p.updated_at limit ${limit}::int
  `);
  // A person's first mail and follow-up are two rows: what one recorded counts for the other.
  const seenBy = new Map<string, Set<string>>();
  for (const row of rows) {
    const seen = seenBy.get(row.id) ?? new Set((row.events ?? []).map((event) => event.kind));
    seenBy.set(row.id, seen);
    if (seen.has("unsubscribed") || seen.has("bounced")) continue;
    if (row.unsubscribed_at) {
      seen.add("unsubscribed");
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null }, { kind: "unsubscribed", by: AGENT, note: "연락 받지 않기를 눌렀어요" }, ["sent"]);
      continue;
    }
    if (row.delivery_status) {
      seen.add("bounced");
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null }, { kind: "bounced", by: AGENT, note: row.delivery_status }, ["sent"]);
      continue;
    }
    if (row.claimed_at && !seen.has("signed_up")) {
      seen.add("signed_up");
      await updateAgentPerson(row.id, { followupDueAt: null }, { kind: "signed_up", by: AGENT, note: "메일로 가입했어요" }, ["sent"]);
    }
    if (row.first_opened_at && !seen.has("clicked")) {
      seen.add("clicked");
      await updateAgentPerson(row.id, { followupDueAt: null }, { kind: "clicked", by: AGENT, note: "공고 페이지를 열었어요" }, ["sent"]);
    }
  }
}

/** Written mails not sent within DRAFT_MAX_AGE_DAYS are not sent (skipped, counted under 제외). */
async function expireDrafts(tick: Tick) {
  const rows = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select p.id::text as id from public.gtm_agent_people p
    where p.status = 'approved'
      and coalesce((
        select max((e.value ->> 'at')::timestamptz)
        from jsonb_array_elements(case when jsonb_typeof(p.events) = 'array' then p.events else '[]'::jsonb end) e(value)
        where e.value ->> 'kind' in ('drafted', 'approved')
      ), p.updated_at) < now() - make_interval(days => ${DRAFT_MAX_AGE_DAYS}::int)
      -- A mail stuck mid-send is settled first (it may have gone out).
      and not exists (select 1 from public.gtm_mails m where m.agent_person_id = p.id and m.status = 'sending')
    order by p.updated_at limit ${EXPIRE_BATCH}::int
  `);
  for (const { id } of rows) {
    const expired = await updateAgentPerson(id, { status: "skipped", skipReason: DRAFT_EXPIRED_REASON },
      { kind: "expired", by: AGENT, note: DRAFT_EXPIRED_REASON }, ["approved"]);
    if (expired) tick.bump("expired");
  }
}

/**
 * One follow-up after followupDays without a reaction; after a second wait without one, the person ends. Follow-ups
 * go out on the same days and hours as first mails and share the tick's pace with them (agent/sendTiming.ts): the
 * ones to end first (no mail), then newest signal first. Postings closed since the first mail are left out (none
 * left: no follow-up). A provider or settings error stops sending for the tick; the follow-up stays due.
 */
async function followUps(tick: Tick, sentBy: string, limit: number, pending: ReadonlySet<string>): Promise<SendOutcome> {
  // While a team mailbox's replies are not being read, nothing is sent or ended here (replies.server.ts).
  if (await followUpsOnHold()) return { sent: 0, paused: null };
  const { settings, now } = tick;
  const due = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select id from public.gtm_agent_people where status = 'sent' and followup_due_at <= now()
    order by (events @> '[{"kind":"followup_sent"}]'::jsonb) desc, signal_at desc nulls last, followup_due_at
    limit ${limit}::int
  `);
  for (const { id } of due) {
    if (pending.has(id)) continue;
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
      if (!maySendNow(tick.startedAt, Date.now())) { tick.bump("stopped_send_time"); break; }
      const budget = await tickMailBudget(settings, now);
      if (budget.left <= 0 || budget.quota <= 0) continue;
      const postings = stillOpenPostings(person.postings, closedOf(person.postings, await closedRoleIds(person.postings))).kept;
      if (!postings.length) {
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
          { kind: "ended", by: AGENT, note: "제안한 공고가 모두 닫혀 후속 메일을 보내지 않았어요" }, ["sent"]);
        continue;
      }
      if (!(await mayAgentSpend(settings.dailyCostUsd))) { tick.bump("stopped_cost_cap"); break; }
      // Turned off since the tick started: nothing more goes out.
      if (!(await readAgentSettings()).enabled) break;
      const draft = await composeAgentMail({
        person, postings, language: person.language ?? "ko", senderName: settings.senderName ?? "", followup: true, previousSubject: person.draftSubject,
      });
      await recordAgentSpend({ step: "followup", usd: draft.costUsd, runId: tick.run.id, personId: id, isTest: person.isTest });
      let result: Awaited<ReturnType<typeof deliverAgentMail>>;
      try {
        result = await deliverAgentMail({
          person, postings, settings, sentBy, followup: true, timeoutMs: sendCallTimeoutMs(tick.startedAt, Date.now()),
          render: (_mailId, links) => renderAgentMail({
            language: person.language ?? "ko", subject: draft.subject, body: draft.body, name: person.name, harperUrl: links.harperUrl,
            postings, senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "", unsubscribeUrl: links.unsubscribeUrl,
            followup: true,
          }),
        });
      } catch (error) {
        if (error instanceof AgentSendError && error.kind !== "recipient") {
          // Not the person's: the follow-up stays due (a stuck one is settled on the next tick).
          await updateAgentPerson(id, { addCostUsd: draft.costUsd }, null, ["sent"]);
          return { sent: 0, paused: error.message };
        }
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: draft.costUsd },
          { kind: "failed", by: AGENT, note: `후속 메일을 보내지 못했어요 · ${errorText(error).slice(0, 160)}` }, ["sent"]);
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
      } else {
        await updateAgentPerson(id, { addCostUsd: draft.costUsd }, null, ["sent"]);
      }
    }
  }
  return { sent: 0, paused: null };
}

/**
 * The sending part of a tick: stuck mails, first mails, follow-ups. A provider or settings error stops it and is
 * shown on the run (kept until a tick without problems).
 */
async function sendMails(tick: Tick, sentBy: string): Promise<void> {
  const stuck = await settlePendingMails(tick);
  let sent = stuck.sent;
  let paused = stuck.paused;
  if (!paused) {
    const first = await sendApproved(tick, sentBy, BATCH, stuck.pending);
    sent += first.sent;
    paused = first.paused;
  }
  if (!paused) paused = (await followUps(tick, sentBy, BATCH, stuck.pending)).paused;
  // The sent count is the number of first mails this tick (the run's "보냄" adds them up).
  if (sent) tick.bump("sent", sent);
  if (paused) {
    tick.bump("send_paused");
    tick.problems.push(`메일 보내기를 잠시 멈췄어요 (다음 실행에서 다시 해요) · ${paused}`);
  }
}

/** Per source and run: at most this share of what is left of today's money, and never more than SIGNAL_BUDGET_MAX. */
const SIGNAL_BUDGET_SHARE = 0.5;
const SIGNAL_BUDGET_MAX = 2;
/** What one search may keep at most; the budget and the tuning bound it long before (no per-source headcount). */
const SIGNAL_MAX_PEOPLE = 50;
/**
 * Hacker News is read through its free API (signals.hn.server.ts): only its judging costs (a batch of comments well
 * under a cent), so it gets this much at most instead of a share of the web search's budget.
 */
const HN_BUDGET_USD = 0.1;
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

/** What a search's yields add up to on the run's counts (only what is not zero), per source. */
function yieldCounts(id: string, result: SignalSearchResult): Record<string, number> {
  const people = result.yields.filter((item: SignalYield) => item.stage !== "layoff_news");
  const sum = (pick: (item: SignalYield) => number | undefined) => people.reduce((total, item) => total + (pick(item) ?? 0), 0);
  const names: Record<(typeof YIELD_OUTCOMES)[number], string> = {
    rejected: "judge_rejected", belowScore: "judge_below_score", notIdentifiable: "judge_no_key", known: "judge_known", unmatched: "judge_unmatched",
  };
  const counts: Record<string, number> = {
    // Exa errors are not "no results" (the call failed); a search that stopped on an error counts once more.
    [`search_errors_${id}`]: result.searchErrors + (result.stopped === "error" ? 1 : 0),
    [`search_raw_${id}`]: sum((item) => item.raw),
    [`search_known_pages_${id}`]: result.knownUrls,
    [`judge_pages_${id}`]: sum((item) => item.results),
    ...Object.fromEntries(YIELD_OUTCOMES.map((field) => [`${names[field]}_${id}`, sum((item) => item[field])])),
  };
  return Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0));
}

/**
 * A day's run (and "지금 실행") searches each turned-on source once, then the open web with its share (Shaun 11/17:
 * default domains, not limited to them). One search per tick, at most until `deadlineAt` (what it kept by then is
 * kept); the people found join this run and are handled like uploaded ones. A search is marked tried before it
 * starts; one the time limit cuts off is not marked done (search_cut_off_<id>), so it is tried once more and then
 * given up (SEARCH_MAX_ATTEMPTS); one that fails is tried again too. A day's run whose day has passed searches no
 * more. Each person keeps where they were found (the page's source or domain), how, the page text the judge read, and
 * the settings and tuning versions; new domains with kept people are kept on the run's counts (new_domain:<domain>)
 * for "기본 목록에 넣기".
 *
 * Only new people (11/17 search review): the people found and the pages judged in the last RECENT_MEMORY_DAYS go into
 * the search, which skips those pages before the judge and those people before keeping them (anyone known from before
 * that is still left out here). The first plans lean toward the role families of the postings Harper has open.
 */
async function findSignalPeople(tick: Tick, deadlineAt: number): Promise<void> {
  const { run, settings } = tick;
  // Uploads bring their own people.
  if (run.kind === "import") return;
  if (run.kind === "daily" && run.runDate !== kstClock(tick.now).day) return;
  const { sources, exploreShare, tuning, blockedDomains } = settings.signals;
  const spent = await agentSpentToday();
  if (spent >= settings.dailyCostUsd) { tick.bump("stopped_cost_cap"); return; }
  const left = Math.max(0, settings.dailyCostUsd - spent);
  const runBudget = Math.min(SIGNAL_BUDGET_MAX, left * SIGNAL_BUDGET_SHARE);
  // The open-web share splits the run's search budget (Shaun 11/17): (1 - share) over the turned-on sources (the
  // default list and the domains Ops added), share to the open web. No per-source headcount.
  const turnedOn = Object.entries(sources).filter(([, setting]) => setting.enabled);
  const next = turnedOn.find(([id]) => searchStep(run.counts, id) !== "done");
  const exploring = !next && exploreShare > 0 && searchStep(run.counts, EXPLORE_SOURCE) !== "done";
  if (!next && !exploring) return;
  const id = next ? next[0] : EXPLORE_SOURCE;
  if (searchStep(run.counts, id) === "give_up") {
    // Tried SEARCH_MAX_ATTEMPTS times without finishing (killed at the time limit, or failed): the run goes on.
    tick.bump(`searched_${id}`);
    tick.bump(`search_gave_up_${id}`);
    tick.problems.push(`사람 찾기(${id})를 ${SEARCH_MAX_ATTEMPTS}번 끝내지 못해 이번 실행에선 건너뛰어요`);
    return;
  }
  // The web search's share is split over the turned-on sources that use it (not Hacker News: see HN_BUDGET_USD).
  const webSources = Math.max(1, turnedOn.filter(([source]) => source !== "hn").length);
  const budget = id === "hn" ? Math.min(HN_BUDGET_USD, runBudget)
    : next ? Math.round((runBudget * (1 - exploreShare) / webSources) * 100) / 100 : exploreBudgetUsd(runBudget, exploreShare);
  if (budget < 0.05) {
    tick.bump(`searched_${id}`);
    tick.bump(`skipped_budget_${id}`);
    return;
  }
  // Marked tried before it starts (written now, not when the tick ends): a search killed with the tick counts.
  await addAgentRunCounts(run.id, { [`search_attempts_${id}`]: 1 });
  const spend = (usd: number) => recordAgentSpend({ step: "search", usd, runId: run.id, source: id, isTest: run.isTest });
  // What earlier runs found and judged (a search without it still runs: it may only judge and find people again).
  const memory = await readSignalMemory(RECENT_MEMORY_DAYS).catch((error) => {
    console.warn("[gtm-agent] signal memory", id, errorText(error));
    return { keys: new Set<string>(), urls: new Set<string>() };
  });
  const openRoles = roleFamilyCounts(await readOpenRoleTitles().catch((error) => {
    console.warn("[gtm-agent] open roles", id, errorText(error));
    return [] as string[];
  }));
  // Hacker News through its API; every other source through the web search.
  const search = id === "hn" ? searchHnPeople : searchSignalPeople;
  const result = await search({
    source: id, budgetUsd: budget, maxPeople: SIGNAL_MAX_PEOPLE, known: memory.keys, knownUrls: memory.urls, blockedDomains, tuning,
    history: await signalHistory(id, run.id, tuning), openRoles, deadlineAt, onSpend: spend,
  });
  // What the search did not log as it went (a step cut off at the deadline, at its estimate).
  await spend(result.costUsd - result.recordedUsd);
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
    // The page the judge read (plain text, at most 3,000 characters): matching and the mail read more than one line.
    currentCompany: person.currentCompany, profileUrl: person.profileUrl, profileText: person.pageText, signalText: person.signalText,
    signalUrl: person.signalUrl, signalAt: person.signalAt,
    foundNote: `${person.method === "layoff_company" ? `구조조정 회사(${person.group})` : person.method === "open_to_work_profile" ? "구직 중 프로필" : "구직 글"} · 점수 ${person.score}`,
  })), AGENT);
  console.info("[gtm-agent] signals", id, JSON.stringify({
    stopped: result.stopped, plans: result.plans.map((plan) => plan.reason ?? plan.plan.slice(0, 120)), yields: result.yields,
  }));
  if (result.stopped === "error") {
    // Tried again on a later tick (the attempt is counted); what it kept is in already.
    tick.problems.push(`사람 찾기(${id})가 중간에 실패했어요 · ${result.error ?? ""}`);
  } else if (result.stopped === "deadline") {
    // Cut off at the time limit: not done (a later tick tries again, skipping the pages judged now, until
    // SEARCH_MAX_ATTEMPTS); what it kept is in already.
    tick.bump(`search_cut_off_${id}`);
  } else {
    tick.bump(`searched_${id}`);
  }
  const added: Record<string, number> = {
    // Known: the judge's targets an earlier run had found, and anyone known from before that (left out at insert).
    [`signal_found_${id}`]: fresh.length, [`signal_known_${id}`]: result.knownPeople + result.people.length - fresh.length,
    [`searches_${id}`]: result.yields.length,
    // The search's spend is the run's, not one person's: kept per source so /ops #5 can show it by source.
    [`signal_cost_${id}`]: result.costUsd,
    ...yieldCounts(id, result),
    ...Object.fromEntries(result.newDomains.map((item) => [`new_domain:${item.domain}`, item.kept])),
  };
  for (const [key, value] of Object.entries(added)) tick.bump(key, value);
}

/**
 * One dispatcher tick. `startedAt`: when the dispatch request started (the reply read runs before), so the tick's
 * time slices end before the route's limit.
 */
export async function runAgentTick(args: { now?: Date; startedAt?: number } = {}): Promise<TickResult> {
  const now = args.now ?? new Date();
  const startedAt = args.startedAt ?? now.getTime();
  const settings = await readAgentSettings();
  if (!settings.enabled) return { ran: false, reason: "off" };
  const today = kstClock(now).day;
  // Runs the old 긴급 중지 stopped carry on (also done when the agent is turned on).
  await resumeAgentRuns();
  await ensureDailyAgentRun(today);
  const leased = await leaseAgentRun(LEASE_MS, KILLED_TICK_NOTE);
  if (!leased) return { ran: false, reason: "nothing_to_do" };
  const { run, leaseToken, expiredLease } = leased;
  const counts: Record<string, number> = {};
  const tick: Tick = {
    run, settings, now, startedAt, counts,
    // The last tick on this run never ended: the note stays on the run until a later tick without problems.
    problems: expiredLease ? [KILLED_TICK_NOTE] : [],
    bump: (key, by = 1) => { counts[key] = Math.round(((counts[key] ?? 0) + by) * 1_000_000) / 1_000_000; },
  };
  try {
    const sentBy = await readAgentSenderUser();
    await noticeReactions(REACTIONS);
    await expireDrafts(tick);
    if (sentBy) await sendMails(tick, sentBy);
    await settleLookups(tick);
    // New people cost money (lookup, postings, writing): not while the written mails already cover days of sending.
    const queueFull = sendQueueFull(await countAgentSendQueue(), settings.dailyMailCap);
    if (queueFull) tick.bump("throttled_queue");
    const busy = queueFull || await handlePeople(tick);
    if (!busy) {
      const deadline = searchDeadline(startedAt, Date.now());
      if (deadline) await findSignalPeople(tick, deadline);
    }
    const { error, clear } = runErrorAfterTick(tick.problems);
    await releaseAgentRun({ id: run.id, leaseToken, status: await nextStatus(run, today), addCounts: counts, error, clearError: clear });
    return { ran: true, runId: run.id, counts };
  } catch (error) {
    console.error("[gtm-agent] tick failed", run.id, error);
    const { error: line } = runErrorAfterTick([...tick.problems, errorText(error)]);
    tick.bump("errors");
    await releaseAgentRun({ id: run.id, leaseToken, status: "queued", addCounts: counts, error: line });
    return { ran: true, runId: run.id, counts };
  }
}

/**
 * A day's run stays open through its day (it carries sending and follow-ups); an import or manual run ends when its
 * people are handled (found, or matched with the mail still to write).
 */
async function nextStatus(run: AgentRun, today: string): Promise<"queued" | "done"> {
  const [left] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where run_id = ${run.id}::uuid and status in ('found', 'matched')
  `);
  if (Number(left?.n ?? 0) > 0) return "queued";
  if (run.kind === "daily") return run.runDate === today ? "queued" : "done";
  return "done";
}

/** Exposed for tests and scripts: one tick right away (same rules as the cron). */
export async function runAgentOnce() {
  return runAgentTick();
}

/** Used by the cron route: gtm_mails exists (the #5 migration needs it). */
export async function agentTablesReady(): Promise<boolean> {
  const { error } = await gtmMailsTable(getSupabaseAdmin()).select("agent_person_id").limit(1);
  return !error;
}
