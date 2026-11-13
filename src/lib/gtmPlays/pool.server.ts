import "server-only";

import { buildBroadPool, jdQueryText } from "@/lib/org/roleStart/fastPath";
import { cardLeaks, identifyingTokens, isSameOrg } from "./cardPrivacy";
import { gtmRead } from "./db.server";
import type { GtmJd } from "./jd.server";
import { gtmStructuredCall } from "./llm.server";
import { POOL_CARD_LIMIT, POOL_LIST_SIZE, careerYearsLabel, type AnonymousCard, type CompanyMailDraft } from "./shared";

export type { AnonymousCard } from "./shared";
export { POOL_CARD_LIMIT, POOL_LIST_SIZE } from "./shared";

const NO_ROLE = "00000000-0000-0000-0000-000000000000";

export type MemberFacts = {
  talentId: string;
  /** Harper staff only; never leaves the ops screen. */
  name: string | null;
  headline: string | null;
  location: string | null;
  years: number | null;
  similarity: number;
  experiences: Array<{ role: string | null; company: string | null; start: string | null; end: string | null; description: string | null }>;
  educations: Array<{ school: string | null; degree: string | null; field: string | null }>;
};

/** Job boards and ATS hosts: a posting URL there says nothing about which company it is. */
const JOB_BOARD_HOST = /(^|\.)(linkedin\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|wanted\.co\.kr|saramin\.co\.kr|jobkorea\.co\.kr|rocketpunch\.com|jumpit\.co\.kr|remember\.co\.kr|notion\.site|notion\.so|indeed\.com|glassdoor\.com|myworkdayjobs\.com|smartrecruiters\.com|recruitee\.com|breezy\.hr|bamboohr\.com|teamtailor\.com|ninehire\.com|greetinghr\.com|matchharper\.com|google\.com|forms\.gle)$/i;

function postingDomain(url: string | null) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host && !JOB_BOARD_HOST.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Every name the posting's company goes by, for the members' blocked-company check (production compares the
 * workspace's company_name and published_name): the Harper workspace a customer Role belongs to, or workspaces
 * with the same name or the posting site's domain as their homepage. Read only.
 */
export async function postingCompanyNames(jd: GtmJd) {
  const name = jd.companyName.trim();
  const domain = postingDomain(jd.url);
  const rows = await gtmRead((sql) => sql<Array<{ company_name: string | null; published_name: string | null }>>`
    select w.company_name, w.published_name
    from public.company_workspace w
    where ${jd.sourceWorkspaceId ? sql`w.company_workspace_id = ${jd.sourceWorkspaceId}::uuid` : sql`
      (${name} <> '' and (lower(btrim(w.company_name)) = lower(${name})
        or lower(btrim(coalesce(w.published_name, ''))) = lower(${name})))
      or (${domain}::text is not null and w.homepage_url is not null
        and lower(regexp_replace(regexp_replace(w.homepage_url, '^https?://(www\\.)?', '', 'i'), '[/:?#].*$', '')) = ${domain})`}
    limit 20
  `);
  return [...new Set([name, ...rows.flatMap((row) => [row.company_name, row.published_name])]
    .map((value) => String(value ?? "").trim()).filter(Boolean))];
}

/**
 * Members closest to one JD, read only. The same pool the Role start fast path builds (profile and
 * section embeddings), on the replay gate: onboarded, open to matches, internal recommendations on, and
 * not blocking the posting's company under any of its names. People who work there now (an open experience
 * at that company) are left out too. No Role, run or proposal is written.
 */
export async function findInternalMatches(args: { jd: GtmJd; take?: number }) {
  const take = Math.min(Math.max(args.take ?? POOL_LIST_SIZE, 3), POOL_LIST_SIZE);
  const companyNames = await postingCompanyNames(args.jd);
  const talentIds = await gtmRead(async (sql) => (await sql<Array<{ talent_id: string }>>`
    select t.user_id::text as talent_id
    from public.talent_users t join public.talent_setting s on s.user_id = t.user_id
    where t.deleted_at is null and s.is_onboarding_done is true and s.get_internal_recommendation is not false
      and s.profile_visibility = 'open_to_matches'
  `).map((row) => row.talent_id));
  const pool = await buildBroadPool({
    roleId: NO_ROLE,
    queryText: jdQueryText({ roleName: `${args.jd.companyName} ${args.jd.title}`.trim(), description: args.jd.description }),
    excludeIds: [],
    replay: { talentIds, companyNames },
  });
  // A few more than shown, so leaving out the company's own employees still fills the list.
  const considered = pool.members.slice(0, take * 3);
  const current = companyNames.length && considered.length
    ? await gtmRead((sql) => sql<Array<{ talent_id: string; company_name: string | null }>>`
      select talent_id::text, company_name from public.talent_experiences
      where talent_id = any(${considered.map((member) => member.talentId)}::uuid[]) and end_date is null
    `)
    : [];
  const employees = new Set(current
    .filter((row) => companyNames.some((name) => isSameOrg(name, row.company_name)))
    .map((row) => row.talent_id));
  const top = considered.filter((member) => !employees.has(member.talentId)).slice(0, take);
  const ids = top.map((member) => member.talentId);
  const facts = await gtmRead(async (sql) => {
    const [people, experiences, educations] = await Promise.all([
      sql<Array<{ user_id: string; name: string | null; headline: string | null; location: string | null }>>`
        select user_id::text, name, headline, coalesce(current_location, location) as location
        from public.talent_users where user_id = any(${ids}::uuid[])
      `,
      sql<Array<{ talent_id: string; role: string | null; company_name: string | null; start_date: string | null; end_date: string | null; description: string | null }>>`
        select talent_id::text, role, company_name, start_date::text, end_date::text, left(description, 500) as description
        from public.talent_experiences where talent_id = any(${ids}::uuid[])
        order by talent_id, end_date desc nulls first, start_date desc nulls last
      `,
      sql<Array<{ talent_id: string; school: string | null; degree: string | null; field: string | null }>>`
        select talent_id::text, school, degree, field from public.talent_educations
        where talent_id = any(${ids}::uuid[]) order by talent_id, end_date desc nulls first
      `,
    ]);
    return { people, experiences, educations };
  });
  const person = new Map(facts.people.map((row) => [row.user_id, row]));
  const members: MemberFacts[] = top.map((member) => ({
    talentId: member.talentId,
    name: person.get(member.talentId)?.name ?? null,
    headline: person.get(member.talentId)?.headline ?? null,
    location: person.get(member.talentId)?.location ?? null,
    years: member.years === null ? null : Math.round(member.years * 10) / 10,
    similarity: Math.round(member.retrieval * 100) / 100,
    experiences: facts.experiences.filter((row) => row.talent_id === member.talentId).slice(0, 6)
      .map((row) => ({ role: row.role, company: row.company_name, start: row.start_date, end: row.end_date, description: row.description })),
    educations: facts.educations.filter((row) => row.talent_id === member.talentId).slice(0, 3)
      .map((row) => ({ school: row.school, degree: row.degree, field: row.field })),
  }));
  return { eligibleCount: pool.eligibleCount, members, companyNames, excludedEmployees: employees.size };
}

/** The label a candidate goes by in the card prompt; the model echoes it back so cards never shift. */
const cardLabel = (index: number) => `C${index + 1}`;

function memberText(member: MemberFacts, label: string) {
  return [
    `[${label}]`,
    member.headline ? `Headline: ${member.headline}` : null,
    member.years !== null ? `Career years: ${member.years}` : null,
    member.location ? `Location: ${member.location}` : null,
    ...member.experiences.map((row) => `- ${row.role ?? "?"} @ ${row.company ?? "?"} (${row.start ?? "?"} ~ ${row.end ?? "now"})${row.description ? `: ${row.description.replace(/\s+/g, " ").slice(0, 240)}` : ""}`),
    ...member.educations.map((row) => `- ${[row.degree, row.field, row.school].filter(Boolean).join(", ")}`),
  ].filter(Boolean).join("\n");
}

type CardDraft = { candidate: string; title: string; highlights: string[]; fit: string };

async function draftCards(args: { jd: GtmJd; members: Array<{ member: MemberFacts; label: string }>; language: "ko" | "en" }) {
  const tokens = new Map(args.members.map((item) => [item.label, identifyingTokens(item.member)]));
  const draft = await gtmStructuredCall<{ cards: CardDraft[] }>({
    label: "ops/gtm-plays:pool-cards",
    schemaName: "gtm_anonymous_cards",
    schema: {
      type: "object", additionalProperties: false, required: ["cards"],
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["candidate", "title", "highlights", "fit"],
            properties: {
              candidate: { type: "string" }, title: { type: "string" },
              highlights: { type: "array", items: { type: "string" } }, fit: { type: "string" },
            },
          },
        },
      },
    },
    system: [
      "You write an anonymous card for each candidate given, for the company that posted one job.",
      `Language: ${args.language === "ko" ? "Korean" : "English"}.`,
      "candidate: the candidate's label exactly as given in brackets (e.g. C1).",
      "title: one line like a role summary (e.g. '결제 백엔드 엔지니어').",
      "highlights: 2~3 short lines of concrete experience. fit: one sentence on why this person fits the posting.",
      "Anonymous: never write a person's name, employer names, school names, links or anything that identifies them; describe employers and schools by type (e.g. '국내 핀테크 유니콘').",
      "Use only the facts given. Write exactly one card for every candidate label given.",
    ].join("\n"),
    user: [
      `Posting: ${args.jd.companyName} — ${args.jd.title}`,
      args.jd.description.slice(0, 6_000),
      "",
      "Candidates:",
      ...args.members.map((item) => memberText(item.member, item.label)),
    ].join("\n"),
    // About 300 tokens per card; one call for however many Chris picked.
    maxTokens: Math.min(20_000, 800 + args.members.length * 400),
  });
  const byLabel = new Map<string, CardDraft>();
  const leaked = new Set<string>();
  for (const card of draft.cards ?? []) {
    const label = String(card.candidate ?? "").trim().replace(/^\[|\]$/g, "").toUpperCase();
    const own = tokens.get(label);
    if (!own || !String(card.title ?? "").trim() || byLabel.has(label)) continue;
    const highlights = Array.isArray(card.highlights) ? card.highlights.map(String) : [];
    // Checked in code, not left to the prompt: a card naming the person, an employer, a school, a link or an
    // address is dropped like a missing one (the retry rewrites it).
    if (cardLeaks({ title: String(card.title), highlights, fit: String(card.fit ?? "") }, own).length) leaked.add(label);
    else byLabel.set(label, { ...card, highlights });
  }
  return { cards: byLabel, leaked };
}

/**
 * Anonymous cards for the members Chris picked, in his order (one LLM call, plus one more only for cards the
 * model left out or that named the person, an employer, a school, a link or an address). The model writes the
 * wording only; who is on a card and the career-length label are decided by code, and nothing from the profile
 * itself (headline, employer) is ever used as a fallback.
 */
export async function writeAnonymousCards(args: { jd: GtmJd; members: MemberFacts[]; language: "ko" | "en" }) {
  const members = args.members.slice(0, POOL_CARD_LIMIT).map((member, index) => ({ member, label: cardLabel(index) }));
  if (!members.length) return [] as AnonymousCard[];
  const first = await draftCards({ jd: args.jd, members, language: args.language });
  const cards = first.cards;
  let leaked = first.leaked;
  const missing = members.filter((item) => !cards.has(item.label));
  if (missing.length) {
    const retry = await draftCards({ jd: args.jd, members: missing, language: args.language });
    for (const [label, card] of retry.cards) if (!cards.has(label)) cards.set(label, card);
    leaked = retry.leaked;
  }
  const written = members.flatMap(({ member, label }) => {
    const card = cards.get(label);
    return card ? [{ member, card }] : [];
  });
  if (written.length < members.length) {
    const left = members.filter((item) => !cards.has(item.label));
    const named = left.filter((item) => leaked.has(item.label)).map((item) => item.label.slice(1));
    const reason = named.length ? ` (후보 ${named.join(", ")}번은 카드에 이름·회사·학교·링크가 들어가서 뺐어요)` : "";
    throw new Error(`후보 ${left.map((item) => item.label.slice(1)).join(", ")}번 카드를 만들지 못했어요${reason}. 카드 만들기를 다시 눌러 주세요.`);
  }
  return written.map(({ member, card }): AnonymousCard => {
    return {
      talentId: member.talentId,
      title: String(card.title).trim().slice(0, 120),
      years: careerYearsLabel(member.years, args.language),
      highlights: (card.highlights ?? []).map((line) => String(line).trim().slice(0, 200)).filter(Boolean).slice(0, 3),
      fit: String(card.fit ?? "").trim().slice(0, 300),
    };
  });
}

/**
 * One call (gpt-6-luna): the subject and opening of the mail to the posting's hiring contact. The cards,
 * buttons and sign-off follow in Harper's mail format (companyMail.server.ts).
 */
export async function draftPoolMail(args: {
  jd: GtmJd; cardCount: number; language: "ko" | "en";
}): Promise<CompanyMailDraft> {
  return gtmStructuredCall<CompanyMailDraft>({
    label: "ops/gtm-plays:pool-mail",
    schemaName: "gtm_company_mail",
    schema: {
      type: "object", additionalProperties: false, required: ["subject", "intro"],
      properties: { subject: { type: "string" }, intro: { type: "string" } },
    },
    system: [
      "You write the subject and the opening of a short first email from Harper (an AI recruiting service) to the hiring contact of one job posting.",
      `Language: ${args.language === "ko" ? "Korean (polite 해요체)" : "English"}. Plain text.`,
      `intro: 2~3 short sentences. Mention the posting by title, say Harper has members who fit it and that ${args.cardCount} anonymous summaries follow below.`,
      "No greeting line with a name, no candidate details (the cards follow), no links, no sign-off. Do not add facts, numbers or claims that are not given.",
    ].join("\n"),
    user: [
      `Company: ${args.jd.companyName}`,
      `Posting: ${args.jd.title}`,
      args.jd.url ? `Posting URL: ${args.jd.url}` : null,
    ].filter(Boolean).join("\n"),
    maxTokens: 800,
  });
}
