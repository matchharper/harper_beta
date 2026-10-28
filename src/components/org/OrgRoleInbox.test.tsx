import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

test("card review loads another batch only when next is requested at the page boundary", async (t) => {
  const dom = new JSDOM("<div id='root'></div>", {
    url: "https://fixture.invalid",
  });
  const original = {
    window: globalThis.window,
    document: globalThis.document,
    IntersectionObserver: globalThis.IntersectionObserver,
  };
  let intersect: (() => void) | undefined;
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    IntersectionObserver: class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {
        intersect = undefined;
      }
    },
  });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  const client = new QueryClient();
  const root = createRoot(dom.window.document.getElementById("root")!);
  t.after(async () => {
    await act(async () => root.unmount());
    client.clear();
    Object.assign(globalThis, original, { IS_REACT_ACT_ENVIRONMENT: false });
    dom.window.close();
  });
  const items = Array.from({ length: 10 }, (_, i) => ({
    recommendationId: `r${i}`,
    talentId: `t${i}`,
    roleId: "role",
    stage: "company_intro",
    source: "company_intro",
    companyPresentedAt: "2026-10-27T00:00:00Z",
    talent: { name: `Person ${i}`, recentCompanies: [], recentSchools: [] },
    criteriaEvaluations: [],
  }));
  const board = { items, totalCount: 23 };
  let fetches = 0,
    refetches = 0;
  let detailId = "";
  const selections: string[] = [];
  const query = { inboxStage: "company_intro", inboxView: "list" } as Record<
    string,
    string
  >;
  const pagination = {
    hasNextPage: true,
    isFetching: false,
    isError: false,
    isFetchNextPageError: false,
    fetchNextPage: async () => {
      fetches++;
      return {
        isError: pagination.isError,
        hasNextPage: true,
        data: {
          pages: [
            {
              items: [
                ...items,
                { ...items[0], recommendationId: "r10", talentId: "t10" },
              ],
            },
          ],
        },
      };
    },
    data: {
      pages: [
        {
          ...board,
          counts: { pending_connection: 0, company_intro: 23, saved: 0 },
        },
      ],
    },
  };
  const boardQuery = {
    data: board,
    error: null as Error | null,
    isLoading: false,
    refetch: async () => {
      refetches++;
    },
  };
  let detailProps: any;
  const pushes: any[] = [];
  const nodeModule = Module as any,
    load = nodeModule._load;
  const empty = () => null;
  t.mock.method(
    nodeModule,
    "_load",
    function (this: unknown, name: string, ...args: unknown[]) {
      if (name === "next/router")
        return {
          useRouter: () => ({
            query,
            pathname: "/org/role",
            push: (value: unknown) => pushes.push(value),
            replace: (value: unknown) => pushes.push(value),
          }),
        };
      if (name === "@/i18n/org/OrgLocaleProvider")
        return {
          useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
          useOrgSourceT: () => (value: unknown) => value,
        };
      if (name === "@/hooks/org/useOrgJobs")
        return {
          useOrgJobsBoard: () => ({
            board,
            boardQuery,
            inboxQuery: pagination,
          }),
          useOrgJobsNavigation: () => ({
            activeRole: { roleId: "role" },
            workspaceId: "workspace",
            detailTalentId: detailId ? "t" : "",
            detailRecommendationId: detailId,
            selectTalent: (item: { recommendationId: string }) =>
              selections.push(item.recommendationId),
          }),
        };
      if (name === "@/hooks/org/useOrgBilling")
        return { useOrgEntitlements: () => ({ data: {} }) };
      if (name === "@/lib/org/billing/types")
        return { canUsePendingConnections: () => true };
      if (name === "./TalentDetailSimpleView")
        return {
          TalentDetailSimpleView: (props: unknown) => {
            detailProps = props;
            return <div data-testid="detail" />;
          },
        };
      if (name === "./OrgCriteriaBars") return { OrgCriteriaBars: empty };
      if (name === "./OrgSearchHistory") return { OrgSearchHistory: empty };
      if (name === "./OrgRoleTalentBoard") return { OrgRoleTalentBoard: empty };
      if (name === "./OrgHomeInbox") return { ReviewEmptyState: empty };
      if (name === "./billing/OrgPendingConnectionGate")
        return { OrgPendingConnectionGate: empty };
      if (name === "./workspace/OrgErrorState")
        return {
          OrgErrorState: ({ onRetry }: { onRetry: () => void }) => (
            <button onClick={onRetry}>Retry</button>
          ),
        };
      return load.call(this, name, ...args);
    }
  );
  const { OrgRoleInbox } = await import("./OrgRoleInbox");
  const render = () =>
    act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <OrgRoleInbox />
        </QueryClientProvider>
      );
    });
  await render();
  assert.equal(dom.window.document.querySelectorAll("article").length, 10);
  assert.equal(fetches, 0);
  await act(async () => {
    intersect?.();
  });
  assert.equal(fetches, 1);
  query.inboxView = "card";
  query.recommendationId = detailId = "r0";
  await render();
  assert.equal(fetches, 1);
  assert.equal(detailProps.navigationTotal, 23);
  query.recommendationId = detailId = "r8";
  await render();
  assert.equal(
    fetches,
    1,
    "ninth candidate is already prepared and starts no load"
  );
  pagination.isFetching = true;
  query.recommendationId = detailId = "r9";
  await render();
  assert.equal(
    fetches,
    1,
    "reaching the tenth candidate does not load the eleventh yet"
  );
  pagination.isFetching = false;
  await act(async () => {
    detailProps.onNextPage();
  });
  assert.equal(fetches, 2);
  assert.deepEqual(
    selections,
    ["r10"],
    "next loads one batch and then selects its first candidate"
  );
  pagination.isError = pagination.isFetchNextPageError = true;
  boardQuery.error = new Error("Unavailable");
  await render();
  assert.equal(fetches, 2, "no automatic retry loop");
  assert.ok(
    dom.window.document.querySelector('[data-testid="detail"]'),
    "failed extra page preserves the selected profile"
  );
  await act(async () => {
    [...dom.window.document.querySelectorAll("button")]
      .find((button) => button.textContent === "Retry")!
      .click();
  });
  assert.equal(fetches, 3);
  assert.equal(refetches, 0, "retry targets the failed page");
  pagination.isError = pagination.isFetchNextPageError = false;
  pagination.hasNextPage = false;
  boardQuery.error = null;
  query.recommendationId = detailId = "deep-link-outside-first-page";
  await render();
  assert.equal(
    pushes.length,
    0,
    "a direct profile link is not replaced by the first loaded candidate"
  );
});
