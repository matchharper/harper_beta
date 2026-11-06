import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";
import { JSDOM } from "jsdom";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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
      // The list view's own table, selection bar and criteria review have
      // their own tests; here one article stands for each listed candidate.
      if (name === "@/hooks/org/useOrgWorkspace")
        return {
          useOrgWorkspace: () => ({
            permissions: { canManageCandidates: true },
          }),
        };
      if (name === "./OrgInboxListTable")
        return {
          OrgInboxListTable: ({
            items: listed,
          }: {
            items: { recommendationId: string }[];
          }) => (
            <>
              {listed.map((item) => (
                <article key={item.recommendationId} />
              ))}
            </>
          ),
        };
      if (name === "./OrgCandidateSelectionBar")
        return { OrgCandidateSelectionBar: empty };
      if (name === "./OrgCriteriaRecheck")
        return {
          OrgCriteriaReviewPanel: empty,
          useOrgCriteriaReviewCounts: () => ({
            company_intro: 0,
            pending_connection: 0,
          }),
        };
      if (name === "./OrgSearchHistory") return { OrgSearchHistory: empty };
      if (name === "./OrgExternalCandidates") return { OrgExternalCandidates: empty };
      if (name === "@/hooks/org/useOrgExternalCandidates")
        return { useOrgExternalCandidates: () => ({ data: { enabled: false, candidates: [] } }) };
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

// 외부 후보 is the inbox's last sub-tab, only where external sourcing is on.
test("외부 후보 is an inbox sub-tab where external sourcing is on, and older links open it", async () => {
  let query: Record<string, string> = {};
  let external = { enabled: true, candidates: [{ id: "a" }, { id: "b" }] };
  const pushes: Array<{ query: Record<string, string> }> = [];
  let onTab: ((value: string) => void) | undefined;
  const nodeModule = Module as unknown as { _load: (name: string, ...args: unknown[]) => unknown };
  const load = nodeModule._load;
  const empty = () => null;
  const passthrough = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  const board = { items: [], stages: [] };
  nodeModule._load = function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "next/router") return {
      useRouter: () => ({ query, pathname: "/org/role", push: (value: { query: Record<string, string> }) => pushes.push(value) }),
    };
    if (name === "@tanstack/react-query") return { useIsMutating: () => 0 };
    if (name === "lucide-react") return new Proxy({}, { get: () => empty });
    if (name === "@/i18n/org/OrgLocaleProvider") return {
      useOrgLocale: () => ({ c: (ko: string) => ko, locale: "ko" }),
      useOrgSourceT: () => (value: unknown) => value,
    };
    if (name === "@/hooks/org/useOrgJobs") return {
      useOrgJobsBoard: () => ({
        board,
        boardQuery: { data: board, error: null, isLoading: false },
        inboxQuery: { data: { pages: [{ counts: { pending_connection: 0, company_intro: 0, saved: 0 } }] } },
      }),
      useOrgJobsNavigation: () => ({
        activeRole: { roleId: "role" }, workspaceId: "workspace",
        detailTalentId: "", detailRecommendationId: "", selectTalent: empty,
      }),
    };
    if (name === "@/hooks/org/useOrgWorkspace") return { useOrgWorkspace: () => ({ permissions: { canManageCandidates: true } }) };
    if (name === "@/store/useOrgDeferredActionStore") return {
      useOrgDeferredActionStore: (select: (state: { deferredStages: Set<string> }) => unknown) => select({ deferredStages: new Set() }),
    };
    if (name === "@/hooks/org/useOrgExternalCandidates") return { useOrgExternalCandidates: () => ({ data: external }) };
    if (name === "./OrgExternalCandidates") return { OrgExternalCandidates: () => <div data-external-list /> };
    if (name === "@/components/ui/tabs") return {
      Tabs: ({ activeValue, items, onValueChange }: { activeValue: string; items: Array<{ value: string; label: React.ReactNode }>; onValueChange: (value: string) => void }) => {
        onTab = onValueChange;
        return <>{items.map((item) => <button aria-selected={item.value === activeValue} data-tab={item.value} key={item.value}>{item.label}</button>)}</>;
      },
    };
    if (name === "@/components/ui/dropdown-menu" || name === "@/components/ui/button" || name === "@/components/ui/badge") {
      return new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : passthrough) });
    }
    if (name === "./OrgHomeInbox") return { ReviewEmptyState: () => <div data-empty-inbox /> };
    if (name === "./OrgCriteriaRecheck") return {
      OrgCriteriaReviewPanel: empty,
      useOrgCriteriaReviewCounts: () => ({ company_intro: 0, pending_connection: 0 }),
    };
    // The toolbar menus render for real (with the stubbed button and menu above), so their labels and options show.
    if (name.startsWith("./") && name !== "./OrgRoleInbox" && name !== "./OrgCandidateToolbar") return new Proxy({}, { get: (_target, key) => (key === "__esModule" ? true : empty) });
    return load.call(this, name, ...args);
  };
  // The first test loaded the inbox with its own stubs; load a fresh copy with these.
  const require = Module.createRequire(import.meta.url);
  delete require.cache[require.resolve("./OrgRoleInbox")];
  delete require.cache[require.resolve("./OrgCandidateToolbar")];
  let OrgRoleInbox: typeof import("./OrgRoleInbox")["OrgRoleInbox"];
  try {
    ({ OrgRoleInbox } = require("./OrgRoleInbox") as typeof import("./OrgRoleInbox"));
  } finally {
    nodeModule._load = load;
  }
  const render = (next: Record<string, string>) => {
    query = next;
    return renderToStaticMarkup(<OrgRoleInbox />);
  };
  const tabs = (html: string) => [...html.matchAll(/data-tab="([a-z_]+)"/g)].map((match) => match[1]);
  const active = (html: string) => html.match(/aria-selected="true" data-tab="([a-z_]+)"/)?.[1];

  const plain = render({ tab: "inbox" });
  assert.deepEqual(tabs(plain), ["pending_connection", "company_intro", "saved", "external"]);
  assert.equal(active(plain), "pending_connection");
  assert.ok(plain.includes("data-empty-inbox") && !plain.includes("data-external-list"));
  assert.match(plain, /외부 후보.*2/);
  // Harper's list: the buttons name the current sort and view; every view is offered.
  assert.ok(plain.includes("최신순") && plain.includes("추천순"));
  for (const view of ["그리드", "리스트", "카드", "포스트잇"]) assert.ok(plain.includes(view), view);

  for (const legacy of [{ tab: "inbox", inboxStage: "external" }, { tab: "external" }, { tab: "inbox", review: "external" }] as Record<string, string>[]) {
    const html = render(legacy);
    assert.equal(active(html), "external", JSON.stringify(legacy));
    assert.ok(html.includes("data-external-list") && !html.includes("data-empty-inbox"));
    // 외부 후보 has the same toolbar: sort, and a grid or a list (no board, no one-by-one card).
    assert.ok(html.includes("최신순") && html.includes("추천순"));
    assert.ok(html.includes("그리드") && html.includes("리스트"));
    assert.ok(!html.includes("포스트잇") && !html.includes("카드"));
  }

  // Leaving 외부 후보 from an older link writes the inbox's own address.
  render({ tab: "external", externalCandidateId: "x", orgId: "w", roleId: "role" });
  onTab!("company_intro");
  assert.deepEqual(pushes.at(-1)?.query, { tab: "inbox", inboxStage: "company_intro", orgId: "w", roleId: "role" });

  // Without external sourcing there is no sub-tab, and its links show the inbox.
  external = { enabled: false, candidates: [] };
  const off = render({ tab: "inbox", inboxStage: "external" });
  assert.deepEqual(tabs(off), ["pending_connection", "company_intro", "saved"]);
  assert.equal(active(off), "pending_connection");
  assert.ok(!off.includes("data-external-list"));
});
