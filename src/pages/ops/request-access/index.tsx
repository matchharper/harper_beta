import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  useBulkSendOpsRequestAccessApproval,
  useOpsRequestAccessQueue,
} from "@/hooks/useOpsRequestAccess";
import {
  buildBulkRequestAccessApprovedEmailTemplates,
  REQUEST_ACCESS_APPROVAL_TEMPLATE_VARIABLES,
} from "@/lib/requestAccess/emailTemplate";
import type {
  RequestAccessApprovalEmailLocale,
  RequestAccessReviewQueueItem,
  RequestAccessReviewStatus,
} from "@/lib/requestAccess/types";
import {
  ArrowRight,
  CheckCheck,
  ClipboardPenLine,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  MailCheck,
  RotateCcw,
  Search,
  Send,
  Users,
} from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const STATUS_OPTIONS: Array<{
  id: "all" | RequestAccessReviewStatus;
  label: string;
}> = [
  { id: "all", label: "전체" },
  { id: "pending", label: "검토 대기" },
  { id: "approved", label: "승인 메일 발송" },
  { id: "already_granted", label: "활성화 완료" },
];

const BULK_DEFAULT_TEMPLATES = buildBulkRequestAccessApprovedEmailTemplates();

function formatStatusLabel(status: RequestAccessReviewStatus) {
  if (status === "pending") return "검토 대기";
  if (status === "approved") return "승인 메일 발송";
  return "활성화 완료";
}

function formatLocaleLabel(locale: RequestAccessApprovalEmailLocale) {
  return locale === "ko" ? "한국어" : "English";
}

function isBulkSelectable(status: RequestAccessReviewStatus) {
  return status !== "already_granted";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function QueueBadge({ status }: { status: RequestAccessReviewStatus }) {
  const className =
    status === "pending"
      ? opsTheme.badgeStrong
      : status === "approved"
        ? opsTheme.badge
        : cx(opsTheme.badge, "bg-white/70");

  return <div className={className}>{formatStatusLabel(status)}</div>;
}

function StatCard({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-4")}>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-3 font-halant text-[2.1rem] leading-none tracking-[-0.07em] text-beige900">
        {value}
      </div>
      <div className="mt-2 font-geist text-sm text-beige900/60">{hint}</div>
    </div>
  );
}

function buildBulkNotice(counts: {
  alreadyGranted: number;
  approved: number;
  failed: number;
}) {
  const parts = [];

  if (counts.approved > 0) {
    parts.push(`${counts.approved}건 발송`);
  }
  if (counts.alreadyGranted > 0) {
    parts.push(`${counts.alreadyGranted}건 이미 활성화`);
  }
  if (counts.failed > 0) {
    parts.push(`${counts.failed}건 실패`);
  }

  return parts.join(", ") || "처리된 항목이 없습니다.";
}

function formatSelectedRecipients(items: RequestAccessReviewQueueItem[]) {
  if (items.length === 0) {
    return "선택된 수신자가 없습니다.";
  }

  const preview = items
    .slice(0, 4)
    .map((item) => item.name || item.email)
    .join(", ");

  if (items.length <= 4) {
    return preview;
  }

  return `${preview} 외 ${items.length - 4}명`;
}

export default function OpsRequestAccessPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | RequestAccessReviewStatus
  >("pending");
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [bulkLocale, setBulkLocale] =
    useState<RequestAccessApprovalEmailLocale>("en");
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkSubject, setBulkSubject] = useState(
    BULK_DEFAULT_TEMPLATES.en.subject
  );
  const [bulkHtml, setBulkHtml] = useState(BULK_DEFAULT_TEMPLATES.en.html);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkError, setBulkError] = useState("");

  const queueQuery = useOpsRequestAccessQueue();
  const bulkSendMutation = useBulkSendOpsRequestAccessApproval();
  const queue = queueQuery.data;
  const selectedRequestSet = useMemo(
    () => new Set(selectedRequests),
    [selectedRequests]
  );

  const handleOpenQueueItem = useCallback(
    (request: string) => {
      void router.push({
        pathname: "/ops/request-access/review",
        query: { request },
      });
    },
    [router]
  );

  useEffect(() => {
    const validRequests = new Set(
      (queue?.items ?? []).map((item) => item.requestToken)
    );

    setSelectedRequests((current) =>
      current.filter((request) => validRequests.has(request))
    );
  }, [queue?.items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return (queue?.items ?? []).filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [item.email, item.name, item.company, item.role, item.hiringNeed]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [queue?.items, search, statusFilter]);

  const selectableFilteredItems = useMemo(
    () => filteredItems.filter((item) => isBulkSelectable(item.status)),
    [filteredItems]
  );

  const selectedItems = useMemo(
    () =>
      (queue?.items ?? []).filter((item) =>
        selectedRequestSet.has(item.requestToken)
      ),
    [queue?.items, selectedRequestSet]
  );

  const selectableSelectedItems = useMemo(
    () => selectedItems.filter((item) => isBulkSelectable(item.status)),
    [selectedItems]
  );

  const allFilteredSelected =
    selectableFilteredItems.length > 0 &&
    selectableFilteredItems.every((item) =>
      selectedRequestSet.has(item.requestToken)
    );

  const toggleSelection = useCallback((requestToken: string) => {
    setSelectedRequests((current) =>
      current.includes(requestToken)
        ? current.filter((value) => value !== requestToken)
        : [...current, requestToken]
    );
    setBulkError("");
    setBulkNotice("");
  }, []);

  const handleToggleSelectFiltered = useCallback(() => {
    setSelectedRequests((current) => {
      const next = new Set(current);

      if (allFilteredSelected) {
        selectableFilteredItems.forEach((item) =>
          next.delete(item.requestToken)
        );
      } else {
        selectableFilteredItems.forEach((item) => next.add(item.requestToken));
      }

      return Array.from(next);
    });
    setBulkError("");
    setBulkNotice("");
  }, [allFilteredSelected, selectableFilteredItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedRequests([]);
    setBulkError("");
    setBulkNotice("");
  }, []);

  const applyBulkTemplate = useCallback(
    (locale: RequestAccessApprovalEmailLocale) => {
      const template = BULK_DEFAULT_TEMPLATES[locale];
      setBulkLocale(locale);
      setBulkSubject(template.subject);
      setBulkHtml(template.html);
      setBulkError("");
      setBulkNotice(`${formatLocaleLabel(locale)} 기본 템플릿을 적용했습니다.`);
    },
    []
  );

  const handleResetBulkTemplate = useCallback(() => {
    setBulkFrom("");
    applyBulkTemplate(bulkLocale);
  }, [applyBulkTemplate, bulkLocale]);

  const handleBulkSend = useCallback(async () => {
    if (selectableSelectedItems.length === 0 || bulkSendMutation.isPending) {
      return;
    }

    try {
      setBulkError("");
      setBulkNotice("");

      const response = await bulkSendMutation.mutateAsync({
        requests: selectableSelectedItems.map((item) => item.requestToken),
        locale: bulkLocale,
        from: bulkFrom,
        subject: bulkSubject,
        html: bulkHtml,
      });

      const failedEmails = new Set(
        response.results
          .filter((result) => result.status === "failed")
          .map((result) => result.email.toLowerCase())
      );
      const failureLines = response.results
        .filter((result) => result.status === "failed")
        .map((result) => `${result.email}: ${result.error || "발송 실패"}`);

      setSelectedRequests(
        selectableSelectedItems
          .filter((item) => failedEmails.has(item.email.toLowerCase()))
          .map((item) => item.requestToken)
      );
      setBulkNotice(buildBulkNotice(response.counts));
      setBulkError(failureLines.join("\n"));
    } catch (error) {
      setBulkError(
        error instanceof Error
          ? error.message
          : "일괄 승인 메일 발송에 실패했습니다."
      );
    }
  }, [
    bulkFrom,
    bulkHtml,
    bulkLocale,
    bulkSendMutation,
    bulkSubject,
    selectableSelectedItems,
  ]);

  const isBulkSendDisabled =
    bulkSendMutation.isPending ||
    selectableSelectedItems.length === 0 ||
    !bulkSubject.trim() ||
    !bulkHtml.trim();

  return (
    <>
      <Head>
        <title>Request Access Ops</title>
        <meta
          name="description"
          content="Internal request access tools for Harper"
        />
      </Head>

      <OpsShell
        title="Request Access"
        description="request access 신청 내역을 여기서 바로 훑고, 검토가 필요한 건 review 화면으로 바로 넘길 수 있습니다."
      >
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="전체 신청"
              value={String(queue?.counts.total ?? 0)}
              hint="request access 제출 전체"
            />
            <StatCard
              label="검토 대기"
              value={String(queue?.counts.pending ?? 0)}
              hint="바로 review 해야 하는 항목"
            />
            <StatCard
              label="승인 메일 발송"
              value={String(queue?.counts.approved ?? 0)}
              hint="메일은 갔지만 아직 활성화 전"
            />
            <StatCard
              label="활성화 완료"
              value={String(queue?.counts.alreadyGranted ?? 0)}
              hint="이미 접근 권한 부여 완료"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <div className={cx(opsTheme.panel, "p-5")}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className={cx(opsTheme.titleSm, "mt-1")}>
                    검토할 신청 내역
                  </div>
                  <div className="mt-2 font-geist text-sm text-beige900/65">
                    pending 항목을 먼저 보여주고, 승인됨/활성화됨 상태도 함께 볼
                    수 있습니다.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void queueQuery.refetch()}
                  disabled={queueQuery.isFetching}
                  className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                >
                  {queueQuery.isFetching ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  새로고침
                </button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/40" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className={cx(opsTheme.input, "pl-10")}
                    placeholder="이메일, 이름, 회사, 역할 검색"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((option) => {
                    const active = statusFilter === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setStatusFilter(option.id)}
                        className={cx(
                          "rounded-md px-3 py-2 font-geist text-sm transition",
                          active
                            ? "bg-beige900 text-beige100"
                            : "bg-white/60 text-beige900 hover:bg-white/80"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={cx(opsTheme.panelSoft, "mt-5 p-4 md:p-5")}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-beige900/60" />
                      <div className={opsTheme.titleSm}>Bulk Send</div>
                    </div>
                    <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
                      여러 명을 체크한 뒤 같은 제목/본문으로 동시에 발송합니다.{" "}
                      <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[12px] text-beige900">
                        {"{{activationUrl}}"}
                      </code>{" "}
                      같은 변수는 각 수신자 값으로 자동 치환됩니다.
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleToggleSelectFiltered}
                      disabled={selectableFilteredItems.length === 0}
                      className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                    >
                      {allFilteredSelected
                        ? "현재 필터 선택 해제"
                        : "현재 필터 전체 선택"}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      disabled={selectedItems.length === 0}
                      className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                    >
                      선택 비우기
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="font-geist text-sm text-beige900/70">
                    선택 {selectedItems.length}건
                    <span className="ml-2 text-beige900/50">
                      {formatSelectedRecipients(selectedItems)}
                    </span>
                  </div>
                  <div className="font-geist text-xs text-beige900/50">
                    활성화 완료 상태는 bulk send 대상에서 제외됩니다.
                  </div>
                </div>

                {bulkError ? (
                  <div
                    className={cx(
                      opsTheme.errorNotice,
                      "mt-4 whitespace-pre-wrap"
                    )}
                  >
                    {bulkError}
                  </div>
                ) : null}
                {bulkNotice ? (
                  <div className={cx(opsTheme.successNotice, "mt-4")}>
                    {bulkNotice}
                  </div>
                ) : null}

                <div className="mt-5 space-y-4">
                  <div>
                    <label className={opsTheme.label}>Language</label>
                    <div className="mt-2 inline-flex rounded-md border border-beige900/10 bg-white/80 p-1">
                      {(["en", "ko"] as RequestAccessApprovalEmailLocale[]).map(
                        (option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => applyBulkTemplate(option)}
                            className={cx(
                              "rounded-md px-3 py-2 font-geist text-sm transition",
                              bulkLocale === option
                                ? "bg-beige900 text-beige100"
                                : "text-beige900/60 hover:bg-beige500/35 hover:text-beige900"
                            )}
                          >
                            {formatLocaleLabel(option)}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={opsTheme.label}>From</label>
                    <input
                      type="text"
                      value={bulkFrom}
                      onChange={(event) => setBulkFrom(event.target.value)}
                      className={cx(opsTheme.input, "mt-2")}
                      placeholder="비워두면 기본 sender 사용"
                    />
                  </div>

                  <div>
                    <label className={opsTheme.label}>Subject</label>
                    <input
                      type="text"
                      value={bulkSubject}
                      onChange={(event) => setBulkSubject(event.target.value)}
                      className={cx(opsTheme.input, "mt-2")}
                      placeholder="메일 제목"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <label className={opsTheme.label}>HTML Body</label>
                      <button
                        type="button"
                        onClick={handleResetBulkTemplate}
                        disabled={bulkSendMutation.isPending}
                        className={cx(opsTheme.buttonSoft, "h-9 px-3 text-xs")}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset Default
                      </button>
                    </div>
                    <textarea
                      value={bulkHtml}
                      onChange={(event) => setBulkHtml(event.target.value)}
                      className={cx(
                        opsTheme.textarea,
                        "mt-2 min-h-[260px] resize-y text-[13px]"
                      )}
                      placeholder="<div>...</div>"
                      spellCheck={false}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      {REQUEST_ACCESS_APPROVAL_TEMPLATE_VARIABLES.map(
                        (variable) => (
                          <div
                            key={variable.key}
                            className={cx(
                              opsTheme.badge,
                              "bg-white/75 text-[11px]"
                            )}
                          >
                            {variable.placeholder}
                          </div>
                        )
                      )}
                    </div>
                    <p className="mt-2 font-geist text-xs leading-5 text-beige900/55">
                      최소한{" "}
                      <code className="rounded bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-beige900">
                        {"{{activationUrl}}"}
                      </code>
                      는 본문에 남겨두는 편이 안전합니다. 없으면 수신자가 승인
                      후 활성화를 진행할 링크를 받지 못합니다.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleBulkSend}
                      disabled={isBulkSendDisabled}
                      className={cx(opsTheme.buttonPrimary, "h-11 px-5")}
                    >
                      {bulkSendMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      선택 {selectableSelectedItems.length}명에게 발송
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 font-geist text-sm text-beige900/60">
                현재 {filteredItems.length}건 표시 중
              </div>

              <div className="mt-4 space-y-3">
                {queueQuery.isLoading ? (
                  <div className="flex min-h-[240px] items-center justify-center">
                    <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
                  </div>
                ) : queueQuery.error ? (
                  <div className={opsTheme.errorNotice}>
                    {queueQuery.error instanceof Error
                      ? queueQuery.error.message
                      : "request access 목록을 불러오지 못했습니다."}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div
                    className={cx(
                      opsTheme.panelSoft,
                      "px-4 py-6 font-geist text-sm text-beige900/60"
                    )}
                  >
                    조건에 맞는 request access 신청이 없습니다.
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <div
                      key={item.email}
                      className={cx(opsTheme.panelSoft, "px-4 py-4")}
                    >
                      <div className="flex gap-3">
                        <div className="pt-1">
                          <Checkbox
                            checked={selectedRequestSet.has(item.requestToken)}
                            onChange={() => {
                              if (!isBulkSelectable(item.status)) return;
                              toggleSelection(item.requestToken);
                            }}
                            disabled={!isBulkSelectable(item.status)}
                            aria-label={`${item.name || item.email} 선택`}
                            className="h-5 w-5 rounded-[4px] border-beige900/15 bg-white/80 data-[state=checked]:bg-beige900 data-[state=checked]:text-beige100"
                          />
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <QueueBadge status={item.status} />
                              <div className="font-geist text-xs text-beige900/55">
                                제출 {formatDateTime(item.createdAt)}
                              </div>
                              {!isBulkSelectable(item.status) ? (
                                <div className="font-geist text-xs text-beige900/45">
                                  bulk send 제외
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-3 font-geist text-base font-semibold text-beige900">
                              {item.name || item.email}
                            </div>
                            <div className="mt-1 break-all font-geist text-sm text-beige900/65">
                              {item.email}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {item.company ? (
                                <div className={opsTheme.badge}>
                                  {item.company}
                                </div>
                              ) : null}
                              {item.role ? (
                                <div className={opsTheme.badge}>
                                  {item.role}
                                </div>
                              ) : null}
                              {item.hiringNeed ? (
                                <div className={opsTheme.badge}>
                                  {item.hiringNeed}
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-4 grid gap-2 font-geist text-sm text-beige900/60 md:grid-cols-2">
                              <div>
                                승인 메일 발송:{" "}
                                {formatDateTime(item.approvalEmailSentAt)}
                              </div>
                              <div>
                                활성화 완료:{" "}
                                {formatDateTime(item.accessGrantedAt)}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenQueueItem(item.requestToken)
                              }
                              className={cx(
                                opsTheme.buttonPrimary,
                                "h-10 px-3"
                              )}
                            >
                              <KeyRound className="h-4 w-4" />
                              Review 열기
                            </button>
                            <a
                              href={item.reviewUrl}
                              target="_blank"
                              rel="noreferrer"
                              className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                            >
                              <ExternalLink className="h-4 w-4" />새 탭
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className={cx(opsTheme.panel, "p-5")}>
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-beige500/70 p-3 text-beige900">
                    <ClipboardPenLine className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={opsTheme.titleSm}>Current Flow</div>
                    <div className="mt-1 font-geist text-sm text-beige900/65">
                      request access 승인 메일 리뷰는 내부 도메인 로그인
                      이후에만 열립니다.
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 font-geist text-sm leading-6 text-beige900/70">
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    1. Queue에서 pending 신청을 확인합니다.
                  </div>
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    2. 여러 명에게 같은 메일을 보낼 땐 체크박스로 고른 뒤 bulk
                    send 폼에서 제목과 본문을 편집합니다.
                  </div>
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    3. 개인별로 다르게 손볼 필요가 있으면{" "}
                    <span className="font-mono text-[12px]">Review 열기</span>로
                    들어가 단건 draft를 수정해서 보냅니다.
                  </div>
                </div>
              </div>

              <div className={cx(opsTheme.panel, "p-5")}>
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-beige500/70 p-3 text-beige900">
                    <MailCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={opsTheme.titleSm}>What To Prioritize</div>
                    <div className="mt-1 font-geist text-sm text-beige900/65">
                      지금 바로 봐야 하는 건 pending 신청들입니다.
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div
                    className={cx(
                      opsTheme.panelSoft,
                      "flex items-center gap-3 px-4 py-3"
                    )}
                  >
                    <KeyRound className="h-4 w-4 text-beige900/60" />
                    <div className="font-geist text-sm text-beige900/70">
                      검토 대기: 아직 승인 메일을 보내지 않은 신청
                    </div>
                  </div>
                  <div
                    className={cx(
                      opsTheme.panelSoft,
                      "flex items-center gap-3 px-4 py-3"
                    )}
                  >
                    <MailCheck className="h-4 w-4 text-beige900/60" />
                    <div className="font-geist text-sm text-beige900/70">
                      승인 메일 발송: review는 끝났지만 사용자가 아직 activation
                      전
                    </div>
                  </div>
                  <div
                    className={cx(
                      opsTheme.panelSoft,
                      "flex items-center gap-3 px-4 py-3"
                    )}
                  >
                    <CheckCheck className="h-4 w-4 text-beige900/60" />
                    <div className="font-geist text-sm text-beige900/70">
                      활성화 완료: 이미 access grant까지 끝난 상태
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </OpsShell>
    </>
  );
}
