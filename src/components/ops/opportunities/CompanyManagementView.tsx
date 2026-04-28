import { cx, opsTheme } from "@/components/ops/theme";
import {
  OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS,
  type OpsCompanyManagementEmployeeCountRangeFilter,
} from "@/lib/opsOpportunityCompanyManagement";
import type { OpsCompanyManagementRecord } from "@/lib/opsOpportunity";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  Handshake,
  LoaderCircle,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { EmptyState, PanelHeader } from "./shared";

type CompanyManagementViewProps = {
  companies: OpsCompanyManagementRecord[];
  companyNameSearch: string;
  employeeCountRange: OpsCompanyManagementEmployeeCountRangeFilter;
  error: unknown;
  foundedYearMin: string;
  hasNextPage: boolean;
  hasCareerUrlOnly: boolean;
  investorsSearch: string;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isLoading: boolean;
  locationSearch: string;
  onCompanyNameSearchChange: (value: string) => void;
  onEmployeeCountRangeChange: (
    value: OpsCompanyManagementEmployeeCountRangeFilter
  ) => void;
  onFetchNextPage: () => void;
  onFoundedYearMinChange: (value: string) => void;
  onHasCareerUrlOnlyChange: (value: boolean) => void;
  onInvestorsSearchChange: (value: string) => void;
  onLocationSearchChange: (value: string) => void;
  onSearch: () => void;
  onScrapeOriginalChange: (
    company: OpsCompanyManagementRecord,
    nextValue: boolean
  ) => void;
  updatingScrapeOriginalIds: Set<string>;
};

const KO_NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

const normalizeExternalUrl = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

const formatEmployeeCountRange = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "-";
  const range = value as { end?: unknown; start?: unknown };
  const start =
    typeof range.start === "number"
      ? range.start
      : Number(String(range.start ?? "").replace(/,/g, ""));
  const end =
    typeof range.end === "number"
      ? range.end
      : Number(String(range.end ?? "").replace(/,/g, ""));

  if (Number.isFinite(start) && Number.isFinite(end) && end > 0) {
    return `${KO_NUMBER_FORMATTER.format(start)}-${KO_NUMBER_FORMATTER.format(end)}명`;
  }
  if (Number.isFinite(start) && start > 0) {
    return `${KO_NUMBER_FORMATTER.format(start)}명+`;
  }
  if (Number.isFinite(end) && end > 0) {
    return `~${KO_NUMBER_FORMATTER.format(end)}명`;
  }
  return "-";
};

function CompanyLogo({ company }: { company: OpsCompanyManagementRecord }) {
  if (!company.logoUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-beige900/10 bg-white/70 text-beige900/30">
        <Building2 className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-beige900/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={company.logoUrl}
        alt={`${company.companyName} logo`}
        className="h-full w-full object-contain"
        loading="lazy"
      />
    </div>
  );
}

function CompanyRow({
  company,
  onScrapeOriginalChange,
  updating,
}: {
  company: OpsCompanyManagementRecord;
  onScrapeOriginalChange: (
    company: OpsCompanyManagementRecord,
    nextValue: boolean
  ) => void;
  updating: boolean;
}) {
  const homepageUrl = normalizeExternalUrl(company.homepageUrl);

  return (
    <div
      className={cx(
        "grid min-w-[1180px] grid-cols-[56px_72px_190px_minmax(280px,1fr)_160px_180px_110px_140px] items-center gap-3 rounded-md border-2 px-3 py-3 transition",
        company.isScrapeOriginal
          ? "border-[#EA580C] bg-[#FFF7ED] shadow-[0_10px_26px_rgba(234,88,12,0.1)]"
          : "border-beige900/10 bg-white/65 hover:bg-white"
      )}
    >
      <div className="flex items-center justify-center">
        <label
          className={cx(
            "flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition hover:bg-beige900/10",
            "focus-within:bg-beige900/10 focus-within:ring-2 focus-within:ring-[#EA580C]/25",
            updating && "cursor-wait opacity-60"
          )}
          title="is_scrape_original"
        >
          <input
            type="checkbox"
            checked={company.isScrapeOriginal}
            disabled={updating}
            onChange={(event) =>
              onScrapeOriginalChange(company, event.target.checked)
            }
            aria-label={`${company.companyName} is_scrape_original`}
            className="h-7 w-7 cursor-pointer rounded border-2 border-beige900/25 accent-[#EA580C] transition hover:border-[#EA580C]/70 disabled:cursor-wait"
          />
        </label>
      </div>
      <CompanyLogo company={company} />
      <div className="min-w-0">
        {homepageUrl ? (
          <a
            href={homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={homepageUrl}
            className="inline-flex max-w-full items-center gap-1 truncate font-geist text-sm font-semibold text-beige900 transition hover:text-[#EA580C] hover:underline"
          >
            <span className="truncate">
              {company.companyName || company.companyDb?.name || "-"}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <div className="truncate font-geist text-sm font-semibold text-beige900">
            {company.companyName || company.companyDb?.name || "-"}
          </div>
        )}
        {company.companyDb?.name &&
        company.companyDb.name !== company.companyName ? (
          <div className="mt-1 truncate font-geist text-[11px] text-beige900/45">
            DB: {company.companyDb.name}
          </div>
        ) : null}
      </div>
      <div className="line-clamp-2 font-geist text-xs leading-5 text-beige900/60">
        {company.companyDescription || "-"}
      </div>
      <div className="font-geist text-xs font-medium text-beige900/70">
        {formatEmployeeCountRange(company.employeeCountRange)}
      </div>
      <div className="truncate font-geist text-xs text-beige900/60">
        {company.location || "-"}
      </div>
      <div className="font-geist text-xs text-beige900/60">
        {company.foundedYear && company.foundedYear > 0
          ? company.foundedYear
          : "-"}
      </div>
      <div className="font-geist text-sm font-semibold text-beige900">
        {KO_NUMBER_FORMATTER.format(company.recentJoinCount)}
      </div>
    </div>
  );
}

export default function CompanyManagementView({
  companies,
  companyNameSearch,
  employeeCountRange,
  error,
  foundedYearMin,
  hasNextPage,
  hasCareerUrlOnly,
  investorsSearch,
  isFetching,
  isFetchingNextPage,
  isLoading,
  locationSearch,
  onCompanyNameSearchChange,
  onEmployeeCountRangeChange,
  onFetchNextPage,
  onFoundedYearMinChange,
  onHasCareerUrlOnlyChange,
  onInvestorsSearchChange,
  onLocationSearchChange,
  onSearch,
  onScrapeOriginalChange,
  updatingScrapeOriginalIds,
}: CompanyManagementViewProps) {
  const { ref, inView } = useInView({
    rootMargin: "360px 0px",
  });

  useEffect(() => {
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    onFetchNextPage();
  }, [hasNextPage, inView, isFetchingNextPage, onFetchNextPage]);

  return (
    <section className={cx(opsTheme.panel, "space-y-4 p-4")}>
      <PanelHeader
        title="회사 관리"
        action={
          <div className="font-geist text-xs text-beige900/45">
            {isFetching && !isFetchingNextPage
              ? "업데이트 중"
              : `${companies.length} rows`}
          </div>
        }
      />
      <form
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_minmax(170px,1fr)_minmax(160px,1fr)_150px_178px_104px]"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <input
            value={companyNameSearch}
            onChange={(event) => onCompanyNameSearchChange(event.target.value)}
            placeholder="회사명 검색"
            aria-label="회사명 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <input
            value={locationSearch}
            onChange={(event) => onLocationSearchChange(event.target.value)}
            placeholder="location 검색"
            aria-label="location 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <Handshake className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <input
            value={investorsSearch}
            onChange={(event) => onInvestorsSearchChange(event.target.value)}
            placeholder="investors 검색"
            aria-label="investors 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <select
            value={employeeCountRange}
            onChange={(event) =>
              onEmployeeCountRangeChange(
                event.target.value as OpsCompanyManagementEmployeeCountRangeFilter
              )
            }
            aria-label="employee_count_range 선택"
            className={cx(opsTheme.input, "pl-9 pr-3")}
          >
            {OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS.map(
              (option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              )
            )}
          </select>
        </div>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/35" />
          <input
            value={foundedYearMin}
            onChange={(event) => onFoundedYearMinChange(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="founded_year >="
            aria-label="founded_year 이상"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <label className="flex h-11 items-center gap-2 rounded-md border border-beige900/10 bg-white/70 px-3 font-geist text-sm font-medium text-beige900/70">
          <input
            type="checkbox"
            checked={hasCareerUrlOnly}
            onChange={(event) => onHasCareerUrlOnlyChange(event.target.checked)}
            className="h-4 w-4 rounded border-beige900/20 accent-beige900"
          />
          career_url 있음
        </label>
        <button
          type="submit"
          className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
        >
          <Search className="h-4 w-4" />
          검색
        </button>
      </form>

      {error ? (
        <div className={opsTheme.errorNotice}>
          {error instanceof Error
            ? error.message
            : "회사 목록을 불러오지 못했습니다."}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[1180px] space-y-2">
          <div className="grid grid-cols-[56px_72px_190px_minmax(280px,1fr)_160px_180px_110px_140px] gap-3 px-3 font-geist text-[11px] font-medium text-beige900/45">
            <div>Original</div>
            <div>로고</div>
            <div>회사명</div>
            <div>회사 설명</div>
            <div>employee_count_range</div>
            <div>location</div>
            <div>founded_year</div>
            <div>최근 1년 합류</div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <LoaderCircle className="h-5 w-5 animate-spin text-beige900/35" />
            </div>
          ) : companies.length === 0 ? (
            <EmptyState copy="조건에 맞는 회사가 없습니다." />
          ) : (
            companies.map((company) => (
              <CompanyRow
                key={company.companyWorkspaceId}
                company={company}
                onScrapeOriginalChange={onScrapeOriginalChange}
                updating={updatingScrapeOriginalIds.has(
                  company.companyWorkspaceId
                )}
              />
            ))
          )}
        </div>
      </div>

      <div ref={ref} className="flex min-h-12 items-center justify-center">
        {isFetchingNextPage ? (
          <div className="inline-flex items-center gap-2 font-geist text-xs text-beige900/45">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            불러오는 중
          </div>
        ) : hasNextPage ? (
          <div className="h-4" aria-hidden="true" />
        ) : companies.length > 0 ? (
          <div className="font-geist text-xs text-beige900/35">
            마지막 row입니다.
          </div>
        ) : null}
      </div>
    </section>
  );
}
