import assert from "node:assert/strict";
import test from "node:test";

import { serializeOpportunityRun } from "./store";
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
