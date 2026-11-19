import type { TalentAdminClient } from "@/lib/talentOnboarding/admin";
import { formatCompanyPersonalContext, readCompanyPersonalContext, type CompanyPersonalContext } from "./personalContext";
import { runWebSearch } from "@/lib/tools/webSearch";
import { readCompanyDetails } from "../resources/companyData";
import { resolveCompanyRefs } from "../matching/searchRoutes";
import { readCompanyFacts, formatCompanyFacts, indexCompanies } from "./discovery";
import { checkCompanySignals } from "./signals";

/**
 * Several companies at once: a compact card (overview, team, leaders, hiring,
 * hiring signals, access), saved research by topic, and with check=true a fresh
 * look at their public overview, hiring signals and recent posts and news. Fresh
 * overviews and signals are saved as shared research, so the next reader of the
 * same company starts from them.
 */
type Row = Record<string, any>;
const db = (admin: TalentAdminClient, table: string) => admin.from(table as never) as any;
const MAX_COMPANIES = 10;
const RECENT_DAYS = 90;

const clip = (value: unknown, size: number) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > size ? `${text.slice(0, size - 1)}…` : text;
};

async function recentPosts(admin: TalentAdminClient, name: string, signal?: AbortSignal) {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  try {
    signal?.throwIfAborted();
    const found = await runWebSearch({ admin, query: `${name} hiring OR 채용 OR raises OR launches`, maxResults: 6,
      options: { startPublishedDate: since } as never });
    return found.results.map(r => `${r.publishedDate ? String(r.publishedDate).slice(0, 10) + " " : ""}"${clip(r.title, 90)}" (${r.url})`);
  } catch (error) {
    return [`recent posts unavailable: ${clip(error instanceof Error ? error.message : error, 120)}`];
  }
}

export async function readCompanies(admin: TalentAdminClient, args: {
  userId: string; companies: unknown[]; topics?: string[]; check?: boolean; matchingId?: string; signal?: AbortSignal;
}) {
  const { ids: resolved, notes } = await resolveCompanyRefs(admin, args.matchingId, args.companies);
  const ids = resolved.slice(0, MAX_COMPANIES);
  if (resolved.length > MAX_COMPANIES) notes.push(`Read the first ${MAX_COMPANIES} of ${resolved.length}; ask again for the rest.`);
  if (!ids.length) return { companies: [], modelOutput: [...notes, "No company to read."].join("\n") };
  const context = { admin, userId: args.userId };
  const details = await Promise.all(ids.map(async id => {
    const signal = args.check ? AbortSignal.timeout(60_000) : args.signal;
    const [detail] = await Promise.all([
      readCompanyDetails(context, [{ kind: "company_workspace", id }], {
        mode: args.check ? "detail" : "list", refresh: Boolean(args.check), labels: args.topics?.length ? args.topics : undefined, signal,
      }).catch(() => undefined),
      // Signals checked within the recheck period are already on the card.
      args.check ? checkCompanySignals(context, id, { signal }).catch(() => undefined) : undefined,
    ]);
    return detail;
  }));
  if (args.check) await indexCompanies(admin, { ids }).catch(() => undefined);
  const [{ data: rows }, facts, numbers, personal] = await Promise.all([
    db(admin, "company_workspace").select("company_workspace_id,company_name,company_description,homepage_url").in("company_workspace_id", ids),
    readCompanyFacts(admin, ids, { userId: args.userId, signal: args.signal }),
    args.matchingId
      ? db(admin, "talent_matching_candidates").select("number,company_workspace_id").eq("matching_id", args.matchingId).in("company_workspace_id", ids)
      : Promise.resolve({ data: [] }),
    readCompanyPersonalContext(admin, args.userId, ids).catch(() => new Map<string, CompanyPersonalContext>()),
  ]);
  const rowOf = new Map((rows ?? []).map((r: Row) => [r.company_workspace_id, r]));
  const numberOf = new Map((numbers.data ?? []).map((r: Row) => [r.company_workspace_id, r.number]));
  const recent = args.check
    ? new Map(await Promise.all(ids.map(async id => [id, await recentPosts(admin, (rowOf.get(id) as Row | undefined)?.company_name ?? "", args.signal)] as const)))
    : new Map<string, string[]>();
  const now = new Date();
  const blocks = ids.map((id, index) => {
    const row = rowOf.get(id) as Row | undefined;
    const projection = details[index]?.projections ? [...details[index]!.projections.values()][0] : undefined;
    const head = `${numberOf.has(id) ? `[${numberOf.get(id)}] ` : ""}${row?.company_name ?? projection?.name ?? id} · company ${id}`;
    const overview = projection?.summary?.content
      ? clip(projection.summary.content.trim().split(/\n\s*\n/, 1)[0], 600)
      : clip(row?.company_description, 300);
    const labels = projection?.labels?.length ? `Research topics: ${projection.labels.map((l: Row) => l.label ?? l).join(", ")}` : "";
    const topicText = args.topics?.length ? (projection?.items ?? []).map((item: Row) =>
      `— ${item.label}: ${clip(item.content, 1500)}${item.sourceRefs?.length ? ` (sources: ${item.sourceRefs.length})` : ""}`) : [];
    const recentLines = recent.get(id)?.length ? [`Recent public posts (${RECENT_DAYS} days): ${recent.get(id)!.slice(0, 5).join(" · ")}`] : [];
    const factLine = formatCompanyFacts(facts.get(id), { now });
    return [head, overview && `  ${overview}`, factLine && `  ${factLine}`,
      labels && `  ${labels}`, projection?.refreshNote && `  ${projection.refreshNote}`, ...topicText.map(t => `  ${t}`),
      ...recentLines.map(l => `  ${l}`), row?.homepage_url && `  Site: ${row.homepage_url}`,
      formatCompanyPersonalContext(personal.get(id)) && `  ${formatCompanyPersonalContext(personal.get(id))}`].filter(Boolean).join("\n");
  });
  return {
    companies: ids.map(id => ({ companyWorkspaceId: id, name: (rowOf.get(id) as Row | undefined)?.company_name })),
    modelOutput: [...notes, ...blocks, "Team numbers come from Harper's career records as of the date shown."].join("\n\n"),
  };
}
