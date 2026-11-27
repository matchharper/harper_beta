"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerT } from "@/i18n/useCareerT";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  BrowserPreviewAction,
  BrowserPreviewSurface,
} from "./BrowserPreviewFrame";

export type BrowserSessionViewData = {
  // savedLoginOffer: the user controls a browser that started without saved login, and saved login is off.
  session: { id: string; status: string; revision: number; title?: string; savedLoginOffer?: boolean };
  executions: { id: string; status: string; result: { summary?: string } }[];
  liveUrl: string | null;
  observationFailed?: boolean;
  browserAvailability?: "active" | "stopped" | "unknown";
};

export type BrowserSessionAction = "handoff" | "resume" | "close" | "save_login";

/** A closed login browser that can be opened again: the person asks Harper in chat (the progress panel sends it). */
export type BrowserSessionReopen = { onReopen: () => void; disabled?: boolean };

export function BrowserSessionView({
  view,
  busy,
  error,
  onAction,
  expanded,
  onExpand,
  number,
  collapsed = false,
  preview = false,
  fullScreen = false,
  reopen = null,
}: {
  view?: BrowserSessionViewData;
  busy?: boolean;
  error?: string | null;
  onAction: (action: BrowserSessionAction) => void | Promise<void>;
  expanded?: boolean;
  onExpand?: () => void;
  number?: number;
  collapsed?: boolean;
  preview?: boolean;
  fullScreen?: boolean;
  /** Offered once this browser is closed or stopped. */
  reopen?: BrowserSessionReopen | null;
}) {
  const t = useCareerT();
  const [pendingAction, setPendingAction] = useState<
    "handoff" | "close" | null
  >(null);
  const [pendingSavedLogin, setPendingSavedLogin] = useState(false);
  const human = view?.session.status === "human";
  const closed = view?.session.status === "closed";
  const stopped =
    view?.browserAvailability === "stopped" &&
    ["idle", "human"].includes(view.session.status);
  const previewFailed = Boolean(view?.observationFailed);
  const title = view?.session.title || t("career.application.browser.title", "Harper의 브라우저");
  const status =
    closed || stopped
      ? t("career.browser.closed", "종료된 브라우저")
      : human && Boolean(view?.liveUrl) && !error
        ? t("career.browser.human", "직접 조작 중")
        : view?.session.status === "running"
          ? t("career.application.browser.checking", "지원 정보 확인 중...")
          : undefined;
  return (
    <>
      <BrowserPreviewSurface
        liveUrl={!closed && !stopped ? (view?.liveUrl ?? null) : null}
        loading={!error && !preview && !previewFailed && !closed && !stopped}
        loadingLabel={t("career.browser.loading", "브라우저를 불러오는 중이에요.")}
        showViewport={
          (preview || Boolean(view?.liveUrl) || (!error && !previewFailed)) && !closed && !stopped
        }
        showViewportControls={false}
        fillViewport={fullScreen}
        collapsed={collapsed}
        expanded={expanded ?? true}
        onExpand={onExpand}
        interactive={human && !busy && !error && !stopped && (expanded ?? true)}
        title={number ? `${number} · ${title}` : title}
        status={status}
        headerActions={
          <>
            {onExpand ? (
              <MuteButton
                type="button"
                variant="transparent"
                size="sm"
                onClick={onExpand}
                aria-expanded={!collapsed}
                aria-label={
                  collapsed
                    ? t(
                        "career.application.browser.expand",
                        "브라우저 화면 확대"
                      )
                    : t(
                        "career.application.browser.collapse",
                        "브라우저 화면 축소"
                      )
                }
              >
                {collapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
              </MuteButton>
            ) : null}
            {/* A card that folds has the chevron alone: an X beside it only folded too, and read as Stop. */}
            {!onExpand && !closed && view && !collapsed ? (
              <MuteButton
                type="button"
                variant="transparent"
                size="sm"
                disabled={busy}
                onClick={() => setPendingAction("close")}
                aria-label={t("career.browser.close", "닫기")}
              >
                <X className="size-4" />
              </MuteButton>
            ) : null}
          </>
        }
      >
        {!closed &&
        !stopped &&
        view &&
        !human &&
        view.session.status !== "human" ? (
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <MuteButton
              type="button"
              size="md"
              className="w-full rounded-pill"
              disabled={busy || preview || view.session.status === "closing"}
              onClick={() => setPendingAction("close")}
            >
              {["idle", "ready"].includes(view.session.status)
                ? t("career.browser.close", "닫기")
                : t("career.application.review.stop", "중단하기")}
            </MuteButton>
            <BrowserPreviewAction
              type="button"
              disabled={busy || preview || view.session.status === "closing"}
              onClick={() => setPendingAction("handoff")}
            >
              {t("career.browser.handoff", "직접 조작")}
            </BrowserPreviewAction>
          </div>
        ) : null}
        {human && !stopped && view?.session.savedLoginOffer ? (
          <div className="col-span-2">
            <Checkbox
              checked={busy && pendingSavedLogin}
              disabled={busy || preview}
              onChange={(event) => {
                if (!event.currentTarget.checked) return;
                setPendingSavedLogin(true);
                void Promise.resolve(onAction("save_login")).finally(() => setPendingSavedLogin(false));
              }}
              label={t("career.browser.savedLogin.label", "다음 지원부터 로그인 유지하기")}
              helperText={t(
                "career.browser.savedLogin.help",
                "로그인 전에 체크해 주세요. 로그인이 저장되는 브라우저로 이 화면을 다시 열어요. 하퍼에게 말하면 언제든 지울 수 있어요."
              )}
            />
          </div>
        ) : null}
        {human && !stopped ? (
          <MuteButton
            type="button"
            size="md"
            className="w-full rounded-pill"
            disabled={busy || preview}
            onClick={() => setPendingAction("close")}
          >
            {t("career.application.review.stop", "중단하기")}
          </MuteButton>
        ) : null}
        {/* A stopped browser has nothing to finish: Done would hand Harper a page that is gone. */}
        {human && !stopped ? (
          <BrowserPreviewAction type="button" disabled={busy || preview} onClick={() => void onAction("resume")}>
            {t("career.browser.done", "완료")}
          </BrowserPreviewAction>
        ) : null}
        {(closed || stopped) && reopen ? (
          <>
            <p className="text-sm text-neutral-muted">
              {t("career.browser.closedNotice", "창이 닫혔어요. 다시 열기를 누르면 Harper에게 다시 열어 달라고 보내요.")}
            </p>
            <BrowserPreviewAction type="button" disabled={reopen.disabled} onClick={reopen.onReopen}>
              {t("career.browser.reopen", "다시 열기")}
            </BrowserPreviewAction>
          </>
        ) : null}
        {!preview && previewFailed && !view?.liveUrl && !closed && !stopped && !error ? (
          <p role="alert" className="text-sm text-neutral-muted">
            {t(
              "career.browser.noPreview",
              "브라우저 화면을 불러올 수 없어요. 세션 상태를 확인해 주세요."
            )}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-critical">
            {error}
          </p>
        ) : null}
      </BrowserPreviewSurface>
      <TalentCareerModal
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        mobileBottomSheet
        panelClassName="max-w-[480px]"
        title={
          pendingAction === "handoff"
            ? t(
                "career.browser.confirmHandoff.title",
                "직접 조작으로 전환할까요?"
              )
            : t("career.browser.confirmClose.title", "브라우저를 종료할까요?")
        }
        description={
          pendingAction === "handoff"
            ? t(
                "career.browser.confirmHandoff.description",
                "Harper가 잠시 기다리는 동안 직접 조작할 수 있어요. 완료를 누르면 Harper가 이어서 진행해요."
              )
            : t(
                "career.browser.confirmClose.description",
                "브라우저가 종료되고 Harper의 브라우저 작업도 중단돼요."
              )
        }
        footer={
          <div className="flex justify-end gap-2">
            <MuteButton onClick={() => setPendingAction(null)}>
              {t("career.common.cancel", "취소")}
            </MuteButton>
            <MuteButton
              variant={pendingAction === "close" ? "warn" : "default"}
              disabled={busy}
              onClick={() => {
                if (!pendingAction || busy) return;
                const action = pendingAction;
                setPendingAction(null);
                void onAction(action);
              }}
            >
              {pendingAction === "handoff"
                ? t(
                    "career.browser.confirmHandoff.action",
                    "직접 조작하기"
                  )
                : t("career.browser.confirmClose.action", "중단하고 종료")}
            </MuteButton>
          </div>
        }
      >
        {null}
      </TalentCareerModal>
    </>
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
  const act = async (action: BrowserSessionAction) => {
    setBusy(true);
    setActionError(false);
    try {
      const response = await fetchWithAuth("/api/talent/browser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sessionId, revision: query.data?.session.revision }),
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
