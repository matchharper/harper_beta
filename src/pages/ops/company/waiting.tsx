import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { useOpsCompanyWaiting } from "@/hooks/ops/useOpsCompany";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OpsCompanyWaitingItem,
  OpsCompanyWaitingSource,
} from "@/lib/ops/company";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import { useAuthStore } from "@/store/useAuthStore";
import { ExternalLink, LoaderCircle, RefreshCw, Search } from "lucide-react";
import Head from "next/head";
import { useMemo, useState } from "react";

type SourceFilter = "all" | OpsCompanyWaitingSource;

const SOURCE_OPTIONS: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "/company", label: "/company" },
  { id: "/test_company2", label: "/test_company2" },
];

function StatCard({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: number;
}) {
  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-4")}>
      <div className={opsTheme.eyebrow}>{label}</div>
      <div className="mt-3 font-hedvig text-[2.1rem] leading-none tracking-[-0.07em] text-neutral-primary">
        {value}
      </div>
      <div className="mt-2 text-sm text-neutral-muted">{hint}</div>
    </div>
  );
}

function WaitingStatusBadge({ status }: { status: string }) {
  const label = status === "pending" ? "대기" : status;
  return (
    <span
      className={status === "pending" ? opsTheme.badgeStrong : opsTheme.badge}
    >
      {label}
    </span>
  );
}

function WaitingItemCard({ item }: { item: OpsCompanyWaitingItem }) {
  return (
    <article className={cx(opsTheme.panelSoft, "px-4 py-4 md:px-5")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <WaitingStatusBadge status={item.status} />
            <a
              href={item.sourcePage}
              target="_blank"
              rel="noreferrer"
              className={cx(opsTheme.badge, "gap-1 hover:bg-bg-default")}
            >
              {item.sourcePage}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-xs text-neutral-muted">
              제출 {formatKstRelativeDateTime(item.createdAt)}
            </span>
          </div>

          <div className="mt-3 text-base font-semibold text-neutral-primary">
            {item.name || item.email}
          </div>
          <a
            href={`mailto:${item.email}`}
            className="mt-1 block w-fit break-all text-sm text-neutral-muted hover:text-neutral-primary"
          >
            {item.email}
          </a>

          <div className="mt-3 flex flex-wrap gap-2">
            {item.company && (
              <span className={opsTheme.badge}>{item.company}</span>
            )}
            {item.requestType && (
              <span className={opsTheme.badge}>{item.requestType}</span>
            )}
          </div>
        </div>

        <div className="w-full lg:max-w-[520px]">
          <div className={opsTheme.eyebrow}>채용 목표 / 문의 내용</div>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-primary">
            {item.hiringNeed || "내용 없음"}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function OpsCompanyWaitingPage() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const waitingQuery = useOpsCompanyWaiting(canFetchInternal);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (waitingQuery.data?.items ?? []).filter((item) => {
      if (isEmailExcludedByOpsInternalTerms(item.email, emailExclusionTerms)) {
        return false;
      }
      if (sourceFilter !== "all" && item.sourcePage !== sourceFilter) {
        return false;
      }
      if (!normalizedSearch) return true;

      return [
        item.name,
        item.email,
        item.company,
        item.requestType,
        item.hiringNeed,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(normalizedSearch)
        );
    });
  }, [emailExclusionTerms, search, sourceFilter, waitingQuery.data?.items]);

  const counts = waitingQuery.data?.counts;

  return (
    <>
      <Head>
        <title>Company Waiting · Harper Ops</title>
        <meta
          name="description"
          content="Company landing contact sales submissions"
        />
      </Head>

      <OpsShell
        compactHeader
        title="Company Waiting"
        actions={
          <BareButton
            type="button"
            onClick={() => void waitingQuery.refetch()}
            disabled={waitingQuery.isFetching}
            className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
          >
            {waitingQuery.isFetching ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            새로고침
          </BareButton>
        }
      >
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="전체 제출"
              value={counts?.total ?? 0}
              hint="두 회사 페이지 제출 전체"
            />
            <StatCard
              label="대기"
              value={counts?.pending ?? 0}
              hint="현재 pending 상태"
            />
            <StatCard
              label="/company"
              value={counts?.company ?? 0}
              hint="메인 회사 페이지 제출"
            />
            <StatCard
              label="/test_company2"
              value={counts?.testCompany2 ?? 0}
              hint="테스트 회사 페이지 제출"
            />
          </div>

          <div className={cx(opsTheme.panel, "p-5")}>
            <div>
              <div className={opsTheme.titleSm}>상담 신청 내역</div>
              <p className="mt-2 text-sm text-neutral-muted">
                `/company`와 `/test_company2`에서 제출된 이름, 이메일, 회사,
                채용 목표를 최신순으로 보여줍니다.
              </p>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                <UiInput
                  unstyled
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={cx(opsTheme.input, "pl-10")}
                  placeholder="이름, 이메일, 회사, 채용 목표 검색"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((option) => {
                  const active = sourceFilter === option.id;
                  return (
                    <BareButton
                      key={option.id}
                      type="button"
                      onClick={() => setSourceFilter(option.id)}
                      className={cx(
                        "rounded-md px-3 py-2 text-sm transition",
                        active
                          ? "bg-black text-neutral-00"
                          : "bg-bg-default/60 text-neutral-primary hover:bg-bg-default/80"
                      )}
                    >
                      {option.label}
                    </BareButton>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 text-sm text-neutral-muted">
              현재 {filteredItems.length}건 표시 중
            </div>

            <div className="mt-4 space-y-3">
              {waitingQuery.isLoading ? (
                <div className="flex min-h-[240px] items-center justify-center">
                  <LoaderCircle className="h-6 w-6 animate-spin text-neutral-muted" />
                </div>
              ) : waitingQuery.error ? (
                <div className={opsTheme.errorNotice}>
                  {waitingQuery.error instanceof Error
                    ? waitingQuery.error.message
                    : "상담 신청 목록을 불러오지 못했습니다."}
                </div>
              ) : filteredItems.length === 0 ? (
                <div
                  className={cx(
                    opsTheme.panelSoft,
                    "px-4 py-8 text-center text-sm text-neutral-muted"
                  )}
                >
                  조건에 맞는 상담 신청이 없습니다.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <WaitingItemCard key={item.email} item={item} />
                ))
              )}
            </div>
          </div>
        </section>
      </OpsShell>
    </>
  );
}
