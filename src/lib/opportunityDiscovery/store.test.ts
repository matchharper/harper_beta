import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpportunityDiscoveryRun,
  hasActiveConversationCompletedOpportunityRun,
  serializeOpportunityRun,
} from "./store";
import type { OpportunityRunRow } from "./types";

const createRun = (
  overrides: Partial<OpportunityRunRow> = {}
): OpportunityRunRow => ({
  completed_at: null,
  conversation_id: "conversation-1",
  coverage: {},
  created_at: "2026-08-13T00:00:00.000Z",
  dedupe_key: null,
  error_message: "provider secret must not be serialized",
  id: "00000000-0000-4000-8000-000000000001",
  query_plan: {},
  run_mode: "immediate",
  settings_snapshot: {},
  started_at: null,
  status: "queued",
  talent_id: "talent-1",
  target_recommendation_count: 5,
  trigger: "immediate_opportunity_requested",
  trigger_payload: {},
  updated_at: "2026-08-13T00:00:00.000Z",
  ...overrides,
});

test("uses the active conversation-completed run as the waiting-period boundary", async () => {
  const filters: Array<{
    field: string;
    operation: "eq" | "in";
    value: unknown;
  }> = [];
  const query = {
    select(columns: string, options: Record<string, unknown>) {
      assert.equal(columns, "id");
      assert.deepEqual(options, { count: "exact", head: true });
      return query;
    },
    eq(field: string, value: unknown) {
      filters.push({ field, operation: "eq", value });
      return query;
    },
    async in(field: string, value: unknown) {
      filters.push({ field, operation: "in", value });
      return { count: 1, error: null };
    },
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "opportunity_discovery_run");
      return query;
    },
  };

  const active = await hasActiveConversationCompletedOpportunityRun({
    admin: admin as never,
    userId: "talent-1",
  });

  assert.equal(active, true);
  assert.deepEqual(filters, [
    { field: "talent_id", operation: "eq", value: "talent-1" },
    { field: "trigger", operation: "eq", value: "conversation_completed" },
    {
      field: "status",
      operation: "in",
      value: ["queued", "running"],
    },
  ]);
});

test("ends the waiting period when the conversation-completed run is terminal", async () => {
  const query = {
    select() {
      return query;
    },
    eq() {
      return query;
    },
    async in() {
      return { count: 0, error: null };
    },
  };
  const admin = {
    from() {
      return query;
    },
  };

  const active = await hasActiveConversationCompletedOpportunityRun({
    admin: admin as never,
    userId: "talent-1",
  });

  assert.equal(active, false);
});

test("stores an explicit run recommendation target without the user-setting clamp", async () => {
  let insertedPayload: Record<string, unknown> | null = null;
  const admin = {
    from(table: string) {
      if (table === "talent_setting") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: {
                        get_external_recommendation: true,
                        profile_visibility: "anonymous",
                        recommendation_batch_size: 3,
                      },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "opportunity_discovery_run") {
        return {
          insert(payload: Record<string, unknown>) {
            insertedPayload = payload;
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "run-1", ...payload }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  await createOpportunityDiscoveryRun({
    admin: admin as never,
    conversationId: "conversation-1",
    runMode: "initial",
    talentId: "talent-1",
    targetRecommendationCount: 15,
    trigger: "conversation_completed",
    triggerPayload: { entryPoint: "first_onboarding_batch" },
  });

  const savedPayload = insertedPayload as Record<string, unknown> | null;
  assert.ok(savedPayload);
  assert.equal(savedPayload.target_recommendation_count, 15);
  assert.deepEqual(savedPayload.settings_snapshot, {
    getExternalRecommendation: true,
    profileVisibility: "exceptional_only",
    recommendationBatchSize: 15,
  });
});

test("does not add a target column to runs without an explicit target", async () => {
  let insertedPayload: Record<string, unknown> | null = null;
  const admin = {
    from(table: string) {
      if (table === "talent_setting") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return {
                      data: { recommendation_batch_size: 3 },
                      error: null,
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "opportunity_discovery_run") {
        return {
          insert(payload: Record<string, unknown>) {
            insertedPayload = payload;
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "run-2", ...payload }, error: null };
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  await createOpportunityDiscoveryRun({
    admin: admin as never,
    conversationId: "conversation-2",
    talentId: "talent-2",
    trigger: "immediate_opportunity_requested",
    triggerPayload: { request: { maxResults: 20 } },
  });

  const savedPayload = insertedPayload as Record<string, unknown> | null;
  assert.ok(savedPayload);
  assert.equal("target_recommendation_count" in savedPayload, false);
  assert.equal(
    (savedPayload.settings_snapshot as Record<string, unknown>)
      .recommendationBatchSize,
    3
  );
});

test("serializes a career chat run as active without locking conversation input", () => {
  const run = serializeOpportunityRun(
    createRun({
      trigger_payload: {
        locksConversationInput: false,
        request: {
          maxResults: 5,
          purposeText: "일본에서 지원할 수 있는 포지션",
        },
        runContract: "career_chat_external_search_v1",
      },
    })
  );

  assert.equal(run?.active, true);
  assert.equal(run?.inputLocked, false);
  assert.equal(run?.sourceKind, "on_demand");
  assert.equal(run?.purposeText, "일본에서 지원할 수 있는 포지션");
  assert.equal(run?.requestedMaxResults, 5);
  assert.equal("errorMessage" in (run ?? {}), false);
});

test("exposes safe terminal counts and retry state without raw coverage", () => {
  const run = serializeOpportunityRun(
    createRun({
      completed_at: "2026-08-13T00:02:00.000Z",
      coverage: {
        candidateCount: 42,
        delivery: { chat: "sent", email: "retry_scheduled", token: "secret" },
        deliveryRetryPending: true,
        providerPayload: "secret",
        recommendationCount: 3,
        searchTerminal: true,
      },
      status: "partial",
    })
  );

  assert.equal(run?.candidateCount, 42);
  assert.equal(run?.recommendationCount, 3);
  assert.equal(run?.deliveryRetryPending, true);
  assert.equal(run?.searchTerminal, true);
  assert.deepEqual(run?.coverage.delivery, {
    chat: "sent",
    email: "retry_scheduled",
  });
  assert.equal("providerPayload" in (run?.coverage ?? {}), false);
});

test("derives user-facing counts from the worker candidateCounts shape", () => {
  const run = serializeOpportunityRun(
    createRun({
      coverage: {
        candidateCounts: {
          detailedExternal: 4,
          externalAfterLivenessFilter: 61,
          externalRaw: 84,
          internal: 999,
        },
      },
      status: "completed",
    })
  );

  assert.equal(run?.candidateCount, 61);
  assert.equal(run?.recommendationCount, 4);
  assert.deepEqual(run?.coverage.candidateCounts, {
    detailedExternal: 4,
    externalAfterLivenessFilter: 61,
    externalRaw: 84,
  });
});
