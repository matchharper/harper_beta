"use client";

import { useEffect, useMemo, useState } from "react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { RotateCcw } from "lucide-react";
import CareerWorkspacePreview from "@/components/career/preview/CareerWorkspacePreview";
import { MuteButton } from "@/components/ui/button";
import { MessagesProvider } from "@/i18n/useMessage";
import { previewOpportunities } from "./previewOpportunities";
import PreviewHistoryPanel, { type Scenario } from "./PreviewHistoryPanel";

export default function OpportunityPreview() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"current" | "proposal">("proposal");
  const [scenario, setScenario] = useState<Scenario>("ready");
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState<Record<string, string>>({
    tab: "history",
    historyTab: "new",
  });

  useEffect(() => {
    // The existing preview owns its local mock state. Also isolate shared
    // analytics/API callers so a signed-in browser cannot write demo events.
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const raw =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(raw, window.location.origin);
      if (url.pathname.startsWith("/api/")) {
        return Response.json({ preview: true, data: [] });
      }
      return originalFetch(input, init);
    };
    const frame = requestAnimationFrame(() => setReady(true));
    return () => {
      cancelAnimationFrame(frame);
      window.fetch = originalFetch;
    };
  }, []);

  const router = useMemo(() => {
    const navigate: NextRouter["push"] = async (href) => {
      if (typeof href === "string") {
        setQuery(
          Object.fromEntries(
            new URL(href, "http://preview.invalid").searchParams
          )
        );
      } else {
        setQuery(
          Object.fromEntries(
            Object.entries(href.query ?? {}).map(([key, value]) => [
              key,
              String(value),
            ])
          )
        );
      }
      return true;
    };
    return {
      pathname: "/career/preview",
      route: "/career/preview",
      basePath: "",
      query,
      asPath: `/career/preview?${new URLSearchParams(query)}`,
      isReady: true,
      isFallback: false,
      isPreview: true,
      isLocaleDomain: false,
      push: navigate,
      replace: navigate,
      reload() {},
      back() {},
      forward() {},
      prefetch: async () => {},
      beforePopState() {},
      events: { on() {}, off() {}, emit() {} },
    } satisfies NextRouter;
  }, [query]);

  return (
    <MessagesProvider locale="ko" persistPreference={false}>
      <div className="flex h-dvh flex-col bg-bg-default text-neutral-primary">
        <header className="flex min-h-11 shrink-0 items-center gap-3 overflow-x-auto border-b border-neutral-1000-a10 px-3 py-1.5 text-xs">
          <span className="shrink-0 text-neutral-muted">
            UI 비교 · 예시 데이터
          </span>
          <div className="flex shrink-0 gap-1" aria-label="비교할 UI">
            {(
              [
                ["current", "현재 방식"],
                ["proposal", "제안"],
              ] as const
            ).map(([value, label]) => (
              <MuteButton
                key={value}
                size="sm"
                variant={mode === value ? "dark" : "transparent"}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {label}
              </MuteButton>
            ))}
          </div>
          <select
            aria-label="프리뷰 상황"
            className="min-w-28 rounded border border-neutral-1000-a10 bg-transparent px-2 py-1.5 text-xs"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as Scenario);
              setQuery({ tab: "history", historyTab: "new" });
            }}
          >
            <option value="ready">평소</option>
            <option value="change">미국 → 한국</option>
            <option value="arrival">새 추천 도착</option>
            <option value="partial">일부 완료</option>
            <option value="empty">추천 없음</option>
            <option value="error">검토 실패</option>
          </select>
          <MuteButton
            className="ml-auto shrink-0"
            size="sm"
            variant="transparent"
            aria-label="프리뷰 초기화"
            onClick={() => {
              setRevision((value) => value + 1);
              setScenario("ready");
              setQuery({ tab: "history", historyTab: "new" });
            }}
          >
            <RotateCcw className="size-3.5" />
          </MuteButton>
        </header>
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onClickCapture={(event) => {
            const anchor = (event.target as HTMLElement).closest("a");
            if (anchor) {
              event.preventDefault();
            }
          }}
        >
          {ready ? (
            <RouterContext.Provider value={router}>
              <CareerWorkspacePreview
                key={revision}
                className="opportunity-preview-workspace h-full"
                autoPlayConversation={false}
                initialTab="history"
                initialOpportunities={previewOpportunities}
                historyContent={
                  <PreviewHistoryPanel
                    key={scenario}
                    mode={mode}
                    scenario={scenario}
                  />
                }
              />
            </RouterContext.Provider>
          ) : null}
        </div>
        <style>{`.opportunity-preview-workspace > main, .opportunity-preview-workspace > main > div, .opportunity-preview-workspace .h-svh { height: 100%; min-height: 0; }`}</style>
      </div>
    </MessagesProvider>
  );
}
