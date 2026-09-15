import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { CareerOpportunityRun } from "@/components/career/types";
import { MessagesProvider } from "@/i18n/useMessage";
import CareerInitialOpportunitySearchStatus, {
  resolveInitialOpportunitySearchStatus,
} from "./CareerInitialOpportunitySearchStatus";

const createRun = (
  overrides: Partial<CareerOpportunityRun> = {}
): CareerOpportunityRun => ({
  active: true,
  agentVariant: null,
  candidateCount: null,
  completedAt: null,
  completionKind: null,
  coverage: {},
  createdAt: "2026-09-14T00:00:00.000Z",
  deliveryRetryPending: false,
  failureKind: null,
  id: "00000000-0000-4000-8000-000000000001",
  inputLocked: false,
  purposeText: null,
  recommendationCount: null,
  requestedMaxResults: 15,
  searchTerminal: false,
  sourceKind: "initial",
  startedAt: null,
  status: "queued",
  trigger: "conversation_completed",
  updatedAt: "2026-09-14T00:00:00.000Z",
  ...overrides,
});

test("shows the home status for an active initial opportunity search", () => {
  const status = resolveInitialOpportunitySearchStatus(createRun());
  assert.ok(status);
  const html = renderToStaticMarkup(
    <MessagesProvider locale="ko">
      <CareerInitialOpportunitySearchStatus status={status} variant="home" />
    </MessagesProvider>
  );

  assert.match(html, /Harper가 잘 맞는 기회를 찾고 있어요/);
  assert.match(html, /화면을 닫아도 탐색은 계속됩니다/);
  assert.doesNotMatch(html, /action/);
});

test("shows the same active-search status for a periodic run", () => {
  const status = resolveInitialOpportunitySearchStatus(
    createRun({
      sourceKind: "periodic",
      trigger: "periodic_refresh_due",
    })
  );

  assert.equal(status, "queued");
});

test("does not show the status without an active run", () => {
  assert.equal(resolveInitialOpportunitySearchStatus(null), null);
  assert.equal(
    resolveInitialOpportunitySearchStatus(createRun({ status: "completed" })),
    null
  );
});

test("uses the same composer presentation for queued and running searches", () => {
  const render = (status: "queued" | "running") =>
    renderToStaticMarkup(
      <MessagesProvider locale="ko">
        <CareerInitialOpportunitySearchStatus
          status={status}
          variant="composer"
        />
      </MessagesProvider>
    );

  const queuedHtml = render("queued");
  const runningHtml = render("running");

  assert.match(queuedHtml, /기회를 찾고 있어요/);
  assert.match(runningHtml, /기회를 찾고 있어요/);
  assert.match(queuedHtml, /\/svgs\/face\.svg/);
  assert.match(queuedHtml, /career-thinking-shimmer-slow/);
  assert.match(queuedHtml, /bg-transparent/);
});
