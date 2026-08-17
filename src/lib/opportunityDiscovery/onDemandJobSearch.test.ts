import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT,
  buildActiveCareerChatExternalSearchResult,
  buildOnDemandJobSearchStatusUnknownResult,
  enqueueOnDemandJobSearch,
  extractRecommendJobPostingsReceipt,
  isCareerChatExternalSearchRun,
  normalizeOnDemandJobSearchMaxResults,
  normalizeRecommendJobPostingsKind,
} from "./onDemandJobSearch";

test("normalizes on-demand result limits at the server boundary", () => {
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(undefined), {
    maxResults: 15,
    maxResultsAdjusted: false,
    originalMaxResults: null,
  });
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(0), {
    maxResults: 1,
    maxResultsAdjusted: true,
    originalMaxResults: 0,
  });
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(15), {
    maxResults: 15,
    maxResultsAdjusted: false,
    originalMaxResults: 15,
  });
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(20), {
    maxResults: 20,
    maxResultsAdjusted: false,
    originalMaxResults: 20,
  });
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(25), {
    maxResults: 20,
    maxResultsAdjusted: true,
    originalMaxResults: 25,
  });
  assert.deepEqual(normalizeOnDemandJobSearchMaxResults(4.5), {
    maxResults: 15,
    maxResultsAdjusted: true,
    originalMaxResults: 4.5,
  });
});

test("defaults recommendation kind to instant and accepts only explicit bulk", () => {
  assert.equal(normalizeRecommendJobPostingsKind(undefined), "instant");
  assert.equal(normalizeRecommendJobPostingsKind("instant"), "instant");
  assert.equal(normalizeRecommendJobPostingsKind("bulk"), "bulk");
  assert.equal(normalizeRecommendJobPostingsKind("BULK"), "instant");
});

test("detects only the dedicated career chat external-search contract", () => {
  assert.equal(
    isCareerChatExternalSearchRun({
      trigger_payload: {
        runContract: CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT,
      },
    }),
    true
  );
  assert.equal(
    isCareerChatExternalSearchRun({
      trigger: "immediate_opportunity_requested",
      trigger_payload: {},
    }),
    false
  );
});

test("builds a fail-closed localized result when the async drain guard is unknown", () => {
  const result = buildOnDemandJobSearchStatusUnknownResult({
    locale: "en",
    maxResultsInput: 20,
    request: "Find Japan roles",
  });

  assert.equal(result.outcome, "enqueue_status_unknown");
  assert.equal(result.accepted, false);
  assert.equal(result.requestedRequest.maxResults, 20);
  assert.equal(result.statusRunId, null);
  assert.match(result.answerDraft, /could not confirm/i);
  assert.doesNotMatch(result.answerDraft, /[가-힣]/);
});

test("keeps an RPC transport failure unknown when immediate reconciliation finds no row", async () => {
  const query = {
    eq() {
      return this;
    },
    limit() {
      return this;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    select() {
      return this;
    },
  };
  const admin = {
    from(table: string) {
      if (table === "talent_setting") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      }
      if (table === "talent_users") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { email: "person@example.com" },
            error: null,
          }),
        };
      }
      assert.equal(table, "opportunity_discovery_run");
      return query;
    },
    rpc: async () => ({
      data: null,
      error: { message: "connection closed after request was sent" },
    }),
  };

  const result = await enqueueOnDemandJobSearch({
    admin: admin as never,
    conversationId: "00000000-0000-4000-8000-000000000002",
    maxResultsInput: 5,
    request: "Japan roles",
    responseLocale: "en",
    userId: "00000000-0000-4000-8000-000000000003",
    userMessageId: 123,
  });

  assert.equal(result.outcome, "enqueue_status_unknown");
  assert.equal(result.statusRunId, null);
  assert.match(result.answerDraft, /could not confirm/i);
  assert.doesNotMatch(result.answerDraft, /has not started/i);
});

test("builds an English different-request receipt without merging criteria", () => {
  const result = buildActiveCareerChatExternalSearchResult({
    activeRun: {
      completed_at: null,
      conversation_id: "conversation-1",
      coverage: {},
      created_at: "2026-08-14T00:00:00.000Z",
      dedupe_key: "existing",
      error_message: null,
      id: "00000000-0000-4000-8000-000000000001",
      query_plan: {},
      run_mode: "immediate",
      settings_snapshot: {},
      started_at: null,
      status: "queued",
      talent_id: "talent-1",
      target_recommendation_count: 5,
      trigger: "immediate_opportunity_requested",
      trigger_payload: {
        request: {
          fingerprint: "different",
          text: "Seoul infrastructure roles",
        },
        runContract: CAREER_CHAT_EXTERNAL_SEARCH_RUN_CONTRACT,
      },
      updated_at: "2026-08-14T00:00:00.000Z",
    },
    directUserRequest: true,
    kind: "bulk",
    maxResultsInput: 5,
    request: "Japan roles",
    responseLocale: "en",
  });

  assert.equal(result.outcome, "active_different_request");
  assert.equal(result.currentRequestApplied, false);
  assert.equal(result.currentRequestMergedIntoActiveRun, false);
  assert.match(result.answerDraft, /were not added to or merged/);
  assert.doesNotMatch(result.answerDraft, /[가-힣]/);
});

test("does not describe an initial blocking run as the newly requested purpose", () => {
  const result = buildActiveCareerChatExternalSearchResult({
    activeRun: {
      completed_at: null,
      conversation_id: "conversation-1",
      coverage: {},
      created_at: "2026-08-14T00:00:00.000Z",
      dedupe_key: "initial",
      error_message: null,
      id: "00000000-0000-4000-8000-000000000001",
      query_plan: {},
      run_mode: "initial",
      settings_snapshot: {},
      started_at: null,
      status: "queued",
      talent_id: "talent-1",
      target_recommendation_count: 5,
      trigger: "conversation_completed",
      trigger_payload: {},
      updated_at: "2026-08-14T00:00:00.000Z",
    },
    directUserRequest: true,
    kind: "bulk",
    maxResultsInput: 5,
    request: "이번에는 일본 공고를 찾아줘",
    responseLocale: "ko",
  });

  assert.equal(result.outcome, "active_different_request");
  assert.equal(result.statusRun.purposeText, "온보딩 완료 후 첫 추천 검색");
  assert.match(result.answerDraft, /온보딩 완료 후 첫 추천 검색/);
  assert.match(result.answerDraft, /일본 공고/);
});

test("extracts only complete async receipts and keeps new-run semantics", () => {
  assert.deepEqual(
    extractRecommendJobPostingsReceipt({
      answerDraft: "Queued.\n\nYou may leave.",
      newRunCreated: true,
      outcome: "queued",
      statusRelation: "accepted",
      statusRunId: "00000000-0000-4000-8000-000000000001",
    }),
    {
      answerDraft: "Queued.\n\nYou may leave.",
      newRunCreated: true,
      outcome: "queued",
      statusRelation: "accepted",
      statusRunId: "00000000-0000-4000-8000-000000000001",
    }
  );
  assert.equal(
    extractRecommendJobPostingsReceipt({
      answerDraft: "Not actually linked",
      outcome: "queued",
      statusRelation: "accepted",
      statusRunId: null,
    }),
    null
  );
});
