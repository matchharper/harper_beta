import {
  ArrowUpRight,
  Building2,
  Calendar,
  Loader2,
  MapPin,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import CareerRichText from "@/components/career/ui/CareerRichText";
import { PillLink } from "@/components/ui/pill";
import { CompanyLogo } from "./CompanyLogo";
import { FollowButton } from "./FollowButton";
import {
  formatCrunchbaseLabel,
  formatCrunchbaseMetricValue,
  formatEmployeeCountRange,
  formatFollowedAt,
  formatSignedCrunchbaseMetricValue,
  splitTextList,
  toRecord,
  toStringArray,
} from "./watchlistFormatters";
import type {
  CompanyDetailRow,
  CompanyFollowClickHandler,
  CompanyWatchlistItem,
} from "./watchlistTypes";
import Tag from "@/components/ui/tag";

const DetailSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="mt-8">
    <h2 className="text-[15px] font-medium leading-6 text-black">{title}</h2>
    <div className="mt-2">{children}</div>
  </section>
);

const DetailRows = ({ rows }: { rows: CompanyDetailRow[] }) => (
  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
    {rows.map((row) => (
      <div key={row.label} className="min-w-0">
        <dt className="text-xs leading-5 text-black/60">{row.label}</dt>
        <dd className="mt-1 wrap-break-word text-base leading-6 text-black">
          {row.value}
        </dd>
      </div>
    ))}
  </dl>
);

const TagList = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => (
      <Tag key={item}>{item}</Tag>
    ))}
  </div>
);

const stripCompanySnapshotChrome = (markdown: string) => {
  const lines = markdown.trim().split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) {
    lines.shift();
  }
  while (lines[0]?.trim() === "") {
    lines.shift();
  }
  if (/^조사일\s*:/.test(lines[0] ?? "")) {
    lines.shift();
  }
  while (lines[0]?.trim() === "") {
    lines.shift();
  }
  return lines.join("\n").trim();
};

const getFaviconUrl = (href: string) => {
  try {
    const url = new URL(href);
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
      url.origin
    )}&sz=64`;
  } catch {
    return "";
  }
};

const LinkPillIcon = ({ iconUrl }: { iconUrl: string }) => {
  if (!iconUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className="h-3.5 w-3.5 rounded-[3px] object-contain"
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
};

export const CompanyDetailView = ({
  item,
  loading,
  onBack,
  onToggleFollow,
  updating,
}: {
  item: CompanyWatchlistItem | null;
  loading: boolean;
  onBack: () => void;
  onToggleFollow: CompanyFollowClickHandler;
  updating: boolean;
}) => {
  if (loading) {
    return (
      <section className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-beige900/40" />
      </section>
    );
  }

  if (!item) {
    return (
      <section className="rounded-[8px] border border-beige900/10 bg-white/45 px-5 py-10 text-center">
        <Building2 className="mx-auto h-6 w-6 text-beige900/35" />
        <h2 className="mt-4 text-[16px] font-medium text-beige900">
          회사를 찾지 못했습니다.
        </h2>
        {/* <CareerActionButton
          actionVariant="secondary"
          buttonRadius="rounded"
          onClick={onBack}
          className="mt-5 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          워치리스트로 돌아가기
        </CareerActionButton> */}
      </section>
    );
  }

  const links = [
    { href: item.homepageUrl ?? item.websiteUrl, label: "웹사이트" },
    { href: item.linkedinUrl, label: "LinkedIn" },
    { href: item.careerUrl, label: "채용 페이지" },
    { href: item.fundingUrl, label: "Funding" },
  ]
    .filter((entry): entry is { href: string; label: string } =>
      Boolean(entry.href)
    )
    .map((entry) => ({
      ...entry,
      iconUrl: getFaviconUrl(entry.href),
    }));
  const employeeCount = formatEmployeeCountRange(item.employeeCountRange);
  const infoRows = [
    item.location
      ? {
          icon: (
            <MapPin className="h-3.5 w-3.5 text-hgray200" strokeWidth={2} />
          ),
          label: "본사 위치",
          value: item.location,
        }
      : null,
    item.foundedYear
      ? {
          icon: (
            <Calendar className="h-3.5 w-3.5 text-hgray200" strokeWidth={2} />
          ),
          label: "설립 연도",
          value: `${String(item.foundedYear)}년 설립`,
        }
      : null,
    employeeCount
      ? {
          icon: <Users className="h-3.5 w-3.5 text-hgray200" strokeWidth={2} />,
          label: "직원 수",
          value: employeeCount,
        }
      : null,
  ].filter((row) => row !== null);

  const investorTags = splitTextList(item.investors, 24);
  const relatedLinks = (item.relatedLinks ?? [])
    .map((link) => String(link ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const snapshotMarkdown = item.companySnapshot?.fullMarkdown
    ? stripCompanySnapshotChrome(item.companySnapshot.fullMarkdown)
    : "";
  const snapshotInvestigationDate =
    item.companySnapshot?.investigationDate?.trim() ?? "";

  const crunchbaseInformation = toRecord(item.crunchbaseInformation);
  const crunchbaseCompany = toRecord(crunchbaseInformation.company);
  const crunchbaseTaxonomy = toRecord(crunchbaseInformation.taxonomy);
  const crunchbaseScores = toRecord(crunchbaseInformation.scores);
  const crunchbaseStatusRows = [
    {
      label: "운영 상태",
      value: formatCrunchbaseLabel(crunchbaseCompany.operating_status),
    },
    {
      label: "회사 유형",
      value: formatCrunchbaseLabel(crunchbaseCompany.company_type),
    },
    {
      label: "IPO 상태",
      value: formatCrunchbaseLabel(crunchbaseCompany.ipo_status),
    },
  ].filter((row): row is CompanyDetailRow => row.value.length > 0);
  const crunchbaseMetricRows = [
    {
      label: "Growth Score",
      value: formatCrunchbaseMetricValue(crunchbaseScores.growth_score),
    },
    {
      label: "Heat Score",
      value: formatCrunchbaseMetricValue(crunchbaseScores.heat_score),
    },
    {
      label: "Growth 90d",
      value: formatSignedCrunchbaseMetricValue(
        crunchbaseScores.growth_score_delta_d90
      ),
    },
    {
      label: "Heat 90d",
      value: formatSignedCrunchbaseMetricValue(
        crunchbaseScores.heat_score_delta_d90
      ),
    },
  ].filter((row): row is CompanyDetailRow => row.value.length > 0);
  const crunchbaseCategories = toStringArray(crunchbaseTaxonomy.categories, 18);
  const crunchbaseFounders = toStringArray(crunchbaseTaxonomy.founders, 12);
  const crunchbaseLocationGroups = toStringArray(
    crunchbaseTaxonomy.location_groups,
    12
  );
  const hasCrunchbase =
    crunchbaseStatusRows.length > 0 ||
    crunchbaseMetricRows.length > 0 ||
    crunchbaseCategories.length > 0 ||
    crunchbaseFounders.length > 0 ||
    crunchbaseLocationGroups.length > 0;

  return (
    <section className="min-w-0">
      {/* <CareerActionButton
        actionVariant="secondary"
        buttonRadius="rounded"
        onClick={onBack}
        className="h-auto border-transparent bg-transparent px-0 text-[13px] text-black/60 hover:translate-y-0 hover:border-transparent hover:bg-transparent hover:text-black hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        워치리스트로 돌아가기
      </CareerActionButton> */}

      <header className="mt-4">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyLogo logoUrl={item.logoUrl} name={item.name} size="lg" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="wrap-break-word text-[28px] font-semibold leading-8 text-black">
                  {item.name}
                </h1>
                {item.followedAt ? (
                  <span className="rounded-full bg-beige200 px-2.5 py-1 text-[12px] leading-none text-beige900/65">
                    {formatFollowedAt(item.followedAt)}
                  </span>
                ) : null}
              </div>
              <p className="max-w-[780px] text-[14px] text-black/70">
                {item.shortDescription ??
                  item.location ??
                  "회사 설명을 정리 중입니다."}
              </p>

              {links.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {links.map((link) => (
                    <PillLink
                      key={link.label}
                      href={link.href}
                      size="sm"
                      className="bg-white/55 px-2.5 text-[12px] font-medium text-beige900 hover:border-beige900/25 hover:bg-white"
                    >
                      <LinkPillIcon iconUrl={link.iconUrl} />
                      {link.label}
                    </PillLink>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">
            <FollowButton
              disabled={updating}
              following={item.following}
              onClick={(event) => onToggleFollow(item, event)}
            />
          </div>
        </div>
      </header>

      <div className="mt-4">
        {infoRows.length > 0 && (
          <div className="flex flex-row gap-4">
            {infoRows.map((row) => (
              <div
                key={row.label}
                className="flex flex-row gap-1.5 items-center text-sm text-black/90"
              >
                {row.icon && row.icon}
                <span className="font-normal">{row.value}</span>
              </div>
            ))}
          </div>
        )}
        {snapshotMarkdown ? (
          <DetailSection title="Harper가 찾아본 내용">
            <div className="">
              {snapshotInvestigationDate ? (
                <div className="mb-4 inline-flex rounded-full bg-beige200 px-2.5 py-1 text-[12px] font-medium leading-none text-beige900/65">
                  조사일 {snapshotInvestigationDate}
                </div>
              ) : null}
              <CareerRichText
                content={snapshotMarkdown}
                className="text-beige900/85"
              />
            </div>
          </DetailSection>
        ) : (
          <DetailSection title="회사 설명">
            <p className="whitespace-pre-wrap text-sm leading-6 text-black/90">
              {item.description ?? "아직 회사 설명이 없습니다."}
            </p>
          </DetailSection>
        )}

        {item.specialities.length > 0 ? (
          <DetailSection title="전문 분야">
            <TagList items={item.specialities} />
          </DetailSection>
        ) : null}

        {investorTags.length > 0 ? (
          <DetailSection title="투자자">
            <TagList items={investorTags} />
          </DetailSection>
        ) : null}

        {hasCrunchbase ? (
          <DetailSection title="Crunchbase">
            <div className="space-y-5">
              {crunchbaseStatusRows.length > 0 ? (
                <DetailRows rows={crunchbaseStatusRows} />
              ) : null}
              {crunchbaseMetricRows.length > 0 ? (
                <DetailRows rows={crunchbaseMetricRows} />
              ) : null}
              {crunchbaseCategories.length > 0 ? (
                <div>
                  <div className="mb-2 text-[12px] leading-5 text-black/60">
                    카테고리
                  </div>
                  <TagList items={crunchbaseCategories} />
                </div>
              ) : null}
              {crunchbaseFounders.length > 0 ? (
                <div>
                  <div className="mb-2 text-[12px] leading-5 text-black/60">
                    창업자
                  </div>
                  <TagList items={crunchbaseFounders} />
                </div>
              ) : null}
              {crunchbaseLocationGroups.length > 0 ? (
                <div>
                  <div className="mb-2 text-[12px] leading-5 text-black/60">
                    지역 그룹
                  </div>
                  <TagList items={crunchbaseLocationGroups} />
                </div>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        {relatedLinks.length > 0 ? (
          <DetailSection title="관련 링크">
            <div className="space-y-2">
              {relatedLinks.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center justify-between gap-3 text-[13px] leading-6 text-black/60 transition-colors hover:text-black"
                >
                  <span className="min-w-0 truncate">{link}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                </a>
              ))}
            </div>
          </DetailSection>
        ) : null}
      </div>
    </section>
  );
};
