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
import { parseCareerForm, type CareerForm } from "@/lib/career/forms/schema";
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
// Radix picks its layout effect once, by whether a document exists when it is imported; without one its portals
// (the answer sheet's dialog) never mount. So the first import always has one.
const importDom = new JSDOM("");
const load = async () => {
  const bare = !("document" in globalThis);
  if (bare) Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: importDom.window.document });
  try {
    return {
      ...(await import("./CareerApplicationProgressPanel")),
      ...(await import("@/hooks/career/useCareerOpenForms")),
      ...(await import("../CareerChatPanelContext")),
    };
  } finally {
    if (bare) delete (globalThis as Record<string, unknown>).document;
  }
};
/** The chat history the panel can page through, as the chat panel provides it. */
type ChatHistory = { hasOlderMessages: boolean; loadingOlderMessages: boolean; onLoadOlderMessages: () => Promise<void> };
/** The rest of the chat panel the rows use: who is signed in, the send, and the scroller. */
type Chat = Partial<ChatHistory> & Record<string, unknown>;

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
  steps: [step("confirm", "done", { at: ago(20), answeredAt: ago(20) }),
    step("fill", "done", { subSteps: [{ key: "login", state: "done", site: "원티드" }] }),
    step("review", "current", { questions: 2 }), step("submit", "todo")],
};
const filling: CareerApplicationProgress = {
  id: "role-c", companyName: "C사", title: "ML 엔지니어", status: "running", updatedAt: ago(0),
  steps: [step("confirm", "done"), step("fill", "current", { at: ago(2) }), step("review", "todo"), step("submit", "todo")],
};
const snapshot = (applications?: CareerApplicationProgress[], forms: CareerForm[] = []) =>
  ({ forms, pending: 0, latestMessageId: 1, completionCursor: null, activities: [],
    ...(applications ? { applications } : {}) }) as CareerOpenFormsSnapshot;
/** B's review form as the work poll lists it while open. */
const reviewForm = (revision = 1) => parseCareerForm({ formId: 20, revision, kind: "form", state: "open", title: "검토",
  items: [{ id: "why", label: "지원 동기", type: "textarea", content: "" }] })!;

test("the list is read from the work snapshot, and a snapshot without it has none", async () => {
  const { careerApplicationsOf } = await load();
  assert.deepEqual(careerApplicationsOf(undefined), []);
  assert.deepEqual(careerApplicationsOf(snapshot()), []);
  assert.deepEqual(careerApplicationsOf(snapshot([filling])).map(app => app.id), ["role-c"]);
});

const keepOpen = () => undefined;
/** Where the chat shows a form: its card's top in the 768px window, 200px tall (100: in view). */
type Location = number | { formId: number; top: number };
function FormLocation({ formId, top }: { formId: number; top: number }) {
  const { ref } = useCareerFormReference([formId], keepOpen);
  return <div ref={ref}><div data-career-form-id={formId} data-top={top}>form {formId}</div></div>;
}

async function mount() {
  const { CareerApplicationProgressPanel, CareerOpenFormsSnapshotContext, CareerChatPanelProvider } = await load();
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage,
    // The answer sheet's dialog moves focus into its form.
    HTMLInputElement: dom.window.HTMLInputElement, HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    MutationObserver: dom.window.MutationObserver, NodeFilter: dom.window.NodeFilter, getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; }, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let scrolled: Element | null = null;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
  // Laid out like the page: a form card where its location puts it, everything else unmeasured.
  dom.window.HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const top = Number(this.getAttribute("data-top") ?? Number.NaN);
    const [y, height] = Number.isFinite(top) ? [top, 200] : [0, 0];
    return { top: y, bottom: y + height, left: 0, right: height ? 600 : 0, width: height ? 600 : 0, height, x: 0, y, toJSON() {} } as DOMRect;
  };
  // The answer sheet is a dialog on wide screens.
  dom.window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {} })) as unknown as typeof dom.window.matchMedia;
  const root: Root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient();
  const render = (data: CareerOpenFormsSnapshot, onScreen: Location[] = [], chat?: Chat) => {
    const panel = <CareerApplicationProgressPanel conversationId="conversation" />;
    const locations = onScreen.map(location => typeof location === "number" ? { formId: location, top: 100 } : location);
    return act(async () => root.render(
      <QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
        <MessagesProvider locale="ko"><CareerOpenFormsSnapshotContext.Provider value={data}>
          <CareerFormReferenceProvider>
            {locations.map(({ formId, top }) => <FormLocation key={formId} formId={formId} top={top} />)}
            {chat ? (
              <CareerChatPanelProvider value={{ user: null, messages: [], conversationId: "conversation", ...chat } as never}>
                {panel}
              </CareerChatPanelProvider>
            ) : panel}
          </CareerFormReferenceProvider>
        </CareerOpenFormsSnapshotContext.Provider></MessagesProvider>
      </RouterContext.Provider></QueryClientProvider>));
  };
  const document = dom.window.document;
  const click = (element: Element | null | undefined) => act(async () => {
    assert.ok(element, "element to click");
    element.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  const panel = () => document.querySelector("[data-career-application-progress]");
  const toggle = () => panel()?.querySelector<HTMLButtonElement>(":scope > button");
  const row = (name: string) => [...document.querySelectorAll("[data-career-application-progress] ul > li")]
    .find(item => item.textContent?.includes(name));
  const cleanup = async () => {
    await act(async () => root.unmount());
    // A dialog returns focus on a timer after it unmounts: let it run while its document is still in place.
    await new Promise(resolve => setTimeout(resolve, 0));
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  };
  return { render, document, click, settle, panel, toggle, row, cleanup, scrolled: () => scrolled as Element | null };
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
    // The step it is on (the third), while two are finished.
    assert.match(box.textContent ?? "", /제출까지 4단계 중 3단계50%/);
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
    id: "role-f", companyName: "F사", title: "iOS", status: "waiting", updatedAt: ago(1), browserSessionId: "session-f",
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
    // Its open browser has no "보기" either when no browser dock is there to open it in.
    assert.equal(view.row("F사")!.querySelectorAll("button").length, 1);
  } finally { await view.cleanup(); }
});

test("a running row's line is the step under way, not a login an earlier step still shows as open", async () => {
  const view = await mount();
  // A login still open under the finished fill step while the submission runs (the builder marks it done once submitting
  // starts there; the row does not rely on that): the row is submitting.
  const submitting: CareerApplicationProgress = {
    id: "role-g", companyName: "G사", title: "데이터 분석가", status: "running", updatedAt: ago(0),
    steps: [step("confirm", "done"), step("fill", "done", { subSteps: [{ key: "login", state: "current", site: "원티드", at: ago(3) }] }),
      step("review", "skipped"), step("submit", "current", { at: ago(3) })],
  };
  // No step under way: Harper goes on from the page the person returned, so the open login is the line.
  const returned: CareerApplicationProgress = {
    id: "role-h", companyName: "H사", title: "QA", status: "waiting", updatedAt: ago(1),
    steps: [step("confirm", "done"), step("fill", "done", { subSteps: [{ key: "login", state: "current", site: "원티드", at: ago(1) }] }),
      step("review", "done"), step("submit", "todo")],
  };
  try {
    await view.render(snapshot([submitting, returned]));
    await view.click(view.toggle());
    assert.match(view.row("G사")!.textContent ?? "", /G사 · 데이터 분석가제출 중 · 3분째/);
    assert.match(view.row("H사")!.textContent ?? "", /H사 · QA원티드 로그인하는 중/);
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

test("답하기 for a form the chat shows out of view opens it in the sheet: the chat neither moves nor pages back", async t => {
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }) as never);
  let revision = 2;
  t.mock.method(globalThis, "fetch", async () => Response.json({ form: { formId: 20, revision, kind: "form", state: "open",
    title: "검토", items: [{ id: "why", label: "지원 동기", type: "textarea", content: "" }] }, responses: [] }));
  const view = await mount();
  let loads = 0;
  // Earlier history exists too: it is not paged through.
  const history: ChatHistory = { hasOlderMessages: true, loadingOlderMessages: false, onLoadOlderMessages: async () => { loads += 1; } };
  const sheet = () => view.document.querySelector('[role="dialog"]');
  const answered = snapshot([{ ...needsAnswers, status: "waiting", action: undefined }]);
  const answer = async () => {
    await view.click(view.toggle());
    await view.click(view.row("B사")!.querySelector('button[aria-label="B사 · 데이터 엔지니어 답하기"]'));
    await view.settle();
  };
  try {
    // 11/27: the question was a new revision of a card the chat showed 40 minutes up. The panel scrolled there instead
    // of opening the sheet, and the chat stopped at the start card.
    await view.render(snapshot([needsAnswers], [reviewForm(revision)]), [{ formId: 20, top: -3000 }], history);
    await answer();
    assert.ok(sheet()?.querySelector('[data-career-form-id="20"] textarea'), "answered in the sheet");
    assert.equal(view.scrolled(), null, "the chat stays where the person left it");
    assert.equal(loads, 0);
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "false");
    await view.render(answered, [{ formId: 20, top: -3000 }], history);
    assert.equal(sheet(), null);

    // Only its last 50px show at the top of the view: still the sheet.
    revision = 3;
    await view.render(snapshot([needsAnswers], [reviewForm(revision)]), [{ formId: 20, top: -150 }], history);
    await answer();
    assert.ok(sheet()?.querySelector('[data-career-form-id="20"]'));
    assert.equal(view.scrolled(), null);
    await view.render(answered, [{ formId: 20, top: -150 }], history);

    // Most of it shows at the bottom of the view: the chat brings it up, and no sheet opens.
    revision = 4;
    await view.render(snapshot([needsAnswers], [reviewForm(revision)]), [{ formId: 20, top: 620 }], history);
    await answer();
    assert.equal(view.scrolled()?.getAttribute("data-career-form-id"), "20");
    assert.equal(sheet(), null);
    assert.equal(loads, 0);
  } finally { await view.cleanup(); }
});

test("a form no reply placed opens in a sheet to answer there, with or without earlier history, and closes once answered", async t => {
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }) as never);
  const fetched: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    fetched.push(String(url));
    return Response.json({ form: { formId: 20, revision: 1, kind: "form", state: "open", title: "검토",
      items: [{ id: "why", label: "지원 동기", type: "textarea", content: "" }] }, responses: [] });
  });
  const view = await mount();
  let loads = 0;
  const history = (hasOlderMessages: boolean): ChatHistory =>
    ({ hasOlderMessages, loadingOlderMessages: false, onLoadOlderMessages: async () => { loads += 1; } });
  const sheet = () => view.document.querySelector('[role="dialog"]');
  const answered = snapshot([{ ...needsAnswers, status: "waiting", action: undefined }]);
  // Each time asked anew, as a new revision: an answered one never opens again.
  const asked = (revision = 1) => snapshot([needsAnswers], [reviewForm(revision)]);
  const answer = async () => {
    await view.click(view.toggle());
    await view.click(view.row("B사")!.querySelector('button[aria-label="B사 · 데이터 엔지니어 답하기"]'));
    await view.settle();
  };
  try {
    // The whole history is loaded and the form is not in it: the sheet, with the form itself.
    await view.render(asked(), [], history(false));
    await answer();
    assert.match(sheet()?.textContent ?? "", /B사 · 데이터 엔지니어 답하기/);
    assert.ok(sheet()?.querySelector('[data-career-form-id="20"] textarea'), "answered in the sheet");
    assert.match(fetched[0] ?? "", /formId=20/);
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "false");
    // Answered (no longer open): the sheet closes by itself.
    await view.render(answered, [], history(false));
    assert.equal(sheet(), null);

    // Earlier history exists: the sheet at once, without paging back to look for it (a form Harper saved without a
    // reply is in no page).
    await view.render(asked(2), [], history(true));
    await answer();
    assert.ok(sheet()?.querySelector('[data-career-form-id="20"]'));
    assert.equal(loads, 0);
    assert.equal(view.scrolled(), null);
  } finally { await view.cleanup(); }
});

test("the answer sheet stays while its form is open: an empty poll or a newer action on its row does not close it", async t => {
  const { supabase } = await import("@/lib/supabase");
  t.mock.method(supabase.auth, "getSession", async () => ({ data: { session: { access_token: "fixture" } }, error: null }) as never);
  t.mock.method(globalThis, "fetch", async () => Response.json({ form: { formId: 20, revision: 1, kind: "form", state: "open",
    title: "검토", items: [{ id: "why", label: "지원 동기", type: "textarea", content: "" }] }, responses: [] }));
  const view = await mount();
  const history: ChatHistory = { hasOlderMessages: false, loadingOlderMessages: false, onLoadOlderMessages: async () => undefined };
  const sheet = () => view.document.querySelector('[role="dialog"]');
  try {
    await view.render(snapshot([needsAnswers], [reviewForm()]), [], history);
    await view.click(view.toggle());
    await view.click(view.row("B사")!.querySelector('button[aria-label="B사 · 데이터 엔지니어 답하기"]'));
    await view.settle();
    const field = sheet()?.querySelector<HTMLTextAreaElement>('[data-career-form-id="20"] textarea');
    assert.ok(field, "the person is typing here");
    // A poll whose progress read failed lists no applications, though the form is still open.
    await view.render(snapshot([], [reviewForm()]), [], history);
    assert.equal(sheet()?.querySelector("textarea"), field, "still open, the same field");
    // The row now asks for a login in a newer browser; the form is still open.
    await view.render(snapshot([{ ...needsAnswers, action: { kind: "open_browser", sessionId: "session-b" } }], [reviewForm()]), [], history);
    assert.equal(sheet()?.querySelector("textarea"), field);
    // Answered: the form is no longer open, and the sheet closes.
    await view.render(snapshot([{ ...needsAnswers, status: "waiting", action: undefined }]), [], history);
    assert.equal(sheet(), null);
    // Asked again in a new revision: the row offers it; the sheet does not open by itself.
    await view.render(snapshot([needsAnswers], [reviewForm(2)]), [], history);
    assert.equal(sheet(), null);
  } finally { await view.cleanup(); }
});

test("a running step counts its minutes, and a browser left with the person says how long it still waits", async () => {
  const view = await mount();
  const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000 - 5_000).toISOString();
  const submitting: CareerApplicationProgress = {
    id: "role-g", companyName: "G사", title: "백엔드", status: "running", updatedAt: ago(0),
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "skipped"), step("submit", "current", { at: ago(2) })],
  };
  const login = (expiresAt: string): CareerApplicationProgress => ({
    id: "role-h", companyName: "H사", title: "프론트엔드", status: "needs_you", updatedAt: ago(5),
    action: { kind: "open_browser", sessionId: "session-h" },
    steps: [step("confirm", "done"), step("fill", "current", { at: ago(6), subSteps: [{ key: "login", state: "current", site: "원티드", at: ago(5), expiresAt }] }),
      step("review", "todo"), step("submit", "todo")],
  });
  const line = (name: string) => view.row(name)!.querySelector("button span.truncate:not(.font-medium)")!;
  try {
    await view.render(snapshot([submitting, login(inMinutes(25))]));
    await view.click(view.toggle());
    assert.equal(line("G사").textContent, "제출 중 · 2분째");
    assert.equal(line("H사").textContent, "원티드 로그인이 필요해요 · 25분 남음");
    assert.doesNotMatch(line("H사").className, /text-critical/);
    await view.click(view.row("H사")!.querySelector("button"));
    assert.equal(view.row("H사")!.querySelector("ol > li ul > li")?.textContent, "원티드 로그인 (답 필요)로그인하면 이어서 채워요 · 25분 남음");
    // The last three minutes stand out.
    await view.render(snapshot([submitting, login(inMinutes(3))]));
    assert.equal(line("H사").textContent, "원티드 로그인이 필요해요 · 3분 남음");
    assert.match(line("H사").className, /text-critical/);
    // Past its time it no longer counts.
    await view.render(snapshot([submitting, login(ago(1))]));
    assert.equal(line("H사").textContent, "원티드 로그인이 필요해요");
  } finally { await view.cleanup(); }
});

test("a paused application is continued, and a closed login reopened, with the person's own chat message", async () => {
  const view = await mount();
  const sent: unknown[] = [];
  let finish = () => undefined as void;
  const chat = { user: { id: "user" }, chatPending: false, assistantTyping: false,
    onSendChatMessage: (args: unknown) => { sent.push(args); return new Promise<boolean>(resolve => { finish = () => resolve(true); }); } };
  const paused: CareerApplicationProgress = {
    id: "role-g", kind: "role", companyName: "G사", title: "백엔드", status: "needs_you", updatedAt: ago(180),
    action: { kind: "continue" },
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "todo"), step("submit", "todo")],
  };
  const closedLogin: CareerApplicationProgress = {
    id: "role-h", kind: "role", companyName: "H사", title: "프론트엔드", status: "needs_you", updatedAt: ago(40),
    action: { kind: "reopen_browser", sessionId: "session-h" },
    steps: [step("confirm", "done"), step("fill", "current", { subSteps: [{ key: "login", state: "failed", site: "원티드", at: ago(40) }] }),
      step("review", "todo"), step("submit", "todo")],
  };
  const button = (name: string, label: string) => view.row(name)!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  try {
    await view.render(snapshot([paused, closedLogin]), [], chat);
    await view.click(view.toggle());
    assert.match(view.row("G사")!.textContent ?? "", /G사 · 백엔드진행이 멈췄어요/);
    // The box says since when nothing happened, at the step it stopped before.
    await view.click(view.row("G사")!.querySelector("button"));
    const steps = [...view.row("G사")!.querySelectorAll("ol > li")].map(item => item.textContent ?? "");
    assert.match(steps[2], /^내 답 확인.+ 이후 진행된 일이 없어요\. Harper가 채팅에서 물어본 게 있으면 채팅에서 답해 주세요\.$/);
    assert.match(view.row("H사")!.textContent ?? "", /H사 · 프론트엔드원티드 로그인 창이 닫혔어요/);
    await view.click(view.row("H사")!.querySelector("button"));
    assert.equal(view.row("H사")!.querySelector("ol > li ul > li")?.textContent, "원티드 로그인 (멈춤)다시 열기를 누르면 Harper가 창을 다시 열어요");

    await view.click(button("G사", "G사 · 백엔드 이어서 하기"));
    assert.deepEqual(sent, [{ text: "G사 · 백엔드 진행을 이어서 해 줘.", opportunityMentions: [{ label: "G사 · 백엔드", roleId: "role-g" }] }]);
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "false", "folded so the reply is in view");
    // One request at a time, also after the list is folded and opened again.
    await view.click(view.toggle());
    assert.equal(button("G사", "G사 · 백엔드 이어서 하기")?.disabled, true);
    assert.equal(button("H사", "H사 · 프론트엔드 로그인 창 다시 열기")?.disabled, true);
    await act(async () => finish());
    await view.click(button("H사", "H사 · 프론트엔드 로그인 창 다시 열기"));
    assert.deepEqual(sent[1], { text: "H사 · 프론트엔드 로그인 창을 다시 열어 줘.", opportunityMentions: [{ label: "H사 · 프론트엔드", roleId: "role-h" }] });
    await act(async () => finish());

    // An opportunity without a role cannot be mentioned, and nobody signed in cannot send: the line stays, no button.
    await view.render(snapshot([{ ...paused, kind: "opportunity" }]), [], chat);
    await view.click(view.toggle());
    assert.match(view.row("G사")!.textContent ?? "", /진행이 멈췄어요/);
    assert.equal(view.row("G사")!.querySelectorAll("button").length, 1);
    // (Another account remounts the chat's children, so the list starts folded.)
    await view.render(snapshot([paused]), [], { ...chat, user: null });
    await view.click(view.toggle());
    assert.equal(view.row("G사")!.querySelectorAll("button").length, 1);
  } finally { await view.cleanup(); }
});

test("a Harper turn on hold in the chat points to its newest message without saying what it waits for, and a Stop reads as the person's own choice", async () => {
  const view = await mount();
  const scroller = view.document.createElement("div");
  scroller.innerHTML = '<div data-career-message-role="assistant">first</div><div data-career-message-role="user">me</div>'
    + '<div data-career-message-role="assistant">newest</div>';
  view.document.body.append(scroller);
  const chat = { user: { id: "user" }, scrollRef: { current: scroller }, onSendChatMessage: async () => true };
  const asking: CareerApplicationProgress = {
    id: "role-i", companyName: "I사", title: "디자이너", status: "needs_you", updatedAt: ago(10),
    action: { kind: "reply_in_chat" },
    steps: [step("confirm", "done"), step("fill", "current", { at: ago(12) }), step("review", "todo"), step("submit", "todo")],
  };
  // The hold is the conversation's (a turn waits behind a newer request) and names no application: every paused row has it.
  const alsoPaused: CareerApplicationProgress = { ...asking, id: "role-k", companyName: "K사", title: "QA",
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "todo"), step("submit", "todo")] };
  const stopped: CareerApplicationProgress = {
    id: "role-j", companyName: "J사", title: "PM", status: "failed", updatedAt: ago(10), failure: { reason: "stopped" },
    action: { kind: "continue" },
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "skipped"), step("submit", "failed", { at: ago(10) })],
  };
  try {
    await view.render(snapshot([asking, alsoPaused, stopped]), [], chat);
    await view.click(view.toggle());
    // Nothing moves either one: each says so, and neither claims Harper waits for the person's answer about it.
    assert.match(view.row("I사")!.textContent ?? "", /I사 · 디자이너진행이 멈췄어요/);
    assert.match(view.row("K사")!.textContent ?? "", /K사 · QA진행이 멈췄어요/);
    await view.click(view.row("K사")!.querySelector("button"));
    const detail = [...view.row("K사")!.querySelectorAll("ol > li")].map(item => item.textContent ?? "")[2];
    assert.match(detail, /^내 답 확인.+ 이후 진행된 일이 없어요\. Harper가 채팅에서 물어본 게 있으면 채팅에서 답해 주세요\.$/);
    assert.doesNotMatch(view.panel()!.textContent ?? "", /답을 기다려요|채팅에서 답하기/);
    const viewChat = view.row("I사")!.querySelector('button[aria-label="I사 · 디자이너 채팅 보기"]');
    assert.equal(viewChat?.textContent, "채팅 보기");
    await view.click(viewChat);
    assert.equal(view.scrolled()?.textContent, "newest");
    assert.equal(view.toggle()?.getAttribute("aria-expanded"), "false");

    await view.click(view.toggle());
    const row = view.row("J사")!;
    const line = row.querySelector("button span.truncate:not(.font-medium)")!;
    assert.equal(line.textContent, "중단했어요");
    assert.doesNotMatch(line.className, /text-critical/);
    // Offered again, not pressed on the person: a plain button.
    const resume = row.querySelector<HTMLButtonElement>('button[aria-label="J사 · PM 이어서 하기"]');
    assert.ok(resume);
    assert.doesNotMatch(resume.className, /bg-action/);
    await view.click(row.querySelector("button"));
    const note = row.querySelector("[role=progressbar]")!.parentElement!.querySelector(":scope > p:last-child")!;
    assert.equal(note.textContent, "중단했어요");
    assert.doesNotMatch(note.className, /text-critical/);
    assert.equal(row.querySelector(".bg-critical"), null, "nothing red");
  } finally { await view.cleanup(); }
});

test("a mail link the site sent is asked like a code", async () => {
  const view = await mount();
  const link: CareerApplicationProgress = {
    id: "role-k", companyName: "K사", title: "QA", status: "needs_you", updatedAt: ago(2),
    steps: [step("confirm", "done"), step("fill", "done"), step("review", "skipped"),
      step("submit", "current", { at: ago(3), subSteps: [{ key: "email_link", state: "current", at: ago(2) }] })],
  };
  try {
    await view.render(snapshot([link]));
    await view.click(view.toggle());
    assert.match(view.row("K사")!.textContent ?? "", /K사 · QA메일 인증 링크를 열어 주세요/);
    await view.click(view.row("K사")!.querySelector("button"));
    assert.equal(view.row("K사")!.querySelector("ol > li ul > li")?.textContent, "메일 인증 링크 (답 필요)사이트가 보낸 메일의 링크를 열어 주세요");
  } finally { await view.cleanup(); }
});
