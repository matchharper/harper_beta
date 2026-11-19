import { z } from "zod";
import type {
  TalentToolDefinition,
  TalentToolExecutionContext,
} from "@/lib/talentOnboarding/tools";
import { TOOL_DESCRIPTIONS } from "@/lib/llm/toolDescriptions";
import { formatPromptText } from "@/lib/llm/promptText";
import { profileToolContext } from "../profiles/tools";
import { readOperation, updateOperation } from "../externalOperations/store";
import { startResourceOperation, formatResourceOperation } from "./operations";
import { matchingResearchField } from "./searchHistory";
import { searchResources, searchStoredResources } from "./search";
import { externalSearchPlanSchema } from "../matching/searchPlan";
import { readResource, formatResourceList } from "./read";
import { readCompanyDetails, readCompanyProjections, readCompanyTopicEvidence, targetKey } from "./companyData";
import { formatCompanyEvidence } from "./companySources";
import { officialCompanyInput, officialCompanySchema } from "../companies/publicTarget";
import { publishSet, readSet, listSets, deriveSet, resolveSelection } from "./sets";
import { writeView, readView, listViews, formatCareerView } from "./views";
import {
  databaseError,
  resourceDb,
  resourceRefSchema,
  selectionSchema,
  text,
  record,
  rows,
  type ResourceItem,
} from "./types";
import {
  str,
  num,
  refsInput,
  selectionInput,
  selectorInput,
  criterionInput,
  viewDefinitionInput,
} from "./toolSchemas";

function tool(
  name: "read_resources",
  properties: Record<string, unknown>,
  required: string[],
  execute: NonNullable<TalentToolDefinition["execute"]>
): TalentToolDefinition {
  return {
    name,
    description: TOOL_DESCRIPTIONS[name],
    parameters: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
    channels: ["chat", "voice"],
    execute,
  };
}
const sourceSchema = z.enum([
  "companies",
  "external_roles",
  "existing_internal_opportunities",
  "documents",
  "public_resources",
  "web",
]);
const companyEvidenceQueryInput = {
  type: "string",
  description: "Search terms for linked public company sources; OR and quoted phrases are supported. Includes matching source bodies. Omit for a dated source index.",
};
const companyLabelsInput = {
  type: "array", items: str,
  description: "Include saved public company research under these labels with its source references.",
};
const operationProperties = {
  matchingId: matchingResearchField,
  action: { type: "string", enum: ["start", "read", "resume", "cancel"] },
  operationId: str,
  selection: selectionInput,
  contextRefs: refsInput,
  knownSourceRefs: refsInput,
  companyEvidenceQuery: companyEvidenceQueryInput,
  labels: companyLabelsInput,
  criteria: criterionInput,
  criteriaFromEvaluation: str,
  asOf: str,
  questions: { type: "array", items: str },
  searchOptions: { type: "object" },
  freshness: {
    type: "object",
    properties: {
      maxAgeHours: {
        type: "integer",
        minimum: -1,
        maximum: 720,
        description:
          "Page freshness request: -1 permits saved evidence, 0 requests live fetch, positive values permit that many hours. Provider source-fetch time can remain unverified.",
      },
    },
    required: ["maxAgeHours"],
    additionalProperties: false,
  },
};
function calculation(
  kind: "resource_evaluation" | "resource_research"
): NonNullable<TalentToolDefinition["execute"]> {
  return async (input, context) => {
    const scope = profileToolContext(context, kind, input, {
      readOnly: input.action === "read",
    });
    let operation;
    if (input.operationId) {
      operation = await readOperation(scope, String(input.operationId));
      if (!operation || operation.kind !== kind)
        throw new Error("Operation unavailable.");
      if (input.action === "cancel")
        operation = await updateOperation(scope, operation, {
          status: "cancelled",
        });
      if (input.action === "resume") {
        if (!["partial", "failed", "cancelled"].includes(operation.status))
          throw new Error(
            "Read the current running operation before resuming."
          );
        operation = await updateOperation(scope, operation, {
          status: "reserved",
          result: {
            cursor: 0,
            completed: 0,
            failed: 0,
            set: operation.result.set,
            reset: true,
          },
          provider_refs: { ...operation.provider_refs, lease_until: null },
        });
        const { publishResourceJob } = await import("./queue");
        await publishResourceJob({
          kind: "operation",
          id: operation.id,
          revision: operation.revision,
          cursor: 0,
        });
      }
    } else {
      if (!context?.conversationId)
        throw new Error("A conversation is required for durable work.");
      operation = await startResourceOperation(
        {
          ...scope,
          conversationId: context.conversationId,
          requestId: scope.operationId,
          userMessageId: Number(context.userMessageId) || undefined,
          replyId: context.resumeRequestId,
          workId: context.workId,
          claimId: context.agentClaimId,
          workRevision: context.workRevision,
          signal: context.abortSignal,
        },
        kind,
        { ...input, matchingId: input.matchingId ?? context.researchMatchingId }
      );
    }
    return {
      operation,
      modelOutput: formatResourceOperation(operation),
      ...(["reserved", "running"].includes(operation.status)
        ? {
            careerContinuation: {
              kind: "resource_operation",
              id: operation.id,
            },
          }
        : {}),
    };
  };
}
/** read_resources is no longer offered to the agent (read_companies replaced it); its definition remains for the company-detail database tests until they move to read_companies. */
export const CAREER_RESOURCE_TOOLS: Record<string, TalentToolDefinition> = {
  read_resources: tool(
    "read_resources",
    { refs: refsInput, target: { ...officialCompanyInput,
        description: "Read a named company directly. Its exact name is enough when one company has it; an official website or LinkedIn company identity distinguishes companies with the same name." },
      labels: companyLabelsInput,
      refreshSummary: { type: "boolean", description: "On a single company detail, refresh a missing or stale overview when needed. Set false to use only the saved overview and evidence. A specific label or evidence query reads stored material." },
      labelOffset: num, offset: num, characters: num, companyEvidenceQuery: companyEvidenceQueryInput,
      matchingId: matchingResearchField },
    [],
    async (input, context) => {
      const scope = profileToolContext(context, "read_resources", input, {
        readOnly: true,
      });
      const parsed = z
        .object({
          refs: z.array(resourceRefSchema).default([]),
          target: officialCompanySchema.optional(),
          labels: z.array(z.string().trim().min(1)).optional(),
          refreshSummary: z.boolean().default(true),
          labelOffset: z.number().int().nonnegative().default(0),
          companyEvidenceQuery: z.string().trim().optional(),
          offset: z.number().int().nonnegative().default(0),
          characters: z.number().int().positive().default(16000),
        })
        .refine(value => value.refs.length > 0 || value.target, "Supply resource refs or an official company identity.")
        .parse(input);
      // Check the owning resource and its requested revision before a detail
      // read can refresh the company and advance the directory's revision.
      const sources = await Promise.all(parsed.refs.map(ref => readResource(scope, ref, parsed.companyEvidenceQuery)));
      const available = sources.filter(source => source.status === "available").map(source => source.ref);
      const details = await readCompanyDetails(scope, [...available, ...(parsed.target ? [parsed.target] : [])], {
        mode: parsed.refs.length + Number(Boolean(parsed.target)) === 1 ? "detail" : "list",
        labels: parsed.labels, labelOffset: parsed.labelOffset, refresh: parsed.refreshSummary && !parsed.companyEvidenceQuery && !parsed.labels?.length,
        signal: context?.abortSignal,
      });
      const identityKey = parsed.target && targetKey(parsed.target);
      const resolution = details.resolutions.find(entry => targetKey(entry.targetRef) === identityKey);
      const identified = identityKey ? details.projections.get(identityKey) : undefined;
      const identityNotes: string[] = [];
      let related: ResourceItem[] = [];
      if (resolution?.status === "missing" && parsed.target && !parsed.target.officialWebsite && !parsed.target.linkedinUrl && !parsed.target.linkedinCompanyId) {
        // A product or brand can be mentioned by more than one company. These
        // public text matches are discovery results, never a write identity.
        const page = await searchStoredResources(scope, "companies", parsed.target.name, 0, 50);
        related = page.items;
        const summaries = await readCompanyProjections(scope, related.map(item => item.ref), {
          mode: "list", labels: parsed.labels, labelOffset: parsed.labelOffset,
        });
        for (const item of related) item.publicCompany = summaries.get(targetKey(item.ref));
        if (related.length) {
          identityNotes.push(`No exact company name matched "${parsed.target.name}". These public directory records or linked materials mention the search term. The term may be a product or brand.`);
          if (page.hasMore) identityNotes.push("Continue search_resources with source companies, the same query and cursor 50.");
        }
      }
      if (resolution?.status === "ambiguous") {
        identityNotes.push("Several public companies match this identity. Candidates:\n" + formatPromptText(resolution.candidates));
      } else if (parsed.target && !identified && !related.length) {
        identityNotes.push(details.refreshNote ?? (details.unavailable || resolution?.status === "found"
          ? "Shared company materials are unavailable." : "No matching public company was found for that identity in the saved directory or linked materials."));
      }
      const companyRef = resolution?.companyRef;
      if (companyRef && !sources.some(source => targetKey(source.ref) === targetKey(companyRef))) {
        sources.push(await readResource(scope, companyRef, parsed.companyEvidenceQuery));
      }
      if (identified) details.projections.set(targetKey(identified.companyRef), identified);
      const end = parsed.offset + parsed.characters;
      if (parsed.companyEvidenceQuery) {
        const companies = [...details.projections.values(), ...related.flatMap(item => item.publicCompany ?? [])];
        const topics = await readCompanyTopicEvidence(scope.admin, companies.map(company => company.companyRef.id),
          parsed.companyEvidenceQuery, parsed.labelOffset, related.length > 0);
        for (const company of companies) {
          const page = topics.get(company.companyRef.id);
          if (!page || parsed.labels?.length) continue;
          company.items = page.items;
          const next = parsed.labelOffset + page.items.length;
          company.nextLabelOffset = next < page.total ? next : null;
        }
        for (const item of related) {
          const page = item.publicCompany && topics.get(item.publicCompany.companyRef.id);
          if (!page?.observations.length) continue;
          const sourceText = page.observations.map(formatCompanyEvidence).join("\n\n");
          item.body = sourceText.slice(parsed.offset, end);
          item.sourceRefs = page.observations.map(source => ({ kind: "observation", id: source.id }));
          item.coverage = `Matched public source text: characters ${parsed.offset}–${Math.min(end, sourceText.length)} of ${sourceText.length}. Further company evidence can be read by company or observation ref.`;
        }
      }
      if (related.length) identityNotes.push(...formatResourceList(related));
      const items = await Promise.all(sources.map(async initial => {
        const company = initial.status === "available" ? details.projections.get(targetKey(initial.ref)) : undefined;
        // Saving a new overview advances a linked directory company's revision.
        // Return its current facts and ref after that refresh.
        const source = company && details.refreshed && initial.ref.kind === "company"
          ? await readResource(scope, { kind: "company", id: initial.ref.id }, parsed.companyEvidenceQuery)
          : initial;
        return {
          ...source,
          publicCompany: source.status === "available" ? company : undefined,
          body: source.body.slice(parsed.offset, end),
          offset: parsed.offset,
          totalCharacters: source.body.length,
          nextOffset: source.body.length > end ? end : null,
        };
      }));
      return {
        items,
        ...(related.length ? { relatedCompanies: related } : {}),
        ...(resolution ? { companyResolution: resolution } : {}),
        modelOutput: [
          ...identityNotes,
          ...formatResourceList(items).map((body, index) => {
            const item = items[index];
            return `${body}\nRead characters ${item.offset}–${Math.min(item.offset + parsed.characters, item.totalCharacters)} of ${item.totalCharacters}; next offset ${item.nextOffset ?? "none"}.`;
          }),
        ].join("\n\n"),
      };
    }
  ),
};
