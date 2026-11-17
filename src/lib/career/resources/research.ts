import { runWebSearch, parseWebSearchOptions } from "@/lib/tools/webSearch";
import { webResultRef } from "./webResult";
import { openUrlWithDocumentsCache } from "@/lib/talentOnboarding/openUrlTool";
import { readResource, formatResource } from "./read";
import {
  type ResourceContext,
  type ResourceItem,
  type ResourceRef,
} from "./types";

/** Collection receipts and source evidence. The conversation owns the conclusion. */
export async function researchResource(
  context: ResourceContext,
  input: {
    resource: ResourceItem;
    questions: string[];
    knownSourceRefs?: ResourceRef[];
    companyEvidenceQuery?: string;
    searchOptions?: Record<string, unknown>;
    signal?: AbortSignal;
    freshness?: { maxAgeHours: number };
  }
) {
  const evidence: ResourceItem[] = [input.resource];
  const failures: Array<{
    ref?: ResourceRef;
    question?: string;
    error: string;
  }> = [];
  const pageReads: Array<{
    ref: ResourceRef;
    cached: boolean;
    coverage: string;
    sourceFetchedAt: string | null;
    refreshPending: boolean;
  }> = [];
  const refreshedPages = new Map<string, ResourceItem>();
  const read = async (ref: ResourceRef) => {
    input.signal?.throwIfAborted();
    let source = await readResource(context, ref);
    if (source.status !== "available") {
      failures.push({ ref, error: source.status });
      return;
    }
    if (
      (source.ref.kind === "web_resource" ||
        source.ref.kind === "observation") &&
      typeof source.facts.url === "string"
    ) {
      const url = source.facts.url;
      const alreadyRead = refreshedPages.get(url);
      if (alreadyRead) {
        evidence.push(alreadyRead);
        return;
      }
      try {
        const page = await openUrlWithDocumentsCache({
          admin: context.admin,
          url,
          maxAgeHours: input.freshness?.maxAgeHours,
        });
        pageReads.push({
          ref,
          cached: page.cached,
          coverage: page.coverage,
          sourceFetchedAt: page.sourceFetchedAt ?? null,
          refreshPending:
            "refreshPending" in page && page.refreshPending === true,
        });
        if (page.documentId && page.observationId)
          source = await readResource(context, {
            kind: "web_resource",
            id: String(page.documentId),
            revision: page.observationId,
          });
        refreshedPages.set(url, source);
      } catch (error) {
        input.signal?.throwIfAborted();
        failures.push({ ref, error: String(error) });
      }
    }
    evidence.push(source);
  };
  if (input.resource.ref.kind === "web_resource")
    await read(input.resource.ref);
  // A company's index lists available sources. Its mere presence is no request
  // to open each one. A scoped read already contains the matching stored bodies.
  const linkedSources = input.resource.ref.kind === "company" && input.companyEvidenceQuery !== undefined
    ? (input.companyEvidenceQuery && input.freshness ? input.resource.sourceRefs : [])
    : input.resource.sourceRefs;
  for (const ref of [
    ...linkedSources,
    ...(input.knownSourceRefs ?? []),
  ]) {
    await read(ref);
  }
  const searches: Array<{
    question: string;
    query: string;
    coverage: string;
    refs: ResourceRef[];
  }> = [];
  for (const question of input.questions) {
    input.signal?.throwIfAborted();
    const query = `${input.resource.title} ${question}`;
    try {
      const response = await runWebSearch({
        admin: context.admin,
        query,
        options: parseWebSearchOptions(input.searchOptions ?? {}),
        logging: {
          attribution: {
            source: "career/resources/research",
            userId: context.userId,
          },
        },
      });
      const refs: ResourceRef[] = [];
      for (const result of response.results) {
        const ref = await webResultRef(context, result);
        refs.push(ref);
        await read(ref);
      }
      searches.push({ question, query, coverage: response.coverage, refs });
    } catch (error) {
      input.signal?.throwIfAborted();
      failures.push({
        question,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const unique = [
    ...new Map(
      evidence.map((item) => [
        `${item.ref.kind}:${item.ref.id}:${item.ref.revision ?? ""}`,
        item,
      ])
    ).values(),
  ];
  const sourceRefs = unique.map((item) => item.ref);
  if (input.resource.ref.kind === "company" && input.companyEvidenceQuery) {
    const observed = new Set(sourceRefs.filter((ref) => ref.kind === "observation").map((ref) => ref.id));
    sourceRefs.push(...input.resource.sourceRefs.filter((ref) => !observed.has(ref.id)));
  }
  return {
    sourceRefs,
    searches,
    pageReads,
    failures,
    modelOutput: [
      "Research collection receipt. Sources and search coverage are not a verified answer to every question.",
      ...searches.map(
        (search) =>
          `Question: ${search.question}\nSearch coverage: ${search.coverage}`
      ),
      ...pageReads.map(
        (page) =>
          `Page ${page.ref.id}: ${page.coverage}${page.refreshPending ? " Refresh pending; requested freshness is unverified." : ""}`
      ),
      ...unique.map(formatResource),
      ...failures.map(
        (failure) =>
          `Unresolved: ${failure.question ?? failure.ref?.id}: ${failure.error}`
      ),
    ].join("\n\n"),
  };
}
