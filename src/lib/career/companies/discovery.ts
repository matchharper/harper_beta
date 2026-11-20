import { formatLlmYearsAgo } from "@/lib/llm/promptDateTime";
import { createHash } from "node:crypto";
import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { embedTitles, EMBEDDING_MODEL } from "@/lib/externalRecommendationsV2/retrieval";
import { formatCompanySignals, readCompanySignals, type CompanySignals } from "./signals";

/**
 * Company discovery over company_workspace, the one company hub. Harper-connected
 * (internal) companies are outside it: every query here excludes them.
 */
type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const rpc = (admin: TalentAdminClient, name: string, args: Row) => (admin.rpc as any)(name, args);

export type CompanyFacts = {
  profile?: { size?: { start?: number; end?: number }; founded?: number; location?: string };
  team?: { asOf?: string; staff?: number; joined12m?: number; left12m?: number; cameFrom?: { company: string; n: number }[] };
  leaders?: { title?: string; school?: string; before?: string }[];
  hiring?: { openRoles?: number; latestPosting?: string; relatedTitles?: string[]; careersUrl?: string };
  reach?: { sameSchool?: number; sameCompany?: number };
  /** Dated public hiring signals on record, and when the company was last checked for them. */
  signals?: CompanySignals;
};

/** An embedding of what a search is after; missing when it cannot be made, so callers carry on without it. */
export async function embedHint(text: string | undefined, signal?: AbortSignal) {
  if (!text?.trim()) return undefined;
  try { return (await embedTitles([text.slice(0, 2000)], signal))[0]; } catch { return undefined; }
}

type DirectionContext = {
  search_brief?: unknown;
  profile?: { headline?: unknown; experiences?: { role?: unknown; end_date?: unknown }[] | null } | null;
} | null | undefined;
const textOf = (value: unknown) => typeof value === "string" ? value.trim() : "";

/** What the person wants, for picking a company's open roles when a search names no title: their Search
 * Brief text, else their current title (docs/career-good-opportunity-recommendation-ko.md 2.5). */
export function directionHint(context: DirectionContext) {
  const brief = context?.search_brief;
  const briefText = Array.isArray(brief)
    ? brief.map(item => textOf(typeof item === "string" ? item : (item as { content?: unknown } | null)?.content)).filter(Boolean).join("\n")
    : textOf(brief);
  if (briefText) return briefText;
  const experiences = Array.isArray(context?.profile?.experiences) ? context!.profile!.experiences! : [];
  const current = experiences.find(item => textOf(item?.role) && !item?.end_date) ?? experiences.find(item => textOf(item?.role));
  return textOf(current?.role) || textOf(context?.profile?.headline) || undefined;
}

/** The current Search Brief and roles of a person, as a direction hint. */
export async function readDirectionHint(admin: TalentAdminClient, userId: string) {
  const [brief, experiences] = await Promise.all([
    db(admin, "talent_contexts").select("content").eq("talent_id", userId).eq("collection", "brief").is("deleted_at", null).order("ref"),
    db(admin, "talent_experiences").select("role,end_date").eq("talent_id", userId)
      .order("start_date", { ascending: false, nullsFirst: false }).limit(20),
  ]);
  if (brief.error && experiences.error) throw new Error(brief.error.message);
  return directionHint({ search_brief: brief.data ?? [], profile: { experiences: experiences.data ?? [] } });
}

const FACT_BATCH = 40;
const FACT_TIMEOUT_MS = 15_000;

/** Team, leader, hiring, access facts and hiring signals at read time. A batch that fails or runs long
 * leaves its companies without those facts rather than failing the search. Without a title vector,
 * open roles are picked by the person's direction. */
export async function readCompanyFacts(admin: TalentAdminClient, ids: string[],
  options: { userId?: string; titleVector?: number[]; signal?: AbortSignal } = {}) {
  const facts = new Map<string, CompanyFacts>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return facts;
  const titleVector = options.titleVector ?? (options.userId
    ? await embedHint(await readDirectionHint(admin, options.userId).catch(() => undefined), options.signal) : undefined);
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += FACT_BATCH) batches.push(unique.slice(i, i + FACT_BATCH));
  await Promise.all(batches.map(async batch => {
    const signal = AbortSignal.any([AbortSignal.timeout(FACT_TIMEOUT_MS), ...(options.signal ? [options.signal] : [])]);
    const [rows, signals] = await Promise.allSettled([
      (async () => {
        const request = rpc(admin, "career_company_facts_v1", {
          p_workspaces: batch, p_talent: options.userId ?? null,
          p_titles: titleVector ? JSON.stringify(titleVector) : null,
        });
        const { data, error } = await (typeof request?.abortSignal === "function" ? request.abortSignal(signal) : request);
        if (error) throw new Error(error.message);
        return (data ?? []) as Row[];
      })(),
      readCompanySignals(admin, batch, undefined, signal),
    ]);
    if (rows.status === "fulfilled") for (const row of rows.value) facts.set(row.company_workspace_id, row.facts ?? {});
    if (signals.status === "fulfilled")
      for (const [id, value] of signals.value) if (value.checkedAt || value.total) facts.set(id, { ...facts.get(id), signals: value });
    for (const result of [rows, signals]) if (result.status === "rejected") {
      options.signal?.throwIfAborted();
      console.warn("[career/company-facts] batch skipped", String(result.reason));
    }
  }));
  return facts;
}

const sizeText = (size?: { start?: number; end?: number }) =>
  size?.start != null ? (size.end ? `${size.start}–${size.end} employees` : `${size.start}+ employees`) : "";

/** One compact line of decision facts for a company. The agent's line passes `now`; see formatCompanySignals. */
export function formatCompanyFacts(f: CompanyFacts | undefined, options: { now?: Date } = {}) {
  if (!f) return "";
  const parts: string[] = [];
  const t = f.team;
  if (t?.staff || t?.left12m) {
    const came = t.cameFrom?.length ? `; came from ${t.cameFrom.map(c => `${c.company} ${c.n}`).join(", ")}` : "";
    parts.push(`team ${t.staff ?? 0} (12 months +${t.joined12m ?? 0}/−${t.left12m ?? 0}${came}; as of ${t.asOf ?? "?"})`);
  }
  if (f.leaders?.length)
    parts.push(`leaders: ${f.leaders.map(l => [l.title, [l.school, l.before && `ex-${l.before}`].filter(Boolean).join(", ")].filter(Boolean).join(" (") + (l.school || l.before ? ")" : "")).join("; ")}`);
  const h = f.hiring;
  if (h) parts.push(h.openRoles
    ? `open roles ${h.openRoles}${h.relatedTitles?.length ? ` (closest: ${h.relatedTitles.join("; ")})` : ""}`
    : `no open role indexed${h.careersUrl ? `; careers page ${h.careersUrl}` : ""}`);
  const signals = formatCompanySignals(f.signals, options);
  if (signals) parts.push(signals);
  if (f.reach?.sameSchool || f.reach?.sameCompany)
    parts.push(`staff from the candidate's schools ${f.reach.sameSchool ?? 0}, from their past companies ${f.reach.sameCompany ?? 0}`);
  const p = f.profile;
  const foundedAgo = p?.founded && options.now ? formatLlmYearsAgo(p.founded, options.now) : "";
  const profile = [sizeText(p?.size), p?.founded ? `founded ${p.founded}${foundedAgo ? ` (${foundedAgo})` : ""}` : "", p?.location ?? ""].filter(Boolean).join(", ");
  if (profile) parts.push(profile);
  return parts.join(" · ");
}

// ── Retrieval index ─────────────────────────────────────────────────────────

const OPEN_ROLE_FILTER = (q: any) => q.eq("source_type", "external")
  .or("source_provider.is.null,source_provider.neq.user_submitted").not("is_expired", "is", true)
  .not("status", "in", "(expired,closed,inactive,archived,ended)");

/** Builds or refreshes the search rows of these companies (all public companies when ids is omitted, paged). */
export async function indexCompanies(admin: TalentAdminClient, options: { ids?: string[]; after?: string; limit?: number; signal?: AbortSignal } = {}) {
  let query = db(admin, "company_workspace").select("company_workspace_id,company_name,company_description,company_db_id")
    .eq("is_internal", false).order("company_workspace_id").limit(options.limit ?? 200);
  if (options.ids?.length) query = query.in("company_workspace_id", options.ids);
  if (options.after) query = query.gt("company_workspace_id", options.after);
  const { data: workspaces, error } = await query;
  if (error) throw new Error(error.message);
  const rows: Row[] = workspaces ?? [];
  if (!rows.length) return { indexed: 0, last: null as string | null };
  const ids = rows.map(r => r.company_workspace_id);
  const dbIds = rows.map(r => r.company_db_id).filter((id: unknown) => id != null);
  const [summaries, directory, roles, existing] = await Promise.all([
    db(admin, "company_datas").select("company_workspace_id,content").in("company_workspace_id", ids).eq("label", "summary"),
    dbIds.length ? db(admin, "company_db").select("id,short_description,specialities").in("id", dbIds) : { data: [] },
    OPEN_ROLE_FILTER(db(admin, "company_roles").select("company_workspace_id,name,posted_at").in("company_workspace_id", ids))
      .order("posted_at", { ascending: false, nullsFirst: false }).limit(ids.length * 15),
    db(admin, "career_company_search").select("company_workspace_id,body_hash").in("company_workspace_id", ids),
  ]);
  const summaryOf = new Map((summaries.data ?? []).map((r: Row) => [r.company_workspace_id, String(r.content ?? "")]));
  const dirOf = new Map((directory.data ?? []).map((r: Row) => [r.id, r]));
  const titlesOf = new Map<string, string[]>();
  for (const r of roles.data ?? []) {
    const list = titlesOf.get(r.company_workspace_id) ?? [];
    if (list.length < 15 && !list.includes(r.name)) list.push(r.name);
    titlesOf.set(r.company_workspace_id, list);
  }
  const hashOf = new Map((existing.data ?? []).map((r: Row) => [r.company_workspace_id, r.body_hash]));
  const pending = rows.map(r => {
    const d = dirOf.get(r.company_db_id) as Row | undefined;
    const body = [
      r.company_name,
      r.company_description,
      (summaryOf.get(r.company_workspace_id) as string | undefined)?.split(/\n\s*\n/, 1)[0]?.slice(0, 1200),
      d?.short_description, d?.specialities,
      titlesOf.get(r.company_workspace_id)?.length ? `Open roles: ${titlesOf.get(r.company_workspace_id)!.join("; ")}` : "",
    ].map(v => String(v ?? "").trim()).filter(Boolean).join("\n").slice(0, 6000);
    return { id: r.company_workspace_id, body, hash: createHash("md5").update(body).digest("hex") };
  }).filter(p => p.body && hashOf.get(p.id) !== p.hash);
  for (let i = 0; i < pending.length; i += 100) {
    options.signal?.throwIfAborted();
    const part = pending.slice(i, i + 100);
    const vectors = await embedTitles(part.map(p => p.body), options.signal);
    const { error: writeError } = await db(admin, "career_company_search").upsert(part.map((p, j) => ({
      company_workspace_id: p.id, body: p.body, body_hash: p.hash, embedding: JSON.stringify(vectors[j]),
      embedding_model: EMBEDDING_MODEL, updated_at: new Date().toISOString(),
    })));
    if (writeError) throw new Error(writeError.message);
  }
  return { indexed: pending.length, last: ids[ids.length - 1] as string };
}

const SIZE_BOUNDS: Record<string, [number | null, number | null]> = {
  startup: [null, 50], scaleup: [51, 1000], large: [1001, null],
};

/** Companies whose description, research and open roles are closest to the text. */
export async function searchCompaniesByText(admin: TalentAdminClient, about: string,
  options: { places?: string[]; size?: string; exclude?: string[]; limit?: number; signal?: AbortSignal } = {}) {
  const [vector] = await embedTitles([about.slice(0, 2000)], options.signal);
  return nearestCompanies(admin, vector, options);
}

async function nearestCompanies(admin: TalentAdminClient, vector: number[],
  options: { places?: string[]; size?: string; exclude?: string[]; limit?: number }) {
  const [min, max] = SIZE_BOUNDS[options.size ?? ""] ?? [null, null];
  const { data, error } = await rpc(admin, "career_search_companies_v1", {
    p_embedding: JSON.stringify(vector), p_limit: options.limit ?? 150, p_exclude: options.exclude ?? [],
    p_places: options.places?.length ? options.places : null, p_min_size: min, p_max_size: max,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: Row) => String(r.company_workspace_id));
}

/** Companies like the seeds: close in what they do, or sharing many people with them. */
export async function similarCompanies(admin: TalentAdminClient, seeds: string[],
  options: { places?: string[]; size?: string; exclude?: string[]; limit?: number } = {}) {
  const limit = options.limit ?? 60;
  const exclude = [...new Set([...(options.exclude ?? []), ...seeds])];
  const { data } = await db(admin, "career_company_search").select("embedding").in("company_workspace_id", seeds);
  const vectors: number[][] = (data ?? []).map((r: Row) => typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding)
    .filter((v: unknown) => Array.isArray(v));
  const [byText, byPeople] = await Promise.all([
    vectors.length
      ? nearestCompanies(admin, vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length),
        { ...options, exclude, limit })
      : Promise.resolve([] as string[]),
    rpc(admin, "career_company_coflow_v1", { p_workspaces: seeds, p_limit: limit })
      .then(({ data: rows, error }: Row) => error ? [] : (rows ?? []).map((r: Row) => String(r.company_workspace_id))),
  ]);
  // Interleave the two signals so neither crowds out the other.
  const merged: string[] = [];
  for (let i = 0; merged.length < limit && (i < byText.length || i < byPeople.length); i++)
    for (const id of [byText[i], byPeople[i]]) if (id && !exclude.includes(id) && !merged.includes(id)) merged.push(id);
  return merged.slice(0, limit);
}
