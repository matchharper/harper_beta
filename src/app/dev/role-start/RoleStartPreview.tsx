"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { RotateCcw } from "lucide-react";
import { OrgRoleCreationPage } from "@/components/org/workspace/pages/OrgRoleCreationPage";
import { OrgMobileNavigationProvider } from "@/components/org/workspace/OrgMobileNavigation";
import { OrgWorkspaceProvider } from "@/hooks/org/useOrgWorkspace";
import { getOrgPermissions } from "@/lib/org/permissions";
import { MuteButton } from "@/components/ui/button";
import { OrgLocaleScope } from "@/i18n/org/OrgLocaleProvider";
import { createPreviewRuntime } from "./previewRuntime";
import {
  PREVIEW_STEPS,
  ROLE_ID,
  USER_ID,
  WORKSPACE_ID,
  type PreviewStep,
} from "./fixtures";

export default function RoleStartPreview({
  email,
}: {
  email: { html: string; subject: string };
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      })
  );
  const [, refresh] = useReducer((value) => value + 1, 0);
  const [runtime] = useState(() => createPreviewRuntime(queryClient, refresh));
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState<Record<string, string>>({
    orgId: WORKSPACE_ID,
    roleId: ROLE_ID,
    tab: "inbox",
    inboxStage: "company_intro",
    inboxView: "grid",
  });
  useEffect(() => {
    const cleanup = runtime.install();
    const hash = window.location.hash.slice(1);
    runtime.select(PREVIEW_STEPS.find(([id]) => id === hash)?.[0] ?? "setup");
    if (hash === "pipeline")
      setQuery((current) => ({ ...current, tab: "pipeline" }));
    setReady(true);
    return cleanup;
  }, [runtime]);
  const router = useMemo(() => {
    const navigate: NextRouter["push"] = async (href) => {
      if (typeof href === "string") {
        const url = new URL(href, "http://preview.invalid");
        setQuery(Object.fromEntries(url.searchParams));
      } else
        setQuery(
          Object.fromEntries(
            Object.entries(href.query ?? {}).map(([key, value]) => [
              key,
              String(value),
            ])
          )
        );
      return true;
    };
    return {
      pathname: "/org/role",
      route: "/org/role",
      basePath: "",
      query,
      asPath: `/org/role?${new URLSearchParams(query)}`,
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
  const { fixtures } = runtime;
  const select = (step: PreviewStep) => {
    runtime.select(step);
    window.history.replaceState(window.history.state, "", `#${step}`);
    setRevision((value) => value + 1);
    setQuery({
      orgId: WORKSPACE_ID,
      roleId: ROLE_ID,
      tab: step === "pipeline" ? "pipeline" : "inbox",
      inboxStage: "company_intro",
      inboxView: "grid",
    });
  };
  return (
    <main className="flex h-dvh min-h-0 flex-col bg-bg-default text-neutral-primary">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-1000-a10 px-4 py-2">
        <span className="mr-2 text-xs text-neutral-muted">
          로컬 프리뷰 · 예시 데이터 · 실제 저장·발송 없음
        </span>
        <nav
          aria-label="화면 바로가기"
          className="flex flex-wrap items-center gap-1"
        >
          {PREVIEW_STEPS.map(([id, label]) => (
            <MuteButton
              key={id}
              size="sm"
              variant="transparent"
              onClick={() => select(id)}
            >
              {label}
            </MuteButton>
          ))}
        </nav>
        <MuteButton
          className="ml-auto"
          size="sm"
          variant="transparent"
          aria-label="처음부터 다시 보기"
          onClick={() => {
            runtime.reset();
            select("setup");
          }}
        >
          <RotateCcw className="size-4" />
        </MuteButton>
      </header>
      <div
        className="min-h-0 flex-1"
        onClickCapture={(event) => {
          const anchor = (event.target as HTMLElement).closest("a");
          if (!anchor) return;
          const url = new URL(anchor.href, window.location.origin);
          if (url.pathname.startsWith("/org/")) {
            event.preventDefault();
            void router.push(url.pathname + url.search);
          }
        }}
      >
        {runtime.step === "email" ? (
          <div className="mx-auto flex h-full max-w-[900px] flex-col px-4 py-5">
            <h1 className="mb-4 text-base font-medium">{email.subject}</h1>
            <iframe
              title="실제 템플릿의 후보 소개 이메일"
              sandbox=""
              srcDoc={email.html}
              className="min-h-0 w-full flex-1 border-0 bg-white"
            />
          </div>
        ) : ready ? (
          <OrgLocaleScope locale="ko">
            <QueryClientProvider client={queryClient}>
              <RouterContext.Provider value={router}>
                <OrgWorkspaceProvider
                  value={{
                    bootstrap: fixtures.bootstrap,
                    currentUser: fixtures.member,
                    currentUserEmail: fixtures.member.email,
                    internalOpsAccess: false,
                    orgId: WORKSPACE_ID,
                    page: "role",
                    permissions: getOrgPermissions("owner", "organization"),
                    roles: [fixtures.role],
                    user: {
                      id: USER_ID,
                      aud: "authenticated",
                      app_metadata: {},
                      user_metadata: {},
                      created_at: fixtures.role.createdAt,
                    },
                    workspace: fixtures.workspace,
                    workspaces: [fixtures.workspace],
                  }}
                >
                  <OrgMobileNavigationProvider>
                    <OrgRoleCreationPage key={revision} />
                  </OrgMobileNavigationProvider>
                </OrgWorkspaceProvider>
              </RouterContext.Provider>
            </QueryClientProvider>
          </OrgLocaleScope>
        ) : null}
      </div>
    </main>
  );
}
