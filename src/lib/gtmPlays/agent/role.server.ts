import "server-only";

import {
  draftGtmCandidateMail, gtmCandidateHarperUrl, gtmCandidateMailPosting, renderGtmCandidateMail, resolveGtmRecipients,
  searchScrapedPeople, suggestScrapedKeywords,
} from "../candidateMail.server";
import { gtmRead } from "../db.server";
import { readCustomerRoleJd } from "../jd.server";
import { loadGtmRole, requestGtmEmail, requestGtmSearch, searchGtmMembers } from "../outreach.server";
import { cleanPersonalLine, personalLineKey } from "../personalLine";
import { draftGtmPersonalLines } from "../personalLine.server";
import { GTM_WORKSPACE_ID } from "../constants";
import { gtmPostingTitle } from "../shared";
import { measured } from "./compose.server";
import { exclusionFacts } from "./exclusion.server";
import { tallyAgentPeople, type AgentFunnelNumbers } from "./funnel";
import { agentMailableAddress } from "./mailRules";
import { cleanEmail, exclusionReason, kstClock, personKey } from "./people";
import {
  agentRoleTarget, companySideConflict, isGtmRole, nextRoleSource, readRoleRunParams, roleRunParams,
  type AgentRoleTarget, type CompanySideRow, type RoleRunParams,
} from "./role";
import { deliverAgentMail, type AgentRoleMail, type AgentSendResult } from "./send.server";
import { createAgentRun, insertAgentPeople, mapRun, updateAgentPerson, type AgentRun, type RunRow } from "./store.server";
import type { AgentCandidateSource, AgentPerson, AgentPosting, AgentSettings } from "./types";
import { AgentActionError, agentFunnelRows } from "./views.server";

/**
 * #5 "Role로 사람 찾기" (team decision 11/17: #5 takes over #4 후보자 아웃바운드). A Role run finds people for one Role in the
 * places #4 looks (Harper members, the external search on the GTM Role, the scraped profile DB), one source per
 * tick, and every person then walks the #5 steps (exclusion, draft, approval, hours and caps, follow-up, timeline).
 * The mail is #4's 후보 메일 about that one Role: the same draft, personal line, layout, Harper button and log facts,
 * so its Harper page, the sign-up claim (ensure_gtm_mail_opportunity_v1) and the interview skip work as for #4.
 * Email only (team decision 11/17): a person without an address the agent may mail ends excluded (no_email).
 *
 * A customer's Role always means the real Role (role.ts agentRoleTarget): the run, the person rows, the mail's
 * role_id and posting name it; its 'Harper GTM' copy is used only to run the external search and read its people.
 */

const AGENT = "agent";
/** An external search or address lookup still unfinished after this long counts as finished without people. */
const EXTERNAL_WAIT_MS = 2 * 3_600_000;

type RoleSqlRow = {
  role_id: string; workspace_id: string; information: unknown; name: string; status: string;
  description: string | null; external_jd_url: string | null; location_text: string | null;
};

/** Why the external search did not start, in words (requestExternalSourcing's reasons, as #4 shows them). */
const NOT_QUEUED: Record<string, string> = {
  not_enabled: "이 서버는 하퍼 계정 외부 검색이 꺼져 있어요",
  daily_limit: "이 Role의 오늘 외부 검색 한도를 다 썼어요",
  workspace_daily_limit: "하퍼 계정의 오늘 외부 검색 한도를 다 썼어요",
  free_plan_daily_limit: "하퍼 계정의 오늘 외부 검색 한도를 다 썼어요",
  company_request_only: "지금은 요청으로만 검색할 수 있어요",
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

async function readRole(roleId: string): Promise<RoleSqlRow | null> {
  const [row] = await gtmRead((sql) => sql<RoleSqlRow[]>`
    select role_id::text, company_workspace_id::text as workspace_id, information, name, status, description,
      external_jd_url, location_text
    from public.company_roles where role_id = ${roleId}::uuid and status <> 'deleted'
  `);
  return row ?? null;
}

/** The Role a run works with, from whichever Role Ops picked (a GTM Role, its copy, or a customer's Role). */
export async function resolveAgentRole(roleId: string): Promise<{ target: AgentRoleTarget; searchStatus: string | null }> {
  const row = await readRole(roleId);
  if (!row) throw new AgentActionError("Role을 찾지 못했어요.");
  const role = { roleId: row.role_id, workspaceId: row.workspace_id, information: row.information };
  let copy: { roleId: string; status: string } | null = null;
  if (!isGtmRole(role)) {
    const [found] = await gtmRead((sql) => sql<Array<{ role_id: string; status: string }>>`
      select role_id::text, status from public.company_roles
      where company_workspace_id = ${GTM_WORKSPACE_ID}::uuid and status <> 'deleted'
        and information->>'purpose' = 'gtm_outreach' and lower(information->'gtm'->>'sourceRoleId') = ${row.role_id.toLowerCase()}
      order by created_at desc limit 1
    `);
    copy = found ? { roleId: found.role_id, status: found.status } : null;
  }
  return { target: agentRoleTarget(role, copy), searchStatus: isGtmRole(role) ? row.status : copy?.status ?? null };
}

/** What a Role's mails say and keep (#4's facts for the same Role). */
export type RoleMail = {
  target: AgentRoleTarget;
  /** How Ops reads the Role. */
  roleName: string;
  /** The real company (kept on the mail log as #4 does; the person reads `posting.companyName`). */
  companyName: string | null;
  roleTitle: string;
  description: string;
  location: string | null;
  postingUrl: string | null;
  mailPosting: Awaited<ReturnType<typeof gtmCandidateMailPosting>>;
  /** The Role as the person row and the mail's postings keep it (company and title as the person reads them). */
  posting: AgentPosting;
};

export async function loadRoleMail(target: AgentRoleTarget): Promise<RoleMail> {
  let facts: { companyName: string | null; roleTitle: string; roleName: string; description: string; url: string | null; location: string | null };
  if (target.customer) {
    // As #4's 새 공고로 시작하기 with a customer Role: the customer's own Role text and link.
    const jd = await readCustomerRoleJd(target.mailRoleId);
    facts = {
      companyName: jd.companyName, roleTitle: jd.title, roleName: `${jd.companyName} · ${jd.title}`, description: jd.description,
      url: jd.url, location: jd.location,
    };
  } else {
    // As #4's 저장한 Role: the JD as Ops gave it, the Role's link, the company hidden by the mail.
    const row = await readRole(target.mailRoleId);
    if (!row) throw new AgentActionError("Role을 찾지 못했어요.");
    const gtm = record(record(row.information).gtm);
    const companyName = text(gtm.companyName);
    const opsName = text(gtm.opsName) ?? row.name;
    facts = {
      companyName, roleTitle: gtmPostingTitle(opsName, companyName) || row.name, roleName: opsName,
      description: text(gtm.jdText) ?? row.description ?? "", url: row.external_jd_url, location: row.location_text,
    };
  }
  const mailPosting = await gtmCandidateMailPosting({
    roleId: target.mailRoleId, companyName: facts.companyName, postingUrl: facts.url,
    posting: { title: facts.roleTitle, companyName: facts.companyName, location: facts.location, description: facts.description },
  });
  return {
    target, roleName: facts.roleName, companyName: facts.companyName, roleTitle: facts.roleTitle,
    description: facts.description, location: facts.location, postingUrl: facts.url, mailPosting,
    posting: {
      kind: target.customer ? "customer" : "gtm", roleId: target.mailRoleId, url: mailPosting.postingUrl,
      companyName: mailPosting.candidateCompany?.trim() || "—", title: mailPosting.hide(facts.roleTitle),
      location: facts.location, why: "",
    },
  };
}

/** One tick's Role mails, read once per Role. */
export function roleMailCache() {
  const cache = new Map<string, Promise<RoleMail>>();
  return (roleId: string) => {
    let mail = cache.get(roleId);
    if (!mail) {
      mail = resolveAgentRole(roleId).then(({ target }) => loadRoleMail(target));
      cache.set(roleId, mail);
    }
    return mail;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Start

export async function startRoleRun(args: {
  userId: string; roleId: string; isTest: boolean;
  sources: Partial<Record<AgentCandidateSource, { enabled?: boolean; max?: number }>>;
  keywords: string[]; koreanOnly: boolean; language: "ko" | "en"; draftOnly: boolean;
}): Promise<AgentRun> {
  const { target, searchStatus } = await resolveAgentRole(args.roleId);
  if (!target.searchRoleId) {
    throw new AgentActionError("이 고객 Role은 아직 저장되지 않았어요. ‘새로 만들기’에서 이 고객 Role을 골라 저장한 뒤 시작해 주세요.");
  }
  const mail = await loadRoleMail(target);
  const params = roleRunParams({
    searchRoleId: target.searchRoleId, roleName: mail.roleName, sources: args.sources, keywords: args.keywords,
    koreanOnly: args.koreanOnly, language: args.language, draftOnly: args.draftOnly,
  });
  if (!Object.values(params.sources).some((source) => source.enabled)) throw new AgentActionError("찾을 곳을 하나 이상 골라 주세요.");
  if (params.sources.external.enabled && searchStatus !== "active") {
    throw new AgentActionError("외부 검색은 진행 중인 Role만 돼요. 끝낸 Role이면 #4에서 다시 열거나 외부 검색을 빼 주세요.");
  }
  return createAgentRun({
    kind: "role", runDate: kstClock(new Date()).day, isTest: args.isTest, createdBy: args.userId,
    roleId: target.mailRoleId, params: params as unknown as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Find people (one source per tick)

type RoleCandidate = {
  candidateSource: AgentCandidateSource; candidateRef: string; email: string | null; emailSource: "import" | "lookup";
  name: string | null; headline: string | null; location: string | null; currentCompany: string | null;
  profileUrl: string | null; profileText: string | null; foundNote: string;
};

/** New people of a Role run: one per person (personKey), none the same Role already has, then the usual steps. */
async function insertRolePeople(run: AgentRun, candidates: readonly RoleCandidate[]) {
  const keyed = new Map<string, RoleCandidate>();
  for (const candidate of candidates) {
    const key = personKey({ email: candidate.email, profileUrl: candidate.profileUrl });
    if (key && !keyed.has(key)) keyed.set(key, candidate);
  }
  const keys = [...keyed.keys()];
  const known = keys.length ? new Set((await gtmRead((sql) => sql<Array<{ person_key: string }>>`
    select distinct person_key from public.gtm_agent_people
    where role_id = ${run.roleId}::uuid and person_key = any(${keys}::text[])
  `)).map((row) => row.person_key)) : new Set<string>();
  const fresh = [...keyed.entries()].filter(([key]) => !known.has(key));
  await insertAgentPeople(fresh.map(([key, candidate]) => ({
    runId: run.id, source: "role", personKey: key, email: cleanEmail(candidate.email), emailSource: candidate.emailSource,
    isTest: run.isTest, name: candidate.name, headline: candidate.headline, location: candidate.location,
    currentCompany: candidate.currentCompany, profileUrl: candidate.profileUrl, profileText: candidate.profileText,
    signalText: null, signalUrl: null, signalAt: null, roleId: run.roleId, candidateSource: candidate.candidateSource,
    candidateRef: candidate.candidateRef, foundNote: candidate.foundNote,
  })), AGENT);
  return { inserted: fresh.length, known: known.size, unkeyed: candidates.length - keyed.size };
}

export type RoleStep = {
  /** A search ran (or was asked for) this tick: the tick ends here and the people are handled from the next one. */
  searched: boolean;
  cost: number;
  counts: Record<string, number>;
  params: RoleRunParams;
};

async function findMembers(run: AgentRun, params: RoleRunParams): Promise<RoleStep> {
  const found = await searchGtmMembers(params.searchRoleId!);
  const members = found.members.slice(0, params.sources.member.max);
  const addresses = members.length
    ? await resolveGtmRecipients({ roleId: null, recipients: members.map((member) => ({ source: "member" as const, ref: member.talentId })) })
    : [];
  const email = new Map(addresses.map((item) => [item.ref, item.email]));
  const result = await insertRolePeople(run, members.map((member): RoleCandidate => ({
    candidateSource: "member", candidateRef: member.talentId, email: email.get(member.talentId) ?? null, emailSource: "import",
    name: member.name, headline: member.headline, location: member.location,
    currentCompany: member.experiences.find((item) => !item.end)?.company ?? null, profileUrl: null,
    profileText: member.experiences.map((item) => [item.role, item.company].filter(Boolean).join(" @ ")).filter(Boolean).join("\n") || null,
    foundNote: `하퍼 회원 검색 · 가까움 ${member.similarity}`,
  })));
  return {
    searched: true, cost: 0, params,
    counts: { searched_member: 1, role_found_member: result.inserted, role_known_member: result.known },
  };
}

async function findScraped(run: AgentRun, params: RoleRunParams, mail: RoleMail): Promise<RoleStep> {
  let keywords = params.keywords;
  let cost = 0;
  if (!keywords.length) {
    // As #4's Choice 3 on open: keywords written from the Role (LLM 1회).
    const suggested = await measured("role_keywords", () => suggestScrapedKeywords({ roleTitle: mail.roleTitle, description: mail.description }));
    keywords = suggested.value;
    cost += suggested.costUsd;
  }
  const found = keywords.length ? await searchScrapedPeople({ keywords, koreanOnly: params.koreanOnly }) : { people: [] };
  const result = await insertRolePeople(run, found.people.slice(0, params.sources.scraped.max).map((person): RoleCandidate => ({
    candidateSource: "scraped", candidateRef: person.ref, email: person.email, emailSource: "import", name: person.name,
    headline: person.headline, location: person.location, currentCompany: null, profileUrl: person.linkedinUrl,
    profileText: null, foundNote: `스크랩 DB 검색 · ${keywords.join(", ")}`,
  })));
  return {
    searched: true, cost, params: { ...params, state: { ...params.state, usedKeywords: keywords } },
    counts: { searched_scraped: 1, role_found_scraped: result.inserted, role_known_scraped: result.known },
  };
}

const totalUsd = (cost: unknown) => {
  const value = Number(record(cost).totalUsdPaid);
  return Number.isFinite(value) ? value : 0;
};

/**
 * External (#4 Choice 2): ask for the search on the GTM Role; when it has finished, ask for the address of the
 * best `max` people (about $0.12 each; people whose address an earlier lookup already found cost nothing); a person
 * joins the run once their address is found. People whose lookup finds no address are left out.
 */
async function findExternal(run: AgentRun, params: RoleRunParams, sentBy: string | null, now: Date): Promise<RoleStep> {
  const searchRoleId = params.searchRoleId!;
  const state = params.state.external;
  const withState = (external: NonNullable<RoleRunParams["state"]["external"]>) => ({ ...params, state: { ...params.state, external } });
  const done = (note: string, counts: Record<string, number>, cost = 0): RoleStep =>
    ({ searched: true, cost, counts, params: withState({ ...(state ?? {}), phase: "done", note }) });

  if (!state) {
    if (!sentBy) return done("검색을 요청할 Ops 사용자가 없어요 (설정을 한 번 저장해 주세요)", { external_not_queued: 1 });
    let result: Awaited<ReturnType<typeof requestGtmSearch>>;
    try {
      result = await requestGtmSearch({ user: { id: sentBy }, roleId: searchRoleId });
    } catch (error) {
      return done(error instanceof Error ? error.message.slice(0, 200) : String(error), { external_not_queued: 1 });
    }
    if (result.status === "queued" || result.status === "already_running") {
      return {
        searched: true, cost: 0, counts: { external_requested: 1 },
        params: withState({ phase: "requested", sourcingRunId: "runId" in result ? result.runId ?? null : null, requestedAt: now.toISOString() }),
      };
    }
    const reason = "reason" in result ? String(result.reason) : result.status;
    return done(`외부 검색을 시작하지 못했어요 · ${NOT_QUEUED[reason] ?? reason}`, { external_not_queued: 1 });
  }

  if (state.phase === "requested") {
    const sourcingRunId = state.sourcingRunId ?? null;
    const [search] = sourcingRunId ? await gtmRead((sql) => sql<Array<{ status: string; cost: unknown }>>`
      select status, cost from public.external_sourcing_runs where id = ${sourcingRunId}::uuid
    `) : [];
    const waited = now.getTime() - Date.parse(state.requestedAt ?? run.createdAt);
    if (search && (search.status === "queued" || search.status === "running")) {
      return waited > EXTERNAL_WAIT_MS ? done("외부 검색이 2시간 안에 끝나지 않았어요", { external_timeout: 1 }) : { searched: false, cost: 0, counts: {}, params };
    }
    const searchCost = totalUsd(search?.cost);
    if (!search || search.status !== "succeeded") {
      return done(`외부 검색이 끝나지 못했어요 (${search?.status ?? "기록 없음"})`, { external_failed: 1, external_cost: searchCost }, searchCost);
    }
    // #4's 저장한 Role: everyone the search found is shown, best first.
    const role = await loadGtmRole(searchRoleId);
    const taken = new Set((await gtmRead((sql) => sql<Array<{ candidate_ref: string }>>`
      select candidate_ref from public.gtm_agent_people
      where role_id = ${run.roleId}::uuid and candidate_source = 'external' and candidate_ref is not null
    `)).map((row) => row.candidate_ref));
    const picks = role.candidates.filter((item) => !taken.has(item.id) && item.contact !== "not_found" && item.contact !== "failed")
      .slice(0, params.sources.external.max);
    let asked = 0;
    for (const pick of picks.filter((item) => item.contact === "none")) {
      try {
        const lookup = await requestGtmEmail({ user: { id: sentBy ?? "" }, roleId: searchRoleId, candidateId: pick.id });
        if (lookup.status === "queued") asked += 1;
      } catch (error) {
        console.warn("[gtm-agent:role] email lookup", pick.id, error instanceof Error ? error.message : String(error));
      }
    }
    return {
      searched: true, cost: searchCost,
      counts: { external_candidates: role.candidates.length, external_lookups: asked, external_cost: searchCost },
      params: withState({ ...state, phase: picks.length ? "lookups" : "done", lookups: picks.map((item) => item.id), requestedAt: now.toISOString(),
        note: picks.length ? null : "외부 검색에서 새로 연락할 사람이 없었어요" }),
    };
  }

  // Lookups: people with an address join; no address, or still nothing after the wait, are left out.
  const lookups = state.lookups ?? [];
  if (!lookups.length) return done(state.note ?? "", {});
  const rows = await gtmRead((sql) => sql<Array<{
    id: string; linkedin_url: string | null; location: string | null; current_company: string | null;
    status: string | null; cost: unknown; created_at: string | Date | null;
  }>>`
    select c.id::text, c.linkedin_url, c.location, c.current_company, k.status, k.cost, k.created_at
    from public.external_candidates c
    left join public.external_candidate_contacts k on k.external_candidate_id = c.id
    where c.id = any(${lookups}::uuid[])
  `);
  const timedOut = now.getTime() - Date.parse(state.requestedAt ?? run.createdAt) > EXTERNAL_WAIT_MS;
  const settled = rows.filter((row) => row.status === "found" || row.status === "not_found" || row.status === "failed" || !row.status || timedOut);
  const found = settled.filter((row) => row.status === "found");
  const addresses = found.length
    ? await resolveGtmRecipients({ roleId: searchRoleId, recipients: found.map((row) => ({ source: "external" as const, ref: row.id })) })
    : [];
  const byId = new Map(found.map((row) => [row.id, row]));
  const result = await insertRolePeople(run, addresses.filter((item) => item.email).map((item): RoleCandidate => {
    const row = byId.get(item.ref);
    return {
      candidateSource: "external", candidateRef: item.ref, email: item.email, emailSource: "lookup", name: item.name,
      headline: item.headline, location: row?.location ?? null, currentCompany: row?.current_company ?? null,
      profileUrl: row?.linkedin_url ?? null, profileText: null, foundNote: "외부 검색 · 이메일 찾음",
    };
  }));
  // Only the lookups this run asked for are its spend (an address found before cost nothing now).
  const lookupCost = settled.filter((row) => row.created_at && Date.parse(String(row.created_at)) >= Date.parse(run.createdAt))
    .reduce((sum, row) => sum + totalUsd(row.cost), 0);
  const pending = lookups.filter((id) => !settled.some((row) => row.id === id) && rows.some((row) => row.id === id));
  const counts = {
    role_found_external: result.inserted, role_known_external: result.known,
    external_no_email: settled.length - found.length, external_cost: lookupCost,
  };
  if (!settled.length) return { searched: false, cost: 0, counts: {}, params };
  return {
    searched: true, cost: lookupCost, counts,
    params: withState({ ...state, lookups: pending, phase: pending.length ? "lookups" : "done" }),
  };
}

/** A Role run's next search step, or null when every source is done. */
export async function findRolePeople(run: AgentRun, sentBy: string | null, now = new Date()): Promise<RoleStep | null> {
  const params = readRoleRunParams(run.params);
  const source = nextRoleSource(params, run.counts);
  if (!source || !run.roleId || !params.searchRoleId) return null;
  if (source === "member") return findMembers(run, params);
  if (source === "external") return findExternal(run, params, sentBy, now);
  const { target } = await resolveAgentRole(run.roleId);
  return findScraped(run, params, await loadRoleMail({ ...target, searchRoleId: params.searchRoleId }));
}

/** Whether a Role run still has a source to search (its people are counted apart). */
export function roleSourcesLeft(run: AgentRun, counts: Record<string, number>, params: RoleRunParams | null): boolean {
  return nextRoleSource(params ?? readRoleRunParams(run.params), counts) !== null;
}

// ---------------------------------------------------------------------------------------------------------------
// New people → excluded | drafted / approved

/** The company side of one customer Role: connection requests (any state) and the people shown to the company. */
async function companySideRows(roleId: string): Promise<CompanySideRow[]> {
  const rows = await gtmRead((sql) => sql<Array<{ kind: "intro" | "shown"; linkedin_url: string | null; emails: Array<string | null> }>>`
    select 'intro' as kind, c.linkedin_url, array[r.recipient_email, k.email] as emails
    from public.external_intro_requests r
    left join public.external_candidates c on c.id = r.external_candidate_id
    left join public.external_candidate_contacts k on k.external_candidate_id = r.external_candidate_id
    where r.role_id = ${roleId}::uuid
    union all
    select 'shown' as kind, c.linkedin_url, array[k.email] as emails
    from public.external_candidates c
    left join public.external_candidate_contacts k on k.external_candidate_id = c.id
    where c.role_id = ${roleId}::uuid and c.delivered
  `);
  return rows.map((row) => ({ kind: row.kind, linkedinUrl: row.linkedin_url, emails: row.emails ?? [] }));
}

const COMPANY_NOTE = {
  intro: "회사가 이 Role로 이미 연결을 요청한 사람이에요",
  shown: "회사 화면에 이 Role 후보로 이미 보인 사람이에요",
} as const;

/**
 * One batch of a Role run's new people: the usual exclusion (members allowed; for a customer's Role, also anyone
 * the company already has for it), email only, then #4's mail: one draft for the run and each person's own line.
 */
export async function handleRoleFound(run: AgentRun, people: readonly AgentPerson[], settings: AgentSettings, params: RoleRunParams) {
  const counts: Record<string, number> = {};
  const bump = (key: string, n = 1) => { counts[key] = (counts[key] ?? 0) + n; };
  const now = new Date();
  const { target } = await resolveAgentRole(run.roleId!);
  const mail = await loadRoleMail({ ...target, searchRoleId: params.searchRoleId });
  const companyRows = target.customer ? await companySideRows(target.mailRoleId) : [];
  const keep: AgentPerson[] = [];
  for (const person of people) {
    bump("found");
    const facts = await exclusionFacts(person);
    const company = companySideConflict(person, companyRows);
    const isInternal = !person.isTest && Boolean(person.email?.toLowerCase().endsWith("@matchharper.com"));
    const excluded = exclusionReason({
      source: "role", email: person.email, signalAt: null, isMember: facts.member, isSuppressed: facts.suppressed || facts.opted_out,
      isInternal, lastMailedAt: facts.last_mailed ? new Date(facts.last_mailed).toISOString() : null,
      lastEndedAt: facts.last_ended ? new Date(facts.last_ended).toISOString() : null, seenInRun: facts.active_elsewhere,
      companyHasPerson: Boolean(company),
    }, now, settings.quietDaysAfterEnd);
    if (excluded) {
      await updateAgentPerson(person.id, { status: "excluded", excludeReason: excluded },
        { kind: "excluded", by: AGENT, note: company ? COMPANY_NOTE[company] : excluded }, ["found"]);
      bump("excluded");
      continue;
    }
    if (!agentMailableAddress(person.email, person.emailSource, settings)) {
      await updateAgentPerson(person.id, { status: "excluded", excludeReason: "no_email" },
        { kind: "excluded", by: AGENT, note: person.email ? "회사 메일만 있어요 (개인 메일로만 보내요)" : "메일 주소가 없어요" }, ["found"]);
      bump("excluded");
      continue;
    }
    keep.push(person);
  }
  if (!keep.length) return { cost: 0, counts, params };

  let cost = 0;
  let draft = params.state.mail;
  if (!draft) {
    // #4's 초안 만들기: one subject and body for the Role (a GTM Role's company read as "Harper 고객사(<설명>)").
    const written = await measured("role_mail", () => draftGtmCandidateMail({
      language: params.language, companyName: mail.companyName, roleTitle: mail.roleTitle, description: mail.description,
      senderName: settings.senderName?.trim() || "Harper", postingUrl: mail.postingUrl,
      gtm: target.customer ? null : { publicDescription: null, roleId: target.mailRoleId },
    }));
    cost += written.costUsd;
    draft = { subject: mail.mailPosting.hide(written.value.subject.trim()), body: mail.mailPosting.hide(written.value.body.trim()) };
  }
  // #4's 맞춤 한 줄 for everyone in the batch, from each person's own record (one call).
  const refs = keep.flatMap((person) => (person.candidateSource && person.candidateRef ? [{ source: person.candidateSource, ref: person.candidateRef }] : []));
  const lines = refs.length ? await measured("role_lines", () => draftGtmPersonalLines({
    language: params.language, roleTitle: mail.roleTitle, companyName: mail.companyName, description: mail.description,
    gtmRoleId: params.searchRoleId, recipients: refs,
  })).catch((error) => {
    console.warn("[gtm-agent:role] personal lines", error instanceof Error ? error.message : String(error));
    return { value: {} as Record<string, string>, costUsd: 0 };
  }) : { value: {} as Record<string, string>, costUsd: 0 };
  cost += lines.costUsd;
  const share = Math.round((cost / keep.length) * 1_000_000) / 1_000_000;
  const approved = !params.draftOnly && !settings.approvalRequired;
  for (const person of keep) {
    const key = person.candidateSource && person.candidateRef ? personalLineKey({ source: person.candidateSource, ref: person.candidateRef }) : "";
    const line = cleanPersonalLine(mail.mailPosting.hide(lines.value[key] ?? "")) ?? "";
    const posting: AgentPosting = { ...mail.posting, why: line };
    const matched = await updateAgentPerson(person.id, { status: "matched", postings: [posting], language: params.language },
      { kind: "matched", by: AGENT, note: `${posting.companyName} · ${posting.title}` }, ["found"]);
    if (!matched) continue;
    await updateAgentPerson(person.id, {
      status: approved ? "approved" : "drafted", channel: "email", draftSubject: draft.subject,
      draftBody: line ? `${line}\n\n${draft.body}` : draft.body, messageKind: "posting", reason: line || null, addCostUsd: share,
    }, {
      kind: "drafted", by: AGENT,
      note: approved ? "메일을 썼어요 · 보내는 시간에 나가요" : params.draftOnly ? "메일을 썼어요 · 찾기만이라 승인 기다림" : "메일을 썼어요 · 승인 기다림",
    }, ["matched"]);
    bump("matched");
    bump("drafted");
  }
  return { cost, counts, params: { ...params, state: { ...params.state, mail: draft } } };
}

// ---------------------------------------------------------------------------------------------------------------
// Send

/** #4's log facts and Harper button for one person's mail about the Role. */
export function roleMailFacts(mail: RoleMail, person: Pick<AgentPerson, "candidateSource" | "candidateRef">): AgentRoleMail {
  return {
    roleId: mail.target.mailRoleId, companyName: mail.companyName, postingUrl: mail.mailPosting.postingUrl,
    snapshot: mail.mailPosting.snapshot, candidateSource: person.candidateSource, candidateRef: person.candidateRef,
    talentIds: person.candidateSource === "member" && person.candidateRef ? [person.candidateRef] : [],
    harperUrl: (mailId, origin) => gtmCandidateHarperUrl(mailId, origin, mail.mailPosting.posting),
  };
}

/** A Role run person's mail (first or follow-up) in #4's layout, through the #5 sender and its rules. */
export async function deliverRoleMail(args: {
  person: AgentPerson; settings: AgentSettings; sentBy: string; followup: boolean; subject: string; body: string;
  mail: RoleMail;
}): Promise<AgentSendResult> {
  const { mail, person, settings } = args;
  return deliverAgentMail({
    person, postings: person.postings, settings, sentBy: args.sentBy, followup: args.followup,
    mail: roleMailFacts(mail, person),
    render: (_mailId, links) => renderGtmCandidateMail({
      language: person.language ?? "ko", subject: mail.mailPosting.hide(args.subject), body: mail.mailPosting.hide(args.body),
      name: person.name, harperUrl: links.harperUrl, posting: mail.mailPosting.posting,
      senderName: settings.senderName ?? "", senderEmail: settings.senderEmail ?? "", unsubscribeUrl: links.unsubscribeUrl,
    }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The Role runs on /ops #5

export type RoleRunView = AgentRun & {
  roleName: string | null;
  sources: RoleRunParams["sources"];
  draftOnly: boolean;
  keywords: string[];
  externalNote: string | null;
  externalPhase: string | null;
  numbers: AgentFunnelNumbers;
};

/** The latest Role runs with what came of their people (the #5 numbers, per run). */
export async function listRoleRuns(args: { limit?: number; includeTest: boolean }): Promise<RoleRunView[]> {
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
  return tolerant([], () => gtmRead(async (sql) => {
    const runs = (await sql<RunRow[]>`
      select * from public.gtm_agent_runs where kind = 'role' and (${args.includeTest} or not is_test)
      order by created_at desc limit ${limit}::int
    `).map(mapRun);
    if (!runs.length) return [];
    const rows = await agentFunnelRows(sql, sql`p.run_id = any(${runs.map((run) => run.id)}::uuid[])`);
    return runs.map((run): RoleRunView => {
      const params = readRoleRunParams(run.params);
      return {
        ...run, roleName: params.roleName, sources: params.sources, draftOnly: params.draftOnly,
        keywords: params.state.usedKeywords ?? params.keywords, externalNote: params.state.external?.note ?? null,
        externalPhase: params.state.external?.phase ?? null,
        numbers: tallyAgentPeople(rows.filter((row) => row.runId === run.id)),
      };
    });
  }));
}

/** Before the #5 migration (or its Role columns) is applied, the lists are empty. */
async function tolerant<T>(empty: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (["42P01", "42703"].includes(String((error as { code?: string })?.code ?? ""))) return empty;
    throw error;
  }
}

/** Roles that have Role runs (the people filter). */
export async function listRoleRunRoles(): Promise<Array<{ roleId: string; roleName: string }>> {
  const rows = await tolerant<Array<{ role_id: string; role_name: string | null }>>([], () => gtmRead(async (sql) => [...await sql<Array<{ role_id: string; role_name: string | null }>>`
    select distinct on (role_id) role_id::text, params->>'roleName' as role_name
    from public.gtm_agent_runs where kind = 'role' and role_id is not null
    order by role_id, created_at desc
  `]));
  return rows.map((row) => ({ roleId: row.role_id, roleName: row.role_name ?? "이름 없는 Role" }))
    .sort((a, b) => a.roleName.localeCompare(b.roleName, "ko"));
}

