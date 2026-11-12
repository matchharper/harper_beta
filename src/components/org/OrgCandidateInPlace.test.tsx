import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";

// 전체 프로필 takes the list's place in the same column; Back brings the list
// back where it was, with its state (it never unmounts).
test("a person opens in the list's place, and Back returns to the list where it was", async (t) => {
  const dom = new JSDOM("<div data-org-review-scroll><div id='root'></div></div>", {
    url: "https://fixture.invalid",
  });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const doc = dom.window.document;
  const root = createRoot(doc.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });

  // The column: a scroll position jsdom does not lay out, and where it was sent.
  const scroller = doc.querySelector<HTMLElement>("[data-org-review-scroll]")!;
  let top = 0;
  const sentTo: number[] = [];
  Object.defineProperty(scroller, "scrollTop", { get: () => top, set: (value: number) => (top = value) });
  scroller.scrollTo = ((options: ScrollToOptions) => {
    top = options.top ?? 0;
    sentTo.push(top);
  }) as typeof scroller.scrollTo;
  const scrollColumn = async (value: number) => {
    top = value;
    await act(async () => {
      scroller.dispatchEvent(new dom.window.Event("scroll"));
    });
  };

  let detailOpen = false;
  let mounts = 0;
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  nodeModule._load = function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/hooks/org/useOrgJobs") return { useOrgJobsDetail: () => ({ detailOpen }) };
    if (name === "./TalentDetailSimpleView") return {
      TalentDetailSimpleView: (props: { backLabel?: string; presentation?: string }) => (
        <div data-review={props.backLabel} data-presentation={props.presentation} />
      ),
    };
    return load.call(this, name, ...args);
  };
  const require = Module.createRequire(import.meta.url);
  let OrgCandidateInPlace: typeof import("./OrgCandidateInPlace")["OrgCandidateInPlace"];
  try {
    ({ OrgCandidateInPlace } = require("./OrgCandidateInPlace") as typeof import("./OrgCandidateInPlace"));
  } finally {
    nodeModule._load = load;
  }
  function List() {
    // Counts mounts: hiding the list must keep it (its open card, loaded pages).
    useState(() => ++mounts);
    return <ul data-list="" />;
  }
  const render = () =>
    act(async () => {
      root.render(
        <OrgCandidateInPlace backLabel="목록으로 돌아가기">
          <List />
        </OrgCandidateInPlace>
      );
    });
  const list = () => doc.querySelector("[data-list]")!;
  const review = () => doc.querySelector<HTMLElement>("[data-review]");

  await render();
  assert.equal(list().closest("[hidden]"), null);
  assert.equal(review(), null);
  assert.deepEqual(sentTo, [], "the list keeps the column's scroll on first show");
  await scrollColumn(300);

  // 전체 프로필: the review in the list's place, from the top.
  detailOpen = true;
  await render();
  assert.ok(list().closest("[hidden]"), "the list is hidden, not gone");
  assert.equal(review()?.dataset.presentation, "inline");
  assert.equal(review()?.dataset.review, "목록으로 돌아가기");
  assert.deepEqual(sentTo, [0]);
  await scrollColumn(80);

  // Back: the list where it was.
  detailOpen = false;
  await render();
  assert.equal(list().closest("[hidden]"), null);
  assert.equal(review(), null);
  assert.deepEqual(sentTo, [0, 300]);
  assert.equal(mounts, 1, "the same list throughout");
});
