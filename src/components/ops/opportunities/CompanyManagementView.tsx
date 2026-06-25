import { cx, opsTheme } from "@/components/ops/theme";
import {
  OPS_COMPANY_MANAGEMENT_EMPLOYEE_COUNT_RANGE_OPTIONS,
  OPS_COMPANY_MANAGEMENT_PAGE_SIZE,
  OPS_COMPANY_MANAGEMENT_QUALITY_LABEL_OPTIONS,
  type OpsCompanyManagementEmployeeCountRangeFilter,
  type OpsCompanyManagementQualityLabelFilter,
} from "@/lib/ops/opportunityCompanyManagement";
import type {
  OpsCompanyQualityLabel,
  OpsCompanyManagementRecord,
} from "@/lib/ops/opportunity";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Building2,
  CalendarDays,
  ExternalLink,
  Handshake,
  Keyboard,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useInView } from "react-intersection-observer";
import { EmptyState, PanelHeader } from "./shared";
import { BareButton } from "@/components/ui/button";
import { Checkbox as UiCheckbox } from "@/components/ui/checkbox";
import { Input as UiInput } from "@/components/ui/input";
import { Select as UiSelect } from "@/components/ui/select";

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
  onHumanQualityLabelChange: (
    company: OpsCompanyManagementRecord,
    humanQualityLabel: OpsCompanyQualityLabel | null
  ) => void;
  onInvestorsSearchChange: (value: string) => void;
  onLocationSearchChange: (value: string) => void;
  onQualityLabelChange: (value: OpsCompanyManagementQualityLabelFilter) => void;
  onReviewModeChange: (value: boolean) => void;
  onReviewUnlabeledFirstChange: (value: boolean) => void;
  onSearch: () => void;
  onScrapeOriginalChange: (
    company: OpsCompanyManagementRecord,
    nextValue: boolean
  ) => void;
  qualityLabel: OpsCompanyManagementQualityLabelFilter;
  reviewMode: boolean;
  reviewUnlabeledFirst: boolean;
  updatingQualityLabelIds: Set<string>;
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

const QUALITY_LABEL_META = {
  0: {
    className: "border-critical/30 bg-critical-faded text-critical",
    label: "0",
    title: "제외",
  },
  1: {
    className: "border-info/30 bg-info-faded text-info",
    label: "1",
    title: "후순위",
  },
  2: {
    className: "border-positive/30 bg-positive-faded text-positive",
    label: "2",
    title: "우선",
  },
} satisfies Record<
  OpsCompanyQualityLabel,
  { className: string; label: string; title: string }
>;

const QUALITY_KEY_TO_LABEL: Record<string, OpsCompanyQualityLabel> = {
  arrowleft: 0,
  arrowright: 2,
  arrowup: 1,
  a: 0,
  s: 1,
  d: 2,
};

function compactText(value: string | null | undefined, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function formatLatestFundingRound(company: OpsCompanyManagementRecord): string {
  const latest = company.latestFundingRound;
  if (!latest) return "-";
  return (
    [
      latest.name,
      latest.announcedOn,
      latest.amountText,
      latest.leadInvestors.slice(0, 2).join(", "),
    ]
      .map((part) => String(part ?? "").trim())
      .filter(Boolean)
      .join(" · ") || "-"
  );
}

function QualityBadge({ label }: { label: OpsCompanyQualityLabel | null }) {
  if (label === null) {
    return (
      <span className="inline-flex h-6 items-center rounded-md border border-neutral-1000-a05 bg-bg-default/75 px-2 text-xs font-semibold text-neutral-soft">
        -
      </span>
    );
  }
  const meta = QUALITY_LABEL_META[label];
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-md border px-2 text-xs font-semibold",
        meta.className
      )}
      title={meta.title}
    >
      {meta.label}
    </span>
  );
}

function InlineQualityLabelButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: OpsCompanyQualityLabel;
  onClick: () => void;
}) {
  const meta = QUALITY_LABEL_META[label];
  return (
    <BareButton
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex h-6 w-7 items-center justify-center rounded-md border text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-50",
        meta.className,
        "hover:border-neutral-400 hover:bg-bg-default"
      )}
      title={`human quality ${label}`}
    >
      {label}
    </BareButton>
  );
}

function QualityCell({
  company,
  disabled,
  onHumanQualityLabelChange,
}: {
  company: OpsCompanyManagementRecord;
  disabled: boolean;
  onHumanQualityLabelChange: (
    company: OpsCompanyManagementRecord,
    humanQualityLabel: OpsCompanyQualityLabel
  ) => void;
}) {
  const canSetHumanQualityLabel = company.humanQualityLabel === null;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <QualityBadge label={company.effectiveQualityLabel} />
        {company.humanQualityLabel !== null ? (
          <span className="text-[11px] font-medium text-neutral-muted">
            human
          </span>
        ) : company.llmQualityLabel !== null ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-muted">
            <Sparkles className="h-3 w-3" />
            llm
          </span>
        ) : null}
      </div>
      {canSetHumanQualityLabel ? (
        <div className="mt-1 flex items-center gap-1">
          {[0, 1, 2].map((label) => (
            <InlineQualityLabelButton
              key={label}
              disabled={disabled}
              label={label as OpsCompanyQualityLabel}
              onClick={() =>
                onHumanQualityLabelChange(
                  company,
                  label as OpsCompanyQualityLabel
                )
              }
            />
          ))}
        </div>
      ) : null}
      {company.llmQualityLabelReason ? (
        <div
          className="mt-1 line-clamp-2 text-[11px] leading-4 text-neutral-muted"
          title={company.llmQualityLabelReason}
        >
          {company.llmQualityLabelReason}
        </div>
      ) : null}
    </div>
  );
}

function CompanyLogo({ company }: { company: OpsCompanyManagementRecord }) {
  if (!company.logoUrl) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-neutral-1000-a05 bg-bg-default/70 text-neutral-soft">
        <Building2 className="h-5 w-5" />
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-neutral-1000-a05 bg-bg-default">
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
  onHumanQualityLabelChange,
  onScrapeOriginalChange,
  updatingQualityLabel,
  updatingScrapeOriginal,
}: {
  company: OpsCompanyManagementRecord;
  onHumanQualityLabelChange: (
    company: OpsCompanyManagementRecord,
    humanQualityLabel: OpsCompanyQualityLabel
  ) => void;
  onScrapeOriginalChange: (
    company: OpsCompanyManagementRecord,
    nextValue: boolean
  ) => void;
  updatingQualityLabel: boolean;
  updatingScrapeOriginal: boolean;
}) {
  const homepageUrl = normalizeExternalUrl(company.homepageUrl);
  const latestFundingRound = formatLatestFundingRound(company);

  return (
    <div
      className={cx(
        "box-border grid w-full grid-cols-[56px_72px_190px_110px_minmax(280px,1fr)_190px_180px_210px_150px_180px_110px_140px] items-center gap-3 rounded-md border-2 px-3 py-3 transition",
        company.isScrapeOriginal
          ? "border-primary bg-bg-floating shadow-[0_10px_26px_color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
          : "border-neutral-1000-a05 bg-bg-default/65 hover:bg-bg-default"
      )}
    >
      <div className="flex items-center justify-center">
        <label
          className={cx(
            "flex h-10 w-10 cursor-pointer items-center justify-center rounded-md transition hover:bg-bg-floating",
            "focus-within:bg-bg-floating focus-within:ring-2 focus-within:ring-primary/40",
            updatingScrapeOriginal && "cursor-wait opacity-60"
          )}
          title="is_scrape_original"
        >
          <UiCheckbox
            unstyled
            checked={company.isScrapeOriginal}
            disabled={updatingScrapeOriginal}
            onChange={(event) =>
              onScrapeOriginalChange(company, event.target.checked)
            }
            aria-label={`${company.companyName} is_scrape_original`}
            className="h-7 w-7 cursor-pointer rounded border-2 border-neutral-1000-a10 accent-primary transition hover:border-primary/70 disabled:cursor-wait"
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
            className="inline-flex max-w-full items-center gap-1 truncate text-sm font-semibold text-neutral-primary transition hover:text-primary hover:underline"
          >
            <span className="truncate">
              {company.companyName || company.companyDb?.name || "-"}
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <div className="truncate text-sm font-semibold text-neutral-primary">
            {company.companyName || company.companyDb?.name || "-"}
          </div>
        )}
        {company.companyDb?.name &&
        company.companyDb.name !== company.companyName ? (
          <div className="mt-1 truncate text-[11px] text-neutral-muted">
            DB: {company.companyDb.name}
          </div>
        ) : null}
      </div>
      <QualityCell
        company={company}
        disabled={updatingQualityLabel}
        onHumanQualityLabelChange={onHumanQualityLabelChange}
      />
      <div className="line-clamp-2 text-xs leading-5 text-neutral-muted">
        {company.companyDescription || "-"}
      </div>
      <div
        className="line-clamp-2 text-xs leading-5 text-neutral-muted"
        title={compactText(company.investors, "")}
      >
        {compactText(company.investors)}
      </div>
      <div
        className="line-clamp-2 text-xs leading-5 text-neutral-muted"
        title={compactText(company.industry, "")}
      >
        {compactText(company.industry)}
      </div>
      <div
        className="line-clamp-2 text-xs leading-5 text-neutral-muted"
        title={latestFundingRound === "-" ? "" : latestFundingRound}
      >
        {latestFundingRound}
      </div>
      <div className="text-xs font-medium text-neutral-muted">
        {formatEmployeeCountRange(company.employeeCountRange)}
      </div>
      <div className="truncate text-xs text-neutral-muted">
        {company.location || "-"}
      </div>
      <div className="text-xs text-neutral-muted">
        {company.foundedYear && company.foundedYear > 0
          ? company.foundedYear
          : "-"}
      </div>
      <div className="text-sm font-semibold text-neutral-primary">
        {KO_NUMBER_FORMATTER.format(company.recentJoinCount)}
      </div>
    </div>
  );
}

function ReviewInfoBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3 py-3">
      <div className="mb-1 text-[11px] font-semibold uppercase text-neutral-soft">
        {title}
      </div>
      <div className="text-sm leading-6 text-neutral-muted">{children}</div>
    </div>
  );
}

function ReviewActionButton({
  active,
  disabled,
  icon,
  label,
  onClick,
  shortcut,
  tone,
}: {
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: OpsCompanyQualityLabel;
  onClick: () => void;
  shortcut: string;
  tone: "bad" | "neutral" | "good";
}) {
  const toneClass =
    tone === "good"
      ? "border-positive/30 bg-positive-faded text-positive hover:border-positive/30"
      : tone === "neutral"
        ? "border-info/30 bg-info-faded text-info hover:border-info/30"
        : "border-critical/30 bg-critical-faded text-critical hover:border-critical/30";

  return (
    <BareButton
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex h-14 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-55",
        active ? "border-neutral-800 bg-black text-neutral-00" : toneClass
      )}
      title={`${shortcut}: ${label}`}
    >
      {icon}
      <span>{label}</span>
      <span className="text-xs opacity-65">{shortcut}</span>
    </BareButton>
  );
}

function CompanyReviewCard({
  company,
  disabled,
  onHumanQualityLabelChange,
}: {
  company: OpsCompanyManagementRecord;
  disabled: boolean;
  onHumanQualityLabelChange: (
    company: OpsCompanyManagementRecord,
    humanQualityLabel: OpsCompanyQualityLabel
  ) => void;
}) {
  const homepageUrl = normalizeExternalUrl(company.homepageUrl);
  const latestFundingRound = formatLatestFundingRound(company);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="rounded-md border border-neutral-1000-a05 bg-bg-default/75 px-5 py-5 shadow-[0_16px_50px_color-mix(in_srgb,var(--color-neutral-1000)_8%,transparent)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-4">
            <CompanyLogo company={company} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-2xl font-semibold text-neutral-primary">
                  {company.companyName || company.companyDb?.name || "-"}
                </h3>
                <QualityBadge label={company.effectiveQualityLabel} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-muted">
                {company.humanQualityLabel !== null ? (
                  <span>human label</span>
                ) : company.llmQualityLabel !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    llm label
                  </span>
                ) : (
                  <span>unlabeled</span>
                )}
                {homepageUrl ? (
                  <a
                    href={homepageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cx(
                      opsTheme.link,
                      "inline-flex items-center gap-1"
                    )}
                  >
                    website
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-sm font-semibold text-neutral-primary">
            최근 1년 합류 {KO_NUMBER_FORMATTER.format(company.recentJoinCount)}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ReviewInfoBlock title="description">
            {company.companyDescription || "-"}
          </ReviewInfoBlock>
          <ReviewInfoBlock title="llm reason">
            {company.llmQualityLabelReason || "-"}
          </ReviewInfoBlock>
          <ReviewInfoBlock title="investors">
            {compactText(company.investors)}
          </ReviewInfoBlock>
          <ReviewInfoBlock title="industry">
            {compactText(company.industry)}
          </ReviewInfoBlock>
          <ReviewInfoBlock title="latest round">
            {latestFundingRound}
          </ReviewInfoBlock>
          <ReviewInfoBlock title="company info">
            {[
              company.location,
              company.foundedYear ? `founded ${company.foundedYear}` : null,
              formatEmployeeCountRange(company.employeeCountRange),
            ]
              .filter(Boolean)
              .join(" · ") || "-"}
          </ReviewInfoBlock>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <ReviewActionButton
          active={company.humanQualityLabel === 0}
          disabled={disabled}
          icon={<ArrowLeft className="h-4 w-4" />}
          label={0}
          onClick={() => onHumanQualityLabelChange(company, 0)}
          shortcut="A / ←"
          tone="bad"
        />
        <ReviewActionButton
          active={company.humanQualityLabel === 1}
          disabled={disabled}
          icon={<ArrowUp className="h-4 w-4" />}
          label={1}
          onClick={() => onHumanQualityLabelChange(company, 1)}
          shortcut="S / ↑"
          tone="neutral"
        />
        <ReviewActionButton
          active={company.humanQualityLabel === 2}
          disabled={disabled}
          icon={<ArrowRight className="h-4 w-4" />}
          label={2}
          onClick={() => onHumanQualityLabelChange(company, 2)}
          shortcut="D / →"
          tone="good"
        />
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
  onHumanQualityLabelChange,
  onInvestorsSearchChange,
  onLocationSearchChange,
  onQualityLabelChange,
  onReviewModeChange,
  onReviewUnlabeledFirstChange,
  onSearch,
  onScrapeOriginalChange,
  qualityLabel,
  reviewMode,
  reviewUnlabeledFirst,
  updatingQualityLabelIds,
  updatingScrapeOriginalIds,
}: CompanyManagementViewProps) {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [pendingReviewAdvanceFromLength, setPendingReviewAdvanceFromLength] =
    useState<number | null>(null);
  const { ref, inView } = useInView({
    rootMargin: "360px 0px",
  });
  const reviewCompanies = useMemo(() => {
    return companies
      .map((company, index) => ({ company, index }))
      .sort((left, right) => {
        if (reviewUnlabeledFirst) {
          const leftHasHumanLabel = left.company.humanQualityLabel !== null;
          const rightHasHumanLabel = right.company.humanQualityLabel !== null;
          if (leftHasHumanLabel !== rightHasHumanLabel) {
            return leftHasHumanLabel ? 1 : -1;
          }
        }
        const leftLlmScore = left.company.llmQualityLabel ?? -1;
        const rightLlmScore = right.company.llmQualityLabel ?? -1;
        if (leftLlmScore !== rightLlmScore) {
          return rightLlmScore - leftLlmScore;
        }
        return left.index - right.index;
      })
      .map((item) => item.company);
  }, [companies, reviewUnlabeledFirst]);
  const currentReviewCompany = useMemo(
    () => reviewCompanies[reviewIndex] ?? null,
    [reviewCompanies, reviewIndex]
  );

  const advanceReviewIndex = useCallback(() => {
    if (reviewCompanies.length === 0) {
      setReviewIndex(0);
      return;
    }
    if (reviewIndex < reviewCompanies.length - 1) {
      setReviewIndex(reviewIndex + 1);
      return;
    }
    if (hasNextPage && !isFetchingNextPage) {
      setPendingReviewAdvanceFromLength(companies.length);
      onFetchNextPage();
    }
  }, [
    companies.length,
    hasNextPage,
    isFetchingNextPage,
    onFetchNextPage,
    reviewIndex,
    reviewCompanies.length,
  ]);
  const moveReviewIndex = useCallback(
    (delta: number) => {
      setReviewIndex((current) => {
        if (reviewCompanies.length === 0) return 0;
        return Math.max(
          0,
          Math.min(current + delta, reviewCompanies.length - 1)
        );
      });
    },
    [reviewCompanies.length]
  );
  const handleReviewQualityLabelChange = useCallback(
    (
      company: OpsCompanyManagementRecord,
      humanQualityLabel: OpsCompanyQualityLabel
    ) => {
      if (updatingQualityLabelIds.has(company.companyWorkspaceId)) return;
      onHumanQualityLabelChange(company, humanQualityLabel);
      if (!(reviewUnlabeledFirst && company.humanQualityLabel === null)) {
        advanceReviewIndex();
      }
    },
    [
      advanceReviewIndex,
      onHumanQualityLabelChange,
      reviewUnlabeledFirst,
      updatingQualityLabelIds,
    ]
  );

  useEffect(() => {
    if (reviewMode) return;
    if (!inView || !hasNextPage || isFetchingNextPage) return;
    onFetchNextPage();
  }, [hasNextPage, inView, isFetchingNextPage, onFetchNextPage, reviewMode]);

  useEffect(() => {
    if (pendingReviewAdvanceFromLength === null) return;
    if (companies.length <= pendingReviewAdvanceFromLength) return;
    const firstNewCompany = companies[pendingReviewAdvanceFromLength] ?? null;
    const nextIndex = firstNewCompany
      ? reviewCompanies.findIndex(
          (company) =>
            company.companyWorkspaceId === firstNewCompany.companyWorkspaceId
        )
      : -1;
    setReviewIndex(
      nextIndex >= 0
        ? nextIndex
        : Math.min(pendingReviewAdvanceFromLength, reviewCompanies.length - 1)
    );
    setPendingReviewAdvanceFromLength(null);
  }, [
    companies,
    companies.length,
    pendingReviewAdvanceFromLength,
    reviewCompanies,
  ]);

  useEffect(() => {
    setReviewIndex((current) =>
      reviewCompanies.length === 0
        ? 0
        : Math.min(current, reviewCompanies.length - 1)
    );
  }, [reviewCompanies.length]);

  useEffect(() => {
    if (!reviewMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const label = QUALITY_KEY_TO_LABEL[event.key.toLowerCase()];
      if (label === undefined || !currentReviewCompany) return;

      event.preventDefault();
      handleReviewQualityLabelChange(currentReviewCompany, label);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentReviewCompany, handleReviewQualityLabelChange, reviewMode]);

  return (
    <section className={cx(opsTheme.panel, "space-y-4 p-4")}>
      <PanelHeader
        title="회사 관리"
        action={
          <div className="text-xs text-neutral-muted">
            {isFetching && !isFetchingNextPage
              ? "업데이트 중"
              : `${companies.length} rows`}
          </div>
        }
      />
      <form
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_minmax(160px,1fr)_minmax(150px,1fr)_140px_150px_178px_104px]"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiInput
            unstyled
            value={companyNameSearch}
            onChange={(event) => onCompanyNameSearchChange(event.target.value)}
            placeholder="회사명 검색"
            aria-label="회사명 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiInput
            unstyled
            value={locationSearch}
            onChange={(event) => onLocationSearchChange(event.target.value)}
            placeholder="location 검색"
            aria-label="location 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <Handshake className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiInput
            unstyled
            value={investorsSearch}
            onChange={(event) => onInvestorsSearchChange(event.target.value)}
            placeholder="investors 검색"
            aria-label="investors 검색"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiSelect
            unstyled
            value={employeeCountRange}
            onChange={(event) =>
              onEmployeeCountRangeChange(
                event.target
                  .value as OpsCompanyManagementEmployeeCountRangeFilter
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
          </UiSelect>
        </div>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiInput
            unstyled
            value={foundedYearMin}
            onChange={(event) => onFoundedYearMinChange(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="founded_year >="
            aria-label="founded_year 이상"
            className={cx(opsTheme.input, "pl-9")}
          />
        </div>
        <div className="relative">
          <BadgeCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-soft" />
          <UiSelect
            unstyled
            value={qualityLabel}
            onChange={(event) =>
              onQualityLabelChange(
                event.target.value as OpsCompanyManagementQualityLabelFilter
              )
            }
            aria-label="quality label 선택"
            className={cx(opsTheme.input, "pl-9 pr-3")}
          >
            {OPS_COMPANY_MANAGEMENT_QUALITY_LABEL_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </UiSelect>
        </div>
        <label className="flex h-11 items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3 text-sm font-medium text-neutral-muted">
          <UiCheckbox
            unstyled
            checked={hasCareerUrlOnly}
            onChange={(event) => onHasCareerUrlOnlyChange(event.target.checked)}
            className="h-4 w-4 rounded border-neutral-1000-a10 accent-black"
          />
          career_url 있음
        </label>
        <BareButton
          type="submit"
          className={cx(opsTheme.buttonPrimary, "h-11 px-3")}
        >
          <Search className="h-4 w-4" />
          검색
        </BareButton>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <BareButton
          type="button"
          onClick={() => {
            onReviewModeChange(!reviewMode);
            setReviewIndex(0);
          }}
          className={cx(
            opsTheme.buttonSecondary,
            "h-9 px-3",
            reviewMode && "border-neutral-800 bg-black text-neutral-00"
          )}
        >
          <Keyboard className="h-4 w-4" />
          리뷰 모드
        </BareButton>
        {reviewMode ? (
          <div className="text-xs text-neutral-muted">
            {currentReviewCompany
              ? `${reviewIndex + 1}/${reviewCompanies.length} · LLM 2 우선 · A/← 0 · S/↑ 1 · D/→ 2`
              : "리뷰할 row 없음"}
          </div>
        ) : null}
        {reviewMode ? (
          <label className="flex h-9 items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3 text-xs font-medium text-neutral-muted">
            <UiCheckbox
              unstyled
              checked={reviewUnlabeledFirst}
              onChange={(event) => {
                onReviewUnlabeledFirstChange(event.target.checked);
                setReviewIndex(0);
              }}
              className="h-4 w-4 rounded border-neutral-1000-a10 accent-black"
            />
            human label 없음 우선
          </label>
        ) : null}
      </div>

      {error ? (
        <div className={opsTheme.errorNotice}>
          {error instanceof Error
            ? error.message
            : "회사 목록을 불러오지 못했습니다."}
        </div>
      ) : null}

      {reviewMode ? (
        isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
          </div>
        ) : currentReviewCompany ? (
          <div className="space-y-3">
            <CompanyReviewCard
              company={currentReviewCompany}
              disabled={updatingQualityLabelIds.has(
                currentReviewCompany.companyWorkspaceId
              )}
              onHumanQualityLabelChange={handleReviewQualityLabelChange}
            />
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2">
              <BareButton
                type="button"
                onClick={() => moveReviewIndex(-1)}
                disabled={reviewIndex <= 0}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-9 px-3 disabled:opacity-45"
                )}
              >
                이전 row
              </BareButton>
              <BareButton
                type="button"
                onClick={() => advanceReviewIndex()}
                disabled={
                  reviewIndex >= reviewCompanies.length - 1 &&
                  (!hasNextPage || isFetchingNextPage)
                }
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-9 px-3 disabled:opacity-45"
                )}
              >
                {reviewIndex >= reviewCompanies.length - 1 && hasNextPage
                  ? isFetchingNextPage
                    ? "불러오는 중"
                    : `다음 ${OPS_COMPANY_MANAGEMENT_PAGE_SIZE}개`
                  : "건너뛰기"}
              </BareButton>
            </div>
          </div>
        ) : (
          <EmptyState copy="리뷰할 회사가 없습니다." />
        )
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[2040px] space-y-2">
            <div className="grid grid-cols-[56px_72px_190px_110px_minmax(280px,1fr)_190px_180px_210px_150px_180px_110px_140px] gap-3 px-3 text-[11px] font-medium text-neutral-muted">
              <div>Original</div>
              <div>로고</div>
              <div>회사명</div>
              <div>Quality</div>
              <div>회사 설명</div>
              <div>investors</div>
              <div>industry</div>
              <div>latest round</div>
              <div>employee_count_range</div>
              <div>location</div>
              <div>founded_year</div>
              <div>최근 1년 합류</div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <LoaderCircle className="h-5 w-5 animate-spin text-neutral-soft" />
              </div>
            ) : companies.length === 0 ? (
              <EmptyState copy="조건에 맞는 회사가 없습니다." />
            ) : (
              companies.map((company) => (
                <CompanyRow
                  key={company.companyWorkspaceId}
                  company={company}
                  onHumanQualityLabelChange={onHumanQualityLabelChange}
                  onScrapeOriginalChange={onScrapeOriginalChange}
                  updatingQualityLabel={updatingQualityLabelIds.has(
                    company.companyWorkspaceId
                  )}
                  updatingScrapeOriginal={updatingScrapeOriginalIds.has(
                    company.companyWorkspaceId
                  )}
                />
              ))
            )}
          </div>
        </div>
      )}

      {!reviewMode ? (
        <div ref={ref} className="flex min-h-12 items-center justify-center">
          {isFetchingNextPage ? (
            <div className="inline-flex items-center gap-2 text-xs text-neutral-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              불러오는 중
            </div>
          ) : hasNextPage ? (
            <div className="h-4" aria-hidden="true" />
          ) : companies.length > 0 ? (
            <div className="text-xs text-neutral-soft">마지막 row입니다.</div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
