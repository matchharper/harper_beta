import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { extractRequestAccessToken } from "@/lib/requestAccess/client";
import { useOpsRequestAccessQueue } from "@/hooks/useOpsRequestAccess";
import type { RequestAccessReviewStatus } from "@/lib/requestAccess/types";
import {
  ArrowRight,
  CheckCheck,
  ClipboardPenLine,
  ExternalLink,
  KeyRound,
  Link2,
  LoaderCircle,
  MailCheck,
  Search,
} from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useCallback, useMemo, useState } from "react";

const STATUS_OPTIONS: Array<{
  id: "all" | RequestAccessReviewStatus;
  label: string;
}> = [
  { id: "all", label: "전체" },
  { id: "pending", label: "검토 대기" },
  { id: "approved", label: "승인 메일 발송" },
  { id: "already_granted", label: "활성화 완료" },
];

function formatStatusLabel(status: RequestAccessReviewStatus) {
  if (status === "pending") return "검토 대기";
  if (status === "approved") return "승인 메일 발송";
  return "활성화 완료";
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

export default function OpsRequestAccessPage() {
  const router = useRouter();
  const [inputValue, setInputValue] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestAccessReviewStatus>(
    "pending"
  );

  const queueQuery = useOpsRequestAccessQueue();
  const queue = queueQuery.data;

  const parsedToken = useMemo(
    () => extractRequestAccessToken(inputValue),
    [inputValue]
  );

  const handleOpenReview = useCallback(() => {
    if (!parsedToken) return;

    void router.push({
      pathname: "/ops/request-access/review",
      query: { request: parsedToken },
    });
  }, [parsedToken, router]);

  const handleOpenQueueItem = useCallback(
    (request: string) => {
      void router.push({
        pathname: "/ops/request-access/review",
        query: { request },
      });
    },
    [router]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return (queue?.items ?? []).filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        item.email,
        item.name,
        item.company,
        item.role,
        item.hiringNeed,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedQuery)
        );
    });
  }, [queue?.items, search, statusFilter]);

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
                  <div className={opsTheme.eyebrow}>Review Queue</div>
                  <div className={cx(opsTheme.titleSm, "mt-1")}>
                    검토할 신청 내역
                  </div>
                  <div className="mt-2 font-geist text-sm text-beige900/65">
                    pending 항목을 먼저 보여주고, 승인됨/활성화됨 상태도 함께 볼 수 있습니다.
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
                  <div className={cx(opsTheme.panelSoft, "px-4 py-6 font-geist text-sm text-beige900/60")}>
                    조건에 맞는 request access 신청이 없습니다.
                  </div>
                ) : (
                  filteredItems.map((item) => (
                    <div key={item.email} className={cx(opsTheme.panelSoft, "px-4 py-4")}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <QueueBadge status={item.status} />
                            <div className="font-geist text-xs text-beige900/55">
                              제출 {formatDateTime(item.createdAt)}
                            </div>
                          </div>

                          <div className="mt-3 font-geist text-base font-semibold text-beige900">
                            {item.name || item.email}
                          </div>
                          <div className="mt-1 break-all font-geist text-sm text-beige900/65">
                            {item.email}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {item.company ? (
                              <div className={opsTheme.badge}>{item.company}</div>
                            ) : null}
                            {item.role ? (
                              <div className={opsTheme.badge}>{item.role}</div>
                            ) : null}
                            {item.hiringNeed ? (
                              <div className={opsTheme.badge}>{item.hiringNeed}</div>
                            ) : null}
                          </div>

                          <div className="mt-4 grid gap-2 font-geist text-sm text-beige900/60 md:grid-cols-2">
                            <div>
                              승인 메일 발송: {formatDateTime(item.approvalEmailSentAt)}
                            </div>
                            <div>활성화 완료: {formatDateTime(item.accessGrantedAt)}</div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenQueueItem(item.requestToken)}
                            className={cx(opsTheme.buttonPrimary, "h-10 px-3")}
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
                            <ExternalLink className="h-4 w-4" />
                            새 탭
                          </a>
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
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={opsTheme.titleSm}>Open Review Link</div>
                    <div className="mt-1 font-geist text-sm text-beige900/65">
                      review URL 전체를 붙여넣어도 되고, `request` 토큰만 넣어도 됩니다.
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <textarea
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    className={cx(opsTheme.textarea, "min-h-[132px]")}
                    placeholder="https://.../ops/request-access/review?request=..."
                    spellCheck={false}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenReview}
                    disabled={!parsedToken}
                    className={cx(opsTheme.buttonPrimary, "h-11")}
                  >
                    Review 열기
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  {parsedToken ? (
                    <div className={cx(opsTheme.panelSoft, "px-3 py-2 font-geist text-xs text-beige900/60")}>
                      token detected
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={cx(opsTheme.panel, "p-5")}>
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-beige500/70 p-3 text-beige900">
                    <ClipboardPenLine className="h-5 w-5" />
                  </div>
                  <div>
                    <div className={opsTheme.titleSm}>Current Flow</div>
                    <div className="mt-1 font-geist text-sm text-beige900/65">
                      request access 승인 메일 리뷰는 내부 도메인 로그인 이후에만 열립니다.
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3 font-geist text-sm leading-6 text-beige900/70">
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    1. Queue에서 pending 신청을 확인합니다.
                  </div>
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    2. `Review 열기`로 draft를 열고 sender, subject, body를 검토합니다.
                  </div>
                  <div className={cx(opsTheme.panelSoft, "px-4 py-3")}>
                    3. 메일을 보내면 상태가 승인 메일 발송으로 바뀌고, 이후 activation 여부도 여기서 추적할 수 있습니다.
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
                  <div className={cx(opsTheme.panelSoft, "flex items-center gap-3 px-4 py-3")}>
                    <KeyRound className="h-4 w-4 text-beige900/60" />
                    <div className="font-geist text-sm text-beige900/70">
                      검토 대기: 아직 승인 메일을 보내지 않은 신청
                    </div>
                  </div>
                  <div className={cx(opsTheme.panelSoft, "flex items-center gap-3 px-4 py-3")}>
                    <MailCheck className="h-4 w-4 text-beige900/60" />
                    <div className="font-geist text-sm text-beige900/70">
                      승인 메일 발송: review는 끝났지만 사용자가 아직 activation 전
                    </div>
                  </div>
                  <div className={cx(opsTheme.panelSoft, "flex items-center gap-3 px-4 py-3")}>
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
