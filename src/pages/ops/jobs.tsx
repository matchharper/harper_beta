import OpsShell from "@/components/ops/OpsShell";
import {
  formatKstRelativeDate,
  formatKstRelativeDateTime,
} from "@/components/ops/dateUtils";
import InternalRoleCombobox from "@/components/ops/jobs/InternalRoleCombobox";
import { cx, opsTheme } from "@/components/ops/theme";
import { showToast } from "@/components/toast/toast";
import { MarkdownRichTextEditor } from "@/components/ui/markdown-rich-text-editor";
import { Switch } from "@/components/ui/switch";
import {
  useOpsOfficialJobAnalytics,
  useOpsOfficialJobInternalRoleOptions,
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
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import Head from "next/head";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BareButton, MuteButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea as UiTextarea } from "@/components/ui/textarea";

type JobFilter = "all" | "published" | "draft";
type LinkedinFilter = "all" | "published" | "unpublished";
type LocationFilter = "all" | "kr" | "jp" | "us" | "uk" | "sg" | "th" | "au";
const NEW_JOB_ID = "__new_official_job__";
const AUTO_SAVE_DELAY_MS = 1_000;

const JOB_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: JobFilter;
}> = [
  { label: "All", value: "all" },
  { label: "Published", value: "published" },
  { label: "Draft", value: "draft" },
];

const LINKEDIN_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: LinkedinFilter;
}> = [
  { label: "LinkedIn 전체", value: "all" },
  { label: "배포됨", value: "published" },
  { label: "배포되지 않음", value: "unpublished" },
];

const LOCATION_FILTER_OPTIONS: ReadonlyArray<{
  label: string;
  value: LocationFilter;
}> = [
  { label: "Location 전체", value: "all" },
  { label: "대한민국", value: "kr" },
  { label: "일본", value: "jp" },
  { label: "미국", value: "us" },
  { label: "영국", value: "uk" },
  { label: "싱가폴", value: "sg" },
  { label: "태국", value: "th" },
  { label: "호주", value: "au" },
];

const LOCATION_MATCHERS: Record<
  Exclude<LocationFilter, "all">,
  { flags: string[]; terms: string[] }
> = {
  kr: {
    flags: ["🇰🇷"],
    terms: [
      "대한민국",
      "한국",
      "south korea",
      "republic of korea",
      "korea",
      "seoul",
      "서울",
      "판교",
      "성남",
      "인천",
      "부산",
      "대전",
      "대구",
      "광주",
      "제주",
      "수원",
    ],
  },
  jp: {
    flags: ["🇯🇵"],
    terms: [
      "일본",
      "japan",
      "tokyo",
      "도쿄",
      "東京",
      "osaka",
      "오사카",
      "kyoto",
      "교토",
      "yokohama",
    ],
  },
  us: {
    flags: ["🇺🇸"],
    terms: [
      "미국",
      "united states",
      "united states of america",
      "usa",
      "us",
      "new york",
      "nyc",
      "san francisco",
      "bay area",
      "california",
      "los angeles",
      "seattle",
      "austin",
      "boston",
      "chicago",
      "washington dc",
    ],
  },
  uk: {
    flags: ["🇬🇧"],
    terms: [
      "영국",
      "united kingdom",
      "uk",
      "great britain",
      "britain",
      "england",
      "london",
      "런던",
      "manchester",
      "edinburgh",
      "scotland",
    ],
  },
  sg: {
    flags: ["🇸🇬"],
    terms: ["싱가포르", "싱가폴", "singapore", "sg"],
  },
  th: {
    flags: ["🇹🇭"],
    terms: ["태국", "thailand", "bangkok", "방콕", "th"],
  },
  au: {
    flags: ["🇦🇺"],
    terms: [
      "호주",
      "australia",
      "sydney",
      "시드니",
      "melbourne",
      "멜버른",
      "brisbane",
      "perth",
      "au",
    ],
  },
};

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
  isOnLinkedin: boolean;
  isPublished: boolean;
  location: string;
  roleDescriptionMarkdown: string;
  roleId: string;
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

type OfficialJobAutoSaveState =
  | { key: string; status: "waiting" | "saving" | "saved" }
  | { error: string; key: string; status: "error" };

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
  isOnLinkedin: false,
  isPublished: false,
  location: "",
  roleDescriptionMarkdown: "",
  roleId: "",
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
  "isOnLinkedin",
  "isPublished",
  "location",
  "roleDescriptionMarkdown",
  "roleId",
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
    isOnLinkedin: job.isOnLinkedin,
    isPublished: job.isPublished,
    location: job.location,
    roleDescriptionMarkdown: job.roleDescriptionMarkdown,
    roleId: job.roleId ?? "",
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
    isOnLinkedin: isInternalCopy ? false : draft.isOnLinkedin,
    isPublished: isInternalCopy ? false : draft.isPublished,
    location: draft.location,
    roleDescriptionMarkdown: draft.roleDescriptionMarkdown,
    roleId: isInternalCopy ? null : draft.roleId,
    roleTitle: isInternalCopy
      ? OFFICIAL_JOBS_INTERNAL_COPY_ROLE_TITLE
      : draft.roleTitle,
    seniority: draft.seniority,
    shortDescription: draft.shortDescription,
    slug: isInternalCopy ? OFFICIAL_JOBS_INTERNAL_COPY_SLUG : draft.slug,
    vertical: draft.vertical,
  };
}

function getAutoSaveBlockReason(draft: OfficialJobDraft) {
  if (isOfficialJobsInternalCopyIdentity(draft)) return null;
  if (!draft.roleTitle.trim()) return "Job title을 입력하면 자동 저장됩니다.";
  if (!draft.companyName.trim())
    return "Company name을 입력하면 자동 저장됩니다.";
  if (!draft.location.trim()) return "Location을 입력하면 자동 저장됩니다.";
  if (draft.isPublished && !draft.roleId.trim()) {
    return "공개하려면 Internal role을 선택해 주세요.";
  }
  return null;
}

function rebaseOfficialJobDraft(
  savedDraft: OfficialJobDraft,
  persistedDraft: OfficialJobDraft,
  currentDraft: OfficialJobDraft
) {
  return OFFICIAL_JOB_DRAFT_FIELDS.reduce<OfficialJobDraft>((next, field) => {
    if (field !== "id" && currentDraft[field] !== persistedDraft[field]) {
      return { ...next, [field]: currentDraft[field] };
    }
    return next;
  }, savedDraft);
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

function matchesFilter(job: OpsOfficialJobRecord, filter: JobFilter) {
  if (filter === "published") return job.isPublished;
  if (filter === "draft") return !job.isPublished;
  return true;
}

function matchesLinkedinFilter(
  job: OpsOfficialJobRecord,
  filter: LinkedinFilter
) {
  if (filter === "published") return job.isOnLinkedin;
  if (filter === "unpublished") return !job.isOnLinkedin;
  return true;
}

function normalizeLocationTerm(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchesLocationFilter(
  job: OpsOfficialJobRecord,
  filter: LocationFilter
) {
  if (filter === "all") return true;

  const matcher = LOCATION_MATCHERS[filter];
  const rawLocation = job.location.normalize("NFKC").toLocaleLowerCase();
  if (matcher.flags.some((flag) => rawLocation.includes(flag))) return true;

  const normalizedLocation = ` ${normalizeLocationTerm(rawLocation)} `;
  return matcher.terms.some((term) =>
    normalizedLocation.includes(` ${normalizeLocationTerm(term)} `)
  );
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

function Field({ children, label }: { children: ReactNode; label: ReactNode }) {
  return (
    <label className="block">
      <span className={opsTheme.label}>{label}</span>
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
  const [linkedinFilter, setLinkedinFilter] = useState<LinkedinFilter>("all");
  const [locationFilter, setLocationFilter] = useState<LocationFilter>("all");
  const [draftState, setDraftState] = useState<OfficialJobDraftState>({
    draft: EMPTY_DRAFT,
    initialDraft: EMPTY_DRAFT,
    key: NEW_JOB_ID,
  });
  const [autoSaveState, setAutoSaveState] =
    useState<OfficialJobAutoSaveState | null>(null);
  const saveRequestInFlightRef = useRef(false);
  const jobsQuery = useOpsOfficialJobs(canFetchInternal);
  const internalRolesQuery =
    useOpsOfficialJobInternalRoleOptions(canFetchInternal);
  const { isPending: isSavePending, mutateAsync: saveJob } =
    useSaveOpsOfficialJob();
  const jobs = useMemo(
    () => jobsQuery.data?.jobs ?? [],
    [jobsQuery.data?.jobs]
  );
  const activeJobId =
    selectedJobId === NEW_JOB_ID
      ? null
      : (selectedJobId ?? jobs[0]?.id ?? null);
  const selectedJob = jobs.find((job) => job.id === activeJobId) ?? null;
  const activeDraftKey =
    selectedJobId === NEW_JOB_ID ? NEW_JOB_ID : activeJobId;
  const currentDraftKey = activeDraftKey ?? NEW_JOB_ID;
  const draftStateMatchesActive = draftState.key === activeDraftKey;
  const selectedJobDraft = selectedJob ? jobToDraft(selectedJob) : null;
  const draft = draftStateMatchesActive
    ? draftState.draft
    : (selectedJobDraft ?? EMPTY_DRAFT);
  const initialDraft = draftStateMatchesActive
    ? draftState.initialDraft
    : (selectedJobDraft ?? EMPTY_DRAFT);
  const hasUnsavedChanges = !areOfficialJobDraftsEqual(draft, initialDraft);
  const autoSaveBlockReason = getAutoSaveBlockReason(draft);
  const currentAutoSaveFailed =
    autoSaveState?.key === currentDraftKey && autoSaveState.status === "error";
  const isInternalCopyDraft = isOfficialJobsInternalCopyIdentity(draft);
  const effectiveIsPublished = isInternalCopyDraft ? false : draft.isPublished;
  const isSlugLocked = Boolean(draft.id) || isInternalCopyDraft;
  const analyticsQuery = useOpsOfficialJobAnalytics(
    selectedJob?.id,
    canFetchInternal && Boolean(selectedJob) && !selectedJob?.isInternalCopy
  );

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs.filter(
      (job) =>
        matchesFilter(job, filter) &&
        matchesLinkedinFilter(job, linkedinFilter) &&
        matchesLocationFilter(job, locationFilter) &&
        matchesQuery(job, normalizedQuery)
    );
  }, [filter, jobs, linkedinFilter, locationFilter, query]);

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
    if (selectedJobId === null && currentDraftKey !== NEW_JOB_ID) {
      setSelectedJobId(currentDraftKey);
    }
    setDraftState({
      draft: { ...draft, [key]: value },
      initialDraft,
      key: currentDraftKey,
    });
    setAutoSaveState({ key: currentDraftKey, status: "waiting" });
  };

  const persistDraft = useCallback(
    async (draftToSave: OfficialJobDraft, draftKey: string) => {
      if (saveRequestInFlightRef.current) return false;
      saveRequestInFlightRef.current = true;
      setAutoSaveState({ key: draftKey, status: "saving" });

      try {
        const result = await saveJob(draftToPayload(draftToSave));
        const savedDraft = jobToDraft(result.job);

        setSelectedJobId((currentJobId) =>
          currentJobId === draftKey ? result.job.id : currentJobId
        );
        setDraftState((currentState) => {
          if (currentState.key !== draftKey) return currentState;

          return {
            draft: rebaseOfficialJobDraft(
              savedDraft,
              draftToSave,
              currentState.draft
            ),
            initialDraft: savedDraft,
            key: result.job.id,
          };
        });
        setAutoSaveState({ key: result.job.id, status: "saved" });
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Official job 저장 실패";
        setAutoSaveState({ error: message, key: draftKey, status: "error" });
        showToast({ message, variant: "error" });
        return false;
      } finally {
        saveRequestInFlightRef.current = false;
      }
    },
    [saveJob]
  );

  useEffect(() => {
    if (
      !canFetchInternal ||
      !hasUnsavedChanges ||
      autoSaveBlockReason ||
      currentAutoSaveFailed ||
      isSavePending
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistDraft(draft, currentDraftKey);
    }, AUTO_SAVE_DELAY_MS);

    return () => window.clearTimeout(timeout);
  }, [
    autoSaveBlockReason,
    canFetchInternal,
    currentDraftKey,
    currentAutoSaveFailed,
    draft,
    hasUnsavedChanges,
    persistDraft,
    isSavePending,
  ]);

  const saveBeforeChangingJob = async () => {
    if (!hasUnsavedChanges || autoSaveBlockReason) return true;
    return persistDraft(draft, currentDraftKey);
  };

  const startNewJob = async () => {
    if (saveRequestInFlightRef.current) return;
    if (!(await saveBeforeChangingJob())) return;

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

  const selectJob = async (job: OpsOfficialJobRecord) => {
    if (job.id === activeJobId || saveRequestInFlightRef.current) return;
    if (!(await saveBeforeChangingJob())) return;

    const nextDraft = jobToDraft(job);
    setSelectedJobId(job.id);
    setDraftState({
      draft: nextDraft,
      initialDraft: nextDraft,
      key: job.id,
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

  const handleAddRoleDescriptionTemplate = (
    template: (typeof ROLE_DESCRIPTION_MARKDOWN_TEMPLATES)[number]
  ) => {
    const currentDescription = draft.roleDescriptionMarkdown.trimEnd();
    const templateContent = template.content.trim();
    updateDraft(
      "roleDescriptionMarkdown",
      currentDescription
        ? `${currentDescription}\n\n${templateContent}`
        : templateContent
    );
    showToast({ message: `${template.label} 섹션 추가 완료` });
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
              <div className="mt-2 text-xl font-semibold text-neutral-primary">
                {stats.total}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Published</div>
              <div className="mt-2 text-xl font-semibold text-positive">
                {stats.published}
              </div>
            </div>
            <div className="flex flex-row gap-2 items-center px-2">
              <div className={opsTheme.eyebrow}>Draft</div>
              <div className="mt-2 text-xl font-semibold text-info">
                {stats.draft}
              </div>
            </div>
          </section>
        }
      >
        <section className="grid gap-5 sm:grid-cols-[380px_minmax(0,1fr)]">
          <aside className={cx(opsTheme.panel, "overflow-hidden")}>
            <div className="border-b border-neutral-1000-a05 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="mt-1 text-lg font-medium text-neutral-primary">
                  Official job list
                </h2>
                <BareButton
                  type="button"
                  onClick={() => void startNewJob()}
                  disabled={isSavePending}
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

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Select
                  items={JOB_FILTER_OPTIONS}
                  value={filter}
                  onValueChange={(value) => setFilter(value as JobFilter)}
                >
                  <SelectTrigger aria-label="공개 상태 필터" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {JOB_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Select
                  items={LINKEDIN_FILTER_OPTIONS}
                  value={linkedinFilter}
                  onValueChange={(value) =>
                    setLinkedinFilter(value as LinkedinFilter)
                  }
                >
                  <SelectTrigger aria-label="LinkedIn 배포 상태 필터" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {LINKEDIN_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>

                <Select
                  items={LOCATION_FILTER_OPTIONS}
                  value={locationFilter}
                  onValueChange={(value) =>
                    setLocationFilter(value as LocationFilter)
                  }
                >
                  <SelectTrigger
                    aria-label="Location 국가 필터"
                    size="sm"
                    className="col-span-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false}>
                    <SelectGroup>
                      {LOCATION_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                return (
                  <BareButton
                    key={job.id}
                    type="button"
                    onClick={() => void selectJob(job)}
                    disabled={isSavePending}
                    className={cx(
                      "block w-full border-b border-l-4 border-neutral-1000-a05 border-l-transparent px-4 py-3 text-left transition disabled:cursor-wait disabled:opacity-60",
                      activeJobId === job.id
                        ? "bg-bg-floating"
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
                        <span
                          className={cx(
                            "rounded-sm px-1 py-0.5 text-[11px] font-medium",
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
                        {job.isOnLinkedin && (
                          <span className="rounded-sm bg-action-faded px-1 py-0.5 text-[11px] font-medium text-action">
                            On LinkedIn
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-neutral-muted">
                      <span className="truncate">
                        {job.isInternalCopy
                          ? "Not shown on /jobs"
                          : job.location}
                      </span>
                      <span className="shrink-0">
                        마지막 수정:{" "}
                        {formatKstRelativeDate(job.updatedAt, {
                          maxRelativeDays: Number.POSITIVE_INFINITY,
                        })}
                      </span>
                    </div>
                  </BareButton>
                );
              })}
            </div>
          </aside>

          <section className={cx(opsTheme.panel, "p-5")}>
            <div className="flex flex-col gap-4 border-b border-neutral-1000-a05 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="mt-1 text-xl font-medium text-neutral-primary">
                  {draft.id ? "Edit official job" : "Create official job"}
                </h2>
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
                {hasUnsavedChanges && autoSaveBlockReason ? (
                  <div
                    className="max-w-56 text-right text-xs text-neutral-muted"
                    role="status"
                  >
                    {autoSaveBlockReason}
                  </div>
                ) : hasUnsavedChanges &&
                  autoSaveState?.key === currentDraftKey &&
                  autoSaveState.status === "error" ? (
                  <MuteButton
                    type="button"
                    onClick={() => void persistDraft(draft, currentDraftKey)}
                    disabled={isSavePending}
                    className="h-10 px-4"
                    size="lg"
                    title={autoSaveState.error}
                    variant="neutral"
                  >
                    <RefreshCw className="h-4 w-4" />
                    다시 저장
                  </MuteButton>
                ) : hasUnsavedChanges ? (
                  <div
                    aria-live="polite"
                    className={cx(opsTheme.buttonPrimary, "h-10 px-4")}
                    role="status"
                  >
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    저장 중...
                  </div>
                ) : autoSaveState?.key === currentDraftKey &&
                  autoSaveState.status === "saved" ? (
                  <div
                    aria-live="polite"
                    className="inline-flex h-10 items-center gap-2 px-2 text-sm font-medium text-positive"
                    role="status"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    저장됨
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-1 grid gap-4 lg:grid-cols-2">
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

              <div className={cx(opsTheme.panelSoft, "p-4")}>
                <div className={opsTheme.eyebrow}></div>
                <div className="mt-3 grid gap-2 text-xs text-neutral-muted sm:grid-cols-3">
                  {[
                    ["총 방문자", analyticsQuery.data?.analytics.totalVisitors],
                    [
                      "어제 방문자",
                      analyticsQuery.data?.analytics.yesterdayVisitors,
                    ],
                    [
                      "총 회원가입",
                      analyticsQuery.data?.analytics.totalSignups,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <div className="text-neutral-soft">{label}</div>
                      <div className="mt-1 text-base font-semibold text-neutral-primary">
                        {analyticsQuery.isLoading ? (
                          <span className="inline-block h-5 w-8 animate-pulse rounded bg-bg-weak" />
                        ) : typeof value === "number" ? (
                          value.toLocaleString("ko-KR")
                        ) : (
                          "-"
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {analyticsQuery.error ? (
                  <div className="mt-2 text-xs text-critical">
                    방문 통계를 불러오지 못했습니다.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2 rounded-md border border-neutral-1000-a05 shadow-xs">
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
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="block text-sm font-semibold text-neutral-primary">
                      LinkedIn
                    </div>
                    <div className="mt-1 block text-xs text-neutral-muted">
                      LinkedIn에 게시된 공고인지 표시합니다.
                    </div>
                  </div>
                  <Switch
                    checked={draft.isOnLinkedin}
                    aria-label="Toggle LinkedIn status"
                    disabled={isInternalCopyDraft}
                    onCheckedChange={(checked) =>
                      !isInternalCopyDraft &&
                      updateDraft("isOnLinkedin", checked)
                    }
                    className={cx(
                      isInternalCopyDraft && "cursor-not-allowed opacity-70"
                    )}
                  />
                </div>
                <div
                  className={cx(
                    "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
                    draft.isOnLinkedin
                      ? "bg-positive-faded text-positive"
                      : "bg-bg-weak text-neutral-muted"
                  )}
                >
                  {draft.isOnLinkedin ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-disabled" />
                  )}
                  {draft.isOnLinkedin ? "On LinkedIn" : "Not on LinkedIn"}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Field label="Job title">
                <UiInput
                  unstyled
                  value={draft.roleTitle}
                  disabled={isInternalCopyDraft}
                  onChange={(event) =>
                    updateDraft("roleTitle", event.target.value)
                  }
                  className={cx(
                    opsTheme.input,
                    isInternalCopyDraft &&
                      "cursor-not-allowed bg-bg-weak text-neutral-muted"
                  )}
                />
              </Field>
              <Field label="Company name">
                <UiInput
                  unstyled
                  value={draft.companyName}
                  onChange={(event) =>
                    updateDraft("companyName", event.target.value)
                  }
                  className={opsTheme.input}
                />
              </Field>
              <Field label="Location">
                <UiInput
                  unstyled
                  value={draft.location}
                  onChange={(event) =>
                    updateDraft("location", event.target.value)
                  }
                  className={opsTheme.input}
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
              <Field label="Employment type">
                <div
                  className="flex items-center gap-2"
                  role="radiogroup"
                  aria-label="Employment type"
                >
                  {(["Full-time", "Part-time"] as const).map((option) => {
                    const selected = draft.employmentType === option;
                    return (
                      <MuteButton
                        key={option}
                        aria-checked={selected}
                        className={cx(
                          "min-w-24",
                          selected && "border-neutral-800"
                        )}
                        onClick={() => updateDraft("employmentType", option)}
                        role="radio"
                        size="lg"
                        variant={selected ? "neutral" : "default"}
                      >
                        {option}
                      </MuteButton>
                    );
                  })}
                </div>
              </Field>
              <Field label="Internal role">
                <InternalRoleCombobox
                  roles={internalRolesQuery.data?.roles ?? []}
                  disabled={!canFetchInternal || isInternalCopyDraft}
                  isLoading={internalRolesQuery.isLoading}
                  value={draft.roleId}
                  onValueChange={(value) => updateDraft("roleId", value)}
                />
                {internalRolesQuery.error ? (
                  <div className="mt-1.5 text-xs text-critical">
                    Internal role 목록을 불러오지 못했습니다.
                  </div>
                ) : null}
              </Field>
            </div>

            <div className="mt-5 grid gap-4">
              <Field label="Short description">
                <UiTextarea
                  unstyled
                  value={draft.shortDescription}
                  onChange={(event) =>
                    updateDraft("shortDescription", event.target.value)
                  }
                  className={cx(opsTheme.textarea, "min-h-[88px]")}
                />
              </Field>
              <div>
                <div className={opsTheme.label}>Role description</div>
                <div className="mt-2">
                  <MarkdownRichTextEditor
                    key={activeDraftKey ?? NEW_JOB_ID}
                    ariaLabel="Role description"
                    className={cx(
                      opsTheme.textarea,
                      "min-h-[480px] focus-within:border-black/80 focus-within:bg-bg-default"
                    )}
                    onValueChange={(value) =>
                      updateDraft("roleDescriptionMarkdown", value)
                    }
                    value={draft.roleDescriptionMarkdown}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ROLE_DESCRIPTION_MARKDOWN_TEMPLATES.map((template) => (
                    <BareButton
                      key={template.label}
                      type="button"
                      onClick={() => handleAddRoleDescriptionTemplate(template)}
                      className={cx(
                        opsTheme.buttonSecondary,
                        "h-10 px-3 text-xs"
                      )}
                    >
                      {template.label} 추가
                    </BareButton>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
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
