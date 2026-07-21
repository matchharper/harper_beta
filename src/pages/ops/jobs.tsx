import OpsShell from "@/components/ops/OpsShell";
import { formatKstRelativeDateTime } from "@/components/ops/dateUtils";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { Switch } from "@/components/ui/switch";
import {
  useSyncAshbyOfficialJobs,
  useOpsOfficialJobs,
  useSaveOpsOfficialJob,
  type OpsOfficialJobRecord,
} from "@/hooks/ops/useOpsOfficialJobs";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  isOfficialJobsInternalCopyIdentity,
} from "@/lib/officialJobs";
import type { OpsOfficialJobSaveInput } from "@/lib/ops/officialJobs";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ArrowUpRight,
  CheckCircle2,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Search,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BareButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

type JobFilter = "all" | "published" | "draft";
const NEW_JOB_ID = "__new_official_job__";

type OfficialJobDraft = {
  ashbyJobPostingId: string;
  companyDescriptionMarkdown: string;
  companyLogoUrl: string;
  companyName: string;
  companyWebsiteUrl: string;
  compensation: string;
  displayOrder: string;
  employmentType: string;
  id: string | null;
  isPublished: boolean;
  location: string;
  roleDescriptionMarkdown: string;
  roleTitle: string;
  seniority: string;
  shortDescription: string;
  slug: string;
  vertical: string;
};

type OfficialJobDraftState = {
  draft: OfficialJobDraft;
  initialDraft: OfficialJobDraft;
  key: string;
};

const EMPTY_DRAFT: OfficialJobDraft = {
  ashbyJobPostingId: "",
  companyDescriptionMarkdown: "",
  companyLogoUrl: "",
  companyName: "",
  companyWebsiteUrl: "",
  compensation: "",
  displayOrder: "0",
  employmentType: "Full-time",
  id: null,
  isPublished: false,
  location: "",
  roleDescriptionMarkdown: "",
  roleTitle: "",
  seniority: "",
  shortDescription: "",
  slug: "",
  vertical: "",
};

const OFFICIAL_JOB_DRAFT_FIELDS: Array<keyof OfficialJobDraft> = [
  "ashbyJobPostingId",
  "companyDescriptionMarkdown",
  "companyLogoUrl",
  "companyName",
  "companyWebsiteUrl",
  "compensation",
  "displayOrder",
  "employmentType",
  "id",
  "isPublished",
  "location",
  "roleDescriptionMarkdown",
  "roleTitle",
  "seniority",
  "shortDescription",
  "slug",
  "vertical",
];

const ROLE_DESCRIPTION_MARKDOWN_TEMPLATES = [
  {
    label: "How Harper Helps",
    content: `### How Harper Helps

'스포츠 선수들은 대신해서 이적과 연봉 협상을 책임져주는 에이전트가 있는데, 왜 직장인들은 없을까?' 상상해 본 적 있으시나요? 잡보드를 뒤지며 수십 시간을 낭비하고, 이력서를 고치며 무한정 지원을 반복하는 기존의 구직 방식은 지난 30년간 본질적으로 바뀐 게 없습니다.

Harper는 글로벌 VC의 투자를 받아 이 비효율적인 파이프라인과 구직 탐색 비용을 완전히 지우기 위해 탄생한 당신의 전속 AI 탤런트 에이전트입니다. 지원을 위해 정형화된 이력서를 밤새워 쓸 필요가 없습니다. Harper와 가볍게 이야기하며 지금 어떤 상황이고 다음으로는 어떤 기회를 찾고 계신지 알려주세요. 대화를 통해 정적인 이력서 이면에 담긴 진짜 맥락과 잠재력을 깊이 있게 추출해 냅니다.

여러분이 할 일은 가만히 앉아 Harper가 고른 완벽하게 핏이 맞는 포지션 제안을 수락하는 것뿐입니다. 그럼 여러분의 프로필은 채용 결정권자의 책상 위로 즉시 올라갑니다.

**포지션에 대하여** : 이 공고는 여러분의 전속 탤런트 에이전트 Harper가 파트너사를 대신해 진행하는 비공개 채용 건입니다. 지원자님의 엔지니어링 역량을 정밀하게 분석해 가장 완벽한 핏을 가진 포지션을 제안해 드립니다. Harper를 통해 지원하시면 그 다음 과정은 저희가 알아서 진행합니다.`,
  },
  {
    label: "Process",
    content: `### Process

**Step 1.** Harper 링크를 통해 이 포지션에 지원해 주세요.

**Step 2.** 정형화된 이력서를 작성할 필요 없이, Harper와 가볍게 이야기하며 지금 어떤 상황이고 다음으로는 어떤 기회를 찾고 계신지 알려주세요.

**Step 3.** Harper가 대화 속에서 추출한 진짜 맥락을 바탕으로 지원자님이 이 포지션과 완벽한 핏이라고 분석되면, 즉시 고객사에 여러분을 추천합니다.

**Step 4.** 조건 및 일정 조율, 회사와 포지션에 대한 궁금한 사항 등을 중간에서 Harper가 전부 조율해 드립니다.

**Step 5.** 만약 이번 포지션이 지원자님과 맞지 않더라도 걱정하지 마세요. Harper 네트워크 내의 다른 훌륭한 포지션들을 자동으로 찾아 제안해 드립니다. 지원자에게는 전 과정이 무료입니다.`,
  },
] as const;

function jobToDraft(job: OpsOfficialJobRecord): OfficialJobDraft {
  return {
    ashbyJobPostingId: job.ashbyJobPostingId ?? "",
    companyDescriptionMarkdown: job.companyDescriptionMarkdown,
    companyLogoUrl: job.companyLogoUrl ?? "",
    companyName: job.companyName,
    companyWebsiteUrl: job.companyWebsiteUrl ?? "",
    compensation: job.compensation ?? "",
    displayOrder: String(job.displayOrder),
    employmentType: job.employmentType ?? "",
    id: job.id,
    isPublished: job.isPublished,
    location: job.location,
    roleDescriptionMarkdown: job.roleDescriptionMarkdown,
    roleTitle: job.roleTitle,
    seniority: job.seniority ?? "",
    shortDescription: job.shortDescription,
    slug: job.slug,
    vertical: job.vertical,
  };
}

function areOfficialJobDraftsEqual(
  first: OfficialJobDraft,
  second: OfficialJobDraft
) {
  return OFFICIAL_JOB_DRAFT_FIELDS.every(
    (field) => first[field] === second[field]
  );
}

function draftToPayload(draft: OfficialJobDraft): OpsOfficialJobSaveInput {
  const isInternalCopy = isOfficialJobsInternalCopyIdentity(draft);

  return {
    ashbyJobPostingId: isInternalCopy ? null : draft.ashbyJobPostingId,
    companyDescriptionMarkdown: draft.companyDescriptionMarkdown,
    companyLogoUrl: draft.companyLogoUrl,
    companyName: draft.companyName,
    companyWebsiteUrl: draft.companyWebsiteUrl,
    compensation: draft.compensation,
    displayOrder: draft.displayOrder,
    employmentType: draft.employmentType,
    id: draft.id,
    isPublished: isInternalCopy ? false : draft.isPublished,
    location: draft.location,
    roleDescriptionMarkdown: draft.roleDescriptionMarkdown,
    roleTitle: isInternalCopy
      ? OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE
      : draft.roleTitle,
    seniority: draft.seniority,
    shortDescription: draft.shortDescription,
    slug: isInternalCopy ? OFFICIAL_JOBS_INTERNAL_COPY_SLUG : draft.slug,
    vertical: draft.vertical,
  };
}

function createSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return slug || "official-job";
}

function resizeTextareaToContent(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function matchesFilter(job: OpsOfficialJobRecord, filter: JobFilter) {
  if (filter === "published") return job.isPublished;
  if (filter === "draft") return !job.isPublished;
  return true;
}

function matchesQuery(job: OpsOfficialJobRecord, query: string) {
  if (!query) return true;
  const haystack = [
    job.companyName,
    job.roleTitle,
    job.location,
    job.vertical,
    job.slug,
    job.ashbyJobPostingId,
    job.shortDescription,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function hasAshbyConnection(
  job: Pick<OpsOfficialJobRecord, "ashbyJobPostingId">
) {
  return Boolean(job.ashbyJobPostingId?.trim());
}

function compareJobsForSidebar(
  first: OpsOfficialJobRecord,
  second: OpsOfficialJobRecord
) {
  const firstHasAshby = hasAshbyConnection(first);
  const secondHasAshby = hasAshbyConnection(second);

  if (firstHasAshby !== secondHasAshby) {
    return firstHasAshby ? -1 : 1;
  }

  return 0;
}

const ashbySourcedFieldClass =
  "!border-critical/30 !bg-critical-faded !text-critical focus:!border-critical/30 focus:!bg-bg-default";

function Field({
  children,
  label,
  sourceLabel,
}: {
  children: ReactNode;
  label: ReactNode;
  sourceLabel?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2">
        <span className={cx(opsTheme.label, sourceLabel && "text-critical")}>
          {label}
        </span>
        {sourceLabel ? (
          <span className="rounded-md bg-critical-faded px-1.5 py-0.5 text-[10px] font-semibold text-critical">
            {sourceLabel}
          </span>
        ) : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

export default function OpsOfficialJobsPage() {
  const authLoading = useAuthStore((state) => state.loading);
  const user = useAuthStore((state) => state.user);
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<JobFilter>("all");
  const [draftState, setDraftState] = useState<OfficialJobDraftState>({
    draft: EMPTY_DRAFT,
    initialDraft: EMPTY_DRAFT,
    key: NEW_JOB_ID,
  });
  const roleDescriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const jobsQuery = useOpsOfficialJobs(canFetchInternal);
  const saveJob = useSaveOpsOfficialJob();
  const syncAshbyJobs = useSyncAshbyOfficialJobs();
  const jobs = useMemo(() => {
    const loadedJobs = jobsQuery.data?.jobs ?? [];
    return [...loadedJobs].sort(compareJobsForSidebar);
  }, [jobsQuery.data?.jobs]);
  const activeJobId =
    selectedJobId === NEW_JOB_ID
      ? null
      : (selectedJobId ?? jobs[0]?.id ?? null);
  const selectedJob = jobs.find((job) => job.id === activeJobId) ?? null;
  const activeDraftKey =
    selectedJobId === NEW_JOB_ID ? NEW_JOB_ID : activeJobId;
  const draftStateMatchesActive = draftState.key === activeDraftKey;
  const selectedJobDraft = selectedJob ? jobToDraft(selectedJob) : null;
  const draft = draftStateMatchesActive
    ? draftState.draft
    : (selectedJobDraft ?? EMPTY_DRAFT);
  const initialDraft = draftStateMatchesActive
    ? draftState.initialDraft
    : (selectedJobDraft ?? EMPTY_DRAFT);
  const hasUnsavedChanges = !areOfficialJobDraftsEqual(draft, initialDraft);
  const isInternalCopyDraft = isOfficialJobsInternalCopyIdentity(draft);
  const isAshbyConnectedDraft = hasAshbyConnection(draft);
  const effectiveIsPublished = isInternalCopyDraft ? false : draft.isPublished;
  const isSlugLocked = Boolean(draft.id) || isInternalCopyDraft;

  useEffect(() => {
    resizeTextareaToContent(roleDescriptionTextareaRef.current);
  }, [draft.roleDescriptionMarkdown, activeDraftKey]);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter(
      (job) => matchesFilter(job, filter) && matchesQuery(job, normalizedQuery)
    );
  }, [filter, jobs, query]);

  const stats = useMemo(() => {
    const visibleJobs = jobs.filter((job) => !job.isInternalCopy);
    return {
      draft: visibleJobs.filter((job) => !job.isPublished).length,
      published: visibleJobs.filter((job) => job.isPublished).length,
      total: visibleJobs.length,
    };
  }, [jobs]);

  const updateDraft = <Key extends keyof OfficialJobDraft>(
    key: Key,
    value: OfficialJobDraft[Key]
  ) => {
    setDraftState({
      draft: { ...draft, [key]: value },
      initialDraft,
      key: activeDraftKey ?? NEW_JOB_ID,
    });
  };

  const startNewJob = () => {
    const maxDisplayOrder = jobs.reduce(
      (max, job) => Math.max(max, job.displayOrder),
      0
    );
    const nextDraft = {
      ...EMPTY_DRAFT,
      displayOrder: String(maxDisplayOrder + 10),
    };
    setSelectedJobId(NEW_JOB_ID);
    setDraftState({
      draft: nextDraft,
      initialDraft: nextDraft,
      key: NEW_JOB_ID,
    });
  };

  const handleGenerateSlug = () => {
    if (isInternalCopyDraft) {
      updateDraft("slug", OFFICIAL_JOBS_INTERNAL_COPY_SLUG);
      return;
    }

    const slug = createSlug(`${draft.companyName} ${draft.roleTitle}`);
    updateDraft("slug", slug);
  };

  const handleSave = async () => {
    try {
      const result = await saveJob.mutateAsync(draftToPayload(draft));
      const savedDraft = jobToDraft(result.job);
      setSelectedJobId(result.job.id);
      setDraftState({
        draft: savedDraft,
        initialDraft: savedDraft,
        key: result.job.id,
      });
      showToast({ message: "Official job 저장 완료", variant: "success" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "Official job 저장 실패",
        variant: "error",
      });
    }
  };

  const handleCopyRoleDescriptionTemplate = async (
    template: (typeof ROLE_DESCRIPTION_MARKDOWN_TEMPLATES)[number]
  ) => {
    try {
      await navigator.clipboard.writeText(template.content);
      showToast({
        message: `${template.label} markdown 복사 완료`,
      });
    } catch {
      showToast({
        message: `${template.label} markdown 복사 실패`,
      });
    }
  };

  const handleSyncAshby = async () => {
    try {
      const activeJobIdBeforeSync = activeJobId;
      const shouldReloadActiveDraft =
        Boolean(activeJobIdBeforeSync) && !hasUnsavedChanges;
      const result = await syncAshbyJobs.mutateAsync();
      showToast({
        message: `Ashby sync 완료: ${result.inserted} created, ${result.updated} updated, ${result.unpublished} hidden`,
        variant: "success",
      });
      const refetchResult = await jobsQuery.refetch();

      if (shouldReloadActiveDraft && activeJobIdBeforeSync) {
        const refreshedJob = refetchResult.data?.jobs.find(
          (job) => job.id === activeJobIdBeforeSync
        );
        if (refreshedJob) {
          const refreshedDraft = jobToDraft(refreshedJob);
          setDraftState({
            draft: refreshedDraft,
            initialDraft: refreshedDraft,
            key: refreshedJob.id,
          });
        }
      }
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "Ashby sync 실행 실패",
        variant: "error",
      });
    }
  };

  return (
    <>
      <Head>
        <title>Official Jobs | Harper Ops</title>
        <meta name="description" content="Manage Harper official jobs" />
      </Head>

      <OpsShell
        title="Official Jobs"
        actions={
          <section className="flex flex-wrap items-center gap-3">
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Total</div>
              <div className="mt-2 text-2xl font-semibold text-neutral-primary">
                {stats.total}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Published</div>
              <div className="mt-2 text-2xl font-semibold text-positive">
                {stats.published}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Draft</div>
              <div className="mt-2 text-2xl font-semibold text-info">
                {stats.draft}
              </div>
            </div>
            <BareButton
              type="button"
              onClick={handleSyncAshby}
              disabled={syncAshbyJobs.isPending}
              className={cx(opsTheme.buttonSecondary, "h-10 self-center px-3")}
            >
              {syncAshbyJobs.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Ashby 전체 읽어오기
            </BareButton>
          </section>
        }
      >
        <section className="grid gap-5 sm:grid-cols-[380px_minmax(0,1fr)]">
          <aside className={cx(opsTheme.panel, "overflow-hidden")}>
            <div className="border-b border-neutral-1000-a05 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={opsTheme.eyebrow}>Jobs</div>
                  <h2 className="mt-1 text-lg font-medium text-neutral-primary">
                    Official job list
                  </h2>
                </div>
                <BareButton
                  type="button"
                  onClick={startNewJob}
                  className={cx(opsTheme.buttonPrimary, "h-10 px-3")}
                >
                  <Plus className="h-4 w-4" />
                  New
                </BareButton>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-md border border-neutral-1000-a05 bg-bg-default/70 px-3">
                <Search className="h-4 w-4 text-neutral-soft" />
                <UiInput
                  unstyled
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search role, company, slug"
                  className="h-10 flex-1 bg-transparent text-sm text-neutral-primary outline-none placeholder:text-neutral-placeholder"
                />
              </div>

              <div className="mt-3 grid grid-cols-3 rounded-md bg-bg-weak p-1">
                {[
                  ["all", "All"],
                  ["published", "Published"],
                  ["draft", "Draft"],
                ].map(([value, label]) => (
                  <BareButton
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as JobFilter)}
                    className={cx(
                      "h-8 rounded px-2 text-xs font-medium transition",
                      filter === value
                        ? "bg-bg-default text-neutral-primary shadow-sm"
                        : "text-neutral-muted hover:text-neutral-primary"
                    )}
                  >
                    {label}
                  </BareButton>
                ))}
              </div>
            </div>

            <div>
              {jobsQuery.isLoading ? (
                <div className="flex items-center gap-2 p-4 text-sm text-neutral-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading jobs
                </div>
              ) : null}

              {jobsQuery.error ? (
                <div className={cx(opsTheme.errorNotice, "m-4")}>
                  {jobsQuery.error instanceof Error
                    ? jobsQuery.error.message
                    : "Failed to load jobs"}
                </div>
              ) : null}

              {!jobsQuery.isLoading && filteredJobs.length === 0 ? (
                <div className="p-4 text-sm text-neutral-muted">
                  표시할 job이 없습니다.
                </div>
              ) : null}

              {filteredJobs.map((job) => {
                const isAshbyConnected = hasAshbyConnection(job);

                return (
                  <BareButton
                    key={job.id}
                    type="button"
                    onClick={() => {
                      const nextDraft = jobToDraft(job);
                      setSelectedJobId(job.id);
                      setDraftState({
                        draft: nextDraft,
                        initialDraft: nextDraft,
                        key: job.id,
                      });
                    }}
                    className={cx(
                      "block w-full border-b border-l-4 border-neutral-1000-a05 border-l-transparent px-4 py-3 text-left transition",
                      isAshbyConnected && "border-l-info bg-info-faded",
                      activeJobId === job.id
                        ? isAshbyConnected
                          ? "bg-info-faded"
                          : "bg-bg-floating"
                        : isAshbyConnected
                          ? "hover:bg-info-faded"
                          : "hover:bg-bg-default/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-neutral-primary">
                          {job.roleTitle}
                        </div>
                        <div className="mt-1 truncate text-xs text-neutral-muted">
                          {job.companyName}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isAshbyConnected ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-info px-2 py-1 text-[11px] font-semibold text-neutral-00 shadow-sm">
                            <Link2 className="h-3 w-3" />
                            Ashby 연결
                          </span>
                        ) : null}
                        <span
                          className={cx(
                            "rounded-md px-2 py-1 text-[11px] font-medium",
                            job.isInternalCopy
                              ? "bg-bg-floating text-neutral-muted"
                              : job.isPublished
                                ? "bg-positive-faded text-positive"
                                : "bg-info-faded text-info"
                          )}
                        >
                          {job.isInternalCopy
                            ? "Internal"
                            : job.isPublished
                              ? "Published"
                              : "Draft"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-neutral-muted">
                      <span
                        className={cx(
                          "truncate",
                          isAshbyConnected && "font-semibold text-info"
                        )}
                      >
                        {job.isInternalCopy
                          ? "Not shown on /jobs"
                          : isAshbyConnected
                            ? `Ashby ID · ${job.ashbyJobPostingId}`
                            : job.location}
                      </span>
                      <span>#{job.displayOrder}</span>
                    </div>
                  </BareButton>
                );
              })}
            </div>
          </aside>

          <section className={cx(opsTheme.panel, "p-5")}>
            <div className="flex flex-col gap-4 border-b border-neutral-1000-a05 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className={opsTheme.eyebrow}>Editor</div>
                <h2 className="mt-1 text-xl font-medium text-neutral-primary">
                  {draft.id ? "Edit official job" : "Create official job"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-neutral-muted">
                  {isInternalCopyDraft
                    ? "이 row는 public job으로 공개되지 않습니다."
                    : "공개 상세 페이지 본문에는 Role description markdown만 노출됩니다."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {draft.id && !isInternalCopyDraft ? (
                  <Link
                    href={`/jobs/${encodeURIComponent(draft.id)}`}
                    target="_blank"
                    className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                  >
                    Preview
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ) : null}
                <BareButton
                  type="button"
                  onClick={() => jobsQuery.refetch()}
                  className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </BareButton>
                {hasUnsavedChanges ? (
                  <BareButton
                    type="button"
                    onClick={handleSave}
                    disabled={saveJob.isPending}
                    className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
                  >
                    {saveJob.isPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </BareButton>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className={cx(opsTheme.panelSoft, "p-4")}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="block text-sm font-semibold text-neutral-primary">
                      Published
                    </div>
                    <div className="mt-1 block text-xs text-neutral-muted">
                      {isInternalCopyDraft
                        ? "internal_internal row는 항상 비공개로 유지됩니다."
                        : "켜면 `/jobs`와 상세 페이지에서 공개됩니다."}
                    </div>
                  </div>
                  <Switch
                    checked={effectiveIsPublished}
                    aria-label="Toggle published status"
                    disabled={isInternalCopyDraft}
                    onCheckedChange={() =>
                      !isInternalCopyDraft &&
                      updateDraft("isPublished", !draft.isPublished)
                    }
                    className={cx(
                      isInternalCopyDraft
                        ? "cursor-not-allowed opacity-70"
                        : effectiveIsPublished
                          ? "bg-black"
                          : "bg-neutral-400"
                    )}
                  />
                </div>
                <div
                  className={cx(
                    "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                    effectiveIsPublished
                      ? "bg-positive-faded text-positive"
                      : "bg-bg-weak text-neutral-muted"
                  )}
                >
                  {isInternalCopyDraft ? (
                    <LockKeyhole className="h-3.5 w-3.5" />
                  ) : effectiveIsPublished ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-disabled" />
                  )}
                  {isInternalCopyDraft
                    ? "Internal"
                    : effectiveIsPublished
                      ? "Public"
                      : "Draft"}
                </div>
              </div>

              <div className={cx(opsTheme.panelSoft, "p-4")}>
                <div className={opsTheme.eyebrow}>Timestamps</div>
                <div className="mt-3 grid gap-2 text-xs text-neutral-muted sm:grid-cols-3">
                  <div>
                    <div className="text-neutral-soft">Created</div>
                    <div className="mt-1 text-neutral-primary">
                      {formatKstRelativeDateTime(selectedJob?.createdAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-soft">Updated</div>
                    <div className="mt-1 text-neutral-primary">
                      {formatKstRelativeDateTime(selectedJob?.updatedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-soft">Published</div>
                    <div className="mt-1 text-neutral-primary">
                      {formatKstRelativeDateTime(selectedJob?.publishedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field
                label="Job title"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <UiInput
                  unstyled
                  value={draft.roleTitle}
                  disabled={isInternalCopyDraft}
                  onChange={(event) =>
                    updateDraft("roleTitle", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isAshbyConnectedDraft && ashbySourcedFieldClass,
                    isInternalCopyDraft &&
                      "cursor-not-allowed bg-bg-weak text-neutral-muted"
                  )}
                />
              </Field>
              <Field
                label="Company name"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <UiInput
                  unstyled
                  value={draft.companyName}
                  onChange={(event) =>
                    updateDraft("companyName", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
              </Field>
              <Field
                label="Location"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <UiInput
                  unstyled
                  value={draft.location}
                  onChange={(event) =>
                    updateDraft("location", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
              </Field>
              <Field label="Vertical">
                <UiInput
                  unstyled
                  value={draft.vertical}
                  onChange={(event) =>
                    updateDraft("vertical", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field
                label="Employment type"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <UiInput
                  unstyled
                  value={draft.employmentType}
                  onChange={(event) =>
                    updateDraft("employmentType", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                  placeholder="Full-time"
                />
              </Field>
            </div>

            <div className="mt-5 grid gap-4">
              <Field
                label="Short description"
                sourceLabel={
                  isAshbyConnectedDraft ? "Ashby socialDescription" : undefined
                }
              >
                <UiTextarea
                  unstyled
                  value={draft.shortDescription}
                  onChange={(event) =>
                    updateDraft("shortDescription", event.target.value)
                  }
                  className={cx(
                    opsTheme.textarea,
                    "min-h-[88px]",
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
              </Field>
              <Field
                label="Role description markdown   (큰글씨: ### 텍스트, 가로선:---, bold: **텍스트**)"
                sourceLabel={
                  isAshbyConnectedDraft ? "Ashby description" : undefined
                }
              >
                <UiTextarea
                  ref={roleDescriptionTextareaRef}
                  unstyled
                  value={draft.roleDescriptionMarkdown}
                  onChange={(event) => {
                    updateDraft("roleDescriptionMarkdown", event.target.value);
                    resizeTextareaToContent(event.currentTarget);
                  }}
                  className={cx(
                    opsTheme.textarea,
                    "min-h-[480px] resize-none overflow-hidden",
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ROLE_DESCRIPTION_MARKDOWN_TEMPLATES.map((template) => (
                    <BareButton
                      key={template.label}
                      type="button"
                      onClick={() =>
                        handleCopyRoleDescriptionTemplate(template)
                      }
                      className={cx(
                        opsTheme.buttonSecondary,
                        "h-10 px-3 text-xs"
                      )}
                    >
                      ### {template.label} 복사
                    </BareButton>
                  ))}
                </div>
              </Field>
            </div>

            <div className="mt-88 grid gap-4 lg:grid-cols-2">
              <div>Slug는 최초 저장 후 고정됩니다</div>
              <Field label="Slug">
                <div className="flex gap-2">
                  <UiInput
                    unstyled
                    value={draft.slug}
                    disabled={isSlugLocked}
                    onChange={(event) =>
                      updateDraft("slug", event.target.value)
                    }
                    className={cx(
                      opsTheme.input,
                      isSlugLocked &&
                        "cursor-not-allowed bg-bg-weak text-neutral-muted"
                    )}
                    placeholder="Generated from company and role on first save"
                  />
                  <BareButton
                    type="button"
                    onClick={handleGenerateSlug}
                    disabled={isSlugLocked}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-11 px-3",
                      isSlugLocked && "cursor-not-allowed opacity-55"
                    )}
                  >
                    Generate
                  </BareButton>
                </div>
              </Field>
              <Field label="Display order">
                <UiInput
                  unstyled
                  type="number"
                  value={draft.displayOrder}
                  onChange={(event) =>
                    updateDraft("displayOrder", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field label="Seniority">
                <UiInput
                  unstyled
                  value={draft.seniority}
                  onChange={(event) =>
                    updateDraft("seniority", event.target.value)
                  }
                  className={opsTheme.input}
                  placeholder="Senior / Staff"
                />
              </Field>
              <Field label="Compensation">
                <UiInput
                  unstyled
                  value={draft.compensation}
                  onChange={(event) =>
                    updateDraft("compensation", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
            </div>
          </section>
        </section>
      </OpsShell>
    </>
  );
}
