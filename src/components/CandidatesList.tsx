import { useLogEvent } from "@/hooks/useLog";
import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import type { CandidateMarkStatus } from "@/lib/candidateMark";
import {
  buildGithubDeveloperTooltip,
  formatGithubFollowerCount,
  formatGithubRepoCount,
} from "@/lib/githubPreview";
import {
  buildScholarResearchTooltip,
  formatScholarCitationCount,
  formatScholarPaperCount,
} from "@/lib/scholarPreview";
import {
  buildEvidencePaperMeta,
  buildEvidencePaperTooltip,
  getEvidencePaper,
} from "@/lib/searchEvidence";
import {
  SearchSource,
  extractSearchSourcesFromLinks,
  getSearchSourceLabel,
  getSearchSourceLogoPath,
  isScholarSearchSource,
} from "@/lib/searchSource";
import { SharedFolderViewerIdentity } from "@/lib/sharedFolder";
import { SummaryScore } from "@/types/type";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  locationEnToKo,
} from "@/utils/language_map";
import { Check, Dot, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useMemo } from "react";
import {
  GithubSignalBox,
  RoleBox,
  ScholarSignalBox,
  SchoolBox,
} from "./CandidatesListTable";
import { Avatar } from "./NameProfile";
import SharedFolderCandidateNotes from "./shared/SharedFolderCandidateNotes";
import Bookmarkbutton from "./ui/bookmarkbutton";
import CandidateMarkButton from "./ui/CandidateMarkButton";
import CandidateMemoDock from "./ui/CandidateMemoDock";
import { Tooltips } from "./ui/tooltip";
import RevealProfileButton from "./ui/RevealProfileButton";
import { showToast } from "./toast/toast";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

function sanitizeSummaryReason(raw: string) {
  return (
    String(raw ?? "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<strong>/gi, "<span class='font-medium text-white'>")
      .replace(/<\/strong>/gi, "</span>")
      // .replace(/<\/?strong>/gi, "")
      .trim()
  );
}

function sanitizeSummaryText(raw: string | null | undefined) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseSynthesizedSummary(
  rawText: string | null | undefined
): { reason: string; score: string }[] {
  if (!rawText) return [];
  try {
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      const text = String(item ?? "");
      return {
        reason: text,
        score: text.split(",")[0] ?? "",
      };
    });
  } catch {
    return [];
  }
}

function formatYearMonth(dateStr?: string | null) {
  if (!dateStr) return "";
  if (dateStr === "Present") return "현재";

  const ymMatch = String(dateStr).match(/^(\d{4})-(\d{1,2})/);
  if (ymMatch) {
    return `${ymMatch[1]}.${ymMatch[2].padStart(2, "0")}`;
  }

  const d = new Date(dateStr);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  return String(dateStr)
    .replace(/년\s?/g, ".")
    .replace(/월/g, "")
    .replace(/\s+/g, "");
}

function formatPeriod(startDate?: string | null, endDate?: string | null) {
  const start = formatYearMonth(startDate);
  const end = endDate ? formatYearMonth(endDate) || endDate : "";

  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start} ~ 현재`;
  if (end) return `~ ${end}`;
  return "";
}

function CandidateCard({
  c,
  userId,
  criterias,
  isMyList = false,
  showShortlistMemo = true,
  sourceType = "linkedin",
  buildProfileHref,
  showBookmarkAction = true,
  showMarkAction = true,
  onMarkChange,
  sharedFolderContext = null,
}: {
  c: CandidateTypeWithConnection;
  userId?: string;
  isMyList?: boolean;
  showShortlistMemo?: boolean;
  criterias: string[];
  sourceType?: SearchSource;
  buildProfileHref?: (candidate: CandidateTypeWithConnection) => string;
  showBookmarkAction?: boolean;
  showMarkAction?: boolean;
  onMarkChange?: (status: CandidateMarkStatus | null) => void;
  sharedFolderContext?: {
    token: string;
    viewer: SharedFolderViewerIdentity | null;
  } | null;
}) {
  const router = useRouter();
  const logEvent = useLogEvent();

  const candidId = c.id;
  const sourceRunId =
    typeof router.query.run === "string" ? router.query.run : "";
  const profileHref = buildProfileHref
    ? buildProfileHref(c)
    : sourceRunId
      ? `/my/p/${candidId}?run=${encodeURIComponent(sourceRunId)}`
      : `/my/p/${candidId}`;

  const synthesizedSummary = useMemo(
    () => parseSynthesizedSummary(c.synthesized_summary?.[0]?.text),
    [c.synthesized_summary]
  );
  const shortlistSummaryText = useMemo(() => {
    return sanitizeSummaryText(c.s?.[0]?.text ?? c.summary);
  }, [c.s, c.summary]);
  const shortlistMemo = useMemo(() => {
    return String(c.shortlist_memo ?? "");
  }, [c.shortlist_memo]);

  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);

  const isBookmarked = useMemo(() => {
    return (c.connection ?? []).some((con) => con.typed === 0);
  }, [c.connection]);

  const latestCompany = exps[0];
  const school = useMemo(() => edus[0], [edus]);
  const scholarPreview = c.scholar_profile_preview;
  const githubPreview = c.github_profile_preview;
  const candidateMarkStatus = c.candidate_mark?.status ?? null;
  const sharedFolderNotes = c.shared_folder_notes ?? [];
  const evidencePaper = getEvidencePaper(c.search_evidence);
  const isScholarSource = isScholarSearchSource(sourceType);
  const isGithubSource = sourceType === "github";
  const isOnlyScholar =
    !!scholarPreview && exps.length === 0 && edus.length === 0;
  const isOnlyGithub =
    !!githubPreview && exps.length === 0 && edus.length === 0;
  const linkSources = useMemo(
    () => extractSearchSourcesFromLinks(c.links),
    [c.links]
  );
  const evidencePaperMeta = useMemo(
    () => buildEvidencePaperMeta(c.search_evidence),
    [c.search_evidence]
  );
  const evidencePaperTooltipText = useMemo(
    () => buildEvidencePaperTooltip(c.search_evidence),
    [c.search_evidence]
  );
  const suitabilityScore = useMemo(() => {
    const value = Number(c.search_rank?.suitabilityScore);
    if (!Number.isFinite(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
  }, [c.search_rank?.suitabilityScore]);

  const companyHistoryTooltipText = useMemo(() => {
    if (exps.length === 0) return "경력 정보 없음";
    return exps
      .map((exp: any) => {
        const companyName = companyEnToKo(exp?.company_db?.name ?? "-");
        const period = formatPeriod(exp?.start_date, exp?.end_date);
        return period ? `${companyName} (${period})` : companyName;
      })
      .join("\n");
  }, [exps]);

  const schoolHistoryTooltipText = useMemo(() => {
    if (edus.length === 0) return "학력 정보 없음";
    return edus
      .map((edu: any) => {
        const schoolName = koreaUniversityEnToKo(edu?.school ?? "-");
        const degreeName = degreeEnToKo(edu?.degree ?? "-");
        const period = formatPeriod(edu?.start_date, edu?.end_date);
        const title = degreeName ? `${schoolName} - ${degreeName}` : schoolName;
        return period ? `${title}\n${period}` : title;
      })
      .join("\n\n");
  }, [edus]);

  const scholarAffiliationTooltipText = useMemo(() => {
    return buildScholarResearchTooltip(scholarPreview);
  }, [scholarPreview]);
  const githubDeveloperTooltipText = useMemo(() => {
    return buildGithubDeveloperTooltip(githubPreview);
  }, [githubPreview]);
  const hasSharedFolderNotes = Boolean(sharedFolderContext?.token);
  const isProfileRevealed = c.profile_revealed !== false;
  const hasOwnerAnnotation = Boolean(
    String(shortlistMemo ?? "").trim().length > 0 || candidateMarkStatus
  );
  const shouldShowInlineMemo = Boolean(
    showShortlistMemo && (userId || hasOwnerAnnotation)
  );
  const shouldShowCornerMark = Boolean(
    showMarkAction && userId && !shouldShowInlineMemo
  );

  return (
    <div
      className={
        hasSharedFolderNotes
          ? "mx-auto flex w-full max-w-[1260px] px-4 flex-col gap-4 xl:flex-row"
          : "mx-auto w-full max-w-[760px]"
      }
    >
      <Link
        href={profileHref}
        onClick={(event) => {
          if (!isProfileRevealed) {
            event.preventDefault();
            showToast({
              message: "열람 후 프로필을 열 수 있습니다.",
              variant: "white",
            });
            return;
          }
          logEvent("candidate_card_click: " + candidId);
        }}
        className={`group relative block w-full rounded-[28px] bg-white/5 text-white transition-colors duration-200 ${
          isProfileRevealed
            ? "cursor-pointer hover:bg-white/10"
            : "cursor-default"
        } ${hasSharedFolderNotes ? "h-fit min-w-0 px-5 py-5" : "p-6"}`}
      >
        {!isProfileRevealed && !hasSharedFolderNotes ? (
          <RevealProfileButton
            candidId={candidId}
            overlay
            overlayClassName="rounded-[28px] group-hover:border-accenta1/50 group-hover:bg-black/15"
          />
        ) : null}
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-row flex-1 items-start gap-4">
              <div className="w-[40%]">
                <div className="flex flex-row flex-1 items-start gap-4">
                  <div className="cursor-pointer rounded-full border border-transparent transition-colors duration-100 hover:border-accenta1/80">
                    <Avatar
                      url={c.profile_picture}
                      name={c.name}
                      size="lg"
                      isProfileRevealed={isProfileRevealed}
                    />
                  </div>

                  <div className="flex min-w-0 flex-col items-start justify-between">
                    <div className="flex flex-col gap-0">
                      <div className="truncate text-lg font-medium">
                        {c.name ?? "None"}
                      </div>
                      {isOnlyScholar ? (
                        <div className="inline-flex w-fit items-center gap-1 rounded text-[13px] text-blue-500">
                          <div className="mt-[1px]">Scholar Profile</div>
                        </div>
                      ) : isOnlyGithub ? (
                        <div className="inline-flex w-fit items-center gap-1 rounded text-[13px] text-blue-500">
                          <div className="mt-[1px]">GitHub Profile</div>
                        </div>
                      ) : c.location ? (
                        <div className="text-sm font-normal text-hgray600">
                          {locationEnToKo(c.location)}
                        </div>
                      ) : null}
                      {suitabilityScore !== null || linkSources.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {linkSources.map((source) => (
                            <Tooltips
                              key={source}
                              text={getSearchSourceLabel(source)}
                            >
                              <span className="flex items-center justify-center">
                                <Image
                                  src={getSearchSourceLogoPath(source)}
                                  alt={getSearchSourceLabel(source)}
                                  width={source === "github" ? 16 : 15}
                                  height={source === "github" ? 16 : 15}
                                  className="object-contain"
                                />
                              </span>
                            </Tooltips>
                          ))}
                          {c.links &&
                            c.links?.length - linkSources.length > 0 && (
                              <span className="text-[13px] text-hgray700">
                                +{c.links?.length - linkSources.length}
                              </span>
                            )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-0 flex w-[60%] flex-col gap-3">
                {isScholarSource ? (
                  <>
                    <ScholarSignalBox
                      title={scholarPreview?.affiliation ?? "-"}
                      tooltipText={scholarAffiliationTooltipText}
                      icon="affiliation"
                      tooltipSide="bottom"
                      hideDescriptionWhenEmpty={true}
                    />
                    <ScholarSignalBox
                      title={
                        scholarPreview
                          ? formatScholarPaperCount(scholarPreview.paperCount)
                          : "-"
                      }
                      description={
                        scholarPreview
                          ? formatScholarCitationCount(
                              scholarPreview.citationCount
                            )
                          : "-"
                      }
                      tooltipText={buildScholarResearchTooltip(scholarPreview)}
                      icon="research"
                      tooltipSide="bottom"
                    />
                  </>
                ) : (
                  <>
                    {isOnlyScholar ? (
                      <RoleBox
                        company={scholarPreview?.affiliation ?? "-"}
                        role=""
                        tooltipText={scholarAffiliationTooltipText}
                        tooltipSide="bottom"
                      />
                    ) : null}
                    {isOnlyScholar ? (
                      <ScholarSignalBox
                        title={
                          scholarPreview
                            ? formatScholarPaperCount(scholarPreview.paperCount)
                            : "-"
                        }
                        description={
                          scholarPreview
                            ? formatScholarCitationCount(
                                scholarPreview.citationCount
                              )
                            : "-"
                        }
                        tooltipText={buildScholarResearchTooltip(
                          scholarPreview
                        )}
                        icon="research"
                        tooltipSide="bottom"
                      />
                    ) : null}
                    {isOnlyGithub ? (
                      <>
                        <GithubSignalBox
                          title={
                            githubPreview?.company ??
                            githubPreview?.location ??
                            "-"
                          }
                          tooltipText={githubDeveloperTooltipText}
                          icon="company"
                          tooltipSide="bottom"
                        />
                        <GithubSignalBox
                          title={
                            githubPreview
                              ? formatGithubRepoCount(githubPreview.publicRepos)
                              : "-"
                          }
                          description={
                            githubPreview
                              ? formatGithubFollowerCount(
                                  githubPreview.followers
                                )
                              : "-"
                          }
                          tooltipText={githubDeveloperTooltipText}
                          icon="repos"
                          tooltipSide="bottom"
                        />
                      </>
                    ) : null}
                    {latestCompany ? (
                      <RoleBox
                        company={latestCompany.company_db.name ?? ""}
                        role={latestCompany.role}
                        logoUrl={latestCompany.company_db.logo ?? ""}
                        maskLogo={!isProfileRevealed}
                        tooltipText={companyHistoryTooltipText}
                        tooltipSide="bottom"
                      />
                    ) : null}
                    {school ? (
                      <SchoolBox
                        school={school.school}
                        role={school.degree}
                        field={school.field}
                        tooltipText={schoolHistoryTooltipText}
                        tooltipSide="bottom"
                      />
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {isScholarSource && evidencePaper?.title ? (
              <Tooltips
                text={evidencePaperTooltipText || evidencePaper.title}
                side="bottom"
              >
                <div className="mt-8 flex w-full items-start gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-hgray600">Related paper</div>
                    <div className="mt-1 line-clamp-2 text-[15px] font-normal text-white/95">
                      {evidencePaper.title}
                    </div>
                    {evidencePaperMeta ? (
                      <div className="mt-1 text-sm font-normal text-hgray700">
                        {evidencePaperMeta}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Tooltips>
            ) : null}

            {(synthesizedSummary.length !== 0 ||
              (isMyList && shortlistSummaryText.length > 0)) && (
              <div className="mt-6 font-light leading-relaxed text-hgray700">
                {synthesizedSummary.length !== 0 ? (
                  <div>
                    {synthesizedSummary?.map((item: any, index: number) => (
                      <MemoizedSummaryBox
                        key={index}
                        reason={item.reason}
                        criteria={criterias[index] ?? ""}
                        score={item.score}
                      />
                    ))}
                  </div>
                ) : null}
                {isMyList && shortlistSummaryText.length > 0 ? (
                  <div
                    className={`whitespace-pre-wrap break-words text-[14px] ${
                      synthesizedSummary.length !== 0 ? "mt-6" : ""
                    }`}
                    dangerouslySetInnerHTML={{ __html: shortlistSummaryText }}
                  />
                ) : null}
              </div>
            )}
            {shouldShowInlineMemo ? (
              <div className="mt-6 border-t border-white/10 pt-4">
                <CandidateMemoDock
                  userId={userId}
                  candidId={c.id}
                  initialMemo={shortlistMemo}
                  initialMarkStatus={candidateMarkStatus}
                  onMarkChange={onMarkChange}
                  showMarkButton={
                    showMarkAction && Boolean(userId || candidateMarkStatus)
                  }
                  rows={4}
                  editorClassName="w-full"
                />
              </div>
            ) : null}
          </div>
        </div>

        {shouldShowCornerMark || (showBookmarkAction && userId) ? (
          <div
            className="absolute right-3 top-3 flex items-center justify-start gap-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {shouldShowCornerMark ? (
              <CandidateMarkButton
                userId={userId}
                candidId={c.id}
                initialStatus={candidateMarkStatus}
                onChange={onMarkChange}
              />
            ) : null}
            {showBookmarkAction && userId ? (
              <div
                className={`${
                  isBookmarked && !isMyList ? "opacity-100" : "opacity-0"
                } group-hover:opacity-100`}
              >
                <Bookmarkbutton
                  userId={userId}
                  candidId={c.id}
                  connection={c.connection}
                  isText={false}
                  size="md"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </Link>

      {sharedFolderContext?.token ? (
        <div className="w-full shrink-0 xl:w-[420px]">
          <SharedFolderCandidateNotes
            token={sharedFolderContext.token}
            candidId={c.id}
            initialNotes={sharedFolderNotes}
            viewer={sharedFolderContext.viewer}
            variant="sidecar"
          />
        </div>
      ) : null}
    </div>
  );
}
export default React.memo(CandidateCard);

const CriteriaBox = ({
  reason,
  criteria,
  score,
}: {
  reason: string;
  criteria: string;
  score: string;
}) => {
  const badeStyle = useMemo(() => {
    if (score === SummaryScore.SATISFIED) return "text-accenta1";
    if (score === SummaryScore.AMBIGUOUS) return "text-hgray900";
    if (score === SummaryScore.UNSATISFIED) return "text-hgray900";
    return "";
  }, [score]);

  const badgeIcon = useMemo(() => {
    if (score === SummaryScore.SATISFIED)
      return <Check className="w-3 h-3 text-accenta1" strokeWidth={2} />;
    if (score === SummaryScore.AMBIGUOUS)
      return <Dot className="w-3 h-3 text-hgray700" strokeWidth={2} />;
    if (score === SummaryScore.UNSATISFIED)
      return <X className="w-3 h-3 text-red-700" strokeWidth={2} />;
    return null;
  }, [score]);

  const tooltipText = useMemo(() => {
    if (score === SummaryScore.SATISFIED) return "Matches your criteria";
    if (score === SummaryScore.AMBIGUOUS)
      return "Not enough information to decide";
    if (score === SummaryScore.UNSATISFIED)
      return "Does not match this criterion";
    return "";
  }, [score]);

  const safeReasonText = useMemo(() => {
    return sanitizeSummaryReason(reason.split(",").slice(1).join(","));
  }, [reason]);

  return (
    <div className="mt-5">
      <Tooltips text={tooltipText}>
        <div
          className={`flex-row inline-flex items-center font-normal gap-1 py-1.5 px-2 rounded-md text-[12px] bg-white/5 cursor-default ${badeStyle}`}
        >
          {badgeIcon}
          <span>{criteria}</span>
        </div>
      </Tooltips>
      {/* </Tooltips> */}
      {reason && (
        <div className="mt-2 text-[14px] font-normal whitespace-pre-wrap break-words">
          <div dangerouslySetInnerHTML={{ __html: safeReasonText }} />
        </div>
      )}
    </div>
  );
};

const MemoizedSummaryBox = React.memo(CriteriaBox);
