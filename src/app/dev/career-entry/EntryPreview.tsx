"use client";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { MessagesProvider } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import CareerOnboarding from "@/pages/career/onboarding";

const owner = "10000000-0000-4000-8000-000000000001";
const conversation = "10000000-0000-4000-8000-000000000003";
/** Real onboarding UI, isolated account and transport. No fixture write leaves this page. */
export default function EntryPreview() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  const [ready, setReady] = useState(false);
  const [path, setPath] = useState(
    "/career/onboarding?job_slug=cedar-backend&job=Backend+Engineer&job_company=CedarWorks"
  );
  const [receipt, setReceipt] = useState<unknown>(null);
  useEffect(() => {
    const fetchBefore = window.fetch,
      sessionBefore = supabase.auth.getSession,
      authBefore = useAuthStore.getState();
    const failure = new URLSearchParams(window.location.search).get("failure");
    let failed = false,
      completed = false;
    useAuthStore.setState({
      loading: false,
      user: {
        id: owner,
        email: "fixture@example.test",
        user_metadata: { name: "윤서" },
        app_metadata: {},
        aud: "authenticated",
        created_at: "2026-11-15T00:00:00.000Z",
      } satisfies User,
    });
    supabase.auth.getSession = async () =>
      ({
        data: { session: { access_token: "isolated-entry" } },
        error: null,
      }) as Awaited<ReturnType<typeof sessionBefore>>;
    window.fetch = async (input, init) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        location.origin
      );
      if (!url.pathname.startsWith("/api/") && url.origin === location.origin)
        return fetchBefore(input, init);
      if (url.pathname === "/api/talent/session")
        return Response.json({
          ok: true,
          needsOnboarding: !completed,
          hasFirstSubmission: false,
          conversation: {
            id: conversation,
            stage: completed ? "completed" : "profile",
            resumeLinks: [],
            profileIngestionStatus: null,
          },
        });
      if (url.pathname === "/api/talent/onboarding/start") {
        const body = JSON.parse(String(init?.body));
        setReceipt(body);
        if (failure && !failed) {
          failed = true;
          return Response.json(
            {
              error: "Isolated failed request",
              code:
                failure === "ingestion"
                  ? "profile_ingestion_failed"
                  : "unavailable",
            },
            { status: failure === "ingestion" ? 422 : 503 }
          );
        }
        completed = true;
        return Response.json({
          ok: true,
          conversation: { id: conversation, stage: "completed" },
          profileIngestion: { ok: true, status: "completed" },
          assistantMessages: [],
        });
      }
      return Response.json({ ok: true, created: false });
    };
    // The child mounts only after its isolated external systems are installed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
    return () => {
      window.fetch = fetchBefore;
      supabase.auth.getSession = sessionBefore;
      useAuthStore.setState(authBefore);
    };
  }, []);
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
      asPath: path,
      query: Object.fromEntries(
        new URL(path, "http://fixture.invalid").searchParams
      ),
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
  }, [path]);
  return (
    <MessagesProvider
      locale={
        ready && new URLSearchParams(location.search).get("locale") === "en"
          ? "en"
          : "ko"
      }
      persistPreference={false}
    >
      <QueryClientProvider client={client}>
        <RouterContext.Provider value={router}>
          {ready &&
            (path.startsWith("/career/onboarding") ? (
              <CareerOnboarding />
            ) : (
              <main className="p-8 space-y-4">
                <h1>Career entry received</h1>
                <p>{path}</p>
                <pre data-testid="entry-receipt">
                  {JSON.stringify(receipt, null, 2)}
                </pre>
              </main>
            ))}
        </RouterContext.Provider>
      </QueryClientProvider>
    </MessagesProvider>
  );
}
