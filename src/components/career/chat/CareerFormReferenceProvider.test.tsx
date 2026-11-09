import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from "../CareerChatPanelContext";
import { CareerInlineForms } from "./CareerInlineForms";
import { CareerFormReferenceProvider } from "./CareerFormReferenceProvider";
import type { CareerForm } from "@/lib/career/forms/schema";

test("re-presenting a form moves its editable location, preserves the draft, and keeps older links usable", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/career", pretendToBeVisual: true });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
    HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent, sessionStorage: dom.window.sessionStorage,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let scrolled: Element | null = null;
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
  const forms: CareerForm[] = [10, 20].map(formId => ({ formId, revision: 1, kind: "form", state: "open", title: `지원 ${formId}`,
    items: [{ id: "note", label: "지원 내용", type: "textarea", content: "" }] }));
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  for (const form of forms) client.setQueryData(["career-form-references", "conversation", form.formId], { form, responses: [] });
  const root = createRoot(dom.window.document.getElementById("root")!);
  let references = [{ key: "first", ids: [10, 20], grouped: false }];
  const render = async () => act(async () => root.render(
    <QueryClientProvider client={client}><RouterContext.Provider value={{ locale: "ko", query: {} } as NextRouter}>
      <MessagesProvider locale="ko"><CareerChatPanelProvider value={{ conversationId: "conversation", user: { id: "user" } } as CareerChatPanelContextValue}>
        <CareerFormReferenceProvider>{references.map(reference => <div key={reference.key} data-reference={reference.key}>
          <CareerInlineForms formIds={reference.ids} grouped={reference.grouped} />
        </div>)}</CareerFormReferenceProvider>
      </CareerChatPanelProvider></MessagesProvider>
    </RouterContext.Provider></QueryClientProvider>
  ));
  const field = (formId: number) => dom.window.document.querySelector<HTMLTextAreaElement>(`[data-career-form-id="${formId}"] textarea`)!;
  const location = (formId: number) => field(formId)?.closest<HTMLElement>("[data-reference]")?.dataset.reference;
  const props = (element: HTMLElement) => (element as any)[Object.keys(element).find(key => key.startsWith("__reactProps$"))!];
  try {
    await render();
    await act(async () => props(field(10)).onChange({ target: { value: "작성 중인 내용" } }));
    references.push({ key: "latest", ids: [10], grouped: false });
    await render();
    assert.equal(dom.window.document.querySelectorAll('[data-career-form-id="10"]').length, 1);
    assert.equal(location(10), "latest");
    assert.equal(location(20), "first", "unrepeated members remain in their original group");
    assert.equal(field(10).value, "작성 중인 내용");
    references.unshift({ key: "history", ids: [10], grouped: false });
    await render();
    assert.equal(location(10), "latest", "pagination cannot steal the current form");
    references.push({ key: "batch", ids: [10, 20], grouped: true });
    await render();
    assert.equal(field(10), null, "the latest group starts as its requested button");
    assert.equal(field(20), null);
    const earlierLink = [...dom.window.document.querySelectorAll<HTMLButtonElement>('[data-reference="first"] button')].find(button => button.textContent === "지원 10")!;
    await act(async () => { earlierLink.click(); await new Promise(resolve => setTimeout(resolve, 25)); });
    assert.equal(location(10), "batch");
    assert.equal(location(20), "batch");
    assert.equal(field(10).value, "작성 중인 내용");
    assert.equal((scrolled as Element | null)?.getAttribute("data-career-form-id"), "10");
    assert.equal(dom.window.document.querySelectorAll('[data-career-form-id="10"]').length, 1);
    assert.equal([...dom.window.document.querySelectorAll('button')].filter(button => button.textContent === "답변 보내기").length, 1);
    references = references.filter(reference => reference.key !== "batch");
    await render();
    assert.equal(location(10), "latest", "unmounting a later reference restores the preceding one");
    assert.equal(location(20), "first");
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
