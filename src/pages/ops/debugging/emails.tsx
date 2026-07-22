import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Copy,
  ExternalLink,
  Inbox,
  LoaderCircle,
  Mail,
  MailCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import { OpsDateRangeFilter } from "@/components/ops/OpsDateRangeFilter";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  compactMailAddress,
  mailStatusClass,
  mailStatusLabel,
  mailTypeLabel,
} from "@/components/ops/career/utils";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import {
  Select as UiSelect,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOpsDebugEmails } from "@/hooks/ops/useOpsDebugEmails";
import type {
  OpsDebugEmailDirection,
  OpsDebugEmailItem,
  OpsDebugEmailScope,
} from "@/lib/ops/debugEmailServer";
import {
  DebuggingPageShell,
  FETCH_LIMIT,
  FieldRow,
  SourceLimitNotice,
  StatTile,
  formatAbsoluteKst,
  useCanFetchInternal,
  useDebugCopyToClipboard,
} from "@/components/ops/debugging/shared";

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

export default function OpsDebuggingEmailsPage() {
  const canFetchInternal = useCanFetchInternal();
  const copyToClipboard = useDebugCopyToClipboard();
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchDraft.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const query = useOpsDebugEmails(FETCH_LIMIT, canFetchInternal, {
    direction,
    mailType: scope === "all" ? mailType : "",
    occurredFrom,
    occurredTo,
    query: searchQuery,
    scope,
    status,
  });

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

  return (
    <DebuggingPageShell
      tab="emails"
      filters={
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
            <label htmlFor="ops-debug-email-search" className={opsTheme.label}>
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

          <OpsDateRangeFilter
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
              items={DIRECTION_OPTIONS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={direction}
              onValueChange={(value) =>
                setDirection((value ?? "all") as OpsDebugEmailDirection)
              }
            >
              <SelectTrigger
                id="ops-debug-email-direction"
                className={cx(opsTheme.input, "mt-2 h-10 min-w-[116px]")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {DIRECTION_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </UiSelect>
          </div>

          <div>
            <label htmlFor="ops-debug-email-status" className={opsTheme.label}>
              상태
            </label>
            <UiSelect
              items={STATUS_OPTIONS.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={status}
              onValueChange={(value) => setStatus(value ?? "")}
            >
              <SelectTrigger
                id="ops-debug-email-status"
                className={cx(opsTheme.input, "mt-2 h-10 min-w-[116px]")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectGroup>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
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
                items={MAIL_TYPE_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.id,
                }))}
                value={
                  scope === "all" ? mailType : "opportunity_recommendation"
                }
                onValueChange={(value) => setMailType(value ?? "")}
                disabled={scope === "internal_opportunity"}
              >
                <SelectTrigger
                  id="ops-debug-email-mail-type"
                  className={cx(opsTheme.input, "mt-2 h-10")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {MAIL_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </UiSelect>
            </div>
            <BareButton
              type="button"
              onClick={resetFilters}
              className={cx(opsTheme.buttonSecondary, "h-10 px-3 text-xs")}
            >
              초기화
            </BareButton>
          </div>
        </div>
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Filtered" value={stats?.totalCount ?? "-"} />
        <StatTile
          label="Internal"
          value={stats?.internalOpportunityCount ?? "-"}
        />
        <StatTile label="Outbound" value={stats?.outboundCount ?? "-"} />
        <StatTile label="Inbound" value={stats?.inboundCount ?? "-"} />
        <StatTile label="Failed" value={stats?.failedCount ?? "-"} />
      </div>

      {stats?.sourceLimitReached ? <SourceLimitNotice /> : null}

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
    </DebuggingPageShell>
  );
}
