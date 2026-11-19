import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { formatResource } from "@/lib/career/resources/read";
import {
  criteriaSchema,
  evaluateResource,
} from "@/lib/career/resources/evaluate";
import {
  viewDefinitionSchema,
  formatCareerView,
} from "@/lib/career/resources/views";
import { formatOpportunity } from "@/lib/career/opportunities/store";
import {
  resourceRefSchema,
  selectionSchema,
  type ResourceItem,
  type ResourceRef,
} from "@/lib/career/resources/types";

/** Frozen provider/storage observations for original-model behavior probes.
 * SQL boundaries and real queue execution are tested separately. */
export function createCareerResourceFixture(
  scenario: any,
  privateContext: () => string,
  documentResources?: () => ResourceItem[],
  searchHistory?: { operation(id:string,revision?:string): Promise<ResourceItem> }
) {
  const resources: ResourceItem[] = structuredClone(scenario.resources ?? []),
    sets: any[] = [],
    operations: any[] = [],
    opportunities: any[] = [],
    views: any[] = [];
  const savedPublic = new Set(resources.filter(resource => scenario.initialPublicUrls?.includes(resource.facts.url)).map(resource => resource.ref.id));
  const fullPages = new Set(savedPublic);
  const webRef = (id: string, full: boolean) => ({kind: "web_resource" as const, id,
    revision: `70000000-0017-4${full ? "002" : "001"}-8000-${id.padStart(12,"0")}`});
  const read = (ref: ResourceRef): ResourceItem => {
    if (
      ref.kind === "profile" &&
      ref.id === "70000000-0000-4000-8000-000000000101"
    )
      return {
        ref: { ...ref, revision: "1" },
        title: "Current owned Career profile and context",
        body: privateContext(),
        facts: {},
        sourceRefs: [],
        status: "available",
      };
    const found = [...resources, ...(documentResources?.() ?? [])].find(
      (item) => item.ref.kind === ref.kind && item.ref.id === ref.id
    );
    assert.ok(found, "Source is not available in this owner's fixture");
    if (searchHistory && ref.kind === "web_resource") {
      if (!savedPublic.has(ref.id)) return {...found, status:"unavailable", body:"", facts:{}, sourceRefs:[]};
      const full = fullPages.has(ref.id) && (!ref.revision || ref.revision === webRef(ref.id,true).revision);
      const observed = webRef(ref.id,full);
      if (ref.revision && ref.revision !== observed.revision) return {...found,status:"version_unavailable",body:"",facts:{},sourceRefs:[]};
      const page = scenario.pages.find((p:any)=>p.resourceId===ref.id);
      return {...found,ref:observed,body:full?found.body:[page.title,page.url,page.summary].join("\n"),
        coverage:full?"Saved captured page body.":"Public search-result metadata/highlights only. The page body has not been read.",
        facts:{url:page.url},sourceRefs:[{kind:"observation",id:observed.revision}]};
    }
    assert.ok(
      !ref.revision || ref.revision === found.ref.revision,
      "Source revision unavailable"
    );
    return structuredClone(found);
  };
  const select = (input: unknown) => {
    const selection = selectionSchema.parse(input);
    if ("refs" in selection) return selection.refs.map(read);
    const set = sets.find(
      (item) =>
        item.setId === selection.setId && item.revision === selection.revision
    );
    assert.ok(set, "Set unavailable");
    return set.items
      .filter(
        (item: any) =>
          !selection.selector?.itemIds ||
          selection.selector.itemIds.includes(item.itemId)
      )
      .filter(
        (item: any) =>
          !selection.selector?.excludeItemIds?.includes(item.itemId)
      )
      .map((item: any) => read(item.ref));
  };
  const publish = (items: ResourceItem[], evaluations: any[] = []) => {
    const set = {
      setId: randomUUID(),
      revision: 1,
      total: items.length,
      nextCursor: null,
      manifest: {
        coverage: "Frozen public evidence, not an exhaustive market sample.",
        fields: [
          "title",
          ...new Set(
            evaluations.flatMap((result) =>
              result.evaluations.map((item: any) => item.name)
            )
          ),
        ],
      },
      items: items.map((item, index) => ({
        itemId: randomUUID(),
        ref: item.ref,
        projection: {
          title: item.title,
          ...item.facts,
          ...Object.fromEntries(
            (evaluations[index]?.evaluations ?? []).map((answer: any) => [
              answer.name,
              answer.value,
            ])
          ),
        },
      })),
    };
    sets.push(set);
    return set;
  };
  return {
    registerSearchHit(id: string) { savedPublic.add(id); return webRef(id,fullPages.has(id)); },
    storedPage(id: string) {return fullPages.has(id);},
    registerPageRead(id:string) {if(!savedPublic.has(id))return null; fullPages.add(id);return webRef(id,true);},
    state: () => ({
      sets,
      operations,
      opportunities,
      views,
      sharedPublicReads: resources.length,
      ...(searchHistory ? { visiblePublicRefs: [...savedPublic] } : {}),
      externalFetches: 0,
    }),
    async execute(
      name: string,
      args: Record<string, any>
    ): Promise<Record<string, any> | null> {
      if (name === "search_resources") {
        const kind =
          args.source === "companies"
            ? "company"
            : args.source === "documents"
              ? "document"
              : args.source === "public_resources"
                ? (searchHistory ? "web_resource" : "observation")
                : args.source === "external_roles" && scenario.frozenResourceMarket ? "role" : "web_resource";
        let candidates = [...resources, ...(documentResources?.() ?? [])].filter((item) => item.ref.kind === kind);
        if (searchHistory && args.source === "public_resources") candidates = candidates.filter(item => savedPublic.has(item.ref.id));
        if (scenario.frozenResourceMarket && (args.source === "web" || args.source === "external_roles" || searchHistory && args.source === "public_resources")) {
          const terms = [args.query, ...(args.queries ?? []), ...(args.filters?.plan?.roleTitles ?? [])].filter(Boolean).join(" ").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
          const rank = (item: ResourceItem) => terms.filter(term => [item.title, item.facts.keywords, item.body].join(" ").toLowerCase().includes(term)).length;
          candidates = candidates.map(item => ({item, score:rank(item)})).filter(hit => !terms.length || hit.score > 0)
            .sort((left,right) => right.score - left.score).map(hit => hit.item);
        }
        const offset = Number(args.cursor ?? 0),
          limit = Number(args.limit ?? 50),
          items = candidates.slice(offset, offset + limit);
        const nextCursor =
          offset + limit < candidates.length ? String(offset + limit) : null;
        if (searchHistory && (args.source === "web" || args.source === "public_resources")) {
          for (const [index,item] of items.entries()) {
            savedPublic.add(item.ref.id);
            items[index]=read(webRef(item.ref.id,fullPages.has(item.ref.id)));
          }
        }
        return {
          items,
          nextCursor,
          ...(args.resultMode === "set" ? { set: publish(items) } : {}),
          modelOutput: [
            scenario.frozenResourceMarket ? "Frozen public search index and owned sources. Read exact refs for source text." :
            "Frozen shared collection. Candidate retrieval only; no personal fit judgment. Every company in this small fixture is returned, independent of the query. Saved source bodies are available through exact refs.",
            ...items.map((item) =>
              formatResource({
                ...item,
                body: "Read the source for its original evidence.",
              })
            ),
            `Next cursor: ${nextCursor ?? "none"}`,
          ].join("\n\n"),
        };
      }
      if (name === "read_resources") {
        const sources: ResourceItem[] = await Promise.all(args.refs.map((ref: ResourceRef) =>
          ref.kind === "operation" && searchHistory ? searchHistory.operation(ref.id,ref.revision) : read(resourceRefSchema.parse(ref))
        ));
        if (!searchHistory) return {items:sources,modelOutput:sources.map(formatResource).join("\n\n")};
        const offset = args.offset ?? 0, end=offset+(args.characters ?? 16000);
        const items = sources.map(item=>({...item,body:item.body.slice(offset,end),offset,totalCharacters:item.body.length,nextOffset:item.body.length>end?end:null}));
        return {items,modelOutput:items.map(item=>`${formatResource(item)}\nRead characters ${item.offset}–${Math.min(end,item.totalCharacters)} of ${item.totalCharacters}; next offset ${item.nextOffset ?? "none"}.`).join("\n\n")};
      }
      if (name === "research_resources" || name === "evaluate_resources") {
        if (args.operationId) {
          const operation = operations.find(
            (item) => item.id === args.operationId
          );
          assert.ok(operation);
          return operation;
        }
        const items = select(args.selection),
          context = (args.contextRefs ?? []).map(read);
        const evaluations =
          name === "evaluate_resources"
            ? await Promise.all(
                items.map((resource: ResourceItem) =>
                  evaluateResource({
                    resource,
                    context,
                    criteria: criteriaSchema.parse(args.criteria),
                    asOf: args.asOf,
                  })
                )
              )
            : [];
        const set = publish(items, evaluations),
          operation = {
            id: randomUUID(),
            status: "completed",
            result: {
              completed: items.length,
              failed: 0,
              set: { setId: set.setId, revision: 1 },
            },
            modelOutput: [
              `Completed fixture collection/calculation. Result set ${set.setId} revision 1. No new provider page fetch; saved public sources were reused.`,
              ...items.map(formatResource),
              JSON.stringify(evaluations),
            ].join("\n\n"),
          };
        operations.push(operation);
        return operation;
      }
      if (name === "manage_result_sets") {
        if (args.action === "read") {
          const set = sets.find(
            (item) =>
              item.setId === args.setId && item.revision === args.revision
          );
          assert.ok(set);
          return { ...set, modelOutput: JSON.stringify(set) };
        }
        if (args.action === "create" || args.action === "derive") {
          const set = publish(select(args.selection));
          return { ...set, modelOutput: JSON.stringify(set) };
        }
      }
      if (
        name === "upsert_opportunities" &&
        ["upsert", "read"].includes(args.action)
      ) {
        if (args.action === "read") {
          const selected = args.opportunityRef
            ? opportunities.filter((item) => item.id === args.opportunityRef.id)
            : opportunities;
          return {
            opportunities: selected,
            modelOutput:
              selected.map(formatOpportunity).join("\n\n") ||
              "No published opportunities.",
          };
        }
        if (args.primaryRef) read(resourceRefSchema.parse(args.primaryRef));
        for (const ref of args.evidenceRefs ?? []) read(ref);
        let item = opportunities.find(
          (item) => item.id === args.opportunityRef?.id
        );
        if (item) assert.equal(item.revision, Number(args.expectedRevision));
        else
          assert.ok(
            args.primaryRef && args.title,
            "A new opportunity requires a title and primary ref."
          );
        const patch = {
          id: item?.id ?? randomUUID(),
          revision: (item?.revision ?? 0) + 1,
          title: args.title ?? item?.title,
          body: args.body ?? item?.body ?? "",
          primary_ref: args.primaryRef ?? item?.primary_ref,
          related_refs: args.relatedRefs ?? item?.related_refs ?? [],
          evidence_refs: args.evidenceRefs ?? item?.evidence_refs ?? [],
          presentation: args.presentation ?? item?.presentation ?? {},
          saved_at:
            args.saved === undefined
              ? (item?.saved_at ?? null)
              : args.saved
                ? "2026-11-14T02:00:00Z"
                : null,
          archived_at:
            args.archived === undefined
              ? (item?.archived_at ?? null)
              : args.archived
                ? "2026-11-14T02:00:00Z"
                : null,
          recommendation_id: null,
        };
        if (item) Object.assign(item, patch);
        else {
          item = patch;
          opportunities.push(item);
        }
        return { opportunities: [item], modelOutput: formatOpportunity(item) };
      }
      if (name === "manage_views") {
        if (args.action === "list" || args.action === "read")
          return {
            views,
            modelOutput:
              views.map(formatCareerView).join("\n\n") || "No saved views.",
          };
        const definition = viewDefinitionSchema.parse(args.definition),
          view = {
            id: randomUUID(),
            revision: 1,
            title: args.title,
            description: args.description ?? "",
            definition,
          };
        views.push(view);
        return { view, modelOutput: formatCareerView(view) };
      }
      return null;
    },
  };
}
