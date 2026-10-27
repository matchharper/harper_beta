import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

test("role move checks only the selected destination, even with a cached workspace board", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://fixture.invalid",
  });
  const original = { window: globalThis.window, document: globalThis.document };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRoot(dom.window.document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });
  const item = { talentId: "talent", roleId: "source", stage: "company_intro" };
  const board = (roleId: string | null, items: unknown[]) => ({
    workspaceId: "workspace",
    roleId,
    items,
    stages: [],
  });
  const key = (roleId?: string) =>
    queryKeys.org.board({ workspaceId: "workspace", roleId });
  client.setQueryData(key(), board(null, [item]));
  client.setQueryData(
    key("duplicate"),
    board("duplicate", [{ ...item, roleId: "duplicate" }])
  );
  client.setQueryData(
    key("archived"),
    board("archived", [{ ...item, roleId: "archived", stage: "archived" }])
  );
  const fetches: string[] = [];
  let resolveBoard: (value: unknown) => void = () => {};
  const nodeModule = Module as any;
  const load = nodeModule._load;
  t.mock.method(
    nodeModule,
    "_load",
    function (this: unknown, name: string, ...args: unknown[]) {
      if (name === "@/i18n/org/OrgLocaleProvider")
        return {
          useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
        };
      if (name === "@/lib/internalApiClient")
        return {
          fetchWithInternalAuth: (url: string) => {
            fetches.push(url);
            return new Promise((resolve) => {
              resolveBoard = resolve;
            });
          },
        };
      if (name === "@/components/common/TalentCareerModal")
        return {
          __esModule: true,
          default: ({ children, footer }: any) => (
            <div>
              {children}
              {footer}
            </div>
          ),
        };
      if (name === "@/components/ui/button")
        return {
          MuteButton: ({ variant, ...props }: any) => <button {...props} />,
        };
      if (name === "@/components/ui/select")
        return {
          Select: ({ value, onValueChange, items }: any) => (
            <select
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
            >
              <option value="">Select</option>
              {items.map((item: any) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          ),
          SelectContent: () => null,
          SelectItem: () => null,
          SelectTrigger: () => null,
          SelectValue: () => null,
        };
      return load.call(this, name, ...args);
    }
  );
  const { OrgCandidateRoleMoveDialog } =
    await import("./OrgCandidateRoleMoveDialog");
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <OrgCandidateRoleMoveDialog
          detail={
            {
              workspace: { workspaceId: "workspace" },
              role: { roleId: "source", name: "Source" },
              talent: { userId: "talent", name: "Candidate" },
              recommendation: {
                stage: "company_intro",
                recommendationId: "intro",
              },
            } as any
          }
          roles={
            ["source", "empty", "duplicate", "archived"].map((roleId) => ({
              roleId,
              name: roleId,
              status: "active",
            })) as any
          }
          onClose={() => {}}
          onMoved={() => {}}
        />
      </QueryClientProvider>
    )
  );
  const alert = () => dom.window.document.querySelector('[role="alert"]');
  const submit = () =>
    dom.window.document.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    )!;
  const select = async (value: string) =>
    act(async () => {
      const input = dom.window.document.querySelector("select")!;
      input.value = value;
      input.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  assert.equal(
    alert(),
    null,
    "opening the dialog must not treat the source role as a duplicate"
  );
  assert.equal(submit().disabled, true);
  assert.equal(
    fetches.length,
    0,
    "unselected destination does not fetch the workspace board"
  );
  await select("duplicate");
  assert.match(alert()?.textContent ?? "", /이미 진행 중/);
  assert.equal(submit().disabled, true);
  await select("empty");
  assert.equal(
    alert(),
    null,
    "previous destination warning clears while the new role loads"
  );
  assert.equal(submit().disabled, true);
  assert.equal(fetches.length, 1);
  assert.match(fetches[0], /roleId=empty/);
  await act(async () => {
    resolveBoard(board("empty", []));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(alert(), null);
  assert.equal(submit().disabled, false);
  await select("archived");
  assert.equal(alert(), null);
  assert.equal(
    submit().disabled,
    false,
    "archived candidates do not block a move"
  );
  await select("");
  assert.equal(
    alert(),
    null,
    "clearing the destination must not reuse workspace candidates"
  );
  assert.equal(submit().disabled, true);
});
