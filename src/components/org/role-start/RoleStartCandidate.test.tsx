import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import type { RoleStartCandidateView } from "@/lib/org/roleStart/view";
import { CandidateRating, type RoleStartEvaluateBody } from "./RoleStartCandidate";

test("ratings submit explicitly, retain the draft after failure, and advance only after a successful retry", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const candidate: RoleStartCandidateView = {
    talentId: "synthetic-rating-candidate", name: "예시 후보", headline: null,
    location: null, current: null, years: null, yearsBasis: null, failed: false,
    verdict: {
      tldr: "예시 경력", finalFit: "good", companyQuestion: null, criteria: [],
      reasonChips: [{ id: "experience", label: "관련 경험", appliesTo: ["good"] }],
    },
  };
  const calls: RoleStartEvaluateBody[] = [];
  let advanced = 0;
  let finish!: (result: object) => void;
  const pending = new Promise<object>(resolve => { finish = resolve; });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const buttons = () => [...dom.window.document.querySelectorAll("button")];
  const submit = () => dom.window.document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  try {
    await act(async () => {
      root.render(
        <OrgLocaleScope locale="ko">
          <CandidateRating
            busy={false} candidate={candidate} editable
            evaluation={{ rating: "good", answer: null, note: null, reasons: [], reasonText: "남겨 둔 메모", reasonsSkipped: false }}
            onEvaluate={body => { calls.push(body); return calls.length === 1 ? null : pending; }}
            onSubmitted={() => { advanced++; }}
          />
        </OrgLocaleScope>
      );
    });
    await act(async () => { buttons().find(button => button.textContent === "관련 경험")!.click(); });
    assert.equal(calls.length, 0, "selection must not persist a partial evaluation");
    await act(async () => { submit(); });
    assert.equal(advanced, 0, "a failed save must not advance");
    assert.equal(dom.window.document.querySelector("textarea")!.value, "남겨 둔 메모");
    assert.equal(buttons().find(button => button.textContent === "관련 경험")!.getAttribute("aria-pressed"), "true");
    await act(async () => { submit(); });
    assert.equal(advanced, 0, "wait for the save response");
    assert.equal(buttons().find(button => button.textContent === "제출하기")!.disabled, true);
    await act(async () => { submit(); });
    assert.equal(calls.length, 2, "ignore duplicate submission while pending");
    assert.deepEqual(calls[1].reasonIds, ["experience"]);
    assert.equal(calls[1].reasonText, "남겨 둔 메모");
    await act(async () => { finish({ session: {} }); });
    assert.equal(advanced, 1);
  } finally {
    finish({});
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, { window: originalWindow, document: originalDocument, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});

test("written feedback submits without a rating, while blank feedback cannot submit", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const candidate: RoleStartCandidateView = {
    talentId: "synthetic-text-feedback", name: "예시 후보", headline: null,
    location: null, current: null, years: null, yearsBasis: null, failed: false,
    verdict: { tldr: "예시 경력", finalFit: "good", companyQuestion: null, criteria: [], reasonChips: [] },
  };
  const calls: RoleStartEvaluateBody[] = [];
  let advanced = 0;
  const buttons = () => [...dom.window.document.querySelectorAll("button")];
  const submit = () => dom.window.document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  try {
    for (const reasonText of ["", " \n ", "제품을 직접 출시한 경험을 더 보고 싶어요."]) {
      await act(async () => {
        root.render(
          <OrgLocaleScope locale="ko">
            <CandidateRating key={reasonText} busy={false} candidate={candidate} editable
              evaluation={{ rating: null, answer: null, note: null, reasons: [], reasonText, reasonsSkipped: false }}
              onEvaluate={body => { calls.push(body); return {}; }} onSubmitted={() => { advanced++; }} />
          </OrgLocaleScope>
        );
      });
      assert.equal(buttons().some(button => button.getAttribute("aria-pressed") === "true"), false);
      assert.equal(buttons().find(button => button.textContent === "제출하기")!.disabled, !reasonText.trim());
      await act(async () => { submit(); });
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].rating, null, "do not infer a rating from the words");
    assert.equal(calls[0].reasonText, "제품을 직접 출시한 경험을 더 보고 싶어요.");
    assert.equal(advanced, 1);
    const good = buttons().find(button => button.textContent === "잘 맞음")!;
    await act(async () => { good.click(); });
    assert.equal(good.getAttribute("aria-pressed"), "true");
    await act(async () => { good.click(); });
    assert.equal(good.getAttribute("aria-pressed"), "false", "a rating can be cleared without losing the text");
    await act(async () => { submit(); });
    assert.equal(calls[1].rating, null);
    assert.equal(calls[1].reasonText, calls[0].reasonText);
  } finally {
    await act(async () => { root.unmount(); });
    Object.assign(globalThis, { window: originalWindow, document: originalDocument, IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  }
});
