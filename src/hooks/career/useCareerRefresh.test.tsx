import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { useCareerSession } from "./useCareerSession";

async function fixture(
  run: (args: {
    client: QueryClient;
    render: (child: React.ReactNode) => Promise<void>;
    container: HTMLElement;
    settle: () => Promise<void>;
  }) => Promise<void>
) {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost/career",
  });
  const keys = [
    "window",
    "document",
    "Event",
    "CustomEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ];
  const previous = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    Event: { configurable: true, value: dom.window.Event },
    CustomEvent: { configurable: true, value: dom.window.CustomEvent },
    IS_REACT_ACT_ENVIRONMENT: {
      configurable: true,
      writable: true,
      value: true,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const container = dom.window.document.getElementById("root")!;
  const root = createRoot(container);
  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  try {
    await run({
      client,
      container,
      settle,
      render: (child) =>
        act(async () =>
          root.render(
            <QueryClientProvider client={client}>
              <MessagesProvider locale="ko">{child}</MessagesProvider>
            </QueryClientProvider>
          )
        ),
    });
  } finally {
    await act(async () => root.unmount());
    client.clear();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  }
}

test("messages and work admission do not reload the workspace; completed work reconciles once", async () => {
  const { useCareerOpenForms } = await import("./useCareerOpenForms");
  await fixture(async ({ client, render, settle }) => {
    const key = ["career-open-forms", "conversation"];
    const snapshot = {
      forms: [],
      latestMessageId: 1,
      pending: 0,
      activities: [],
      completionCursor: null,
    };
    client.setQueryData(key, snapshot);
    const invalidated: string[] = [];
    client.invalidateQueries = async (filter, options) => {
      invalidated.push(String(filter?.queryKey?.[0]));
      assert.equal(
        options?.cancelRefetch,
        false,
        "shared consumers must not cancel each other's refreshes"
      );
    };
    function Harness() {
      useCareerOpenForms("conversation");
      return null;
    }
    await render(<Harness />);
    invalidated.length = 0;
    await act(async () => {
      client.setQueryData(key, { ...snapshot, pending: 1 });
    });
    await settle();
    assert.deepEqual(invalidated, []);
    await act(async () => {
      client.setQueryData(key, { ...snapshot, latestMessageId: 2, pending: 1 });
    });
    await settle();
    assert.deepEqual(invalidated, ["career-message-history"]);
    invalidated.length = 0;
    await act(async () => {
      client.setQueryData(key, {
        ...snapshot,
        latestMessageId: 2,
        completionCursor: "finished:1",
      });
    });
    await settle();
    assert.deepEqual(
      invalidated.sort(),
      [
        "career-message-history",
        "career-session",
        "career-history-opportunities",
        "career-history-summary",
        "career-task-progress",
        "career-pending-actions",
        "career-action-items",
      ].sort()
    );
    invalidated.length = 0;
    await act(async () => {
      client.setQueryData(key, {
        ...snapshot,
        latestMessageId: 2,
        completionCursor: "finished:1",
      });
    });
    await settle();
    assert.deepEqual(invalidated, []);
  });
});

test("a silent invocation that starts and finishes between polls still refreshes the workspace", async () => {
  const { useCareerOpenForms } = await import("./useCareerOpenForms");
  await fixture(async ({ client, render, settle }) => {
    const key = ["career-open-forms", "conversation"];
    const snapshot = {
      forms: [],
      latestMessageId: 1,
      pending: 0,
      activities: [],
      completionCursor: "previous:1",
    };
    client.setQueryData(key, snapshot);
    const invalidated: string[] = [];
    client.invalidateQueries = async (filter) => {
      invalidated.push(String(filter?.queryKey?.[0]));
    };
    function Harness() {
      useCareerOpenForms("conversation");
      return null;
    }
    await render(<Harness />);
    invalidated.length = 0;
    await act(async () => {
      client.setQueryData(key, { ...snapshot, completionCursor: "finished:2" });
    });
    await settle();
    assert.ok(
      invalidated.includes("career-session"),
      "completion must not depend on having observed a running poll"
    );
    assert.ok(invalidated.includes("career-history-opportunities"));
    invalidated.length = 0;
    await act(async () => {
      client.setQueryData(key, { ...snapshot, completionCursor: "finished:2" });
    });
    await settle();
    assert.deepEqual(invalidated, []);
  });
});

test("session refresh reads session data without repeating successful bootstrap", async () => {
  await fixture(async ({ render, settle }) => {
    const requests: string[] = [];
    const fetchWithAuth = async (url: string) => {
      requests.push(url);
      return Response.json({
        created: false,
        conversation: { id: "conversation" },
        messages: [],
        historyOpportunities: [],
      });
    };
    let hook!: ReturnType<typeof useCareerSession>;
    function Harness() {
      hook = useCareerSession({
        enabled: true,
        fetchWithAuth,
        locale: "ko",
        opportunityLimit: 0,
        userId: "fixture",
      });
      return null;
    }
    await render(<Harness />);
    await settle();
    await act(async () => {
      await hook.loadSession({ force: true });
    });
    await act(async () => {
      await hook.loadSession({ force: true });
    });
    assert.equal(
      requests.filter((url) => url.endsWith("/bootstrap")).length,
      1
    );
    assert.equal(
      requests.filter((url) => url.startsWith("/api/talent/session?")).length,
      3
    );
  });
});

test("work fetch errors preserve known activity, and show unavailable when no activity was loaded", async () => {
  const { CareerWorkActivity } =
    await import("@/components/career/chat/CareerWorkActivity");
  await fixture(async ({ client, render, container, settle }) => {
    const key = ["career-open-forms", "conversation"];
    client.setQueryData(key, {
      forms: [],
      latestMessageId: 1,
      pending: 1,
      activities: [{ id: "active", logs: ["지원 준비 중"] }],
    });
    await render(<CareerWorkActivity conversationId="conversation" />);
    assert.match(container.textContent!, /Working/);
    const query = client.getQueryCache().find({ queryKey: key })!;
    await act(async () => {
      query.setState({ status: "error", error: new Error("unavailable") });
    });
    await settle();
    assert.match(container.textContent!, /Working/);
    assert.match(container.textContent!, /지원 준비 중/);
    assert.match(container.textContent!, /작업 상태를 확인하지 못했어요/);
    await act(async () => {
      query.setState({
        data: { forms: [], latestMessageId: 1, pending: 0, activities: [] },
        status: "error",
        error: new Error("unavailable"),
      });
    });
    await settle();
    assert.match(container.textContent!, /작업 상태를 확인하지 못했어요/);
    await act(async () => {
      query.setState({
        data: undefined,
        status: "error",
        error: new Error("unavailable"),
      });
    });
    await settle();
    assert.match(container.textContent!, /작업 상태를 확인하지 못했어요/);
  });
});

for (const action of ["save", "view"])
  test(`a summary started before ${action} cannot overwrite the newer count`, async () => {
    const { useCareerHistoryState } = await import("./useCareerHistoryState");
    await fixture(async ({ render, settle }) => {
      const item = {
        id: "rec",
        roleId: "role",
        companyName: "Example",
        title: "Engineer",
        opportunityType: "external_jd",
        sourceType: "external",
        isInternal: false,
        isAccepted: false,
        kind: "recommendation",
        employmentTypes: [],
        recommendationReasons: [],
        viewedAt: null,
        recommendedAt: "2026-11-04",
        feedback: null,
        savedStage: null,
        listPosition: "current",
      } as any;
      const oldCounts = {
        total: 1,
        new: 1,
        newInternal: 0,
        newExternalUnread: 1,
        saved: 0,
        archived: 0,
        savedStages: {
          saved: 0,
          applied: 0,
          connected: 0,
          offer: 0,
          closed: 0,
          hidden: 0,
        },
      };
      let resolveSummary!: (response: Response) => void;
      const oldResponse = new Promise<Response>((resolve) => {
        resolveSummary = resolve;
      });
      const fetchWithAuth = async (url: string) =>
        url.includes("summary=true")
          ? oldResponse
          : Response.json({
              opportunity: {
                ...item,
                feedback: "positive",
                savedStage: "saved",
              },
            });
      let hook!: ReturnType<typeof useCareerHistoryState>;
      function Harness() {
        hook = useCareerHistoryState({
          enabled: true,
          autoLoad: false,
          fetchWithAuth,
          conversationId: "conversation",
          userId: "fixture",
          initialSessionPage: {
            items: [item],
            counts: oldCounts,
            nextOffset: null,
          },
        });
        return null;
      }
      await render(<Harness />);
      await settle();
      assert.ok(hook.historyOpportunityById.has(item.id));
      assert.equal(hook.historyOpportunityCounts.newExternalUnread, 1);
      await act(async () => {
        if (action === "save")
          await hook.onUpdateHistoryOpportunitySavedStage(
            item.id,
            "saved",
            item
          );
        else await hook.onMarkHistoryOpportunityViewed(item.id);
      });
      assert.equal(
        action === "save"
          ? hook.historyOpportunityCounts.saved
          : hook.historyOpportunityCounts.newExternalUnread,
        action === "save" ? 1 : 0
      );
      await act(async () => {
        resolveSummary(Response.json({ counts: oldCounts }));
      });
      await settle();
      assert.equal(
        action === "save"
          ? hook.historyOpportunityCounts.saved
          : hook.historyOpportunityCounts.newExternalUnread,
        action === "save" ? 1 : 0,
        "late pre-mutation counts must not undo a successful mutation"
      );
    });
  });
