import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { JSDOM } from "jsdom";
import { MessagesProvider } from "@/i18n/useMessage";
import { OpportunityType } from "@/lib/opportunityType";
import type { CareerHistoryOpportunity } from "@/components/career/types";
import { deriveHistoryOpportunityCounts } from "./careerSessionData";
import { useCareerHistoryState } from "./useCareerHistoryState";
import {
  useCareerMobileHistoryOpportunities,
  type CareerMobileHistoryJobsTab,
} from "./useCareerMobileHistoryOpportunities";

const items = Array.from(
  { length: 15 },
  (_, index) =>
    ({
      id: `opportunity-${index}`,
      roleId: `role-${index}`,
      title: `Position ${index}`,
      companyName: "Example",
      clickedAt: null,
      companyDescription: null,
      companyHomepageUrl: null,
      companyLinkedinUrl: null,
      companyLogoUrl: null,
      description: null,
      externalJdUrl: null,
      feedbackAt: null,
      feedbackReason: null,
      href: null,
      location: null,
      postedAt: null,
      sourceJobId: null,
      sourceProvider: null,
      viewedAt: null,
      workMode: null,
      feedback: "positive",
      kind: "recommendation",
      isAccepted: false,
      savedStage: index < 2 ? "applied" : "connected",
      listPosition: index % 2 ? "current" : "previous",
      sourceType: "external",
      isInternal: false,
      opportunityType: OpportunityType.ExternalJd,
      status: "active",
      employmentTypes: [],
      recommendationReasons: [],
      recommendedAt: "2026-10-01T00:00:00Z",
    }) satisfies CareerHistoryOpportunity
);
const counts = deriveHistoryOpportunityCounts(items);

for (const failFirst of [false, true]) {
  test(
    failFirst
      ? "progress loading stops on failure and retries both stages explicitly"
      : "progress batches both stages, preserves previous-list decisions, and follows independent server cursors",
    async () => {
      const dom = new JSDOM("<div id='root'></div>", {
        url: "http://localhost",
      });
      const globals = {
        window: dom.window,
        document: dom.window.document,
        Event: dom.window.Event,
        CustomEvent: dom.window.CustomEvent,
        IS_REACT_ACT_ENVIRONMENT: true,
      };
      const previous = Object.keys(globals).map(
        (key) =>
          [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const
      );
      for (const [key, value] of Object.entries(globals))
        Object.defineProperty(globalThis, key, { configurable: true, value });
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const root = createRoot(dom.window.document.getElementById("root")!);
      const requests: { stages: string[]; offset: number }[] = [];
      let loadAllProgress = false;
      let history!: ReturnType<typeof useCareerHistoryState>;
      let collection!: ReturnType<typeof useCareerMobileHistoryOpportunities>;
      const fetchWithAuth = async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        assert.equal(url.searchParams.get("historyTab"), "saved");
        assert.equal(
          url.searchParams.get("savedStage"),
          null,
          "grouped lists use the existing batch endpoint"
        );
        const stages = url.searchParams.get("savedStages")!.split(",");
        const offset = Number(url.searchParams.get("offset"));
        requests.push({ stages, offset });
        if (failFirst && requests.length === 1)
          return Response.json({ error: "Temporary failure" }, { status: 503 });
        const savedStagePages = Object.fromEntries(
          stages.map((stage) => {
            const matching = items.filter((item) => item.savedStage === stage);
            const page = matching.slice(offset, offset + 10);
            return [
              stage,
              {
                items: page,
                nextOffset:
                  offset + page.length < matching.length
                    ? offset + page.length
                    : null,
              },
            ];
          })
        );
        return Response.json({ counts, savedStagePages });
      };
      function Harness({ tab }: { tab: CareerMobileHistoryJobsTab }) {
        history = useCareerHistoryState({
          autoLoad: false,
          conversationId: null,
          enabled: true,
          userId: "progress-fixture",
          fetchWithAuth,
        });
        collection = useCareerMobileHistoryOpportunities({
          activeTab: tab,
          loadAllProgress,
          historyUpdateError: history.historyUpdateError,
          historyLoading: false,
          historyOpportunities: history.historyOpportunities,
          historyOpportunityCounts: history.historyOpportunityCounts,
          getHistoryOpportunityPageFilterState:
            history.getHistoryOpportunityPageFilterState,
          onLoadSavedStageHistoryOpportunityPages:
            history.loadSavedStageHistoryOpportunityPages,
          onLoadMoreHistoryOpportunities: history.loadMoreHistoryOpportunities,
        });
        return (
          <div>{collection.opportunities.map((item) => item.id).join(",")}</div>
        );
      }
      const render = (tab: CareerMobileHistoryJobsTab) =>
        act(async () =>
          root.render(
            <QueryClientProvider client={client}>
              <MessagesProvider locale="ko" persistPreference={false}>
                <Harness tab={tab} />
              </MessagesProvider>
            </QueryClientProvider>
          )
        );
      const settle = () =>
        act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      try {
        await render("applied");
        await settle();
        assert.deepEqual(
          requests,
          [{ stages: ["applied", "connected", "offer"], offset: 0 }],
          "both first pages load even before session counts arrive"
        );
        if (failFirst) {
          assert.equal(collection.isLoading, false);
          assert.equal(collection.opportunities.length, 0);
          assert.equal(history.historyUpdateError, "Temporary failure");
          await settle();
          assert.equal(
            requests.length,
            1,
            "failure must not cause an automatic retry loop"
          );
          await act(async () => {
            collection.loadMore();
          });
          await settle();
          assert.equal(requests.length, 2);
          assert.equal(history.historyUpdateError, "");
        }
        assert.equal(collection.opportunities.length, 12);
        assert.ok(
          collection.opportunities.some(
            (item) =>
              item.savedStage === "applied" && item.listPosition === "previous"
          )
        );
        assert.ok(
          collection.opportunities.some(
            (item) =>
              item.savedStage === "connected" &&
              item.listPosition === "previous"
          )
        );
        assert.equal(collection.hasMore, true);
        assert.equal(collection.isLoading, false);
        const beforeMore = requests.length;
        loadAllProgress = true;
        await render("applied");
        await act(async () => {
          collection.loadMore();
          collection.loadMore();
        });
        await settle();
        assert.deepEqual(
          requests.slice(beforeMore),
          [{ stages: ["connected"], offset: 10 }],
          "completed stages and concurrent calls do not issue duplicate requests"
        );
        assert.equal(collection.opportunities.length, 15);
        assert.equal(
          new Set(collection.opportunities.map((item) => item.id)).size,
          15
        );
        assert.equal(collection.hasMore, false);
        await act(async () =>
          history.hydrateHistoryOpportunityCounts({
            ...counts,
            savedStages: { ...counts.savedStages, connected: 100 },
          })
        );
        assert.equal(
          collection.hasMore,
          false,
          "a stale badge count cannot reopen an exhausted cursor"
        );
        await render("saved");
        const beforeReturn = requests.length;
        await render("applied");
        await settle();
        assert.equal(
          requests.length,
          beforeReturn,
          "returning to the tab reuses loaded pages"
        );
        assert.equal(collection.opportunities.length, 15);
        loadAllProgress = false;
        await render("applied");
        await act(async () =>
          client.setQueriesData(
            { queryKey: ["career-history-opportunities"] },
            {
              pages: [{ items: [], nextOffset: null, counts: null }],
              pageParams: [0],
            }
          )
        );
        await settle();
        assert.deepEqual(requests.at(-1), {
          stages: ["applied", "connected"],
          offset: 0,
        });
        assert.equal(
          collection.opportunities.length,
          12,
          "cache loss automatically reloads both first pages"
        );
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
  );
}
