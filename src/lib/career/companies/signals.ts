import { z } from "zod";
import { formatLlmDateTime, formatLlmElapsed } from "@/lib/llm/promptDateTime";
import { runWebSearch, type WebSearchResult } from "@/lib/tools/webSearch";
import { normalizeOpenUrl } from "@/lib/tools/documentCache";
import {
  databaseError,
  fingerprint,
  requestUuid,
  resourceDb,
  resourceRefSchema,
  type ResourceContext,
} from "../resources/types";

/**
 * Hiring signals: dated public sources saying a company is, or is not, hiring
 * people (a team being built, an office or market entry, funding with hiring
 * plans, a freeze, layoffs). Each source is one shared company_datas record on
 * the company's workspace, read by every Career user with its date. Nothing
 * learned from a user's mail or conversation is written here.
 * (docs/career-agent-harness-ko.md 4.3, 4.4; docs/career-opportunity-signals-design-ko.md 4.2)
 */
export { HIRING_SIGNAL_LABEL } from "./labels";
import { HIRING_SIGNAL_LABEL } from "./labels";
/** A company is looked at again once its last check is this old. A starting value (harness 4.4). */
export const SIGNAL_RECHECK_DAYS = 14;
/** The first check of a company reaches back this far; later checks start one recheck period before the last one. */
export const SIGNAL_FIRST_LOOKBACK_DAYS = 180;
/** Signals shown with a company's facts: the latest ones and the count of the rest. All of them, with sources,
 * are read as the company's "hiring signal" topic. */
export const SIGNALS_SHOWN_WITH_FACTS = 3;
/** The structured answer holds one sentence per kept result plus reasoning. The Anthropic fallback
 * would otherwise use its small default. */
const SIGNAL_EXTRACTION_MAX_OUTPUT_TOKENS = 8_000;
const DAY_MS = 86_400_000;

const signalsSchema = z.object({
  requestedId: z.string(),
  companyRef: resourceRefSchema,
  name: z.string().nullish(),
  website: z.string().nullish(),
  linkedinUrl: z.string().nullish(),
  checkedAt: z.string().nullish(),
  total: z.coerce.number(),
  items: z.array(z.object({
    dataRef: resourceRefSchema,
    date: z.string().nullish(),
    content: z.string(),
    url: z.string().nullish(),
  })),
});
export type CompanySignals = {
  /** The workspace that holds the company's shared research. */
  companyId: string;
  name: string;
  website: string | null;
  linkedinUrl: string | null;
  checkedAt: string | null;
  total: number;
  items: { date: string | null; content: string; url: string | null }[];
};

/** Each requested company's signal record: when it was last checked, how many signals, the latest few. */
export async function readCompanySignals(admin: ResourceContext["admin"], workspaceIds: readonly string[],
  limit = SIGNALS_SHOWN_WITH_FACTS, signal?: AbortSignal) {
  const result = new Map<string, CompanySignals>();
  const ids = [...new Set(workspaceIds.filter(Boolean))];
  if (!ids.length) return result;
  const request = resourceDb(admin).rpc("career_company_signals_v1", { p_workspaces: ids, p_limit: limit }) as unknown as
    PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & { abortSignal?: (signal: AbortSignal) => unknown };
  const response = await (signal && typeof request.abortSignal === "function"
    ? request.abortSignal(signal) as typeof request : request);
  databaseError(response.error);
  for (const row of z.array(signalsSchema).parse(response.data ?? [])) {
    result.set(row.requestedId, {
      companyId: row.companyRef.id, name: row.name ?? "", website: row.website ?? null,
      linkedinUrl: row.linkedinUrl ?? null, checkedAt: row.checkedAt ?? null, total: row.total,
      items: row.items.map(item => ({ date: item.date ?? null, content: item.content, url: item.url ?? null })),
    });
  }
  return result;
}

/** Never checked, or last checked longer ago than the recheck period. Unknown counts as due. */
export function signalsDue(signals: Pick<CompanySignals, "checkedAt"> | undefined, now = Date.now()) {
  const checked = signals?.checkedAt ? Date.parse(signals.checkedAt) : NaN;
  return !(checked >= now - SIGNAL_RECHECK_DAYS * DAY_MS);
}

const day = (value: string) => formatLlmDateTime(value).slice(0, 10);
const site = (url: string | null) => {
  try { return url ? new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "") : ""; }
  catch { return ""; }
};

/** One line: each signal with its date and source site, latest first, and when the company was last checked.
 * The evaluator's line keeps absolute dates only, since it is part of its input fingerprint. The agent's line
 * (`now` given) adds how long ago each signal was, so the agent does not work out the year itself. */
export function formatCompanySignals(signals: CompanySignals | undefined, options: { now?: Date } = {}) {
  if (!signals || (!signals.checkedAt && !signals.total)) return "";
  const asOf = signals.checkedAt ? ` as of ${day(signals.checkedAt)}` : "";
  if (!signals.total) return `no public hiring signal found${asOf}`;
  const earlier = signals.total - signals.items.length;
  const dated = (date: string) => {
    const ago = options.now ? formatLlmElapsed(date, options.now) : "";
    return ago ? `${day(date)} (${ago})` : day(date);
  };
  return `hiring signals${asOf}: ` + [
    ...signals.items.map(item => [item.date ? dated(item.date) : "undated", item.content.replace(/\s+/g, " ").trim(),
      site(item.url) ? `(${site(item.url)})` : ""].filter(Boolean).join(" ")),
    ...(earlier > 0 ? [`+${earlier} earlier`] : []),
  ].join("; ");
}

// ── Checking a company ────────────────────────────────────────────────────────

/** One news search per company. */
const SIGNAL_SEARCH_TERMS = "채용 팀 확장 지사 투자 구조조정 hiring team expansion new office funding layoffs";

export type SignalSource = { number: number; title: string; url: string; publishedDate?: string; highlights: string[] };
export type FoundSignal = { result: number; date: string; content: string };
export type SignalExtractor = (input: { company: { name: string; website: string | null; linkedinUrl: string | null };
  sources: SignalSource[]; signal?: AbortSignal }) => Promise<FoundSignal[]>;

const EXTRACTION_INSTRUCTION = [
  "You read web search results about one company and keep the ones that are hiring signals.",
  "A hiring signal is a dated public source saying this company is, or is not, hiring people: for example a team being built or grown, a new office or market entry with hiring, funding with hiring plans, a hiring freeze, or layoffs.",
  "Harper saves each kept result as a shared record and shows it with its date to every job seeker who considers this company, so a record states only what its source says about this company.",
  "Leave out results about another organization, results that say nothing about this company's hiring, and results whose publication date you cannot tell.",
  "For each kept result give its number, the date it was published (YYYY-MM-DD: the date listed with the result, otherwise a date the text gives for the post or article), and one sentence on what it says about the company's hiring, in the language of the result.",
].join("\n");
const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: { result: { type: "integer" }, date: { type: "string" }, content: { type: "string" } },
        required: ["result", "date", "content"],
        additionalProperties: false,
      },
    },
  },
  required: ["signals"],
  additionalProperties: false,
};

export function formatSignalSources(company: { name: string; website: string | null; linkedinUrl: string | null }, sources: SignalSource[]) {
  return [
    `Company: ${[company.name, company.website, company.linkedinUrl].filter(Boolean).join(" · ")}`,
    ...sources.map(source => [
      `[${source.number}] ${source.publishedDate ? `published ${day(source.publishedDate)}` : "publication date not given"} · ${source.title}`,
      source.url,
      ...source.highlights.map(text => text.replace(/\s+/g, " ").trim()).filter(Boolean),
    ].join("\n")),
  ].join("\n\n");
}

/** Keeps one signal per listed result, with a calendar date that is not after today. The date orders a
 * company's signals for every reader, so a malformed or future one would show as its latest. */
export function parseFoundSignals(value: unknown, sources: number, now = Date.now()): FoundSignal[] {
  const parsed = z.object({ signals: z.array(z.object({ result: z.number().int(), date: z.string(), content: z.string() })) }).safeParse(value);
  if (!parsed.success) return [];
  const kept = new Map<number, FoundSignal>();
  for (const found of parsed.data.signals) {
    const date = found.date.trim(), content = found.content.replace(/\s+/g, " ").trim();
    const time = /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
    const valid = Number.isFinite(time) && new Date(time).toISOString().startsWith(date) && time <= now + DAY_MS;
    if (valid && content && found.result >= 1 && found.result <= sources && !kept.has(found.result))
      kept.set(found.result, { result: found.result, date, content });
  }
  return [...kept.values()];
}

const extractWithModel: SignalExtractor = async ({ company, sources, signal }) => {
  const { createChatCompletionWithFallback } = await import("@/lib/llm/llm");
  const { CLAUDE_MODEL, GPT_6_LUNA_MODEL } = await import("@/lib/llm/modelConfig");
  const { response } = await createChatCompletionWithFallback({
    model: GPT_6_LUNA_MODEL,
    fallbackModel: CLAUDE_MODEL,
    openAIResponses: { reasoningEffort: "low" },
    buildRequest: () => ({
      max_tokens: SIGNAL_EXTRACTION_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: EXTRACTION_INSTRUCTION },
        { role: "user", content: formatSignalSources(company, sources) },
      ],
    }),
    structuredOutput: { name: "hiring_signals", schema: EXTRACTION_SCHEMA },
    debugLabel: "career/company-hiring-signals",
    signal,
  });
  const content = response?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content
    : Array.isArray(content) ? content.map((part: { text?: string }) => part?.text ?? "").join("") : "";
  return parseFoundSignals(JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")), sources.length);
};

/** One record per company and source page: a later check of the same page finds the record it wrote. */
export const signalDataId = (companyId: string, url: string) =>
  requestUuid(fingerprint([HIRING_SIGNAL_LABEL, companyId, normalizeOpenUrl(url)]));

export type SignalCheckOptions = {
  signal?: AbortSignal;
  search?: typeof runWebSearch;
  extract?: SignalExtractor;
  now?: () => number;
};
export type SignalCheckResult = { status: "checked" | "current" | "waited" | "failed" | "unavailable"; saved: number };

async function waitForLease(db: ReturnType<typeof resourceDb>, key: string, signal?: AbortSignal) {
  for (;;) {
    signal?.throwIfAborted();
    const pending = await db.from("career_company_summary_leases").select("expires_at").eq("company_key", key).maybeSingle();
    databaseError(pending.error);
    if (!pending.data || Date.parse(pending.data.expires_at) <= Date.now()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Looks for a company's hiring signals on the web when its last check is older
 * than the recheck period, saves each one found with its source, and records the
 * check even when nothing was found. One request at a time per company: another
 * request's check is waited for instead of repeated.
 */
export async function checkCompanySignals(context: ResourceContext, workspaceId: string,
  options: SignalCheckOptions = {}): Promise<SignalCheckResult> {
  const { signal, search = runWebSearch, extract = extractWithModel, now = Date.now } = options;
  const db = resourceDb(context.admin);
  const readState = async () => (await readCompanySignals(context.admin, [workspaceId], 0)).get(workspaceId);
  const before = await readState();
  if (!before) return { status: "unavailable", saved: 0 };
  if (!signalsDue(before, now())) return { status: "current", saved: 0 };
  const key = `${HIRING_SIGNAL_LABEL}:company_workspace:${before.companyId}`, owner = crypto.randomUUID();
  const lease = await db.rpc("career_claim_company_summary_v1", { p_key: key, p_owner: owner });
  databaseError(lease.error);
  if (!lease.data) {
    await waitForLease(db, key, signal);
    return { status: "waited", saved: 0 };
  }
  let checked = false, saved = 0, home = before.companyId;
  try {
    // Another request may have finished this company between the first read and the lease.
    const state = await readState();
    if (!state || !signalsDue(state, now())) return { status: "current", saved: 0 };
    home = state.companyId;
    signal?.throwIfAborted();
    const lastChecked = state.checkedAt ? Date.parse(state.checkedAt) : NaN;
    const since = new Date(Math.max(now() - SIGNAL_FIRST_LOOKBACK_DAYS * DAY_MS,
      Number.isFinite(lastChecked) ? lastChecked - SIGNAL_RECHECK_DAYS * DAY_MS : -Infinity)).toISOString().slice(0, 10);
    const name = state.name || before.name;
    const domain = site(state.website);
    let found: Awaited<ReturnType<typeof runWebSearch>>;
    try {
      found = await search({
        admin: context.admin, query: [name, domain, SIGNAL_SEARCH_TERMS].filter(Boolean).join(" "),
        options: { category: "news", startPublishedDate: since }, logging: { attribution: { source: "career/company-hiring-signals" } },
      });
    } catch {
      signal?.throwIfAborted();
      return { status: "failed", saved: 0 };
    }
    signal?.throwIfAborted();
    // Only captured public pages can support a shared record.
    const results = [...new Map(found.results
      .filter((hit): hit is WebSearchResult & { resourceRef: NonNullable<WebSearchResult["resourceRef"]> } => Boolean(hit.resourceRef?.revision))
      .map(hit => [normalizeOpenUrl(hit.url), hit] as const)).values()];
    const recorded = new Set<string>();
    const ids = results.map(hit => signalDataId(state.companyId, hit.url));
    for (let i = 0; i < ids.length; i += 100) {
      const existing = await db.from("company_datas").select("id").in("id", ids.slice(i, i + 100));
      databaseError(existing.error);
      for (const row of (existing.data ?? []) as { id: string }[]) recorded.add(row.id);
    }
    const fresh = results.filter((_, index) => !recorded.has(ids[index]));
    if (fresh.length) {
      const sources = fresh.map((hit, index) => ({ number: index + 1, title: hit.title, url: hit.url,
        publishedDate: hit.publishedDate, highlights: hit.highlights }));
      const kept = await extract({ company: { name, website: state.website, linkedinUrl: state.linkedinUrl }, sources, signal });
      for (const item of kept) {
        const hit = fresh[item.result - 1];
        if (!hit) continue;
        signal?.throwIfAborted();
        const write = await db.rpc("career_write_company_datum_v1", {
          p_target: { kind: "company_workspace", id: state.companyId }, p_label: HIRING_SIGNAL_LABEL,
          p_content: `${item.date} — ${item.content}`,
          p_source_refs: [{ kind: "observation", id: hit.resourceRef.revision }],
          p_data_ref: null, p_request_id: signalDataId(state.companyId, hit.url),
        });
        // A source withdrawn since it was captured supports no record; the other signals stand.
        if (!write.error && ["saved", "unchanged"].includes((write.data as { status?: string } | null)?.status ?? "")) saved++;
      }
    }
    checked = true;
    return { status: "checked", saved };
  } finally {
    const finish = await db.rpc("career_finish_company_signals_v1", {
      p_key: key, p_owner: owner, p_workspace: home, p_checked: checked,
    });
    databaseError(finish.error);
  }
}
