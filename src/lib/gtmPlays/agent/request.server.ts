import "server-only";

import { randomUUID } from "node:crypto";
import { createCompanyRunUsage } from "@/lib/llm/runUsage";
import { withLlmUsageContext } from "@/lib/llm/usageContext";
import { GtmWritesOffError, gtmWritesEnabled } from "../constants";
import { gtmRead, gtmWrite } from "../db.server";
import { gtmStructuredCall } from "../llm.server";
import { channelRoomLeft } from "./channels";
import { composeAgentMail } from "./compose.server";
import { mxChecker } from "./dbSource.server";
import { ensureAgentConfig } from "./config.server";
import { exclusionFacts, linkedinHandles } from "./exclusion.server";
import { agentSenderProblem, personMailable } from "./mailRules";
import { MAX_FITS } from "./match";
import { matchAgentPostings } from "./match.server";
import { mailDomain, mailboxCanExist } from "../personalMail";
import { cleanEmail, personKeys } from "./people";
import { needsProfileRead, PROFILE_READ_ESTIMATE_USD } from "./profileRead";
import { readPersonProfile } from "./profileRead.server";
import { agentPostingList, agentSubject, renderAgentMail } from "./render";
import {
  REQUEST_FACTS_SCHEMA, REQUEST_HOLD_MS, REQUEST_RECHECK_DAYS, cleanRequestFacts, nextKstDay,
  requestAfterCheck, requestContentCleared, requestExclusionReason, requestFactsPrompt, requestMailFacts, requestRecheckAt, requestSendAt,
  type NewRequestRow,
} from "./request";
import { acceptRequestQuery, claimDueRequestQuery, type AcceptedRequest } from "./requestSql";
import { requestPostingsToMail, withReviews } from "./review";
import { reviewAgentPostings } from "./review.server";
import { deliverAgentMail } from "./send.server";
import { AgentSendError } from "./sendErrors";
import { mayAgentSpend, recordAgentSpend } from "./spend.server";
import {
  channelUseToday, closedOf, closedRoleIds, readAgentPerson, readAgentSenderUser, readAgentSettings, updateAgentPerson,
} from "./store.server";
import { STEP_MAX_ATTEMPTS, retryDelayMs, waitLabel } from "./tickRules";
import type { AgentExcludeReason, AgentJobPageRequest, AgentPerson, AgentSettings } from "./types";

/**
 * "비슷한 공고 추천받기" on Harper's job page, the I/O (the rules: agent/request.ts). A request is one gtm_agent_people
 * row (method 'request', no run): the route writes it (acceptJobPageRequest) and runs its steps right after the answer
 * (runJobPageRequest in after()); the tick (run.server.ts) takes up a request whose run did not finish, that was held
 * (the agent or the channel off, today's money or the channel's day used up) or that waits REQUEST_RECHECK_DAYS for
 * postings to mail (runDueJobPageRequests).
 *
 * gtm_agent_people.retry_at is the request's lease and its next look: written REQUEST_LEASE_MS ahead while one run
 * works on it (the route's insert, the tick's claim), then null (done), or when to look again.
 */

export type { AcceptedRequest };

const AGENT = "agent";
const DAY_MS = 86_400_000;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** The facts step never holds a request up for long: past this, the mail goes without them. */
const FACTS_TIMEOUT_MS = 45_000;
/** Postings mailed to the address before (any #4 / #5 mail) are never proposed again, within this window. */
const SENT_ROLES_DAYS = 180;
/** At most this many passes through the steps in one run (a mail whose postings all closed goes back to the pick once). */
const MAX_PASSES = 4;

// ---------------------------------------------------------------------------------------------------------------
// The form's checks and the row (the gate the page reads: agent/requestGate.server.ts)

/**
 * Whether the address's domain can take mail: false only when its MX lookup says none, looked up together with a
 * domain that always resolves (dbSource.ts settleMxVerdicts reads "none" only when another domain resolved in the same
 * call, so a resolver that is down never refuses an address).
 */
export async function requestMailDomainOk(email: string): Promise<boolean> {
  const domain = mailDomain(email);
  if (!domain) return false;
  try {
    const verdicts = await mxChecker()([domain, MX_CONTROL_DOMAIN]);
    return verdicts.get(domain) !== "none";
  } catch {
    return true;
  }
}
/** A domain that always takes mail, looked up beside the address's own (see requestMailDomainOk). */
const MX_CONTROL_DOMAIN = "gmail.com";

/**
 * A mail's opt-out link was used (/api/email/gtm-unsubscribe): if the mail answered a job-page request, what they gave
 * (CV or profile text) goes, whatever the row's state by now (sent, ended after the follow-up window, replied). The
 * form promised it: "내용은 메일에서 수신 거부하면 지워요". Bounces and stops found by the tick or Ashley clear it too.
 */
export async function clearJobPageRequestForMail(mailId: string): Promise<void> {
  const rows = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select p.id::text as id from public.gtm_agent_people p
    where p.method = 'request' and ${mailId}::uuid in (p.mail_id, p.followup_mail_id)
  `);
  for (const row of rows) {
    const person = await readAgentPerson(row.id);
    if (!person || person.request?.clearedAt) continue;
    await updateAgentPerson(person.id, requestContentCleared(person.request, new Date()),
      { kind: "note", by: AGENT, note: "메일에서 수신 거부해서 남겨 주신 이력서·프로필 내용을 지웠어요" });
  }
}

/**
 * Writes the request's row, then counts it against the rate limits (agent/request.ts REQUEST_RATE_LIMITS) in the same
 * transaction, under a lock on the address and one on the IP: two requests at once are counted one after the other,
 * so they cannot both pass. Over a limit the row stays as the marker the next requests count (skipped, never mailed,
 * its CV text not kept). Throws when the row cannot be written (the route then answers FAILED and runs nothing).
 * The query: requestSql.ts.
 */
export async function acceptJobPageRequest(row: NewRequestRow): Promise<AcceptedRequest> {
  if (!gtmWritesEnabled()) throw new GtmWritesOffError();
  return gtmWrite((sql) => acceptRequestQuery(sql, row));
}

// ---------------------------------------------------------------------------------------------------------------
// The steps

type Outcome = string;
type Ctx = { settings: AgentSettings; configId: string; now: Date };

/**
 * Moves one request on as far as it goes now: found → (excluded | waits | matched) → approved → sent. The caller holds
 * its lease (the route's insert, or runDueJobPageRequests' claim). A step that fails for a passing reason (a model
 * error) is tried again after a wait (tickRules.ts retryDelayMs), and the request fails after STEP_MAX_ATTEMPTS.
 * Never throws; returns what it did.
 */
export async function runJobPageRequest(personId: string): Promise<Outcome> {
  if (!gtmWritesEnabled()) return "writes_off";
  try {
    const read = await readAgentPerson(personId);
    if (!read || read.method !== "request") return "missing";
    let person: AgentPerson = read;
    const settings = await readAgentSettings();
    // Off (the whole agent or this channel): held, looked at again later; nothing is spent.
    if (!settings.enabled || !settings.channels.request?.enabled) return await hold(person, REQUEST_HOLD_MS, "held_off");
    const ctx: Ctx = { settings, configId: (await ensureAgentConfig(settings)).id, now: new Date() };
    for (let pass = 0; pass < MAX_PASSES; pass += 1) {
      const step: Step = person.status === "found" ? await stepFound(person, ctx)
        : person.status === "matched" ? await stepMatched(person, ctx)
          : person.status === "approved" ? await stepApproved(person, ctx)
            : { outcome: person.status };
      if (!("next" in step)) return step.outcome;
      person = step.next;
    }
    return "passes";
  } catch (error) {
    console.error("[gtm-agent] job-page request failed", personId, error);
    const current = await readAgentPerson(personId).catch(() => null);
    if (!current) return "error";
    const message = errorText(error);
    const attempt = (current.attempts ?? 0) + 1;
    const delay = retryDelayMs(attempt);
    try {
      if (delay !== null) {
        await updateAgentPerson(personId, { attempts: attempt, retryAt: new Date(Date.now() + delay).toISOString() }, {
          kind: "note", by: AGENT, note: `오류로 ${waitLabel(delay)} 뒤 다시 해요 (${attempt}/${STEP_MAX_ATTEMPTS}) · ${message.slice(0, 140)}`,
        }, ["found", "matched", "approved"]);
        return "retry";
      }
      await updateAgentPerson(personId, { status: "failed", skipReason: message.slice(0, 300), attempts: attempt, retryAt: null },
        { kind: "failed", by: AGENT, note: message.slice(0, 160) }, ["found", "matched", "approved"]);
      return "failed";
    } catch (writeError) {
      // The lease runs out and the tick takes it up again.
      console.error("[gtm-agent] job-page request not marked", personId, writeError);
      return "error";
    }
  }
}

type Step = { outcome: Outcome } | { next: AgentPerson };

/** Looked at again after `ms` (or at `at`), nothing else changed. */
async function hold(person: AgentPerson, ms: number, outcome: Outcome, note?: string, at?: Date): Promise<Outcome> {
  await updateAgentPerson(person.id, { retryAt: (at ?? new Date(Date.now() + ms)).toISOString() },
    note ? { kind: "note", by: AGENT, note } : null, [person.status]);
  return outcome;
}

/**
 * The rules that stop a request (request.ts requestExclusionReason): a Harper address, the opt-out list, a member, and
 * an address or company on Ops' blocked domains (the same list that keeps headhunters and competitors off cold mail).
 */
async function requestExclusion(person: AgentPerson, ctx: Ctx): Promise<AgentExcludeReason | null> {
  const facts = await exclusionFacts(person, ctx.settings.signals.blockedDomains);
  const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
  return requestExclusionReason({
    email: person.email, signalAt: person.signalAt, isMember: facts.member, isInternal, isSuppressed: facts.suppressed || facts.opted_out,
    isBlockedCompany: facts.blocked_company,
  }, ctx.now);
}

/** Excluded with why; an address on the opt-out list also clears what they gave (request.ts requestContentCleared). */
async function exclude(person: AgentPerson, reason: AgentExcludeReason, ctx: Ctx, note: string): Promise<Outcome> {
  await updateAgentPerson(person.id, {
    status: "excluded", excludeReason: reason, retryAt: null, ...(reason === "suppressed" ? requestContentCleared(person.request, ctx.now) : {}),
  }, { kind: "excluded", by: AGENT, note }, [person.status]);
  return `excluded_${reason}`;
}

/** Today's money for a request: the day's whole cap (a request may use what is kept for follow-ups). */
function mayRequestSpend(ctx: Ctx, nextUsd = 0): Promise<boolean> {
  return mayAgentSpend(ctx.settings.dailyCostUsd, nextUsd);
}

/**
 * found: the exclusions; the same person's cold rows still waiting are skipped (this request mails them); their
 * LinkedIn profile, once; who they are, once; the pick (never the posting they asked from, nor a posting mailed to the
 * address before), the grader (good first, then unsure, never poor: review.ts requestPostingsToMail) and the mail
 * lines. Nothing to send: no mail, looked at again in REQUEST_RECHECK_DAYS (checks counted on the request).
 */
async function stepFound(found: AgentPerson, ctx: Ctx): Promise<Step> {
  let person = found;
  const request = person.request;
  if (!request) {
    await updateAgentPerson(person.id, { status: "failed", skipReason: "요청 정보가 없어요", retryAt: null },
      { kind: "failed", by: AGENT, note: "요청 정보가 없어요" }, ["found"]);
    return { outcome: "failed" };
  }
  const excluded = await requestExclusion(person, ctx);
  if (excluded) {
    const later = (request.checks ?? 0) > 0 ? "다시 찾기 전에 보니 · " : "";
    return { outcome: await exclude(person, excluded, ctx, `${later}${excluded}`) };
  }
  await skipColdRowsFor(person);

  // 프로필 읽기, once: their LinkedIn profile (profileRead.ts gaveOwnProfile). A read that gives nothing holds nobody up:
  // the pick goes on from their CV, or from the posting alone (the mail says so: request.ts requestMailFacts).
  if (needsProfileRead(person, true)) {
    if (!(await mayRequestSpend(ctx, PROFILE_READ_ESTIMATE_USD))) return { outcome: await hold(person, REQUEST_HOLD_MS, "cost_cap") };
    const read = await readPersonProfile(person);
    await recordAgentSpend({ step: "profile", usd: read.costUsd, runId: null, personId: person.id, configId: ctx.configId, isTest: person.isTest });
    const readFailed = !read.profileText && !person.profileText;
    const updated = await updateAgentPerson(person.id, {
      ...(read.profileText ? { profileText: read.profileText } : {}),
      request: { ...request, readFailed },
      addCostUsd: read.costUsd,
    }, { kind: "profile", by: AGENT, note: read.note }, ["found"]);
    if (!updated) return { outcome: "moved" };
    person = updated;
  }

  // Who they are (name, title, company, place) and, on an English mail, the posting's English names: once.
  const english = (person.language ?? request.locale) === "en";
  if (!person.request?.factsRead && (person.profileText || english)) {
    const facts = await readRequestFacts(person, english, ctx);
    if (facts) person = facts;
  }

  if (!(await mayRequestSpend(ctx))) return { outcome: await hold(person, REQUEST_HOLD_MS, "cost_cap") };
  const current = person.request ?? request;
  const excludeCompanyNames = [person.currentCompany].filter((name): name is string => Boolean(name));
  const excludeRoleIds = [...new Set([current.roleId, ...await sentRoleIdsTo(person.email)].filter((id): id is string => Boolean(id)))];
  const match = await matchAgentPostings(person, {
    excludeCompanyNames, excludeRoleIds, excludePostings: [{ companyName: current.companyName, title: current.roleTitle }],
  });
  await recordAgentSpend({ step: "match", usd: match.costUsd, runId: null, personId: person.id, configId: ctx.configId, isTest: person.isTest });
  let costUsd = match.costUsd;
  if (!match.postings.length) return { outcome: await waitForPostings(person, ctx, costUsd, match.reason || "맞는 공고가 없어요") };
  const review = await reviewAgentPostings({ person, postings: match.postings, texts: match.postingTexts });
  await recordAgentSpend({ step: "review", usd: review.costUsd, runId: null, personId: person.id, configId: ctx.configId, isTest: person.isTest });
  costUsd += review.costUsd;
  if (review.failed) {
    // Never ungraded postings: tried again later like any passing error.
    await updateAgentPerson(person.id, { addCostUsd: costUsd }, null, ["found"]);
    throw new Error(`따로 채점을 하지 못했어요 · ${review.failed}`);
  }
  const graded = withReviews(match.postings, review.reviews);
  const { kept, dropped } = requestPostingsToMail(graded, MAX_FITS);
  if (!kept.length) {
    const names = dropped.map((posting) => `${posting.companyName} · 안 맞음`).join(", ");
    return { outcome: await waitForPostings(person, ctx, costUsd, `따로 채점에서 '잘 맞음'·'애매'인 공고가 없어요 (${names})`) };
  }
  const framed = await match.frame(kept);
  await recordAgentSpend({ step: "match", usd: framed.costUsd, runId: null, personId: person.id, configId: ctx.configId, isTest: person.isTest });
  costUsd += framed.costUsd;
  const unsure = kept.filter((posting) => posting.review?.grade === "unsure").length;
  const matched = await updateAgentPerson(person.id, {
    status: "matched", postings: framed.postings, messageKind: "posting", language: person.language ?? request.locale,
    addCostUsd: costUsd, attempts: 0,
  }, {
    kind: "matched", by: AGENT,
    note: `${framed.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ")}${unsure ? ` (애매 ${unsure}개 포함)` : ""}`.slice(0, 300),
  }, ["found"]);
  return matched ? { next: matched } : { outcome: "moved" };
}

/** No posting to send now: no mail; the request waits REQUEST_RECHECK_DAYS (found), the check counted on it. */
async function waitForPostings(person: AgentPerson, ctx: Ctx, costUsd: number, why: string): Promise<Outcome> {
  const request = requestAfterCheck(person.request as AgentJobPageRequest, ctx.now);
  await updateAgentPerson(person.id, {
    request, retryAt: requestRecheckAt(ctx.now).toISOString(), attempts: 0, addCostUsd: costUsd, postings: [],
  }, {
    kind: "note", by: AGENT, note: `보낼 공고가 아직 없어 ${REQUEST_RECHECK_DAYS}일 뒤 다시 찾아요 (${request.checks}번째 확인) · ${why}`.slice(0, 300),
  }, ["found"]);
  return "waiting";
}

/** The facts step (request.ts requestFactsPrompt): fills what the row does not have yet; null when the call failed. */
async function readRequestFacts(person: AgentPerson, english: boolean, ctx: Ctx): Promise<AgentPerson | null> {
  const request = person.request as AgentJobPageRequest;
  const totals = createCompanyRunUsage();
  let value: unknown;
  try {
    const prompt = requestFactsPrompt({ profileText: person.profileText, seed: request, english });
    value = await withLlmUsageContext(
      { requestId: randomUUID(), careerOrigin: "server", careerCapability: { name: "gtm_agent", step: "request_facts" }, companyRunUsage: totals },
      () => gtmStructuredCall<unknown>({
        label: "gtm-agent:request-facts", schemaName: "gtm_agent_request_facts", schema: REQUEST_FACTS_SCHEMA as unknown as Record<string, unknown>,
        system: prompt.system, user: prompt.user, maxTokens: 600, signal: AbortSignal.timeout(FACTS_TIMEOUT_MS),
      }),
    );
  } catch (error) {
    console.warn("[gtm-agent] job-page request facts", person.id, errorText(error));
    value = null;
  }
  const costUsd = Number(totals.costUsd.toFixed(6));
  await recordAgentSpend({ step: "profile", usd: costUsd, runId: null, personId: person.id, configId: ctx.configId, isTest: person.isTest });
  if (value === null) {
    if (costUsd) await updateAgentPerson(person.id, { addCostUsd: costUsd }, null, ["found"]);
    return null;
  }
  const facts = cleanRequestFacts(value, english);
  return updateAgentPerson(person.id, {
    ...(!person.name && facts.name ? { name: facts.name } : {}),
    ...(!person.headline && facts.headline ? { headline: facts.headline } : {}),
    ...(!person.currentCompany && facts.currentCompany ? { currentCompany: facts.currentCompany } : {}),
    ...(!person.location && facts.location ? { location: facts.location } : {}),
    request: { ...request, factsRead: true, mailCompany: facts.seedCompanyEn || null, mailTitle: facts.seedTitleEn || null },
    addCostUsd: costUsd,
  }, null, ["found"]);
}

/** matched → approved: the request copy (compose.server.ts, no model call). */
async function stepMatched(person: AgentPerson, ctx: Ctx): Promise<Step> {
  const language = person.language ?? person.request?.locale ?? "ko";
  const draft = await composeAgentMail({ person, postings: person.postings, language, senderName: ctx.settings.senderName ?? "", offer: "posting" });
  const approved = await updateAgentPerson(person.id, {
    status: "approved", channel: "email", draftSubject: draft.subject, draftBody: draft.body, postings: draft.postings,
    mailConfigId: ctx.configId, reason: draft.reason, addCostUsd: draft.costUsd, attempts: 0,
  }, { kind: "drafted", by: AGENT, note: "요청 메일을 썼어요 · 바로 보내요" }, ["matched"]);
  return approved ? { next: approved } : { outcome: "moved" };
}

/**
 * approved → sent, right away (request.ts REQUEST_SEND_HOURS) within the request channel's daily max: none of the cold
 * mails' hours, cap or 30-day rule (deliverAgentMail `requested`), the opt-out list and the exclusions still apply.
 * Postings closed since are left out; all closed → back to the pick.
 */
async function stepApproved(person: AgentPerson, ctx: Ctx): Promise<Step> {
  const { settings } = ctx;
  const sentBy = await readAgentSenderUser();
  if (!sentBy || agentSenderProblem(settings)) return { outcome: await hold(person, REQUEST_HOLD_MS, "held_sender") };
  const sendAt = requestSendAt(new Date());
  if (sendAt.getTime() > Date.now()) return { outcome: await hold(person, 0, "held_hours", undefined, sendAt) };
  // A mail for this row already logged (a run stopped after the provider call): never a second one.
  const existing = await firstMailOf(person.id);
  if (existing?.status === "sent") {
    await updateAgentPerson(person.id, {
      status: "sent", mailId: existing.id, sentAt: new Date(existing.created_at).toISOString(), retryAt: null,
      followupDueAt: new Date(Date.now() + settings.followupDays * DAY_MS).toISOString(),
    }, { kind: "sent", by: AGENT, note: `메일 보냄 · ${existing.subject ?? ""} (멈췄던 보내기를 이어서)`.slice(0, 300) }, ["approved"]);
    return { outcome: "sent" };
  }
  // Stuck mid-send: settled by the tick (run.server.ts settlePendingMails), which marks the row.
  if (existing?.status === "sending") return { outcome: await hold(person, REQUEST_HOLD_MS, "held_pending") };
  const use = await channelUseToday(ctx.now);
  if (channelRoomLeft(settings.channels.request, use.sent.get("request") ?? 0) <= 0) {
    return { outcome: await hold(person, 0, "held_channel", "오늘 요청 메일을 다 보내서 내일 보내요", nextKstDay(new Date())) };
  }
  const excluded = await requestExclusion(person, ctx);
  if (excluded) return { outcome: await exclude(person, excluded, ctx, `보내기 전에 다시 보니 · ${excluded}`) };
  if (!personMailable(person)) {
    const reason = mailboxCanExist(person.email) ? "보낼 수 없는 주소라 보내지 않아요" : "있을 수 없는 메일 주소라 보내지 않아요";
    await updateAgentPerson(person.id, { status: "skipped", skipReason: reason, retryAt: null }, { kind: "skipped", by: AGENT, note: reason }, ["approved"]);
    return { outcome: "skipped_address" };
  }
  const closed = closedOf(person.postings, await closedRoleIds(person.postings));
  const postings = person.postings.filter((posting) => !posting.roleId || !closed.has(posting.roleId));
  if (!postings.length) {
    const back = await updateAgentPerson(person.id, { status: "found", postings: [], draftSubject: null, draftBody: null, reason: null }, {
      kind: "note", by: AGENT, note: "보내기 전에 공고가 모두 닫혀서 다시 골라요",
    }, ["approved"]);
    return back ? { next: back } : { outcome: "moved" };
  }
  const language = person.language ?? person.request?.locale ?? "ko";
  // The subject and the list for the postings that go (one left out since: the count in the subject follows).
  const subject = postings.length === person.postings.length && person.draftSubject
    ? person.draftSubject
    : agentSubject({ language, name: person.name, count: postings.length, request: true });
  const body = agentPostingList(postings);
  const mailFacts = requestMailFacts(person);
  let result: Awaited<ReturnType<typeof deliverAgentMail>>;
  try {
    result = await deliverAgentMail({
      person, postings, settings, sentBy, followup: false, requested: true,
      render: (_mailId, links) => renderAgentMail({
        language, subject, body, name: person.name, harperUrl: links.harperUrl, postings, senderName: settings.senderName ?? "",
        senderEmail: settings.senderEmail ?? "", unsubscribeUrl: links.unsubscribeUrl, offer: "posting", request: mailFacts,
      }),
    });
  } catch (error) {
    if (error instanceof AgentSendError && error.kind === "recipient") {
      await updateAgentPerson(person.id, { status: "failed", skipReason: error.message.slice(0, 300), retryAt: null },
        { kind: "failed", by: AGENT, note: `메일을 보내지 못했어요 · ${error.message.slice(0, 160)}` }, ["approved"]);
      return { outcome: "failed_recipient" };
    }
    throw error;
  }
  if (result.status === "sent") {
    await updateAgentPerson(person.id, {
      status: "sent", mailId: result.mailId, sentAt: result.sentAt, postings, draftSubject: subject, draftBody: body, retryAt: null, attempts: 0,
      followupDueAt: new Date(Date.now() + settings.followupDays * DAY_MS).toISOString(),
    }, { kind: "sent", by: AGENT, note: `메일 보냄 · ${subject}${mailFacts.lateDay ? ` (${mailFacts.lateDay} 요청)` : ""}`.slice(0, 300) }, ["approved"]);
    return { outcome: "sent" };
  }
  const suppressed = result.reason.includes("연락 받지 않기");
  await updateAgentPerson(person.id, {
    status: "skipped", skipReason: result.reason, mailId: result.mailId, retryAt: null,
    ...(suppressed ? requestContentCleared(person.request, ctx.now) : {}),
  }, { kind: "skipped", by: AGENT, note: result.reason }, ["approved"]);
  return { outcome: "skipped" };
}

/** The row's first candidate mail that went or may have gone (a follow-up is never there yet: the row is approved). */
async function firstMailOf(personId: string): Promise<{ id: string; status: string; created_at: string | Date; subject: string | null } | null> {
  const [row] = await gtmRead((sql) => sql<Array<{ id: string; status: string; created_at: string | Date; subject: string | null }>>`
    select m.id::text as id, m.status, m.created_at, m.subject from public.gtm_mails m
    where m.agent_person_id = ${personId}::uuid and m.audience = 'candidate' and m.status in ('sending', 'sent')
    order by m.created_at desc limit 1
  `);
  return row ?? null;
}

/** Role ids of the postings any candidate mail to this address proposed within SENT_ROLES_DAYS. */
async function sentRoleIdsTo(email: string | null): Promise<string[]> {
  const to = email?.trim().toLowerCase();
  if (!to) return [];
  const rows = await gtmRead((sql) => sql<Array<{ role_id: string | null; postings: Array<{ roleId?: string | null }> | null }>>`
    select m.role_id::text as role_id, m.postings from public.gtm_mails m
    where m.audience = 'candidate' and m.status = 'sent' and m.to_email = ${to}
      and m.created_at > now() - make_interval(days => ${SENT_ROLES_DAYS}::int)
  `);
  return rows.flatMap((row) => [row.role_id, ...(Array.isArray(row.postings) ? row.postings.map((posting) => posting?.roleId ?? null) : [])])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * The same person's cold rows still waiting for their first mail (found, matched, approved and not mid-send), by
 * address, by key or by LinkedIn profile: skipped, so they get this request's mail and not a cold one too.
 */
async function skipColdRowsFor(person: AgentPerson): Promise<number> {
  const email = cleanEmail(person.email);
  const keys = [...new Set([person.personKey, ...personKeys({ email, profileUrl: person.profileUrl })])];
  const handles = linkedinHandles([person.profileUrl, person.contactUrl]);
  const rows = await gtmRead((sql) => sql<Array<{ id: string; status: AgentPerson["status"] }>>`
    select p.id::text as id, p.status from public.gtm_agent_people p
    where p.method <> 'request' and p.status in ('found', 'matched', 'approved')
      and (p.person_key = any(${keys}::text[])
        ${email ? sql`or lower(p.email) = ${email}` : sql``}
        ${handles.length ? sql`or substring(lower(p.profile_url) from 'linkedin\\.com/in/([^/?#[:space:]]+)') = any(${handles}::text[])` : sql``})
      and not exists (select 1 from public.gtm_mails m where m.agent_person_id = p.id and m.audience = 'candidate' and m.status = 'sending')
  `);
  let skipped = 0;
  for (const row of rows) {
    const done = await updateAgentPerson(row.id, { status: "skipped", skipReason: "공고 페이지에서 직접 요청", retryAt: null },
      { kind: "skipped", by: AGENT, note: "같은 분이 공고 페이지에서 직접 요청해서, 그 요청 메일로 연락해요" }, [row.status]);
    if (done) skipped += 1;
  }
  return skipped;
}

// ---------------------------------------------------------------------------------------------------------------
// The tick's part

/**
 * Requests due now (a run that never finished, a hold that ended, a wait of REQUEST_RECHECK_DAYS that ended), any day
 * of the week, each claimed (its lease written) so no other tick or route works on it meanwhile. `mayStart`: whether
 * the tick still has time for one more (a request's pick takes about as long as a cold person's).
 */
export async function runDueJobPageRequests(args: { limit: number; mayStart: () => boolean }): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (let index = 0; index < args.limit; index += 1) {
    if (!args.mayStart()) break;
    const id = await claimDueRequest();
    if (!id) break;
    const outcome = await runJobPageRequest(id);
    counts[outcome] = (counts[outcome] ?? 0) + 1;
  }
  return counts;
}

/** The request due longest ago, its lease written; null when none is due. */
function claimDueRequest(): Promise<string | null> {
  return gtmWrite((sql) => claimDueRequestQuery(sql));
}
