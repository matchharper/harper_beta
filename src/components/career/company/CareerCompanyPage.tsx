import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Badge } from "@/components/ui/badge";
import { BareButton, MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";
import { useCareerCompanyFollowContext } from "@/components/career/CareerSidebarContext";
import { getErrorMessage } from "@/hooks/career/careerHelpers";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerCompanyProfile } from "@/hooks/career/useCareerCompanyProfile";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { stripSentenceSourceLinks } from "@/lib/career/companies/sourceLinks";
import {
  getReliableHeadcount,
  smoothHeadcountMonths,
  type CompanyProfile,
} from "@/lib/career/companyProfileTypes";
import {
  getFaviconUrlForWebsite,
  getSchoolDisplayName,
} from "@/lib/career/schoolDisplay";
import { cn } from "@/lib/utils";
import type { CareerHistoryOpportunity } from "../types";
import CompanyJobsList from "../watchlist/CompanyJobsList";
import { CompanyLogo } from "../watchlist/CompanyLogo";
import { FollowButton } from "../watchlist/FollowButton";
import type {
  CompanyDetailPayload,
  CompanyLeadershipPerson,
  CompanySummary,
  CompanyWatchlistItem,
} from "../watchlist/watchlistTypes";
import CompanyFactsGrid from "./CompanyFactsGrid";
import {
  FundingRoundLane,
  HeadcountChart,
  InvestorList,
  OrganizationRanking,
  PeopleFlow,
  formatMonthLabel,
} from "./CompanyProfileCharts";

export const COMPANY_DETAIL_QUERY_KEY = "career-company-watchlist-detail";

/** The company record (name, links, follow state) the watchlist API serves. */
export function useCareerCompanyDetail(companyDbId: number | null | undefined) {
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const { user } = useCareerCompanyFollowContext();
  const t = useCareerT();
  return useQuery({
    queryKey: [
      COMPANY_DETAIL_QUERY_KEY,
      user?.id ?? null,
      companyDbId,
      undefined,
      locale,
    ],
    enabled: Boolean(user && companyDbId),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({
        locale,
        companyDbId: String(companyDbId),
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params}`
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as CompanyDetailPayload & Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            t(
              "career.company.career_company_detail_drawer.0amy3om",
              "회사 정보를 불러오지 못했습니다."
            )
          )
        );
      }
      return payload.item ?? null;
    },
  });
}

function useCompanyFollow(item: CompanyWatchlistItem | null) {
  const t = useCareerT();
  const queryClient = useQueryClient();
  const { onUpdateCompanyFollow } = useCareerCompanyFollowContext();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const isFollowing = following ?? item?.following ?? false;
  const toggle = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!item) return;
    setPending(true);
    setError("");
    try {
      const result = await onUpdateCompanyFollow({
        action: isFollowing ? "unfollow" : "follow",
        companyDbId: item.companyDbId,
        companyWorkspaceId: item.companyWorkspaceId,
        source: "company_page",
      });
      if (!result) throw new Error();
      setFollowing(!isFollowing);
      await queryClient.invalidateQueries({
        queryKey: ["career-company-watchlist"],
      });
      await queryClient.invalidateQueries({
        queryKey: [COMPANY_DETAIL_QUERY_KEY],
      });
    } catch {
      setError(
        t(
          "career.common.career_flow_provider.19x0zaz",
          "회사 팔로우 상태를 변경하지 못했습니다."
        )
      );
    } finally {
      setPending(false);
    }
  };
  return { error, isFollowing, pending, toggle };
}

/** Logo, name, one line and follow; the same on every company surface. */
export function CompanyHeader({
  fallback,
  item,
  onOpenCompany,
  showLinks = false,
}: {
  fallback: {
    description?: string | null;
    logoUrl?: string | null;
    name: string;
  };
  item: CompanyWatchlistItem | null;
  /** Makes the name open the company page. */
  onOpenCompany?: () => void;
  showLinks?: boolean;
}) {
  const t = useCareerT();
  const follow = useCompanyFollow(item);
  const name = item?.name ?? fallback.name;
  const description =
    item?.shortDescription ??
    (fallback.description && fallback.description.length <= 160
      ? fallback.description
      : null);
  const links = showLinks
    ? [
        {
          href: item?.homepageUrl ?? item?.websiteUrl,
          label: t("career.company.company_detail_view.18zvias", "웹사이트"),
        },
        { href: item?.linkedinUrl, label: "LinkedIn" },
        {
          href: item?.careerUrl,
          label: t("career.company.company_detail_view.1si5hsi", "채용 페이지"),
        },
      ].filter((link): link is { href: string; label: string } =>
        Boolean(link.href)
      )
    : [];

  return (
    <header>
      <div className="flex min-w-0 items-start gap-3.5">
        <CompanyLogo
          logoUrl={item?.logoUrl ?? fallback.logoUrl ?? null}
          name={name}
          size="md"
        />
        <div className="min-w-0 flex-1">
          {onOpenCompany ? (
            <BareButton
              type="button"
              onClick={onOpenCompany}
              className="max-w-full truncate text-left text-[20px] font-semibold leading-7 tracking-[-0.02em] hover:underline hover:underline-offset-4"
            >
              {name}
            </BareButton>
          ) : (
            <h1 className="truncate text-[20px] font-semibold leading-7 tracking-[-0.02em]">
              {name}
            </h1>
          )}
          {description ? (
            <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-[1.5] text-neutral-muted">
              {description}
            </p>
          ) : null}
          {links.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {links.map((link) => {
                const icon = getFaviconUrlForWebsite(link.href);
                return (
                  <Badge
                    key={link.label}
                    onClick={() =>
                      window.open(link.href, "_blank", "noopener,noreferrer")
                    }
                    icon={
                      icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          aria-hidden
                          className="size-3.5 rounded-sm"
                          src={icon}
                        />
                      ) : (
                        <ArrowUpRight aria-hidden className="size-3.5" />
                      )
                    }
                  >
                    {link.label}
                  </Badge>
                );
              })}
            </div>
          ) : null}
        </div>
        {item ? (
          <div className="shrink-0 pt-0.5">
            <FollowButton
              disabled={follow.pending}
              following={follow.isFollowing}
              onClick={follow.toggle}
            />
          </div>
        ) : null}
      </div>
      {follow.error ? (
        <p role="alert" className="mt-2 text-sm text-critical">
          {follow.error}
        </p>
      ) : null}
    </header>
  );
}

function Section({
  aside,
  children,
  id,
  sub,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  id?: string;
  sub?: ReactNode;
  title: string;
}) {
  return (
    <section id={id} className="scroll-mt-16 pt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-semibold text-neutral-primary">
          {title}
        </h2>
        {aside ? (
          <span className="shrink-0 text-[12px] text-neutral-soft">
            {aside}
          </span>
        ) : null}
      </div>
      {sub ? (
        <p className="-mt-2 mb-3 text-[13px] leading-6 text-neutral-muted">
          {sub}
        </p>
      ) : null}
      {children}
    </section>
  );
}

function SubTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "mb-2 text-[13px] font-semibold text-neutral-primary",
        className
      )}
    >
      {children}
    </h3>
  );
}

function ExpandableMarkdown({ content }: { content: string }) {
  const t = useCareerT();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [height, setHeight] = useState(0);
  const limit = 168;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setHeight(element.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [content]);
  const truncated = height > limit + 40;
  return (
    <div>
      <div
        id={id}
        className={cn(
          "overflow-clip",
          truncated &&
            !expanded &&
            "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]"
        )}
        style={{ maxHeight: truncated && !expanded ? limit : undefined }}
      >
        <div ref={ref} className="flow-root">
          <RichText
            variant="career"
            typography="body"
            referenceLinks
            className="text-neutral-primary/85"
            content={content}
          />
        </div>
      </div>
      {truncated ? (
        <MuteButton
          aria-controls={id}
          aria-expanded={expanded}
          className="mt-1 gap-1"
          size="sm"
          variant="transparent"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? t(
                "career.history.opportunity_recommendation_preview.collapse",
                "접기"
              )
            : t(
                "career.history.opportunity_recommendation_preview.show_more",
                "더보기"
              )}
          <ChevronDown
            aria-hidden
            className={cn("size-3.5", expanded && "rotate-180")}
          />
        </MuteButton>
      ) : null}
    </div>
  );
}

/** The person's profile photo, or the first letter of their name when there is none. */
function PersonAvatar({ name, url }: { name: string; url?: string | null }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="size-7 shrink-0 rounded-full bg-neutral-1000-a05 object-cover"
      loading="lazy"
      src={url}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-neutral-1000-a05 text-[12px] font-semibold text-neutral-muted">
      {name.slice(0, 1)}
    </span>
  );
}

function Founders({ people }: { people: CompanyLeadershipPerson[] }) {
  const { locale } = useMessages();
  return (
    <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {people.map((person) => {
        const education = person.education
          .map((entry) => getSchoolDisplayName(entry.school, locale))
          .filter(Boolean)
          .slice(0, 1)
          .join(", ");
        const detail = [
          person.previousCompanies.slice(0, 2).join(", "),
          education,
        ]
          .filter(Boolean)
          .join(" · ");
        const body = (
          <>
            <PersonAvatar name={person.name} url={person.profilePictureUrl} />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium text-neutral-primary">
                {person.name}
                {person.role ? (
                  <span className="ml-1.5 text-[12px] font-medium text-neutral-muted">
                    {person.role}
                  </span>
                ) : null}
              </span>
              {detail ? (
                <span className="block truncate text-[12px] leading-5 text-neutral-primary/80">
                  {detail}
                </span>
              ) : null}
            </span>
          </>
        );
        return (
          <li key={person.candidId}>
            {person.linkedinUrl ? (
              <a
                href={person.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="-mx-2 flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-1000-a05"
              >
                {body}
              </a>
            ) : (
              <div className="flex min-w-0 items-center gap-2.5 py-2">
                {body}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function GrowthSection({ profile }: { profile: CompanyProfile }) {
  const t = useCareerT();
  const { locale } = useMessages();
  const months = smoothHeadcountMonths(profile.headcount);
  const headcount = getReliableHeadcount(months);
  if (!headcount) return null;
  const note =
    headcount.hires !== null && headcount.leaves !== null
      ? t(
          "career.company.page.hires_leaves",
          "이 기간에 {hires}명이 입사하고 {leaves}명이 퇴사했어요.",
          { values: { hires: headcount.hires, leaves: headcount.leaves } }
        )
      : null;
  return (
    <Section
      id="company-growth"
      title={t("career.company.page.headcount_chart", "월별 인원")}
      aside={t("career.company.page.months_range", "{from} ~ {to}", {
        values: {
          from: formatMonthLabel(headcount.firstMonth, locale),
          to: formatMonthLabel(headcount.lastMonth, locale),
        },
      })}
    >
      <HeadcountChart locale={locale} months={months} />
      {note ? (
        <p className="mt-2 text-[12.5px] text-neutral-muted">{note}</p>
      ) : null}
    </Section>
  );
}

function FundingSection({ profile }: { profile: CompanyProfile }) {
  const t = useCareerT();
  const { locale } = useMessages();
  const funding = profile.funding;
  if (
    !funding ||
    (funding.rounds.length === 0 &&
      funding.investors.length === 0 &&
      !funding.lastRound)
  ) {
    return null;
  }
  const single = funding.rounds.length < 2 ? funding.lastRound : null;
  return (
    <Section
      id="company-funding"
      title={t("career.company.page.funding", "투자")}
    >
      {funding.rounds.length >= 2 ? (
        <FundingRoundLane
          lastAmount={funding.lastRound?.amount ?? null}
          rounds={funding.rounds}
        />
      ) : single ? (
        <p className="text-[14px] text-neutral-primary">
          {[
            single.date ? formatMonthLabel(single.date, locale) : null,
            single.stage,
            single.amount,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      ) : null}
      {funding.investors.length > 0 ? (
        <>
          <SubTitle className="mt-5">
            {t("career.company.page.investors", "투자사")}
          </SubTitle>
          <InvestorList investors={funding.investors} />
        </>
      ) : null}
    </Section>
  );
}

function PeopleSection({
  companyName,
  leaders,
  profile,
}: {
  companyName: string;
  leaders: CompanyLeadershipPerson[];
  profile: CompanyProfile | null;
}) {
  const t = useCareerT();
  const people = profile?.people ?? null;
  if (!people && leaders.length === 0) return null;

  const otherLabel = t("career.company.page.flow_other", "그 외");
  const muted = (name: string, count: number, tooltip: string) => ({
    count,
    logoUrl: null,
    muted: true,
    name,
    tooltip,
  });
  const inbound = people
    ? [
        ...people.previous.map((org) => ({
          ...org,
          tooltip: t(
            "career.company.page.flow_in",
            "{company}에서 {count}명이 왔어요",
            { values: { company: org.name, count: org.count } }
          ),
        })),
        ...(people.firstJobCount > 0
          ? [
              muted(
                t("career.company.page.flow_first_job", "첫 직장"),
                people.firstJobCount,
                t(
                  "career.company.page.flow_first_job_tip",
                  "{count}명은 이곳이 첫 직장이에요",
                  { values: { count: people.firstJobCount } }
                )
              ),
            ]
          : []),
        ...(people.previousOther > 0
          ? [
              muted(
                otherLabel,
                people.previousOther,
                t(
                  "career.company.page.flow_in_other",
                  "그 외 회사에서 {count}명이 왔어요",
                  { values: { count: people.previousOther } }
                )
              ),
            ]
          : []),
      ]
    : [];
  const outbound = people
    ? [
        ...people.next.map((org) => ({
          ...org,
          tooltip: t(
            "career.company.page.flow_out",
            "{count}명이 {company}(으)로 옮겼어요",
            { values: { company: org.name, count: org.count } }
          ),
        })),
        ...(people.nextFounded > 0
          ? [
              muted(
                t("career.company.page.flow_founded", "직접 창업"),
                people.nextFounded,
                t(
                  "career.company.page.flow_founded_tip",
                  "{count}명이 직접 창업했어요",
                  { values: { count: people.nextFounded } }
                )
              ),
            ]
          : []),
        ...(people.nextOther > 0
          ? [
              muted(
                otherLabel,
                people.nextOther,
                t(
                  "career.company.page.flow_out_other",
                  "{count}명이 그 외 회사로 옮겼어요",
                  { values: { count: people.nextOther } }
                )
              ),
            ]
          : []),
      ]
    : [];
  const hasMine = people
    ? [...people.previous, ...people.next].some((org) => org.mine)
    : false;
  const summary = people
    ? [
        t("career.company.page.people_profiles", "프로필 {count}명", {
          values: { count: people.profileCount.toLocaleString() },
        }),
        people.averageYears
          ? t("career.company.page.people_years", "평균 경력 {years}년", {
              values: { years: people.averageYears },
            })
          : null,
        people.engineerShare !== null && people.engineerShare > 0
          ? t("career.company.page.people_engineers", "엔지니어 {percent}%", {
              values: { percent: Math.round(people.engineerShare * 100) },
            })
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <Section
      id="company-people"
      title={t("career.company.page.people", "구성원")}
      sub={summary}
    >
      {leaders.length > 0 ? (
        <>
          <SubTitle>
            {t("career.company.company_detail_view.1sihgzp", "창업자")}
          </SubTitle>
          <Founders people={leaders} />
        </>
      ) : null}
      {people && (inbound.length > 0 || outbound.length > 0) ? (
        <>
          <SubTitle className={leaders.length > 0 ? "mt-6" : undefined}>
            {t("career.company.page.flow_title", "어디서 오고, 어디로 갔는지")}
          </SubTitle>
          <PeopleFlow
            companyName={companyName}
            inbound={inbound}
            outbound={outbound}
            inboundTitle={t("career.company.page.flow_previous", "이전 회사")}
            outboundTitle={t("career.company.page.flow_next", "다음 회사")}
          />
          <p className="mt-2 text-[12.5px] leading-5 text-neutral-muted">
            {t(
              "career.company.page.flow_caption",
              "지금 다니는 {current}명이 직전에 다닌 회사와, 그만둔 {departed}명이 옮긴 회사예요.",
              {
                values: {
                  current: people.currentCount,
                  departed: people.departedCount,
                },
              }
            )}
            {hasMine
              ? ` ${t("career.company.page.flow_mine", "파란 글씨는 회원님이 다녔던 회사예요.")}`
              : ""}
          </p>
        </>
      ) : null}
      {people && people.schools.length > 0 ? (
        <>
          <SubTitle className="mt-6">
            {t("career.company.page.schools", "출신 학교")}
          </SubTitle>
          <OrganizationRanking
            items={people.schools}
            mineLabel={t("career.company.page.my_school", "회원님 모교")}
            school
            total={people.profileCount}
          />
        </>
      ) : null}
    </Section>
  );
}

/**
 * Everything below a company's header and facts: description, headcount,
 * funding, people and open roles. Shared by the company page and
 * the 회사 정보 tab of a saved opportunity.
 */
export function CompanyProfileSections({
  companyDbId,
  companyName,
  excludeRoleId,
  item,
  onOpenOpportunity,
  otherOpportunities = [],
}: {
  companyDbId: number;
  companyName: string;
  excludeRoleId?: string | null;
  item: CompanyWatchlistItem | null;
  onOpenOpportunity?: (item: CareerHistoryOpportunity) => void;
  otherOpportunities?: readonly CareerHistoryOpportunity[];
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const { fetchWithAuth } = useCareerApi();
  const profileQuery = useCareerCompanyProfile(companyDbId);
  const summaryQuery = useQuery({
    queryKey: ["career-company-watchlist-summary", companyDbId, locale],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const params = new URLSearchParams({
        companyDbId: String(companyDbId),
        section: "summary",
        locale,
      });
      const response = await fetchWithAuth(
        `/api/talent/company-watchlist?${params}`
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as {
        summary?: CompanySummary | null;
      };
      return payload.summary ?? null;
    },
  });
  const leadershipQuery = useQuery({
    queryKey: [
      "career-company-leadership",
      item?.companyWorkspaceId ?? null,
      companyDbId,
      locale,
    ],
    enabled: Boolean(item),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ companyDbId: String(companyDbId) });
      if (item?.companyWorkspaceId) {
        params.set("companyWorkspaceId", item.companyWorkspaceId);
      }
      const response = await fetchWithAuth(
        `/api/talent/company-leadership?${params}`
      );
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        leaders?: CompanyLeadershipPerson[];
      };
      return Array.isArray(payload.leaders) ? payload.leaders : [];
    },
  });
  const about = stripSentenceSourceLinks(summaryQuery.data?.markdown ?? "");
  const profile = profileQuery.data ?? null;
  const leaders = leadershipQuery.data ?? [];

  return (
    <>
      {about ? (
        <div className="mt-8">
          <ExpandableMarkdown content={about} />
        </div>
      ) : summaryQuery.isLoading ? (
        <div className="mt-8 space-y-2">
          <div className="h-4 w-full animate-pulse rounded bg-neutral-1000-a05" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-neutral-1000-a05" />
        </div>
      ) : null}

      {profileQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2
            aria-hidden
            className="size-5 animate-spin text-neutral-soft"
          />
        </div>
      ) : profile ? (
        <>
          <GrowthSection profile={profile} />
          <FundingSection profile={profile} />
        </>
      ) : null}
      <PeopleSection
        companyName={companyName}
        leaders={leaders}
        profile={profile}
      />

      {otherOpportunities.length > 0 && onOpenOpportunity ? (
        <Section
          title={t(
            "career.company.page.more_opportunities_title",
            "회원님께 추천한 다른 기회"
          )}
        >
          <ul>
            {otherOpportunities.map((opportunity) => (
              <li key={opportunity.id}>
                <BareButton
                  type="button"
                  onClick={() => onOpenOpportunity(opportunity)}
                  className="-mx-2 flex w-[calc(100%+16px)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-[14px] transition-colors hover:bg-neutral-1000-a05"
                >
                  <span className="min-w-0 truncate">{opportunity.title}</span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 shrink-0 text-neutral-soft"
                  />
                </BareButton>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section
        id="company-jobs"
        title={t("career.company.page.jobs", "채용 공고")}
        sub={t(
          "career.company.page.jobs_fit",
          "회원님과 맞을 만한 공고를 먼저 보여드려요."
        )}
      >
        <CompanyJobsList
          bare
          companyDbId={companyDbId}
          excludeRoleId={excludeRoleId}
          previewLimit={4}
        />
      </Section>
    </>
  );
}

/** A company opened from an opportunity, as its own page. */
export default function CareerCompanyPage({
  backLabel,
  companyDbId,
  excludeRoleId,
  fallback,
  onBack,
  onOpenOpportunity,
  otherOpportunities = [],
}: {
  backLabel: string;
  companyDbId: number;
  excludeRoleId?: string | null;
  /** What the opportunity already knows, shown while the company loads. */
  fallback?: {
    description?: string | null;
    logoUrl?: string | null;
    name: string;
  } | null;
  onBack: () => void;
  onOpenOpportunity?: (item: CareerHistoryOpportunity) => void;
  otherOpportunities?: readonly CareerHistoryOpportunity[];
}) {
  const pageRef = useRef<HTMLElement>(null);
  const detailQuery = useCareerCompanyDetail(companyDbId);
  const profileQuery = useCareerCompanyProfile(companyDbId);
  const item = detailQuery.data ?? null;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      pageRef.current?.focus({ preventScroll: true });
      pageRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [companyDbId]);

  const name = item?.name ?? fallback?.name ?? "";

  return (
    <section
      ref={pageRef}
      tabIndex={-1}
      aria-label={name}
      data-career-wide-page=""
      className="min-w-0 pb-10 text-neutral-primary outline-none"
    >
      <div className="mb-2 flex items-center">
        <MuteButton variant="transparent" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          {backLabel}
        </MuteButton>
      </div>
      <CompanyHeader
        fallback={{
          name,
          description: fallback?.description,
          logoUrl: fallback?.logoUrl,
        }}
        item={item}
        showLinks
      />
      {detailQuery.error instanceof Error ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {detailQuery.error.message}
        </p>
      ) : null}
      <CompanyFactsGrid
        className="mt-6"
        profile={profileQuery.data}
        basics={{
          employeeCountRange: item?.employeeCountRange,
          foundedYear: item?.foundedYear,
          location: item?.location,
        }}
      />
      <CompanyProfileSections
        companyDbId={companyDbId}
        companyName={name}
        excludeRoleId={excludeRoleId}
        item={item}
        otherOpportunities={otherOpportunities}
        onOpenOpportunity={onOpenOpportunity}
      />
    </section>
  );
}
