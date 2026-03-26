import { CandidateTypeWithConnection } from "@/hooks/useSearchChatCandidates";
import React, { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, FileText, GraduationCap, Plus } from "lucide-react";
import { useRouter } from "next/router";
import { Avatar } from "./NameProfile";
import { Tooltips } from "./ui/tooltip";
import SummaryCell, { SynthItem } from "./information/SummaryCell";
import { useLogEvent } from "@/hooks/useLog";
import { getSchoolLogo } from "@/utils/school_logo";
import Link from "next/link";
import ShortlistMemoEditor from "./ui/ShortlistMemoEditor";
import CandidateMarkButton from "./ui/CandidateMarkButton";
import SharedFolderCandidateNotes from "./shared/SharedFolderCandidateNotes";
import type { CandidateMarkStatus } from "@/lib/candidateMark";
import {
  SearchSource,
  extractSearchSourcesFromLinks,
  getSearchSourceLabel,
  getSearchSourceLogoPath,
  isScholarSearchSource,
} from "@/lib/searchSource";
import {
  buildEvidencePaperMeta,
  buildEvidencePaperTooltip,
  getEvidencePaper,
} from "@/lib/searchEvidence";
import {
  buildScholarResearchTooltip,
  formatScholarCitationCount,
  formatScholarPaperCount,
} from "@/lib/scholarPreview";
import {
  buildGithubDeveloperTooltip,
  formatGithubFollowerCount,
  formatGithubRepoCount,
} from "@/lib/githubPreview";
import {
  companyEnToKo,
  degreeEnToKo,
  koreaUniversityEnToKo,
  locationEnToKo,
  majorEnToKo,
} from "@/utils/language_map";
import Bookmarkbutton from "./ui/bookmarkbutton";
import Image from "next/image";
import { SharedFolderViewerIdentity } from "@/lib/sharedFolder";
import {
  CandidateTableDetachedColumnLayout,
  CandidateTableStaticColumnId,
  isCriteriaColumnId,
  type CandidateTableColumnId,
} from "./candidateTableColumns";

const asArr = (v: any) => (Array.isArray(v) ? v : []);

function sanitizeSummaryText(raw: string | null | undefined, name: string) {
  return String(raw ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<name>/g, `${name}`)
    .replace(/<[^>]+>/g, "")
    .trim();
}

function parseSynthesizedSummary(text: string | null | undefined): SynthItem[] {
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];

    // arr item이 "만족,이유..." 같은 string이라고 가정
    return arr.map((raw: any) => {
      const s = String(raw ?? "");
      const score = s.split(",")[0] ?? "";
      const reason = s.split(",").slice(1).join(",") ?? "";
      return { score, reason };
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
  const start = formatYearMonth(startDate) || "시작 미상";
  const end = endDate ? formatYearMonth(endDate) || endDate : "현재";
  return `${start} ~ ${end}`;
}

function CandidateRow({
  c,
  userId,
  isMyList = false,
  criterias,
  orderedColumnIds,
  gridTemplateColumns,
  sharedNotesLayout,
  rowIndex,
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
  criterias: string[];
  orderedColumnIds: CandidateTableColumnId[];
  gridTemplateColumns: string;
  sharedNotesLayout?: CandidateTableDetachedColumnLayout | null;
  rowIndex: number;
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
  const candidId = c.id;
  const logEvent = useLogEvent();
  const exps = asArr(c.experience_user ?? []);
  const edus = asArr(c.edu_user ?? []);
  const sourceRunId =
    typeof router.query.run === "string" ? router.query.run : "";
  const profileHref = buildProfileHref
    ? buildProfileHref(c)
    : sourceRunId
      ? `/my/p/${candidId}?run=${encodeURIComponent(sourceRunId)}`
      : `/my/p/${candidId}`;

  const latestCompany = exps[0];
  const latestEdu = edus[0];
  const scholarPreview = c.scholar_profile_preview;
  const githubPreview = c.github_profile_preview;
  const candidateMarkStatus = c.candidate_mark?.status ?? null;
  const sharedFolderNotes = useMemo(
    () => c.shared_folder_notes ?? [],
    [c.shared_folder_notes]
  );
  const evidencePaper = getEvidencePaper(c.search_evidence);
  const isScholarSource = isScholarSearchSource(sourceType);
  const isGithubSource = sourceType === "github";
  const isOnlyScholar =
    !!scholarPreview && exps.length === 0 && edus.length === 0;
  const isOnlyGithub =
    !!githubPreview && exps.length === 0 && edus.length === 0;
  const evidencePaperMeta = useMemo(
    () => buildEvidencePaperMeta(c.search_evidence),
    [c.search_evidence]
  );
  const evidencePaperTooltipText = useMemo(
    () => buildEvidencePaperTooltip(c.search_evidence),
    [c.search_evidence]
  );
  const linkSources = useMemo(
    () => extractSearchSourcesFromLinks(c.links),
    [c.links]
  );
  const synthList = useMemo(() => {
    const rawText = c.synthesized_summary?.[0]?.text ?? "[]";
    return parseSynthesizedSummary(rawText);
  }, [c.synthesized_summary]);
  const shortlistSummaryText = useMemo(() => {
    return sanitizeSummaryText(c.s?.[0]?.text ?? c.summary, c.name ?? "");
  }, [c.s, c.summary, c.name]);
  const shortlistMemo = useMemo(() => {
    return String(c.shortlist_memo ?? "");
  }, [c.shortlist_memo]);
  const [sharedNoteCreateRequestKey, setSharedNoteCreateRequestKey] =
    useState(0);
  const [sharedNotesState, setSharedNotesState] = useState(sharedFolderNotes);

  useEffect(() => {
    setSharedNotesState(sharedFolderNotes);
  }, [sharedFolderNotes]);

  const isBookmarked = useMemo(() => {
    return (c.connection ?? []).some((con) => con.typed === 0);
  }, [c.connection]);

  const companyLogo = useMemo(() => {
    if (latestCompany?.company_db?.logo?.includes("media.licdn.com")) {
      return "";
    }
    return latestCompany?.company_db?.logo;
  }, [latestCompany]);

  const schoolLogo = useMemo(() => {
    return getSchoolLogo(latestEdu?.url);
  }, [latestEdu]);

  const companyHistoryTooltipText = useMemo(() => {
    if (exps.length === 0) return "경력 정보 없음";
    return exps
      .map((exp: any) => {
        const companyName = companyEnToKo(exp?.company_db?.name ?? "-");
        return `${companyName} (${formatPeriod(exp?.start_date, exp?.end_date)})`;
      })
      .join("\n");
  }, [exps]);

  const schoolHistoryTooltipText = useMemo(() => {
    if (edus.length === 0) return "학력 정보 없음";
    return edus
      .map((edu: any) => {
        const schoolName = koreaUniversityEnToKo(edu?.school ?? "-");
        const degreeName = degreeEnToKo(edu?.degree ?? "-");
        return `${schoolName} - ${degreeName}\n${formatPeriod(
          edu?.start_date,
          edu?.end_date
        )}`;
      })
      .join("\n\n");
  }, [edus]);

  const scholarAffiliationTooltipText = useMemo(() => {
    return buildScholarResearchTooltip(scholarPreview);
  }, [scholarPreview]);

  const githubDeveloperTooltipText = useMemo(() => {
    return buildGithubDeveloperTooltip(githubPreview);
  }, [githubPreview]);

  const renderColumnCell = (columnId: CandidateTableColumnId) => {
    if (isCriteriaColumnId(columnId)) {
      const idx = Number(columnId.split(":")[1]);
      const criteria = criterias[idx] ?? "";
      return (
        <div
          key={columnId}
          className="min-w-0 h-full flex items-center justify-center"
        >
          <SummaryCell criteria={criteria} item={synthList[idx]} />
        </div>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Company) {
      if (isGithubSource) {
        return (
          <Tooltips text={githubDeveloperTooltipText} side="bottom">
            <div>
              <Cell
                key={columnId}
                title={
                  <div className="min-w-0 whitespace-normal break-words">
                    {githubPreview?.company ?? githubPreview?.location ?? "-"}
                  </div>
                }
                description=""
                multiline
              />
            </div>
          </Tooltips>
        );
      }

      if (isOnlyGithub) {
        return (
          <Tooltips text={githubDeveloperTooltipText} side="bottom">
            <div>
              <Cell
                key={columnId}
                title={
                  <div className="min-w-0 whitespace-normal break-words">
                    {githubPreview?.company ?? githubPreview?.location ?? "-"}
                  </div>
                }
                description=""
                multiline
              />
            </div>
          </Tooltips>
        );
      }

      if (isScholarSource) {
        return (
          <Tooltips text={scholarAffiliationTooltipText} side="bottom">
            <div>
              <Cell
                key={columnId}
                title={
                  <div className="min-w-0 whitespace-normal break-words">
                    {scholarPreview?.affiliation ?? "-"}
                  </div>
                }
                description=""
                multiline
              />
            </div>
          </Tooltips>
        );
      }

      if (isOnlyScholar) {
        return (
          <Tooltips text={scholarAffiliationTooltipText} side="bottom">
            <div>
              <Cell
                key={columnId}
                title={
                  <div className="min-w-0 whitespace-normal break-words">
                    {scholarPreview?.affiliation ?? "-"}
                  </div>
                }
                description=""
                multiline
              />
            </div>
          </Tooltips>
        );
      }

      return (
        <Tooltips text={companyHistoryTooltipText} side="bottom">
          <div>
            <Cell
              key={columnId}
              title={
                latestCompany?.company_db?.name ? (
                  <div className="flex flex-row items-center justify-start gap-x-2 min-w-0 relative">
                    {companyLogo && (
                      <img
                        src={companyLogo}
                        alt={latestCompany.company_db.name}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    )}
                    <span className="text-hgray800 font-normal break-words">
                      {companyEnToKo(latestCompany.company_db.name)}
                    </span>
                  </div>
                ) : (
                  "-"
                )
              }
              description={latestCompany?.role ?? "-"}
            />
          </div>
        </Tooltips>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Evidence) {
      return (
        <Tooltips
          text={evidencePaperTooltipText || "Related paper unavailable"}
          side="bottom"
        >
          <div>
            <Cell
              key={columnId}
              title={
                <div className="min-w-0 whitespace-normal break-words">
                  {evidencePaper?.title ?? "-"}
                </div>
              }
              description={evidencePaper?.title ? evidencePaperMeta : ""}
              multiline
            />
          </div>
        </Tooltips>
      );
    }

    if (columnId === CandidateTableStaticColumnId.School) {
      if (isGithubSource) {
        return (
          <Tooltips
            text={buildGithubDeveloperTooltip(githubPreview)}
            side="bottom"
          >
            <div>
              <Cell
                key={columnId}
                title={
                  githubPreview
                    ? formatGithubRepoCount(githubPreview.publicRepos)
                    : "-"
                }
                description={
                  githubPreview
                    ? formatGithubFollowerCount(githubPreview.followers)
                    : "-"
                }
              />
            </div>
          </Tooltips>
        );
      }

      if (isOnlyGithub) {
        return (
          <Tooltips
            text={buildGithubDeveloperTooltip(githubPreview)}
            side="bottom"
          >
            <div>
              <Cell
                key={columnId}
                title={
                  githubPreview
                    ? formatGithubRepoCount(githubPreview.publicRepos)
                    : "-"
                }
                description={
                  githubPreview
                    ? formatGithubFollowerCount(githubPreview.followers)
                    : "-"
                }
              />
            </div>
          </Tooltips>
        );
      }

      if (isScholarSource) {
        return (
          <Tooltips
            text={buildScholarResearchTooltip(scholarPreview)}
            side="bottom"
          >
            <div>
              <Cell
                key={columnId}
                title={
                  scholarPreview
                    ? formatScholarPaperCount(scholarPreview.paperCount)
                    : "-"
                }
                description={
                  scholarPreview
                    ? formatScholarCitationCount(scholarPreview.citationCount)
                    : "-"
                }
              />
            </div>
          </Tooltips>
        );
      }

      if (isOnlyScholar) {
        return (
          <Tooltips
            text={buildScholarResearchTooltip(scholarPreview)}
            side="bottom"
          >
            <div>
              <Cell
                key={columnId}
                title={
                  scholarPreview
                    ? formatScholarPaperCount(scholarPreview.paperCount)
                    : "-"
                }
                description={
                  scholarPreview
                    ? formatScholarCitationCount(scholarPreview.citationCount)
                    : "-"
                }
              />
            </div>
          </Tooltips>
        );
      }

      return (
        <Tooltips text={schoolHistoryTooltipText} side="bottom">
          <div>
            <Cell
              key={columnId}
              title={
                latestEdu?.school ? (
                  <div className="flex flex-row items-center justify-start gap-x-2 min-w-0 relative">
                    {schoolLogo && (
                      <img
                        src={schoolLogo}
                        alt={latestEdu.school}
                        className="w-4 h-4 rounded-full object-cover"
                      />
                    )}
                    <span className="text-hgray800 font-normal break-words">
                      {koreaUniversityEnToKo(latestEdu.school)}
                    </span>
                  </div>
                ) : (
                  "-"
                )
              }
              description={`${
                latestEdu?.field_of_study
                  ? majorEnToKo(latestEdu.field_of_study)
                  : ""
              }
                ${latestEdu?.field_of_study && latestEdu?.degree ? " • " : ""}
                ${latestEdu?.degree ? degreeEnToKo(latestEdu.degree) : ""}`}
            />
          </div>
        </Tooltips>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Summary) {
      return (
        <div
          key={columnId}
          className="px-4 py-3 min-w-0 h-full flex items-center"
        >
          <div className="text-[13px] font-normal text-hgray900 leading-5 whitespace-pre-wrap break-words line-clamp-3">
            {shortlistSummaryText || "-"}
          </div>
        </div>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Mark) {
      return (
        <div
          key={columnId}
          className="px-2 py-3 min-w-0 h-full flex items-center justify-start"
        >
          {showMarkAction && (userId || candidateMarkStatus) ? (
            <CandidateMarkButton
              userId={userId}
              candidId={c.id}
              initialStatus={candidateMarkStatus}
              compact
              onChange={onMarkChange}
            />
          ) : null}
        </div>
      );
    }

    if (
      columnId === CandidateTableStaticColumnId.SharedNotes &&
      sharedFolderContext?.token
    ) {
      return (
        <div
          key={columnId}
          className="flex h-full min-w-0 items-center border-l border-white/5 px-4 py-3"
        >
          <div className="flex w-full items-center justify-between gap-3">
            {sharedFolderContext.viewer ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSharedNoteCreateRequestKey((current) => current + 1);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-[12px] text-hgray900 transition-colors hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" />
                공유 메모 추가
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Memo) {
      return (
        <div
          key={columnId}
          className="px-0 py-0 min-w-0 h-full flex items-center"
        >
          {userId ? (
            <ShortlistMemoEditor
              userId={userId}
              candidId={c.id}
              initialMemo={shortlistMemo}
              rows={2}
              className="w-full"
            />
          ) : shortlistMemo ? (
            <div className="w-full whitespace-pre-wrap break-words px-2 py-2 text-[13px] leading-5 text-hgray900">
              {shortlistMemo}
            </div>
          ) : null}
        </div>
      );
    }

    if (columnId === CandidateTableStaticColumnId.Empty) {
      return <div key={columnId} className="w-[360px] h-full" />;
    }

    return null;
  };

  return (
    <div className="w-full">
      <Link
        href={profileHref}
        role="row"
        onClick={() => logEvent("candidate_card_click: " + candidId)}
      >
        <div className="group relative w-full cursor-pointer border-b border-white/5 transition-colors hover:bg-[#242424]">
          <div
            className="inline-grid items-center border-b border-white/5"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-30 h-full px-3 flex items-center justify-center text-xs text-hgray700 bg-hgray200 group-hover:bg-[#242424] transition-colors">
              {linkSources.length > 0 ? (
                <div className="flex items-center justify-center gap-1 max-w-[36px] flex-wrap">
                  {linkSources.map((source) => (
                    <Tooltips key={source} text={getSearchSourceLabel(source)}>
                      <span className="flex items-center justify-center rounded-full">
                        <Image
                          src={getSearchSourceLogoPath(source)}
                          alt={getSearchSourceLabel(source)}
                          width={12}
                          height={12}
                          className="object-contain"
                        />
                      </span>
                    </Tooltips>
                  ))}
                </div>
              ) : (
                rowIndex + 1
              )}
            </div>
            <div className="sticky left-14 z-20 h-full px-4 py-3 flex items-center gap-3 min-w-0 bg-hgray200 border-r border-white/5 group-hover:bg-[#242424] transition-colors cursor-pointer">
              <div className="shrink-0 rounded-full border border-transparent hover:border-accenta1/80 transition-colors">
                <Avatar url={c.profile_picture} name={c.name} size="md" />
              </div>

              <div className="min-w-0">
                <div className="text-[14px] text-white font-normal truncate">
                  {c.name}
                </div>
                <div className="text-xs text-hgray700 truncate">
                  {isOnlyScholar ? (
                    <div className="inline-flex w-fit items-center justify-center gap-1 text-xs rounded text-blue-500">
                      {/* <Image
                        src="/images/logos/scholar.png"
                        alt="Scholar Profile"
                        width={10}
                        height={10}
                      /> */}
                      <div>Scholar Profile</div>
                    </div>
                  ) : c.location ? (
                    locationEnToKo(c.location)
                  ) : (
                    "-"
                  )}
                </div>
                {/* {suitabilityScore !== null ? (
                  <div className="mt-1 inline-flex items-center rounded-full border border-accenta1/20 bg-accenta1/10 px-2 py-0.5 text-[11px] font-normal text-accenta1">
                    적합도 {suitabilityScore}
                  </div>
                ) : null} */}
              </div>
              <div
                className="px-2 absolute right-1 flex items-center justify-end"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
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
                      size="sm"
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {orderedColumnIds.map((columnId) => renderColumnCell(columnId))}

            <div aria-hidden="true" className="h-full" />
          </div>
          {sharedFolderContext?.token && sharedNotesLayout ? (
            <div
              className=""
              style={{
                marginLeft: `${sharedNotesLayout.offsetPx}px`,
                width: `${sharedNotesLayout.widthPx}px`,
              }}
            >
              <SharedFolderCandidateNotes
                token={sharedFolderContext.token}
                candidId={c.id}
                initialNotes={sharedFolderNotes}
                viewer={sharedFolderContext.viewer}
                compact
                showTitle={false}
                variant="table"
                showCreateButton={false}
                hideWhenEmpty
                createRequestKey={sharedNoteCreateRequestKey}
                onNotesChange={setSharedNotesState}
              />
            </div>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

export default React.memo(CandidateRow);

const Cell = ({
  title,
  description,
  multiline = false,
}: {
  title: string | React.ReactNode;
  description: string;
  multiline?: boolean;
}) => {
  return (
    <div className="min-w-0 cell1">
      <div className="flex items-center min-w-0  w-full">
        <div
          className={[
            "flex-1 min-w-0 text-[13px] text-hgray800",
            multiline ? "whitespace-normal break-words" : "truncate",
          ].join(" ")}
        >
          {title}
        </div>
      </div>
      <div
        className={[
          "text-[13px] text-hgray600 mt-0.5 max-w-full",
          multiline ? "whitespace-normal break-words" : "truncate",
        ].join(" ")}
      >
        {description}
      </div>
    </div>
  );
};

export const RoleBox = ({
  company,
  role,
  startDate,
  endDate,
  tooltipText,
  tooltipSide = "bottom",
}: {
  company: string;
  role: string;
  startDate?: string;
  endDate?: string;
  tooltipText?: string;
  tooltipSide?: "bottom" | "top" | "left" | "right";
}) => {
  const defaultTooltipText = `${startDate ? startDate : ""} ${
    startDate ? " - " : ""
  } ${endDate && endDate} ${!endDate && startDate && "현재"}`.trim();

  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips text={tooltipText ?? defaultTooltipText} side={tooltipSide}>
        <div className="flex flex-row items-start justify-between w-full pr-8">
          <div className="flex flex-row items-start justify-start gap-x-2 min-w-0 relative">
            <BriefcaseBusiness className="absolute left-0 top-[2px] w-4 h-4 text-hgray800" />
            <span className="text-hgray800 font-normal break-words">
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
              {company && companyEnToKo(company)}
            </span>
          </div>
        </div>
      </Tooltips>
      <div className="text-hgray600 font-normal">{role}</div>
    </div>
  );
};

export const SchoolBox = ({
  school,
  role,
  field,
  tooltipText,
  tooltipSide = "bottom",
}: {
  school: string;
  role: string;
  field: string;
  tooltipText?: string;
  tooltipSide?: "bottom" | "top" | "left" | "right";
}) => {
  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips text={tooltipText ?? "가장 최근 학력"} side={tooltipSide}>
        <div className="flex flex-row items-start justify-start gap-x-2 min-w-0 relative">
          <GraduationCap className="absolute left-0 top-[2px] w-4 h-4 text-hgray800" />
          <span className="text-hgray800 font-normal break-words">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            {school && koreaUniversityEnToKo(school)}
          </span>
        </div>
      </Tooltips>
      <div className="flex flex-row items-start justify-start gap-x-1 min-w-0 relative">
        {field && (
          <div className="text-hgray600 font-normal">{majorEnToKo(field)}</div>
        )}
        {field && role && <div className="text-hgray600 font-normal">•</div>}
        {role && (
          <div className="text-hgray600 font-normal">{degreeEnToKo(role)}</div>
        )}
      </div>
    </div>
  );
};

export const ScholarSignalBox = ({
  title,
  description,
  tooltipText,
  icon = "affiliation",
  tooltipSide = "bottom",
  hideDescriptionWhenEmpty = false,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  tooltipText?: string;
  icon?: "affiliation" | "research";
  tooltipSide?: "bottom" | "top" | "left" | "right";
  hideDescriptionWhenEmpty?: boolean;
}) => {
  const Icon = icon === "research" ? FileText : GraduationCap;
  const hasDescription =
    description !== undefined && description !== null && description !== "";

  return (
    <div className="flex flex-col items-start gap-0 text-sm col-span-4">
      <Tooltips
        text={tooltipText ?? (typeof title === "string" ? title : "")}
        side={tooltipSide}
      >
        <div className="flex flex-row items-start justify-start gap-x-2 min-w-0 relative">
          <Icon className="absolute left-0 top-[2px] w-4 h-4 text-hgray800" />
          <span className="text-hgray800 font-normal break-words">
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            {title || "-"}
          </span>
        </div>
      </Tooltips>
      {hasDescription || !hideDescriptionWhenEmpty ? (
        <div className="text-hgray600 font-normal">
          {hasDescription ? description : "-"}
        </div>
      ) : null}
    </div>
  );
};
