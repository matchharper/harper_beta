import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Harper's scheduled work on the To-do (#263): when it runs and who set it
// up, paused work never called 예정, and a cancel that fails says why. A
// stale revision (409) reloads the list and allows one more press.
test("scheduled work rows show time and owner, paused work, and failed cancels", async (t) => {
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

  // The server: s1's revision moves on as the scheduler runs; s3 is shown
  // without what cancelling needs (the person may not cancel).
  let revision = 3;
  let gets = 0;
  const cancelled = new Set<string>();
  const cancels: Array<{ scheduleId: string; expectedRevision: number }> = [];
  const outcomes = new Map<string, number[]>([["s1", [409, 409]], ["s2", [403]], ["s4", []]]);
  const schedule = (id: string, extra: Record<string, unknown>): Record<string, unknown> => ({ id: `schedule:${id}`,
    column: "scheduled", kind: "harper_scheduled", at: null, scheduleStatus: "active", ...extra });
  const todo = () => ({
    items: [
      schedule("s1", { nextAt: "2026-11-11T00:00:00.000Z", detail: "후보 답장 다시 확인", source: "harper",
        scheduledBy: "harper", scheduleId: "s1", scheduleRevision: revision }),
      schedule("s2", { scheduleStatus: "paused", nextAt: null, detail: "주간 요약", scheduledBy: "team",
        scheduleId: "s2", scheduleRevision: 1 }),
      schedule("s3", { nextAt: "2026-11-12T05:30:00.000Z", detail: "보기만", scheduledBy: "team" }),
      schedule("s4", { nextAt: "2026-11-13T00:00:00.000Z", detail: "지원자 정리", scheduledBy: "team",
        scheduleId: "s4", scheduleRevision: 2 }),
    ].filter((item) => !cancelled.has(String(item.scheduleId))),
    myTurn: 0,
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
      if (init?.method !== "POST") { gets++; return todo(); }
      const { cancelSchedule } = JSON.parse(String(init.body));
      cancels.push(cancelSchedule);
      const status = outcomes.get(cancelSchedule.scheduleId)?.shift();
      if (status === 409) revision++;
      if (status) throw Object.assign(new Error("server error"), { status });
      cancelled.add(cancelSchedule.scheduleId);
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
    <OrgTodoList columns={["scheduled"]} onApprove={() => {}} range="recent" roleId="role" workspaceId="ws" />
  </QueryClientProvider>));
  await flush();

  const row = (title: string) => [...dom.window.document.querySelectorAll("li")]
    .find((item) => item.textContent?.includes(title))!;
  const cancelButton = (title: string) => row(title)?.querySelector("button") ?? null;
  const click = async (title: string) => { await act(async () => cancelButton(title)!.click()); await flush(); };

  // When it runs, and who set it up.
  assert.match(row("후보 답장 다시 확인").textContent!, /Harper 예정: 후보 답장 다시 확인 · 수 오전 9:00/);
  assert.match(row("후보 답장 다시 확인").textContent!, /Harper가 정한 일/);
  assert.match(row("지원자 정리").textContent!, /팀이 요청한 일/);
  // Paused work is not called 예정 and has no next time.
  assert.match(row("주간 요약").textContent!, /잠시 멈춤: 주간 요약/);
  assert.doesNotMatch(row("주간 요약").textContent!, /Harper 예정|·/);
  // Someone who may not cancel sees the row without the button.
  assert.match(row("보기만").textContent!, /Harper 예정: 보기만 · 목 오후 2:30/);
  assert.equal(cancelButton("보기만"), null);

  // A stale revision: the list reloads and one more press uses the new revision.
  const before = gets;
  await click("후보 답장 다시 확인");
  assert.ok(gets > before, "the list was reloaded");
  assert.match(row("후보 답장 다시 확인").textContent!, /한 번 더 눌러 주세요/);
  assert.equal(cancelButton("후보 답장 다시 확인")!.disabled, false);
  await click("후보 답장 다시 확인");
  assert.deepEqual(cancels.map((call) => call.expectedRevision), [3, 4]);
  // A second stale revision stops there.
  assert.match(row("후보 답장 다시 확인").textContent!, /취소하지 못했어요/);
  assert.equal(cancelButton("후보 답장 다시 확인")!.disabled, true);

  // No permission: the error is shown and the button goes away.
  await click("주간 요약");
  assert.match(row("주간 요약").textContent!, /취소할 권한이 없어요/);
  assert.equal(cancelButton("주간 요약"), null);

  // A cancel that works removes the row.
  await click("지원자 정리");
  assert.equal(row("지원자 정리"), undefined);
  // Each row keeps its own outcome.
  assert.equal(dom.window.document.querySelectorAll("[role=alert]").length, 2);
  assert.match(row("후보 답장 다시 확인").textContent!, /취소하지 못했어요/);
  assert.equal(cancelButton("후보 답장 다시 확인")!.disabled, true);
  assert.equal(cancels.length, 4);
});
