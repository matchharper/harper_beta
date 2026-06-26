import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Copy,
  ExternalLink,
  Inbox,
  LoaderCircle,
  Mail,
  MailCheck,
  MessageSquare,
  PhoneCall,
  RefreshCw,
  Search,
} from "lucide-react";
import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  compactMailAddress,
  mailStatusClass,
  mailStatusLabel,
  mailTypeLabel,
  toDateOnly,
} from "@/components/ops/career/utils";
import { showToast } from "@/components/toast/toast";
import { BareButton } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input as UiInput } from "@/components/ui/input";
import { Select as UiSelect } from "@/components/ui/select";
import { useOpsDebugCalls } from "@/hooks/ops/useOpsDebugCalls";
import { useOpsDebugEmails } from "@/hooks/ops/useOpsDebugEmails";
import { useOpsDebugOpportunityRuns } from "@/hooks/ops/useOpsDebugOpportunityRuns";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OpsDebugCallItem,
  OpsDebugCallStatus,
} from "@/lib/ops/debugCallServer";
import type {
  OpsDebugEmailDirection,
  OpsDebugEmailItem,
  OpsDebugEmailScope,
} from "@/lib/ops/debugEmailServer";
import type {
  OpsDebugOpportunityRunOutcome,
  OpsDebugOpportunityRunItem,
} from "@/lib/ops/debugOpportunityRunServer";
import { useAuthStore } from "@/store/useAuthStore";

const FETCH_LIMIT = 40;
const OPPORTUNITY_RUN_FETCH_LIMIT = 20;

export type DebugTabId = "emails" | "calls" | "opportunityRuns";

const SCOPE_OPTIONS = [
  { id: "internal_opportunity", label: "Internal 제안만" },
  { id: "all", label: "전체 메일" },
] as const satisfies readonly {
  id: OpsDebugEmailScope;
  label: string;
}[];

const DIRECTION_OPTIONS = [
  { id: "all", label: "전체 방향" },
  { id: "outbound", label: "발송" },
  { id: "inbound", label: "수신" },
] as const satisfies readonly {
  id: OpsDebugEmailDirection;
  label: string;
}[];

const STATUS_OPTIONS = [
  { id: "", label: "전체 상태" },
  { id: "sent", label: "발송" },
  { id: "received", label: "수신" },
  { id: "failed", label: "실패" },
  { id: "queued", label: "대기" },
  { id: "skipped", label: "스킵" },
] as const;

const MAIL_TYPE_OPTIONS = [
  { id: "", label: "전체 타입" },
  { id: "opportunity_recommendation", label: "추천 메일" },
  { id: "manual_ops", label: "수동 발송" },
  { id: "onboarding", label: "온보딩 1차" },
  { id: "onboarding_review", label: "온보딩 리뷰" },
  { id: "user_reply", label: "유저 답장" },
  { id: "auto_reply", label: "자동 답장" },
  { id: "other", label: "Other" },
] as const;

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

const OPPORTUNITY_RUN_OUTCOME_OPTIONS = [
  { id: "all", label: "전체 결과" },
  { id: "sent", label: "발송됨" },
  { id: "skipped", label: "스킵" },
  { id: "partial", label: "Partial" },
  { id: "failed", label: "실패" },
  { id: "recommend_only", label: "추천만 저장" },
  { id: "running", label: "진행중" },
  { id: "queued", label: "대기" },
  { id: "no_action", label: "액션 없음" },
] as const satisfies readonly {
  id: OpsDebugOpportunityRunOutcome;
  label: string;
}[];

function parseDateOnlyToLocal(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) {
    return undefined;
  }
  return date;
}

function toDateRange(from: string, to: string): DateRange | undefined {
  const fromDate = parseDateOnlyToLocal(from);
  if (!fromDate) return undefined;
  return {
    from: fromDate,
    to: parseDateOnlyToLocal(to) ?? fromDate,
  };
}

function formatShortDate(date: Date | undefined) {
  if (!date) return "";
  return date.toLocaleDateString("ko-KR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDebugDateRangeLabel(args: {
  emptyLabel: string;
  from: string;
  prefix: string;
  to: string;
}) {
  const range = toDateRange(args.from, args.to);
  if (!range?.from) return args.emptyLabel;
  const from = formatShortDate(range.from);
  const to = formatShortDate(range.to ?? range.from);
  return from === to
    ? `${args.prefix} ${from}`
    : `${args.prefix} ${from} - ${to}`;
}

function formatAbsoluteKst(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  });
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds || seconds < 0) return "-";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 1) return `${remainingSeconds}s`;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function emailActorLabel(item: OpsDebugEmailItem) {
  if (item.direction === "inbound") return "유저";
  if (item.mailType === "manual_ops") return "Ops 수동";
  return "시스템";
}

function getRecipientLabel(item: OpsDebugEmailItem) {
  return item.direction === "inbound"
    ? compactMailAddress(item.fromEmail)
    : compactMailAddress(item.toEmail ?? item.talent.email);
}

function getDisplayName(item: OpsDebugEmailItem) {
  return item.talent.name || item.talent.email || "이름 없음";
}

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

function debugTabTitle(tab: DebugTabId) {
  if (tab === "emails") return "메일 로그";
  if (tab === "calls") return "콜 로그";
  return "Opportunity Runs";
}

function debugTabDescription(tab: DebugTabId) {
  if (tab === "emails") {
    return "career 유저에게 저장된 메일 본문과 internal role 제안 메일을 확인합니다.";
  }
  if (tab === "calls") {
    return "talent_calls별로 저장된 통화 transcript와 wrap-up 메시지를 확인합니다.";
  }
  return "최근 opportunity_discovery_run의 추천 저장, 발송, action, partial 사유를 확인합니다.";
}

function opportunityRunOutcomeClass(outcome: string) {
  if (outcome === "sent") return "bg-positive-faded text-positive";
  if (outcome === "skipped") return "bg-bg-weak text-neutral-muted";
  if (outcome === "recommend_only") return "bg-info-faded text-info";
  if (outcome === "failed") return "bg-critical-faded text-critical";
  if (outcome === "running") return "bg-info-faded text-info";
  if (outcome === "queued") return "bg-bg-weak text-neutral-soft";
  if (outcome === "partial") return "bg-info-faded text-info";
  return "bg-bg-weak text-neutral-soft";
}

function opportunityRunReviewClass(review: string) {
  if (review === "ok") return "bg-positive-faded text-positive";
  if (review === "retry") return "bg-critical-faded text-critical";
  if (review === "review") return "bg-info-faded text-info";
  if (review === "waiting") return "bg-info-faded text-info";
  return "bg-bg-weak text-neutral-muted";
}

function opportunityRunDeliveryClass(status: string) {
  if (status === "sent") return "bg-positive-faded text-positive";
  if (status === "failed") return "bg-critical-faded text-critical";
  if (status === "skipped") return "bg-bg-weak text-neutral-muted";
  return "bg-bg-weak text-neutral-soft";
}

function getOpportunityRunDisplayName(item: OpsDebugOpportunityRunItem) {
  return item.talent.name || item.talent.email || "이름 없음";
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

function StatTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-3 py-2")}>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-neutral-primary">
        {value}
      </div>
    </div>
  );
}

function DebugDateRangeFilter({
  emptyLabel,
  from,
  label,
  onChange,
  prefix,
  to,
}: {
  emptyLabel: string;
  from: string;
  label: string;
  onChange: (from: string, to: string) => void;
  prefix: string;
  to: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dateRange = useMemo(() => toDateRange(from, to), [from, to]);
  const hasFilter = Boolean(from || to);
  const buttonLabel = formatDebugDateRangeLabel({
    emptyLabel,
    from,
    prefix,
    to,
  });

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <label className={opsTheme.label}>{label}</label>
      <BareButton
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "mt-2 inline-flex h-10 min-w-[180px] items-center justify-between gap-2 rounded-md border px-3 text-xs font-medium transition",
          hasFilter
            ? "border-positive/30 bg-positive-faded text-positive"
            : "border-neutral-1000-a05 bg-bg-default/70 text-neutral-muted hover:border-neutral-1000-a10 hover:bg-bg-default"
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{buttonLabel}</span>
        </span>
        <ChevronDown
          className={cx(
            "h-3.5 w-3.5 shrink-0 transition",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </BareButton>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-md border border-neutral-1000-a10 bg-bg-floating p-2 shadow-[0_18px_48px_color-mix(in_srgb,var(--color-neutral-1000)_16%,transparent)]">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              onChange(
                toDateOnly(range?.from),
                toDateOnly(range?.to ?? range?.from)
              );
            }}
            numberOfMonths={1}
            disabled={{ after: new Date() }}
            className="p-2 text-[12px] [--cell-size:1.85rem]"
          />
          <div className="mt-1 flex items-center justify-end gap-2 border-t border-neutral-1000-a05 pt-2">
            <BareButton
              type="button"
              onClick={() => onChange("", "")}
              disabled={!hasFilter}
              className="h-7 rounded-md px-2 text-[11px] font-medium text-neutral-muted transition hover:bg-bg-weak disabled:cursor-not-allowed disabled:opacity-40"
            >
              초기화
            </BareButton>
            <BareButton
              type="button"
              onClick={() => setOpen(false)}
              className="h-7 rounded-md bg-black px-2.5 text-[11px] font-medium text-neutral-00 transition hover:bg-black/88"
            >
              닫기
            </BareButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SourceBadge({ source }: { source: OpsDebugEmailItem["source"] }) {
  return (
    <span className="inline-flex items-center rounded bg-bg-weak px-2 py-0.5 text-[11px] font-medium text-neutral-soft">
      {source === "career_email_messages" ? "canonical" : "delivery log"}
    </span>
  );
}

function EmailListItem({
  item,
  onSelect,
  selected,
}: {
  item: OpsDebugEmailItem;
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
                item.isInternalOpportunityProposal
                  ? "bg-positive-faded text-positive"
                  : "bg-bg-weak text-neutral-soft"
              )}
            >
              {item.isInternalOpportunityProposal ? "Internal" : "Mail"}
            </span>
            <span
              className={cx(
                "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
                mailStatusClass(item.status)
              )}
            >
              {mailStatusLabel(item.status)}
            </span>
            <SourceBadge source={item.source} />
          </div>
          <div className="mt-2 truncate text-sm font-medium text-neutral-primary">
            {item.subject?.trim() || "(제목 없음)"}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-neutral-soft">
          {formatKstRelativeDateTime(item.occurredAt)}
        </div>
      </div>

      <div className="mt-2 grid gap-1 text-xs text-neutral-muted sm:grid-cols-2">
        <div className="min-w-0 truncate">
          {emailActorLabel(item)} · {mailTypeLabel(item.mailType)}
        </div>
        <div className="min-w-0 truncate sm:text-right">
          {getDisplayName(item)} · {getRecipientLabel(item)}
        </div>
      </div>

      {item.bodyPreview ? (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-soft">
          {item.bodyPreview}
        </p>
      ) : null}

      {item.roleLabels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.roleLabels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="max-w-full truncate rounded bg-bg-weak px-2 py-0.5 text-[11px] text-neutral-muted"
            >
              {label}
            </span>
          ))}
          {item.roleLabels.length > 3 ? (
            <span className="rounded bg-bg-weak px-2 py-0.5 text-[11px] text-neutral-soft">
              +{item.roleLabels.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}
    </BareButton>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-1 min-w-0 break-words text-sm text-neutral-primary">
        {value || "-"}
      </div>
    </div>
  );
}

function EmailDetail({
  item,
  onCopy,
}: {
  item: OpsDebugEmailItem | null;
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
          <Inbox className="mx-auto h-7 w-7 text-neutral-soft" />
          <div className="mt-3 text-sm font-medium text-neutral-primary">
            메일을 선택하세요
          </div>
          <div className="mt-1 text-sm text-neutral-muted">
            왼쪽 목록에서 본문을 확인할 메일을 고를 수 있습니다.
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
                item.isInternalOpportunityProposal
                  ? "bg-positive-faded text-positive"
                  : "bg-bg-weak text-neutral-soft"
              )}
            >
              {item.isInternalOpportunityProposal
                ? `${item.internalRoleCount} internal`
                : "mail"}
            </span>
            <span
              className={cx(
                "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
                mailStatusClass(item.status)
              )}
            >
              {mailStatusLabel(item.status)}
            </span>
            <SourceBadge source={item.source} />
          </div>
          <h2 className="mt-2 break-words text-lg font-semibold leading-6 text-neutral-primary">
            {item.subject?.trim() || "(제목 없음)"}
          </h2>
          <div className="mt-1 text-xs text-neutral-soft">
            {formatAbsoluteKst(item.occurredAt)} KST
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <BareButton
            type="button"
            onClick={() => onCopy(item.bodyText, "본문")}
            disabled={!item.bodyText}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            <Copy className="h-3.5 w-3.5" />
            본문 복사
          </BareButton>
          <BareButton
            type="button"
            onClick={() => onCopy(item.toEmail ?? item.talent.email, "수신자")}
            disabled={!item.toEmail && !item.talent.email}
            className={cx(opsTheme.buttonSecondary, "h-9 px-3 text-xs")}
          >
            <Copy className="h-3.5 w-3.5" />
            수신자
          </BareButton>
          <Link
            href={{
              pathname: "/ops/career",
              query: { userId: item.talent.userId },
            }}
            className={cx(opsTheme.buttonPrimary, "h-9 px-3 text-xs")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Talent
          </Link>
        </div>
      </div>

      <div className="grid gap-4 border-b border-neutral-1000-a05 py-4 lg:grid-cols-3">
        <FieldRow
          label="Talent"
          value={
            <span>
              {getDisplayName(item)}
              <span className="block text-xs text-neutral-muted">
                {item.talent.email ?? "-"}
              </span>
            </span>
          }
        />
        <FieldRow
          label="From / To"
          value={
            <span>
              {compactMailAddress(item.fromEmail)}
              <span className="block text-xs text-neutral-muted">
                {compactMailAddress(item.toEmail)}
              </span>
            </span>
          }
        />
        <FieldRow
          label="Type"
          value={`${emailActorLabel(item)} · ${mailTypeLabel(item.mailType)}`}
        />
      </div>

      {item.roleLabels.length > 0 || item.discoveryRunId ? (
        <div className="border-b border-neutral-1000-a05 py-4">
          <div className={opsTheme.eyebrow}>Recommendation Context</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.roleLabels.map((label) => (
              <span
                key={label}
                className="rounded bg-bg-weak px-2.5 py-1 text-xs text-neutral-muted"
              >
                {label}
              </span>
            ))}
            {item.recommendationCount > item.roleLabels.length ? (
              <span className="rounded bg-bg-weak px-2.5 py-1 text-xs text-neutral-soft">
                {item.recommendationCount} recommendations
              </span>
            ) : null}
          </div>
          {item.discoveryRunId ? (
            <div className="mt-2 break-all text-xs text-neutral-soft">
              run: {item.discoveryRunId}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="py-4">
        <div className={opsTheme.eyebrow}>Body</div>
        {item.bodyText ? (
          <pre className="mt-2 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border border-neutral-1000-a05 bg-bg-default/70 p-4 text-sm leading-6 text-neutral-primary">
            {item.bodyText}
          </pre>
        ) : (
          <div className="mt-2 rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-10 text-center text-sm text-neutral-soft">
            저장된 본문이 없습니다.
          </div>
        )}
      </div>

      <details className="rounded-md bg-bg-weak px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-neutral-muted">
          Metadata
        </summary>
        <pre className="mt-2 max-h-[260px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-neutral-muted">
          {JSON.stringify(item.metadata, null, 2)}
        </pre>
      </details>
    </div>
  );
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

function OpportunityRunsTable({
  error,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isLoading,
  onFetchNextPage,
  onRefresh,
  runs,
}: {
  error: unknown;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  onFetchNextPage: () => void;
  onRefresh: () => void;
  runs: OpsDebugOpportunityRunItem[];
}) {
  const renderChannelBadges = (item: OpsDebugOpportunityRunItem) => {
    const statuses = item.deliveries.map((delivery) => ({
      channel: delivery.channel,
      id: delivery.id,
      status: delivery.status,
    }));

    if (statuses.length === 0) {
      return <span className="text-xs text-neutral-soft">발송 없음</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {statuses.map((delivery) => (
          <span
            key={delivery.id || `${delivery.channel}-${delivery.status}`}
            className={cx(
              "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
              opportunityRunDeliveryClass(delivery.status)
            )}
          >
            {delivery.channel} {delivery.status}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className={cx(opsTheme.panel, "overflow-hidden")}>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-1000-a05 px-4 py-3">
        <div>
          <div className={opsTheme.eyebrow}>Runs</div>
          <div className="mt-1 text-sm text-neutral-muted">
            {runs.length}개 로드됨
          </div>
        </div>
        <BareButton
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:opacity-50"
          aria-label="새로고침"
        >
          <RefreshCw
            className={cx("h-4 w-4", isFetching ? "animate-spin" : "")}
          />
        </BareButton>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
        </div>
      ) : error ? (
        <div className="p-4">
          <div className={opsTheme.errorNotice}>
            {error instanceof Error
              ? error.message
              : "opportunity run을 불러오지 못했습니다."}
          </div>
        </div>
      ) : runs.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <BriefcaseBusiness className="mx-auto h-6 w-6 text-neutral-soft" />
          <div className="mt-3 text-sm font-medium text-neutral-primary">
            조건에 맞는 run이 없습니다.
          </div>
          <div className="mt-1 text-sm text-neutral-muted">
            날짜, 결과, 검색어를 바꿔보세요.
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[1240px] table-fixed border-collapse text-left text-sm">
              <thead className="bg-bg-weak/70 text-[11px] uppercase tracking-[0.06em] text-neutral-soft">
                <tr>
                  <th className="w-[118px] px-4 py-3 font-medium">시간</th>
                  <th className="w-[210px] px-4 py-3 font-medium">유저</th>
                  <th className="w-[150px] px-4 py-3 font-medium">결과</th>
                  <th className="w-[330px] px-4 py-3 font-medium">
                    왜 / 맥락
                  </th>
                  <th className="w-[220px] px-4 py-3 font-medium">추천</th>
                  <th className="w-[250px] px-4 py-3 font-medium">발송</th>
                  <th className="w-[122px] px-4 py-3 font-medium">확인</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-1000-a05">
                {runs.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-bg-weak/40">
                    <td className="px-4 py-4">
                      <div className="font-mono text-xs text-neutral-primary">
                        {formatKstRelativeDateTime(item.createdAt)}
                      </div>
                      <div className="mt-1 text-[11px] leading-4 text-neutral-soft">
                        {formatAbsoluteKst(item.createdAt)}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={{
                          pathname: "/ops/career",
                          query: { userId: item.talent.userId },
                        }}
                        className="font-medium text-neutral-primary transition hover:text-black"
                      >
                        {getOpportunityRunDisplayName(item)}
                      </Link>
                      <div className="mt-1 break-all text-xs text-neutral-muted">
                        {item.talent.email ?? "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cx(
                          "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
                          opportunityRunOutcomeClass(item.outcome.id)
                        )}
                      >
                        {item.outcome.label}
                      </span>
                      {item.status === "partial" &&
                      item.outcome.id !== "partial" ? (
                        <div className="mt-2 text-[11px] text-neutral-soft">
                          status: partial
                        </div>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {item.actionLabels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className="rounded bg-bg-weak px-1.5 py-0.5 text-[10px] font-medium text-neutral-muted"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="line-clamp-2 text-xs font-medium leading-5 text-neutral-primary">
                        {item.primaryReason}
                      </div>
                      {item.deliveryMetaSummary ? (
                        <div className="mt-2 line-clamp-3 text-[11px] leading-5 text-neutral-muted">
                          {item.deliveryMetaSummary}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-xs font-semibold tabular-nums text-neutral-primary">
                        {item.recommendationCount}개
                      </div>
                      {item.recommendations.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {item.recommendations.slice(0, 3).map((rec) => (
                            <div
                              key={rec.id}
                              className="truncate rounded bg-bg-weak px-2 py-1 text-[11px] text-neutral-muted"
                            >
                              {[rec.roleName, rec.companyName]
                                .filter(Boolean)
                                .join(" @ ") || rec.roleId}
                            </div>
                          ))}
                          {item.recommendations.length > 3 ? (
                            <div className="text-[11px] text-neutral-soft">
                              +{item.recommendations.length - 3}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-neutral-soft">
                          추천 없음
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {renderChannelBadges(item)}
                      {item.emailSubject ? (
                        <div className="mt-2 line-clamp-2 text-[11px] leading-4 text-neutral-soft">
                          {item.emailSubject}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={cx(
                          "inline-flex rounded px-2 py-0.5 text-[11px] font-medium",
                          opportunityRunReviewClass(item.reviewAction.id)
                        )}
                      >
                        {item.reviewAction.label}
                      </span>
                      {item.reviewAction.reason ? (
                        <div className="mt-2 line-clamp-3 text-[11px] leading-5 text-neutral-soft">
                          {item.reviewAction.reason}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="flex justify-center border-t border-neutral-1000-a05 px-4 py-3">
              <BareButton
                type="button"
                onClick={onFetchNextPage}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-10 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <BriefcaseBusiness className="h-4 w-4" />
                )}
                20개 더 보기
              </BareButton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function OpsDebuggingPageView({ mode }: { mode: DebugTabId }) {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const activeDebugTab = mode;
  const [scope, setScope] = useState<OpsDebugEmailScope>(
    "internal_opportunity"
  );
  const [direction, setDirection] = useState<OpsDebugEmailDirection>("all");
  const [status, setStatus] = useState("");
  const [mailType, setMailType] = useState("");
  const [occurredFrom, setOccurredFrom] = useState("");
  const [occurredTo, setOccurredTo] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<OpsDebugCallStatus>("all");
  const [callKind, setCallKind] = useState("");
  const [callStartedFrom, setCallStartedFrom] = useState("");
  const [callStartedTo, setCallStartedTo] = useState("");
  const [callSearchDraft, setCallSearchDraft] = useState("");
  const [callSearchQuery, setCallSearchQuery] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [runOutcome, setRunOutcome] =
    useState<OpsDebugOpportunityRunOutcome>("all");
  const [runCreatedFrom, setRunCreatedFrom] = useState("");
  const [runCreatedTo, setRunCreatedTo] = useState("");
  const [runSearchDraft, setRunSearchDraft] = useState("");
  const [runSearchQuery, setRunSearchQuery] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCallSearchQuery(callSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [callSearchDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRunSearchQuery(runSearchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [runSearchDraft]);

  const query = useOpsDebugEmails(
    FETCH_LIMIT,
    canFetchInternal && activeDebugTab === "emails",
    {
      direction,
      mailType: scope === "all" ? mailType : "",
      occurredFrom,
      occurredTo,
      query: searchQuery,
      scope,
      status,
    }
  );
  const callQuery = useOpsDebugCalls(
    FETCH_LIMIT,
    canFetchInternal && activeDebugTab === "calls",
    {
      kind: callKind,
      query: callSearchQuery,
      startedFrom: callStartedFrom,
      startedTo: callStartedTo,
      status: callStatus,
    }
  );
  const opportunityRunQuery = useOpsDebugOpportunityRuns(
    OPPORTUNITY_RUN_FETCH_LIMIT,
    canFetchInternal && activeDebugTab === "opportunityRuns",
    {
      createdFrom: runCreatedFrom,
      createdTo: runCreatedTo,
      outcome: runOutcome,
      query: runSearchQuery,
    }
  );

  const emails = useMemo(
    () => query.data?.pages.flatMap((page) => page.emails) ?? [],
    [query.data]
  );
  const stats = query.data?.pages[0]?.stats ?? null;
  const selectedEmail = useMemo(
    () =>
      emails.find((item) => item.id === selectedEmailId) ?? emails[0] ?? null,
    [emails, selectedEmailId]
  );
  const calls = useMemo(
    () => callQuery.data?.pages.flatMap((page) => page.calls) ?? [],
    [callQuery.data]
  );
  const callStats = callQuery.data?.pages[0]?.stats ?? null;
  const selectedCall = useMemo(
    () => calls.find((item) => item.id === selectedCallId) ?? calls[0] ?? null,
    [calls, selectedCallId]
  );
  const opportunityRuns = useMemo(
    () =>
      opportunityRunQuery.data?.pages.flatMap((page) => page.runs) ?? [],
    [opportunityRunQuery.data]
  );
  const opportunityRunStats =
    opportunityRunQuery.data?.pages[0]?.stats ?? null;

  const handleScopeChange = useCallback((nextScope: OpsDebugEmailScope) => {
    setScope(nextScope);
    if (nextScope === "internal_opportunity") {
      setMailType("");
      setDirection("all");
    }
  }, []);

  const resetFilters = useCallback(() => {
    setScope("internal_opportunity");
    setDirection("all");
    setStatus("");
    setMailType("");
    setOccurredFrom("");
    setOccurredTo("");
    setSearchDraft("");
    setSearchQuery("");
  }, []);

  const resetCallFilters = useCallback(() => {
    setCallStatus("all");
    setCallKind("");
    setCallStartedFrom("");
    setCallStartedTo("");
    setCallSearchDraft("");
    setCallSearchQuery("");
  }, []);

  const resetRunFilters = useCallback(() => {
    setRunOutcome("all");
    setRunCreatedFrom("");
    setRunCreatedTo("");
    setRunSearchDraft("");
    setRunSearchQuery("");
  }, []);

  const copyToClipboard = useCallback(
    async (value: string | null | undefined, label: string) => {
      const text = value?.trim();
      if (!text) return;

      try {
        await navigator.clipboard.writeText(text);
        showToast({ message: `${label}을 복사했습니다.`, variant: "white" });
      } catch {
        showToast({ message: "복사하지 못했습니다.", variant: "white" });
      }
    },
    []
  );

  return (
    <>
      <Head>
        <title>{`${debugTabTitle(activeDebugTab)} · Harper Ops`}</title>
        <meta name="description" content="Harper internal debugging tools" />
      </Head>

      <OpsShell compactHeader title="Debugging">
        <section className="space-y-3">
          <div className={cx(opsTheme.panel, "p-4")}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className={opsTheme.eyebrow}>Debugging</div>
                <h1 className="mt-1 text-xl font-semibold text-neutral-primary">
                  {debugTabTitle(activeDebugTab)}
                </h1>
                <p className="mt-1 text-sm leading-6 text-neutral-muted">
                  {debugTabDescription(activeDebugTab)}
                </p>
              </div>
            </div>

            {activeDebugTab === "emails" ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-[auto_1fr_auto_auto_auto_auto] lg:items-end">
                <div>
                  <label className={opsTheme.label}>범위</label>
                  <div className="mt-2 inline-flex rounded-md bg-bg-weak p-1">
                    {SCOPE_OPTIONS.map((option) => (
                      <BareButton
                        key={option.id}
                        type="button"
                        onClick={() => handleScopeChange(option.id)}
                        className={cx(
                          "h-9 rounded px-3 text-xs font-medium transition",
                          scope === option.id
                            ? "bg-bg-default text-neutral-primary shadow-sm"
                            : "text-neutral-muted hover:text-neutral-primary"
                        )}
                      >
                        {option.label}
                      </BareButton>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ops-debug-email-search"
                    className={opsTheme.label}
                  >
                    검색
                  </label>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                    <UiInput
                      unstyled
                      id="ops-debug-email-search"
                      value={searchDraft}
                      onChange={(event) => setSearchDraft(event.target.value)}
                      placeholder="이름, 이메일, 제목, 본문, role 검색"
                      className={cx(opsTheme.input, "h-10 pl-9")}
                    />
                  </div>
                </div>

                <DebugDateRangeFilter
                  emptyLabel="발생일 전체"
                  from={occurredFrom}
                  label="발생일"
                  onChange={(from, to) => {
                    setOccurredFrom(from);
                    setOccurredTo(to);
                  }}
                  prefix="발생"
                  to={occurredTo}
                />

                <div>
                  <label
                    htmlFor="ops-debug-email-direction"
                    className={opsTheme.label}
                  >
                    방향
                  </label>
                  <UiSelect
                    unstyled
                    id="ops-debug-email-direction"
                    value={direction}
                    onChange={(event) =>
                      setDirection(event.target.value as OpsDebugEmailDirection)
                    }
                    className={cx(opsTheme.input, "mt-2 h-10 min-w-[116px]")}
                  >
                    {DIRECTION_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </UiSelect>
                </div>

                <div>
                  <label
                    htmlFor="ops-debug-email-status"
                    className={opsTheme.label}
                  >
                    상태
                  </label>
                  <UiSelect
                    unstyled
                    id="ops-debug-email-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className={cx(opsTheme.input, "mt-2 h-10 min-w-[116px]")}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </UiSelect>
                </div>

                <div className="flex items-end gap-2">
                  <div className="min-w-[132px]">
                    <label
                      htmlFor="ops-debug-email-mail-type"
                      className={opsTheme.label}
                    >
                      타입
                    </label>
                    <UiSelect
                      unstyled
                      id="ops-debug-email-mail-type"
                      value={
                        scope === "all"
                          ? mailType
                          : "opportunity_recommendation"
                      }
                      onChange={(event) => setMailType(event.target.value)}
                      disabled={scope === "internal_opportunity"}
                      className={cx(opsTheme.input, "mt-2 h-10")}
                    >
                      {MAIL_TYPE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </UiSelect>
                  </div>
                  <BareButton
                    type="button"
                    onClick={resetFilters}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-10 px-3 text-xs"
                    )}
                  >
                    초기화
                  </BareButton>
                </div>
              </div>
            ) : activeDebugTab === "calls" ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="ops-debug-call-search"
                    className={opsTheme.label}
                  >
                    검색
                  </label>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                    <UiInput
                      unstyled
                      id="ops-debug-call-search"
                      value={callSearchDraft}
                      onChange={(event) =>
                        setCallSearchDraft(event.target.value)
                      }
                      placeholder="이름, 이메일, 대화 내용, call id, conversation id 검색"
                      className={cx(opsTheme.input, "h-10 pl-9")}
                    />
                  </div>
                </div>

                <DebugDateRangeFilter
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
                    <label
                      htmlFor="ops-debug-call-status"
                      className={opsTheme.label}
                    >
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
                    <label
                      htmlFor="ops-debug-call-kind"
                      className={opsTheme.label}
                    >
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
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-10 px-3 text-xs"
                    )}
                  >
                    초기화
                  </BareButton>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="ops-debug-opportunity-run-search"
                    className={opsTheme.label}
                  >
                    검색
                  </label>
                  <div className="relative mt-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                    <UiInput
                      unstyled
                      id="ops-debug-opportunity-run-search"
                      value={runSearchDraft}
                      onChange={(event) =>
                        setRunSearchDraft(event.target.value)
                      }
                      placeholder="이름, 이메일, 결과, 추천, 발송 맥락 검색"
                      className={cx(opsTheme.input, "h-10 pl-9")}
                    />
                  </div>
                </div>

                <DebugDateRangeFilter
                  emptyLabel="생성일 전체"
                  from={runCreatedFrom}
                  label="생성일"
                  onChange={(from, to) => {
                    setRunCreatedFrom(from);
                    setRunCreatedTo(to);
                  }}
                  prefix="생성"
                  to={runCreatedTo}
                />

                <div>
                  <label
                    htmlFor="ops-debug-opportunity-run-outcome"
                    className={opsTheme.label}
                  >
                    결과
                  </label>
                  <UiSelect
                    unstyled
                    id="ops-debug-opportunity-run-outcome"
                    value={runOutcome}
                    onChange={(event) =>
                      setRunOutcome(
                        event.target.value as OpsDebugOpportunityRunOutcome
                      )
                    }
                    className={cx(opsTheme.input, "mt-2 h-10 min-w-[132px]")}
                  >
                    {OPPORTUNITY_RUN_OUTCOME_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </UiSelect>
                </div>

                <div className="flex items-end">
                  <BareButton
                    type="button"
                    onClick={resetRunFilters}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-10 px-3 text-xs"
                    )}
                  >
                    초기화
                  </BareButton>
                </div>
              </div>
            )}
          </div>

          {activeDebugTab === "emails" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile label="Filtered" value={stats?.totalCount ?? "-"} />
                <StatTile
                  label="Internal"
                  value={stats?.internalOpportunityCount ?? "-"}
                />
                <StatTile
                  label="Outbound"
                  value={stats?.outboundCount ?? "-"}
                />
                <StatTile label="Inbound" value={stats?.inboundCount ?? "-"} />
                <StatTile label="Failed" value={stats?.failedCount ?? "-"} />
              </div>

              {stats?.sourceLimitReached ? (
                <div
                  className={cx(
                    opsTheme.errorNotice,
                    "flex items-center gap-2"
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  일부 결과가 디버그 조회 한도를 넘어섰을 수 있습니다. 날짜나
                  검색어로 범위를 좁혀 확인하세요.
                </div>
              ) : null}

              <div className="grid gap-3 xl:grid-cols-[minmax(360px,0.44fr)_minmax(0,0.56fr)]">
                <div className={cx(opsTheme.panel, "p-3")}>
                  <div className="flex items-center justify-between gap-3 px-1 pb-3">
                    <div>
                      <div className={opsTheme.eyebrow}>Messages</div>
                      <div className="mt-1 text-sm text-neutral-muted">
                        {emails.length}개 로드됨
                      </div>
                    </div>
                    <BareButton
                      type="button"
                      onClick={() => void query.refetch()}
                      disabled={query.isFetching}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-muted transition hover:bg-bg-weak hover:text-neutral-primary disabled:opacity-50"
                      aria-label="새로고침"
                    >
                      <RefreshCw
                        className={cx(
                          "h-4 w-4",
                          query.isFetching ? "animate-spin" : ""
                        )}
                      />
                    </BareButton>
                  </div>

                  {query.isLoading ? (
                    <div className="flex items-center justify-center py-20">
                      <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
                    </div>
                  ) : query.error ? (
                    <div className={opsTheme.errorNotice}>
                      {query.error instanceof Error
                        ? query.error.message
                        : "메일 로그를 불러오지 못했습니다."}
                    </div>
                  ) : emails.length === 0 ? (
                    <div className="rounded-md border border-dashed border-neutral-1000-a10 bg-bg-floating px-4 py-16 text-center">
                      <Mail className="mx-auto h-6 w-6 text-neutral-soft" />
                      <div className="mt-3 text-sm font-medium text-neutral-primary">
                        조건에 맞는 메일이 없습니다.
                      </div>
                      <div className="mt-1 text-sm text-neutral-muted">
                        날짜나 범위 필터를 바꿔보세요.
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {emails.map((item) => (
                          <EmailListItem
                            key={item.id}
                            item={item}
                            selected={item.id === selectedEmail?.id}
                            onSelect={setSelectedEmailId}
                          />
                        ))}
                      </div>

                      {query.hasNextPage ? (
                        <div className="mt-3 flex justify-center">
                          <BareButton
                            type="button"
                            onClick={() => void query.fetchNextPage()}
                            disabled={query.isFetchingNextPage}
                            className={cx(
                              opsTheme.buttonSecondary,
                              "h-10 px-4 text-xs"
                            )}
                          >
                            {query.isFetchingNextPage ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <MailCheck className="h-4 w-4" />
                            )}
                            더 보기
                          </BareButton>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="xl:sticky xl:top-[128px] xl:self-start">
                  <EmailDetail item={selectedEmail} onCopy={copyToClipboard} />
                </div>
              </div>
            </>
          ) : activeDebugTab === "calls" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile
                  label="Filtered"
                  value={callStats?.totalCount ?? "-"}
                />
                <StatTile
                  label="With Transcript"
                  value={callStats?.withTranscriptCount ?? "-"}
                />
                <StatTile
                  label="Active"
                  value={callStats?.activeCount ?? "-"}
                />
                <StatTile
                  label="Pending"
                  value={callStats?.pendingCount ?? "-"}
                />
                <StatTile
                  label="Completed"
                  value={callStats?.completedCount ?? "-"}
                />
              </div>

              {callStats?.sourceLimitReached ? (
                <div
                  className={cx(
                    opsTheme.errorNotice,
                    "flex items-center gap-2"
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  일부 결과가 디버그 조회 한도를 넘어섰을 수 있습니다. 날짜나
                  검색어로 범위를 좁혀 확인하세요.
                </div>
              ) : null}

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
            </>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <StatTile
                  label="Sent"
                  value={opportunityRunStats?.sentCount ?? "-"}
                />
                <StatTile
                  label="Skipped"
                  value={opportunityRunStats?.skippedCount ?? "-"}
                />
                <StatTile
                  label="Partial"
                  value={opportunityRunStats?.partialCount ?? "-"}
                />
                <StatTile
                  label="Failed"
                  value={opportunityRunStats?.failedCount ?? "-"}
                />
                <StatTile
                  label="Needs Review"
                  value={opportunityRunStats?.reviewNeededCount ?? "-"}
                />
              </div>

              {opportunityRunStats?.sourceLimitReached ? (
                <div
                  className={cx(
                    opsTheme.errorNotice,
                    "flex items-center gap-2"
                  )}
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  일부 결과가 디버그 조회 한도를 넘어섰을 수 있습니다. 날짜나
                  검색어로 범위를 좁혀 확인하세요.
                </div>
              ) : null}

              <OpportunityRunsTable
                error={opportunityRunQuery.error}
                hasNextPage={Boolean(opportunityRunQuery.hasNextPage)}
                isFetching={opportunityRunQuery.isFetching}
                isFetchingNextPage={opportunityRunQuery.isFetchingNextPage}
                isLoading={opportunityRunQuery.isLoading}
                onFetchNextPage={() =>
                  void opportunityRunQuery.fetchNextPage()
                }
                onRefresh={() => void opportunityRunQuery.refetch()}
                runs={opportunityRuns}
              />
            </>
          )}
        </section>
      </OpsShell>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: "/ops/debugging/emails",
    permanent: false,
  },
});

export default function OpsDebuggingRedirectPage() {
  return null;
}
