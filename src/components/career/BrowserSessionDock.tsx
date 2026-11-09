"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useRef,
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
  observationFailed?: boolean;
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
  registerAnchor: (id: string, element: HTMLElement | null, previous: HTMLElement | null) => void;
  summaries: ReadonlyMap<string, SessionSummary>;
};
const BrowserDockContext = createContext<BrowserDockContext | null>(null);

export function BrowserSessionProvider({
  conversationId,
  enabled,
  children,
}: {
  conversationId: string | null;
  enabled: boolean;
  messages: CareerMessage[];
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  const [anchorGroups, setAnchorGroups] = useState<ReadonlyMap<string, readonly HTMLElement[]>>(() => new Map());
  const registerAnchor = useCallback((id: string, element: HTMLElement | null, previous: HTMLElement | null) => {
    setAnchorGroups(current => {
      const group = current.get(id) ?? [];
      const nextGroup = group.filter(node => node !== previous && node !== element);
      if (element) nextGroup.push(element);
      const next = new Map(current);
      if (nextGroup.length) next.set(id, nextGroup); else next.delete(id);
      return next;
    });
  }, []);
  // Use conversation order, not mount order: loading older history must not
  // move a live browser away from its latest reference.
  const anchors = new Map([...anchorGroups].map(([id, nodes]) => [id,
    nodes.reduce((latest, node) =>
      latest.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        ? node : latest),
  ]));
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
  const query = useQuery<{ sessions: SessionSummary[]; summaries?: SessionSummary[] }>({
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
          title: entry.title,
        },
        liveUrl: entry.liveUrl ?? null,
        browserAvailability: entry.browserAvailability,
        observationFailed: entry.observationFailed,
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
  const summaries = new Map((query.data?.summaries ?? query.data?.sessions ?? []).map(session => [session.id, session]));
  if (selectedQuery.data && (!summaries.has(selectedQuery.data.session.id) ||
    selectedQuery.data.session.revision > summaries.get(selectedQuery.data.session.id)!.revision)) summaries.set(selectedQuery.data.session.id, {
    ...selectedQuery.data.session,
    browserAvailability: selectedQuery.data.browserAvailability,
  });
  return (
    <BrowserDockContext.Provider
      value={{
        views: preview ? [...views, PREVIEW_VIEW] : views,
        selectedId: preview ? PREVIEW_SESSION_ID : selectedId,
        preview,
        setPreview,
        anchors,
        registerAnchor,
        summaries,
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
  const session = dock?.summaries.get(sessionId);
  const closed = session?.status === "closed" || session?.browserAvailability === "stopped";
  return (
    <div data-browser-trigger className="my-2 max-w-full">
      <PreviewUI
        icon={<Monitor className="h-5 w-5 text-neutral-soft" />}
        title={session?.title || t("career.application.browser.title", "Harper의 브라우저")}
        description={
          closed
            ? t("career.browser.closed", "종료된 브라우저")
            : t("career.application.browser.open", "브라우저 열기")
        }
        disabled={!dock || closed}
        onClick={() => {
          dock?.anchors.get(sessionId)?.scrollIntoView({ block: "center", behavior: "smooth" });
          dock?.select(sessionId);
        }}
      />
    </div>
  );
}

/** Reserves the browser's place in the scrollable conversation. */
export function BrowserSessionAnchor({ sessionId, source = "reference" }: {
  sessionId: string;
  source?: "reference" | "artifact";
}) {
  const dock = useContext(BrowserDockContext);
  const register = dock?.registerAnchor;
  const previousNode = useRef<HTMLDivElement | null>(null);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      register?.(sessionId, node, previousNode.current);
      previousNode.current = node;
      setElement(node);
    },
    [register, sessionId]
  );
  const active = dock?.views.some((view) =>
    view.session.id === sessionId && view.session.status !== "closed" &&
    view.browserAvailability !== "stopped");
  const latest = dock?.anchors.get(sessionId) === element;
  const showViewer = Boolean(active && latest);
  // Keep the registration node mounted so removing a later reference restores
  // the preceding location. Hidden artifact nodes take no space in the flex flow.
  return (
    <div
      ref={ref}
      hidden={Boolean(dock && !latest && source === "artifact")}
      data-browser-source={source}
      data-browser-inline-anchor={showViewer ? sessionId : undefined}
      className="max-w-full"
      style={{ width: showViewer ? 720 : undefined }}
    >
      {!showViewer && <BrowserSessionLink sessionId={sessionId} />}
    </div>
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
    />
  );
}

export function BrowserSessionDockView({
  views,
  selectedId,
  onSelect,
  onChanged,
  anchors,
  preview = false,
}: {
  views: BrowserSessionViewData[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChanged?: () => Promise<unknown>;
  anchors?: ReadonlyMap<string, HTMLElement>;
  preview?: boolean;
}) {
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const layout =
    dock?.closest<HTMLElement>("[data-career-chat-layout]") ??
    dock?.parentElement;

  return (
    <>
      <div ref={setDock} className="absolute right-0 top-0 h-0 w-0" />
      {dock &&
        layout &&
        views.filter(view => view.session.status !== "closed" && view.browserAvailability !== "stopped").map((view, index) => {
          const inlineAnchor = anchors?.get(view.session.id) ?? null;
          return createPortal(
            <BrowserSessionFloatingPanel
              view={view}
              depth={index}
              count={views.length}
              expanded={selectedId === view.session.id}
              preview={preview}
              onExpand={(open) => onSelect(open ? view.session.id : null)}
              onChanged={onChanged}
              dock={dock}
              layout={layout}
              inlineAnchor={inlineAnchor}
            />,
            layout,
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
  const [minimizedControlRevision, setMinimizedControlRevision] = useState<number | null>(null);
  const human = props.view.session.status === "human";
  // A provider's login request must not cover a chat/form the user is reading.
  // Only an explicit open/handoff selects the full-screen interactive viewer.
  const fullScreen = human && props.expanded && minimizedControlRevision !== props.view.session.revision;
  const fold = () => {
    if (human) {
      setMinimizedControlRevision(fullScreen ? props.view.session.revision : null);
      props.onExpand(!fullScreen);
    }
    else props.onExpand(!props.expanded);
  };
  const { inline, collapsed } = useBrowserSessionPlacement({
    dock,
    layout,
    inlineAnchor,
    content,
    depth: props.depth,
    // Selection is the single owner of expansion on every viewport. A newly
    // arriving session must not cover the current conversation or another viewer.
    collapsed: human ? !fullScreen : !props.expanded,
    fullScreen,
  });
  return (
    <Dialog open onOpenChange={() => { if (human) setMinimizedControlRevision(props.view.session.revision); props.onExpand(false); }} modal={false}>
      <DialogPanelContent
        ref={setContent}
        forceMount
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        aria-describedby={undefined}
        popover={fullScreen ? "manual" : undefined}
        data-browser-placement={fullScreen ? "fullscreen" : inline ? "inline" : "dock"}
        className="m-0 border-0 p-0 overflow-y-auto rounded-modal shadow-(--shadow-modal) outline-none"
      >
        <DialogTitle className="sr-only">
          {t("career.browser.title", "지원 브라우저")}
        </DialogTitle>
        <BrowserPopup
          {...props}
          expanded={!collapsed}
          collapsed={collapsed}
          onToggleCollapsed={fold}
          fullScreen={fullScreen}
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
  fullScreen = false,
}: {
  view: BrowserSessionViewData;
  number?: number;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  preview?: boolean;
  fullScreen?: boolean;
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
  const act = async (action: "handoff" | "resume" | "close") => {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId: view.session.id, revision: view.session.revision }),
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
      className={fullScreen ? "h-full w-full" : "w-full"}
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
        fullScreen={fullScreen}
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
