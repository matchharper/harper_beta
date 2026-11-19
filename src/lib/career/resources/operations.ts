import { z } from "zod";
import {
  createOperation,
  readOperation,
  updateOperation,
  operationSchema,
  type ExternalOperation,
  type ExternalToolContext,
} from "../externalOperations/store";
import { careerExecutionEnvironment } from "../executionEnvironment";
import {
  criteriaSchema,
  buildResourceDecisionRequest,
  evaluateResource,
} from "./evaluate";
import { fitProvider } from "@/lib/externalRecommendationsV2/contract";
import { readResource } from "./read";
import { readCompanyProjections, targetKey } from "./companyData";
import { resolveSelection, publishSet, readSet, type ResultItem } from "./sets";
import { researchResource } from "./research";
import {
  databaseError,
  fingerprint,
  record,
  requestUuid,
  resourceDb,
  resourceRefSchema,
  selectionSchema,
  text,
  type ResourceContext,
} from "./types";
import { formatPromptText } from "@/lib/llm/promptText";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import {
  getLlmUsageContext,
  withLlmUsageContext,
} from "@/lib/llm/usageContext";

export const resourceOperationInput = z.object({
  matchingId: z.string().uuid().optional(),
  selection: selectionSchema,
  criteria: criteriaSchema.optional(),
  criteriaFromEvaluation: z.string().uuid().optional(),
  contextRefs: z.array(resourceRefSchema).default([]),
  knownSourceRefs: z.array(resourceRefSchema).default([]),
  companyEvidenceQuery: z.string().trim().optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
  questions: z.array(z.string().min(1)).optional(),
  searchOptions: z.record(z.unknown()).optional(),
  asOf: z.string().datetime().optional(),
  freshness: z
    .object({ maxAgeHours: z.number().int().min(-1).max(720) })
    .optional(),
});
export async function startResourceOperation(
  context: ExternalToolContext,
  kind: "resource_evaluation" | "resource_research",
  raw: unknown
) {
  const input = resourceOperationInput.parse(raw);
  if (input.matchingId) {
    const { requireResearchMatching } = await import("./searchHistory");
    await requireResearchMatching(context, input.matchingId);
  }
  // Save the evidence scope at admission so resumed work uses the same input.
  input.companyEvidenceQuery ??= "";
  if (input.criteriaFromEvaluation) {
    const previous = await readOperation(context, input.criteriaFromEvaluation);
    if (!previous || previous.kind !== "resource_evaluation")
      throw new Error("Evaluation unavailable.");
    input.criteria = criteriaSchema.parse(previous.request.criteria);
  }
  if (kind === "resource_evaluation" && !input.criteria?.length)
    throw new Error("Evaluation criteria are required.");
  const refs = await resolveSelection(context, input.selection, context.signal);
  const items: ResultItem[] = [];
  for (const ref of refs) {
    const source = await readResource(context, ref, input.companyEvidenceQuery);
    if (source.status !== "available")
      throw new Error("A selected source version is unavailable.");
    items.push({
      itemId: requestUuid(`${source.ref.kind}:${source.ref.id}`),
      ref: source.ref,
      projection: { title: source.title },
    });
  }
  const frozenContext = await Promise.all(
    input.contextRefs.map((ref) => readResource(context, ref, input.companyEvidenceQuery))
  );
  if (frozenContext.some((item) => item.status !== "available"))
    throw new Error("Context source unavailable.");
  const contextCompanies = await readCompanyProjections(context, frozenContext.map(source => source.ref), {
    mode: "list", labels: input.labels,
  });
  for (const source of frozenContext) {
    const company = contextCompanies.get(targetKey(source.ref));
    if (company) source.publicCompany = company;
  }
  const knownSources = await Promise.all(
    input.knownSourceRefs.map((ref) => readResource(context, ref))
  );
  if (knownSources.some((item) => item.status !== "available"))
    throw new Error("Known source unavailable.");
  const operation = await createOperation(context, {
    kind,
    idempotencyKey: context.requestId,
    request: {
      ...input,
      selection: { refs: items.map((item) => item.ref) },
      contextRefs: frozenContext.map((item) => item.ref),
      contextSnapshot: frozenContext,
      knownSourceRefs: knownSources.map((item) => item.ref),
      execution_environment: careerExecutionEnvironment(),
      reply_id: context.replyId ?? null,
    },
  });
  if (!operation.request.inputSet) {
    const setId = requestUuid(`${operation.id}:input`);
    let set;
    try {
      set = await readSet(context, { setId, revision: 1, limit: 1 });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("Set unavailable")
      )
        throw error;
    }
    const inputSet = set
      ? { setId, revision: 1, count: set.total }
      : await publishSet(context, {
          id: setId,
          operationId: operation.id,
          manifest: {
            purpose: "operation_input",
            originalSelection: input.selection,
          },
          items,
        });
    await updateOperation(context, operation, {
      request: { ...operation.request, inputSet },
      result: { cursor: 0, completed: 0, failed: 0 },
    });
  }
  const current = (await readOperation(context, operation.id))!;
  const { publishResourceJob } = await import("./queue");
  try {
    await publishResourceJob({
      kind: "operation",
      id: current.id,
      revision: current.revision,
      cursor: Number(current.result.cursor ?? 0),
    });
  } catch (error) {
    console.warn(
      "[career-resources] Reserved operation awaits durable publisher",
      { id: current.id, error: String(error) }
    );
  }
  return current;
}

export function formatResourceOperation(operation: ExternalOperation) {
  return [
    `${operation.kind} ${operation.id}; status ${operation.status}; revision ${operation.revision}`,
    operation.request.matchingId ? `Matching: ${operation.request.matchingId}` : "",
    `Updated ${formatLlmDateTime(operation.updated_at)}`,
    `Completed ${operation.result.completed ?? 0}; reused item receipts ${operation.result.cacheHits ?? 0}; failed ${operation.result.failed ?? 0}; cursor ${operation.result.cursor ?? 0}`,
    operation.result.set
      ? `Result set: ${formatPromptText(operation.result.set)}`
      : "No result set published yet.",
    text(operation.result.error),
    text(operation.result.modelOutput),
  ]
    .filter(Boolean)
    .join("\n");
}

/** Each provider item is durably cached; a chunk publishes one immutable partial set. */
export async function processResourceOperation(
  context: ResourceContext,
  id: string,
  expectedRevision: number,
  deadlineAt: number
) {
  const db = resourceDb(context.admin),
    lease = crypto.randomUUID();
  const claimed = await db.rpc("career_claim_resource_operation_v1", {
    p_user: context.userId,
    p_id: id,
    p_revision: expectedRevision,
    p_environment: careerExecutionEnvironment(),
    p_lease: lease,
  });
  databaseError(claimed.error);
  if (!claimed.data) return;
  let operation = operationSchema.parse(claimed.data);
  const input = resourceOperationInput.parse(operation.request);
  // A process can die after reserving the operation but before saving its input
  // set. The frozen source references are already durable on that reservation.
  if (!operation.request.inputSet) {
    try {
      const refs = await resolveSelection(context, input.selection),
        setId = requestUuid(`${operation.id}:input`);
      const existing = await db
        .from("career_result_sets")
        .select("id,revision")
        .eq("id", setId)
        .eq("talent_id", context.userId)
        .eq("revision", 1)
        .maybeSingle();
      databaseError(existing.error);
      const inputSet = existing.data
        ? { setId, revision: 1 }
        : await publishSet(context, {
            id: setId,
            operationId: operation.id,
            manifest: { purpose: "operation_input" },
            items: refs.map((ref) => ({ ref, projection: {} })),
          });
      operation = await updateOperation(context, operation, {
        request: { ...operation.request, inputSet },
      });
    } catch (error) {
      await updateOperation(context, operation, {
        status: "failed",
        result: {
          ...operation.result,
          error: `Input recovery failed: ${String(error)}`,
        },
        provider_refs: { ...operation.provider_refs, lease_until: null },
      });
      return;
    }
  }
  const inputSet = z
    .object({ setId: z.string(), revision: z.number() })
    .parse(operation.request.inputSet);
  let cursor = Number(operation.result.cursor ?? 0),
    completed = Number(operation.result.completed ?? 0),
    failed = Number(operation.result.failed ?? 0),
    cacheHits = Number(operation.result.cacheHits ?? 0);
  const all: ResultItem[] = [];
  const previousSet = record(operation.result.set);
  if (previousSet.setId && !operation.result.reset) {
    let pageCursor: string | undefined;
    do {
      const page = await readSet(context, {
        setId: String(previousSet.setId),
        revision: Number(previousSet.revision),
        cursor: pageCursor,
        limit: 500,
      });
      all.push(...page.items);
      pageCursor = page.nextCursor ?? undefined;
    } while (pageCursor);
  }
  let more = true;
  let waitingUntil: string | null = null;
  while (Date.now() < deadlineAt - 65_000) {
    const latest = await readOperation(context, operation.id);
    if (
      !latest ||
      latest.status !== "running" ||
      latest.revision !== operation.revision
    )
      return;
    const page = await readSet(context, {
      ...inputSet,
      cursor: String(cursor),
      limit: 1,
    });
    if (!page.items.length) {
      more = false;
      break;
    }
    const item = page.items[0];
    let child: ExternalOperation | undefined;
    try {
      const companyOptions = { mode: "list" as const, labels: input.labels };
      const resource = await readResource(context, item.ref, input.companyEvidenceQuery ?? null, companyOptions),
        contextItems = await Promise.all(
          input.contextRefs.map((ref) => readResource(context, ref, input.companyEvidenceQuery ?? null, companyOptions))
        );
      if (
        resource.status !== "available" ||
        contextItems.some((source) => source.status !== "available")
      )
        throw new Error(
          "Source version unavailable; no calculation performed."
        );
      const actualInput =
        operation.kind === "resource_evaluation"
          ? buildResourceDecisionRequest({
              provider: fitProvider(),
              criteria: criteriaSchema.parse(input.criteria),
              resource,
              context: contextItems,
              asOf: input.asOf,
            })
          : {
              resource,
              questions: input.questions ?? [],
              knownSourceRefs: input.knownSourceRefs,
              companyEvidenceQuery: input.companyEvidenceQuery,
              searchOptions: input.searchOptions,
              freshness: input.freshness,
            };
      // Shared personal context is frozen once. Every cached item retains a ref
      // to that snapshot, so retention keeps it even when another parent reuses
      // the item. Exact input hashing still includes all provider input text.
      if (
        operation.kind === "resource_evaluation" &&
        !Array.isArray(operation.request.contextSnapshot)
      )
        operation = await updateOperation(context, operation, {
          request: { ...operation.request, contextSnapshot: contextItems },
        });
      const inputSnapshot =
        operation.kind === "resource_evaluation"
          ? {
              resource,
              ...(fingerprint(contextItems) === fingerprint(operation.request.contextSnapshot)
                ? { contextSnapshotRef: { kind: "operation", id: operation.id } }
                : { context: contextItems }),
              criteria: input.criteria,
              asOf: input.asOf,
              provider: fitProvider(),
              adapterVersion: "resource-decisions-v1",
            }
          : actualInput;
      const baseKey = `resource-item-v1:${fingerprint({ owner: context.userId, kind: operation.kind, actualInput })}`;
      // Explicit freshness starts a new research receipt for this parent. Public
      // page fetches still coalesce and reuse evidence within the requested age.
      const key =
        operation.kind === "resource_research" &&
        input.freshness &&
        input.freshness.maxAgeHours !== -1
          ? `${baseKey}:${operation.id}`
          : baseKey;
      const reserved = await db.rpc("create_talent_external_operation", {
        p_user_id: context.userId,
        p_conversation_id: operation.conversation_id,
        p_kind: "resource_item",
        p_parent_id: null,
        p_idempotency_key: key,
        p_request: {
          sourceRefs: [
            resource.ref,
            ...contextItems.map((source) => source.ref),
            ...[resource, ...contextItems].flatMap(source => {
              const company = source.publicCompany;
              if (!company) return [];
              const data = company.items.filter(item => item.dataRef.id !== company.summary?.dataRef.id);
              if (company.summary) data.push(company.summary);
              return data.flatMap(item => [item.dataRef, ...item.sourceRefs]);
            }),
            ...input.knownSourceRefs,
          ],
          execution_environment: careerExecutionEnvironment(),
          inputFingerprint: fingerprint(actualInput),
          inputSnapshot,
        },
      });
      databaseError(reserved.error);
      child = operationSchema.parse(
        Array.isArray(reserved.data) ? reserved.data[0] : reserved.data
      );
      if (child.status === "failed")
        child = await updateOperation(context, child, {
          status: "reserved",
          provider_refs: { ...child.provider_refs, lease_until: null },
        });
      if (child.status === "completed") cacheHits++;
      else {
        // Child provider calls share the same DB lease protocol across parents.
        const childLease = await db.rpc("career_claim_resource_operation_v1", {
          p_user: context.userId,
          p_id: child.id,
          p_revision: child.revision,
          p_environment: careerExecutionEnvironment(),
          p_lease: lease,
        });
        databaseError(childLease.error);
        if (!childLease.data) {
          const currentChild = await readOperation(context, child.id);
          waitingUntil =
            text(currentChild?.provider_refs.lease_until) ||
            new Date(Date.now() + 60_000).toISOString();
          break;
        }
        child = operationSchema.parse(childLease.data);
        const signal = AbortSignal.timeout(
          Math.max(1, deadlineAt - Date.now() - 15_000)
        );
        const result = await withLlmUsageContext(
          {
            ...getLlmUsageContext(),
            userId: context.userId,
            requestId: operation.id,
            careerOperationId: child.id,
            careerOperationKind: operation.kind,
            parentOperationId: operation.id,
          },
          () =>
            operation.kind === "resource_evaluation"
              ? evaluateResource({
                  resource,
                  context: contextItems,
                  criteria: criteriaSchema.parse(input.criteria),
                  asOf: input.asOf,
                  signal,
                })
              : researchResource(context, {
                  resource,
                  questions: input.questions ?? [],
                  knownSourceRefs: input.knownSourceRefs,
                  companyEvidenceQuery: input.companyEvidenceQuery,
                  searchOptions: input.searchOptions,
                  freshness: input.freshness,
                  signal,
                })
        );
        child = await updateOperation(context, child, {
          status: "completed",
          result,
          request: {
            ...child.request,
            sourceRefs: [
              ...(child.request.sourceRefs as unknown[]),
              ...("sourceRefs" in result ? result.sourceRefs : []),
            ],
          },
          provider_refs: { ...child.provider_refs, lease_until: null },
        });
      }
      all.push({
        ...item,
        evaluationRef: { kind: "operation", id: child.id },
        projection: {
          ...item.projection,
          status: "completed",
          ...Object.fromEntries(
            (Array.isArray(child.result.evaluations)
              ? child.result.evaluations
              : []
            ).map((raw) => {
              const row = record(raw);
              return [String(row.name), row.value];
            })
          ),
          ...(operation.kind === "resource_research"
            ? {
                sourceRefs: child.result.sourceRefs,
                failures: child.result.failures,
              }
            : {}),
        },
      });
      completed++;
    } catch (error) {
      if (
        child?.status === "running" &&
        child.provider_refs.lease_owner === lease
      )
        await updateOperation(context, child, {
          status: "failed",
          result: { error: String(error) },
          provider_refs: { ...child.provider_refs, lease_until: null },
        }).catch(() => undefined);
      all.push({
        ...item,
        projection: {
          ...item.projection,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        },
      });
      failed++;
    }
    cursor++;
    if (!page.nextCursor) {
      more = false;
      break;
    }
  }
  const setId = requestUuid(`${operation.id}:results`),
    revision = Number(previousSet.revision ?? 0);
  let resultSet;
  try {
    resultSet = await publishSet(context, {
      id: setId,
      expectedRevision: revision,
      operationId: operation.id,
      manifest: {
        operationId: operation.id,
        cursor,
        complete: !more,
        completed,
        failed,
        cacheHits,
        criteria: input.criteria ?? null,
      },
      items: all,
    });
  } catch (error) {
    const existing = await readSet(context, {
      setId,
      revision: revision + 1,
      limit: 1,
    });
    if (existing.manifest.cursor !== cursor) throw error;
    resultSet = { setId, revision: revision + 1, count: existing.total };
  }
  operation = await updateOperation(context, operation, {
    status: more ? "reserved" : failed ? "partial" : "completed",
    result: { cursor, completed, failed, cacheHits, set: resultSet },
    provider_refs: { ...operation.provider_refs, lease_until: waitingUntil },
  });
  if (more && !waitingUntil) {
    const { publishResourceJob } = await import("./queue");
    await publishResourceJob({
      kind: "operation",
      id,
      revision: operation.revision,
      cursor,
    });
  } else if (
    operation.conversation_id &&
    typeof operation.request.reply_id === "string"
  ) {
    const { resumeCareerAgentAfterWork } = await import("../agentContinuation");
    await resumeCareerAgentAfterWork({
      ...context,
      conversationId: operation.conversation_id,
      replyId: operation.request.reply_id,
    });
  }
}
