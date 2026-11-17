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
import { careerSearchNotes } from "./searchHistory";
import { searchResources } from "./search";
import { externalSearchPlanSchema } from "../matching/searchPlan";
import { readResource, formatResource } from "./read";
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
  name:
    | "search_resources"
    | "read_resources"
    | "research_resources"
    | "evaluate_resources"
    | "manage_result_sets"
    | "manage_views",
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
const operationProperties = {
  action: { type: "string", enum: ["start", "read", "resume", "cancel"] },
  operationId: str,
  selection: selectionInput,
  contextRefs: refsInput,
  knownSourceRefs: refsInput,
  companyEvidenceQuery: companyEvidenceQueryInput,
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
        input
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
export const CAREER_RESOURCE_TOOLS: Record<string, TalentToolDefinition> = {
  search_resources: tool(
    "search_resources",
    {
      source: { type: "string", enum: sourceSchema.options },
      query: str,
      ...careerSearchNotes,
      queries: { type: "array", items: str },
      filters: {
        type: "object",
        description: "For external_roles, supply plan with roleTitles and keyed countries; a natural-language query alone does not define the country scope. For companies, documents and public_resources, use where for exact returned facts. For web, use the web_search provider's filter fields directly.",
        properties: {
          plan: externalSearchPlanSchema,
          where: selectorInput.properties.where,
        },
      },
      cursor: str,
      limit: num,
      resultMode: { type: "string", enum: ["page", "set"] },
    },
    ["source"],
    async (input, context) => {
      const scope = profileToolContext(context, "search_resources", input, {
        readOnly: true,
      });
      const parsed = z
        .object({
          source: sourceSchema,
          query: z.string().optional(),
          queries: z.array(z.string()).optional(),
          filters: z.record(z.unknown()).optional(),
          cursor: z.string().optional(),
          limit: z.number().int().positive().optional(),
          resultMode: z.enum(["page", "set"]).optional(),
        })
        .parse(input);
      const result = await searchResources(scope, parsed, context?.abortSignal);
      return {
        ...result,
        modelOutput: [
          result.manifest.coverage.join("\n"),
          "Retrieved candidates; no personal evaluation or recommendation publication.",
          ...result.items.map(formatResource),
          `Next cursor: ${result.nextCursor ?? "none"}`,
          result.set ? `Saved set: ${formatPromptText(result.set)}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }
  ),
  read_resources: tool(
    "read_resources",
    { refs: refsInput, offset: num, characters: num, companyEvidenceQuery: companyEvidenceQueryInput },
    ["refs"],
    async (input, context) => {
      const scope = profileToolContext(context, "read_resources", input, {
        readOnly: true,
      });
      const parsed = z
        .object({
          refs: z.array(resourceRefSchema),
          companyEvidenceQuery: z.string().trim().optional(),
          offset: z.number().int().nonnegative().default(0),
          characters: z.number().int().positive().default(16000),
        })
        .parse(input);
      const items = await Promise.all(
        parsed.refs.map(async (ref) => {
          const source = await readResource(scope, ref, parsed.companyEvidenceQuery),
            end = parsed.offset + parsed.characters;
          return {
            ...source,
            body: source.body.slice(parsed.offset, end),
            offset: parsed.offset,
            totalCharacters: source.body.length,
            nextOffset: source.body.length > end ? end : null,
          };
        })
      );
      return {
        items,
        modelOutput: items
          .map(
            (item) =>
              `${formatResource(item)}\nRead characters ${item.offset}–${Math.min(item.offset + parsed.characters, item.totalCharacters)} of ${item.totalCharacters}; next offset ${item.nextOffset ?? "none"}.`
          )
          .join("\n\n"),
      };
    }
  ),
  research_resources: tool(
    "research_resources",
    operationProperties,
    [],
    calculation("resource_research")
  ),
  evaluate_resources: tool(
    "evaluate_resources",
    operationProperties,
    [],
    calculation("resource_evaluation")
  ),
  manage_result_sets: tool(
    "manage_result_sets",
    {
      action: { type: "string", enum: ["create", "derive", "list", "read", "archive"] },
      setId: str,
      revision: num,
      expectedRevision: num,
      selection: selectionInput,
      selector: selectorInput,
      title: str,
      cursor: str,
      limit: num,
    },
    ["action"],
    async (input, context) => {
      const scope = profileToolContext(context, "manage_result_sets", input, {
        readOnly: input.action === "list" || input.action === "read",
      });
      if (input.action === "list") {
        const page = await listSets(scope, z.object({
          cursor: z.string().optional(),
          limit: z.number().int().positive().optional(),
        }).parse(input));
        return { ...page, modelOutput: formatPromptText(page) };
      }
      let result: unknown;
      if (input.action === "read")
        result = await readSet(
          scope,
          z
            .object({
              setId: z.string().uuid(),
              revision: z.number().int().positive(),
              cursor: z.string().optional(),
              limit: z.number().int().positive().optional(),
              selector: z.record(z.unknown()).optional(),
            })
            .parse(input)
        );
      else if (input.action === "archive") {
        const parsed = z
          .object({
            setId: z.string().uuid(),
            revision: z.number().int().positive(),
          })
          .parse(input);
        const saved = await resourceDb(scope.admin)
          .from("career_result_sets")
          .update({ archived_at: new Date().toISOString() })
          .eq("id", parsed.setId)
          .eq("revision", parsed.revision)
          .eq("talent_id", scope.userId)
          .select("id,revision")
          .single();
        databaseError(saved.error);
        result = { ...parsed, archived: true };
      } else if (input.action === "derive") {
        const selection = selectionSchema.parse(input.selection);
        if (!("setId" in selection))
          throw new Error("Derive requires an immutable set selection.");
        result = await deriveSet(scope, {
          selection,
          title: text(input.title) || undefined,
        });
      } else if (input.action === "create") {
        const refs = await resolveSelection(
          scope,
          selectionSchema.parse(input.selection),
          context?.abortSignal
        );
        const sources = await Promise.all(
          refs.map((ref) => readResource(scope, ref))
        );
        result = await publishSet(scope, {
          title: text(input.title) || undefined,
          id: text(input.setId) || undefined,
          expectedRevision:
            input.expectedRevision === undefined
              ? undefined
              : Number(input.expectedRevision),
          manifest: { source: "selected_resources" },
          items: sources.map((item) => ({
            ref: item.ref,
            projection: { title: item.title, ...item.facts },
          })),
        });
      } else throw new Error("Unknown result set action.");
      const value = record(result);
      return {
        ...value,
        modelOutput: [
          `Result set ${value.setId} revision ${value.revision}`,
          value.title,
          value.manifest ? `Coverage: ${formatPromptText(value.manifest)}` : "",
          ...rows(value.items).map(
            (item) =>
              `Item ${item.itemId}; ${formatPromptText(item.ref)}\n${formatPromptText(item.projection)}${item.unavailable ? "\nSource unavailable." : ""}`
          ),
          `Total: ${value.total ?? value.count ?? "unknown"}; next cursor: ${value.nextCursor ?? "none"}`,
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
  ),
  manage_views: tool(
    "manage_views",
    {
      action: {
        type: "string",
        enum: ["list", "create", "patch", "read", "archive"],
      },
      id: str,
      expectedRevision: num,
      title: str,
      description: str,
      definition: viewDefinitionInput,
      displayOrder: { type: "number" },
      cursor: str,
      limit: num,
      archived: { type: "boolean" },
    },
    ["action"],
    async (input, context) => {
      const scope = profileToolContext(context, "manage_views", input, {
        readOnly: ["read", "list"].includes(String(input.action)),
      });
      let result;
      if (input.action === "list") {
        const page = await listViews(scope, {
          cursor: text(input.cursor) || undefined,
          limit: input.limit === undefined ? undefined : Number(input.limit),
          archived: input.archived === true,
        });
        result = { views: page.items, nextCursor: page.nextCursor };
      } else if (input.action === "read")
        result = {
          view: await readView(scope, z.string().uuid().parse(input.id)),
        };
      else {
        const patch = z
          .object({
            id: z.string().uuid().optional(),
            expectedRevision: z.number().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            definition: z.unknown().optional(),
            displayOrder: z.number().optional(),
          })
          .parse(input);
        result = {
          view: await writeView(scope, {
            ...patch,
            requestId: scope.operationId,
            ...(input.action === "archive" ? { archived: true } : {}),
          }),
        };
      }
      const views = "views" in result ? result.views : [result.view];
      return {
        ...result,
        modelOutput:
          (views
            .map(formatCareerView)
            .join("\n\n") || "No saved views.") +
          ("nextCursor" in result
            ? `\nNext cursor: ${result.nextCursor ?? "none"}`
            : ""),
      };
    }
  ),
};
