"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/router";
import { browserSessionFromQuery } from "@/lib/career/browser/links";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogPanelContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Monitor } from "lucide-react";
import { PreviewUI } from "./chat/elements/DocumentPreviewCards";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerT } from "@/i18n/useCareerT";
import { useBrowserSessionPlacement } from "./useBrowserSessionPlacement";
import type { CareerMessage } from "./types";
import {
  BrowserSessionView,
  type BrowserSessionViewData,
} from "./BrowserSessionCard";

type SessionSummary = BrowserSessionViewData["session"] & {
  browserAvailability?: BrowserSessionViewData["browserAvailability"];
  liveUrl?: string | null;
};
const PREVIEW_SESSION_ID = "dev-browser-preview";
const PREVIEW_VIEW: BrowserSessionViewData = {
  session: { id: PREVIEW_SESSION_ID, status: "running", revision: 0 },
  liveUrl: null,
  executions: [],
};

type BrowserDockContext = {
  preview: boolean;
  setPreview: (open: boolean) => void;
  views: BrowserSessionViewData[];
  selectedId: string | null;
  select: (id: string | null) => void;
  refresh: () => Promise<unknown>;
  anchors: ReadonlyMap<string, HTMLElement>;
  inlineSessionIds: ReadonlySet<string>;
  registerAnchor: (id: string, element: HTMLElement | null) => void;
  closedSessionId: string | null;
};
const BrowserDockContext = createContext<BrowserDockContext | null>(null);

export function BrowserSessionProvider({
  conversationId,
  enabled,
  messages,
  children,
}: {
  conversationId: string | null;
  enabled: boolean;
  messages: CareerMessage[];
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  const [anchors, setAnchors] = useState<ReadonlyMap<string, HTMLElement>>(
    () => new Map()
  );
  const registerAnchor = useCallback(
    (id: string, element: HTMLElement | null) => {
      setAnchors((current) => {
        if (current.get(id) === (element ?? undefined)) return current;
        const next = new Map(current);
        if (element) next.set(id, element);
        else next.delete(id);
        return next;
      });
    },
    []
  );
  const { fetchWithAuth } = useCareerApi();
  const client = useQueryClient();
  const router = useRouter();
  const linkedSession = browserSessionFromQuery(router.query.browserSession);
  const automatic = linkedSession
    ? { key: `email-link:${linkedSession}`, sessionId: linkedSession }
    : null;
  const [selection, setSelection] = useState<{
    seenKey: string | null;
    id: string | null;
  }>({ seenKey: null, id: null });
  const automaticKey = automatic?.key ?? null;
  const selectedId =
    selection.seenKey !== automaticKey
      ? (automatic?.sessionId ?? null)
      : selection.id;
  const queryKey = ["career-browser-dock", conversationId];
  const query = useQuery<{ sessions: SessionSummary[] }>({
    queryKey,
    enabled: enabled && Boolean(conversationId),
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(
        `/api/talent/browser?conversationId=${encodeURIComponent(conversationId!)}&activeOnly=true&viewer=true`,
        { signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error("Browser sessions unavailable");
      return response.json();
    },
    refetchInterval: 5000,
    retry: false,
    gcTime: 0,
  });
  const views: BrowserSessionViewData[] = (query.data?.sessions ?? []).map(
    (entry) =>
      ({
        session: {
          id: entry.id,
          status: entry.status,
          revision: entry.revision,
        },
        liveUrl: entry.liveUrl ?? null,
        browserAvailability: entry.browserAvailability,
        executions: [],
      }) satisfies BrowserSessionViewData
  );
  const selectedQuery = useQuery<BrowserSessionViewData>({
    queryKey: ["career-browser", selectedId],
    enabled:
      enabled &&
      Boolean(selectedId) &&
      !views.some((view) => view.session.id === selectedId),
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(
        `/api/talent/browser?sessionId=${encodeURIComponent(selectedId!)}&viewer=true`,
        { signal, cache: "no-store" }
      );
      if (!response.ok) throw new Error("Browser unavailable");
      return response.json();
    },
    retry: false,
    gcTime: 0,
  });
  if (
    selectedId &&
    selectedQuery.data &&
    !views.some((view) => view.session.id === selectedId) &&
    selectedQuery.data.session.status !== "closed" &&
    selectedQuery.data.browserAvailability !== "stopped"
  )
    views.push(selectedQuery.data);
  return (
    <BrowserDockContext.Provider
      value={{
        views: preview ? [...views, PREVIEW_VIEW] : views,
        selectedId: preview ? PREVIEW_SESSION_ID : selectedId,
        preview,
        setPreview,
        anchors,
        inlineSessionIds: new Set(
          messages.flatMap((message) =>
            message.browserSession ? [message.browserSession.sessionId] : []
          )
        ),
        registerAnchor,
        closedSessionId:
          selectedQuery.data &&
          (selectedQuery.data.session.status === "closed" ||
            selectedQuery.data.browserAvailability === "stopped")
            ? selectedQuery.data.session.id
            : null,
        select: (id) => {
          setPreview(false);
          if (!preview || id) setSelection({ seenKey: automaticKey, id });
        },
        refresh: async () => {
          await Promise.all([
            client.invalidateQueries({ queryKey }),
            client.invalidateQueries({
              queryKey: ["career-browser", selectedId],
            }),
          ]);
        },
      }}
    >
      {children}
    </BrowserDockContext.Provider>
  );
}

/** Local-only dev preview; never creates a browser session or calls its actions. */
export function useBrowserSessionDevPreview() {
  const dock = useContext(BrowserDockContext);
  return { open: dock?.preview ?? false, setOpen: dock?.setPreview };
}

export function BrowserSessionLink({ sessionId }: { sessionId: string }) {
  const dock = useContext(BrowserDockContext);
  const t = useCareerT();
  const closed = dock?.closedSessionId === sessionId;
  return (
    <div data-browser-trigger className="my-2 max-w-full">
      <PreviewUI
        icon={<Monitor className="h-5 w-5 text-neutral-soft" />}
        title={t("career.application.browser.title", "Harper의 브라우저")}
        description={
          closed
            ? t("career.browser.closed", "종료된 브라우저")
            : t("career.application.browser.open", "브라우저 열기")
        }
        disabled={!dock || closed}
        onClick={() => dock?.select(sessionId)}
      />
    </div>
  );
}

/** Reserves the browser's place in the scrollable conversation. */
export function BrowserSessionAnchor({ sessionId }: { sessionId: string }) {
  const dock = useContext(BrowserDockContext);
  const register = dock?.registerAnchor;
  const ref = useCallback(
    (node: HTMLDivElement | null) => register?.(sessionId, node),
    [register, sessionId]
  );
  const active =
    dock?.selectedId === sessionId &&
    dock.views.some((view) => view.session.id === sessionId);
  if (!active) return <BrowserSessionLink sessionId={sessionId} />;
  return (
    <div
      ref={ref}
      data-browser-inline-anchor={sessionId}
      className="max-w-full"
      style={{
        width: 720,
        minHeight: 160,
      }}
    />
  );
}

export function BrowserSessionDock() {
  const dock = useContext(BrowserDockContext);
  if (!dock) return null;
  return (
    <BrowserSessionDockView
      preview={dock.preview}
      views={dock.views}
      selectedId={dock.selectedId}
      onSelect={dock.select}
      onChanged={dock.refresh}
      anchors={dock.anchors}
      inlineSessionIds={dock.inlineSessionIds}
    />
  );
}

export function BrowserSessionDockView({
  views,
  selectedId,
  onSelect,
  onChanged,
  anchors,
  inlineSessionIds,
  preview = false,
}: {
  views: BrowserSessionViewData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged?: () => Promise<unknown>;
  anchors?: ReadonlyMap<string, HTMLElement>;
  inlineSessionIds?: ReadonlySet<string>;
  preview?: boolean;
}) {
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const layout =
    dock?.closest<HTMLElement>("[data-career-chat-layout]") ??
    dock?.parentElement;
  const selected = views.find((view) => view.session.id === selectedId);
  return (
    <>
      <div ref={setDock} className="absolute right-0 top-0 h-0 w-0" />
      {dock &&
        layout &&
        (selected ? [selected] : []).map((view) => {
          const inlineAnchor = anchors?.get(view.session.id) ?? null;
          // Wait for the actual message slot, so the iframe mounts there just once.
          if (inlineSessionIds?.has(view.session.id) && !inlineAnchor)
            return null;
          return createPortal(
            <BrowserSessionFloatingPanel
              view={view}
              depth={0}
              count={1}
              expanded
              preview={preview}
              onExpand={(open) => onSelect(open ? view.session.id : null)}
              onChanged={onChanged}
              dock={dock}
              layout={layout}
              inlineAnchor={inlineAnchor}
            />,
            inlineAnchor ?? layout,
            view.session.id
          );
        })}
    </>
  );
}

function BrowserSessionFloatingPanel({
  dock,
  layout,
  inlineAnchor,
  ...props
}: Parameters<typeof BrowserPopup>[0] & {
  dock: HTMLElement;
  layout: HTMLElement;
  inlineAnchor: HTMLElement | null;
}) {
  const t = useCareerT();
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [collapsedPreference, setCollapsedPreference] = useState<
    boolean | null
  >(null);
  const { inline, collapsed } = useBrowserSessionPlacement({
    dock,
    layout,
    inlineAnchor,
    content,
    depth: props.depth,
    collapsed: collapsedPreference,
  });
  return (
    <Dialog open={props.expanded} onOpenChange={props.onExpand} modal={false}>
      <DialogPanelContent
        ref={setContent}
        forceMount
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby={undefined}
        data-browser-placement={inline ? "inline" : "dock"}
        className="overflow-y-auto rounded-3xl shadow-xl outline-none"
      >
        <DialogTitle className="sr-only">
          {t("career.browser.title", "지원 브라우저")}
        </DialogTitle>
        <BrowserPopup
          {...props}
          expanded={!collapsed}
          collapsed={collapsed}
          onToggleCollapsed={
            !inline ? () => setCollapsedPreference(!collapsed) : undefined
          }
        />
      </DialogPanelContent>
    </Dialog>
  );
}

function BrowserPopup({
  view,
  number,
  expanded,
  onExpand,
  onChanged,
  collapsed = false,
  onToggleCollapsed,
  preview = false,
}: {
  view: BrowserSessionViewData;
  number?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  preview?: boolean;
  depth: number;
  count: number;
  expanded: boolean;
  onExpand: (open: boolean) => void;
  onChanged?: () => Promise<unknown>;
}) {
  const { fetchWithAuth } = useCareerApi();
  const t = useCareerT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const act = async (action: "handoff" | "close") => {
    if (preview) {
      if (action === "close") onExpand(false);
      return;
    }
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetchWithAuth("/api/talent/browser", {
        method: "POST",
        body: JSON.stringify({ action, sessionId: view.session.id }),
      });
      if (!response.ok) throw new Error("Browser action unavailable");
      onExpand(action === "handoff");
      await onChanged?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      data-browser-session-id={view.session.id}
      data-browser-expanded={expanded}
      className="w-full"
    >
      <BrowserSessionView
        view={view}
        busy={busy}
        onAction={act}
        expanded={expanded}
        onExpand={onToggleCollapsed}
        collapsed={collapsed}
        preview={preview}
        number={number}
        error={
          failed
            ? t(
                "career.browser.error",
                "브라우저 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요."
              )
            : null
        }
      />
    </div>
  );
}
