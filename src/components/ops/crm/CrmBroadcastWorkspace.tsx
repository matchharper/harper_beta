import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Laptop,
  LoaderCircle,
  MailCheck,
  MailPlus,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Save,
  Search,
  Send,
  Smartphone,
  UsersRound,
} from "lucide-react";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import type {
  OpsCrmBroadcast,
  OpsCrmBroadcastAudienceResponse,
  OpsCrmBroadcastPauseResponse,
  OpsCrmBroadcastQueueResponse,
  OpsCrmBroadcastSaveResponse,
  OpsCrmBroadcastStatus,
  OpsCrmBroadcastTestEmailResponse,
  OpsCrmBroadcastsResponse,
} from "@/lib/ops/crmBroadcasts";
import type { OpsCrmCampaignPreferredLocale } from "@/lib/ops/crmCampaigns";
import { buildCrmBroadcastPreviewDocument } from "@/lib/ops/crmCampaignEmailPreview";

type BroadcastDraft = {
  htmlContent: string;
  id: string | null;
  name: string;
  recipientOnboardingDoneOnly: boolean;
  recipientPreferredLocale: OpsCrmCampaignPreferredLocale | null;
  scheduledAtLocal: string;
  subject: string;
};

type PreviewViewport = "desktop" | "mobile";
type BroadcastStatusFilter = "all" | OpsCrmBroadcastStatus;

const EMPTY_DRAFT: BroadcastDraft = {
  htmlContent: "",
  id: null,
  name: "",
  recipientOnboardingDoneOnly: true,
  recipientPreferredLocale: null,
  scheduledAtLocal: "",
  subject: "",
};

const STATUS_LABELS: Record<OpsCrmBroadcastStatus, string> = {
  completed: "완료",
  draft: "초안",
  paused: "일시중지",
  scheduled: "예약",
  sending: "발송 중",
};

const STATUS_CLASSES: Record<OpsCrmBroadcastStatus, string> = {
  completed: "bg-positive-faded text-positive",
  draft: "bg-bg-weak text-neutral-muted",
  paused: "bg-critical-faded text-critical",
  scheduled: "bg-primary-faded text-primary",
  sending: "bg-info-faded text-info",
};

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toScheduledIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function broadcastToDraft(broadcast: OpsCrmBroadcast): BroadcastDraft {
  return {
    htmlContent: broadcast.htmlContent,
    id: broadcast.id,
    name: broadcast.name,
    recipientOnboardingDoneOnly: broadcast.recipientOnboardingDoneOnly,
    recipientPreferredLocale: broadcast.recipientPreferredLocale,
    scheduledAtLocal: toDateTimeLocal(broadcast.scheduledAt),
    subject: broadcast.subject,
  };
}

function normalizeDraftForComparison(draft: BroadcastDraft) {
  return {
    htmlContent: draft.htmlContent.trim(),
    name: draft.name.trim(),
    recipientOnboardingDoneOnly: draft.recipientOnboardingDoneOnly,
    recipientPreferredLocale: draft.recipientPreferredLocale,
    scheduledAt: toScheduledIso(draft.scheduledAtLocal),
    subject: draft.subject.trim(),
  };
}

function draftsMatch(left: BroadcastDraft, right: BroadcastDraft) {
  return (
    JSON.stringify(normalizeDraftForComparison(left)) ===
    JSON.stringify(normalizeDraftForComparison(right))
  );
}

function formatScheduledAt(value: string | null) {
  if (!value) return "즉시 발송";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function BroadcastPreview({
  htmlContent,
  locale,
  viewport,
  onViewportChange,
}: {
  htmlContent: string;
  locale: OpsCrmCampaignPreferredLocale | null;
  viewport: PreviewViewport;
  onViewportChange: (viewport: PreviewViewport) => void;
}) {
  const srcDoc = useMemo(
    () => buildCrmBroadcastPreviewDocument(htmlContent, locale ?? "ko"),
    [htmlContent, locale]
  );

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-1000-a05 bg-bg-default">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-neutral-primary">
            단체 메일 미리보기
          </div>
          <div className="mt-0.5 text-xs text-neutral-muted">
            작성한 본문이 독립된 새 메일로 발송됩니다.
          </div>
        </div>
        <div className="inline-flex rounded-md bg-bg-weak p-0.5">
          <BareButton
            type="button"
            onClick={() => onViewportChange("desktop")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium",
              viewport === "desktop"
                ? "bg-bg-default text-neutral-primary shadow-sm"
                : "text-neutral-muted"
            )}
          >
            <Laptop className="h-3.5 w-3.5" />
            Desktop
          </BareButton>
          <BareButton
            type="button"
            onClick={() => onViewportChange("mobile")}
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium",
              viewport === "mobile"
                ? "bg-bg-default text-neutral-primary shadow-sm"
                : "text-neutral-muted"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Mobile
          </BareButton>
        </div>
      </div>
      <div className="overflow-x-auto bg-bg-basement p-4">
        <iframe
          title="CRM broadcast email preview"
          srcDoc={srcDoc}
          sandbox=""
          className={cx(
            "mx-auto block h-[680px] border-0 bg-bg-default transition-[width]",
            viewport === "mobile" ? "w-[390px] max-w-full" : "w-full"
          )}
        />
      </div>
    </section>
  );
}

export function CrmBroadcastWorkspace() {
  const [broadcasts, setBroadcasts] = useState<OpsCrmBroadcast[]>([]);
  const [draft, setDraft] = useState<BroadcastDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<BroadcastStatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [changingPause, setChangingPause] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewport>("desktop");

  const selectedBroadcast = useMemo(
    () => broadcasts.find((broadcast) => broadcast.id === draft.id) ?? null,
    [broadcasts, draft.id]
  );
  const isEditable = !selectedBroadcast || selectedBroadcast.status === "draft";
  const hasUnsavedChanges = useMemo(() => {
    if (!draft.id) return !draftsMatch(draft, EMPTY_DRAFT);
    return selectedBroadcast
      ? !draftsMatch(draft, broadcastToDraft(selectedBroadcast))
      : true;
  }, [draft, selectedBroadcast]);
  const canSave =
    isEditable &&
    draft.name.trim().length > 0 &&
    draft.subject.trim().length > 0 &&
    draft.subject.trim().length <= 200 &&
    draft.htmlContent.trim().length > 0 &&
    !saving;
  const canSendTest =
    draft.subject.trim().length > 0 &&
    draft.htmlContent.trim().length > 0 &&
    !sendingTest;
  const canQueue =
    selectedBroadcast?.status === "draft" &&
    !hasUnsavedChanges &&
    (audienceCount ?? 0) > 0 &&
    !queueing;
  const effectiveAudienceCount =
    selectedBroadcast && selectedBroadcast.status !== "draft"
      ? selectedBroadcast.deliveryCounts.total
      : audienceCount;

  const visibleBroadcasts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return broadcasts.filter((broadcast) => {
      if (statusFilter !== "all" && broadcast.status !== statusFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      return [broadcast.name, broadcast.subject, broadcast.htmlContent].some(
        (value) => value.toLocaleLowerCase().includes(normalizedQuery)
      );
    });
  }, [broadcasts, query, statusFilter]);

  const loadBroadcasts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await fetchWithInternalAuth<OpsCrmBroadcastsResponse>(
        "/api/internal/crm/broadcasts"
      );
      setBroadcasts(payload.broadcasts);
      setDraft((current) => {
        const selected = payload.broadcasts.find(
          (broadcast) => broadcast.id === current.id
        );
        if (selected) return broadcastToDraft(selected);
        return payload.broadcasts[0]
          ? broadcastToDraft(payload.broadcasts[0])
          : EMPTY_DRAFT;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "단체 메일을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadBroadcasts(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadBroadcasts]);

  useEffect(() => {
    if (selectedBroadcast && selectedBroadcast.status !== "draft") {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setAudienceLoading(true);
      try {
        const payload =
          await fetchWithInternalAuth<OpsCrmBroadcastAudienceResponse>(
            "/api/internal/crm/broadcasts/audience",
            {
              body: JSON.stringify({
                recipientOnboardingDoneOnly: draft.recipientOnboardingDoneOnly,
                recipientPreferredLocale: draft.recipientPreferredLocale,
              }),
              headers: { "Content-Type": "application/json" },
              method: "POST",
            }
          );
        if (!cancelled) setAudienceCount(payload.recipientCount);
      } catch {
        if (!cancelled) setAudienceCount(null);
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    draft.recipientOnboardingDoneOnly,
    draft.recipientPreferredLocale,
    selectedBroadcast,
  ]);

  const startNewBroadcast = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setAudienceCount(null);
    setError("");
    setNotice("");
  }, []);

  const duplicateBroadcast = useCallback(() => {
    if (!selectedBroadcast) return;
    setDraft({
      ...broadcastToDraft(selectedBroadcast),
      id: null,
      name: `${selectedBroadcast.name} 복사본`.slice(0, 120),
      scheduledAtLocal: "",
    });
    setAudienceCount(null);
    setError("");
    setNotice("복사본을 만들었습니다. 내용을 확인한 뒤 저장하세요.");
  }, [selectedBroadcast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<OpsCrmBroadcastSaveResponse>(
        "/api/internal/crm/broadcasts",
        {
          body: JSON.stringify({
            htmlContent: draft.htmlContent,
            id: draft.id ?? undefined,
            name: draft.name,
            recipientOnboardingDoneOnly: draft.recipientOnboardingDoneOnly,
            recipientPreferredLocale: draft.recipientPreferredLocale,
            scheduledAt: toScheduledIso(draft.scheduledAtLocal),
            subject: draft.subject,
          }),
          headers: { "Content-Type": "application/json" },
          method: draft.id ? "PATCH" : "POST",
        }
      );
      setBroadcasts((current) => [
        payload.broadcast,
        ...current.filter((broadcast) => broadcast.id !== payload.broadcast.id),
      ]);
      setDraft(broadcastToDraft(payload.broadcast));
      setNotice("초안을 저장했습니다. 대상과 테스트 메일을 확인해 주세요.");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "단체 메일을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }, [draft]);

  const handleSendTest = useCallback(async () => {
    setSendingTest(true);
    setError("");
    setNotice("");
    try {
      const payload =
        await fetchWithInternalAuth<OpsCrmBroadcastTestEmailResponse>(
          "/api/internal/crm/broadcasts/test-email",
          {
            body: JSON.stringify({
              htmlContent: draft.htmlContent,
              recipientPreferredLocale: draft.recipientPreferredLocale,
              subject: draft.subject,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
      setNotice(`테스트 메일을 ${payload.toEmail}로 보냈습니다.`);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "테스트 메일을 보내지 못했습니다."
      );
    } finally {
      setSendingTest(false);
    }
  }, [draft]);

  const handleQueue = useCallback(async () => {
    if (!selectedBroadcast || !canQueue) return;
    setQueueing(true);
    setError("");
    setNotice("");
    try {
      const payload = await fetchWithInternalAuth<OpsCrmBroadcastQueueResponse>(
        "/api/internal/crm/broadcasts/queue",
        {
          body: JSON.stringify({ broadcastId: selectedBroadcast.id }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }
      );
      setConfirmOpen(false);
      setNotice(
        `${payload.queuedRecipientCount.toLocaleString()}명의 발송 대상을 확정했습니다.`
      );
      await loadBroadcasts();
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : "단체 메일 발송을 시작하지 못했습니다."
      );
    } finally {
      setQueueing(false);
    }
  }, [canQueue, loadBroadcasts, selectedBroadcast]);

  const handlePauseChange = useCallback(
    async (paused: boolean) => {
      if (!selectedBroadcast) return;
      setChangingPause(true);
      setError("");
      setNotice("");
      try {
        await fetchWithInternalAuth<OpsCrmBroadcastPauseResponse>(
          "/api/internal/crm/broadcasts/pause",
          {
            body: JSON.stringify({
              broadcastId: selectedBroadcast.id,
              paused,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        setNotice(
          paused
            ? "아직 시작되지 않은 발송을 일시중지했습니다."
            : "남은 발송을 다시 시작했습니다."
        );
        await loadBroadcasts();
      } catch (pauseError) {
        setError(
          pauseError instanceof Error
            ? pauseError.message
            : "단체 메일 상태를 변경하지 못했습니다."
        );
      } finally {
        setChangingPause(false);
      }
    },
    [loadBroadcasts, selectedBroadcast]
  );

  const draftCount = broadcasts.filter(
    (broadcast) => broadcast.status === "draft"
  ).length;
  const inProgressCount = broadcasts.filter((broadcast) =>
    ["scheduled", "sending", "paused"].includes(broadcast.status)
  ).length;
  const completedCount = broadcasts.filter(
    (broadcast) => broadcast.status === "completed"
  ).length;
  const deliveryCounts = selectedBroadcast?.deliveryCounts;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm leading-6 text-neutral-muted">
          대상군을 확정한 뒤 새 제목과 본문으로 독립된 메일을 한 번씩
          발송합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <MuteButton
            type="button"
            size="lg"
            disabled={loading}
            onClick={() => void loadBroadcasts()}
          >
            <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
            새로고침
          </MuteButton>
          <MuteButton
            type="button"
            variant="dark"
            size="lg"
            onClick={startNewBroadcast}
          >
            <MailPlus className="h-4 w-4" />새 단체 메일
          </MuteButton>
        </div>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className={cx(opsTheme.panel, "p-4")}>
          <div className="text-xs text-neutral-muted">초안</div>
          <div className="mt-1 text-2xl font-medium text-neutral-primary">
            {draftCount.toLocaleString()}
          </div>
        </div>
        <div className={cx(opsTheme.panel, "p-4")}>
          <div className="text-xs text-neutral-muted">예약·진행</div>
          <div className="mt-1 text-2xl font-medium text-info">
            {inProgressCount.toLocaleString()}
          </div>
        </div>
        <div className={cx(opsTheme.panel, "p-4")}>
          <div className="text-xs text-neutral-muted">완료</div>
          <div className="mt-1 text-2xl font-medium text-positive">
            {completedCount.toLocaleString()}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={cx(opsTheme.panel, "min-w-0 p-4")}>
          <div className="flex items-center justify-between border-b border-neutral-1000-a05 px-1 pb-4">
            <div>
              <div className={opsTheme.eyebrow}>BROADCASTS</div>
              <div className="mt-1 text-lg font-medium text-neutral-primary">
                {broadcasts.length}개 등록
              </div>
            </div>
            <UsersRound className="h-5 w-5 text-neutral-soft" />
          </div>
          <div className="mt-3 grid gap-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft"
                aria-hidden
              />
              <UiInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="단체 메일 검색"
                aria-label="단체 메일 검색"
                className="pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as BroadcastStatusFilter)
              }
              className={cx(opsTheme.input, "appearance-none")}
              aria-label="단체 메일 상태 필터"
            >
              <option value="all">모든 상태</option>
              <option value="draft">초안</option>
              <option value="scheduled">예약</option>
              <option value="sending">발송 중</option>
              <option value="paused">일시중지</option>
              <option value="completed">완료</option>
            </select>
          </div>
          <div className="mt-3 grid max-h-[760px] gap-2 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-muted">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                불러오는 중...
              </div>
            ) : visibleBroadcasts.length === 0 ? (
              <div className="px-3 py-12 text-center text-sm leading-6 text-neutral-muted">
                {broadcasts.length === 0
                  ? "아직 단체 메일이 없습니다."
                  : "조건에 맞는 단체 메일이 없습니다."}
              </div>
            ) : (
              visibleBroadcasts.map((broadcast) => {
                const selected = broadcast.id === draft.id;
                return (
                  <BareButton
                    key={broadcast.id}
                    type="button"
                    onClick={() => {
                      setDraft(broadcastToDraft(broadcast));
                      if (broadcast.status === "draft") {
                        setAudienceCount(null);
                      }
                      setError("");
                      setNotice("");
                    }}
                    className={cx(
                      "w-full rounded-md px-3 py-3 text-left transition",
                      selected
                        ? "bg-black text-neutral-00"
                        : "bg-bg-default hover:bg-bg-weak"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {broadcast.name}
                        </div>
                        <div
                          className={cx(
                            "mt-1 truncate text-xs",
                            selected
                              ? "text-neutral-00/60"
                              : "text-neutral-muted"
                          )}
                        >
                          {broadcast.subject}
                        </div>
                        <div
                          className={cx(
                            "mt-1 text-xs",
                            selected
                              ? "text-neutral-00/60"
                              : "text-neutral-muted"
                          )}
                        >
                          대상 {broadcast.deliveryCounts.total.toLocaleString()}
                          명 · 발송{" "}
                          {broadcast.deliveryCounts.sent.toLocaleString()}명
                        </div>
                      </div>
                      <span
                        className={cx(
                          "shrink-0 rounded px-2 py-1 text-[11px] font-medium",
                          selected
                            ? "bg-neutral-00/15 text-neutral-00"
                            : STATUS_CLASSES[broadcast.status]
                        )}
                      >
                        {STATUS_LABELS[broadcast.status]}
                      </span>
                    </div>
                    <div
                      className={cx(
                        "mt-3 text-[11px]",
                        selected ? "text-neutral-00/50" : "text-neutral-soft"
                      )}
                    >
                      {formatKstRelativeDateTime(broadcast.updatedAt)}
                    </div>
                  </BareButton>
                );
              })
            )}
          </div>
        </aside>

        <form
          className="grid min-w-0 gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave && hasUnsavedChanges) void handleSave();
          }}
        >
          <section className={cx(opsTheme.panel, "min-w-0 p-5")}>
            <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-lg font-medium text-neutral-primary">
                  독립 단체 메일
                </div>
                <p className="mt-1 text-xs leading-5 text-neutral-muted">
                  발송 시작 시 수신자 목록과 메일 내용을 고정합니다.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedBroadcast ? (
                  <MuteButton
                    type="button"
                    size="lg"
                    onClick={duplicateBroadcast}
                  >
                    <Copy className="h-4 w-4" />
                    복제
                  </MuteButton>
                ) : null}
                <MuteButton
                  type="button"
                  size="lg"
                  disabled={!canSendTest}
                  onClick={() => void handleSendTest()}
                >
                  {sendingTest ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  테스트 메일
                </MuteButton>
                {isEditable && (saving || hasUnsavedChanges) ? (
                  <MuteButton
                    type="submit"
                    variant="dark"
                    size="lg"
                    disabled={!canSave}
                  >
                    {saving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    저장
                  </MuteButton>
                ) : null}
                {selectedBroadcast?.status === "draft" ? (
                  <MuteButton
                    type="button"
                    variant="dark"
                    size="lg"
                    disabled={!canQueue}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <MailCheck className="h-4 w-4" />
                    발송 확정
                  </MuteButton>
                ) : null}
                {selectedBroadcast &&
                ["scheduled", "sending"].includes(selectedBroadcast.status) ? (
                  <MuteButton
                    type="button"
                    size="lg"
                    disabled={changingPause}
                    onClick={() => void handlePauseChange(true)}
                  >
                    <PauseCircle className="h-4 w-4" />
                    남은 발송 중지
                  </MuteButton>
                ) : null}
                {selectedBroadcast?.status === "paused" ? (
                  <MuteButton
                    type="button"
                    variant="dark"
                    size="lg"
                    disabled={changingPause}
                    onClick={() => void handlePauseChange(false)}
                  >
                    <PlayCircle className="h-4 w-4" />
                    발송 재개
                  </MuteButton>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className={cx(opsTheme.errorNotice, "mt-4")}>{error}</div>
            ) : null}
            {notice ? (
              <div className={cx(opsTheme.successNotice, "mt-4")}>{notice}</div>
            ) : null}
            {!isEditable ? (
              <div className="mt-4 rounded-md bg-action-faded px-4 py-3 text-sm text-action">
                발송이 확정된 메일은 수신자와 내용을 보호하기 위해 수정할 수
                없습니다. 새 버전은 복제해서 만드세요.
              </div>
            ) : null}

            <fieldset disabled={!isEditable} className="mt-5 grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label
                    className={opsTheme.label}
                    htmlFor="crm-broadcast-name"
                  >
                    내부 관리 이름
                  </label>
                  <UiInput
                    unstyled
                    id="crm-broadcast-name"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    maxLength={120}
                    placeholder="예: 2026년 9월 서비스 업데이트"
                    className={cx(opsTheme.input, "mt-2")}
                  />
                </div>
                <div>
                  <label
                    className={opsTheme.label}
                    htmlFor="crm-broadcast-subject"
                  >
                    새 메일 제목
                  </label>
                  <UiInput
                    unstyled
                    id="crm-broadcast-subject"
                    value={draft.subject}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        subject: event.target.value,
                      }))
                    }
                    maxLength={200}
                    placeholder="받는 사람에게 표시될 제목"
                    className={cx(opsTheme.input, "mt-2")}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label
                    className={opsTheme.label}
                    htmlFor="crm-broadcast-locale"
                  >
                    대상 언어
                  </label>
                  <select
                    id="crm-broadcast-locale"
                    value={draft.recipientPreferredLocale ?? ""}
                    onChange={(event) => {
                      setAudienceCount(null);
                      setDraft((current) => ({
                        ...current,
                        recipientPreferredLocale:
                          (event.target
                            .value as OpsCrmCampaignPreferredLocale) || null,
                      }));
                    }}
                    className={cx(opsTheme.input, "mt-2 appearance-none")}
                  >
                    <option value="">모든 언어</option>
                    <option value="ko">한국어 선호</option>
                    <option value="en">영어 선호</option>
                  </select>
                </div>
                <div>
                  <label
                    className={opsTheme.label}
                    htmlFor="crm-broadcast-scheduled-at"
                  >
                    발송 시각
                  </label>
                  <UiInput
                    unstyled
                    id="crm-broadcast-scheduled-at"
                    type="datetime-local"
                    value={draft.scheduledAtLocal}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        scheduledAtLocal: event.target.value,
                      }))
                    }
                    className={cx(opsTheme.input, "mt-2")}
                  />
                  <p className="mt-1 text-[11px] text-neutral-soft">
                    비워두면 발송 확정 후 바로 시작합니다.
                  </p>
                </div>
                <div className="rounded-md border border-neutral-1000-a05 bg-bg-weak p-3">
                  <div className="flex items-center gap-2 text-xs text-neutral-muted">
                    <UsersRound className="h-4 w-4" />
                    현재 예상 대상
                  </div>
                  <div className="mt-1 text-2xl font-medium text-neutral-primary">
                    {selectedBroadcast?.status === "draft" && audienceLoading
                      ? "계산 중"
                      : effectiveAudienceCount == null
                        ? "확인 불가"
                        : `${effectiveAudienceCount.toLocaleString()}명`}
                  </div>
                </div>
              </div>

              <Checkbox
                checked={draft.recipientOnboardingDoneOnly}
                onChange={(event) => {
                  setAudienceCount(null);
                  setDraft((current) => ({
                    ...current,
                    recipientOnboardingDoneOnly: event.target.checked,
                  }));
                }}
                label="온보딩을 완료한 talent만 포함"
              />
              <p className="-mt-3 text-xs leading-5 text-neutral-muted">
                탈퇴했거나 모든 Harper 연락을 중단한 계정은 조건과 무관하게 자동
                제외됩니다.
              </p>

              <div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <label
                      className={opsTheme.label}
                      htmlFor="crm-broadcast-html"
                    >
                      새 메일 본문 HTML
                    </label>
                    <p className="mt-1 text-xs leading-5 text-neutral-muted">
                      이 내용이 기존 추천 메일과 분리된 새 메일의 전체 본문으로
                      발송됩니다.
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-neutral-soft">
                    {draft.htmlContent.length.toLocaleString()} / 100,000
                  </span>
                </div>
                <UiTextarea
                  unstyled
                  id="crm-broadcast-html"
                  value={draft.htmlContent}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      htmlContent: event.target.value,
                    }))
                  }
                  maxLength={100_000}
                  rows={14}
                  spellCheck={false}
                  placeholder={'<div style="padding: 20px;">...</div>'}
                  className={cx(
                    opsTheme.textarea,
                    "mt-2 min-h-[340px] resize-y font-mono text-[13px]"
                  )}
                />
              </div>
            </fieldset>
          </section>

          {selectedBroadcast && selectedBroadcast.status !== "draft" ? (
            <section className={cx(opsTheme.panel, "p-4")}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-neutral-primary">
                  <MailCheck className="h-4 w-4 text-neutral-soft" />
                  발송 현황
                </div>
                <span
                  className={cx(
                    "rounded px-2 py-1 text-xs font-medium",
                    STATUS_CLASSES[selectedBroadcast.status]
                  )}
                >
                  {STATUS_LABELS[selectedBroadcast.status]}
                </span>
              </div>
              <div className="mt-4 grid rounded-md border border-neutral-1000-a05 sm:grid-cols-4">
                <div className="px-4 py-3">
                  <div className="text-xs text-neutral-muted">전체 대상</div>
                  <div className="mt-1 text-lg text-neutral-primary">
                    {deliveryCounts?.total.toLocaleString() ?? "0"}명
                  </div>
                </div>
                <div className="border-t border-neutral-1000-a05 px-4 py-3 sm:border-l sm:border-t-0">
                  <div className="text-xs text-neutral-muted">발송 완료</div>
                  <div className="mt-1 text-lg text-positive">
                    {deliveryCounts?.sent.toLocaleString() ?? "0"}명
                  </div>
                </div>
                <div className="border-t border-neutral-1000-a05 px-4 py-3 sm:border-l sm:border-t-0">
                  <div className="text-xs text-neutral-muted">남은 대상</div>
                  <div className="mt-1 text-lg text-neutral-primary">
                    {(
                      (deliveryCounts?.queued ?? 0) +
                      (deliveryCounts?.processing ?? 0) +
                      (deliveryCounts?.paused ?? 0)
                    ).toLocaleString()}
                    명
                  </div>
                </div>
                <div className="border-t border-neutral-1000-a05 px-4 py-3 sm:border-l sm:border-t-0">
                  <div className="text-xs text-neutral-muted">실패·제외</div>
                  <div className="mt-1 text-lg text-critical">
                    {(
                      (deliveryCounts?.failed ?? 0) +
                      (deliveryCounts?.cancelled ?? 0)
                    ).toLocaleString()}
                    명
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-muted">
                <span>
                  발송 설정: {formatScheduledAt(selectedBroadcast.scheduledAt)}
                </span>
                {selectedBroadcast.queuedAt ? (
                  <span>
                    대상 확정:{" "}
                    {formatKstRelativeDateTime(selectedBroadcast.queuedAt)}
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          <BroadcastPreview
            htmlContent={draft.htmlContent}
            locale={draft.recipientPreferredLocale}
            viewport={previewViewport}
            onViewportChange={setPreviewViewport}
          />
        </form>
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!queueing) setConfirmOpen(open);
        }}
      >
        <DialogContent hideCloseButton={queueing}>
          <DialogHeader>
            <DialogTitle>단체 메일 발송을 확정할까요?</DialogTitle>
            <DialogDescription>
              확정하면 현재 조건에 맞는 수신자와 메일 내용이 고정됩니다. 이미
              발송된 메일은 취소할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 rounded-md bg-bg-weak p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-neutral-muted">예상 대상</span>
              <span className="font-medium text-neutral-primary">
                {(audienceCount ?? 0).toLocaleString()}명
              </span>
            </div>
            <div>
              <div className="text-neutral-muted">제목</div>
              <div className="mt-1 text-neutral-primary">
                {draft.subject.trim()}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-neutral-muted">시작</span>
              <span className="text-neutral-primary">
                {draft.scheduledAtLocal
                  ? formatScheduledAt(toScheduledIso(draft.scheduledAtLocal))
                  : "즉시"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <MuteButton
              type="button"
              size="lg"
              disabled={queueing}
              onClick={() => setConfirmOpen(false)}
            >
              취소
            </MuteButton>
            <MuteButton
              type="button"
              variant="dark"
              size="lg"
              disabled={!canQueue}
              onClick={() => void handleQueue()}
            >
              {queueing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              수신자 확정 및 발송
            </MuteButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
