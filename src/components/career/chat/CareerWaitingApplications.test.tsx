import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import type { CareerOpenFormsSnapshot } from "@/hooks/career/useCareerOpenForms";
import type { CareerForm } from "@/lib/career/forms/schema";
import { CareerFormReferenceProvider, useCareerFormReference } from "./CareerFormReferenceProvider";

// The open-forms hook reaches the Supabase client, which needs these at import time.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";
const load = async () => ({
  ...(await import("./CareerWaitingApplications")),
  ...(await import("@/hooks/career/useCareerOpenForms")),
});

const form = (formId: number, extra: Partial<CareerForm> = {}): CareerForm => ({
  formId, revision: 1, kind: "form", state: "open", title: `지원 ${formId}`,
  items: [{ id: "note", label: "지원 동기", type: "textarea", content: "" }],
  relatedRefs: [{ type: "role", id: `role-${formId}` }], ...extra,
});
const snapshot = (forms: CareerForm[], extra: Partial<CareerOpenFormsSnapshot> = {}): CareerOpenFormsSnapshot =>
  ({ forms, pending: 0, latestMessageId: 1, completionCursor: null, activities: [], ...extra });

test("only open application review forms count, and none while work is running", async () => {
  const { waitingApplicationFormIds } = await load();
  const forms = [form(1), form(2, { relatedRefs: [] }), form(3, { kind: "suggestion" }), form(4, { hidden: true }),
    form(5, { relatedRefs: [{ type: "opportunity", id: "o" }] })];
  assert.deepEqual(waitingApplicationFormIds(snapshot(forms)), [1, 5]);
  assert.deepEqual(waitingApplicationFormIds(snapshot(forms, { activities: [{ id: "run", logs: [] }] })), []);
  assert.deepEqual(waitingApplicationFormIds(snapshot(forms, { hasActiveInputTurn: true })), []);
  assert.deepEqual(waitingApplicationFormIds(undefined), []);
});

const keepOpen = () => undefined;
function FormLocation({ formId }: { formId: number }) {
  const { ref } = useCareerFormReference([formId], keepOpen);
  return <div ref={ref}><div data-career-form-id={formId}>form {formId}</div></div>;
}

test("the chip names the count and takes the person to the first waiting form on screen", async () => {
  const { CareerWaitingApplications, CareerOpenFormsSnapshotContext } = await load();
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
  const root = createRoot(dom.window.document.getElementById("root")!);
  const render = (data: CareerOpenFormsSnapshot, onScreen: number[], busy = false) => act(async () => root.render(
    <QueryClientProvider client={new QueryClient()}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
      <MessagesProvider locale="ko"><CareerOpenFormsSnapshotContext.Provider value={data}>
        <CareerFormReferenceProvider>
          {onScreen.map(formId => <FormLocation key={formId} formId={formId} />)}
          <CareerWaitingApplications conversationId="conversation" busy={busy} />
        </CareerFormReferenceProvider>
      </CareerOpenFormsSnapshotContext.Provider></MessagesProvider>
    </RouterContext.Provider></QueryClientProvider>));
  try {
    await render(snapshot([form(10), form(20)]), [20]);
    const button = dom.window.document.querySelector("button");
    assert.equal(button?.textContent, "답 기다리는 지원 2개");
    await act(async () => button!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })));
    assert.equal((scrolled as Element | null)?.getAttribute("data-career-form-id"), "20");
    // Not on screen: a status, not a button that does nothing.
    await render(snapshot([form(10)]), []);
    assert.equal(dom.window.document.querySelector("button"), null);
    assert.equal(dom.window.document.querySelector('[role="status"]')?.textContent, "답 기다리는 지원 1개");
    // A reply streaming in this panel hides it.
    await render(snapshot([form(10)]), [10], true);
    assert.equal(dom.window.document.querySelector('[role="status"], button'), null);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
  }
});
