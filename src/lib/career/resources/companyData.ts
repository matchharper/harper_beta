import { z } from "zod";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import { throwIfToolControlError } from "@/lib/llm/toolError";
import { runWebSearch } from "@/lib/tools/webSearch";
import { normalizeOpenUrl } from "@/lib/tools/documentCache";
import { officialCompanySchema } from "../companies/publicTarget";
import { HIRING_SIGNAL_LABEL } from "../companies/signals";
import { resourceDb, databaseError, fingerprint, resourceRefSchema, type ResourceContext, type ResourceRef } from "./types";

export type OfficialCompany = z.infer<typeof officialCompanySchema>;
type CompanyTarget = ResourceRef | OfficialCompany;
const resolutionSchema = z.object({
  targetRef: z.union([resourceRefSchema, officialCompanySchema]),
  status: z.enum(["found", "missing", "unavailable", "ambiguous"]),
  name: z.string().nullish(), website: z.string().nullish(), linkedinUrl: z.string().nullish(), linkedinCompanyId: z.string().nullish(),
  companyRef: resourceRefSchema.optional(), identity: officialCompanySchema.optional(),
  candidates: z.array(z.object({ companyRef: resourceRefSchema, name: z.string().nullish(), website: z.string().nullish(), linkedinUrl: z.string().nullish() })).optional(),
});
const datumSchema = z.object({
  dataRef: resourceRefSchema, label: z.string(), content: z.string(), checkedAt: z.string().nullish(),
  sourceRefs: z.array(resourceRefSchema),
  sources: z.array(z.object({ ref: resourceRefSchema, url: z.string(), title: z.string().nullish() })).optional(),
});
const labelSchema = z.object({ label: z.string(), count: z.number(), checkedAt: z.string().nullish() });
const bundleSchema = z.object({
  companyRef: resourceRefSchema, requestedId: z.string().optional(), name: z.string().nullish(), website: z.string().nullish(),
  labels: z.array(labelSchema),
  summary: datumSchema.nullish(), items: z.array(datumSchema), total: z.number(),
});
type Resolution = z.infer<typeof resolutionSchema>;
export type CompanyDatum = z.infer<typeof datumSchema>;
export type CompanyLabel = z.infer<typeof labelSchema>;
export interface CompanyProjection {
  companyRef: ResourceRef;
  name: string;
  summary: CompanyDatum | null;
  labels: CompanyLabel[];
  items: CompanyDatum[];
  nextLabelOffset: number | null;
  state: "current" | "missing" | "stale";
  refreshNote?: string;
}
export type CompanyReadOptions = {
  mode: "detail" | "list";
  labels?: string[];
  labelOffset?: number;
  refresh?: boolean;
  signal?: AbortSignal;
  search?: typeof runWebSearch;
  /** Runs a refresh of a stale overview after the response. Defaults to Next.js after(). */
  defer?: (task: () => Promise<unknown>) => void;
};
const PAGE_SIZE = 50;
const companyKinds = new Set(["company", "company_workspace", "posting", "role", "opportunity"]);
export const targetKey = (target: CompanyTarget) => "kind" in target ? target.kind + ":" + target.id : fingerprint(target);
const refText = (ref: ResourceRef) => ref.kind + ":" + ref.id + (ref.revision ? " revision " + ref.revision : "");
const checkedText = (value?: string | null) => value ? formatLlmDateTime(value) : "";

export function companyRpcMissing(error: { code?: string; message: string } | null, name: string) {
  return Boolean(error && ["PGRST202", "42883"].includes(error.code ?? "") && error.message.includes(name));
}

/** Each id is the company workspace that holds the company's shared research. */
export async function readCompanyBundles(admin: ResourceContext["admin"], workspaceIds: string[], labels: string[] | null, offset = 0) {
  if (!workspaceIds.length) return [];
  const response = await resourceDb(admin).rpc("career_read_company_datas_v2", {
    p_workspaces: [...new Set(workspaceIds)], p_labels: labels, p_offset: offset, p_limit: PAGE_SIZE,
  });
  if (companyRpcMissing(response.error, "career_read_company_datas_v2")) return [];
  databaseError(response.error);
  return z.array(bundleSchema).parse(response.data);
}

const topicPage = z.object({
  companyId: z.string(), items: z.array(datumSchema), total: z.number(),
  observations: z.array(z.object({
    id: z.string(), title: z.string().nullish(), source_url: z.string(),
    observed_at: z.string(), published_at: z.string().nullish(), source_fetched_at: z.string().nullish(),
    coverage: z.string().nullish(), content: z.string().nullish(),
  })),
});

export async function readCompanyTopicEvidence(
  admin: ResourceContext["admin"], workspaceIds: string[], query: string, offset: number, includeSources: boolean
) {
  const pages = new Map<string, z.infer<typeof topicPage>>();
  if (!workspaceIds.length) return pages;
  const name = "career_read_company_topic_evidence_v2";
  const response = await resourceDb(admin).rpc(name, {
    p_workspaces: [...new Set(workspaceIds)], p_query: query, p_offset: offset, p_limit: PAGE_SIZE,
    p_include_sources: includeSources,
  });
  if (companyRpcMissing(response.error, name)) return pages;
  databaseError(response.error);
  for (const page of z.array(topicPage).parse(response.data)) pages.set(page.companyId, page);
  return pages;
}

function summaryState(summary: CompanyDatum | null): CompanyProjection["state"] {
  if (!summary) return "missing";
  const configured = Number(process.env.CAREER_COMPANY_SUMMARY_MAX_AGE_DAYS ?? 30);
  const days = Number.isFinite(configured) && configured > 0 ? configured : 30;
  const checked = summary.checkedAt ? Date.parse(summary.checkedAt) : NaN;
  return checked >= Date.now() - days * 86400000 ? "current" : "stale";
}

/** Career identifies a company by its workspace. A directory company (company_db)
 * gets its workspace when Career first returns it, with the same rule as a company write. */
export async function companyWorkspaceRefs(admin: ResourceContext["admin"], refs: ResourceRef[]) {
  const directory = [...new Set(refs.filter(ref => ref.kind === "company").map(ref => ref.id))];
  const mapped = new Map<string, ResourceRef>();
  if (!directory.length) return mapped;
  const response = await resourceDb(admin).rpc("career_company_workspaces_for_directory_v1", {
    p_companies: directory.map(Number),
  });
  databaseError(response.error);
  for (const row of z.array(z.object({ company_id: z.coerce.string(), company_workspace_id: z.string().uuid() })).parse(response.data))
    mapped.set(row.company_id, { kind: "company_workspace", id: row.company_workspace_id });
  return mapped;
}

async function resolveTargets(context: ResourceContext, targets: CompanyTarget[]) {
  const response = await resourceDb(context.admin).rpc("career_read_public_company_targets_v1", {
    p_user: context.userId, p_refs: targets,
  });
  if (companyRpcMissing(response.error, "career_read_public_company_targets_v1")) return null;
  databaseError(response.error);
  const resolutions = z.array(resolutionSchema).parse(response.data);
  const workspaces = await companyWorkspaceRefs(context.admin, resolutions.flatMap(entry =>
    [entry.companyRef, ...(entry.candidates ?? []).map(candidate => candidate.companyRef)].filter((ref): ref is ResourceRef => Boolean(ref))));
  if (!workspaces.size) return resolutions;
  const workspaceRef = (ref: ResourceRef) => ref.kind === "company" ? workspaces.get(ref.id) ?? ref : ref;
  return resolutions.map(entry => ({
    ...entry,
    ...(entry.companyRef ? { companyRef: workspaceRef(entry.companyRef) } : {}),
    ...(entry.candidates ? { candidates: entry.candidates.map(candidate => ({ ...candidate, companyRef: workspaceRef(candidate.companyRef) })) } : {}),
  }));
}

const summaryInstruction = "Write a reusable Markdown briefing on this specific company, beginning with a standalone overview paragraph. Cover its products, founders and publicly reported financing where the sources establish them. Attribute dated facts to their original sources with Markdown links. Distinguish published facts from unknowns. Do not include any candidate, individual fit or hiring speculation.";

/** Korean and English terms reach both a Korean company's local coverage and international sources. */
export function companySummaryQuery(name: string, website?: string) {
  return [name, website, "회사 정보 투자 창업자", "company overview funding founders"].filter(Boolean).join(" ");
}

/** The provider numbers its citations [n] in the order of its citation list.
 * Link each marker so readers and screens can open the source of each claim. */
export function linkCitationMarkers(content: string, citationUrls: string[]) {
  return content.replace(/\[(\d+)\](?!\()/g, (marker, number) => {
    const url = citationUrls[Number(number) - 1];
    return url ? `[${number}](${url})` : marker;
  });
}

function deferAfterResponse(task: () => Promise<unknown>) {
  const run = () => task().catch(error => console.warn("[career/company-summary] background refresh failed", error));
  import("next/server").then(({ after }) => after(run)).catch(() => void run());
}

/** Searches once, saves the overview with every citation that maps to a captured
 * public source, and returns a short note only when nothing could be saved. */
async function refreshCompanySummary(context: ResourceContext, company: Resolution, summary: CompanyDatum | null, options: CompanyReadOptions) {
  const { signal, search = runWebSearch } = options;
  const name = company.name || company.identity?.name;
  const website = company.website || company.identity?.officialWebsite || undefined;
  const target = company.companyRef ?? company.identity;
  if (!name || !target) return "The public employer could not be resolved.";
  const key = company.companyRef ? company.companyRef.kind + ":" + company.companyRef.id : fingerprint(["name", name.trim().toLowerCase()]);
  const owner = crypto.randomUUID(), db = resourceDb(context.admin);
  const lease = await db.rpc("career_claim_company_summary_v1", { p_key: key, p_owner: owner });
  if (companyRpcMissing(lease.error, "career_claim_company_summary_v1")) return "Company summary refresh is unavailable.";
  databaseError(lease.error);
  if (!lease.data) {
    // Another reader is already searching this company. Wait for that one
    // provider call instead of repeating it; its result is read afterwards.
    for (;;) {
      signal?.throwIfAborted();
      const pending = await db.from("career_company_summary_leases").select("expires_at").eq("company_key", key).maybeSingle();
      databaseError(pending.error);
      if (!pending.data || Date.parse(pending.data.expires_at) <= Date.now()) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return undefined;
  }
  let finished = false;
  const finish = async (content: string | null, refs: ResourceRef[]) => {
    const result = await db.rpc("career_finish_company_summary_v1", {
      p_key: key, p_owner: owner, p_target: target, p_content: content, p_source_refs: refs, p_data_ref: summary?.dataRef ?? null,
    });
    databaseError(result.error);
    finished = true;
    return result.data;
  };
  try {
    signal?.throwIfAborted();
    if (company.companyRef?.kind === "company_workspace") {
      const [latest] = await readCompanyBundles(context.admin, [company.companyRef.id], null);
      if (latest && summaryState(latest.summary ?? null) === "current") return undefined;
    }
    const response = await search({
      admin: context.admin, query: companySummaryQuery(name, website),
      structuredText: summaryInstruction, logging: { attribution: { source: "career/company-summary" } },
    });
    signal?.throwIfAborted();
    const raw = response.structuredContent ?? response.structuredText;
    const content = raw && linkCitationMarkers(raw, response.structuredSourceUrls ?? []);
    const refsByUrl = new Map(response.results.filter(hit => hit.resourceRef).map(hit => [normalizeOpenUrl(hit.url), hit.resourceRef!]));
    // A citation outside the captured results stays as a link in the text but
    // cannot be a stored source version; the captured ones support the entry.
    const refs = [...new Map((response.structuredSourceUrls ?? []).flatMap(url => {
      const ref = refsByUrl.get(normalizeOpenUrl(url));
      return ref?.revision ? [[ref.revision, { kind: "observation", id: ref.revision }] as const] : [];
    })).values()];
    if (!content || !refs.length)
      return "The search did not supply a summary grounded in captured public sources.";
    await finish(content, refs);
    return undefined;
  } catch (error) {
    signal?.throwIfAborted();
    // This is optional public enrichment: keep the original Role/opportunity and its last checked summary.
    return "The company summary could not be refreshed during this read.";
  } finally {
    if (!finished) await finish(null, []);
  }
}

/**
 * Prepares one company's shared overview before it is judged: refreshes it when
 * it is missing or past the cache window, and waits for the result.
 * current: nothing to do. refreshed: current now, by this or a concurrent reader.
 * failed: the provider gave no grounded overview. unavailable: not a public company.
 */
export async function refreshCompanySummaryIfDue(context: ResourceContext, workspaceId: string,
  options: Pick<CompanyReadOptions, "signal" | "search"> = {}) {
  const resolved = await resolveTargets(context, [{ kind: "company_workspace", id: workspaceId }]);
  const entry = resolved?.[0];
  if (!entry || entry.status !== "found" || entry.companyRef?.kind !== "company_workspace") return "unavailable" as const;
  const [bundle] = await readCompanyBundles(context.admin, [entry.companyRef.id], null);
  if (summaryState(bundle?.summary ?? null) === "current") return "current" as const;
  const note = await refreshCompanySummary(context, entry, bundle?.summary ?? null, { mode: "detail", ...options });
  return note ? "failed" as const : "refreshed" as const;
}

/** The saved overview shown on company and opportunity screens, keyed by the given workspace. */
export async function readCompanySummaries(admin: ResourceContext["admin"], workspaceIds: string[]) {
  const summaries = new Map<string, { markdown: string; checkedAt: string | null }>();
  for (const bundle of await readCompanyBundles(admin, workspaceIds, null)) {
    if (bundle.summary && bundle.requestedId)
      summaries.set(bundle.requestedId, { markdown: bundle.summary.content, checkedAt: bundle.summary.checkedAt ?? null });
  }
  return summaries;
}

export async function readCompanyDetails(context: ResourceContext, targets: CompanyTarget[], options: CompanyReadOptions) {
  const relevant = [...new Map(targets.filter(target => !("kind" in target) || companyKinds.has(target.kind))
    .map(target => [targetKey(target), target])).values()];
  const output = new Map<string, CompanyProjection>();
  if (!relevant.length) return { projections: output, resolutions: [] as Resolution[] };
  const initial = await resolveTargets(context, relevant);
  if (initial === null) return { projections: output, resolutions: [], unavailable: true };
  let resolved = initial;
  const homes = () => resolved.flatMap(entry => entry.companyRef?.kind === "company_workspace" ? [entry.companyRef.id] : []);
  const readBundles = async () => new Map((await readCompanyBundles(context.admin, homes(),
    options.labels?.length ? options.labels : null, options.labelOffset ?? 0))
      .map(bundle => [bundle.companyRef.id, bundle]));
  let bundles = await readBundles();
  let refreshNote: string | undefined, refreshed = false;
  if (options.mode === "detail" && options.refresh && resolved.length === 1) {
    const entry = resolved[0], bundle = entry.companyRef ? bundles.get(entry.companyRef.id) : undefined;
    const state = summaryState(bundle?.summary ?? null);
    // A company Harper has never recorded is researched blind only with an
    // official link; a bare name could belong to several companies.
    const identified = entry.status === "found" || entry.status === "missing" && Boolean(entry.identity &&
      (entry.identity.officialWebsite || entry.identity.linkedinUrl || entry.identity.linkedinCompanyId));
    if (identified && state !== "current") {
      if (state === "stale") {
        // The saved overview answers now; a newer one is ready for the next read.
        const refresh = () => refreshCompanySummary(context, entry, bundle?.summary ?? null, { ...options, signal: undefined });
        (options.defer ?? deferAfterResponse)(refresh);
        refreshNote = "A newer overview is being prepared in the background; this one is from its last check.";
      } else {
        refreshNote = await refreshCompanySummary(context, entry, null, options);
        refreshed = true;
        resolved = await resolveTargets(context, relevant) ?? [];
        bundles = await readBundles();
      }
    }
  }
  for (const entry of resolved) {
    if (!entry.companyRef) continue;
    const bundle = bundles.get(entry.companyRef.id);
    if (!bundle) continue;
    const { companyRef, labels, items } = bundle;
    const summary = bundle.summary && options.mode === "list"
      ? { ...bundle.summary, content: bundle.summary.content.trim().split(/\n\s*\n/, 1)[0] } : bundle.summary ?? null;
    const end = (options.labelOffset ?? 0) + items.length;
    output.set(targetKey(entry.targetRef), {
      companyRef, name: bundle.name || entry.name || "", labels, summary, items, state: summaryState(summary), refreshNote,
      nextLabelOffset: end < bundle.total ? end : null,
    });
  }
  return { projections: output, resolutions: resolved, refreshNote, refreshed };
}

export async function readCompanyProjections(context: ResourceContext, targets: CompanyTarget[], options: CompanyReadOptions) {
  return (await readCompanyDetails(context, targets, options)).projections;
}

/** Legacy recommendations and scoring still have usable role data if optional
 * company enrichment is unavailable. Never infer an employer after a failed lookup. */
export async function readRoleCompanyList(context: ResourceContext, roleIds: string[]) {
  try {
    const projections = await readCompanyProjections(context, roleIds.map(id => ({ kind: "role", id })), { mode: "list" });
    return { projections, unavailable: false };
  } catch (error) {
    throwIfToolControlError(error);
    return { projections: new Map<string, CompanyProjection>(), unavailable: true };
  }
}

const labelText = (label: CompanyLabel) => label.label + " (" + label.count + (label.count === 1 ? " entry" : " entries") +
  (label.checkedAt ? ", last checked " + checkedText(label.checkedAt) : "") + ")";

/** Overview and saved topics for a model that cannot call tools. Hiring signals reach it as dated
 * lines of their own (companies/signals.ts), not as a topic name. */
export function formatCompanyOverview(company: CompanyProjection) {
  const topics = company.labels.filter(label => label.label !== "summary" && label.label !== HIRING_SIGNAL_LABEL);
  if (!company.summary && !topics.length) return "";
  return [
    company.summary ? company.summary.content + "\n(Checked " + checkedText(company.summary.checkedAt) + ")" : "",
    topics.length ? "Other saved company topics: " + topics.map(labelText).join(", ") : "",
  ].filter(Boolean).join("\n");
}

export function formatCompanyProjection(company: CompanyProjection, includeBody = true) {
  if (!includeBody) return "Public employer: " + refText(company.companyRef);
  const datum = (value: CompanyDatum) => [
    value.label + " — " + refText(value.dataRef) + (value.checkedAt ? " (checked " + checkedText(value.checkedAt) + ")" : ""),
    value.content, ...value.sourceRefs.map(ref => {
      const source = value.sources?.find(item => item.ref.id === ref.id);
      return "Evidence: " + refText(ref) + (source ? " — " + [source.title, source.url].filter(Boolean).join(" · ") : "");
    }),
  ].filter(Boolean).join("\n");
  return [
    "Public employer: " + company.name + " — " + refText(company.companyRef),
    company.summary ? datum(company.summary) : "No saved company summary.",
    company.state === "stale" ? "Summary last checked outside the cache window." : "", company.refreshNote,
    "Saved company labels: " + (company.labels.map(labelText).join(", ") || "none"),
    company.labels.some(label => label.label !== "summary") ? "Read saved label bodies with read_companies, using topics from the list above." : "",
    ...company.items.filter(item => item.dataRef.id !== company.summary?.dataRef.id).map(datum),
    company.nextLabelOffset !== null ? "More company data: use labelOffset " + company.nextLabelOffset + "." : "",
  ].filter(Boolean).join("\n");
}

/** Keep each Role/opportunity's exact company link and describe each distinct employer once. */
export function formatCompanyTargets(projections: ReadonlyMap<string, CompanyProjection>) {
  const seen = new Set<string>();
  return [...projections].map(([key, company]) => {
    const include = !seen.has(company.companyRef.id);
    seen.add(company.companyRef.id);
    return key + "\n" + formatCompanyProjection(company, include);
  }).join("\n\n");
}
