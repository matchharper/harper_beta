import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import {
  useSyncAshbyOfficialJobs,
  useOpsOfficialJobs,
  useSaveOpsOfficialJob,
  type OpsOfficialJobRecord,
} from "@/hooks/useOpsOfficialJobs";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE,
  OFFICIAL_JOBS_INTERNAL_COPY_SLUG,
  isOfficialJobsInternalCopyIdentity,
} from "@/lib/officialJobs";
import type { OpsOfficialJobSaveInput } from "@/lib/opsOfficialJobs";
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
import { useMemo, useState } from "react";

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
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
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
  "!border-[#DC2626]/45 !bg-[#FFF1F1] !text-[#991B1B] focus:!border-[#DC2626]/75 focus:!bg-white";

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
        <span className={cx(opsTheme.label, sourceLabel && "text-[#B91C1C]")}>
          {label}
        </span>
        {sourceLabel ? (
          <span className="rounded-md bg-[#FEE2E2] px-1.5 py-0.5 font-geist text-[10px] font-semibold text-[#B91C1C]">
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
              <div className="mt-2 font-geist text-2xl font-semibold text-beige900">
                {stats.total}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Published</div>
              <div className="mt-2 font-geist text-2xl font-semibold text-[#29513A]">
                {stats.published}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Draft</div>
              <div className="mt-2 font-geist text-2xl font-semibold text-[#8A5A12]">
                {stats.draft}
              </div>
            </div>
            <button
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
            </button>
          </section>
        }
      >
        <section className="grid gap-5 sm:grid-cols-[380px_minmax(0,1fr)]">
          <aside className={cx(opsTheme.panel, "overflow-hidden")}>
            <div className="border-b border-beige900/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={opsTheme.eyebrow}>Jobs</div>
                  <h2 className="mt-1 font-geist text-lg font-medium text-beige900">
                    Official job list
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={startNewJob}
                  className={cx(opsTheme.buttonPrimary, "h-10 px-3")}
                >
                  <Plus className="h-4 w-4" />
                  New
                </button>
              </div>

              <div className="mt-4 flex items-center gap-2 rounded-md border border-beige900/10 bg-white/70 px-3">
                <Search className="h-4 w-4 text-beige900/40" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search role, company, slug"
                  className="h-10 flex-1 bg-transparent font-geist text-sm text-beige900 outline-none placeholder:text-beige900/35"
                />
              </div>

              <div className="mt-3 grid grid-cols-3 rounded-md bg-beige500/55 p-1">
                {[
                  ["all", "All"],
                  ["published", "Published"],
                  ["draft", "Draft"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as JobFilter)}
                    className={cx(
                      "h-8 rounded px-2 font-geist text-xs font-medium transition",
                      filter === value
                        ? "bg-white text-beige900 shadow-sm"
                        : "text-beige900/55 hover:text-beige900"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[760px] overflow-y-auto">
              {jobsQuery.isLoading ? (
                <div className="flex items-center gap-2 p-4 font-geist text-sm text-beige900/55">
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
                <div className="p-4 font-geist text-sm text-beige900/55">
                  표시할 job이 없습니다.
                </div>
              ) : null}

              {filteredJobs.map((job) => {
                const isAshbyConnected = hasAshbyConnection(job);

                return (
                  <button
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
                      "block w-full border-b border-l-4 border-beige900/5 border-l-transparent px-4 py-3 text-left transition",
                      isAshbyConnected &&
                        "border-l-[#2563EB] bg-[#F3F7FF] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]",
                      activeJobId === job.id
                        ? isAshbyConnected
                          ? "bg-[#EAF2FF]"
                          : "bg-beige900/5"
                        : isAshbyConnected
                          ? "hover:bg-[#EAF2FF]"
                          : "hover:bg-white/60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-geist text-sm font-semibold text-beige900">
                          {job.roleTitle}
                        </div>
                        <div className="mt-1 truncate font-geist text-xs text-beige900/55">
                          {job.companyName}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isAshbyConnected ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#2563EB] px-2 py-1 font-geist text-[11px] font-semibold text-white shadow-sm">
                            <Link2 className="h-3 w-3" />
                            Ashby 연결
                          </span>
                        ) : null}
                        <span
                          className={cx(
                            "rounded-md px-2 py-1 font-geist text-[11px] font-medium",
                            job.isInternalCopy
                              ? "bg-beige900/10 text-beige900/65"
                              : job.isPublished
                                ? "bg-[#E4EDE2] text-[#29513A]"
                                : "bg-[#FEF3C7] text-[#92400E]"
                          )}
                        >
                          {job.isInternalCopy
                            ? "Landing copy"
                            : job.isPublished
                              ? "Published"
                              : "Draft"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 font-geist text-[12px] text-beige900/45">
                      <span
                        className={cx(
                          "truncate",
                          isAshbyConnected && "font-semibold text-[#1D4ED8]"
                        )}
                      >
                        {job.isInternalCopy
                          ? "How Harper helps / 진행과정"
                          : isAshbyConnected
                            ? `Ashby ID · ${job.ashbyJobPostingId}`
                            : job.location}
                      </span>
                      <span>#{job.displayOrder}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={cx(opsTheme.panel, "p-5")}>
            <div className="flex flex-col gap-4 border-b border-beige900/10 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <div className={opsTheme.eyebrow}>Editor</div>
                <h2 className="mt-1 font-geist text-xl font-medium text-beige900">
                  {draft.id ? "Edit official job" : "Create official job"}
                </h2>
                <p className="mt-2 font-geist text-sm leading-6 text-beige900/60">
                  {isInternalCopyDraft
                    ? "이 row는 공통 landing copy 전용입니다. 저장해도 public job으로 공개되지 않습니다."
                    : "공개 페이지에는 `is_published=true`인 job만 노출됩니다."}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {draft.slug && !isInternalCopyDraft ? (
                  <Link
                    href={`/jobs/${draft.slug}`}
                    target="_blank"
                    className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                  >
                    Preview
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => jobsQuery.refetch()}
                  className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
                {hasUnsavedChanges ? (
                  <button
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
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className={cx(opsTheme.panelSoft, "p-4")}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="block font-geist text-sm font-semibold text-beige900">
                      Published
                    </div>
                    <div className="mt-1 block font-geist text-xs text-beige900/50">
                      {isInternalCopyDraft
                        ? "internal_internal row는 항상 비공개로 유지됩니다."
                        : "켜면 `/jobs`와 상세 페이지에서 공개됩니다."}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effectiveIsPublished}
                    aria-label="Toggle published status"
                    disabled={isInternalCopyDraft}
                    onClick={() =>
                      !isInternalCopyDraft &&
                      updateDraft("isPublished", !draft.isPublished)
                    }
                    className={cx(
                      "relative h-7 w-12 shrink-0 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-beige900/20 focus:ring-offset-2 focus:ring-offset-beige100",
                      isInternalCopyDraft
                        ? "cursor-not-allowed border-beige900/10 bg-beige500/70 opacity-70"
                        : effectiveIsPublished
                          ? "border-beige900 bg-beige900"
                          : "border-beige900/15 bg-white/80"
                    )}
                  >
                    <span
                      className={cx(
                        "absolute top-1 h-5 w-5 rounded-full shadow-sm transition",
                        effectiveIsPublished
                          ? "left-6 bg-beige100"
                          : "left-1 bg-beige900/35"
                      )}
                    />
                  </button>
                </div>
                <div
                  className={cx(
                    "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-geist text-xs font-medium",
                    effectiveIsPublished
                      ? "bg-[#E4EDE2] text-[#29513A]"
                      : "bg-beige500/70 text-beige900/55"
                  )}
                >
                  {isInternalCopyDraft ? (
                    <LockKeyhole className="h-3.5 w-3.5" />
                  ) : effectiveIsPublished ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-beige900/35" />
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
                <div className="mt-3 grid gap-2 font-geist text-xs text-beige900/55 sm:grid-cols-3">
                  <div>
                    <div className="text-beige900/35">Created</div>
                    <div className="mt-1 text-beige900">
                      {formatDateTime(selectedJob?.createdAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-beige900/35">Updated</div>
                    <div className="mt-1 text-beige900">
                      {formatDateTime(selectedJob?.updatedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-beige900/35">Published</div>
                    <div className="mt-1 text-beige900">
                      {formatDateTime(selectedJob?.publishedAt)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field
                label="Role title"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <input
                  value={draft.roleTitle}
                  disabled={isInternalCopyDraft}
                  onChange={(event) =>
                    updateDraft("roleTitle", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isAshbyConnectedDraft && ashbySourcedFieldClass,
                    isInternalCopyDraft &&
                      "cursor-not-allowed bg-beige500/60 text-beige900/55"
                  )}
                />
              </Field>
              <Field
                label="Company name"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <input
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
              <Field label="Slug">
                <div className="flex gap-2">
                  <input
                    value={draft.slug}
                    disabled={isInternalCopyDraft}
                    onChange={(event) =>
                      updateDraft("slug", event.target.value)
                    }
                    className={cx(
                      opsTheme.input,
                      isInternalCopyDraft &&
                        "cursor-not-allowed bg-beige500/60 text-beige900/55"
                    )}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateSlug}
                    disabled={isInternalCopyDraft}
                    className={cx(
                      opsTheme.buttonSecondary,
                      "h-11 px-3",
                      isInternalCopyDraft && "cursor-not-allowed opacity-55"
                    )}
                  >
                    Generate
                  </button>
                </div>
              </Field>
              <Field label="Ashby job posting ID">
                <input
                  value={draft.ashbyJobPostingId}
                  disabled={isInternalCopyDraft}
                  onChange={(event) =>
                    updateDraft("ashbyJobPostingId", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isInternalCopyDraft &&
                      "cursor-not-allowed bg-beige500/60 text-beige900/55"
                  )}
                  placeholder="45134452-f53b-4d4c-915e-4a4615fb6c93"
                />
              </Field>
              <Field label="Display order">
                <input
                  type="number"
                  value={draft.displayOrder}
                  onChange={(event) =>
                    updateDraft("displayOrder", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field
                label="Location"
                sourceLabel={isAshbyConnectedDraft ? "Ashby" : undefined}
              >
                <input
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
                <input
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
                <input
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
              <Field label="Seniority">
                <input
                  value={draft.seniority}
                  onChange={(event) =>
                    updateDraft("seniority", event.target.value)
                  }
                  className={opsTheme.input}
                  placeholder="Senior / Staff"
                />
              </Field>
              <Field label="Compensation">
                <input
                  value={draft.compensation}
                  onChange={(event) =>
                    updateDraft("compensation", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field label="Company website URL">
                <input
                  value={draft.companyWebsiteUrl}
                  onChange={(event) =>
                    updateDraft("companyWebsiteUrl", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field label="Company logo URL">
                <input
                  value={draft.companyLogoUrl}
                  onChange={(event) =>
                    updateDraft("companyLogoUrl", event.target.value)
                  }
                  className={opsTheme.input}
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
                <textarea
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
                label={
                  isInternalCopyDraft
                    ? "진행과정 markdown"
                    : "Role description markdown"
                }
                sourceLabel={
                  isAshbyConnectedDraft ? "Ashby description" : undefined
                }
              >
                <textarea
                  value={draft.roleDescriptionMarkdown}
                  onChange={(event) =>
                    updateDraft("roleDescriptionMarkdown", event.target.value)
                  }
                  className={cx(
                    opsTheme.textarea,
                    "min-h-[480px] resize-y",
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
              </Field>
              <Field
                label={
                  isInternalCopyDraft
                    ? "How Harper helps markdown"
                    : "Company description markdown"
                }
                sourceLabel={
                  isAshbyConnectedDraft
                    ? "Ashby company description"
                    : undefined
                }
              >
                <textarea
                  value={draft.companyDescriptionMarkdown}
                  onChange={(event) =>
                    updateDraft(
                      "companyDescriptionMarkdown",
                      event.target.value
                    )
                  }
                  className={cx(
                    opsTheme.textarea,
                    "min-h-[360px] resize-y",
                    isAshbyConnectedDraft && ashbySourcedFieldClass
                  )}
                />
              </Field>
            </div>
          </section>
        </section>
      </OpsShell>
    </>
  );
}
