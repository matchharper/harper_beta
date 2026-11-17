import "server-only";

import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { gtmRead } from "../db.server";
import { gtmMailsTable } from "../mailSend.server";
import { composeAgentMail } from "./compose.server";
import { exclusionFacts } from "./exclusion.server";
import { agentMailableAddress, agentSenderProblem } from "./mailRules";
import { matchAgentPostings } from "./match.server";
import { exclusionReason, kstClock, withinSendHours } from "./people";
import { renderAgentMail } from "./render";
import { readRoleRunParams, sumCounts, type RoleRunParams } from "./role";
import { deliverRoleMail, findRolePeople, handleRoleFound, roleMailCache, roleSourcesLeft } from "./role.server";
import { deliverAgentMail } from "./send.server";
import type { SignalSource } from "./signals";
import { searchSignalPeople } from "./signals.server";
import {
  agentCostToday, createAgentRun, insertAgentPeople, leaseAgentRun, listAgentPeopleByStatus, readAgentPerson,
  readAgentSenderUser, readAgentSettings, releaseAgentRun, updateAgentPerson, type AgentRun,
} from "./store.server";
import type { AgentPerson, AgentSettings } from "./types";

type RoleMails = ReturnType<typeof roleMailCache>;

/**
 * #5 dispatcher tick (a web cron every few minutes, /api/internal/gtm-agent/dispatch). One tick leases one run
 * (an import or manual run before the day's run) and handles a small batch of its new people, then does the steps
 * that are not about new people: noticing clicks / sign-ups / opt-outs, sending what is approved when the hours
 * allow, one follow-up after followupDays, and ending. A tick fits the time limit, and a stop in the middle loses
 * nothing: every step is a status on the person row.
 */

const LEASE_MS = 4 * 60_000;
const BATCH = 6;
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

/** found → excluded | no_fit | drafted / approved. Email only (Shaun 11/17): no address the agent may mail → excluded. */
async function handleFound(person: AgentPerson, settings: AgentSettings): Promise<{ cost: number; outcome: string }> {
  const facts = await exclusionFacts(person);
  const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
  const excluded = exclusionReason({
    method: person.method, email: person.email, signalAt: person.signalAt, isMember: facts.member,
    isSuppressed: facts.suppressed || facts.opted_out, isInternal, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
    lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: facts.active_elsewhere,
  }, new Date(), settings.quietDaysAfterEnd);
  if (excluded) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded }, { kind: "excluded", by: AGENT, note: excluded }, ["found"]);
    return { cost: 0, outcome: `excluded_${excluded}` };
  }

  // Email only: without an address the agent may mail, matching is not worth paying for.
  const email = agentMailableAddress(person.email, person.emailSource, settings) ? person.email : null;
  if (!email) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "no_email" },
      { kind: "excluded", by: AGENT, note: person.email ? "회사 메일 주소만 있어요" : "이메일 주소가 없어요" }, ["found"]);
    return { cost: 0, outcome: "excluded_no_email" };
  }

  const match = await matchAgentPostings(person, { excludeCompanyNames: person.currentCompany ? [person.currentCompany] : [] });
  if (match.notJobSeeking) {
    await updateAgentPerson(person.id, { status: "excluded", excludeReason: "not_job_seeking", addCostUsd: match.costUsd },
      { kind: "excluded", by: AGENT, note: match.reason }, ["found"]);
    return { cost: match.costUsd, outcome: "excluded_not_job_seeking" };
  }
  if (match.postings.length < 2) {
    await updateAgentPerson(person.id, { status: "no_fit", language: match.language, addCostUsd: match.costUsd },
      { kind: "no_fit", by: AGENT, note: match.reason || "맞는 회사가 2곳이 안 돼요" }, ["found"]);
    return { cost: match.costUsd, outcome: "no_fit" };
  }
  const matched = await updateAgentPerson(person.id, {
    status: "matched", postings: match.postings, language: match.language, addCostUsd: match.costUsd,
  }, { kind: "matched", by: AGENT, note: match.postings.map((posting) => `${posting.companyName} · ${posting.title}`).join(" / ") }, ["found"]);
  if (!matched) return { cost: match.costUsd, outcome: "moved" };

  const draft = await composeAgentMail({ person: matched, postings: match.postings, language: match.language, senderName: settings.senderName ?? "" });
  const approved = settings.sendMode === "auto";
  await updateAgentPerson(person.id, {
    status: approved ? "approved" : "drafted", channel: "email", draftSubject: draft.subject, draftBody: draft.body,
    messageKind: draft.messageKind, reason: draft.reason, addCostUsd: draft.costUsd,
  }, { kind: "drafted", by: AGENT, note: approved ? "메일을 썼어요 · 보내는 시간에 나가요" : "메일을 썼어요 · 승인 기다림" }, ["matched"]);
  return { cost: match.costUsd + draft.costUsd, outcome: approved ? "approved" : "drafted" };
}

/** approved → sent (or failed / blocked back to the timeline) within the hours and today's cap. */
async function sendApproved(settings: AgentSettings, sentBy: string, now: Date, limit: number, roleMails: RoleMails) {
  if (!withinSendHours(now, settings.sendStartHour, settings.sendEndHour) || agentSenderProblem(settings)) return 0;
  let sent = 0;
  for (const person of await listAgentPeopleByStatus("approved", limit)) {
    const subject = person.draftSubject ?? "";
    const body = person.draftBody ?? "";
    let result: Awaited<ReturnType<typeof deliverAgentMail>>;
    try {
      // A Role run's person gets #4's mail about the one Role; everyone else the 2-3 postings mail.
      result = person.method === "role" && person.roleId
        ? await deliverRoleMail({ person, settings, sentBy, followup: false, subject, body, mail: await roleMails(person.roleId) })
        : await deliverAgentMail({
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
      await updateAgentPerson(person.id, {
        status: "sent", mailId: result.mailId, sentAt: result.sentAt,
        followupDueAt: new Date(now.getTime() + settings.followupDays * DAY_MS).toISOString(),
      }, { kind: "sent", by: AGENT, note: `메일 보냄 · ${subject}` }, ["approved"]);
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

/** One follow-up after followupDays without a reaction; after a second wait without one, the person ends. */
async function followUps(settings: AgentSettings, sentBy: string, now: Date, limit: number, roleMails: RoleMails) {
  const due = await gtmRead((sql) => sql<Array<{ id: string }>>`
    select id from public.gtm_agent_people where status = 'sent' and followup_due_at <= now() order by followup_due_at limit ${limit}::int
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
      if (!withinSendHours(now, settings.sendStartHour, settings.sendEndHour) || agentSenderProblem(settings)) continue;
      const draft = await composeAgentMail({ person, postings: person.postings, language: person.language ?? "ko", senderName: settings.senderName ?? "", followup: true });
      cost += draft.costUsd;
      let result: Awaited<ReturnType<typeof deliverAgentMail>>;
      try {
        result = person.method === "role" && person.roleId
          ? await deliverRoleMail({
            person, settings, sentBy, followup: true, subject: draft.subject, body: draft.body, mail: await roleMails(person.roleId),
          })
          : await deliverAgentMail({
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

/** The signal searches a source id runs (signals.ts), until the per-domain source list replaces it. */
const SIGNAL_SEARCH: Record<string, SignalSource> = { linkedin: "opentowork", threads: "threads" };

/** Per source and run: at most this share of what is left of today's money, and never more than SIGNAL_BUDGET_MAX. */
const SIGNAL_BUDGET_SHARE = 0.5;
const SIGNAL_BUDGET_MAX = 2;

/**
 * A day's run (and "지금 실행") finds new people once per enabled source (LinkedIn #OpenToWork, Threads): the found
 * people join this run and are handled like imported ones. One source per tick (a search takes a minute or two).
 */
async function findSignalPeople(run: AgentRun, settings: AgentSettings, spent: number): Promise<{ cost: number; counts: Record<string, number> } | null> {
  // Imports and Role runs bring their own people.
  if (run.kind === "import" || run.kind === "role") return null;
  const source = Object.keys(SIGNAL_SEARCH).find((id) => settings.sources[id]?.enabled && !run.counts[`searched_${id}`]);
  if (!source) return null;
  const budget = Math.min(SIGNAL_BUDGET_MAX, Math.max(0, settings.dailyCostUsd - spent) * SIGNAL_BUDGET_SHARE);
  if (budget < 0.05) return { cost: 0, counts: { [`searched_${source}`]: 1, [`skipped_budget_${source}`]: 1 } };
  const result = await searchSignalPeople({ source: SIGNAL_SEARCH[source], budgetUsd: budget, maxPeople: settings.sources[source].daily, known: new Set() });
  const keys = result.people.map((person) => person.personKey);
  const known = keys.length ? new Set((await gtmRead((sql) => sql<Array<{ person_key: string }>>`
    select distinct person_key from public.gtm_agent_people where person_key = any(${keys}::text[])
  `)).map((row) => row.person_key)) : new Set<string>();
  const fresh = result.people.filter((person) => !known.has(person.personKey));
  await insertAgentPeople(fresh.map((person) => ({
    runId: run.id, source, method: "signal", settingsVersion: settings.version, personKey: person.personKey,
    email: person.email, emailSource: person.email ? "post" : null,
    isTest: run.isTest, name: person.name, headline: person.headline, location: person.location,
    currentCompany: person.currentCompany, profileUrl: person.profileUrl, profileText: null, signalText: person.signalText,
    signalUrl: person.signalUrl, signalAt: person.signalAt,
  })), AGENT);
  console.info("[gtm-agent] signals", source, JSON.stringify({ plans: result.plans.map((plan) => plan.reason ?? plan.plan.slice(0, 120)), yields: result.yields }));
  return {
    cost: result.costUsd,
    counts: {
      [`searched_${source}`]: 1, [`signal_found_${source}`]: fresh.length, [`signal_known_${source}`]: result.people.length - fresh.length,
      [`searches_${source}`]: result.yields.length,
      // The search's spend is the run's, not one person's: kept per source so /ops #5 can show it by source.
      [`signal_cost_${source}`]: result.costUsd,
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
  let roleParams: RoleRunParams | null = run.kind === "role" ? readRoleRunParams(run.params) : null;
  const roleMails = roleMailCache();
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
    if (run.kind === "role" && spent < settings.dailyCostUsd) {
      // Role로 찾기: one source per tick (an external search waits on the worker without holding the tick).
      const step = await findRolePeople(run, sentBy);
      if (step) roleParams = step.params;
      if (step?.searched) {
        await releaseAgentRun({ id: run.id, leaseToken, status: "queued", counts: total(step.counts), addCostUsd: step.cost, params: step.params as never });
        return { ran: true, runId: run.id, counts: step.counts };
      }
    }
    const found = await listAgentPeopleByStatus("found", BATCH, run.id);
    if (run.kind === "role" && roleParams && found.length && spent < settings.dailyCostUsd) {
      // One batch: one draft for the Role and each person's own line (#4's 후보 메일).
      try {
        const step = await handleRoleFound(run, found, settings, roleParams);
        cost += step.cost;
        roleParams = step.params;
        for (const [key, value] of Object.entries(step.counts)) counts[key] = (counts[key] ?? 0) + value;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[gtm-agent] role batch failed", run.id, error);
        for (const person of found) {
          await updateAgentPerson(person.id, { status: "failed", skipReason: message.slice(0, 300) },
            { kind: "failed", by: AGENT, note: message.slice(0, 160) }, ["found", "matched"]);
        }
        bump("failed");
      }
    }
    // New people first (the run's own), as long as today's money lasts.
    for (const person of run.kind === "role" ? [] : found) {
      if (spent + cost >= settings.dailyCostUsd) { bump("stopped_cost_cap"); break; }
      let step: { cost: number; outcome: string };
      try {
        step = await handleFound(person, settings);
      } catch (error) {
        // One person's failure (a model or search error) never blocks the others or loops on the next tick.
        const message = error instanceof Error ? error.message : String(error);
        console.error("[gtm-agent] person failed", person.id, error);
        await updateAgentPerson(person.id, { status: "failed", skipReason: message.slice(0, 300) },
          { kind: "failed", by: AGENT, note: message.slice(0, 160) }, ["found", "matched"]);
        bump("failed");
        continue;
      }
      cost += step.cost;
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
      const sent = await sendApproved(settings, sentBy, now, BATCH, roleMails);
      if (sent) counts.sent = sent;
      if (spent + cost < settings.dailyCostUsd) cost += await followUps(settings, sentBy, now, BATCH, roleMails);
    }
    const merged = total(counts);
    const next = await nextStatus(run, today, merged, roleParams);
    await releaseAgentRun({
      id: run.id, leaseToken, status: next, counts: merged, addCostUsd: cost, ...(roleParams ? { params: roleParams as never } : {}),
    });
    return { ran: true, runId: run.id, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[gtm-agent] tick failed", run.id, error);
    await releaseAgentRun({
      id: run.id, leaseToken, status: "queued", counts: total({ ...counts, errors: 1 }), addCostUsd: cost, error: message.slice(0, 1_000),
      ...(roleParams ? { params: roleParams as never } : {}),
    });
    return { ran: true, runId: run.id, counts: { ...counts, errors: 1 } };
  }
}

/**
 * A day's run stays open through its day (it carries sending and follow-ups); an import or manual run ends when its
 * people are handled; a Role run when its people are handled and every source it was asked for is searched.
 */
async function nextStatus(run: AgentRun, today: string, counts: Record<string, number>, roleParams: RoleRunParams | null): Promise<"queued" | "done"> {
  const [left] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people where run_id = ${run.id}::uuid and status = 'found'
  `);
  if (Number(left?.n ?? 0) > 0) return "queued";
  if (run.kind === "daily") return run.runDate === today ? "queued" : "done";
  if (run.kind === "role" && roleSourcesLeft(run, counts, roleParams)) return "queued";
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
