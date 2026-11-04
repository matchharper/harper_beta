"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";
import { X } from "lucide-react";
import {
  BrowserPreviewAction,
  BrowserPreviewSurface,
} from "./BrowserPreviewFrame";

export type BrowserSessionViewData = {
  session: { id: string; status: string; revision: number };
  executions: { id: string; status: string; result: { summary?: string } }[];
  liveUrl: string | null;
  browserAvailability?: "active" | "stopped" | "unknown";
};

export function BrowserSessionView({
  view,
  busy,
  error,
  onAction,
  expanded,
  onExpand,
  number,
}: {
  view?: BrowserSessionViewData;
  busy?: boolean;
  error?: string | null;
  onAction: (action: "handoff" | "close") => void | Promise<void>;
  expanded?: boolean;
  onExpand?: () => void;
  number?: number;
}) {
  const t = useCareerT();
  const human =
    view?.session.status === "human" && Boolean(view.liveUrl) && !error;
  const closed = view?.session.status === "closed";
  const stopped =
    view?.browserAvailability === "stopped" &&
    ["idle", "human"].includes(view.session.status);
  const title = t("career.application.browser.title", "Harper의 브라우저");
  const status =
    closed || stopped
      ? t("career.browser.closed", "종료된 브라우저")
      : human
        ? t("career.browser.human", "직접 조작 중")
        : view?.session.status === "running"
          ? t("career.application.browser.checking", "지원 정보 확인 중...")
          : undefined;
  return (
    <BrowserPreviewSurface
      liveUrl={!closed && !stopped ? (view?.liveUrl ?? null) : null}
      loading={!error}
      showViewport={Boolean(view?.liveUrl) && !closed && !stopped}
      expanded={expanded ?? true}
      onExpand={onExpand}
      interactive={human && (expanded ?? true)}
      title={number ? `${number} · ${title}` : title}
      status={status}
      headerActions={
        !closed && view ? (
          <MuteButton
            type="button"
            variant="transparent"
            size="sm"
            disabled={busy}
            onClick={() => void onAction("close")}
            aria-label={t("career.browser.close", "닫기")}
          >
            <X className="size-4" />
          </MuteButton>
        ) : null
      }
    >
      {!closed &&
      !stopped &&
      view &&
      !human &&
      view.session.status !== "human" ? (
        <BrowserPreviewAction
          type="button"
          disabled={busy}
          onClick={() => void onAction("handoff")}
        >
          {t("career.browser.handoff", "직접 조작")}
        </BrowserPreviewAction>
      ) : null}
      {human && view?.liveUrl ? (
        <BrowserPreviewAction asChild>
          <a href={view.liveUrl} target="_blank" rel="noopener noreferrer">
            {t("career.browser.openWindow", "새 창에서 열기")}
          </a>
        </BrowserPreviewAction>
      ) : null}
      {!view?.liveUrl && !closed && !stopped && !error ? (
        <p className="text-sm text-neutral-muted">
          {view
            ? t(
                "career.browser.noPreview",
                "브라우저 화면을 불러올 수 없어요. 세션 상태를 확인해 주세요."
              )
            : t("career.browser.loading", "브라우저를 불러오는 중이에요.")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      ) : null}
    </BrowserPreviewSurface>
  );
}

export function BrowserSessionCard({ sessionId }: { sessionId: string }) {
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [actionError, setActionError] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery<BrowserSessionViewData>({
    queryKey: ["career-browser", sessionId],
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(
        `/api/talent/browser?sessionId=${encodeURIComponent(sessionId)}&viewer=true`,
        { signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error("Browser unavailable");
      return response.json();
    },
    refetchInterval: (q) =>
      q.state.data?.session.status === "closed" ? false : 5000,
    retry: false,
    gcTime: 0,
  });
  const act = async (action: "handoff" | "close") => {
    setBusy(true);
    setActionError(false);
    try {
      const response = await fetchWithAuth("/api/talent/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId }),
      });
      if (!response.ok) throw new Error();
      await query.refetch({ cancelRefetch: false });
    } catch {
      setActionError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <BrowserSessionView
      view={query.data}
      busy={busy}
      onAction={act}
      error={
        actionError || query.isError
          ? t(
              "career.browser.error",
              "브라우저 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
            )
          : null
      }
    />
  );
}
