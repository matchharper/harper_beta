"use client";
import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import {
  OpportunityDetail,
  ViewDetail,
  SourceBlock,
  CareerResourceShelf,
} from "@/components/career/resources/CareerResourcePanel";
import {
  CareerSidebarProvider,
  type CareerSidebarContextValue,
} from "@/components/career/CareerSidebarContext";
import { MuteButton } from "@/components/ui/button";
import type { CareerView } from "@/lib/career/resources/views";
import type { CareerOpportunity } from "@/lib/career/opportunities/store";

const owner = "00000000-0000-4000-8000-000000000001",
  viewId = "00000000-0000-4000-8000-000000000002",
  opportunityId = "00000000-0000-4000-8000-000000000003";
const initialView: CareerView = {
  id: viewId,
  talent_id: owner,
  revision: 1,
  title: "다음 커리어를 위한 회사 비교",
  description:
    "관심 분야의 500개 회사를 모았어요. 자세히 알아볼 대상을 골라 주세요.",
  display_order: 0,
  order_source: "agent",
  archived_at: null,
  definition: {
    blocks: [
      {
        id: "companies",
        type: "collection",
        title: "검토할 회사",
        layout: "table",
        columns: ["title", "지역", "확인할 점"],
        selection: {
          setId: "00000000-0000-4000-8000-000000000004",
          revision: 1,
        },
        action: {
          id: "research",
          label: "선택한 회사 알아보기",
          request:
            "선택한 회사의 실제 업무와 팀, 나에게 도움이 될 이유를 조사해 주세요.",
        },
      },
    ],
  },
};
const initialOpportunity: CareerOpportunity = {
  id: opportunityId,
  talent_id: owner,
  revision: 1,
  primary_ref: { kind: "company", id: "91002" },
  related_refs: [],
  title: "CedarWorks · 백엔드 기술 리드",
  body: "PostgreSQL 확장과 서비스 안정성을 맡으면서 직접 개발을 계속할 수 있는 기회예요.\n\n한국 원격 근무와 기본급 1.1억~1.4억 원이 공개 안내에 나와 있어요. 현재 팀에서 얻기 어려웠던 설계 책임을 맡을 수 있다는 점에서 검토할 만해요. 실제 의사결정 범위는 팀과 대화하며 확인해야 해요.",
  evidence_refs: [
    { kind: "observation", id: "81000000-0000-4000-8000-000000000002" },
  ],
  presentation: {
    action: {
      id: "review_progress",
      label: "다음 대화 준비하기",
      request:
        "기존 연락 내용과 확인한 조건을 바탕으로 다음 대화에서 확인할 내용을 준비해 주세요.",
    },
  },
  recommendation_id: null,
  merged_into_id: null,
  display_order: 0,
  order_source: "agent",
  published_at: "2026-11-13T00:00:00Z",
  saved_at: null,
  archived_at: null,
  deleted_at: null,
  created_at: "2026-11-13T00:00:00Z",
  updated_at: "2026-11-13T00:00:00Z",
  work: [
    {
      id: "00000000-0000-4000-8000-000000000005",
      status: "waiting",
      title: "이 회사와 역할 범위를 확인하고 다음 대화를 이어 주세요.",
      note: "경력 자료를 전달했고 담당자의 답장을 기다리고 있어요.",
      conversationId: "preview-conversation",
    },
  ],
};

export default function ResourcePreview() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      })
  );
  const [ready, setReady] = useState(false),
    [path, setPath] = useState(`/career/views/${viewId}`),
    [scenario, setScenario] = useState("ready"),
    [receipt, setReceipt] = useState<unknown>(null);
  useEffect(() => {
    const fetchBefore = window.fetch,
      getSessionBefore = supabase.auth.getSession;
    // Only this development page changes the browser-local transport. Even an
    // already authenticated browser cannot submit fixture requests to an API.
    supabase.auth.getSession = async () =>
      ({
        data: { session: { access_token: "isolated-preview" } },
        error: null,
      }) as Awaited<ReturnType<typeof getSessionBefore>>;
    let view = structuredClone(initialView),
      opportunity = structuredClone(initialOpportunity);
    let views = [
      view,
      {
        ...structuredClone(initialView),
        id: "00000000-0000-4000-8000-000000000004",
        title: "다음에 검토할 회사",
        display_order: 1,
      },
    ];
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        window.location.origin
      );
      if (!url.pathname.startsWith("/api/")) return fetchBefore(input, init);
      if (url.pathname !== "/api/talent/career-resources")
        return Response.json({ preview: true, data: [] });
      if (scenario === "unavailable")
        return Response.json({ error: "Unavailable" }, { status: 404 });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        setReceipt(body);
        if (scenario === "conflict") {
          view = { ...view, revision: view.revision + 1 };
          return Response.json({ error: "Revision conflict" }, { status: 409 });
        }
        if (body.action === "interact")
          return Response.json(
            { accepted: true, conversationId: "preview-conversation" },
            { status: 202 }
          );
        if (body.action === "move") {
          const index = views.findIndex((item) => item.id === body.id),
            next = index + (body.direction === "up" ? -1 : 1);
          if (index >= 0 && next >= 0 && next < views.length) {
            const [item] = views.splice(index, 1);
            views.splice(next, 0, item);
            views = views.map((item, i) => ({
              ...item,
              display_order: i,
              revision: item.revision + 1,
              order_source: "user",
            }));
          }
          return Response.json({ moved: true });
        }
        if (body.action === "view") {
          view = {
            ...view,
            revision: view.revision + 1,
            archived_at: body.archived ? new Date().toISOString() : null,
          };
          return Response.json({ item: view });
        }
        opportunity = {
          ...opportunity,
          revision: opportunity.revision + 1,
          ...("saved" in body.patch
            ? { saved_at: body.patch.saved ? new Date().toISOString() : null }
            : {}),
          ...("archived" in body.patch
            ? {
                archived_at: body.patch.archived
                  ? new Date().toISOString()
                  : null,
              }
            : {}),
        };
        return Response.json({ item: opportunity });
      }
      const kind = url.searchParams.get("kind");
      if (kind === "view" && !url.searchParams.has("id"))
        return Response.json({
          items: scenario === "empty" ? [] : views,
          nextCursor: null,
        });
      if (kind === "opportunity" && !url.searchParams.has("id"))
        return Response.json({
          items: scenario === "empty" ? [] : [opportunity],
          nextCursor: null,
        });
      if (kind === "view") return Response.json({ item: view });
      if (kind === "opportunity") return Response.json({ item: opportunity });
      if (kind === "collection") {
        const offset = Number(url.searchParams.get("cursor") ?? 0),
          total = scenario === "empty" ? 0 : 500;
        return Response.json({
          title: "회사 비교",
          total,
          manifest: { fields: ["title", "지역", "확인할 점"] },
          nextCursor: offset + 50 < total ? String(offset + 50) : null,
          items: Array.from(
            { length: Math.min(50, Math.max(0, total - offset)) },
            (_, i) => ({
              itemId: `company-${offset + i + 1}`,
              ref: { kind: "company", id: String(offset + i + 1) },
              projection: {
                title: `회사 ${offset + i + 1}`,
                지역: i % 2 ? "한국 · 원격" : "싱가포르",
                "확인할 점": "현재 팀의 문제와 의사결정 범위",
              },
            })
          ),
        });
      }
      return Response.json({
        item: {
          ref: { kind: kind, id: url.searchParams.get("id") },
          title:
            kind === "company"
              ? "CedarWorks"
              : "CedarWorks · 엔지니어링 리드의 채용 안내",
          body: "서비스 안정성, PostgreSQL 확장과 아키텍처를 맡을 백엔드 기술 리드를 찾습니다. 한국에서 원격으로 근무할 수 있고 출장은 선택 사항입니다.",
          facts: {
            url: "https://cedarworks.example/team",
            publishedAt: "2026-11-13T00:00:00Z",
          },
          sourceRefs: [],
          status: "available",
        },
      });
    };
    client.clear();
    // The fixture must finish installing its external transport before queries
    // mount; this development-only transition deliberately uses a second render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return () => {
      window.fetch = fetchBefore;
      supabase.auth.getSession = getSessionBefore;
    };
  }, [client, scenario]);
  const router = useMemo(() => {
    const navigate: NextRouter["push"] = async (href) => {
      setPath(
        typeof href === "string"
          ? href
          : `${href.pathname}?${new URLSearchParams(href.query as Record<string, string>)}`
      );
      return true;
    };
    return {
      pathname: path.split("?")[0],
      route: path.split("?")[0],
      basePath: "",
      query: Object.fromEntries(
        new URL(path, "http://preview.invalid").searchParams
      ),
      asPath: path,
      isReady: true,
      isFallback: false,
      isPreview: true,
      isLocaleDomain: false,
      push: navigate,
      replace: navigate,
      reload() {},
      back() {
        setPath(`/career/views/${viewId}`);
      },
      forward() {},
      prefetch: async () => {},
      beforePopState() {},
      events: { on() {}, off() {}, emit() {} },
    } satisfies NextRouter;
  }, [path]);
  return (
    <MessagesProvider
      locale={
        ready &&
        new URLSearchParams(window.location.search).get("locale") === "en"
          ? "en"
          : "ko"
      }
      persistPreference={false}
    >
      <QueryClientProvider client={client}>
        <CareerSidebarProvider
          value={{ user: { id: owner } } as CareerSidebarContextValue}
        >
          <RouterContext.Provider value={router}>
            <div
              className="min-h-dvh bg-bg-default text-neutral-primary"
              onClickCapture={(event) => {
                const link = (event.target as HTMLElement).closest("a");
                if (link?.getAttribute("href")?.startsWith("/career/")) {
                  event.preventDefault();
                  event.stopPropagation();
                  void router.push(link.getAttribute("href")!);
                }
              }}
            >
              <header className="flex flex-wrap gap-3 border-b border-border p-3">
                <span>개발 프리뷰 · 가상 데이터</span>
                <MuteButton onClick={() => setPath("/career/opportunities")}>
                  전체 목록
                </MuteButton>
                <MuteButton onClick={() => setPath(`/career/views/${viewId}`)}>
                  비교 목록
                </MuteButton>
                <MuteButton
                  onClick={() =>
                    setPath(`/career/opportunities/${opportunityId}`)
                  }
                >
                  기회 상세
                </MuteButton>
                <select
                  aria-label="프리뷰 상황"
                  value={scenario}
                  onChange={(event) => {
                    setReady(false);
                    setScenario(event.target.value);
                  }}
                >
                  <option value="ready">일반</option>
                  <option value="conflict">동시 변경</option>
                  <option value="unavailable">삭제된 자료</option>
                  <option value="empty">빈 목록</option>
                </select>
              </header>
              <main className="mx-auto max-w-4xl p-5 sm:p-8">
                {ready ? (
                  path === "/career/opportunities" ? (
                    <CareerResourceShelf />
                  ) : path.startsWith("/career/views/") ? (
                    <ViewDetail
                      userId={owner}
                      id={decodeURIComponent(path.split("?")[0].split("/")[3])}
                    />
                  ) : path.startsWith("/career/opportunities/") ? (
                    <OpportunityDetail
                      userId={owner}
                      id={decodeURIComponent(path.split("?")[0].split("/")[3])}
                    />
                  ) : path.startsWith("/career/chat") ? (
                    <p role="status">요청이 대화로 전달됐어요.</p>
                  ) : (
                    <SourceBlock
                      userId={owner}
                      refValue={{
                        kind: path.split(
                          "/"
                        )[3] as import("@/lib/career/resources/types").ResourceRef["kind"],
                        id: decodeURIComponent(
                          path.split("?")[0].split("/")[4]
                        ),
                        ...(router.query.revision
                          ? { revision: String(router.query.revision) }
                          : {}),
                      }}
                    />
                  )
                ) : null}
              </main>
              <details className="mx-auto max-w-4xl p-5">
                <summary>격리된 요청 확인</summary>
                <pre
                  data-testid="request-receipt"
                  className="overflow-auto text-xs"
                >
                  {JSON.stringify(receipt, null, 2)}
                </pre>
              </details>
            </div>
          </RouterContext.Provider>
        </CareerSidebarProvider>
      </QueryClientProvider>
    </MessagesProvider>
  );
}
