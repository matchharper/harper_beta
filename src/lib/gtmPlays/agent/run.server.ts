import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmRead } from "../db.server";
import { gtmMailsTable } from "../mailSend.server";
import { composeAgentMail } from "./compose.server";
import { companySourcingDeliveryStats, runCompanyMails } from "./companyMail.server";
import { conversationStore } from "./conversation.server";
import {
  FOLLOWUP_BLOCKED_NOTE, FOLLOWUP_HUMAN_NOTE, FOLLOWUP_MEMBER_NOTE, FOLLOWUP_SUPPRESSED_NOTE, followupDueAfterClick, followupSentNote, followupSubject, openedLink,
  planCoachingFollowup, planFollowup, planGeneralFollowup, renderAgentFollowup,
  type FollowupFound,
} from "./followup";
import { followupThreadHumanOwned, searchFollowupEvents, searchFollowupPostings } from "./followup.server";
import {
  EMAIL_LOOKUP_ESTIMATE_USD, EMAIL_LOOKUP_RUN_USD, LOOKUP_MIN_SIGNAL_SCORE, emptyLookup, lookupAllowance, lookupTimedOut,
  needsEmailLookup, noEmailReason,
  settleEmailLookup, type EmailLookupCheck, type EmailLookupDone,
} from "./emailLookup";
import { cancelEmailLookup, checkEmailLookup, startEmailLookup } from "./emailLookup.server";
import {
  AGENT_CHANNELS, CANDIDATE_CHANNELS, CHANNEL_LABELS, channelOf, channelRoomLeft, offerOf, searchedIntents, storedOffer, type AgentChannelKey,
  type AgentOffer,
} from "./channels";
import { agentCodeVersion } from "./config";
import { ensureAgentConfig } from "./config.server";
import { exclusionFacts } from "./exclusion.server";
import { agentMailableAddress, agentSenderProblem, personMailable, profileHandles } from "./mailRules";
import { mailboxCanExist } from "../personalMail";
import { MAX_FITS, MIN_FITS, detectLanguage } from "./match";
import { matchAgentPostings } from "./match.server";
import { exclusionReason, kstClock, sumCounts } from "./people";
import { searchedProfileText } from "./profile";
import { applicantListCompany } from "./applicantList";
import { gtmSignupsCte } from "./signups.server";
import { PROFILE_READ_ESTIMATE_USD, needsProfileRead } from "./profileRead";
import { readPersonProfile } from "./profileRead.server";
import { agentPostingList, renderAgentMail } from "./render";
import { followUpsOnHold, readReplyReadingTroubles } from "./replies.server";
import { withReviews } from "./review";
import { postingsToMail } from "./review";
import { reviewAgentPostings } from "./review.server";
import { REQUEST_FOLLOWUP_SKIPPED_NOTE, requestContentCleared, requestFollowupAllowed } from "./request";
import { runDueJobPageRequests } from "./request.server";
import { closePendingAgentMail, deliverAgentMail, listPendingAgentMails, resendAgentMail } from "./send.server";
import { AgentSendError, IDEMPOTENCY_WINDOW_MS } from "./sendErrors";
import { channelRoomToday, mailsToSendNow, sendWindowNow, sendWindowOf, sentTimingNote, spendTickMail, tickMailBudget } from "./sendPace.server";
import { sendDay } from "./sendTiming";
import { MIN_SEARCH_USD, budgetOptions, budgetSearches, orderedSearches, searchBudgetNow } from "./budget";
import { dayBudgetPlan } from "./budget.server";
import { runDemand } from "./demand.server";
import {
  EXPLORE_SOURCE, RECENT_MEMORY_DAYS, YIELD_OUTCOMES, goalSearchesOn, historyOutcomes, readSignalLogEntry, type SignalHistoryRun,
  type SignalYield,
} from "./signals";
import { searchHnPeople } from "./signals.hn.server";
import { searchSignalPeople, type SignalSearchResult } from "./signals.server";
import { COST_CAP_EARLY_BEFORE_HOUR } from "./alerts";
import { agentAlert } from "./alerts.server";
import { lookupSettleUsd, newWorkCapUsd } from "./spend";
import { agentSpentToday, mayAgentSpend, recordAgentSpend } from "./spend.server";
import {
  BRAKE_DAYS, DRAFT_EXPIRED_REASON, DRAFT_MAX_AGE_DAYS, DRAFT_REDO_NOTE, FOLLOWUP_LATE_NOTE, KILLED_TICK_NOTE, QUEUE_DAYS,
  SEARCH_MAX_ATTEMPTS, SEND_LEASE_MS, SIGNAL_BUDGET_SHARE, SIGNAL_MAX_PEOPLE, STEP_MAX_ATTEMPTS,
  bodyWithPostings, brakeReason, draftExpired, draftedAt, followupTooLate, mayStartPerson, maySendNow, retryDelayMs,
  redoExpiredDraft, runErrorAfterTick, searchDeadline, searchStep, personStep, searchesLeft, sendCallTimeoutMs,
  stillOpenPostings, waitLabel, workPaused,
} from "./tickRules";
import { signalTuningVersion, type SignalTuning } from "./tuning";
import {
  addAgentRunCounts, agentDeliveryStats, agentDeliveryStatsByChannel, brakeAgent, brakeAgentChannel, channelSql, channelUseToday,
  closedOf, closedRoleIds, countAgentSendQueue, ensureDailyAgentRun, insertAgentPeople,
  leaseAgentRun, listAgentPeopleToHandle, listRunningEmailLookups, readAgentPerson, readAgentSenderUser, readAgentSettings,
  readSearchOutcomes, readSignalLogs, readSignalMemory, releaseAgentRun, releaseAgentSendLease, resumeAgentRuns,
  requeueAgentRun, setAgentRunConfig, takeAgentSendLease, updateAgentPerson, writeSignalLog, type AgentRun,
} from "./store.server";
import { pullDbPeople } from "./dbSource.server";
import { EVENTS_PER_MAIL, findAgentEvents } from "./events.server";
import type { AgentEmailLookup, AgentExcludeReason, AgentOfferEvent, AgentPerson, AgentPosting, AgentSettings } from "./types";

/**
 * #5 dispatcher tick (a web cron every few minutes, /api/internal/gtm-agent/dispatch). One tick leases one run
 * (turns: the run taken longest ago) and, in this order (agent/tickRules.ts has the time slices):
 *   1. notices clicks / sign-ups / opt-outs / bounces and expires mails written too long ago;
 *   2. sends: mails stuck mid-send first, then what is approved (re-checked right before), then follow-ups, while
 *      the hours, the caps and the tick's time allow; a provider or settings error stops sending for the tick and
 *      keeps everyone approved;
 *   3. looks at email lookups started earlier (any run);
 *   4. moves on a few of the run's new people (an applicant's profile → postings → a paid lookup only with a fit →
 *      mail: tickRules.ts personStep), unless the written mails already cover days of sending;
 *   5. searches one source, only when the run has nobody left to handle and the tick still has time for a search.
 * Sending comes before every paid step, so a slow search never holds back mails, follow-ups or reactions. A stop in
 * the middle loses nothing: every step is a status on the person row, every cost is in the spend log the moment it
 * is spent (agent/spend.ts), and the next tick notes a tick that never ended on the run.
 * A matched person (a fitting posting) without an address the agent may mail gets a paid email lookup
 * (agent/emailLookup.ts; Shaun 11/18: never for people without fitting postings), which runs on Exa for minutes:
 * started on one tick, looked at on the next ones (the person stays matched meanwhile, its state in email_lookup),
 * then the mail is written or the person is excluded for having no address (emailLookup.ts noEmailReason says why).
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
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

type TickResult = { ran: boolean; reason?: string; runId?: string; counts?: Record<string, number> };

/** One tick's shared facts: the run, the settings, its clock and what it adds to the run's counts and error. */
type Tick = {
  run: AgentRun;
  settings: AgentSettings;
  /**
   * The 설정 묶음 (agent/config.ts) of the settings and code this tick runs with: on every search, person found, mail
   * written and spend row of the tick. Set first thing in the tick (null only before that).
   */
  configId: string | null;
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
  person: AgentPerson, lookup: AgentEmailLookup, now: Date, poll: LookupPoll | undefined, configId: string | null,
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
  const settled = settleEmailLookup(lookup, done, now, profileHandles([person.profileUrl, person.contactUrl]));
  const updated = await updateAgentPerson(person.id, {
    emailLookup: settled.emailLookup, addCostUsd: done.costUsd,
    ...(settled.email ? { email: settled.email, emailSource: "lookup" as const } : {}),
  }, { kind: "email_lookup", by: AGENT, note: settled.note }, ["found", "matched"], { lookupRunId: lookup.runId });
  // Settled by another tick already: its spend is logged there.
  if (lookup.runId && !updated) return { person: null, costUsd: 0, found: false };
  await recordAgentSpend({
    step: "lookup", usd: lookupSettleUsd(done.costUsd, lookup.reservedUsd), runId: person.runId, personId: person.id, configId,
    isTest: person.isTest,
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
    const settled = await settleLookup(person, person.emailLookup, tick.now, polls.get(person.id), tick.configId);
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
async function beginLookup(person: AgentPerson, now: Date, configId: string | null): Promise<"started" | "retry" | "failed"> {
  const startedAt = now.toISOString();
  // A matched person (a fitting posting) keeps its status while the lookup runs; an older found one too.
  const expect: AgentPerson["status"][] = person.status === "matched" ? ["matched"] : ["found"];
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
        note: `이메일 찾기를 시작하지 못해 ${waitLabel(delay)} 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${errorText(error).slice(0, 120)}`,
      }, expect);
      return "retry";
    }
    const settled = settleEmailLookup({ runId: null, startedAt, state: "running" }, emptyLookup("start_failed", 0), now);
    await updateAgentPerson(person.id, { emailLookup: settled.emailLookup, attempts: attempt, retryAt: null },
      { kind: "email_lookup", by: AGENT, note: settled.note }, expect);
    return "failed";
  }
  // Exa runs it now (and charges for it): logged at its estimate first; the rest when it ends.
  await recordAgentSpend({ step: "lookup", usd: EMAIL_LOOKUP_ESTIMATE_USD, runId: person.runId, personId: person.id, configId, isTest: person.isTest });
  await updateAgentPerson(person.id, {
    emailLookup: { runId, startedAt, state: "running", reservedUsd: EMAIL_LOOKUP_ESTIMATE_USD }, attempts: 0, retryAt: null,
  }, { kind: "email_lookup", by: AGENT, note: person.status === "matched" ? "맞는 공고가 있어 이메일을 찾는 중" : "이메일 찾기 시작" }, expect);
  return "started";
}

/**
 * The first rule that keeps the person from being mailed, or null. `atSend`: the last look before sending, which
 * leaves out the duplicate rule (two rows of one person written at once would otherwise stop each other).
 */
async function exclusionNow(person: AgentPerson, settings: AgentSettings, atSend = false): Promise<AgentExcludeReason | null> {
  const facts = await exclusionFacts(person, settings.signals.blockedDomains);
  const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
  return exclusionReason({
    method: person.method, email: person.email, signalAt: person.signalAt, isMember: facts.member,
    maxAgeDays: settings.signals.tuning.maxAgeDays,
    isSuppressed: facts.suppressed || facts.opted_out, isInternal, isBlockedCompany: facts.blocked_company, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
    lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: !atSend && facts.active_elsewhere,
  }, new Date(), settings.quietDaysAfterEnd);
}

/**
 * What one person's step did: excluded_<reason>, no_fit, approved, matched (the mail not written: the row moved on),
 * matched_cost_cap (matched, then today's money ran out), matched_lookup (matched, the paid lookup started), moved,
 * lookup_started / lookup_retry / lookup_deferred while the person stays matched, or cost_cap (today's money is used
 * up: the person waits). For a person matched earlier: written, moved, cost_cap or a lookup outcome.
 */
type FoundStep = { outcome: string };

/** Why there is no address, as Ops reads it on the timeline (찾을 곳 없음 · 찾아도 없음 · 다른 사람 메일 · 이메일 없음). */
function noEmailNote(person: AgentPerson, reason: AgentExcludeReason, lookup: Pick<AgentEmailLookup, "runId" | "reason"> | null): string {
  // The address it has: a work address, or one its provider cannot have (personalMail.ts mailboxCanExist).
  const only = !person.email ? null : mailboxCanExist(person.email) ? "회사 메일 주소만" : "있을 수 없는 메일 주소만";
  return reason === "no_lookup_source"
    ? `${only ? `${only} 있고` : "이메일 주소가 없고"}, 이메일을 찾아볼 페이지도 없어요`
    : reason === "lookup_other_person" ? "이메일 찾기로 나온 주소가 다른 사람 것이라 쓰지 않아요"
      : lookup ? "이메일 찾기로도 보낼 수 있는 주소가 없어요"
        : only ? `${only} 있어요` : "이메일 주소가 없어요";
}

/** Where the person stands now (tickRules.ts personStep): the order of one person's steps. */
function stepFor(person: AgentPerson): ReturnType<typeof personStep> {
  const mailable = personMailable(person);
  return personStep({
    status: person.status === "matched" ? "matched" : "found", mailable,
    lookupState: person.emailLookup?.state ?? null, lookupPossible: needsEmailLookup(person),
    profileNeeded: person.status === "found" && needsProfileRead(person, mailable),
  });
}

/**
 * found → excluded | no_fit | matched → approved (and matched → approved for a person whose mail was not written yet).
 * The order (Shaun 11/18, tickRules.ts personStep): the exclusion rules, the free contact paths (an address on their
 * page or in the file, their own pages: 프로필 읽기), the posting pick with the grader's gate, then only for someone with
 * a fitting posting and still no address the agent may mail, the paid email lookup (across ticks, the person stays
 * matched), then the mail. Without an address in the end → excluded, with why (noEmailReason). Today's cap is read
 * from the spend log before every paid call, and every paid call is logged as soon as it returns.
 */
async function handleFound(found: AgentPerson, tick: Tick, ctx: { mayStartLookup: () => Promise<boolean> }): Promise<FoundStep> {
  const { settings } = tick;
  let person = found;
  if (person.status === "matched") return handleMatched(person, tick, ctx);

  const excluded = await exclusionNow(person, settings);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded }, { kind: "excluded", by: AGENT, note: excluded }, ["found"]);
    return { outcome: `excluded_${excluded}` };
  }

  // 프로필 읽기 (agent/profileRead.ts), once, before the pick: an applicant's public LinkedIn profile (a searched
  // person's own pages only with READ_SEARCHED_PAGES). What it reads goes into the profile text the pick and the lookup
  // read; an address they published on their own page saves the paid lookup. A read that fails holds nobody up.
  if (stepFor(person) === "profile") {
    if (!(await mayAgentSpend(newWorkCapUsd(settings.dailyCostUsd), PROFILE_READ_ESTIMATE_USD))) return { outcome: "cost_cap" };
    const mailable = personMailable(person);
    const read = await readPersonProfile(person);
    await recordAgentSpend({ step: "profile", usd: read.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
    const ownAddress = !mailable && read.email ? read.email : null;
    const updated = await updateAgentPerson(person.id, {
      ...(read.profileText ? { profileText: read.profileText } : {}),
      ...(ownAddress ? { email: ownAddress, emailSource: "post" as const } : {}),
      addCostUsd: read.costUsd,
    }, { kind: "profile", by: AGENT, note: read.note }, ["found"]);
    if (!updated) return { outcome: "moved" };
    person = updated;
    // An address from their own page: the rules that need one (member, opt-out, recent contact, staff) apply to it too.
    const excludedNow = ownAddress ? await exclusionNow(person, settings) : null;
    if (excludedNow) {
      await updateAgentPerson(person.id, { status: "excluded", excludeReason: excludedNow }, { kind: "excluded", by: AGENT, note: excludedNow }, ["found"]);
      return { outcome: `excluded_${excludedNow}` };
    }
  }

  // Email only: without an address the agent may mail and nothing to look one up from (or an earlier lookup that found
  // none), the pick is not worth paying for. A post-sourced address on a non-personal domain counts only on the page's
  // own domain (the page where the person was found).
  const step = stepFor(person);
  if (step === "wait") return { outcome: "lookup_waiting" };
  if (step === "no_address") {
    const lookup = person.emailLookup ?? null;
    const reason = noEmailReason(person, lookup);
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: reason }, { kind: "excluded", by: AGENT, note: noEmailNote(person, reason, lookup) }, ["found"]);
    return { outcome: `excluded_${reason}` };
  }

  if (!(await mayAgentSpend(newWorkCapUsd(settings.dailyCostUsd)))) return { outcome: "cost_cap" };
  // The offer the intent picks (agent/channels.ts offerOf, Shaun 11/23): career help without postings; postings; or
  // postings and events together (the purchased DB, event-seeking posts), where either alone is enough.
  const offer = offerOf(person);
  const picked = offer === "coaching"
    ? { postings: [] as AgentPosting[], language: person.language ?? detectLanguage([person.signalText, person.profileText, person.headline]), costUsd: 0 }
    : await pickPostings(person, tick, offer);
  if ("outcome" in picked) return picked;
  let events: AgentOfferEvent[] = [];
  let eventsCost = 0;
  if (offer === "general") {
    const found = await findAgentEvents(person, { language: picked.language, max: EVENTS_PER_MAIL, now: tick.now });
    await recordAgentSpend({ step: "events", usd: found.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
    events = found.events;
    eventsCost = found.costUsd;
    if (!picked.postings.length && !events.length) {
      await updateAgentPerson(person.id, { status: "no_fit", language: picked.language, addCostUsd: picked.costUsd + eventsCost },
        { kind: "no_fit", by: AGENT, note: (found.note ? `맞는 공고도, 다가오는 이벤트도 없어요 · ${found.note}` : "맞는 공고도, 다가오는 이벤트도 없어요").slice(0, 300) }, ["found"]);
      return { outcome: "no_fit" };
    }
  }
  const postings = picked.postings;
  const matched = await updateAgentPerson(person.id, {
    status: "matched", postings, offerEvents: events, messageKind: offer, language: picked.language,
    addCostUsd: picked.costUsd + eventsCost, attempts: 0, retryAt: null,
  }, { kind: "matched", by: AGENT, note: matchedNote(offer, postings, events) }, ["found"]);
  if (!matched) return { outcome: "moved" };
  const next = await handleMatched(matched, tick, ctx);
  // Matched, the mail to write later (today's money ran out, the row moved on) or after the paid lookup.
  if (next.outcome === "written") return { outcome: "approved" };
  if (next.outcome === "cost_cap") return { outcome: "matched_cost_cap" };
  if (next.outcome === "lookup_started" || next.outcome === "lookup_retry" || next.outcome === "lookup_deferred") return { outcome: `matched_${next.outcome}` };
  if (next.outcome.startsWith("excluded_")) return next;
  return { outcome: "matched" };
}

/** What the matched line on the timeline says: the offer and what it carries. */
function matchedNote(offer: AgentOffer, postings: readonly AgentPosting[], events: readonly AgentOfferEvent[]): string {
  const names = postings.map((posting) => `${posting.companyName} · ${posting.title}`);
  if (offer === "coaching") return "상담 제안 (공고 없이 커리어·레쥬메 도움)";
  if (offer === "posting") return names.join(" / ").slice(0, 300);
  return [`일반 제안`, ...names, ...events.map((event) => `이벤트 · ${event.title}`)].join(" / ").slice(0, 300);
}

/** A general mail carries at most this many postings (its events take the rest of the room). */
const GENERAL_MAX_FITS = 2;

/**
 * The postings a mail proposes (posting and general offers): the pick, the separate grader's gate and the mail lines.
 * A posting mail needs MIN_FITS 잘 맞음 postings (none: no_fit) and a person the pick reads as job seeking; a general
 * mail goes on with none (its events may carry it) and does not ask whether the person is looking (the DB says nothing
 * of it). Returns an outcome when the person stops here.
 */
async function pickPostings(person: AgentPerson, tick: Tick, offer: Exclude<AgentOffer, "coaching">): Promise<
  FoundStep | { postings: AgentPosting[]; language: "ko" | "en"; costUsd: number }
> {
  const general = offer === "general";
  // Never their current company, nor the company whose own applicant list they came from (applicantList.ts).
  const excludeCompanyNames = [person.currentCompany, applicantListCompany(person.source)].filter((name): name is string => Boolean(name));
  const match = await matchAgentPostings(person, { excludeCompanyNames });
  await recordAgentSpend({ step: "match", usd: match.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
  // When the first posting search was weak and the plan was revised once, the log says why.
  const revised = match.plans.find((plan) => plan.revised);
  if (revised) {
    await updateAgentPerson(person.id, {}, { kind: "note", by: AGENT, note: `공고 검색 계획을 이렇게 바꿨어요 · ${revised.reason}`.slice(0, 300) }, ["found"]);
  }
  if (match.notJobSeeking && !general) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "not_job_seeking", addCostUsd: match.costUsd },
      { kind: "excluded", by: AGENT, note: match.reason }, ["found"]);
    return { outcome: "excluded_not_job_seeking" };
  }
  if (match.postings.length < MIN_FITS) {
    if (general) return { postings: [], language: match.language, costUsd: match.costUsd };
    await updateAgentPerson(person.id, { status: "no_fit", language: match.language, addCostUsd: match.costUsd },
      { kind: "no_fit", by: AGENT, note: match.reason || "맞는 회사가 없어요" }, ["found"]);
    return { outcome: "no_fit" };
  }
  // 따로 채점 (agent/review.ts) of the pick's up to GRADE_CANDIDATES: the mail carries the first MAX_FITS it calls 잘 맞음,
  // and with none no posting goes in (Shaun 11/18: sent only when the agent is sure it fits). A failed call never lets
  // ungraded postings through (11/18 risk review): the person is tried again later like any passing error
  // (handlePeople), and fails after the last try.
  const review = await reviewAgentPostings({ person, postings: match.postings, texts: match.postingTexts });
  await recordAgentSpend({ step: "review", usd: review.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
  if (review.failed) {
    await updateAgentPerson(person.id, { addCostUsd: match.costUsd + review.costUsd }, null, ["found"]);
    throw new Error(`따로 채점을 하지 못했어요 · ${review.failed}`);
  }
  const graded = withReviews(match.postings, review.reviews);
  const { kept, dropped } = postingsToMail(graded, general ? GENERAL_MAX_FITS : MAX_FITS);
  const droppedNames = dropped.map((posting) => `${posting.companyName} ${posting.review ? `· ${posting.review.grade === "unsure" ? "애매" : "안 맞음"}` : "· 채점 없음"}`).join(", ");
  if (kept.length < MIN_FITS) {
    if (general) {
      await updateAgentPerson(person.id, {}, { kind: "note", by: AGENT, note: `따로 채점에서 '잘 맞음'인 공고가 없어 공고 없이 써요 (${droppedNames})`.slice(0, 300) }, ["found"]);
      return { postings: [], language: match.language, costUsd: match.costUsd + review.costUsd };
    }
    await updateAgentPerson(person.id, { status: "no_fit", postings: graded, language: match.language, addCostUsd: match.costUsd + review.costUsd },
      { kind: "no_fit", by: AGENT, note: `따로 채점에서 '잘 맞음'인 공고가 없어요 (${droppedNames})`.slice(0, 300) }, ["found"]);
    return { outcome: "no_fit" };
  }
  if (dropped.length) {
    await updateAgentPerson(person.id, {}, {
      kind: "note", by: AGENT, note: `따로 채점에서 '잘 맞음'이 아닌 공고는 메일에서 뺐어요 · ${dropped.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ")}`.slice(0, 300),
    }, ["found"]);
  }
  // The mail lines for the kept postings only (written after the grading, so the ones left out cost nothing).
  const framed = await match.frame(kept);
  await recordAgentSpend({ step: "match", usd: framed.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
  return { postings: framed.postings, language: match.language, costUsd: match.costUsd + review.costUsd + framed.costUsd };
}

/**
 * A matched person (a 잘 맞음 posting after the grader): the mail when there is an address the agent may mail;
 * otherwise the paid email lookup now (Shaun 11/18: only for people with fitting postings), the person staying matched
 * while it runs; when it ended (or never started) without an address, excluded with why. An address from the lookup
 * goes through the exclusion rules again before the mail.
 */
async function handleMatched(person: AgentPerson, tick: Tick, ctx: { mayStartLookup: () => Promise<boolean> }): Promise<FoundStep> {
  const step = stepFor(person);
  if (step === "write") {
    if (person.emailSource === "lookup") {
      const excluded = await exclusionNow(person, tick.settings);
      if (excluded) {
        await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded }, { kind: "excluded", by: AGENT, note: excluded }, ["matched"]);
        return { outcome: `excluded_${excluded}` };
      }
    }
    return writeMail(person, person.postings, person.language ?? "ko", tick);
  }
  if (step === "wait") return { outcome: "lookup_waiting" };
  let lookup: Pick<AgentEmailLookup, "runId" | "reason"> | null = person.emailLookup ?? null;
  if (step === "lookup") {
    // Who gets a paid lookup (emailLookup.ts lookupAllowance): applicants always; searched people with a clear signal.
    // A weak signal is not worth $0.10: excluded with why. The daily cost cap bounds the rest (mayStartLookup).
    if (lookupAllowance(person) === "skip") {
      await updateAgentPerson(person.id, { status: "excluded", excludeReason: "lookup_skipped" }, {
        kind: "excluded", by: AGENT, note: `구직 신호가 약해서(${person.signalScore ?? "점수 없음"}점, ${LOOKUP_MIN_SIGNAL_SCORE}점 미만) 돈 내고 이메일을 찾지 않았어요`,
      }, ["matched"]);
      return { outcome: "excluded_lookup_skipped" };
    }
    // Over this tick's starts or today's money: the person waits (matched) for a later tick.
    if (!(await ctx.mayStartLookup())) return { outcome: "lookup_deferred" };
    const begun = await beginLookup(person, tick.now, tick.configId);
    if (begun !== "failed") return { outcome: begun === "started" ? "lookup_started" : "lookup_retry" };
    lookup = { runId: null, reason: "start_failed" };
  }
  const reason = noEmailReason(person, lookup);
  await updateAgentPerson(person.id, { status: "excluded", excludeReason: reason }, { kind: "excluded", by: AGENT, note: noEmailNote(person, reason, lookup) }, ["matched"]);
  return { outcome: `excluded_${reason}` };
}

/** matched → approved: the mail written (today's money allowing; otherwise the person waits, matched). */
async function writeMail(person: AgentPerson, postings: AgentPosting[], language: "ko" | "en", tick: Tick): Promise<FoundStep> {
  if (!(await mayAgentSpend(newWorkCapUsd(tick.settings.dailyCostUsd)))) return { outcome: "cost_cap" };
  const draft = await composeAgentMail({ person, postings, language, senderName: tick.settings.senderName ?? "", offer: storedOffer(person.messageKind) });
  await recordAgentSpend({ step: "compose", usd: draft.costUsd, runId: tick.run.id, personId: person.id, configId: tick.configId, isTest: person.isTest });
  const approved = await updateAgentPerson(person.id, {
    // No approval step (Shaun 11/17): every mail goes out within the hours and caps; quality is checked on the log.
    status: "approved", channel: "email", draftSubject: draft.subject, draftBody: draft.body, postings: draft.postings, mailConfigId: tick.configId,
    reason: draft.reason, addCostUsd: draft.costUsd, attempts: 0, retryAt: null,
  }, { kind: "drafted", by: AGENT, note: "메일을 썼어요 · 보내는 시간에 나가요" }, ["matched"]);
  return { outcome: approved ? "written" : "moved" };
}

/**
 * Each channel's people that may still be worked on today (agent/channels.ts): its daily max less its mails today, its
 * written mails waiting and its people whose paid lookup is running; 0 for a channel that is off. A channel without a
 * daily max is left out (no limit).
 */
async function handlingRoom(tick: Tick): Promise<Partial<Record<AgentChannelKey, number>>> {
  const use = await channelUseToday(tick.now);
  const room: Partial<Record<AgentChannelKey, number>> = {};
  for (const channel of CANDIDATE_CHANNELS) {
    const used = (use.sent.get(channel) ?? 0) + (use.waiting.get(channel) ?? 0) + (use.lookingUp.get(channel) ?? 0);
    const left = channelRoomLeft(tick.settings.channels[channel], used);
    if (Number.isFinite(left)) room[channel] = left;
  }
  return room;
}

/**
 * The DB channel's people for today (agent/dbSource.server.ts), on the day's run: as many as its room (its daily max
 * less its mails today and its people in work or waiting), only while the channel is on. Never stops the tick.
 */
async function pullDb(tick: Tick): Promise<void> {
  const setting = tick.settings.channels.db;
  if (!setting.enabled) return;
  try {
    const use = await channelUseToday(tick.now);
    const room = channelRoomLeft(setting, (use.sent.get("db") ?? 0) + (use.waiting.get("db") ?? 0) + (use.inWork.get("db") ?? 0));
    if (!Number.isFinite(room) || room <= 0) return;
    const added = await pullDbPeople({ runId: tick.run.id, settings: tick.settings, configId: tick.configId, room });
    if (added) tick.bump("db_found", added);
  } catch (error) {
    console.error("[gtm-agent] db people", error);
    const line = `구매 DB에서 사람을 꺼내지 못했어요 · ${errorText(error).slice(0, 160)}`;
    tick.problems.push(line);
    await agentAlert("tick_error", line);
  }
}

/**
 * The GitHub channel's people for today (agent/githubSource.server.ts), on the day's run: as many as its room (its
 * daily max less its mails today and its people in work or waiting), only while the channel is on. Never stops the tick.
 */
async function pullGithub(tick: Tick): Promise<void> {
  const setting = tick.settings.channels.github;
  if (!setting.enabled) return;
  try {
    const use = await channelUseToday(tick.now);
    const room = channelRoomLeft(setting, (use.sent.get("github") ?? 0) + (use.waiting.get("github") ?? 0) + (use.inWork.get("github") ?? 0));
    if (!Number.isFinite(room) || room <= 0) return;
    const { pullGithubPeople } = await import("./githubSource.server");
    const added = await pullGithubPeople({ runId: tick.run.id, settings: tick.settings, configId: tick.configId, room });
    if (added) tick.bump("github_found", added);
  } catch (error) {
    console.error("[gtm-agent] github people", error);
    const line = `GitHub에서 사람을 찾지 못했어요 · ${errorText(error).slice(0, 160)}`;
    tick.problems.push(line);
    await agentAlert("tick_error", line);
  }
}

/** Job-page requests a tick takes up at most (each as long as a cold person's pick). */
const REQUESTS_PER_TICK = 2;

/**
 * Job-page requests due now (agent/request.server.ts): one whose run after the request did not finish, a hold that
 * ended, a wait for postings (REQUEST_RECHECK_DAYS) that ended. On every tick of any run, any day of the week (a
 * request is not part of a day's run: no run_id), within the tick's time for people. Never stops the tick.
 */
async function handleJobPageRequests(tick: Tick): Promise<void> {
  try {
    const counts = await runDueJobPageRequests({ limit: REQUESTS_PER_TICK, mayStart: () => mayStartPerson(tick.startedAt, Date.now()) });
    for (const [outcome, n] of Object.entries(counts)) tick.bump(`request_${outcome}`, n);
  } catch (error) {
    console.error("[gtm-agent] job-page requests", error);
    tick.problems.push(`공고 페이지 요청을 처리하지 못했어요 · ${errorText(error).slice(0, 160)}`);
  }
}

/**
 * The run's people a tick moves on (found, and matched ones still without a mail), a few within the tick's time slice
 * and today's money. A step that fails for a passing reason (a model error) is tried again after a wait, and the
 * person fails after STEP_MAX_ATTEMPTS. Returns whether the run had anyone to handle now.
 */
async function handlePeople(tick: Tick, options: { undatedPaused: boolean }): Promise<boolean> {
  // Who may be worked on now, in the queue's order (agent/channels.ts): a channel that is off waits; a new channel
  // works only its room today (handlingRoom); without a date, only while the written mails leave room (tickRules.ts
  // workPaused). The rest stay as they are for a later tick.
  const listed = await listAgentPeopleToHandle(tick.run.id, SCAN, await handlingRoom(tick));
  const people = options.undatedPaused ? listed.filter((person) => person.signalAt) : listed;
  if (!people.length) return false;
  let lookupsStarted = 0;
  let handled = 0;
  const mayStartLookup = async () => lookupsStarted < LOOKUP_STARTS && mayAgentSpend(newWorkCapUsd(tick.settings.dailyCostUsd), EMAIL_LOOKUP_ESTIMATE_USD);
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
          kind: "note", by: AGENT, note: `오류로 ${waitLabel(delay)} 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${message.slice(0, 140)}`,
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
    // The paid lookup starts only for a matched person (a fitting posting): now, or on an earlier tick.
    const lookupStep = step.outcome.replace(/^matched_/, "");
    if (lookupStep === "lookup_started") { lookupsStarted += 1; tick.bump("lookup_started"); }
    else if (lookupStep === "lookup_retry") tick.bump("lookup_retry");
    // A matched person whose lookup started, waits or is put off is looked at again on a later tick.
    if (/^lookup_(started|retry|deferred|waiting)$/.test(step.outcome)) continue;
    handled += 1;
    // A person matched on an earlier tick was counted as found and matched then.
    if (person.status === "matched") {
      if (step.outcome === "written") tick.bump("drafted");
      else if (step.outcome.startsWith("excluded")) tick.bump("excluded");
      continue;
    }
    tick.bump("found");
    if (step.outcome.startsWith("excluded")) tick.bump("excluded");
    else if (step.outcome === "no_fit") tick.bump("no_fit");
    else if (step.outcome === "matched" || step.outcome.startsWith("matched_lookup")) tick.bump("matched");
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


/**
 * The last look before a first mail goes out (a mail may have waited days): an expired draft is skipped; the rules
 * (member, opt-out, recent contact, stale signal …) exclude; postings closed since are dropped from the mail, and
 * with fewer than 2 left the person is skipped. Returns what to send, or null when the person does not get it.
 */
async function readyToSend(person: AgentPerson, tick: Tick): Promise<{
  subject: string; body: string; postings: AgentPosting[]; events: AgentOfferEvent[];
} | null> {
  if (draftExpired(draftedAt(person.events, person.updatedAt), tick.now)) {
    if (await expireDraft(person, tick)) tick.bump("expired");
    return null;
  }
  const excluded = await exclusionNow(person, tick.settings, true);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded },
      { kind: "excluded", by: AGENT, note: `보내기 전에 다시 보니 · ${excluded}` }, ["approved"]);
    tick.bump("excluded_before_send");
    return null;
  }
  // The address rule as it is now (mailRules.ts personMailable): a mail written before a rule changed does not go to an
  // address the rule now refuses (11/23: gmail.com names with "_" were added after some such mails were written).
  if (!personMailable(person)) {
    const reason = mailboxCanExist(person.email) ? "보낼 수 없는 주소라 보내지 않아요" : "있을 수 없는 메일 주소라 보내지 않아요";
    await updateAgentPerson(person.id, { status: "skipped", skipReason: reason }, { kind: "skipped", by: AGENT, note: reason }, ["approved"]);
    tick.bump("skipped_address");
    return null;
  }
  const subject = person.draftSubject ?? "";
  const body = person.draftBody ?? "";
  const offer = storedOffer(person.messageKind);
  // A coaching mail proposes no posting: nothing to have closed.
  if (offer === "coaching") return { subject, body, postings: [], events: [] };
  const general = offer === "general";
  // A general mail's events that start before the mail goes out are dropped (upcomingEvents); its postings may all
  // close as long as an event is left, and its events may all go as long as a posting is left.
  const events = general ? upcomingEvents(person.offerEvents, tick.now) : [];
  const { kept, dropped, skip: noPostingsLeft } = stillOpenPostings(person.postings, closedOf(person.postings, await closedRoleIds(person.postings)));
  const skip = general ? !kept.length && !events.length : noPostingsLeft;
  const goneEvents = general ? person.offerEvents.length - events.length : 0;
  if (!dropped.length && !goneEvents) return { subject, body, postings: person.postings, events };
  const names = [
    ...dropped.map((posting) => `${posting.companyName} · ${posting.title}`), ...(goneEvents ? [`지난 이벤트 ${goneEvents}개`] : []),
  ].join(" / ").slice(0, 200);
  // A general mail is drawn from its postings and events (render.ts); only a posting mail's stored list changes.
  const rebuilt = skip ? null : general || !dropped.length ? body : bodyWithPostings(body, agentPostingList(person.postings), agentPostingList(kept));
  if (rebuilt === null) {
    // As an expired mail (expireDraft): picked and written afresh once, skipped the second time.
    const reason = skip ? `${general ? "공고와 이벤트" : "공고"}가 모두 닫혔어요 · ${names}` : `닫힌 공고를 메일에서 뺄 수 없어요 · ${names}`;
    if (await expireDraft(person, tick, { skip: reason, redo: `${reason} · 다시 골라 메일을 써요` })) tick.bump("skipped_closed_postings");
    return null;
  }
  const updated = await updateAgentPerson(person.id, { postings: kept, draftBody: rebuilt.trim(), ...(general ? { offerEvents: events } : {}) },
    { kind: "note", by: AGENT, note: `닫힌 공고·지난 이벤트를 메일에서 뺐어요 · ${names}` }, ["approved"]);
  return updated ? { subject, body: rebuilt.trim(), postings: kept, events } : null;
}

/** The events still ahead at `now` (an event without a readable start is dropped). */
function upcomingEvents(events: readonly AgentOfferEvent[], now: Date): AgentOfferEvent[] {
  return events.filter((event) => Date.parse(event.startsAt) > now.getTime());
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
    // A job-page request's mail goes at any hour and outside the cold pace (agent/request.ts REQUEST_SEND_HOURS).
    const requested = person.method === "request";
    if (paused || (!requested && !sendWindowNow(settings, now)) || agentSenderProblem(settings) || !maySendNow(tick.startedAt, Date.now())) continue;
    try {
      const result = await resendAgentMail(mail, sendCallTimeoutMs(tick.startedAt, Date.now()));
      pending.delete(person.id);
      if (!requested) spendTickMail(await tickMailBudget(settings, now));
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
  const room = await channelRoomToday(settings, now);
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
        person, postings: ready.postings, events: ready.events, settings, sentBy, followup: false,
        timeoutMs: sendCallTimeoutMs(tick.startedAt, Date.now()),
        render: (_mailId, links) => renderAgentMail({
          language: person.language ?? "ko", subject: ready.subject, body: ready.body, name: person.name, harperUrl: links.harperUrl,
          postings: ready.postings, senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "",
          unsubscribeUrl: links.unsubscribeUrl,
          offer: storedOffer(person.messageKind), events: ready.events, eventsFirst: person.intent === "event",
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
      room.spend(channelOf(person));
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
  unsubscribed_at: string | Date | null; delivery_status: string | null; followup_mail_id: string | null;
  method: string; request: AgentPerson["request"];
};

/**
 * Clicks, sign-ups, opt-outs and bounces on sent mails become timeline lines; sign-ups, opt-outs and bounces stop the
 * follow-up, a click before it keeps it due as B or C only (followup.ts). Only rows with a reaction not recorded yet
 * are read, so however many people reacted before, new reactions are always seen.
 */
async function noticeReactions(limit: number) {
  // 가입 is the account made from the mail's link (signups.server.ts), or the mail's claim for an existing account.
  const rows = await gtmRead((sql) => sql<ReactionRow[]>`
    with gtm_signups as materialized ${gtmSignupsCte(sql)}
    select p.id, p.events, m.first_opened_at, m.unsubscribed_at, m.delivery_status, p.followup_mail_id::text as followup_mail_id,
      coalesce(m.claimed_at, s.at) as claimed_at, p.method, to_jsonb(p) -> 'request' as request
    from public.gtm_agent_people p
    join public.gtm_mails m on m.id in (p.mail_id, p.followup_mail_id)
    left join gtm_signups s on s.mail_id = m.id::text
    where p.status = 'sent' and (
      (m.unsubscribed_at is not null and not p.events @> '[{"kind": "unsubscribed"}]'::jsonb)
      or (m.delivery_status is not null and not p.events @> '[{"kind": "bounced"}]'::jsonb)
      or ((m.claimed_at is not null or s.at is not null) and not p.events @> '[{"kind": "signed_up"}]'::jsonb)
      or (m.first_opened_at is not null and not p.events @> '[{"kind": "clicked"}]'::jsonb))
    order by p.updated_at limit ${limit}::int
  `);
  // A person's first mail and follow-up are two rows: what one recorded counts for the other.
  const seenBy = new Map<string, Set<string>>();
  for (const row of rows) {
    const seen = seenBy.get(row.id) ?? new Set((row.events ?? []).map((event) => event.kind));
    seenBy.set(row.id, seen);
    if (seen.has("unsubscribed") || seen.has("bounced")) continue;
    // A job-page request's CV or profile text is cleared on an opt-out or a bounce (the form's promise: agent/request.ts).
    const cleared = row.method === "request" ? requestContentCleared(row.request, new Date()) : {};
    if (row.unsubscribed_at) {
      seen.add("unsubscribed");
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null, ...cleared }, { kind: "unsubscribed", by: AGENT, note: "연락 받지 않기를 눌렀어요" }, ["sent"]);
      continue;
    }
    if (row.delivery_status) {
      seen.add("bounced");
      if (row.delivery_status === "complained") {
        await agentAlert("complaint", "받는 사람이 메일을 스팸으로 신고했어요. 최근 7일 2건이면 에이전트가 스스로 꺼져요");
      }
      await updateAgentPerson(row.id, { status: "ended", endedAt: new Date().toISOString(), followupDueAt: null, ...cleared }, { kind: "bounced", by: AGENT, note: row.delivery_status }, ["sent"]);
      continue;
    }
    if (row.claimed_at && !seen.has("signed_up")) {
      seen.add("signed_up");
      await updateAgentPerson(row.id, { followupDueAt: null }, { kind: "signed_up", by: AGENT, note: "메일 링크로 가입했어요" }, ["sent"]);
    }
    if (row.first_opened_at && !seen.has("clicked")) {
      seen.add("clicked");
      await updateAgentPerson(row.id, followupDueAfterClick(Boolean(row.followup_mail_id)), { kind: "clicked", by: AGENT, note: "공고 페이지를 열었어요" }, ["sent"]);
    }
  }
}

/** Written mails not sent within DRAFT_MAX_AGE_DAYS are not sent (skipped, counted under 제외). */
async function expireDrafts(tick: Tick) {
  const rows = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select p.id::text as id from public.gtm_agent_people p
    where p.status = 'approved' and p.method <> 'request'
      and coalesce((
        select max((e.value ->> 'at')::timestamptz)
        from jsonb_array_elements(case when jsonb_typeof(p.events) = 'array' then p.events else '[]'::jsonb end) e(value)
        where e.value ->> 'kind' in ('drafted', 'approved')
      ), p.updated_at) < now() - make_interval(days => ${DRAFT_MAX_AGE_DAYS}::int)
      -- A mail stuck mid-send is settled first (it may have gone out).
      and not exists (select 1 from public.gtm_mails m where m.agent_person_id = p.id and m.audience = 'candidate' and m.status = 'sending')
    order by p.updated_at limit ${EXPIRE_BATCH}::int
  `);
  for (const { id } of rows) {
    const person = await readAgentPerson(id);
    if (person && await expireDraft(person, tick)) tick.bump("expired");
  }
}

/**
 * A mail written more than DRAFT_MAX_AGE_DAYS ago, or one whose postings and events all closed before it went out: the
 * first time, the person goes back to the start (postings picked and the mail written afresh on their run, the run
 * picked up again; Shaun 11/23: nobody is lost to waiting); the second time, skipped. Returns whether it changed the
 * person.
 */
async function expireDraft(
  person: AgentPerson, tick: Tick, why: { skip: string; redo: string } = { skip: DRAFT_EXPIRED_REASON, redo: DRAFT_REDO_NOTE },
): Promise<boolean> {
  if (!redoExpiredDraft(person.events)) {
    return Boolean(await updateAgentPerson(person.id, { status: "skipped", skipReason: why.skip.slice(0, 300) },
      { kind: "expired", by: AGENT, note: why.skip.slice(0, 300) }, ["approved"]));
  }
  const redone = await updateAgentPerson(person.id, {
    status: "found", postings: [], offerEvents: [], draftSubject: null, draftBody: null, reason: null, attempts: 0, retryAt: null,
  }, { kind: "expired", by: AGENT, note: why.redo.slice(0, 300) }, ["approved"]);
  if (redone?.runId) await requeueAgentRun(redone.runId);
  tick.bump("redo_expired", redone ? 1 : 0);
  return Boolean(redone);
}

/**
 * One follow-up after followupDays without a reply, sign-up or opt-out (a click keeps it due); after a second wait
 * without one, the person ends. Follow-ups go out on the same days and hours as first mails and share the tick's pace
 * with them (agent/sendTiming.ts): the ones to end first (no mail), then newest signal first. Fixed copy A / B / C with
 * up to 2 new postings from the first mail's matcher and grader (followup.ts); postings closed since the first mail are
 * not named, nothing to say → no follow-up. A thread a human answered gets none. A provider or settings error stops
 * sending for the tick; the follow-up stays due.
 */
async function followUps(
  tick: Tick, sentBy: string, limit: number, pending: ReadonlySet<string>,
  isHumanOwned: (rootMailId: string) => Promise<boolean> = followupThreadHumanOwned,
): Promise<SendOutcome> {
  // While a team mailbox's replies are not being read, nothing is sent or ended here (replies.server.ts).
  if (await followUpsOnHold()) return { sent: 0, paused: null };
  const { settings, now } = tick;
  // A channel that is off or at its daily max is left out here, so its follow-ups never hold the batch from the others.
  const startRoom = await channelRoomToday(settings, now);
  const full = AGENT_CHANNELS.filter((channel) => startRoom.left(channel) <= 0);
  const due = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select p.id from public.gtm_agent_people p where p.status = 'sent' and p.followup_due_at <= now()
      and ${channelSql(sql, "p")} <> all(${full}::text[])
    order by (p.events @> '[{"kind":"followup_sent"}]'::jsonb) desc, p.signal_at desc nulls last, p.followup_due_at
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
    if (followupTooLate(person.followupDueAt, now)) {
      await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
        { kind: "ended", by: AGENT, note: FOLLOWUP_LATE_NOTE }, ["sent"]);
      continue;
    }
    // A job-page request gets its follow-up only after a click on the first mail (request.ts REQUEST_FOLLOWUP_RULE).
    if (person.method === "request" && !requestFollowupAllowed({ clicked: openedLink(person.events), replied: Boolean(person.repliedAt) })) {
      await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
        { kind: "ended", by: AGENT, note: REQUEST_FOLLOWUP_SKIPPED_NOTE }, ["sent"]);
      continue;
    }
    if (person.channel === "email") {
      if (!sendWindowNow(settings, now) || agentSenderProblem(settings)) continue;
      if (!maySendNow(tick.startedAt, Date.now())) { tick.bump("stopped_send_time"); break; }
      const budget = await tickMailBudget(settings, now);
      if (budget.left <= 0 || budget.quota <= 0) continue;
      // A channel that is off or at its daily max (its follow-ups count in it) waits; the follow-up stays due.
      const room = await channelRoomToday(settings, now);
      const channel = channelOf(person);
      if (room.left(channel) <= 0) continue;
      // A thread a human answered from Ashley's Gmail gets no automatic mail (Slack notes only).
      let humanOwned: boolean;
      try {
        humanOwned = Boolean(person.mailId) && await isHumanOwned(person.mailId as string);
      } catch (error) {
        console.warn("[gtm-agent] follow-up thread owner not read", id, errorText(error));
        continue;
      }
      if (humanOwned) {
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
          { kind: "ended", by: AGENT, note: FOLLOWUP_HUMAN_NOTE }, ["sent"]);
        continue;
      }
      // Joined Harper some other way since the first mail (the follow-up asks them to sign up), or on the opt-out list.
      let facts: Awaited<ReturnType<typeof exclusionFacts>>;
      try {
        facts = await exclusionFacts(person, settings.signals.blockedDomains);
      } catch (error) {
        console.warn("[gtm-agent] follow-up member check not read", id, errorText(error));
        continue;
      }
      if (facts.member || facts.suppressed || facts.opted_out || facts.blocked_company) {
        const note = facts.member ? FOLLOWUP_MEMBER_NOTE : facts.blocked_company ? FOLLOWUP_BLOCKED_NOTE : FOLLOWUP_SUPPRESSED_NOTE;
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null },
          { kind: "ended", by: AGENT, note }, ["sent"]);
        continue;
      }
      if (!(await mayAgentSpend(settings.dailyCostUsd))) { tick.bump("stopped_cost_cap"); break; }
      // The posting search takes as long as a first mail's pick: started only while the tick has time for one.
      if (!mayStartPerson(tick.startedAt, Date.now())) { tick.bump("stopped_time"); break; }
      // Turned off since the tick started: nothing more goes out.
      if (!(await readAgentSettings()).enabled) break;
      const offer = storedOffer(person.messageKind);
      const { kept: open, dropped: closed } = stillOpenPostings(person.postings, closedOf(person.postings, await closedRoleIds(person.postings)));
      let found: FollowupFound | null = null;
      let freshEvents: AgentOfferEvent[] = [];
      let failure = "";
      try {
        // A coaching mail's follow-up offers the same help again: nothing to search (D).
        found = offer === "coaching"
          ? { postings: [], costUsd: 0, failed: null, note: "" }
          : await searchFollowupPostings(person, { runId: tick.run.id, configId: tick.configId });
        failure = found.failed ?? "";
        if (offer === "general" && !failure) {
          const events = await searchFollowupEvents(person, { runId: tick.run.id, configId: tick.configId, now });
          freshEvents = events.events;
          found = { ...found, costUsd: found.costUsd + events.costUsd };
        }
      } catch (error) {
        console.error("[gtm-agent] follow-up postings not found", id, error);
        failure = errorText(error) || "unknown error";
      }
      if (!found || failure) {
        // One follow-up whose postings cannot be looked for never holds back the rest of the tick (11/18 risk review).
        // Tried again later; after the last try the person ends.
        const attempt = (person.attempts ?? 0) + 1;
        const delay = retryDelayMs(attempt);
        const addCostUsd = found?.costUsd ?? 0;
        if (delay !== null) {
          await updateAgentPerson(id, { attempts: attempt, followupDueAt: new Date(now.getTime() + delay).toISOString(), addCostUsd }, {
            kind: "note", by: AGENT, note: `후속 메일의 새 공고를 찾지 못해 ${waitLabel(delay)} 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${failure.slice(0, 120)}`,
          }, ["sent"]);
        } else {
          await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, attempts: attempt, addCostUsd },
            { kind: "failed", by: AGENT, note: `후속 메일의 새 공고를 찾지 못해 끝냈어요 · ${failure.slice(0, 160)}` }, ["sent"]);
        }
        tick.bump("followup_retry");
        continue;
      }
      const costUsd = found.costUsd;
      // The search takes about as long as a first mail's pick: a reply, sign-up or opt-out meanwhile wins (its cost is on
      // the spend log already).
      const still = await readAgentPerson(id);
      if (!still || still.status !== "sent" || !still.followupDueAt || still.followupMailId) continue;
      const clicked = openedLink(still.events);
      const plan = offer === "coaching" ? planCoachingFollowup({ clicked })
        : offer === "general"
          ? planGeneralFollowup({ open, closed, fresh: found.postings, clicked, upcoming: upcomingEvents(still.offerEvents, now), freshEvents })
          : planFollowup({ open, closed, fresh: found.postings, clicked });
      if (!plan.send) {
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: costUsd },
          { kind: "ended", by: AGENT, note: found.note ? `${plan.note} · ${found.note}`.slice(0, 300) : plan.note }, ["sent"]);
        continue;
      }
      const language = person.language ?? "ko";
      const subject = followupSubject(person.draftSubject, language, person.name, plan.postings.length);
      let result: Awaited<ReturnType<typeof deliverAgentMail>>;
      try {
        result = await deliverAgentMail({
          person, postings: plan.postings, events: plan.events ?? [], settings, sentBy, followup: true,
          timeoutMs: sendCallTimeoutMs(tick.startedAt, Date.now()),
          render: (_mailId, links) => renderAgentFollowup({
            plan, language, firstSubject: person.draftSubject, name: person.name, harperUrl: links.harperUrl,
            senderName: settings.senderName ?? "", unsubscribeUrl: links.unsubscribeUrl,
          }),
        });
      } catch (error) {
        if (error instanceof AgentSendError && error.kind !== "recipient") {
          // Not the person's: the follow-up stays due (a stuck one is settled on the next tick).
          await updateAgentPerson(id, { addCostUsd: costUsd }, null, ["sent"]);
          return { sent: 0, paused: error.message };
        }
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: costUsd },
          { kind: "failed", by: AGENT, note: `후속 메일을 보내지 못했어요 · ${errorText(error).slice(0, 160)}` }, ["sent"]);
        continue;
      }
      if (result.status === "sent") {
        spendTickMail(budget);
        room.spend(channel);
        await updateAgentPerson(id, {
          followupMailId: result.mailId, followupDueAt: new Date(now.getTime() + settings.followupDays * DAY_MS).toISOString(), addCostUsd: costUsd,
          attempts: 0,
        }, { kind: "followup_sent", by: AGENT, note: followupSentNote(plan, subject) }, ["sent"]);
      } else if (!result.reason.includes("오늘 보낼 수 있는")) {
        await updateAgentPerson(id, { status: "ended", endedAt: now.toISOString(), followupDueAt: null, addCostUsd: costUsd },
          { kind: "ended", by: AGENT, note: `후속 메일을 보내지 않았어요 · ${result.reason}` }, ["sent"]);
      } else {
        await updateAgentPerson(id, { addCostUsd: costUsd }, null, ["sent"]);
      }
    }
  }
  return { sent: 0, paused: null };
}

/**
 * The sending part of a tick: stuck mails, first mails, follow-ups. A provider or settings error stops it and is
 * shown on the run (kept until a tick without problems).
 */
/** The non-customer company mails of the tick (companyMail.server.ts); a failure there never stops the candidate mails. */
async function companyMails(tick: Tick, sentBy: string): Promise<string | null> {
  try {
    const company = await runCompanyMails({
      store: conversationStore, now: tick.now, settings: tick.settings, sentBy, startedAt: tick.startedAt,
      runId: tick.run.id, configId: tick.configId,
    });
    tick.problems.push(...company.problems);
    if (company.sent) tick.bump("company_mail_sent", company.sent);
    return company.paused;
  } catch (error) {
    console.error("[gtm-agent] company mails", error);
    tick.problems.push(`회사 메일을 보내지 못했어요 · ${errorText(error).slice(0, 160)}`);
    return null;
  }
}

async function sendMails(tick: Tick, sentBy: string): Promise<void> {
  const stuck = await settlePendingMails(tick);
  let sent = stuck.sent;
  let paused = stuck.paused;
  // Follow-ups first (Shaun 11/23): one more than FOLLOWUP_MAX_LATE_DAYS late is never sent, a first mail only waits.
  // The 24-hour rule's first mails still go over the pace after them (sendTiming.ts planSends).
  if (!paused) paused = (await followUps(tick, sentBy, BATCH, stuck.pending)).paused;
  if (!paused) {
    const first = await sendApproved(tick, sentBy, BATCH, stuck.pending);
    sent += first.sent;
    paused = first.paused;
  }
  // Company mails last (same daily cap and send lease): one can search members and write lines, so the candidate
  // mails get the tick's time first; a paused provider pauses them too.
  if (!paused) paused = await companyMails(tick, sentBy);
  // The sent count is the number of first mails this tick (the run's "보냄" adds them up).
  if (sent) tick.bump("sent", sent);
  if (paused) {
    tick.bump("send_paused");
    tick.problems.push(`메일 보내기를 잠시 멈췄어요 (다음 실행에서 다시 해요) · ${paused}`);
    await agentAlert("send_paused", paused);
  }
}

/**
 * The automatic brake (agent/tickRules.ts brakeReason): when the last days' bounces or spam complaints are too many,
 * the agent is turned off with why (shown on /ops #5 as the run's error). Returns whether it is off now.
 */
async function brakeIfNeeded(tick: Tick): Promise<boolean> {
  // The same rule on each channel's own mails first (Shaun 11/23): only that channel turns off; the rest goes on.
  try {
    // Company sourcing's mails (company_post) are company mails: counted by the company mail step.
    const byChannel = { ...await agentDeliveryStatsByChannel(BRAKE_DAYS), ...await companySourcingDeliveryStats(BRAKE_DAYS) };
    for (const [channel, stats] of Object.entries(byChannel) as Array<[AgentChannelKey, NonNullable<(typeof byChannel)[AgentChannelKey]>]>) {
      if (!tick.settings.channels[channel]?.enabled) continue;
      const why = brakeReason(stats, CHANNEL_LABELS[channel]);
      if (!why || !(await brakeAgentChannel(channel, why))) continue;
      tick.settings.channels[channel] = { ...tick.settings.channels[channel], enabled: false };
      console.warn("[gtm-agent] channel brake", channel, why);
      await agentAlert("channel_brake", why, { key: channel, mentionUserId: tick.settings.handoffSlackUserId });
      tick.bump(`braked_${channel}`);
    }
  } catch (error) {
    // The whole agent's brake below still runs; a brake that cannot be checked is said in Slack, not only on the run.
    console.error("[gtm-agent] channel brake", error);
    const line = `채널별 멈춤을 확인하지 못했어요 · ${errorText(error).slice(0, 160)}`;
    tick.problems.push(line);
    await agentAlert("tick_error", line);
  }
  const reason = brakeReason(await agentDeliveryStats(BRAKE_DAYS));
  if (!reason) return false;
  await brakeAgent(reason);
  console.warn("[gtm-agent] brake", reason);
  await agentAlert("brake", reason, { mentionUserId: tick.settings.handoffSlackUserId });
  tick.problems.push(reason);
  tick.bump("braked");
  return true;
}

/**
 * Sending under the one send lease (agent/tickRules.ts SEND_LEASE_MS): two ticks on different runs read the same
 * queue, so only one sends at a time; the other skips sending this tick.
 */
async function sendMailsAlone(tick: Tick, sentBy: string): Promise<void> {
  const lease = await takeAgentSendLease(SEND_LEASE_MS);
  if (!lease) { tick.bump("send_lease_busy"); return; }
  try {
    await sendMails(tick, sentBy);
  } finally {
    await releaseAgentSendLease(lease).catch((error) => console.error("[gtm-agent] send lease not released", error));
  }
}

/** Earlier runs of a source whose search logs its first plans read. */
const SIGNAL_HISTORY_RUNS = 5;

/**
 * What earlier runs of a source learned (newest first, marked when the tuning was the same), with what became of the
 * people each run's queries found (a fitting posting, none, mailed); none when it cannot be read.
 */
async function signalHistory(source: string, runId: string, tuning: SignalTuning): Promise<SignalHistoryRun[]> {
  try {
    const version = signalTuningVersion(source, tuning);
    const logs = await readSignalLogs(source, runId, SIGNAL_HISTORY_RUNS);
    const outcomes = await readSearchOutcomes(logs.map((log) => log.runId)).catch((error) => {
      // Without them the history still has the yields (kept people), as before.
      console.warn("[gtm-agent] signal outcomes", source, errorText(error));
      return [];
    });
    return logs.flatMap((log) => {
      const entry = readSignalLogEntry(log.entry);
      if (!entry) return [];
      const fate = historyOutcomes(source, entry, outcomes.filter((row) => row.runId === log.runId), log.sources);
      return [{ ...entry, sameTuning: entry.tuningVersion === version, outcomes: fate.outcomes, total: fate.total }];
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
    rejected: "judge_rejected", belowScore: "judge_below_score", lowMatch: "judge_low_match", notIdentifiable: "judge_no_key",
    known: "judge_known", unmatched: "judge_unmatched",
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
 * The day's searches (agent/budget.ts), each while its channel is on: the candidate searches and the open web while
 * 구직 글·프로필 is (their people are its), LinkedIn's layoff news while 감원 is too, the career-help, event and
 * hiring-post searches while theirs are (signals.ts goalSearchesOn).
 */
function searchOptionsOf(settings: AgentSettings) {
  const { sources, tuning } = settings.signals;
  const job = settings.channels.job.enabled;
  return budgetOptions({
    turnedOn: job ? Object.keys(sources).filter((id) => sources[id].enabled) : [],
    layoffSearch: tuning.layoffSearch && settings.channels.layoff.enabled,
    goalSearches: goalSearchesOn(settings.channels),
  }).filter((option) => job || option.search !== EXPLORE_SOURCE);
}

/**
 * A day's run (and "지금 실행") searches each turned-on source once, then the open web (Shaun 11/17: default domains,
 * not limited to them). How much each search gets is the day's split (budget.ts, Shaun 11/18): the agent splits the
 * day's search budget over the places and LinkedIn's layoff method from what earlier days' money brought, starting
 * from a dice split that keeps testing places with little data; made at the run's first search and kept on the run.
 * A search the split gives nothing is skipped (skipped_budget_<id>); money a finished search did not use goes to the
 * later ones, so the searches that used least of their money before run first (searchOrder). One search per tick, at most until `deadlineAt` (what it kept by then is
 * kept); the people found join this run and are handled like uploaded ones. A search is marked tried before it
 * starts; one the time limit cuts off is not marked done (search_cut_off_<id>), so it is tried once more and then
 * given up (SEARCH_MAX_ATTEMPTS); one that fails is tried again too. A day's run whose day has passed searches no
 * more. Each person keeps where they were found (the page's source or domain), how, the page text the judge read, and
 * the settings and tuning versions; new domains with kept people are kept on the run's counts (new_domain:<domain>)
 * for "기본 목록에 넣기".
 *
 * Only new people (11/17 search review): the people found and the pages judged in the last RECENT_MEMORY_DAYS go into
 * the search, which skips those pages before the judge and those people before keeping them (anyone known from before
 * that is still left out here). The search aims at the demand (demand.ts: what Harper can propose today, read once
 * per run and kept on it): the plans split their queries over its role families and the judge scores each seeker's
 * matchability against it.
 */
async function findSignalPeople(tick: Tick, deadlineAt: number): Promise<void> {
  const { run, settings } = tick;
  // Uploads bring their own people.
  if (run.kind === "import") return;
  if (run.kind === "daily" && run.runDate !== kstClock(tick.now).day) return;
  const { sources, tuning, blockedDomains } = settings.signals;
  const spent = await agentSpentToday();
  // Searches stop below the cap too: what is kept is for follow-ups (spend.ts FOLLOWUP_RESERVE_USD).
  const cap = newWorkCapUsd(settings.dailyCostUsd);
  if (spent >= cap) { tick.bump("stopped_cost_cap"); return; }
  const left = Math.max(0, cap - spent);
  const options = searchOptionsOf(settings);
  const searches = budgetSearches(options);
  if (searches.every((search) => searchStep(run.counts, search) === "done")) return;
  const plan = await dayBudgetPlan({ run, options, leftUsd: left, day: kstClock(tick.now).day, configId: tick.configId, deadlineAt, now: tick.now });
  const id = orderedSearches(searches, plan).find((search) => searchStep(run.counts, search) !== "done");
  if (!id) return;
  if (searchStep(run.counts, id) === "give_up") {
    // Tried SEARCH_MAX_ATTEMPTS times without finishing (killed at the time limit, or failed): the run goes on.
    tick.bump(`searched_${id}`);
    tick.bump(`search_gave_up_${id}`);
    tick.problems.push(`사람 찾기(${id})를 ${SEARCH_MAX_ATTEMPTS}번 끝내지 못해 이번 실행에선 건너뛰어요`);
    await agentAlert("search_gave_up", `${id} · ${SEARCH_MAX_ATTEMPTS}번 시도`);
    return;
  }
  const share = searchBudgetNow({
    plan, options, search: id,
    spent: Object.fromEntries(searches.map((search) => [search, Number(run.counts[`signal_cost_${search}`] ?? 0)])),
    done: new Set(searches.filter((search) => searchStep(run.counts, search) === "done")),
  });
  // Never more than SIGNAL_BUDGET_SHARE of what is left today (the money may have gone to people since the split).
  const budget = Math.min(share.usd, Math.floor(left * SIGNAL_BUDGET_SHARE * 100) / 100);
  const layoffBudget = share.usd > 0 ? Math.floor(share.layoffUsd * (budget / share.usd) * 100) / 100 : 0;
  if (budget < MIN_SEARCH_USD) {
    tick.bump(`searched_${id}`);
    tick.bump(`skipped_budget_${id}`);
    return;
  }
  // Marked tried before it starts (written now, not when the tick ends): a search killed with the tick counts.
  await addAgentRunCounts(run.id, { [`search_attempts_${id}`]: 1 });
  const spend = (usd: number) => recordAgentSpend({ step: "search", usd, runId: run.id, source: id, configId: tick.configId, isTest: run.isTest });
  // What earlier runs found and judged (a search without it still runs: it may only judge and find people again).
  const memory = await readSignalMemory(RECENT_MEMORY_DAYS).catch((error) => {
    console.warn("[gtm-agent] signal memory", id, errorText(error));
    return { keys: new Set<string>(), urls: new Set<string>() };
  });
  const demand = await runDemand(run.id, kstClock(tick.now).day);
  // Hacker News through its API; every other source through the web search.
  const search = id === "hn" ? searchHnPeople : searchSignalPeople;
  const result = await search({
    source: id, budgetUsd: budget, layoffBudgetUsd: layoffBudget, maxPeople: SIGNAL_MAX_PEOPLE, known: memory.keys, knownUrls: memory.urls,
    blockedDomains, tuning,
    history: await signalHistory(id, run.id, tuning), demand, deadlineAt, onSpend: spend,
    // Career-help and event posts are kept while their channel is on, commenters while 댓글 is (agent/channels.ts).
    intents: searchedIntents(settings.channels), commenters: settings.channels.comment.enabled,
  });
  // What the search did not log as it went (a step cut off at the deadline, at its estimate).
  await spend(result.costUsd - result.recordedUsd);
  // What this search learned, for the next runs' first plans (a lost log never stops the run).
  await writeSignalLog(run.id, id, result.log, tick.configId).catch((error) => {
    console.warn("[gtm-agent] signal log", id, error instanceof Error ? error.message : String(error));
  });
  const keys = result.people.map((person) => person.personKey);
  const known = keys.length ? new Set((await gtmRead((sql) => sql<Array<{ person_key: string }>>`
    select distinct person_key from public.gtm_agent_people where person_key = any(${keys}::text[])
  `)).map((row) => row.person_key)) : new Set<string>();
  const fresh = result.people.filter((person) => !known.has(person.personKey));
  await insertAgentPeople(fresh.map((person) => ({
    runId: run.id, source: person.source, method: person.method, settingsVersion: settings.version,
    tuningVersion: person.tuningVersion, configId: tick.configId, contactUrl: person.contactUrl, personKey: person.personKey,
    // A hiring post keeps its opening's title where the company step reads it (search_group); others their query family.
    signalScore: Math.min(100, Math.max(0, Math.round(person.score))) || 0, matchScore: person.matchScore, searchGroup: person.opening ?? person.group,
    searchQuery: person.query,
    email: person.email, emailSource: person.email ? "post" : null,
    isTest: run.isTest, name: person.name, headline: person.headline, location: person.location,
    // The judge's summary of them, then the page it read (profile.ts, at most 3,000 characters): the picker, the mail
    // and the email lookup read a clean summary first and the details after.
    currentCompany: person.currentCompany, profileUrl: person.profileUrl, profileText: searchedProfileText(person.background, person.pageText),
    signalText: person.signalText,
    signalUrl: person.signalUrl, signalAt: person.signalAt,
    // Why they wrote, author or commenter; a giver (hiring posts included) is inserted already excluded, never mailed.
    intent: person.intent, foundAs: person.foundAs, giverKind: person.giverKind,
    // By kind (signals.ts signalFoundNote): 구직 글 / 상담 글 / 이벤트 글 / 댓글 · … / 돕는 쪽 · … / 회사 소싱 · 채용 글.
    foundNote: person.foundNote,
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
    // Found: the new people to mail (givers are recorded too, already excluded, and counted in the yields).
    [`signal_found_${id}`]: fresh.filter((person) => !person.giverKind).length,
    [`signal_known_${id}`]: result.knownPeople + result.people.length - fresh.length,
    [`searches_${id}`]: result.yields.length,
    // The search's spend is the run's, not one person's: kept per source so /ops #5 can show it by source.
    [`signal_cost_${id}`]: result.costUsd,
    // Of it, the layoff method's (its own option in the day's split).
    [`layoff_cost_${id}`]: result.layoffCostUsd,
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
    run, settings, configId: null, now, startedAt, counts,
    // The last tick on this run never ended: the note stays on the run until a later tick without problems.
    problems: expiredLease ? [KILLED_TICK_NOTE] : [],
    bump: (key, by = 1) => { counts[key] = Math.round(((counts[key] ?? 0) + by) * 1_000_000) / 1_000_000; },
  };
  try {
    // What this tick runs with, once (settings saved during the tick count from the next one).
    tick.configId = (await ensureAgentConfig(settings)).id;
    await setAgentRunConfig(run.id, tick.configId, agentCodeVersion(process.env));
    const sentBy = await readAgentSenderUser();
    await noticeReactions(REACTIONS);
    // Too many bounces or spam complaints lately: the agent turns itself off, and this tick does nothing more.
    if (await brakeIfNeeded(tick)) {
      const { error } = runErrorAfterTick(tick.problems);
      await releaseAgentRun({ id: run.id, leaseToken, status: "queued", addCounts: counts, error, clearError: false });
      return { ran: true, runId: run.id, counts };
    }
    await expireDrafts(tick);
    if (sentBy) await sendMailsAlone(tick, sentBy);
    await settleLookups(tick);
    await handleJobPageRequests(tick);
    // New people cost money (lookup, postings, writing): not while the written mails already cover days of sending,
    // and not on a day mails do not go out (Shaun 11/21: signals stay up to 30 days, so the next sending day finds the
    // same people, and no mail is written days before it can go). A manual run ("지금 실행") still runs.
    const restDay = run.kind === "daily" && !sendDay(now, sendWindowOf(settings));
    if (restDay) tick.bump("rest_day");
    // The written mails and the follow-ups due within QUEUE_DAYS against the cap (Shaun 11/23): over it, people
    // without a date wait; dated people (they go out first) wait only when they alone fill it (tickRules.ts workPaused).
    const paused = workPaused(await countAgentSendQueue(QUEUE_DAYS), settings.dailyMailCap);
    const queueFull = !restDay && (run.kind === "daily" ? paused.dated : paused.undated);
    if (queueFull) tick.bump("throttled_queue");
    if (!restDay && !paused.undated && run.kind === "daily") await pullDb(tick);
    if (!restDay && !paused.dated && run.kind === "daily") await pullGithub(tick);
    const busy = restDay || queueFull || await handlePeople(tick, { undatedPaused: paused.undated });
    if (!busy) {
      const deadline = searchDeadline(startedAt, Date.now());
      if (deadline) await findSignalPeople(tick, deadline);
    }
    await alertAfterTick(tick, expiredLease);
    const { error, clear } = runErrorAfterTick(tick.problems);
    await releaseAgentRun({ id: run.id, leaseToken, status: await nextStatus(tick, today), addCounts: counts, error, clearError: clear });
    return { ran: true, runId: run.id, counts };
  } catch (error) {
    console.error("[gtm-agent] tick failed", run.id, error);
    const { error: line } = runErrorAfterTick([...tick.problems, errorText(error)]);
    tick.bump("errors");
    await releaseAgentRun({ id: run.id, leaseToken, status: "queued", addCounts: counts, error: line });
    await agentAlert("tick_error", errorText(error));
    return { ran: true, runId: run.id, counts };
  }
}

/**
 * Alerts a tick that went through can raise (agent/alerts.ts): the last tick on the run never ended, today's money ran
 * out before COST_CAP_EARLY_BEFORE_HOUR (Korea time), a team mailbox's replies are not being read. Never throws.
 */
async function alertAfterTick(tick: Tick, expiredLease: boolean): Promise<void> {
  if (expiredLease) await agentAlert("tick_killed", KILLED_TICK_NOTE);
  if (tick.counts.stopped_cost_cap && kstClock(tick.now).hour < COST_CAP_EARLY_BEFORE_HOUR) {
    const spent = await agentSpentToday().catch(() => null);
    await agentAlert("cost_cap_early", `오늘 ${spent === null ? "?" : `$${spent.toFixed(2)}`} 사용 · 한도 $${tick.settings.dailyCostUsd}`);
  }
  const troubles = await readReplyReadingTroubles(tick.now).catch(() => []);
  if (troubles.length) {
    await agentAlert("reply_reading", troubles.map((trouble) => `${trouble.mailbox ?? ""} ${trouble.problem}`.trim()).join(" · "));
  }
}

/**
 * A day's run stays open through its day (it carries sending and follow-ups); an import run ends when its people are
 * handled (found, or matched with the mail still to write). A manual run ("지금 실행") searches every turned-on source
 * and the open web like a day's run: it ends when its people are handled and nothing is left to search (or today's
 * money ran out on this tick).
 */
async function nextStatus(tick: Tick, today: string): Promise<"queued" | "done"> {
  const { run, settings } = tick;
  const [left] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where run_id = ${run.id}::uuid and status in ('found', 'matched')
  `);
  if (Number(left?.n ?? 0) > 0) return "queued";
  if (run.kind === "daily") return run.runDate === today ? "queued" : "done";
  if (run.kind === "manual" && !tick.counts.stopped_cost_cap) {
    const toSearch = budgetSearches(searchOptionsOf(settings));
    if (searchesLeft(sumCounts(run.counts, tick.counts), toSearch)) return "queued";
  }
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
