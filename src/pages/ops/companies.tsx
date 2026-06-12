import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import {
  useOpsCompanies,
  useUpdateOpsCompanyTestScore,
} from "@/hooks/useOpsCompanies";
import { isInternalEmail } from "@/lib/internalAccess";
import type {
  OpsCompaniesQualityLabel,
  OpsCompanyWorkspaceScoreRecord,
} from "@/lib/opsCompanies";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AlertCircle,
  Building2,
  ChevronDown,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Head from "next/head";
import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";

function formatScore(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function CompanyLogo({
  companyName,
  logoUrl,
}: {
  companyName: string;
  logoUrl: string | null;
}) {
  const fallback = companyName.trim().slice(0, 1).toUpperCase() || "C";

  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-bg-weak bg-contain bg-center bg-no-repeat text-xs font-semibold text-neutral-primary"
      style={logoUrl ? { backgroundImage: `url(${logoUrl})` } : undefined}
      aria-hidden="true"
    >
      {logoUrl ? null : fallback}
    </div>
  );
}

function QualityPill({ value }: { value: OpsCompaniesQualityLabel | null }) {
  if (value === null) {
    return <span className="text-sm text-neutral-soft">-</span>;
  }

  const tone =
    value === 2
      ? "bg-positive-faded text-positive"
      : value === 1
        ? "bg-info-faded text-info"
        : "bg-critical-faded text-critical";

  return (
    <span
      className={cx(
        "inline-flex h-6 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold",
        tone
      )}
    >
      {value}
    </span>
  );
}

function ScoreControl({
  company,
  disabled,
  onChange,
}: {
  company: OpsCompanyWorkspaceScoreRecord;
  disabled: boolean;
  onChange: (company: OpsCompanyWorkspaceScoreRecord, delta: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <BareButton
        type="button"
        onClick={() => onChange(company, -1)}
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-default/70 text-neutral-primary transition hover:bg-bg-default disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`${company.companyName} test_score 내리기`}
      >
        <Minus className="h-3.5 w-3.5" />
      </BareButton>
      <span className="inline-flex h-7 min-w-12 items-center justify-center rounded-md bg-black px-2 text-sm font-semibold tabular-nums text-neutral-00">
        {disabled ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          formatScore(company.testScore)
        )}
      </span>
      <BareButton
        type="button"
        onClick={() => onChange(company, 1)}
        disabled={disabled}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-default/70 text-neutral-primary transition hover:bg-bg-default disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={`${company.companyName} test_score 올리기`}
      >
        <Plus className="h-3.5 w-3.5" />
      </BareButton>
    </div>
  );
}

export default function OpsCompaniesPage() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [updatingIds, setUpdatingIds] = useState(() => new Set<string>());

  const companiesQuery = useOpsCompanies({
    enabled: canFetchInternal,
    query: appliedQuery,
  });
  const updateTestScore = useUpdateOpsCompanyTestScore();

  const companies = useMemo(
    () => companiesQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [companiesQuery.data?.pages]
  );
  const totalCount = companiesQuery.data?.pages[0]?.totalCount ?? null;
  const errorMessage =
    companiesQuery.error instanceof Error ? companiesQuery.error.message : null;

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAppliedQuery(query.trim());
    },
    [query]
  );

  const handleScoreChange = useCallback(
    async (company: OpsCompanyWorkspaceScoreRecord, delta: number) => {
      const workspaceId = company.companyWorkspaceId;
      if (updatingIds.has(workspaceId)) return;

      setUpdatingIds((current) => new Set(current).add(workspaceId));

      try {
        await updateTestScore.mutateAsync({
          testScore: company.testScore + delta,
          workspaceId,
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "test_score 업데이트에 실패했습니다.",
          variant: "error",
        });
      } finally {
        setUpdatingIds((current) => {
          const next = new Set(current);
          next.delete(workspaceId);
          return next;
        });
      }
    },
    [updateTestScore, updatingIds]
  );

  return (
    <>
      <Head>
        <title>Companies | Harper Ops</title>
        <meta name="description" content="Harper internal company scoring" />
      </Head>

      <OpsShell compactHeader title="Companies">
        <section className={cx(opsTheme.panel, "p-4")}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <form
              className="grid gap-2 sm:grid-cols-[minmax(260px,420px)_auto]"
              onSubmit={handleSearchSubmit}
            >
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
                <UiInput
                  unstyled
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="회사명 검색"
                  className={cx(opsTheme.input, "pl-9")}
                />
              </div>
              <BareButton
                type="submit"
                className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
              >
                <Search className="h-4 w-4" />
                검색
              </BareButton>
            </form>

            <div className="flex flex-wrap items-center gap-2">
              <span className={opsTheme.badge}>test_score not null</span>
              <span className={opsTheme.badge}>
                {companies.length}
                {totalCount === null ? "" : ` / ${totalCount}`} rows
              </span>
              <BareButton
                type="button"
                onClick={() => void companiesQuery.refetch()}
                disabled={companiesQuery.isFetching}
                className={cx(opsTheme.buttonSecondary, "h-9 px-3")}
              >
                <RefreshCw
                  className={cx(
                    "h-4 w-4",
                    companiesQuery.isFetching ? "animate-spin" : ""
                  )}
                />
                새로고침
              </BareButton>
            </div>
          </div>
        </section>

        {errorMessage ? (
          <div className={cx(opsTheme.errorNotice, "flex items-start gap-2")}>
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>회사 목록을 불러오지 못했습니다: {errorMessage}</span>
          </div>
        ) : null}

        <section className={cx(opsTheme.panel, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[42%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="h-10 border-b border-neutral-1000-a05 text-left">
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    Company
                  </th>
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    Roles
                  </th>
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    Test Score
                  </th>
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    Human
                  </th>
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    LLM
                  </th>
                  <th className="px-3 text-[11px] font-medium tracking-[0.14em] text-neutral-muted">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className={opsTheme.divider}>
                {companiesQuery.isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-28 px-3 text-center text-sm text-neutral-muted"
                    >
                      <span className="inline-flex items-center gap-2">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        불러오는 중
                      </span>
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="h-28 px-3 text-center text-sm text-neutral-muted"
                    >
                      조건에 맞는 회사가 없습니다.
                    </td>
                  </tr>
                ) : (
                  companies.map((company) => {
                    const updating = updatingIds.has(
                      company.companyWorkspaceId
                    );

                    return (
                      <tr
                        key={company.companyWorkspaceId}
                        className="h-11 border-b border-neutral-1000-a05 last:border-b-0"
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <CompanyLogo
                              companyName={company.companyName}
                              logoUrl={company.logoUrl}
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-neutral-primary">
                                {company.companyName}
                              </div>
                              <div className="truncate text-[11px] text-neutral-soft">
                                {company.companyWorkspaceId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="text-sm tabular-nums text-neutral-primary">
                            {company.currentRoleCount}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <ScoreControl
                            company={company}
                            disabled={updating}
                            onChange={handleScoreChange}
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <QualityPill value={company.humanQualityLabel} />
                        </td>
                        <td className="px-3 py-1.5">
                          <QualityPill value={company.llmQualityLabel} />
                        </td>
                        <td className="px-3 py-1.5 text-xs text-neutral-muted">
                          {formatDate(company.updatedAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {companiesQuery.hasNextPage ? (
          <BareButton
            type="button"
            onClick={() => void companiesQuery.fetchNextPage()}
            disabled={companiesQuery.isFetchingNextPage}
            className={cx(opsTheme.buttonSecondary, "mx-auto h-10 px-4")}
          >
            {companiesQuery.isFetchingNextPage ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            더보기
          </BareButton>
        ) : null}

        {!companiesQuery.isLoading && !errorMessage && companies.length > 0 ? (
          <div className="flex items-center gap-2 px-4 text-xs text-neutral-muted">
            <Building2 className="h-3.5 w-3.5" />
            test_score가 있는 company_workspace만 표시됩니다.
          </div>
        ) : null}
      </OpsShell>
    </>
  );
}
