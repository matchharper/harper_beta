import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

test("end hiring shows the fetched count, waits for it, and sends only the confirmed lifecycle action", async t => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://fixture.invalid" });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  t.after(async () => {
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });
  let complete: (value: { recipientCount: number }) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const urls: string[] = [];
  const nodeModule = Module as any;
  const load = nodeModule._load;
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/i18n/org/OrgLocaleProvider") return { useOrgLocale: () => ({
      c: (ko: string, _en: string, values: Record<string, unknown> = {}) =>
        ko.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? "")),
    }) };
    if (name === "@/lib/internalApiClient") return { fetchWithInternalAuth: (url: string) => {
      urls.push(url);
      return new Promise((resolve, reject) => { complete = resolve; fail = reject; });
    } };
    if (name === "@/components/common/TalentCareerModal") return { __esModule: true,
      default: ({ open, title, description, footer, children }: any) => open ?
        <div role="dialog"><h2>{title}</h2><p>{description}</p>{children}{footer}</div> : null };
    if (name === "@/components/ui/button") return { MuteButton: ({ variant, size, ...props }: any) => <button {...props} /> };
    if (name === "@/components/ui/dropdown-menu") return {
      DropdownMenu: ({ children }: any) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: any) => children,
      DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
      DropdownMenuItem: ({ onSelect, children, disabled }: any) => <button onClick={onSelect} disabled={disabled}>{children}</button>,
    };
    return load.call(this, name, ...args);
  });
  const { OrgRoleActionsMenu } = await import("./OrgRoleActionsMenu");
  let ended = 0;
  await act(async () => root.render(<QueryClientProvider client={client}>
    <OrgRoleActionsMenu role={{ roleId: "role", workspaceId: "workspace", name: "Engineer", status: "active" } as any}
      onEnd={() => ended++} onPause={() => {}} onDelete={() => {}} onResume={() => {}} />
  </QueryClientProvider>));
  const menuEnd = () => [...dom.window.document.querySelectorAll("button")].find(button => button.textContent === "채용 종료")!;
  const confirm = () => [...dom.window.document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find(button => button.textContent === "채용 종료")!;
  const flush = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)); });
  assert.equal(urls.length, 0);
  await act(async () => menuEnd().click());
  assert.match(urls[0], /workspaceId=workspace&roleId=role/);
  assert.equal(confirm().disabled, true);
  assert.equal(ended, 0);
  await act(async () => complete({ recipientCount: 3 }));
  await flush();
  assert.match(dom.window.document.body.textContent!, /연결을 수락한 3명에게 해당 역할의 채용이 종료되었다는 안내/);
  assert.equal(confirm().disabled, false);
  await act(async () => confirm().click());
  assert.equal(ended, 1);
  assert.equal(dom.window.document.querySelector("[role=dialog]"), null);

  await act(async () => menuEnd().click());
  assert.equal(confirm().disabled, true);
  await act(async () => complete({ recipientCount: 0 }));
  await flush();
  assert.match(dom.window.document.body.textContent!, /채용 종료를 안내할 후보자는 없습니다/);
  await act(async () => [...dom.window.document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find(button => button.textContent === "취소")!.click());
  assert.equal(ended, 1);

  await act(async () => menuEnd().click());
  await act(async () => fail(new Error("read failed")));
  await flush();
  await act(async () => fail(new Error("read failed")));
  await flush();
  assert.match(dom.window.document.body.textContent!, /안내 대상 인원을 불러오지 못했습니다/);
  assert.equal(confirm().disabled, true);
  await act(async () => [...dom.window.document.querySelectorAll<HTMLButtonElement>("[role=dialog] button")].find(button => button.textContent === "다시 시도")!.click());
  await act(async () => complete({ recipientCount: 1 }));
  await flush();
  assert.match(dom.window.document.body.textContent!, /연결을 수락한 1명에게/);
  assert.equal(confirm().disabled, false);
  assert.equal(ended, 1);
});
