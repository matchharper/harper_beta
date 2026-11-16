import "server-only";

import { formatLlmPartialDate } from "@/lib/llm/promptDateTime";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { GTM_WORKSPACE_ID } from "./constants";
import { gtmRead } from "./db.server";
import { gtmStructuredCall } from "./llm.server";
import type { GtmCandidateSource } from "./mailSend.server";
import { cleanPersonalLine, durationText, experienceMonths, personalLineKey, type GtmMailLanguage } from "./personalLine";

type Ref = { source: GtmCandidateSource; ref: string };
type Role = { role: string | null; company: string | null; start: string | null; end: string | null; months?: number | null };

const MISSING = new Set(["42P01", "42703", "PGRST205"]);
const ROLES_PER_PERSON = 2;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, max = 300) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

async function tolerant<T>(read: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (MISSING.has(String((error as { code?: string }).code))) return empty;
    throw error;
  }
}

function roleLine(role: Role) {
  const months = role.months ?? experienceMonths(role.start, role.end);
  const when = role.start
    ? `${formatLlmPartialDate(role.start.slice(0, 7))} ~ ${role.end ? formatLlmPartialDate(role.end.slice(0, 7)) : "now"}`
    : "";
  const span = [when, durationText(months ?? null)].filter(Boolean).join(", ");
  return [[role.role, role.company].filter(Boolean).join(" at "), span ? `(${span})` : ""].filter(Boolean).join(" ");
}

/**
 * Each chosen person's own search result as short text facts (no name, no contact): Harper members from their
 * profile (headline, latest roles), external people from the external search (headline, career, the search's
 * judgment and matched criteria), scraped people from the profile DB (headline, latest roles). Empty: no basis.
 */
async function readBasis(args: { gtmRoleId: string | null; recipients: Ref[] }): Promise<Map<string, string[]>> {
  const ids = (source: GtmCandidateSource) => args.recipients.filter((item) => item.source === source).map((item) => item.ref);
  const members = ids("member");
  const scraped = ids("scraped");
  const externals = args.gtmRoleId ? ids("external") : [];
  const [memberRows, scrapedRows, externalRows] = await Promise.all([
    members.length ? tolerant(() => gtmRead(async (sql) => {
      const [people, roles] = await Promise.all([
        sql<Array<{ id: string; headline: string | null }>>`
          select user_id::text as id, headline from public.talent_users where user_id = any(${members}::uuid[])`,
        sql<Array<{ id: string; role: string | null; company: string | null; start: string | null; end: string | null }>>`
          select talent_id::text as id, role, company_name as company, start_date::text as start, end_date::text as end
          from public.talent_experiences where talent_id = any(${members}::uuid[])
          order by talent_id, end_date desc nulls first, start_date desc nulls last`,
      ]);
      return { people: [...people], roles: [...roles] };
    }), { people: [], roles: [] }) : { people: [], roles: [] },
    scraped.length ? tolerant(() => gtmRead(async (sql) => {
      const [people, roles] = await Promise.all([
        sql<Array<{ id: string; headline: string | null }>>`
          select id::text as id, headline from public.candid where id = any(${scraped}::uuid[])`,
        sql<Array<{ id: string; role: string | null; company: string | null; start: string | null; end: string | null; months: number | null }>>`
          select e.candid_id::text as id, e.role, c.name as company, e.start_date::text as start, e.end_date::text as end, e.months
          from public.experience_user e left join public.company_db c on c.id = e.company_id
          where e.candid_id = any(${scraped}::uuid[])
          order by e.candid_id, e.end_date desc nulls first, e.start_date desc nulls last`,
      ]);
      return { people: [...people], roles: [...roles] };
    }), { people: [], roles: [] }) : { people: [], roles: [] },
    externals.length ? tolerant(async () => {
      const { data, error } = await getSupabaseAdmin().from("external_candidates")
        .select("id,headline,current_company,career_lines,verdict")
        .eq("company_workspace_id", GTM_WORKSPACE_ID).eq("role_id", args.gtmRoleId as string).in("id", externals);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; headline: string | null; current_company: string | null; career_lines: unknown; verdict: unknown }>;
    }, []) : [],
  ]);

  const basis = new Map<string, string[]>();
  const profile = (source: GtmCandidateSource, rows: { people: Array<{ id: string; headline: string | null }>; roles: Array<Role & { id: string }> }) => {
    for (const person of rows.people) {
      const facts = [
        person.headline?.trim() ? `Headline: ${text(person.headline)}` : "",
        ...rows.roles.filter((row) => row.id === person.id && (row.role || row.company)).slice(0, ROLES_PER_PERSON)
          .map((row) => `Role: ${roleLine(row)}`),
      ].filter(Boolean);
      if (facts.length) basis.set(personalLineKey({ source, ref: person.id }), facts);
    }
  };
  profile("member", memberRows);
  profile("scraped", scrapedRows);
  for (const row of externalRows) {
    const verdict = record(row.verdict);
    const matched = list(verdict.criteria).flatMap((item) => {
      const criterion = record(item);
      const level = text(criterion.level, 20).toLowerCase();
      if (level !== "excellent" && level !== "good") return [];
      const quote = text(criterion.quote, 200);
      return [`${text(criterion.name, 80)}${quote ? ` ("${quote}")` : ""}`];
    }).filter(Boolean).slice(0, 3);
    const facts = [
      row.headline?.trim() ? `Headline: ${text(row.headline)}` : "",
      row.current_company?.trim() ? `Current company: ${text(row.current_company, 120)}` : "",
      ...list(row.career_lines).slice(0, 3).map((line) => `Career: ${text(String(line).replace(/^(경력|학력): /, ""), 200)}`),
      text(verdict.reason) ? `Search judgment: ${text(verdict.reason)}` : "",
      matched.length ? `Matched for this role: ${matched.join("; ")}` : "",
    ].filter(Boolean);
    if (facts.length) basis.set(personalLineKey({ source: "external", ref: row.id }), facts);
  }
  return basis;
}

/**
 * 맞춤 한 줄 for everyone chosen, in one LLM call: why we write to this person for this Role, from their own
 * search result only. People with no basis (or for whom the model finds no real reason) get no line.
 * Returns lines by personalLineKey.
 */
export async function draftGtmPersonalLines(args: {
  language: GtmMailLanguage; roleTitle: string; companyName: string | null; description: string;
  gtmRoleId: string | null; recipients: Ref[];
}): Promise<Record<string, string>> {
  const basis = await readBasis(args);
  if (!basis.size) return {};
  const people = [...basis.entries()];
  const result = await gtmStructuredCall<{ lines: Array<{ key: string; line: string }> }>({
    label: "ops/gtm-plays:candidate-lines",
    schemaName: "gtm_candidate_lines",
    schema: {
      type: "object", additionalProperties: false, required: ["lines"],
      properties: {
        lines: {
          type: "array",
          items: {
            type: "object", additionalProperties: false, required: ["key", "line"],
            properties: { key: { type: "string" }, line: { type: "string" } },
          },
        },
      },
    },
    system: [
      "You write the one sentence that follows the greeting in a short email from Harper (an AI recruiting service) to a candidate about one open role.",
      "The sentence tells this person why we are writing to them for this role, from the facts listed for them: their roles, companies, how long they held them, and what the search found.",
      args.language === "ko"
        ? "Write in Korean, polite 해요체, one sentence of at most about 90 characters, ending like '연락드려요'. Example of the kind: '○○에서 결제 백엔드를 4년 하신 경험이 이 자리와 잘 맞아 보여 연락드려요.'"
        : "Write in English, one short sentence. Example of the kind: 'Your four years building payments backends at ○○ look like a close fit for this role.'",
      "Use only that person's facts. Never add a company, number, skill or achievement that is not in them; give durations as listed. No salary, no promises, no praise beyond the facts, no greeting and no name.",
      "Return one item per person with their key exactly as written inside the brackets. When the facts give no real reason this person fits the role, return an empty line for them.",
    ].join("\n"),
    user: [
      `Role: ${args.roleTitle}${args.companyName ? ` at ${args.companyName}` : ""}`,
      "Role description:",
      args.description.slice(0, 2_000),
      "",
      "People:",
      ...people.map(([key, facts]) => [`[${key}]`, ...facts.map((fact) => `- ${fact}`)].join("\n")),
    ].join("\n"),
    maxTokens: 16_000,
  });
  const lines: Record<string, string> = {};
  for (const item of Array.isArray(result.lines) ? result.lines : []) {
    // The people are listed as "[key]"; the model may echo the brackets.
    const key = String(item?.key ?? "").trim().replace(/^\[|\]$/g, "");
    const line = cleanPersonalLine(item?.line);
    if (line && basis.has(key)) lines[key] = line;
  }
  return lines;
}
