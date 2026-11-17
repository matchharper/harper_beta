import { runWebSearch, parseWebSearchOptions } from "@/lib/tools/webSearch";
import { retrieveRoles } from "@/lib/externalRecommendationsV2/retrieval";
import { embedTitles } from "@/lib/externalRecommendationsV2/retrieval";
import { readResource } from "./read";
import { parseExternalSearchPlan } from "../matching/searchPlan";
import { publishSet } from "./sets";
import { webResultRef } from "./webResult";
import { factualFiltersSchema, matchesResourceFacts } from "./factualFilters";
import {
  databaseError,
  fingerprint,
  pageInput,
  record,
  resourceDb,
  resourceRefSchema,
  rows,
  text,
  type ResourceContext,
  type ResourceItem,
} from "./types";

export type ResourceSearchInput = {
  source:
    | "companies"
    | "external_roles"
    | "existing_internal_opportunities"
    | "documents"
    | "public_resources"
    | "web";
  query?: string;
  queries?: string[];
  filters?: Record<string, unknown>;
  cursor?: string;
  limit?: number;
  resultMode?: "page" | "set";
};
export async function searchResources(
  context: ResourceContext,
  input: ResourceSearchInput,
  signal?: AbortSignal
) {
  const { offset, limit } = pageInput(input.cursor, input.limit),
    db = resourceDb(context.admin);
  const queries = input.queries ?? [input.query ?? ""],
    items: ResourceItem[] = [];
  const factualFilters = !["web", "external_roles"].includes(input.source)
    ? factualFiltersSchema.parse(input.filters ?? {})
    : null;
  let hasMore = false;
  let partial = false;
  const coverages: string[] = [];
  for (const query of queries) {
    signal?.throwIfAborted();
    if (["companies", "documents", "public_resources"].includes(input.source)) {
      const { data, error } = await db.rpc("career_search_resources_v1", {
        p_user: context.userId,
        p_source: input.source,
        p_query: query,
        p_offset: offset,
        p_limit: limit + 1,
      });
      databaseError(error);
      const found = rows(data);
      hasMore ||= found.length > limit;
      items.push(
        ...found
          .slice(0, limit)
          .map((row) => ({
            ref: resourceRefSchema.parse(row.ref),
            title: text(row.title),
            body: text(row.body),
            facts: record(row.facts),
            sourceRefs: [],
            status: "available" as const,
          }))
      );
      coverages.push(
        `${input.source}: ${query || "all stored sources"}, offset ${offset}. Stored lexical search including linked public evidence; new external sources may not be present.`
      );
      if (query.trim()) {
        try {
          const [embedding] = await embedTitles([query], signal);
          const neighbors = await db.rpc("career_resource_neighbors_v1", {
            p_user: context.userId,
            p_kind:
              input.source === "companies"
                ? "company"
                : input.source === "documents"
                  ? "document"
                  : "web_resource",
            p_embedding: JSON.stringify(embedding),
            p_offset: offset,
            p_limit: limit + 1,
          });
          databaseError(neighbors.error);
          const candidates = rows(neighbors.data);
          hasMore ||= candidates.length > limit;
          for (const candidate of candidates.slice(0, limit)) {
            const ref = resourceRefSchema.parse({
              kind: candidate.kind,
              id: candidate.id,
              revision: candidate.revision,
            });
            if (
              items.some(
                (item) => item.ref.kind === ref.kind && item.ref.id === ref.id
              )
            )
              continue;
            const resource = await readResource(context, ref);
            if (resource.status === "available")
              items.push({
                ...resource,
                body: "",
                coverage:
                  "Semantic retrieval candidate; read the exact source for its body. Retrieval is not a fit assessment.",
              });
          }
          coverages.push(
            "Semantic candidates are combined with native lexical matches. Embeddings may still be pending; source versions and current access are checked before return."
          );
        } catch (error) {
          signal?.throwIfAborted();
          partial = true;
          coverages.push(
            `Semantic retrieval incomplete: ${error instanceof Error ? error.message : String(error)}. Lexical results remain available.`
          );
        }
      }
    } else if (input.source === "web") {
      if (offset)
        throw new Error(
          "This provider does not provide offset pagination. Refine the query or search another source/date window."
        );
      const response = await runWebSearch({
        admin: context.admin,
        query,
        maxResults: limit,
        options: parseWebSearchOptions(input.filters ?? {}),
        logging: {
          attribution: { source: "career/resources", userId: context.userId },
        },
      });
      for (const result of response.results) {
        const ref = await webResultRef(context, result);
        items.push({
          ref,
          title: result.title,
          body: result.highlights.join("\n"),
          facts: {
            url: result.url,
            publishedAt: result.publishedDate,
            author: result.author,
          },
          sourceRefs: ref.revision
            ? [{ kind: "observation", id: ref.revision }]
            : [],
          status: "available",
        });
      }
      coverages.push(response.coverage);
    } else if (input.source === "external_roles") {
      const rawPlan = record(input.filters?.plan ?? input.filters);
      const plan = parseExternalSearchPlan({
        ...rawPlan,
        ...(query
          ? {
              roleTitles: rawPlan.roleTitles ?? [query],
              ftsKeywords: [
                ...(Array.isArray(rawPlan.ftsKeywords)
                  ? rawPlan.ftsKeywords
                  : []),
                { terms: [query], weight: 1 },
              ],
            }
          : {}),
      });
      const settings = await context.admin
        .from("talent_setting")
        .select("blocked_companies")
        .eq("user_id", context.userId)
        .maybeSingle();
      databaseError(settings.error);
      const found = await retrieveRoles({
        ...context,
        plan,
        blockedCompanies: settings.data?.blocked_companies ?? [],
        limit: offset + limit + 1,
        includePreviouslyRecommended: true,
        unlimitedPerCompany: true,
        listOnly: true,
        signal,
      });
      hasMore ||= found.rows.length > offset + limit;
      items.push(
        ...found.rows.slice(offset, offset + limit).map((value) => {
          const row = record(value);
          return {
            ref: { kind: "role" as const, id: String(row.role_id) },
            title: `${text(row.company_name)} · ${text(row.role_name)}`,
            body: text(row.description),
            facts: Object.fromEntries(
              [
                "location_text",
                "salary_range",
                "salary_currency",
                "salary_period",
                "work_mode",
                "external_jd_url",
              ].map((key) => [key, row[key]])
            ),
            sourceRefs: [],
            status: "available" as const,
          };
        })
      );
      coverages.push(
        "Existing external Role retrieval and eligibility filters; no personal evaluation or publication. Pages are a live search; save a result set for immutable selection."
      );
    } else if (input.source === "existing_internal_opportunities") {
      const found = await db.rpc("career_selected_internal_resources_v1", {
        p_user: context.userId,
        p_query: query,
        p_offset: offset,
        p_limit: limit + 1,
      });
      databaseError(found.error);
      const selected = rows(found.data);
      hasMore ||= selected.length > limit;
      items.push(
        ...selected
          .slice(0, limit)
          .map((row) => ({
            ref: resourceRefSchema.parse(row.ref),
            title: text(row.title),
            body: text(row.body),
            facts: record(row.facts),
            sourceRefs: [],
            status: "available" as const,
          }))
      );
      coverages.push(
        "Previously selected unpublished proposals and published recommendations; canonical candidate-safe fields only. No unselected private inventory discovery."
      );
    } else throw new Error("Unsupported resource source.");
  }
  const unique = [
    ...new Map(
      items
        .filter(
          (item) =>
            !factualFilters || matchesResourceFacts(item, factualFilters)
        )
        .map((item) => [`${item.ref.kind}:${item.ref.id}`, item])
    ).values(),
  ];
  if (factualFilters?.where.length)
    coverages.push(
      `Exact factual filters applied to ${items.length} retrieved candidates. Missing facts do not pass. The cursor advances retrieval windows, including windows with no filtered matches.`
    );
  coverages.push(
    "Pagination advances each query/source window. Live rankings can overlap across pages; immutable sets preserve exact membership. No claim of exhaustive market coverage."
  );
  const nextCursor = hasMore ? String(offset + limit) : null;
  const manifest = {
    source: input.source,
    queries,
    filters: input.filters ?? {},
    capturedAt: new Date().toISOString(),
    coverage: coverages,
    nextCursor,
    evaluated: false,
    completeMarket: false,
    partial,
    requestHash: fingerprint(input),
    factualFields: [
      "title",
      ...new Set(items.flatMap((item) => Object.keys(item.facts))),
    ],
  };
  const set =
    input.resultMode === "set"
      ? await publishSet(context, {
          manifest,
          items: unique.map((item) => ({
            ref: item.ref,
            projection: {
              title: item.title,
              description: item.body,
              ...item.facts,
            },
          })),
        })
      : undefined;
  return { items: unique, nextCursor, manifest, ...(set ? { set } : {}) };
}
