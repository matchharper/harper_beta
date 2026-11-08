import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { buildOrgHref } from "@/lib/org/routes";

// A candidate's message nobody answered is a 결정할 것 card that opens the
// conversation, and can be set aside; an answered one is an 알림 line that
// says who answered, Harper or a team member.
test("unanswered message card: reply opens the chat, 답 안 해도 돼요 sets it aside; 알림 lines say who answered", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  t.after(async () => {
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });

  const talent = { id: "t1", name: "Candidate A", recommendationId: "rec-1" };
  const read = new Set<string>();
  const posts: unknown[] = [];
  const todo = () => ({
    items: [
      { id: "unanswered:m2", column: "my_turn", kind: "unanswered_message",
        at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), detail: "Could we talk on Friday?", talent },
      { id: "activity:m1", column: "notice", kind: "candidate_message", at: "2026-11-07T01:00:00.000Z",
        detail: "candidate_message", talent, answeredBy: { by: "harper" } },
      { id: "activity:m0", column: "notice", kind: "candidate_response", at: "2026-11-06T01:00:00.000Z",
        detail: "candidate_response", talent: { ...talent, id: "t2", name: "Candidate B" },
        answeredBy: { by: "team", name: "Member C" } },
    ].filter((item) => !read.has(item.id)),
    myTurn: 1,
    suggestions: 0,
    roles: [],
  });

  const nodeModule = Module as any;
  const load = nodeModule._load;
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/i18n/org/OrgLocaleProvider") return { useOrgLocale: () => ({ locale: "ko",
      c: (ko: string, _en: string, values: Record<string, unknown> = {}) =>
        ko.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? "")) }) };
    if (name === "@/lib/internalApiClient") return { fetchWithInternalAuth: async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") return todo();
      const body = JSON.parse(String(init.body));
      posts.push(body);
      read.add(body.read);
      return { ok: true };
    } };
    if (name === "@/components/ui/button") return { MuteButton: ({ variant: _v, size: _s, asChild, children, ...props }: any) =>
      asChild ? children : <button {...props}>{children}</button> };
    if (name === "next/link") return { __esModule: true, default: ({ href, children, shallow: _s, ...props }: any) =>
      <a href={String(href)} {...props}>{children}</a> };
    return load.call(this, name, ...args);
  });
  const { OrgTodoList } = await import("./OrgTodoChip");
  const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  await act(async () => root.render(<QueryClientProvider client={client}>
    <OrgTodoList columns={["my_turn", "notice"]} onApprove={() => {}} range="recent" roleId="role" variant="cards" workspaceId="ws" />
  </QueryClientProvider>));
  await flush();

  const chat = buildOrgHref({ orgId: "ws", page: "role", roleId: "role", tab: "chat" });
  const doc = dom.window.document;
  const item = (text: string) => [...doc.querySelectorAll("li")].find((node) => node.textContent?.includes(text));
  const link = (scope: Element, label: string) =>
    [...scope.querySelectorAll("a")].find((node) => node.textContent?.includes(label));

  // The card: who, a short quote of the message and how long ago, under 결정할 것.
  const card = item("Candidate A님 메시지에 아직 답하지 않았어요")!;
  assert.ok(card, "the card is shown");
  assert.match(card.textContent!, /“Could we talk on Friday\?” · 2시간 전/);
  assert.match(doc.querySelector("h1")!.textContent!, /결정할 것.*1/);
  assert.equal(link(card, "답하기")?.getAttribute("href"), chat);

  // Answered lines say who answered and open the conversation.
  const byHarper = item("Candidate A님에게 메시지가 왔어요")!;
  assert.match(byHarper.textContent!, /Candidate A님에게 메시지가 왔어요 · Harper가 답했어요/);
  assert.equal(link(byHarper, "대화 열기")?.getAttribute("href"), chat);
  const byMember = item("Candidate B님이 답변했어요")!;
  assert.match(byMember.textContent!, /Candidate B님이 답변했어요 · Member C님이 답했어요/);
  assert.doesNotMatch(byMember.textContent!, /Harper가 답했어요/);

  // Set aside: the card's own id is marked, so a new message is a new card.
  const dismiss = [...card.querySelectorAll("button")].find((node) => node.textContent === "답 안 해도 돼요")!;
  await act(async () => dismiss.click());
  await flush();
  assert.deepEqual(posts, [{ roleId: "role", workspaceId: "ws", read: "unanswered:m2" }]);
  assert.equal(item("메시지에 아직 답하지 않았어요"), undefined);
});
