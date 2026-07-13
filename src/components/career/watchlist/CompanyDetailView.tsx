import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CircleDollarSign,
  FileText,
  GraduationCap,
  Handshake,
  Loader2,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import RichText from "@/components/ui/rich-text";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { CompanyLogo } from "./CompanyLogo";
import { FollowButton } from "./FollowButton";
import {
  formatCrunchbaseLabel,
  formatCrunchbaseMetricValue,
  formatEmployeeCountRange,
  formatFoundedYear,
  formatFollowedAt,
  formatSignedCrunchbaseMetricValue,
  splitTextList,
  toRecord,
  toStringArray,
} from "./watchlistFormatters";
import type {
  CompanyDetailRow,
  CompanyFollowClickHandler,
  CompanyLeadershipPayload,
  CompanyLeadershipPerson,
  CompanyWatchlistItem,
} from "./watchlistTypes";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { useMessages, type Locale } from "@/i18n/useMessage";
import { useCareerT } from "@/i18n/useCareerT";
import { Tooltips } from "@/components/ui/tooltip";
import { formatCareerLocation } from "@/lib/career/locationDisplay";
import {
  getKnownCompanyDataText,
  parseFundingStageLabel,
} from "@/lib/career/fundingStage";
import { logger } from "@/utils/logger";

const DetailSection = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => (
  <section className="mt-8">
    <Text as="h2" variant="title" tone="primary" className="text-[15px]">
      {title}
    </Text>
    <div className="mt-2">{children}</div>
  </section>
);

const DetailRows = ({ rows }: { rows: CompanyDetailRow[] }) => (
  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
    {rows.map((row) => (
      <div key={row.label} className="min-w-0">
        <dt className="text-xs leading-5 text-neutral-muted">{row.label}</dt>
        <dd className="mt-1 wrap-break-word text-base leading-6 text-neutral-primary">
          {row.value}
        </dd>
      </div>
    ))}
  </dl>
);

const TagList = ({ items }: { items: string[] }) => (
  <div className="flex flex-wrap gap-2">
    {items.map((item) => (
      <Badge key={item}>{item}</Badge>
    ))}
  </div>
);

const LeadershipSkeletonList = () => (
  <div className="grid gap-2">
    {[0, 1].map((item) => (
      <div
        key={item}
        className="h-[56px] animate-pulse rounded-[4px] border border-neutral-1000-a05 bg-bg-basement"
      />
    ))}
  </div>
);

const SCHOOL_DISPLAY_NAME_BY_EXACT_NAME: Record<
  string,
  Record<Locale, string>
> = {
  "Korea Advanced Institute of Science and Technology": {
    en: "KAIST",
    ko: "KAIST",
  },
  "Korea Advanced Institute of Science and Technology (KAIST)": {
    en: "KAIST",
    ko: "KAIST",
  },
  "Gwangju Institute of Science and Technology": {
    en: "GIST",
    ko: "GIST",
  },
  "Ulsan National Institute of Science and Technology": {
    en: "UNIST",
    ko: "UNIST",
  },
  "Seoul National University": {
    en: "Seoul National University",
    ko: "서울대학교",
  },
  "Yonsei University": {
    en: "Yonsei University",
    ko: "연세대학교",
  },
  "Korea University": {
    en: "Korea Univ.",
    ko: "고려대학교",
  },
  "Pohang University of Science and Technology": {
    en: "POSTECH",
    ko: "POSTECH",
  },
  "Sungkyunkwan University": {
    en: "SKKU",
    ko: "성균관대학교",
  },
  "Hanyang University": {
    en: "Hanyang University",
    ko: "한양대학교",
  },
  "Sogang University": {
    en: "Sogang University",
    ko: "서강대학교",
  },
  "Ewha Womans University": {
    en: "Ewha Womans University",
    ko: "이화여자대학교",
  },
  "Seoul National University of Science and Technology": {
    en: "SeoulTech",
    ko: "서울과학기술대학교",
  },
  "University of Seoul": {
    en: "University of Seoul",
    ko: "서울시립대학교",
  },
  "Chung-Ang University": {
    en: "Chung-Ang University",
    ko: "중앙대학교",
  },
  "Kyung Hee University": {
    en: "Kyung Hee University",
    ko: "경희대학교",
  },
  "Pusan National University": {
    en: "PNU",
    ko: "부산대학교",
  },
  "Stanford University": {
    en: "Stanford",
    ko: "스탠퍼드",
  },
  "Massachusetts Institute of Technology": {
    en: "MIT",
    ko: "MIT",
  },
  "Harvard University": {
    en: "Harvard",
    ko: "하버드",
  },
  "University of California, Berkeley": {
    en: "UC Berkeley",
    ko: "UC Berkeley",
  },
  "Carnegie Mellon University": {
    en: "CMU",
    ko: "CMU",
  },
};

const getDisplaySchoolName = (
  school: string | null | undefined,
  locale: Locale
) => {
  const exactName = school?.trim() ?? "";
  if (!exactName) return "";
  return SCHOOL_DISPLAY_NAME_BY_EXACT_NAME[exactName]?.[locale] ?? exactName;
};

const formatEducationSummary = (
  person: CompanyLeadershipPerson,
  locale: Locale
) => {
  return person.education
    .map((education) => {
      const school = getDisplaySchoolName(education.school, locale);
      const detail = (education.degree ?? education.field)?.trim();
      if (!school && !detail) return "";
      return [school, detail].filter(Boolean).join(" · ");
    })
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
};

const LeadershipList = ({
  loading,
  people,
  locale,
}: {
  loading: boolean;
  people: CompanyLeadershipPerson[];
  locale: Locale;
}) => {
  if (loading) return <LeadershipSkeletonList />;
  if (people.length === 0) return null;

  return (
    <div className="grid gap-2">
      {people.map((person) => {
        const previousCompanies = person.previousCompanies.slice(0, 3);
        const previousCompanyText = previousCompanies.join(", ");
        const educationText = formatEducationSummary(person, locale);
        const body = (
          <>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {person.role ? (
                    <span className="min-w-0 max-w-full break-all wrap-break-word text-[13px] font-normal leading-5 text-neutral-primary">
                      {person.role}:
                    </span>
                  ) : null}
                  <span className="min-w-0 max-w-full break-all wrap-break-word text-[13px] font-medium leading-5 text-neutral-primary">
                    {person.name}
                  </span>
                </div>
                <div className="mt-2 grid min-w-0 gap-1.5 text-[12px] leading-5 text-neutral-700 sm:grid-cols-2">
                  {previousCompanyText ? (
                    <Tooltips text="previous companies">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">
                          {previousCompanyText}
                        </span>
                      </div>
                    </Tooltips>
                  ) : null}
                  {educationText ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{educationText}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              {person.linkedinUrl ? (
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-disabled transition-colors group-hover:text-neutral-primary" />
              ) : null}
            </div>
          </>
        );

        if (!person.linkedinUrl) {
          return (
            <div
              key={person.candidId}
              className="rounded-[4px] border border-neutral-1000-a05 bg-bg-floating px-2 py-2"
            >
              {body}
            </div>
          );
        }

        return (
          <a
            key={person.candidId}
            href={person.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-[4px] bg-bg-floating px-2 py-2 transition-colors hover:bg-bg-basement focus:outline-none focus-visible:ring-4 focus-visible:ring-neutral-1000-a05"
          >
            {body}
          </a>
        );
      })}
    </div>
  );
};

const stripCompanySnapshotChrome = (markdown: string) => {
  const lines = markdown.trim().split(/\r?\n/);
  if (lines[0]?.startsWith("# ")) {
    lines.shift();
  }
  while (lines[0]?.trim() === "") {
    lines.shift();
  }
  if (/^(조사일|investigation date)\s*:/i.test(lines[0] ?? "")) {
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

const formatSnapshotInvestigationDate = (
  value: string | null | undefined,
  locale: Locale
) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
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
  const t = useCareerT();

  const { locale } = useMessages();
  const { fetchWithAuth } = useCareerApi();
  const companyDbId = item?.companyDbId ?? null;
  const companyWorkspaceId = item?.companyWorkspaceId ?? null;
  const leadershipQuery = useQuery({
    queryKey: [
      "career-company-leadership",
      companyWorkspaceId,
      companyDbId,
      locale,
    ],
    enabled: Boolean(item && (companyWorkspaceId || companyDbId)),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (companyWorkspaceId) {
        params.set("companyWorkspaceId", companyWorkspaceId);
      }
      if (companyDbId) {
        params.set("companyDbId", String(companyDbId));
      }
      const response = await fetchWithAuth(
        `/api/talent/company-leadership?${params.toString()}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as CompanyLeadershipPayload &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.company.company_detail_view.0h3m8a3",
              "창업자 정보를 불러오지 못했습니다."
            )
          )
        );
      }

      return Array.isArray(payload.leaders) ? payload.leaders : [];
    },
    staleTime: 5 * 60_000,
  });

  if (loading) {
    return (
      <section className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-neutral-soft" />
      </section>
    );
  }

  if (!item) {
    return (
      <section className="rounded-[8px] border border-neutral-1000-a05 bg-bg-floating px-5 py-10 text-center shadow-sm">
        <Building2 className="mx-auto h-6 w-6 text-neutral-disabled" />
        <h2 className="mt-4 text-[16px] font-medium text-neutral-primary">
          {t(
            "career.company.company_detail_view.05y0iqp",
            "회사를 찾지 못했습니다."
          )}
        </h2>
        {/* <ActionButton
          actionVariant="secondary"
          buttonRadius="rounded"
          onClick={onBack}
          className="mt-5 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          워치리스트로 돌아가기
        </ActionButton> */}
      </section>
    );
  }

  const links = [
    {
      href: item.homepageUrl ?? item.websiteUrl,
      label: t("career.company.company_detail_view.18zvias", "웹사이트"),
    },
    { href: item.linkedinUrl, label: "LinkedIn" },
    {
      href: item.careerUrl,
      label: t("career.company.company_detail_view.1si5hsi", "채용 페이지"),
    },
    { href: item.fundingUrl, label: "Funding" },
  ]
    .filter((entry): entry is { href: string; label: string } =>
      Boolean(entry.href)
    )
    .map((entry) => ({
      ...entry,
      iconUrl: getFaviconUrl(entry.href),
    }));
  const employeeCount = formatEmployeeCountRange(
    item.employeeCountRange,
    locale,
    t
  );
  const displayLocation = formatCareerLocation(item.location, locale);
  const lastFundingStage = parseFundingStageLabel(
    item.companyData?.lastFundingStage
  );
  const lastFundingRoundStage = parseFundingStageLabel(
    item.companyData?.lastFundingRoundDescription
  );
  const displayFundingStage = lastFundingStage || lastFundingRoundStage;

  const infoRows = [
    displayFundingStage
      ? {
          icon: (
            <TrendingUp
              className="h-3.5 w-3.5 text-neutral-muted"
              strokeWidth={2}
            />
          ),
          label: "",
          value: t(
            "career.company.company_data.last_funding_stage",
            "{stage}",
            { values: { stage: displayFundingStage } }
          ),
        }
      : null,
    displayLocation
      ? {
          icon: (
            <MapPin
              className="h-3.5 w-3.5 text-neutral-muted"
              strokeWidth={2}
            />
          ),
          label: t("career.company.company_detail_view.198i5rb", "본사 위치"),
          value: displayLocation,
        }
      : null,
    item.foundedYear
      ? {
          icon: (
            <Calendar
              className="h-3.5 w-3.5 text-neutral-muted"
              strokeWidth={2}
            />
          ),
          label: t("career.company.company_detail_view.02ioip6", "설립 연도"),
          value: formatFoundedYear(item.foundedYear, locale, t),
        }
      : null,
    employeeCount
      ? {
          icon: (
            <Users className="h-3.5 w-3.5 text-neutral-muted" strokeWidth={2} />
          ),
          label: t("career.company.company_detail_view.01kpxqk", "직원 수"),
          value: employeeCount,
        }
      : null,
  ].filter((row) => row !== null);
  const totalFundingRaised = getKnownCompanyDataText(
    item.companyData?.totalFundingRaised
  );
  const mainInvestors = getKnownCompanyDataText(
    item.companyData?.mainInvestors
  );
  const showCompanyDataRows = locale === "ko";
  const companyDataRows = showCompanyDataRows
    ? [
        totalFundingRaised
          ? {
              icon: (
                <CircleDollarSign
                  className="h-3.5 w-3.5 text-neutral-muted"
                  strokeWidth={2}
                />
              ),
              label: t(
                "career.company.company_data.total_funding_raised_label",
                "총 투자"
              ),
              value: t(
                "career.company.company_data.total_funding_raised",
                "총 투자 {amount}",
                { values: { amount: totalFundingRaised } }
              ),
            }
          : null,
        mainInvestors
          ? {
              icon: (
                <Handshake
                  className="h-3.5 w-3.5 text-neutral-muted"
                  strokeWidth={2}
                />
              ),
              label: t(
                "career.company.company_data.main_investors_label",
                "주요 투자자"
              ),
              value: t(
                "career.company.company_data.main_investors",
                "주요 투자자 {investors}",
                { values: { investors: mainInvestors } }
              ),
            }
          : null,
        lastFundingRoundStage
          ? {
              icon: (
                <FileText
                  className="h-3.5 w-3.5 text-neutral-muted"
                  strokeWidth={2}
                />
              ),
              label: t(
                "career.company.company_data.last_funding_round_description_label",
                "최근 라운드"
              ),
              value: t(
                "career.company.company_data.last_funding_round_description",
                "최근 라운드 {description}",
                { values: { description: lastFundingRoundStage } }
              ),
            }
          : null,
      ].filter((row) => row !== null)
    : [];

  const investorTags = splitTextList(item.investors, 24);
  const relatedLinks = (item.relatedLinks ?? [])
    .map((link) => String(link ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const snapshotMarkdown = item.companySnapshot?.fullMarkdown
    ? stripCompanySnapshotChrome(item.companySnapshot.fullMarkdown)
    : "";
  logger.log("snapshotMarkdown", snapshotMarkdown);
  const snapshotInvestigationDate = formatSnapshotInvestigationDate(
    item.companySnapshot?.investigationDate,
    locale
  );

  const crunchbaseInformation = toRecord(item.crunchbaseInformation);
  const crunchbaseCompany = toRecord(crunchbaseInformation.company);
  const crunchbaseTaxonomy = toRecord(crunchbaseInformation.taxonomy);
  const crunchbaseScores = toRecord(crunchbaseInformation.scores);
  const leadershipPeople = leadershipQuery.data ?? [];
  const showLeadershipSection =
    leadershipQuery.isLoading || leadershipPeople.length > 0;
  const crunchbaseStatusRows = [
    {
      label: t("career.company.company_detail_view.0lq2ran", "운영 상태"),
      value: formatCrunchbaseLabel(crunchbaseCompany.operating_status),
    },
    {
      label: t("career.company.company_detail_view.0vk24i0", "회사 유형"),
      value: formatCrunchbaseLabel(crunchbaseCompany.company_type),
    },
    {
      label: t("career.company.company_detail_view.0d3086e", "IPO 상태"),
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
  const crunchbaseLocationGroups = toStringArray(
    crunchbaseTaxonomy.location_groups,
    12
  );
  const hasCrunchbase =
    crunchbaseStatusRows.length > 0 ||
    crunchbaseMetricRows.length > 0 ||
    crunchbaseCategories.length > 0 ||
    crunchbaseLocationGroups.length > 0;

  return (
    <section className="min-w-0">
      {/* <ActionButton
        actionVariant="secondary"
        buttonRadius="rounded"
        onClick={onBack}
        className="h-auto border-transparent bg-transparent px-0 text-[13px] text-neutral-muted hover:translate-y-0 hover:border-transparent hover:bg-transparent hover:text-neutral-primary hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        워치리스트로 돌아가기
      </ActionButton> */}

      <header className="mt-4">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <CompanyLogo logoUrl={item.logoUrl} name={item.name} size="lg" />
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Text
                  as="h1"
                  variant="head1"
                  tone="primary"
                  className="wrap-break-word text-[24px] md:text-[28px] font-semibold leading-8"
                >
                  {item.name}
                </Text>
                {item.followedAt ? (
                  <span className="rounded-full bg-bg-weak px-2.5 py-1 text-[12px] leading-none text-neutral-muted">
                    {formatFollowedAt(item.followedAt, locale, t)}
                  </span>
                ) : null}
              </div>
              <Text
                className="max-w-[780px] text-[14px] line-clamp-3"
                tone="muted"
              >
                {item.shortDescription ??
                  displayLocation ??
                  t(
                    "career.company.company_card.1n9j2yp",
                    "회사 설명을 정리 중입니다."
                  )}
              </Text>

              {links.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {links.map((link) => (
                    <Badge
                      onClick={() => window.open(link.href, "_blank")}
                      key={link.label}
                      icon={<LinkPillIcon iconUrl={link.iconUrl} />}
                    >
                      {link.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 flex items-end justify-end">
            <FollowButton
              disabled={updating}
              following={item.following}
              onClick={(event) => onToggleFollow(item, event)}
            />
          </div>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        {infoRows.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {infoRows.map((row) => (
              <div
                key={row.label}
                className="flex flex-row items-center gap-1.5 text-sm text-neutral-primary"
              >
                {row.icon && row.icon}
                <span className="font-normal">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {companyDataRows.length > 0 ? (
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {companyDataRows.map((row) => (
              <div
                key={row.label}
                className="flex min-w-0 max-w-full flex-row items-start gap-1.5 text-sm text-neutral-primary"
              >
                <span className="mt-0.5 shrink-0">{row.icon}</span>
                <span className="min-w-0 wrap-break-word font-normal">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        {snapshotMarkdown ? (
          <DetailSection
            title={t(
              "career.company.company_detail_view.1im9ivy",
              "Harper가 찾아본 내용"
            )}
          >
            <div className="">
              {snapshotInvestigationDate ? (
                <div className="mb-4 inline-flex rounded-full bg-bg-weak px-2.5 py-1 text-[12px] font-medium leading-none text-neutral-muted">
                  {t("career.company.snapshot.investigation_date", "조사일")}{" "}
                  {snapshotInvestigationDate}
                </div>
              ) : null}
              <RichText
                content={snapshotMarkdown}
                className="text-neutral-primary/85"
              />
            </div>
          </DetailSection>
        ) : (
          <DetailSection
            title={t("career.company.company_detail_view.0izicuk", "회사 설명")}
          >
            <Text
              className="whitespace-pre-wrap text-sm leading-6"
              tone="neutral"
            >
              {item.description ??
                t("career.common.career.083cky2", "아직 회사 설명이 없습니다.")}
            </Text>
          </DetailSection>
        )}

        {item.specialities.length > 0 ? (
          <DetailSection
            title={t("career.company.company_detail_view.0qsmhob", "전문 분야")}
          >
            <TagList items={item.specialities} />
          </DetailSection>
        ) : null}

        {investorTags.length > 0 ? (
          <DetailSection
            title={t("career.company.company_detail_view.1u6998j", "투자자")}
          >
            <TagList items={investorTags} />
          </DetailSection>
        ) : null}

        {showLeadershipSection ? (
          <DetailSection
            title={t("career.company.company_detail_view.1sihgzp", "창업자")}
          >
            <LeadershipList
              loading={leadershipQuery.isLoading}
              locale={locale}
              people={leadershipPeople}
            />
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
                  <div className="mb-2 text-[12px] leading-5 text-neutral-muted">
                    {t(
                      "career.company.company_detail_view.199tx5d",
                      "카테고리"
                    )}
                  </div>
                  <TagList items={crunchbaseCategories} />
                </div>
              ) : null}
              {crunchbaseLocationGroups.length > 0 ? (
                <div>
                  <div className="mb-2 text-[12px] leading-5 text-neutral-muted">
                    {t(
                      "career.company.company_detail_view.0gx8zud",
                      "지역 그룹"
                    )}
                  </div>
                  <TagList items={crunchbaseLocationGroups} />
                </div>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        {relatedLinks.length > 0 ? (
          <DetailSection
            title={t("career.company.company_detail_view.1gy0i9e", "관련 링크")}
          >
            <div className="space-y-2">
              {relatedLinks.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center justify-between gap-3 text-[13px] leading-6 text-neutral-muted transition-colors hover:text-neutral-primary"
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
