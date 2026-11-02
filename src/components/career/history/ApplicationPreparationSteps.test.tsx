import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { createSimulationSession } from "@/lib/career/simulation/session";
import { createPreparation } from "@/lib/career/simulation/preparation";
import { prepareApplicationReview } from "@/lib/career/simulation/applicationReview";
import { applicationReviewView } from "@/lib/career/simulation/applicationReviewView";
import { ApplicationPreparationRows } from "./ApplicationPreparationSteps";

function fixture(saved = false) {
  const state = createSimulationSession({
    roleName: "Example",
    roleRef: "job:example",
    documentId: "resume",
    documentName: "Resume",
  });
  state.preparation = createPreparation();
  state.analysisStatus = "completed";
  if (saved) {
    state.preparation.finalDocumentId = "tailored-resume";
    state.applicationUrl = "https://example.test/apply";
    state.applicationForm = {
      status: "read",
      url: state.applicationUrl,
      checkedAt: state.startedAt,
      fields: [],
      limitations: [],
      submission: { status: "supported" },
    };
    state.applicationReview = prepareApplicationReview(
      state,
      "tailored-resume"
    );
  }
  return state;
}
function render(
  state: ReturnType<typeof fixture>,
  continuationDisabled = false
) {
  return new JSDOM(
    renderToStaticMarkup(
      <MessagesProvider locale="ko">
        <ApplicationPreparationRows
          application={applicationReviewView({ messageId: 1, state })}
          continuationDisabled={continuationDisabled}
          onContinue={() => {}}
          onReview={() => {}}
          onDocument={() => {}}
          onOpenChat={() => {}}
          onOpenLink={() => {}}
        />
      </MessagesProvider>
    )
  ).window.document;
}
const buttons = (doc: Document) => [...doc.querySelectorAll("button")];

test("unprepared materials offer one continuation without claiming work is running", () => {
  const doc = render(fixture());
  assert.equal(doc.querySelectorAll("li").length, 2);
  assert.deepEqual(
    [...doc.querySelectorAll('[role="status"]')].map((el) => el.textContent),
    ["준비 전", "준비 전"]
  );
  assert.deepEqual(
    buttons(doc).map((b) => b.textContent),
    ["지원 준비 이어서 하기"]
  );
});

test("chat activity blocks only continuation, not saved material inspection", () => {
  const doc = render(fixture(true), true);
  assert.deepEqual(
    buttons(doc).map((b) => [b.textContent, b.disabled]),
    [
      ["이력서 보기", false],
      ["내용 확인", false],
      ["이어서 지원하기", true],
    ]
  );
});

test("unsupported site remains accessible during chat activity", () => {
  const state = fixture(true);
  state.applicationForm!.submission!.status = "unsupported";
  const action = buttons(render(state, true)).at(-1)!;
  assert.equal(action.textContent, "지원 사이트 열기");
  assert.equal(action.disabled, false);
});

test("active and waiting applications open chat without starting another submission", () => {
  for (const status of ["running", "waiting"] as const) {
    const state = fixture(true);
    state.browser = {
      id: "attempt",
      status,
      engine: "browser-use-agents",
      startedAt: state.startedAt,
      updatedAt: state.startedAt,
      documentId: "resume",
      documentHash: "hash",
      url: "https://example.test/apply",
      purpose: "Apply",
    };
    const action = buttons(render(state, true)).at(-1)!;
    assert.equal(action.textContent, "대화로 이동");
    assert.equal(action.disabled, false);
  }
});

test("submitted label requires approved execution and website evidence, even without a saved review", () => {
  const state = fixture();
  state.browser = {
    id: "attempt",
    status: "succeeded",
    engine: "browser-use-agents",
    startedAt: state.startedAt,
    updatedAt: state.startedAt,
    documentId: "resume",
    documentHash: "hash",
    url: "https://example.test/apply",
    purpose: "Apply",
  };
  let doc = render(state);
  assert.match(doc.body.textContent!, /제출 확인 필요/);
  assert.equal(buttons(doc).at(-1)!.textContent, "대화로 이동");
  state.browser.approval = {
    fingerprint: "approval",
    approved: true,
    executed: true,
    summary: "Approved",
  };
  state.browser.result = {
    summary: "Submitted",
    url: "https://example.test/confirmation",
    evidence: "receipt",
  };
  doc = render(state);
  assert.match(doc.body.textContent!, /지원 완료/);
  assert.equal(buttons(doc).at(-1)!.textContent, "결과 보기");
  assert.equal(
    buttons(doc).some((b) => b.textContent === "이어서 지원하기"),
    false
  );
});
