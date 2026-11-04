import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { createEmptyHistoryOpportunityCounts } from "@/hooks/career/careerSessionData";
import { formatCareerInlineUiReference } from "@/lib/career/inlineUi";
import { OpportunityType } from "@/lib/opportunityType";
import { useCareerWorkspaceUiStore } from "@/store/useCareerWorkspaceUiStore";
import type { CareerHistoryOpportunity, CareerMessage } from "../../types";
import CareerMessageBubble from "../CareerMessageBubble";
import {
  CareerInlineUiProvider,
  type CareerInlineUiRuntime,
} from "./CareerInlineUi";

const roleId = "00000000-0000-4000-8000-000000000001";
const matchingId = "00000000-0000-4000-8000-000000000002";
const marker = formatCareerInlineUiReference({ type: "matching", matchingId });
const item: CareerHistoryOpportunity = {
  id: "opportunity",
  roleId,
  companyName: "Fixture",
  title: "Engineer",
  clickedAt: null,
  companyDescription: null,
  companyHomepageUrl: null,
  companyLinkedinUrl: null,
  companyLogoUrl: null,
  description: null,
  employmentTypes: [],
  externalJdUrl: null,
  feedback: null,
  feedbackAt: null,
  feedbackReason: null,
  href: null,
  isAccepted: false,
  isInternal: false,
  kind: "recommendation",
  location: null,
  opportunityType: OpportunityType.ExternalJd,
  postedAt: null,
  recommendedAt: "2026-11-04T00:00:00Z",
  recommendationReasons: [],
  savedStage: null,
  sourceJobId: null,
  sourceProvider: null,
  sourceType: "external",
  status: "active",
  viewedAt: null,
  workMode: null,
};
const router = {
  query: {},
  isReady: true,
  pathname: "/career",
  asPath: "/career",
  push: async () => true,
} as unknown as NextRouter;

async function withRenderer(
  run: (h: {
    render: (messages: Partial<CareerMessage>[]) => Promise<void>;
    document: Document;
    runtime: CareerInlineUiRuntime;
    requests: string[];
    saved: string[];
    opened: string[];
  }) => Promise<void>
) {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "http://localhost/career",
  });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    CustomEvent: dom.window.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const root = createRoot(dom.window.document.getElementById("root")!);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const requests: string[] = [],
    saved: string[] = [],
    opened: string[] = [];
  const runtime: CareerInlineUiRuntime = {
    userId: "fixture-user",
    fetchWithAuth: async (url) => {
      requests.push(url);
      return Response.json(
        url.startsWith("/api/talent/matchings")
          ? {
              matching: { id: matchingId, title: "Fixture matching" },
              opportunities: [
                { roleId, isRecommended: false, opportunity: item },
              ],
              nextCursor: null,
            }
          : { items: [item] }
      );
    },
    history: {
      historyOpportunities: [],
      historyOpportunityCounts: createEmptyHistoryOpportunityCounts(),
      historyLoading: false,
      historyUpdateError: "",
      onLoadMoreHistoryOpportunities: () => undefined,
      onLoadSavedStageHistoryOpportunityPages: () => undefined,
      getHistoryOpportunityPageFilterState: () => ({
        loading: false,
        nextOffset: null,
      }),
    },
    profile: { talentBrief: [], mutateTalentContexts: async () => true },
    pendingIds: [],
    onOpen: (value) => {
      opened.push(value.id);
    },
    onApply: () => undefined,
    onSave: (value) => {
      saved.push(value.id);
    },
  };
  const render = async (messages: Partial<CareerMessage>[]) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterContext.Provider value={router}>
            <MessagesProvider locale="ko">
              <CareerInlineUiProvider value={runtime}>
                {messages.map((message, index) => (
                  <CareerMessageBubble
                    key={index}
                    isUser={message.role === "user"}
                    message={{
                      id: String(index),
                      role: "assistant",
                      messageType: "chat",
                      createdAt: "2026-11-04T00:00:00Z",
                      content: "",
                      ...message,
                    }}
                  />
                ))}
              </CareerInlineUiProvider>
            </MessagesProvider>
          </RouterContext.Provider>
        </QueryClientProvider>
      )
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  };
  try {
    await run({
      render,
      document: dom.window.document,
      runtime,
      requests,
      saved,
      opened,
    });
  } finally {
    await act(async () => root.unmount());
    client.clear();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}

test("streaming references render in place, share reads and save only on a user click", async () => {
  await withRenderer(async ({ render, document, requests, saved, opened }) => {
    await render([{ content: "Before\n" + marker.slice(0, -2), typing: true }]);
    assert.equal(requests.length, 0);
    assert.doesNotMatch(document.body.textContent!, /career_ui/);
    await render([
      { content: "Before\n" + marker + "\nAfter", typing: true },
      { content: marker },
    ]);
    assert.equal(requests.length, 1);
    const regions = document.querySelectorAll(
      'section[aria-label="매칭 결과"]'
    );
    assert.equal(regions.length, 2);
    assert.ok(regions[0].classList.contains("rounded-3xl"));
    assert.ok(regions[0].classList.contains("bg-black/4"));
    const text = document.body.textContent!;
    assert.ok(text.indexOf("Before") < text.indexOf("Fixture matching"));
    assert.ok(text.indexOf("Fixture matching") < text.indexOf("After"));
    assert.equal(saved.length, 0);
    await act(async () =>
      (
        regions[0].querySelector(
          'button[aria-label="Fixture 저장하기"]'
        ) as HTMLButtonElement
      ).click()
    );
    assert.deepEqual(saved, [item.id]);
    assert.deepEqual(opened, []);
    await act(async () =>
      (
        regions[0].querySelector(
          '[role="button"][aria-label="Engineer · Fixture"]'
        ) as HTMLButtonElement
      ).click()
    );
    assert.deepEqual(opened, [item.id]);
  });
});

test("user examples, code, email, calls and malformed references never start UI reads", async () => {
  await withRenderer(async ({ render, document, requests }) => {
    for (const message of [
      { role: "user" as const, content: marker },
      { content: "```text\n" + marker + "\n```" },
      { content: "> " + marker },
      { content: "Email\n" + marker, messageType: "mail" as const },
      { content: "Call\n" + marker, messageType: "call" as const },
      { content: '[[career_ui:{"type":"matching","matchingId":"invalid"}]]' },
    ]) {
      await render([message]);
      assert.equal(requests.length, 0);
      assert.equal(
        document.querySelectorAll('section[aria-label="매칭 결과"]').length,
        0
      );
      if (message.messageType)
        assert.doesNotMatch(document.body.textContent!, /career_ui/);
    }
  });
});

test("explicit collections use one owner-scoped batch and report missing entries", async () => {
  await withRenderer(async ({ render, document, requests }) => {
    const reference = formatCareerInlineUiReference({
      type: "opportunities",
      roleIds: [roleId, matchingId],
    });
    await render([{ content: reference }, { content: reference }]);
    assert.equal(requests.length, 1);
    assert.equal(
      new URL(requests[0], "http://localhost").searchParams.get("roleIds"),
      [roleId, matchingId].join(",")
    );
    assert.equal(
      document.querySelectorAll('section[aria-label="기회 모음"] article')
        .length,
      2
    );
    assert.match(document.body.textContent!, /일부 기회는 조회할 수 없어요/);
  });
});

test("friendly streaming reveals the complete text before an inline view", async () => {
  try {
    useCareerWorkspaceUiStore.setState({ conversationVersion: "friendly" });
    await withRenderer(async ({ render, document }) => {
      await render([{ content: "Before\n" + marker + "\nStill streaming", typing: true }]);
      const text = document.body.textContent!;
      assert.match(text, /Before/);
      assert.ok(text.indexOf("Before") < text.indexOf("Fixture matching"));
      assert.doesNotMatch(text, /Still streaming/);
    });
  } finally { useCareerWorkspaceUiStore.setState({ conversationVersion: "professional" }); }
});

test("failed and anonymous references stay contained without data or mutations", async () => {
  await withRenderer(async ({ render, document, runtime, requests, saved }) => {
    runtime.fetchWithAuth = async () => {
      throw new Error("Unavailable");
    };
    await render([{ content: marker }]);
    assert.match(document.body.textContent!, /목록을 불러오지 못했어요/);
    runtime.userId = null;
    await render([
      { content: marker },
      { content: formatCareerInlineUiReference({ type: "brief" }) },
    ]);
    assert.equal(requests.length, 0);
    assert.equal(saved.length, 0);
    assert.equal(document.querySelectorAll("[role=status]").length, 2);
  });
});
