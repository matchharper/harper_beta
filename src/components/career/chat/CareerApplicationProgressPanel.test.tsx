import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerOpenFormsSnapshot } from "@/hooks/career/useCareerOpenForms";
import type {
  CareerApplicationProgress,
  CareerApplicationStep,
  CareerApplicationStepKey,
  CareerApplicationStepState,
} from "@/lib/career/applicationProgress/types";
import { CareerFormReferenceProvider, useCareerFormReference } from "./CareerFormReferenceProvider";

// The open-forms hook reaches the Supabase client, which needs these at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
const load = async () => ({
  ...(await import("./CareerApplicationProgressPanel")),
  ...(await import("@/hooks/career/useCareerOpenForms")),
});

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const step = (key: CareerApplicationStepKey, state: CareerApplicationStepState, extra: Partial<CareerApplicationStep> = {}) =>
  ({ key, state, ...extra }) satisfies CareerApplicationStep;
const submitted: CareerApplicationProgress = {
  id: "role-a", companyName: "A사", title: "백엔드 엔지니어", status: "submitted", updatedAt: ago(1), submittedAt: ago(1),
  steps: [step("confirm", "done", { at: ago(30) }), step("fill", "done"), step("review", "skipped"), step("submit", "done")],
};
const needsAnswers: CareerApplicationProgress = {
  id: "role-b", companyName: "B사", title: "데이터 엔지니어", status: "needs_you", updatedAt: ago(2),
  action: { kind: "answer_form", formId: 20 },
  steps: [step("confirm", "done", { at: ago(20) }),
    step("fill", "done", { subSteps: [{ key: "login", state: "done", site: "원티드" }] }),
    step("review", "current", { questions: 2 }), step("submit", "todo")],
};
const filling: CareerApplicationProgress = {
  id: "role-c", companyName: "C사", title: "ML 엔지니어", status: "running", updatedAt: ago(0),
  steps: [step("confirm", "done"), step("fill", "current", { at: ago(2) }), step("review", "todo"), step("submit", "todo")],
};
const snapshot = (applications?: CareerApplicationProgress[]) =>
  ({ forms: [], pending: 0, latestMessageId: 1, completionCursor: null, activities: [],
    ...(applications ? { applications } : {}) }) as CareerOpenFormsSnapshot;

test("the list is read from the work snapshot, and a snapshot without it has none", async () => {
  const { careerApplicationsOf } = await load();
  assert.deepEqual(careerApplicationsOf(undefined), []);
  assert.deepEqual(careerApplicationsOf(snapshot()), []);
  assert.deepEqual(careerApplicationsOf(snapshot([filling])).map(app => app.id), ["role-c"]);
});

const keepOpen = () => undefined;
function FormLocation({ formId }: { formId: number }) {
  const { ref } = useCareerFormReference([formId], keepOpen);
  return <div ref={ref}><div data-career-form-id={formId}>form {formId}</div></div>;
}

async function mount() {
  const { CareerApplicationProgressPanel, CareerOpenFormsSnapshotContext } = await load();
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; }, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let scrolled: Element | null = null;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
  const root: Root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient();
  const render = (data: CareerOpenFormsSnapshot, onScreen: number[] = []) => act(async () => root.render(
    <QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
      <MessagesProvider locale="ko"><CareerOpenFormsSnapshotContext.Provider value={data}>
        <CareerFormReferenceProvider>
          {onScreen.map(formId => <FormLocation key={formId} formId={formId} />)}
          <CareerApplicationProgressPanel conversationId="conversation" />
        </CareerFormReferenceProvider>
      </CareerOpenFormsSnapshotContext.Provider></MessagesProvider>
    </RouterContext.Provider></QueryClientProvider>));
  const document = dom.window.document;
  const click = (element: Element | null | undefined) => act(async () => {
    assert.ok(element, "element to click");
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  const panel = () => document.querySelector("[data-career-application-progress]");
  const toggle = () => panel()?.querySelector<HTMLButtonElement>(":scope > button");
  const row = (name: string) => [...document.querySelectorAll("[data-career-application-progress] ul > li")]
    .find(item => item.textContent?.includes(name));
  const cleanup = async () => {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
  return { render, document, click, panel, toggle, row, cleanup, scrolled: () => scrolled as Element | null };
}

test("nothing shows without applications", async () => {
  const view = await mount();
  try {
    await view.render(snapshot());
    assert.equal(view.panel(), null);
    await view.render(snapshot([]));
    assert.equal(view.panel(), null);
  } finally { await view.cleanup(); }
});

test("collapsed, one line counts the applications and stresses what needs the person", async () => {
  const view = await mount();
  try {
    await view.render(snapshot([submitted, needsAnswers, filling]));
    const toggle = view.toggle();
    assert.equal(toggle?.getAttribute("aria-expanded"), "false");
    const summary = view.panel()?.querySelector('[aria-live="polite"]');
    assert.deepEqual([...summary!.children].map(child => child.textContent), ["지원 3건", "제출 1", "답 필요 1", "진행 중 1"]);
    assert.match(summary!.children[2].className, /text-action/);
    assert.match(toggle!.textContent ?? "", /펼치기$/);
    assert.equal(view.panel()?.querySelector("ul"), null);
    // Only the counts that exist are shown.
    await view.render(snapshot([filling]));
    assert.deepEqual([...view.panel()!.querySelector('[aria-live="polite"]')!.children].map(child => child.textContent),
      ["지원 1건", "진행 중 1"]);
  } finally { await view.cleanup(); }
});

test("expanded, each application is a row with its status line; a row opens its four steps", async () => {
  const view = await mount();
  try {
    await view.render(snapshot([submitted, needsAnswers, filling]));
    await view.click(view.toggle());
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "true");
    assert.match(view.toggle()!.textContent ?? "", /접기$/);
    const rows = [...view.document.querySelectorAll("[data-career-application-progress] ul > li")];
    assert.equal(rows.length, 3);
    assert.match(rows[0].textContent ?? "", /^A사 · 백엔드 엔지니어제출 완료 · \S/);
    assert.match(rows[1].textContent ?? "", /B사 · 데이터 엔지니어내 답을 확인해 주세요/);
    assert.match(rows[2].textContent ?? "", /C사 · ML 엔지니어회사 양식 채우는 중 · 2분째/);

    const rowButton = view.row("B사")!.querySelector("button")!;
    assert.equal(rowButton.getAttribute("aria-expanded"), "false");
    await view.click(rowButton);
    assert.equal(rowButton.getAttribute("aria-expanded"), "true");
    const box = view.document.getElementById(rowButton.getAttribute("aria-controls")!)!;
    assert.match(box.textContent ?? "", /제출까지 4단계 중 2단계50%/);
    const progress = box.querySelector('[role="progressbar"]')!;
    assert.equal(progress.getAttribute("aria-valuenow"), "2");
    const steps = [...box.querySelectorAll(":scope ol > li")];
    const lines = steps.map(item => item.querySelector("div")?.textContent ?? "");
    assert.match(lines[0], /^지원 확인 \(완료\).+ 답함$/);
    assert.deepEqual(lines.slice(1), ["회사 양식 채우기 (완료)", "내 답 확인 (답 필요)내 답을 확인해 주세요", "제출"]);
    assert.equal(steps[2].getAttribute("aria-current"), "step");
    // A site login is a smaller line under the main step it happened in.
    const login = steps[1].querySelector("ul > li");
    assert.equal(login?.textContent, "원티드 로그인 (완료)");
  } finally { await view.cleanup(); }
});

test("a skipped review reads as skipped, a submitted one is 100% with its time, a closed one is a red line", async () => {
  const view = await mount();
  const closed: CareerApplicationProgress = {
    id: "role-d", companyName: "D사", title: null, status: "closed", updatedAt: ago(3), failure: { reason: "closed" },
    steps: [step("confirm", "failed"), step("fill", "todo"), step("review", "todo"), step("submit", "todo")],
  };
  try {
    await view.render(snapshot([submitted, closed]));
    await view.click(view.toggle());
    await view.click(view.row("A사")!.querySelector("button"));
    const box = view.row("A사")!.querySelector('[role="progressbar"]')!.parentElement!;
    assert.match(box.textContent ?? "", /^제출 완료 · \S.*100%지원 확인/);
    assert.match(box.textContent ?? "", /내 답 확인건너뜀 · 물을 게 없었어요/);

    const closedRow = view.row("D사")!;
    const status = closedRow.querySelector("button span.truncate.text-critical");
    assert.equal(status?.textContent, "마감된 공고예요");
    await view.click(closedRow.querySelector("button"));
    assert.equal(closedRow.querySelector("p.text-critical")?.textContent, "마감된 공고예요");
    assert.match(closedRow.textContent ?? "", /0%/);
  } finally { await view.cleanup(); }
});

test("sub-steps that wait on the person and Harper between steps read plainly", async () => {
  const view = await mount();
  const login: CareerApplicationProgress = {
    id: "role-e", companyName: "E사", title: "프론트엔드", status: "needs_you", updatedAt: ago(1),
    action: { kind: "open_browser", sessionId: "session-e" },
    steps: [step("confirm", "done"), step("fill", "current", { subSteps: [{ key: "login", state: "current", site: "원티드" }] }),
      step("review", "todo"), step("submit", "todo")],
  };
  const waiting: CareerApplicationProgress = {
    id: "role-f", companyName: "F사", title: "iOS", status: "waiting", updatedAt: ago(1),
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "current"), step("submit", "todo")],
  };
  try {
    await view.render(snapshot([login, waiting]));
    await view.click(view.toggle());
    const loginRow = view.row("E사")!;
    assert.match(loginRow.textContent ?? "", /원티드 로그인이 필요해요/);
    // No clean way to open a browser session from here, so no button that would do nothing.
    assert.equal(loginRow.querySelectorAll("button").length, 1);
    await view.click(loginRow.querySelector("button"));
    const sub = loginRow.querySelector("ol > li ul > li");
    assert.equal(sub?.textContent, "원티드 로그인 (답 필요)로그인하면 이어서 채워요");
    assert.match(view.row("F사")!.textContent ?? "", /Harper가 다음 단계를 준비하는 중/);
  } finally { await view.cleanup(); }
});

test("답하기 takes the person to the form when it is on screen, and is absent when it is not", async () => {
  const view = await mount();
  try {
    await view.render(snapshot([needsAnswers]), [20]);
    await view.click(view.toggle());
    const answer = view.row("B사")!.querySelector<HTMLButtonElement>('button[aria-label="B사 · 데이터 엔지니어 답하기"]');
    assert.equal(answer?.textContent, "답하기");
    await view.click(answer);
    assert.equal(view.scrolled()?.getAttribute("data-career-form-id"), "20");
    // The panel folds so the form is not covered on a phone.
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "false");

    await view.render(snapshot([needsAnswers]), []);
    await view.click(view.toggle());
    assert.equal(view.row("B사")!.querySelector('button[aria-label$="답하기"]'), null);
  } finally { await view.cleanup(); }
});
