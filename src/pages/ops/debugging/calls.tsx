import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
} from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Select as UiSelect } from "@/components/ui/select";
import { useOpsDebugCalls } from "@/hooks/ops/useOpsDebugCalls";
import type {
  OpsDebugCallItem,
  OpsDebugCallStatus,
} from "@/lib/ops/debugCallServer";
import {
  DebuggingPageShell,
  FETCH_LIMIT,
  FieldRow,
  SourceLimitNotice,
  StatTile,
  formatAbsoluteKst,
  formatDuration,
  useCanFetchInternal,
  useDebugCopyToClipboard,
} from "@/components/ops/debugging/shared";

const CALL_STATUS_OPTIONS = [
  { id: "all", label: "전체 상태" },
  { id: "pending", label: "대기" },
  { id: "active", label: "진행중" },
  { id: "completed", label: "완료" },
  { id: "abandoned", label: "중단" },
] as const satisfies readonly {
  id: OpsDebugCallStatus;
  label: string;
}[];

const CALL_KIND_OPTIONS = [
  { id: "", label: "전체 kind" },
  { id: "career_onboarding", label: "career_onboarding" },
  {
    id: "internal_opportunity_request",
    label: "internal_opportunity_request",
  },
] as const;

function getCallDisplayName(item: OpsDebugCallItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

function callStatusLabel(status: string) {
  if (status === "pending") return "대기";
  if (status === "active") return "진행중";
  if (status === "completed") return "완료";
  if (status === "abandoned") return "중단";
  return status || "-";
}

function callStatusClass(status: string) {
  if (status === "completed") return "bg-positive-faded text-positive";
  if (status === "active") return "bg-info-faded text-info";
  if (status === "pending") return "bg-bg-weak text-neutral-soft";
  if (status === "abandoned") return "bg-critical-faded text-critical";
  return "bg-bg-weak text-neutral-soft";
}

function buildCallTranscriptText(item: OpsDebugCallItem) {
  const lines = item.transcriptEntries.map((entry) => {
    const role = entry.role === "assistant" ? "assistant" : "user";
    return `[${formatAbsoluteKst(entry.createdAt)} KST] ${role}: ${entry.text}`;
  });
  if (item.wrapupMessages.length > 0) {
    lines.push("", "[wrap-up]");
    lines.push(
      ...item.wrapupMessages.map(
        (entry) =>
          `[${formatAbsoluteKst(entry.createdAt)} KST] ${entry.role}: ${
            entry.text
          }`
      )
    );
  }
  return lines.join("\n");
}

function CallListItem({
  item,
  onSelect,
  selected,
}: {
  item: OpsDebugCallItem;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  return (
    <BareButton
      type="button"
      onClick={() => onSelect(item.id)}
      className={cx(
        "w-full rounded-md border px-3 py-3 text-left transition",
        selected
          ? "border-neutral-800 bg-bg-default shadow-[0_12px_30px_color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)]"
          : "border-neutral-1000-a05 bg-bg-default/60 hover:border-neutral-1000-a10 hover:bg-bg-default"
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
                callStatusClass(item.status)
              )}
            >
              {callStatusLabel(item.status)}
            </span>
            <span className="inline-flex items-center rounded bg-bg-weak px-2 py-0.5 text-[11px] font-medium text-neutral-soft">
              {item.kind}
            </span>
            {item.transcriptCount > 0 ? (
              <span className="inline-flex items-center rounded bg-positive-faded px-2 py-0.5 text-[11px] font-medium text-positive">
                {item.transcriptCount} turns
              </span>
            ) : null}
          </div>
          <div className="mt-2 truncate text-sm font-medium text-neutral-primary">
            {getCallDisplayName(item)}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-neutral-soft">
          {formatKstRelativeDateTime(item.lastActiveAt)}
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs text-neutral-muted sm:grid-cols-2">
        <div className="min-w-0 truncate">{item.talent.email ?? "-"}</div>
        <div className="min-w-0 truncate sm:text-right">
          {item.userTurnCount} user · {item.assistantTurnCount} assistant ·{" "}
          {formatDuration(item.durationSeconds)}
        </div>
      </div>

      {item.transcriptPreview ? (
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-neutral-soft">
          {item.transcriptPreview}
        </p>
      ) : (
        <p className="mt-2 text-xs text-neutral-soft">
          저장된 call transcript가 없습니다.
        </p>
      )}
    </BareButton>
  );
}

function CallDetail({
  item,
  onCopy,
}: {
  item: OpsDebugCallItem | null;
  onCopy: (value: string | null | undefined, label: string) => void;
}) {
  if (!item) {
    return (
      <div
        className={cx(
          opsTheme.panel,
          "flex min-h-[520px] items-center justify-center px-4 py-12 text-center"
        )}
      >
        <div>
          <PhoneCall className="mx-auto h-7 w-7 text-neutral-soft" />
          <div className="mt-3 text-sm font-medium text-neutral-primary">
            콜을 선택하세요
          </div>
          <div className="mt-1 text-sm text-neutral-muted">
            왼쪽 목록에서 해당 call의 대화 내용을 확인할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(opsTheme.panel, "min-h-[520px] p-4")}>
      <div className="flex flex-col gap-3 border-b border-neutral-1000-a05 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cx(
                "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
                callStatusClass(item.status)
              )}
            >
              {callStatusLabel(item.status)}
            </span>
            <span className="inline-flex items-center rounded bg-bg-weak px-2 py-0.5 text-[11px] font-medium text-neutral-soft">
              {item.kind}
            </span>
          </div>
          <h2 className="mt-2 break-words text-lg font-semibold leading-6 text-neutral-primary">
            {getCallDisplayName(item)}
          </h2>
          <div className="mt-1 text-xs text-neutral-soft">
            시작 {formatAbsoluteKst(item.startedAt)} KST · 최근{" "}
            {formatAbsoluteKst(item.lastActiveAt)} KST
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <BareButton
            type="button"
            onClick={() => onCopy(buildCallTranscriptText(item), "대화 내용")}
            disabled={item.transcriptEntries.length === 0}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            <Copy className="h-3.5 w-3.5" />
            대화 복사
          </BareButton>
          <BareButton
            type="button"
            onClick={() => onCopy(item.conversationId, "conversation id")}
            disabled={!item.conversationId}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            <Copy className="h-3.5 w-3.5" />
            Conv ID
          </BareButton>
          <Link
            href={{ pathname: "/ops/career", query: { userId: item.userId } }}
            className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Talent
          </Link>
        </div>
      </div>

      <div className="grid gap-4 border-b border-neutral-1000-a05 py-4 lg:grid-cols-4">
        <FieldRow
          label="Talent"
          value={
            <span>
              {getCallDisplayName(item)}
              <span className="block text-xs text-neutral-muted">
                {item.talent.email ?? "-"}
              </span>
            </span>
          }
        />
        <FieldRow
          label="Duration"
          value={formatDuration(item.durationSeconds)}
        />
        <FieldRow label="Transcript" value={`${item.transcriptCount} turns`} />
        <FieldRow
          label="Completed"
          value={
            item.completedAt
              ? `${formatAbsoluteKst(item.completedAt)} KST`
              : "-"
          }
        />
      </div>

      <div className="py-4">
        <div className="flex items-center justify-between gap-3">
          <div className={opsTheme.eyebrow}>Transcript</div>
          <div className="text-xs text-neutral-soft">
            user {item.userTurnCount} · assistant {item.assistantTurnCount}
          </div>
        </div>
        {item.transcriptEntries.length > 0 ? (
          <div className="mt-3 max-h-[620px] space-y-3 overflow-auto rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-3">
            {item.transcriptEntries.map((entry) => (
              <div
                key={entry.id}
                className={cx(
                  "flex",
                  entry.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cx(
                    "max-w-[86%] rounded-md px-3 py-2 text-sm leading-6",
                    entry.role === "user"
                      ? "bg-neutral-1000 text-neutral-00"
                      : "bg-bg-weak text-neutral-primary"
                  )}
                >
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] opacity-70">
                    {entry.role} · {formatAbsoluteKst(entry.createdAt)}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {entry.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
            저장된 call transcript가 없습니다. 통화 턴 저장이 실패했거나, 아직
            pending 상태일 수 있습니다.
          </div>
        )}
      </div>

      {item.wrapupMessages.length > 0 ? (
        <div className="border-t border-neutral-1000-a05 py-4">
          <div className={opsTheme.eyebrow}>Wrap-up Messages</div>
          <div className="mt-2 space-y-2">
            {item.wrapupMessages.map((entry) => (
              <div
                key={entry.id}
                className="rounded-md border border-neutral-1000-a05 bg-bg-floating p-3"
              >
                <div className="text-[11px] text-neutral-soft">
                  {entry.role} · {formatAbsoluteKst(entry.createdAt)} KST
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-primary">
                  {entry.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <details className="rounded-md bg-bg-weak px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-neutral-muted">
          Call State
        </summary>
        <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-neutral-muted">
          {JSON.stringify(item.state, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export default function OpsDebuggingCallsPage() {
  const canFetchInternal = useCanFetchInternal();
  const copyToClipboard = useDebugCopyToClipboard();
  const [callStatus, setCallStatus] = useState<OpsDebugCallStatus>("all");
  const [callKind, setCallKind] = useState("");
  const [callStartedFrom, setCallStartedFrom] = useState("");
  const [callStartedTo, setCallStartedTo] = useState("");
  const [callSearchDraft, setCallSearchDraft] = useState("");
  const [callSearchQuery, setCallSearchQuery] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCallSearchQuery(callSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [callSearchDraft]);

  const callQuery = useOpsDebugCalls(FETCH_LIMIT, canFetchInternal, {
    kind: callKind,
    query: callSearchQuery,
    startedFrom: callStartedFrom,
    startedTo: callStartedTo,
    status: callStatus,
  });

  const calls = useMemo(
    () => callQuery.data?.pages.flatMap((page) => page.calls) ?? [],
    [callQuery.data]
  );
  const callStats = callQuery.data?.pages[0]?.stats ?? null;
  const selectedCall = useMemo(
    () => calls.find((item) => item.id === selectedCallId) ?? calls[0] ?? null,
    [calls, selectedCallId]
  );

  const resetCallFilters = useCallback(() => {
    setCallStatus("all");
    setCallKind("");
    setCallStartedFrom("");
    setCallStartedTo("");
    setCallSearchDraft("");
    setCallSearchQuery("");
  }, []);

  return (
    <DebuggingPageShell
      tab="calls"
      filters={
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
          <div>
            <label htmlFor="ops-debug-call-search" className={opsTheme.label}>
              검색
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
              <UiInput
                unstyled
                id="ops-debug-call-search"
                value={callSearchDraft}
                onChange={(event) => setCallSearchDraft(event.target.value)}
                placeholder="이름, 이메일, 대화 내용, call id, conversation id 검색"
                className={cx(opsTheme.input, "h-10 pl-9")}
              />
            </div>
          </div>

          <OpsDateRangeFilter
            emptyLabel="시작일 전체"
            from={callStartedFrom}
            label="시작일"
            onChange={(from, to) => {
              setCallStartedFrom(from);
              setCallStartedTo(to);
            }}
            prefix="시작"
            to={callStartedTo}
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ops-debug-call-status" className={opsTheme.label}>
                상태
              </label>
              <UiSelect
                unstyled
                id="ops-debug-call-status"
                value={callStatus}
                onChange={(event) =>
                  setCallStatus(event.target.value as OpsDebugCallStatus)
                }
                className={cx(opsTheme.input, "mt-2 h-10 min-w-[116px]")}
              >
                {CALL_STATUS_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </UiSelect>
            </div>
            <div>
              <label htmlFor="ops-debug-call-kind" className={opsTheme.label}>
                kind
              </label>
              <UiSelect
                unstyled
                id="ops-debug-call-kind"
                value={callKind}
                onChange={(event) => setCallKind(event.target.value)}
                className={cx(opsTheme.input, "mt-2 h-10 min-w-[172px]")}
              >
                {CALL_KIND_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </UiSelect>
            </div>
          </div>

          <div className="flex items-end">
            <BareButton
              type="button"
              onClick={resetCallFilters}
              className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
            >
              초기화
            </BareButton>
          </div>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Filtered" value={callStats?.totalCount ?? "-"} />
        <StatTile
          label="With Transcript"
          value={callStats?.withTranscriptCount ?? "-"}
        />
        <StatTile label="Active" value={callStats?.activeCount ?? "-"} />
        <StatTile label="Pending" value={callStats?.pendingCount ?? "-"} />
        <StatTile label="Completed" value={callStats?.completedCount ?? "-"} />
      </div>

      {callStats?.sourceLimitReached ? <SourceLimitNotice /> : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.44fr)_minmax(0,0.56fr)]">
        <div className={cx(opsTheme.panel, "p-3")}>
          <div className="flex items-center justify-between gap-3 px-1 pb-3">
            <div>
              <div className={opsTheme.eyebrow}>Calls</div>
              <div className="mt-1 text-sm text-neutral-muted">
                {calls.length}개 로드됨
              </div>
            </div>
            <BareButton
              type="button"
              onClick={() => void callQuery.refetch()}
              disabled={callQuery.isFetching}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:opacity-50"
              aria-label="새로고침"
            >
              <RefreshCw
                className={cx(
                  "h-4 w-4",
                  callQuery.isFetching ? "animate-spin" : ""
                )}
              />
            </BareButton>
          </div>

          {callQuery.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
            </div>
          ) : callQuery.error ? (
            <div className={opsTheme.errorNotice}>
              {callQuery.error instanceof Error
                ? callQuery.error.message
                : "콜 로그를 불러오지 못했습니다."}
            </div>
          ) : calls.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-16 text-center">
              <MessageSquare className="mx-auto h-6 w-6 text-neutral-soft" />
              <div className="mt-3 text-sm font-medium text-neutral-primary">
                조건에 맞는 콜이 없습니다.
              </div>
              <div className="mt-1 text-sm text-neutral-muted">
                날짜, 상태, kind 필터를 바꿔보세요.
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {calls.map((item) => (
                  <CallListItem
                    key={item.id}
                    item={item}
                    selected={item.id === selectedCall?.id}
                    onSelect={setSelectedCallId}
                  />
                ))}
              </div>

              {callQuery.hasNextPage ? (
                <div className="mt-3 flex justify-center">
                  <BareButton
                    type="button"
                    onClick={() => void callQuery.fetchNextPage()}
                    disabled={callQuery.isFetchingNextPage}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-10 px-4 text-xs"
                    )}
                  >
                    {callQuery.isFetchingNextPage ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <PhoneCall className="h-4 w-4" />
                    )}
                    더 보기
                  </BareButton>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="xl:sticky xl:top-[128px] xl:self-start">
          <CallDetail item={selectedCall} onCopy={copyToClipboard} />
        </div>
      </div>
    </DebuggingPageShell>
  );
}
