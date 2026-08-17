import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { CareerOpportunityRun } from "@/components/career/types";
import { MessagesProvider } from "@/i18n/useMessage";
import { RecommendationSearchStatusPanel } from "./RecommendationSearchStatusPanel";

const createRun = (
  overrides: Partial<CareerOpportunityRun> = {}
): CareerOpportunityRun => ({
  active: true,
  agentVariant: null,
  candidateCount: null,
  completedAt: null,
  completionKind: null,
  coverage: {},
  createdAt: "2026-08-13T00:00:00.000Z",
  deliveryRetryPending: false,
  failureKind: null,
  id: "00000000-0000-4000-8000-000000000001",
  inputLocked: false,
  purposeText: "일본에서 지원할 수 있는 포지션",
  recommendationCount: null,
  requestedMaxResults: 5,
  searchTerminal: false,
  sourceKind: "on_demand",
  startedAt: null,
  status: "queued",
  trigger: "immediate_opportunity_requested",
  updatedAt: "2026-08-13T00:00:00.000Z",
  ...overrides,
});

test("renders a queued on-demand search without a fake cancel action", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <RecommendationSearchStatusPanel
        active
        onCancel={() => undefined}
        relation="accepted"
        run={createRun()}
      />
    </MessagesProvider>
  );

  assert.match(html, /검색 대기 중/);
  assert.match(html, /일본에서 지원할 수 있는 포지션/);
  assert.doesNotMatch(html, /검색 중지/);
});

test("keeps a blocking request's subject distinct after completion", () => {
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <RecommendationSearchStatusPanel
        relation="blocking_other_request"
        run={createRun({
          active: false,
          candidateCount: 61,
          completedAt: "2026-08-13T00:02:00.000Z",
          recommendationCount: 4,
          searchTerminal: true,
          status: "completed",
        })}
      />
    </MessagesProvider>
  );

  assert.match(html, /먼저 진행 중이던 검색 완료/);
  assert.match(html, /(?:61개 공고 검토|Reviewed 61 postings)/);
  assert.match(html, /(?:4개 추천|4 recommendations)/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /요청하신 검색 완료/);
});

test("renders delivery partial and stale timeout as different outcomes", () => {
  const partialHtml = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <RecommendationSearchStatusPanel
        relation="same_request"
        run={createRun({
          active: false,
          completedAt: "2026-08-13T00:02:00.000Z",
          deliveryRetryPending: true,
          searchTerminal: true,
          status: "partial",
        })}
      />
    </MessagesProvider>
  );
  const failedHtml = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <RecommendationSearchStatusPanel
        relation="accepted"
        run={createRun({
          active: false,
          failureKind: "stale_timeout",
          searchTerminal: true,
          status: "failed",
        })}
      />
    </MessagesProvider>
  );

  assert.match(partialHtml, /같은 조건의 검색 완료 · 일부 전달 문제/);
  assert.match(partialHtml, /다시 시도하고 있어요/);
  assert.match(failedHtml, /오랫동안 진행 신호가 없어/);
});

test("explains a blocked-company filter change without calling it a completed delivery", () => {
  const run = createRun({
    active: false,
    completedAt: "2026-08-13T00:02:00.000Z",
    completionKind: "cancelled_by_filter_change",
    searchTerminal: true,
    status: "completed",
  });
  const koreanHtml = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <RecommendationSearchStatusPanel relation="accepted" run={run} />
    </MessagesProvider>
  );
  const englishHtml = renderToStaticMarkup(
    <MessagesProvider locale="en">
      <RecommendationSearchStatusPanel relation="accepted" run={run} />
    </MessagesProvider>
  );

  assert.match(koreanHtml, /검색 결과를 전달하지 않았어요/);
  assert.match(koreanHtml, /차단 회사 설정이 변경되어/);
  assert.match(koreanHtml, /이번 검색 결과는 보내지 않았어요/);
  assert.doesNotMatch(koreanHtml, /요청하신 검색 완료/);
  assert.match(englishHtml, /Search (?:results )?not delivered/);
  assert.match(englishHtml, /blocked companies setting changed/);
  assert.match(englishHtml, /didn&#x27;t send this search/);
  assert.doesNotMatch(englishHtml, /Search complete/);
});
