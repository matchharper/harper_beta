import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import {
  AlertCircle,
  Building2,
  Check,
  Clock3,
  Github,
  GraduationCap,
  Linkedin,
  Loader2,
  Plus,
  Search,
  Sparkles,
  UserSquare2,
  X,
} from "lucide-react";
import AppLayout from "@/components/layout/app";
import AtsBulkMailPanel from "@/components/ats/AtsBulkMailPanel";
import AtsCandidateDrawer, {
  type AtsMainPanelTab,
} from "@/components/ats/AtsCandidateDrawer";
import AtsSequenceStageMarks from "@/components/ats/AtsSequenceStageMarks";
import AtsWorkspacePanel from "@/components/ats/AtsWorkspacePanel";
import AtsSequenceMarkButton from "@/components/ui/AtsSequenceMarkButton";
import { showToast } from "@/components/toast/toast";
import {
  useAddAtsContactHistory,
  useAtsCandidateDetail,
  useAtsWorkspace,
  useCancelAtsScheduledContactEmail,
  useCancelAtsEmailDiscovery,
  useClearAtsEmailDiscoveryTrace,
  useDeleteAtsContactHistory,
  useDiscoverAtsEmail,
  useGenerateAtsContactEmail,
  useGenerateAtsSequence,
  useResetAtsCandidateOutreach,
  useScheduleAtsContactEmail,
  useSaveAtsEmailRecipientName,
  useSaveAtsWorkspace,
  useSaveAtsCandidateMemo,
  useSaveAtsSequenceDraft,
  useSaveAtsSequenceSchedule,
  useSendAtsContactEmail,
  useSendAtsBulkMail,
  useSendAtsSequenceStep,
  useSetManualAtsEmail,
  useUpdateAtsSequenceStatus,
} from "@/hooks/useAtsWorkspace";
import CandidateProfileDetailPage from "@/components/profile/CandidateProfileDetailPage";
import {
  ATS_SEQUENCE_STEP_COUNT,
  buildCandidateTemplateVariables,
  createDefaultAtsSequenceSchedule,
  normalizeAtsSequenceSchedule,
  replaceTemplateVariables,
  type AtsBookmarkFolderOption,
  type AtsCandidateSummary,
  type AtsContactEmailDraft,
  type AtsContactHistoryChannel,
  type AtsContactHistoryItem,
  type AtsMessageRecord,
  type AtsOutreachRecord,
  type AtsSequenceStepSchedule,
  type AtsWorkspaceRecord,
} from "@/lib/ats/shared";
import { canAccessAts } from "@/lib/internalAccess";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";
import { useAuthStore } from "@/store/useAuthStore";
import {
  formatDateTime,
  formatDateTimeInputValue,
  resolveTargetEmail,
  isDueToday,
  matchesFilter,
  getPreviewCandidate,
} from "@/components/ats/utils";

const PANEL_CLASS = "rounded-md border border-white/5 bg-white/5";
const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-sm bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40";
const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-sm border border-white/5 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
const INPUT_CLASS =
  "w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/20";
const TEXTAREA_CLASS =
  "w-full rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/20";

const ATS_TABLE_LAYOUT = {
  bodyCell: "px-3 py-3 align-top",
  candidateHeadline: "max-w-[240px]",
  companyLogo: "h-6 w-6",
  headerCell: "px-3 py-3 font-medium",
  profileImage: "h-9 w-9",
  table: "min-w-[1580px] w-full table-fixed border-collapse",
  widths: {
    select: "w-[36px]",
    candidate: "w-[320px]",
    sequenceMark: "w-[110px]",
    email: "w-[210px]",
    progress: "w-[180px]",
    history: "w-[280px]",
    memo: "w-[260px]",
  },
} as const;

export type FilterKey =
  | "all"
  | "needs_email"
  | "ready"
  | "active"
  | "paused"
  | "completed";

const EMPTY_CONTACT_DRAFT: AtsContactEmailDraft = {
  body: "",
  subject: "",
};
const SHARED_CONTACT_DRAFT_STORAGE_KEY = "ats-shared-contact-draft";

type SequenceDraftState = Record<number, AtsContactEmailDraft>;
type ScrapeTestResult = {
  error?: string | null;
  excerpt?: string | null;
  markdown?: string | null;
  source?: string | null;
  status: number;
  title?: string | null;
  url: string;
};

const EMPTY_ATS_FOLDERS: AtsBookmarkFolderOption[] = [];
const EMPTY_CANDIDATES: AtsCandidateSummary[] = [];
const EMPTY_MESSAGES: AtsMessageRecord[] = [];

function getDefaultScheduledContactAtValue() {
  return formatDateTimeInputValue(new Date(Date.now() + 60 * 60 * 1000));
}

function isContactDraftEmpty(draft: AtsContactEmailDraft) {
  return !draft.subject.trim() && !draft.body.trim();
}

function readSharedContactDraft(): AtsContactEmailDraft {
  if (typeof window === "undefined") {
    return { ...EMPTY_CONTACT_DRAFT };
  }

  try {
    const raw = window.localStorage.getItem(SHARED_CONTACT_DRAFT_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CONTACT_DRAFT };
    const parsed = JSON.parse(raw) as Partial<AtsContactEmailDraft> | null;
    return {
      body: String(parsed?.body ?? ""),
      subject: String(parsed?.subject ?? ""),
    };
  } catch {
    return { ...EMPTY_CONTACT_DRAFT };
  }
}

function createEmptySequenceDraftState(): SequenceDraftState {
  return Object.fromEntries(
    Array.from({ length: ATS_SEQUENCE_STEP_COUNT }, (_, index) => [
      index + 1,
      { ...EMPTY_CONTACT_DRAFT },
    ])
  ) as SequenceDraftState;
}

function cloneSequenceDraftState(
  state: SequenceDraftState
): SequenceDraftState {
  return Object.fromEntries(
    Object.entries(state).map(([stepNumber, draft]) => [
      Number(stepNumber),
      {
        body: draft.body,
        subject: draft.subject,
      },
    ])
  ) as SequenceDraftState;
}

function buildSequenceDraftState(messages: AtsMessageRecord[]) {
  const draftState = createEmptySequenceDraftState();
  const seenSteps = new Set<number>();

  for (const message of messages) {
    if (message.kind !== "sequence" || !message.stepNumber) continue;
    if (
      message.stepNumber < 1 ||
      message.stepNumber > ATS_SEQUENCE_STEP_COUNT ||
      seenSteps.has(message.stepNumber)
    ) {
      continue;
    }

    draftState[message.stepNumber] = {
      body: message.body ?? "",
      subject: message.subject ?? "",
    };
    seenSteps.add(message.stepNumber);
  }

  return draftState;
}

function mergeSequenceDraftState(args: {
  currentDrafts: SequenceDraftState;
  nextServerDrafts: SequenceDraftState;
  previousServerDrafts: SequenceDraftState;
}) {
  const merged = createEmptySequenceDraftState();

  for (
    let stepNumber = 1;
    stepNumber <= ATS_SEQUENCE_STEP_COUNT;
    stepNumber += 1
  ) {
    const currentDraft = args.currentDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;
    const nextServerDraft =
      args.nextServerDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;
    const previousServerDraft =
      args.previousServerDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;

    merged[stepNumber] = {
      body:
        currentDraft.body === previousServerDraft.body
          ? nextServerDraft.body
          : currentDraft.body,
      subject:
        currentDraft.subject === previousServerDraft.subject
          ? nextServerDraft.subject
          : currentDraft.subject,
    };
  }

  return merged;
}

function getStageBadge(outreach: AtsOutreachRecord | null) {
  if (!outreach) {
    return {
      className: "border-white/10 bg-white/5 text-white/70",
      label: "Stage 0/4",
    };
  }

  if (outreach.sequenceStatus === "completed") {
    return {
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      label: "Completed · 4/4",
    };
  }

  if (outreach.sequenceStatus === "paused") {
    return {
      className: "border-amber-400/20 bg-amber-400/10 text-amber-100",
      label: `Paused · ${outreach.activeStep}/4`,
    };
  }

  if (outreach.nextDueAt && isDueToday(outreach.nextDueAt)) {
    return {
      className: "border-sky-400/20 bg-sky-400/10 text-sky-100",
      label: `Due · ${outreach.activeStep}/4`,
    };
  }

  return {
    className: "border-white/10 bg-white/5 text-white/70",
    label: `Stage ${outreach.activeStep}/4`,
  };
}

function getEmailBadge(candidate: AtsCandidateSummary) {
  const email = resolveTargetEmail(candidate);
  if (email) {
    return {
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      label: "이메일 찾음",
    };
  }

  if (candidate.outreach?.emailDiscoveryStatus === "searching") {
    return {
      className: "border-sky-400/20 bg-sky-400/10 text-sky-100",
      label: "탐색 중",
    };
  }

  if (
    candidate.outreach?.emailDiscoveryStatus === "not_found" ||
    candidate.outreach?.emailDiscoveryStatus === "error"
  ) {
    return {
      className: "border-rose-400/20 bg-rose-400/10 text-rose-100",
      label: "이메일 확정 필요",
    };
  }

  if (candidate.outreach?.emailDiscoveryStatus === "canceled") {
    return {
      className: "border-white/10 bg-white/5 text-white/75",
      label: "탐색 중단",
    };
  }

  return {
    className: "border-white/10 bg-white/5 text-white/70",
    label: "이메일 발견 실패",
  };
}

function normalizeWorkspaceRecord(
  workspace: Partial<AtsWorkspaceRecord> | null | undefined
) {
  return {
    bookmarkFolderId:
      workspace?.bookmarkFolderId == null
        ? null
        : Number(workspace.bookmarkFolderId) || null,
    companyPitch: String(workspace?.companyPitch ?? "").trim(),
    jobDescription: String(workspace?.jobDescription ?? "").trim(),
    senderEmail: String(workspace?.senderEmail ?? "").trim(),
    signature: String(workspace?.signature ?? "").trim(),
  };
}

type NormalizedWorkspaceRecord = ReturnType<typeof normalizeWorkspaceRecord>;

function mergeWorkspaceDraftWithServer(args: {
  currentDraft: AtsWorkspaceRecord;
  nextServerWorkspace: NormalizedWorkspaceRecord;
  previousServerWorkspace: NormalizedWorkspaceRecord;
}): AtsWorkspaceRecord {
  const currentDraft = normalizeWorkspaceRecord(args.currentDraft);

  return {
    bookmarkFolderId:
      currentDraft.bookmarkFolderId ===
      args.previousServerWorkspace.bookmarkFolderId
        ? args.nextServerWorkspace.bookmarkFolderId
        : currentDraft.bookmarkFolderId,
    companyPitch:
      currentDraft.companyPitch === args.previousServerWorkspace.companyPitch
        ? args.nextServerWorkspace.companyPitch
        : currentDraft.companyPitch,
    jobDescription:
      currentDraft.jobDescription ===
      args.previousServerWorkspace.jobDescription
        ? args.nextServerWorkspace.jobDescription
        : currentDraft.jobDescription,
    senderEmail:
      currentDraft.senderEmail === args.previousServerWorkspace.senderEmail
        ? args.nextServerWorkspace.senderEmail
        : currentDraft.senderEmail,
    signature:
      currentDraft.signature === args.previousServerWorkspace.signature
        ? args.nextServerWorkspace.signature
        : currentDraft.signature,
  };
}

function IconLinkButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
      aria-label={label}
      title={label}
    >
      {icon}
    </a>
  );
}

function AtsEmailRecipientNameField({
  candidId,
  defaultName,
  savedName,
}: {
  candidId: string;
  defaultName: string | null | undefined;
  savedName: string | null | undefined;
}) {
  const saveEmailRecipientName = useSaveAtsEmailRecipientName();
  const initialValue = String(savedName ?? defaultName ?? "");
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [candidId, initialValue]);

  const handleSave = async () => {
    try {
      await saveEmailRecipientName.mutateAsync({
        candidId,
        emailRecipientName: value,
      });
      showToast({
        message: value.trim()
          ? "메일용 이름을 저장했습니다."
          : "메일용 이름을 기본값으로 되돌렸습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "메일용 이름 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  return (
    <div
      className="mt-3 space-y-1.5"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="text-[11px] text-white/35">메일에 사용할 이름</div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={String(defaultName ?? "") || "이름"}
          className="h-8 min-w-0 flex-1 rounded-sm border border-white/10 bg-white/5 px-2.5 text-xs text-white outline-none placeholder:text-white/35 focus:border-white/20"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveEmailRecipientName.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2.5 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveEmailRecipientName.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

function AtsMemoCell({
  candidId,
  memo,
}: {
  candidId: string;
  memo: string | null | undefined;
}) {
  const saveMemo = useSaveAtsCandidateMemo();
  const [value, setValue] = useState(memo ?? "");

  useEffect(() => {
    setValue(memo ?? "");
  }, [candidId, memo]);

  const handleSave = async () => {
    try {
      await saveMemo.mutateAsync({
        candidId,
        memo: value,
      });
      showToast({ message: "메모를 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  return (
    <div
      className="space-y-2"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="메모"
        className={`${TEXTAREA_CLASS} min-h-[88px] text-xs leading-5`}
      />
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saveMemo.isPending}
          className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saveMemo.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Save
        </button>
      </div>
    </div>
  );
}

function ContactHistoryCell({
  candidId,
  history,
}: {
  candidId: string;
  history: AtsContactHistoryItem[];
}) {
  const addHistory = useAddAtsContactHistory();
  const deleteHistory = useDeleteAtsContactHistory();
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [channel, setChannel] = useState<AtsContactHistoryChannel>("email");
  const [contactedAt, setContactedAt] = useState(() =>
    formatDateTimeInputValue(new Date())
  );
  const [note, setNote] = useState("");

  const handleAdd = async () => {
    try {
      await addHistory.mutateAsync({
        candidId,
        channel,
        contactedAt: new Date(contactedAt).toISOString(),
        note,
      });
      setNote("");
      setContactedAt(formatDateTimeInputValue(new Date()));
      setIsComposerOpen(false);
      showToast({ message: "연락 기록을 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "연락 기록 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleDelete = async (historyId: string) => {
    try {
      await deleteHistory.mutateAsync({ candidId, historyId });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "연락 기록 삭제에 실패했습니다.",
        variant: "error",
      });
    }
  };

  return (
    <div
      className="space-y-2"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setIsComposerOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs text-black transition hover:bg-white/90 hover:text-black"
      >
        <Plus className="h-3.5 w-3.5" />
        연락 기록
      </button>

      {isComposerOpen && (
        <div className="">
          <div className="grid gap-2">
            <select
              value={channel}
              onChange={(event) =>
                setChannel(event.target.value as AtsContactHistoryChannel)
              }
              className={INPUT_CLASS}
            >
              <option value="email">Email</option>
              <option value="linkedin">LinkedIn</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="other">Other</option>
            </select>
            <input
              type="datetime-local"
              value={contactedAt}
              onChange={(event) => setContactedAt(event.target.value)}
              className={INPUT_CLASS}
            />
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="메모"
              className={TEXTAREA_CLASS}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!contactedAt || addHistory.isPending}
                className={BUTTON_PRIMARY}
              >
                {addHistory.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {history.length === 0 && (
          <div className="text-xs text-white/35">기록 없음</div>
        )}
        {history.map((item) => (
          <div
            key={item.id}
            className="rounded-md border border-white/10 bg-black/10 px-2.5 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-white/60">
                    {item.channel}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {formatDateTime(item.contactedAt)}
                  </span>
                </div>
                {item.note && (
                  <div className="mt-1.5 break-words text-xs leading-5 text-white/60">
                    {item.note}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                className="text-white/35 transition hover:text-white/75"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AtsPage() {
  const { user, loading: authLoading } = useAuthStore();
  const isInternal = canAccessAts(user?.email);

  const workspaceQuery = useAtsWorkspace(isInternal);
  const saveWorkspace = useSaveAtsWorkspace();
  const discoverEmail = useDiscoverAtsEmail();
  const cancelEmailDiscovery = useCancelAtsEmailDiscovery();
  const clearEmailTrace = useClearAtsEmailDiscoveryTrace();
  const resetCandidateOutreach = useResetAtsCandidateOutreach();
  const generateContactEmail = useGenerateAtsContactEmail();
  const saveManualEmail = useSetManualAtsEmail();
  const saveCandidateMemo = useSaveAtsCandidateMemo();
  const saveSequenceDraft = useSaveAtsSequenceDraft();
  const saveSequenceSchedule = useSaveAtsSequenceSchedule();
  const generateSequence = useGenerateAtsSequence();
  const sendContactEmail = useSendAtsContactEmail();
  const scheduleContactEmail = useScheduleAtsContactEmail();
  const cancelScheduledContactEmail = useCancelAtsScheduledContactEmail();
  const updateSequenceStatus = useUpdateAtsSequenceStatus();
  const sendSequenceStep = useSendAtsSequenceStep();
  const sendBulkMail = useSendAtsBulkMail();

  const rawCandidates = workspaceQuery.data?.candidates;
  const atsFolders = workspaceQuery.data?.folders ?? EMPTY_ATS_FOLDERS;
  const candidates = useMemo(
    () => rawCandidates ?? EMPTY_CANDIDATES,
    [rawCandidates]
  );
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate])),
    [candidates]
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null
  );
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [mainPanelTab, setMainPanelTab] =
    useState<AtsMainPanelTab>("candidate");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState<AtsWorkspaceRecord>({
    bookmarkFolderId: null,
    companyPitch: "",
    jobDescription: "",
    senderEmail: "",
    signature: "",
  });
  const [candidateMemoDraft, setCandidateMemoDraft] = useState("");
  const [contactDraftByCandidateId, setContactDraftByCandidateId] = useState<
    Record<string, AtsContactEmailDraft>
  >({});
  const [sharedContactDraft, setSharedContactDraft] = useState<AtsContactEmailDraft>(
    () => readSharedContactDraft()
  );
  const [scheduledContactAtByCandidateId, setScheduledContactAtByCandidateId] =
    useState<Record<string, string>>({});
  const [sequenceDraftByCandidateId, setSequenceDraftByCandidateId] = useState<
    Record<string, SequenceDraftState>
  >({});
  const [
    expandedSequenceStepByCandidateId,
    setExpandedSequenceStepByCandidateId,
  ] = useState<Record<string, number | null>>({});
  const [manualEmail, setManualEmail] = useState("");
  const [scrapeTestUrl, setScrapeTestUrl] = useState("");
  const [scrapeTestResult, setScrapeTestResult] =
    useState<ScrapeTestResult | null>(null);
  const [scrapeTestPending, setScrapeTestPending] = useState(false);
  const [sequenceScheduleDraft, setSequenceScheduleDraft] = useState<
    AtsSequenceStepSchedule[]
  >(() => createDefaultAtsSequenceSchedule());
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("");
  const [queuedEmailDiscoveryIds, setQueuedEmailDiscoveryIds] = useState<
    string[]
  >([]);
  const [activeEmailDiscoveryId, setActiveEmailDiscoveryId] = useState<
    string | null
  >(null);
  const [cancellingEmailDiscoveryIds, setCancellingEmailDiscoveryIds] =
    useState<string[]>([]);
  const lastSyncedWorkspaceRef = useRef<NormalizedWorkspaceRecord>(
    normalizeWorkspaceRecord(null)
  );
  const lastSyncedSequenceDraftsRef = useRef<
    Record<string, SequenceDraftState>
  >({});
  const candidateSearchTextById = useMemo(
    () =>
      new Map(
        candidates.map((candidate) => [
          candidate.id,
          [
            candidate.name,
            candidate.headline,
            candidate.currentCompany,
            candidate.currentRole,
            candidate.currentSchool,
            candidate.location,
            candidate.scholarAffiliation,
            resolveTargetEmail(candidate),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase(),
        ])
      ),
    [candidates]
  );

  useEffect(() => {
    if (!workspaceQuery.data?.workspace) return;
    const nextServerWorkspace = normalizeWorkspaceRecord(
      workspaceQuery.data.workspace
    );
    setWorkspaceDraft((currentDraft) =>
      mergeWorkspaceDraftWithServer({
        currentDraft,
        nextServerWorkspace,
        previousServerWorkspace: lastSyncedWorkspaceRef.current,
      })
    );
    lastSyncedWorkspaceRef.current = nextServerWorkspace;
  }, [workspaceQuery.data?.workspace]);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => candidateById.has(id)));
  }, [candidateById]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isContactDraftEmpty(sharedContactDraft)) {
      window.localStorage.removeItem(SHARED_CONTACT_DRAFT_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      SHARED_CONTACT_DRAFT_STORAGE_KEY,
      JSON.stringify(sharedContactDraft)
    );
  }, [sharedContactDraft]);

  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (!matchesFilter(candidate, filter)) return false;
      if (!needle) return true;
      const haystack = candidateSearchTextById.get(candidate.id) ?? "";
      return haystack.includes(needle);
    });
  }, [candidateSearchTextById, candidates, filter, query]);

  useEffect(() => {
    if (filteredCandidates.length === 0) {
      setSelectedCandidateId(null);
      setIsCandidateDrawerOpen(false);
      return;
    }
    if (
      !selectedCandidateId ||
      !filteredCandidates.some((c) => c.id === selectedCandidateId)
    ) {
      if (selectedCandidateId) {
        setIsCandidateDrawerOpen(false);
      }
      setSelectedCandidateId(filteredCandidates[0].id);
    }
  }, [filteredCandidates, selectedCandidateId]);

  const detailQuery = useAtsCandidateDetail(
    selectedCandidateId,
    isInternal && isCandidateDrawerOpen
  );
  const profileDetailQuery = useCandidateDetail(
    user?.id,
    selectedCandidateId ?? undefined,
    isInternal && isCandidateDrawerOpen && mainPanelTab === "profile"
  );
  const currentAtsFolder = useMemo(() => {
    if (atsFolders.length === 0) return null;
    return (
      atsFolders.find(
        (folder) => folder.id === workspaceDraft.bookmarkFolderId
      ) ??
      atsFolders.find((folder) => folder.isDefault) ??
      atsFolders[0] ??
      null
    );
  }, [atsFolders, workspaceDraft.bookmarkFolderId]);
  const activeCandidateSummary = useMemo(
    () =>
      selectedCandidateId
        ? candidateById.get(selectedCandidateId) ?? null
        : null,
    [candidateById, selectedCandidateId]
  );
  const detailCandidate = detailQuery.data?.candidate ?? null;
  const activeCandidate =
    (detailCandidate as AtsCandidateSummary | null) ?? activeCandidateSummary;
  const detailMessages = detailQuery.data?.messages ?? EMPTY_MESSAGES;
  const {
    emailHistory,
    nextServerSequenceDrafts,
    scheduledContactMessages,
  } = useMemo(() => {
    const nextEmailHistory: AtsMessageRecord[] = [];
    const nextScheduledContactMessages: AtsMessageRecord[] = [];

    for (const message of detailMessages) {
      if (message.status === "sent") {
        nextEmailHistory.push(message);
      }
      if (
        message.kind === "manual" &&
        message.status === "draft" &&
        message.scheduledFor
      ) {
        nextScheduledContactMessages.push(message);
      }
    }

    nextEmailHistory.sort((a, b) => {
      const aTime = Date.parse(a.sentAt ?? a.createdAt);
      const bTime = Date.parse(b.sentAt ?? b.createdAt);
      return bTime - aTime;
    });
    nextScheduledContactMessages.sort((a, b) => {
      const aTime = Date.parse(a.scheduledFor ?? a.createdAt);
      const bTime = Date.parse(b.scheduledFor ?? b.createdAt);
      return aTime - bTime;
    });

    return {
      emailHistory: nextEmailHistory,
      nextServerSequenceDrafts: buildSequenceDraftState(detailMessages),
      scheduledContactMessages: nextScheduledContactMessages,
    };
  }, [detailMessages]);
  const savedSequenceSchedule = useMemo(
    () =>
      normalizeAtsSequenceSchedule(
        detailCandidate?.outreach?.sequenceSchedule ??
          activeCandidateSummary?.outreach?.sequenceSchedule ??
          null
      ),
    [
      activeCandidateSummary?.outreach?.sequenceSchedule,
      detailCandidate?.outreach?.sequenceSchedule,
    ]
  );
  const savedSequenceScheduleKey = useMemo(
    () => JSON.stringify(savedSequenceSchedule),
    [savedSequenceSchedule]
  );

  useEffect(() => {
    setCandidateMemoDraft(
      detailCandidate?.outreach?.memo ??
        activeCandidateSummary?.outreach?.memo ??
        ""
    );
  }, [
    activeCandidateSummary?.outreach?.memo,
    detailCandidate?.outreach?.memo,
    selectedCandidateId,
  ]);

  useEffect(() => {
    setSequenceScheduleDraft(savedSequenceSchedule);
  }, [savedSequenceSchedule, savedSequenceScheduleKey, selectedCandidateId]);

  useEffect(() => {
    const nextEmail =
      detailCandidate?.outreach?.targetEmail ??
      detailCandidate?.existingEmailSources?.[0]?.email ??
      "";
    setManualEmail(nextEmail);
  }, [
    detailCandidate?.outreach?.targetEmail,
    detailCandidate?.existingEmailSources,
    selectedCandidateId,
  ]);

  useEffect(() => {
    if (!selectedCandidateId) return;
    setScheduledContactAtByCandidateId((prev) =>
      prev[selectedCandidateId]
        ? prev
        : {
            ...prev,
            [selectedCandidateId]: getDefaultScheduledContactAtValue(),
          }
    );
  }, [selectedCandidateId]);

  useEffect(() => {
    if (!selectedCandidateId) return;

    setSequenceDraftByCandidateId((prev) => {
      const currentDrafts = prev[selectedCandidateId];
      if (!currentDrafts) {
        return {
          ...prev,
          [selectedCandidateId]: cloneSequenceDraftState(
            nextServerSequenceDrafts
          ),
        };
      }

      const previousServerDrafts =
        lastSyncedSequenceDraftsRef.current[selectedCandidateId] ??
        createEmptySequenceDraftState();

      return {
        ...prev,
        [selectedCandidateId]: mergeSequenceDraftState({
          currentDrafts,
          nextServerDrafts: nextServerSequenceDrafts,
          previousServerDrafts,
        }),
      };
    });

    lastSyncedSequenceDraftsRef.current[selectedCandidateId] =
      cloneSequenceDraftState(nextServerSequenceDrafts);
  }, [nextServerSequenceDrafts, selectedCandidateId]);

  const contactDraft = useMemo(
    () =>
      (selectedCandidateId && contactDraftByCandidateId[selectedCandidateId]) ||
      sharedContactDraft ||
      EMPTY_CONTACT_DRAFT,
    [contactDraftByCandidateId, selectedCandidateId, sharedContactDraft]
  );
  const setContactDraft = (patch: Partial<AtsContactEmailDraft>) => {
    if (!selectedCandidateId) return;
    setContactDraftByCandidateId((prev) => ({
      ...prev,
      [selectedCandidateId]: {
        ...(prev[selectedCandidateId] ?? contactDraft),
        ...patch,
      },
    }));
  };
  const scheduledContactAt =
    (selectedCandidateId &&
      scheduledContactAtByCandidateId[selectedCandidateId]) ||
    getDefaultScheduledContactAtValue();
  const setScheduledContactAt = (value: string) => {
    if (!selectedCandidateId) return;
    setScheduledContactAtByCandidateId((prev) => ({
      ...prev,
      [selectedCandidateId]: value,
    }));
  };
  const savedSequenceDrafts =
    (selectedCandidateId &&
      lastSyncedSequenceDraftsRef.current[selectedCandidateId]) ||
    nextServerSequenceDrafts;
  const sequenceDrafts =
    (selectedCandidateId && sequenceDraftByCandidateId[selectedCandidateId]) ||
    savedSequenceDrafts;
  const expandedSequenceStep = selectedCandidateId
    ? (expandedSequenceStepByCandidateId[selectedCandidateId] ?? null)
    : null;
  const hasUnsavedSequenceDraftChanges = selectedCandidateId
    ? Array.from(
        { length: ATS_SEQUENCE_STEP_COUNT },
        (_, index) => index + 1
      ).some((stepNumber) => {
        const currentDraft = sequenceDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;
        const savedDraft =
          savedSequenceDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;

        return (
          currentDraft.subject !== savedDraft.subject ||
          currentDraft.body !== savedDraft.body
        );
      })
    : false;

  const updateSequenceDraft = (
    stepNumber: number,
    patch: Partial<AtsContactEmailDraft>
  ) => {
    if (!selectedCandidateId) return;

    setSequenceDraftByCandidateId((prev) => {
      const currentDrafts =
        prev[selectedCandidateId] ??
        cloneSequenceDraftState(savedSequenceDrafts);

      return {
        ...prev,
        [selectedCandidateId]: {
          ...currentDrafts,
          [stepNumber]: {
            ...(currentDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT),
            ...patch,
          },
        },
      };
    });
  };

  const resetSequenceDraft = (stepNumber: number) => {
    if (!selectedCandidateId) return;

    setSequenceDraftByCandidateId((prev) => {
      const currentDrafts =
        prev[selectedCandidateId] ??
        cloneSequenceDraftState(savedSequenceDrafts);

      return {
        ...prev,
        [selectedCandidateId]: {
          ...currentDrafts,
          [stepNumber]: {
            ...(savedSequenceDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT),
          },
        },
      };
    });
  };

  const toggleSequenceStepEditor = (stepNumber: number) => {
    if (!selectedCandidateId) return;

    setExpandedSequenceStepByCandidateId((prev) => ({
      ...prev,
      [selectedCandidateId]:
        prev[selectedCandidateId] === stepNumber ? null : stepNumber,
    }));
  };

  const stats = useMemo(() => {
    let emailReadyCount = 0;
    let dueTodayCount = 0;
    let pausedCount = 0;
    let completedCount = 0;

    for (const candidate of candidates) {
      if (resolveTargetEmail(candidate)) {
        emailReadyCount += 1;
      }
      if (
        candidate.outreach?.nextDueAt &&
        isDueToday(candidate.outreach.nextDueAt)
      ) {
        dueTodayCount += 1;
      }
      if (candidate.outreach?.sequenceStatus === "paused") {
        pausedCount += 1;
      }
      if (candidate.outreach?.sequenceStatus === "completed") {
        completedCount += 1;
      }
    }

    return {
      completedCount,
      dueTodayCount,
      emailReadyCount,
      pausedCount,
    };
  }, [candidates]);

  const previewCandidate = useMemo(
    () => getPreviewCandidate(candidates, selectedIds, activeCandidateSummary),
    [activeCandidateSummary, candidates, selectedIds]
  );
  const previewVariables = useMemo(
    () => buildCandidateTemplateVariables(previewCandidate ?? {}),
    [previewCandidate]
  );
  const previewSubject = useMemo(
    () => replaceTemplateVariables(bulkSubject, previewVariables),
    [bulkSubject, previewVariables]
  );
  const previewBody = useMemo(
    () => replaceTemplateVariables(bulkBody, previewVariables),
    [bulkBody, previewVariables]
  );
  const contactPreviewVariables = useMemo(
    () => buildCandidateTemplateVariables(activeCandidate ?? {}),
    [activeCandidate]
  );
  const contactPreviewSubject = useMemo(
    () =>
      replaceTemplateVariables(contactDraft.subject, contactPreviewVariables),
    [contactDraft.subject, contactPreviewVariables]
  );
  const contactPreviewBody = useMemo(
    () => replaceTemplateVariables(contactDraft.body, contactPreviewVariables),
    [contactDraft.body, contactPreviewVariables]
  );
  const allVisibleSelected = useMemo(
    () =>
      filteredCandidates.length > 0 &&
      filteredCandidates.every((candidate) =>
        selectedIdSet.has(candidate.id)
      ),
    [filteredCandidates, selectedIdSet]
  );
  const hasUnsavedWorkspaceChanges = useMemo(() => {
    const savedWorkspace = normalizeWorkspaceRecord(
      workspaceQuery.data?.workspace ?? null
    );
    const draftWorkspace = normalizeWorkspaceRecord(workspaceDraft);

    return (
      savedWorkspace.bookmarkFolderId !== draftWorkspace.bookmarkFolderId ||
      savedWorkspace.companyPitch !== draftWorkspace.companyPitch ||
      savedWorkspace.jobDescription !== draftWorkspace.jobDescription ||
      savedWorkspace.senderEmail !== draftWorkspace.senderEmail ||
      savedWorkspace.signature !== draftWorkspace.signature
    );
  }, [workspaceDraft, workspaceQuery.data?.workspace]);
  const hasUnsavedSequenceScheduleChanges = useMemo(
    () => JSON.stringify(sequenceScheduleDraft) !== savedSequenceScheduleKey,
    [savedSequenceScheduleKey, sequenceScheduleDraft]
  );
  const queuedEmailDiscoveryPositionById = useMemo(
    () =>
      new Map(
        queuedEmailDiscoveryIds.map((candidId, index) => [candidId, index + 1])
      ),
    [queuedEmailDiscoveryIds]
  );
  const queuedEmailDiscoverySet = useMemo(
    () => new Set(queuedEmailDiscoveryIds),
    [queuedEmailDiscoveryIds]
  );
  const cancellingEmailDiscoverySet = useMemo(
    () => new Set(cancellingEmailDiscoveryIds),
    [cancellingEmailDiscoveryIds]
  );
  const { stepDraftMessageByNumber, stepSentMessageByNumber } = useMemo(() => {
    const nextStepSentMessageByNumber = new Map<number, AtsMessageRecord>();
    const nextStepDraftMessageByNumber = new Map<number, AtsMessageRecord>();

    for (const message of detailMessages) {
      if (!message.stepNumber) continue;
      if (
        message.status === "sent" &&
        !nextStepSentMessageByNumber.has(message.stepNumber)
      ) {
        nextStepSentMessageByNumber.set(message.stepNumber, message);
      }
      if (
        message.kind === "sequence" &&
        !nextStepDraftMessageByNumber.has(message.stepNumber)
      ) {
        nextStepDraftMessageByNumber.set(message.stepNumber, message);
      }
    }

    return {
      stepDraftMessageByNumber: nextStepDraftMessageByNumber,
      stepSentMessageByNumber: nextStepSentMessageByNumber,
    };
  }, [detailMessages]);

  useEffect(() => {
    if (activeEmailDiscoveryId || queuedEmailDiscoveryIds.length === 0) return;
    const [nextId, ...rest] = queuedEmailDiscoveryIds;
    setQueuedEmailDiscoveryIds(rest);
    setActiveEmailDiscoveryId(nextId);
  }, [activeEmailDiscoveryId, queuedEmailDiscoveryIds]);

  useEffect(() => {
    if (!activeEmailDiscoveryId) return;

    let cancelled = false;

    void (async () => {
      try {
        await discoverEmail.mutateAsync(activeEmailDiscoveryId);
      } catch (error) {
        if (cancelled) return;
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "이메일 탐색에 실패했습니다.",
          variant: "error",
        });
      } finally {
        if (!cancelled) {
          setActiveEmailDiscoveryId((current) =>
            current === activeEmailDiscoveryId ? null : current
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // mutateAsync reference is stable enough for this queue runner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEmailDiscoveryId]);

  const ensureWorkspaceSaved = async () => {
    if (!hasUnsavedWorkspaceChanges) return;
    await saveWorkspace.mutateAsync(workspaceDraft);
  };

  const ensureSequenceScheduleSaved = async () => {
    if (!selectedCandidateId || !hasUnsavedSequenceScheduleChanges) return;
    await saveSequenceSchedule.mutateAsync({
      candidId: selectedCandidateId,
      sequenceSchedule: sequenceScheduleDraft,
    });
  };

  const applySavedWorkspace = (workspace: AtsWorkspaceRecord) => {
    const normalizedWorkspace = normalizeWorkspaceRecord(workspace);
    setWorkspaceDraft(normalizedWorkspace);
    lastSyncedWorkspaceRef.current = normalizedWorkspace;
  };

  const handleSaveCandidateMemo = async () => {
    if (!selectedCandidateId) return;
    try {
      await saveCandidateMemo.mutateAsync({
        candidId: selectedCandidateId,
        memo: candidateMemoDraft,
      });
      showToast({ message: "메모를 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleSaveSequenceSchedule = async () => {
    if (!selectedCandidateId) return;
    try {
      await saveSequenceSchedule.mutateAsync({
        candidId: selectedCandidateId,
        sequenceSchedule: sequenceScheduleDraft,
      });
      showToast({ message: "시퀀스 타이밍을 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "시퀀스 타이밍 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const updateSequenceScheduleDraft = (
    stepNumber: number,
    patch: Partial<AtsSequenceStepSchedule>
  ) => {
    setSequenceScheduleDraft((prev) =>
      prev.map((item) =>
        item.stepNumber === stepNumber
          ? {
              ...item,
              ...patch,
              timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            }
          : item
      )
    );
  };

  const toggleCandidateSelection = (candidId: string) => {
    setSelectedIds((prev) =>
      prev.includes(candidId)
        ? prev.filter((id) => id !== candidId)
        : [...prev, candidId]
    );
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = filteredCandidates.map((candidate) => candidate.id);
    const visibleIdSet = new Set(visibleIds);

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIdSet.has(id)));
      return;
    }

    setSelectedIds((prev) => {
      const nextSelectedIds = new Set(prev);
      for (const visibleId of visibleIds) {
        nextSelectedIds.add(visibleId);
      }
      return Array.from(nextSelectedIds);
    });
  };

  const queueEmailDiscoveries = (candidIds: string[]) => {
    const pendingIds = new Set(queuedEmailDiscoveryIds);
    if (activeEmailDiscoveryId) {
      pendingIds.add(activeEmailDiscoveryId);
    }

    const nextIds: string[] = [];
    for (const candidId of Array.from(new Set(candidIds))) {
      const normalizedId = String(candidId ?? "").trim();
      if (!normalizedId || pendingIds.has(normalizedId)) continue;

      const candidate = candidateById.get(normalizedId);
      if (!candidate) continue;
      if (candidate.outreach?.emailDiscoveryStatus === "searching") continue;

      pendingIds.add(normalizedId);
      nextIds.push(normalizedId);
    }

    if (nextIds.length === 0) return [];

    setQueuedEmailDiscoveryIds((prev) => {
      const existing = new Set(prev);
      const additions = nextIds.filter((candidId) => !existing.has(candidId));
      return additions.length > 0 ? [...prev, ...additions] : prev;
    });

    return nextIds;
  };

  const handleQueueCandidateEmailDiscovery = (candidId: string) => {
    queueEmailDiscoveries([candidId]);
  };

  const handleQueueSelectedEmailDiscoveries = () => {
    const addedIds = queueEmailDiscoveries(selectedIds);
    if (addedIds.length === 0) {
      showToast({
        message: "추가할 이메일 탐색 대상이 없습니다.",
        variant: "white",
      });
      return;
    }

    showToast({
      message: `${addedIds.length}명 이메일 탐색을 대기열에 추가했습니다.`,
      variant: "white",
    });
  };

  const handleStopCandidateEmailDiscovery = async (candidId: string) => {
    const normalizedId = String(candidId ?? "").trim();
    if (!normalizedId) return;

    const candidate = candidateById.get(normalizedId);
    const isQueued = queuedEmailDiscoverySet.has(normalizedId);
    const isActive = activeEmailDiscoveryId === normalizedId;
    const isSearchingOnServer =
      candidate?.outreach?.emailDiscoveryStatus === "searching";

    if (isQueued) {
      setQueuedEmailDiscoveryIds((prev) =>
        prev.filter((item) => item !== normalizedId)
      );
    }

    if (!isActive && !isSearchingOnServer) {
      if (isQueued) {
        showToast({
          message: "이메일 탐색 대기열에서 제거했습니다.",
          variant: "white",
        });
      } else {
        showToast({
          message: "중단할 이메일 탐색 작업이 없습니다.",
          variant: "white",
        });
      }
      return;
    }

    setCancellingEmailDiscoveryIds((prev) =>
      prev.includes(normalizedId) ? prev : [...prev, normalizedId]
    );

    try {
      await cancelEmailDiscovery.mutateAsync(normalizedId);
      showToast({
        message: "이메일 탐색 중단을 요청했습니다.",
        variant: "white",
      });
    } catch (error) {
      if (isQueued) {
        setQueuedEmailDiscoveryIds((prev) =>
          prev.includes(normalizedId) ? prev : [...prev, normalizedId]
        );
      }
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "이메일 탐색 중단 요청에 실패했습니다.",
        variant: "error",
      });
    } finally {
      setCancellingEmailDiscoveryIds((prev) =>
        prev.filter((item) => item !== normalizedId)
      );
    }
  };

  const handleSaveWorkspace = async () => {
    try {
      const response = await saveWorkspace.mutateAsync(workspaceDraft);
      applySavedWorkspace(response.workspace);
      showToast({ message: "ATS workspace를 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "ATS workspace 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleChangeWorkspaceFolder = async (nextFolderId: number | null) => {
    const previousWorkspaceDraft = normalizeWorkspaceRecord(workspaceDraft);
    if (previousWorkspaceDraft.bookmarkFolderId === nextFolderId) return;

    const nextWorkspaceDraft = {
      ...previousWorkspaceDraft,
      bookmarkFolderId: nextFolderId,
    };

    setWorkspaceDraft(nextWorkspaceDraft);

    try {
      const response = await saveWorkspace.mutateAsync(nextWorkspaceDraft);
      applySavedWorkspace(response.workspace);
      showToast({ message: "ATS 대상 폴더를 변경했습니다.", variant: "white" });
    } catch (error) {
      setWorkspaceDraft(previousWorkspaceDraft);
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "ATS 폴더 변경에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleDiscoverEmail = () => {
    if (!selectedCandidateId) return;

    const addedIds = queueEmailDiscoveries([selectedCandidateId]);
    if (addedIds.length === 0) {
      showToast({
        message: "이미 탐색 중이거나 대기열에 있는 후보입니다.",
        variant: "white",
      });
    }
  };

  const handleStopSelectedEmailDiscovery = async () => {
    if (!selectedCandidateId) return;
    await handleStopCandidateEmailDiscovery(selectedCandidateId);
  };

  const handleClearEmailTrace = async () => {
    if (!selectedCandidateId) return;
    await handleClearCandidateEmailTrace(selectedCandidateId);
  };

  const handleClearCandidateEmailTrace = async (candidId: string) => {
    if (!candidId) return;
    try {
      await clearEmailTrace.mutateAsync(candidId);
      showToast({
        message: "이메일 탐색 로그를 비웠습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "이메일 탐색 로그 삭제에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleResetCandidateOutreach = async () => {
    if (!selectedCandidateId) return;
    if (
      !window.confirm(
        "이 후보자의 candidate_outreach 상태를 초기화할까요? 이메일 탐색 상태, 메모, 히스토리, 시퀀스 상태가 기본값으로 돌아갑니다."
      )
    ) {
      return;
    }

    try {
      await resetCandidateOutreach.mutateAsync(selectedCandidateId);
      showToast({
        message: "candidate_outreach를 초기화했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "candidate_outreach 초기화에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleSaveManualEmail = async () => {
    if (!selectedCandidateId) return;
    try {
      await saveManualEmail.mutateAsync({
        candidId: selectedCandidateId,
        email: manualEmail,
      });
      showToast({ message: "이메일을 저장했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "이메일 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleGenerateContactEmail = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      const result =
        await generateContactEmail.mutateAsync(selectedCandidateId);
      setContactDraftByCandidateId((prev) => ({
        ...prev,
        [selectedCandidateId]: result.draft,
      }));
      setMainPanelTab("contact");
      showToast({
        message: "초기 연락 메일 초안을 작성했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "메일 초안 작성에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleSendContactEmail = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      await sendContactEmail.mutateAsync({
        body: contactDraft.body,
        candidId: selectedCandidateId,
        subject: contactDraft.subject,
        targetEmail: manualEmail,
      });
      setSharedContactDraft({
        body: contactDraft.body,
        subject: contactDraft.subject,
      });
      setMainPanelTab("contact");
      showToast({
        message: "메일을 발송했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메일 발송에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleScheduleContactEmail = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      await scheduleContactEmail.mutateAsync({
        body: contactDraft.body,
        candidId: selectedCandidateId,
        scheduledAt: new Date(scheduledContactAt).toISOString(),
        subject: contactDraft.subject,
        targetEmail: manualEmail,
      });
      setSharedContactDraft({
        body: contactDraft.body,
        subject: contactDraft.subject,
      });
      setMainPanelTab("contact");
      showToast({
        message: "메일 발송 예약을 저장했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메일 예약에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleCancelScheduledContactEmail = async (messageId: number) => {
    if (!selectedCandidateId) return;
    try {
      await cancelScheduledContactEmail.mutateAsync({
        candidId: selectedCandidateId,
        messageId,
      });
      showToast({
        message: "예약된 메일을 취소했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "예약 메일 취소에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const persistSequenceDraft = async (
    stepNumber: number,
    options?: { silent?: boolean }
  ) => {
    if (!selectedCandidateId) return;

    const currentDraft = sequenceDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;
    const savedDraft = savedSequenceDrafts[stepNumber] ?? EMPTY_CONTACT_DRAFT;
    const isDirty =
      currentDraft.subject !== savedDraft.subject ||
      currentDraft.body !== savedDraft.body;

    if (!currentDraft.subject.trim() || !currentDraft.body.trim()) {
      throw new Error("제목과 본문을 입력해 주세요.");
    }

    if (!isDirty) return;

    const result = await saveSequenceDraft.mutateAsync({
      body: currentDraft.body,
      candidId: selectedCandidateId,
      stepNumber,
      subject: currentDraft.subject,
    });

    const nextServerDrafts = buildSequenceDraftState(result.data.messages);
    setSequenceDraftByCandidateId((prev) => ({
      ...prev,
      [selectedCandidateId]: cloneSequenceDraftState(nextServerDrafts),
    }));
    lastSyncedSequenceDraftsRef.current[selectedCandidateId] =
      cloneSequenceDraftState(nextServerDrafts);

    if (!options?.silent) {
      showToast({
        message: `Step ${stepNumber} 초안을 저장했습니다.`,
        variant: "white",
      });
    }
  };

  const handleSaveSequenceDraft = async (stepNumber: number) => {
    try {
      await persistSequenceDraft(stepNumber);
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "시퀀스 초안 저장에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleGenerateSequence = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      await ensureSequenceScheduleSaved();
      const result = await generateSequence.mutateAsync(selectedCandidateId);
      const nextServerDrafts = buildSequenceDraftState(result.data.messages);
      setSequenceDraftByCandidateId((prev) => ({
        ...prev,
        [selectedCandidateId]: cloneSequenceDraftState(nextServerDrafts),
      }));
      lastSyncedSequenceDraftsRef.current[selectedCandidateId] =
        cloneSequenceDraftState(nextServerDrafts);
      setExpandedSequenceStepByCandidateId((prev) => ({
        ...prev,
        [selectedCandidateId]: 1,
      }));
      setMainPanelTab("sequence");
      showToast({
        message: "4-step sequence를 생성했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "시퀀스 생성에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleToggleSequencePause = async () => {
    if (!selectedCandidateId || !detailCandidate?.outreach) return;
    const action =
      detailCandidate.outreach.sequenceStatus === "paused" ? "resume" : "pause";

    try {
      await updateSequenceStatus.mutateAsync({
        action,
        candidId: selectedCandidateId,
      });
      setMainPanelTab("sequence");
      showToast({
        message:
          action === "pause"
            ? "아웃리치를 중단했습니다."
            : "아웃리치를 재개했습니다.",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "시퀀스 상태 변경에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleSendSequenceStep = async (stepNumber: number) => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      await ensureSequenceScheduleSaved();
      await persistSequenceDraft(stepNumber, { silent: true });
      await sendSequenceStep.mutateAsync({
        candidId: selectedCandidateId,
        stepNumber,
      });
      setMainPanelTab("sequence");
      showToast({
        message: `Step ${stepNumber} 메일을 발송했습니다.`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메일 발송에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleSendBulkMail = async () => {
    if (selectedIds.length === 0) return;
    try {
      const result = await sendBulkMail.mutateAsync({
        body: bulkBody,
        candidIds: selectedIds,
        senderEmail: workspaceDraft.senderEmail ?? undefined,
        subject: bulkSubject,
      });
      const skippedMessage =
        result.skipped.length > 0 ? `, ${result.skipped.length}명 skip` : "";
      showToast({
        message: `${result.sent.length}명에게 발송했습니다${skippedMessage}.`,
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "bulk mail 발송에 실패했습니다.",
        variant: "error",
      });
    }
  };

  const handleRunScrapeTest = async () => {
    const url = scrapeTestUrl.trim();
    if (!url) {
      showToast({
        message: "테스트할 URL을 입력해 주세요.",
        variant: "error",
      });
      return;
    }

    setScrapeTestPending(true);
    try {
      const response = await fetch("/api/tool/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        excerpt?: string | null;
        markdown?: string | null;
        source?: string | null;
        title?: string | null;
        url?: string | null;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || `scrape failed with status ${response.status}`
        );
      }

      setScrapeTestResult({
        excerpt: payload.excerpt ?? null,
        markdown: payload.markdown ?? null,
        source: payload.source ?? null,
        status: response.status,
        title: payload.title ?? null,
        url: String(payload.url ?? url),
      });
      showToast({
        message: "scrape 테스트가 완료되었습니다.",
        variant: "white",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "scrape 테스트에 실패했습니다.";
      setScrapeTestResult({
        error: message,
        status: 0,
        url,
      });
      showToast({
        message,
        variant: "error",
      });
    } finally {
      setScrapeTestPending(false);
    }
  };

  if (authLoading) {
    return (
      <AppLayout initialCollapse={false}>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </div>
      </AppLayout>
    );
  }

  if (!isInternal) {
    return (
      <AppLayout initialCollapse={false}>
        <div className="mx-auto flex min-h-screen max-w-3xl items-center px-6">
          <div className={`${PANEL_CLASS} w-full p-6`}>
            <div className="flex items-center gap-3 text-white">
              <AlertCircle className="h-5 w-5" />
              <div className="text-lg font-medium">Internal only</div>
            </div>
            <div className="mt-3 text-sm leading-6 text-white/65">
              ATS 화면은 `matchharper.com` 계정 또는 허용된 ATS 계정으로
              로그인했을 때만 접근할 수 있습니다.
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  const nextSequenceStep =
    Array.from(
      { length: ATS_SEQUENCE_STEP_COUNT },
      (_, index) => index + 1
    ).find((stepNumber) => !stepSentMessageByNumber.has(stepNumber)) ?? null;
  const hasSequenceDrafts = stepDraftMessageByNumber.size > 0;
  const isSequenceCompleted =
    detailCandidate?.outreach?.sequenceStatus === "completed" ||
    nextSequenceStep == null;
  const canToggleSequencePause =
    Boolean(detailCandidate?.outreach) &&
    hasSequenceDrafts &&
    !isSequenceCompleted;

  const resolvedEmail =
    detailCandidate?.outreach?.targetEmail ??
    detailCandidate?.existingEmailSources?.[0]?.email ??
    null;
  const emailDiscoveryOutreach =
    detailCandidate?.outreach ?? activeCandidateSummary?.outreach ?? null;
  const isEmailDiscoverySearching =
    emailDiscoveryOutreach?.emailDiscoveryStatus === "searching";
  const selectedEmailDiscoveryQueuePosition = selectedCandidateId
    ? (queuedEmailDiscoveryPositionById.get(selectedCandidateId) ?? null)
    : null;
  const isSelectedEmailDiscoveryQueued =
    selectedEmailDiscoveryQueuePosition != null;
  const isSelectedEmailDiscoveryActive =
    Boolean(selectedCandidateId) &&
    activeEmailDiscoveryId === selectedCandidateId;
  const isSelectedEmailDiscoveryStopping =
    Boolean(selectedCandidateId) &&
    cancellingEmailDiscoverySet.has(selectedCandidateId ?? "");
  const emailDiscoveryQueueCount = queuedEmailDiscoveryIds.length;
  const profileContent = (
    <>
      {profileDetailQuery.isLoading && (
        <div className="flex min-h-[720px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-white" />
        </div>
      )}
      {!profileDetailQuery.isLoading && profileDetailQuery.error && (
        <div className="flex min-h-[720px] items-center justify-center text-sm text-white/50">
          프로필을 불러오지 못했습니다.
        </div>
      )}
      {!profileDetailQuery.isLoading &&
        !profileDetailQuery.error &&
        profileDetailQuery.data &&
        selectedCandidateId && (
          <CandidateProfileDetailPage
            candidId={selectedCandidateId}
            data={profileDetailQuery.data}
            isLoading={profileDetailQuery.isLoading}
            error={null}
            embedded
          />
        )}
    </>
  );

  const PanelCard = ({ children }: { children: React.ReactNode }) => {
    return (
      <div className="flex flex-row items-center justify-between rounded-md bg-white/5 text-white p-3">
        {children}
      </div>
    );
  };

  return (
    <AppLayout initialCollapse={false}>
      <Head>
        <title>ATS | Harper</title>
      </Head>

      <div className="min-h-screen w-full px-4 pb-8 pt-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
          <AtsWorkspacePanel
            atsFolders={atsFolders}
            buttonPrimaryClassName={BUTTON_PRIMARY}
            currentAtsFolder={currentAtsFolder}
            inputClassName={INPUT_CLASS}
            onChangeWorkspaceFolder={handleChangeWorkspaceFolder}
            onSaveWorkspace={handleSaveWorkspace}
            onToggleOpen={() => setWorkspaceOpen((prev) => !prev)}
            panelClassName={PANEL_CLASS}
            saveWorkspacePending={saveWorkspace.isPending}
            setWorkspaceDraft={setWorkspaceDraft}
            textareaClassName={TEXTAREA_CLASS}
            workspaceDraft={workspaceDraft}
            workspaceOpen={workspaceOpen}
          />

          <div className="grid gap-4 md:grid-cols-4">
            <PanelCard>
              <div className="text-sm">Email Ready</div>
              <div className="text-lg font-medium">{stats.emailReadyCount}</div>
            </PanelCard>
            <PanelCard>
              <div className="text-sm">Due Today</div>
              <div className="text-lg font-medium">{stats.dueTodayCount}</div>
            </PanelCard>
            <PanelCard>
              <div className="text-sm">Paused</div>
              <div className="text-lg font-medium">{stats.pausedCount}</div>
            </PanelCard>
            <PanelCard>
              <div className="text-sm">Completed</div>
              <div className="text-lg font-medium">{stats.completedCount}</div>
            </PanelCard>
          </div>

          <div className="flex flex-col gap-4">
            <div className={`${PANEL_CLASS} overflow-hidden`}>
              <div className="border-b border-white/10 px-4 py-4">
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="이름, 회사, headline 검색"
                      className={`${INPUT_CLASS} pl-9 w-[320px]`}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["all", "All"],
                        ["needs_email", "Needs email"],
                        ["ready", "Ready"],
                        ["active", "Active"],
                        ["paused", "Paused"],
                        ["completed", "Completed"],
                      ] as Array<[FilterKey, string]>
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFilter(value)}
                        className={`rounded-md border min-w-[60px] px-3 py-1.5 text-xs transition ${
                          filter === value
                            ? "border-white/0 bg-accenta1 text-black"
                            : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    {(activeEmailDiscoveryId ||
                      emailDiscoveryQueueCount > 0) && (
                      <div className="inline-flex items-center gap-2 rounded-md border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-xs text-sky-100">
                        {activeEmailDiscoveryId ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Clock3 className="h-3.5 w-3.5" />
                        )}
                        {activeEmailDiscoveryId
                          ? "이메일 탐색 실행 중"
                          : "이메일 탐색 대기 중"}
                        <span className="text-sky-100/70">
                          대기 {emailDiscoveryQueueCount}건
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleQueueSelectedEmailDiscoveries}
                      disabled={selectedIds.length === 0}
                      className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      선택 후보 이메일 찾기
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                {workspaceQuery.isLoading ? (
                  <div className="flex min-h-[640px] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <div className="flex min-h-[640px] items-center justify-center text-sm text-white/50">
                    후보자가 없습니다.
                  </div>
                ) : (
                  <table className={ATS_TABLE_LAYOUT.table}>
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs text-white/45">
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.select} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Sel
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.candidate} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Candidate
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.sequenceMark} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          태그
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.email} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Email
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.progress} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Progress
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.history} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Contact Log
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.memo} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Memo
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((candidate) => {
                        const emailBadge = getEmailBadge(candidate);
                        const stageBadge = getStageBadge(candidate.outreach);
                        const isRowEmailDiscoverySearching =
                          candidate.outreach?.emailDiscoveryStatus ===
                            "searching" ||
                          activeEmailDiscoveryId === candidate.id;
                        const rowEmailDiscoveryQueuePosition =
                          queuedEmailDiscoveryPositionById.get(candidate.id) ??
                          null;
                        const isRowEmailDiscoveryQueued =
                          queuedEmailDiscoverySet.has(candidate.id);
                        const isRowEmailDiscoveryStopping =
                          cancellingEmailDiscoverySet.has(candidate.id);
                        const hasRowEmailDiscoveryTrace =
                          (candidate.outreach?.emailDiscoveryTrace?.length ??
                            0) > 0;
                        const rowEmailActionLabel = isRowEmailDiscoverySearching
                          ? "탐색 중"
                          : rowEmailDiscoveryQueuePosition
                            ? `대기 ${rowEmailDiscoveryQueuePosition}`
                            : resolveTargetEmail(candidate)
                              ? "재탐색"
                              : "이메일 찾기";

                        return (
                          <tr
                            key={candidate.id}
                            onClick={() => {
                              setSelectedCandidateId(candidate.id);
                              setIsCandidateDrawerOpen(true);
                            }}
                            className={`cursor-pointer border-b border-white/5 transition ${
                              selectedCandidateId === candidate.id
                                ? "bg-white/10"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <input
                                type="checkbox"
                                checked={selectedIdSet.has(candidate.id)}
                                onChange={() =>
                                  toggleCandidateSelection(candidate.id)
                                }
                                onClick={(event) => event.stopPropagation()}
                                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent"
                              />
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <div className="flex min-w-0 items-start gap-3">
                                {candidate.profilePicture ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={candidate.profilePicture}
                                    alt={candidate.name ?? "candidate"}
                                    className={`${ATS_TABLE_LAYOUT.profileImage} rounded-md object-cover`}
                                  />
                                ) : (
                                  <div
                                    className={`flex ${ATS_TABLE_LAYOUT.profileImage} items-center justify-center rounded-md bg-white/10 text-white/70`}
                                  >
                                    <UserSquare2 className="h-4 w-4" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-white">
                                    {candidate.name ?? "Unknown"}
                                  </div>
                                  <div className="flex items-start gap-2 mt-2">
                                    {candidate.currentCompanyLogo ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={candidate.currentCompanyLogo}
                                        alt={
                                          candidate.currentCompany ?? "company"
                                        }
                                        className={`${ATS_TABLE_LAYOUT.companyLogo} rounded-md border border-white/10 bg-white object-contain p-1`}
                                      />
                                    ) : (
                                      <div
                                        className={`flex ${ATS_TABLE_LAYOUT.companyLogo} items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/45`}
                                      >
                                        <Building2 className="h-4 w-4" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="text-sm text-white/90">
                                        {candidate.currentCompany ?? "-"}
                                      </div>
                                      <div className="mt-0 text-sm text-accenta1">
                                        {candidate.currentRole ?? "-"}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center gap-1.5">
                                    {candidate.linkedinUrl && (
                                      <IconLinkButton
                                        href={candidate.linkedinUrl}
                                        icon={
                                          <Linkedin className="h-3.5 w-3.5" />
                                        }
                                        label="LinkedIn 연락"
                                      />
                                    )}
                                    {candidate.githubUrl && (
                                      <IconLinkButton
                                        href={candidate.githubUrl}
                                        icon={
                                          <Github className="h-3.5 w-3.5" />
                                        }
                                        label="GitHub"
                                      />
                                    )}
                                    {candidate.scholarUrl && (
                                      <IconLinkButton
                                        href={candidate.scholarUrl}
                                        icon={
                                          <GraduationCap className="h-3.5 w-3.5" />
                                        }
                                        label="Scholar"
                                      />
                                    )}
                                  </div>
                                  <AtsEmailRecipientNameField
                                    candidId={candidate.id}
                                    defaultName={candidate.name}
                                    savedName={
                                      candidate.outreach?.emailRecipientName
                                    }
                                  />
                                </div>
                              </div>
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <AtsSequenceMarkButton
                                candidId={candidate.id}
                                initialStatus={
                                  candidate.outreach?.sequenceMark ?? null
                                }
                                compact
                                align="start"
                              />
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <div
                                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${emailBadge.className}`}
                              >
                                {emailBadge.label}
                              </div>
                              <div className="mt-2 text-xs text-white/55">
                                {resolveTargetEmail(candidate) ?? "-"}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {isRowEmailDiscoverySearching ||
                                isRowEmailDiscoveryQueued ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleStopCandidateEmailDiscovery(
                                        candidate.id
                                      );
                                    }}
                                    disabled={isRowEmailDiscoveryStopping}
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-[11px] text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {isRowEmailDiscoveryStopping ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    {isRowEmailDiscoverySearching
                                      ? "탐색 중지"
                                      : "대기 취소"}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleQueueCandidateEmailDiscovery(
                                        candidate.id
                                      );
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/10"
                                  >
                                    <Sparkles className="h-3 w-3" />
                                    {rowEmailActionLabel}
                                  </button>
                                )}
                                {hasRowEmailDiscoveryTrace && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleClearCandidateEmailTrace(
                                        candidate.id
                                      );
                                    }}
                                    disabled={
                                      clearEmailTrace.isPending ||
                                      isRowEmailDiscoverySearching ||
                                      isRowEmailDiscoveryStopping
                                    }
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {clearEmailTrace.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                    로그 삭제
                                  </button>
                                )}
                              </div>
                              {isRowEmailDiscoverySearching && (
                                <div className="mt-2 text-[11px] leading-5 text-sky-200/80">
                                  {(candidate.outreach?.emailDiscoveryTrace
                                    ?.length ?? 0) > 0
                                    ? `로그 ${candidate.outreach?.emailDiscoveryTrace.length ?? 0}개 수집됨`
                                    : (candidate.outreach
                                        ?.emailDiscoverySummary ??
                                      "탐색 요청을 전송했습니다.")}
                                </div>
                              )}
                              {!isRowEmailDiscoverySearching &&
                                rowEmailDiscoveryQueuePosition && (
                                  <div className="mt-2 text-[11px] leading-5 text-sky-200/80">
                                    대기열 {rowEmailDiscoveryQueuePosition}번째
                                  </div>
                                )}
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <div
                                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${stageBadge.className}`}
                              >
                                {stageBadge.label}
                              </div>
                              <div className="mt-2">
                                <AtsSequenceStageMarks
                                  outreach={candidate.outreach}
                                />
                              </div>
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <ContactHistoryCell
                                candidId={candidate.id}
                                history={candidate.outreach?.history ?? []}
                              />
                            </td>
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <AtsMemoCell
                                candidId={candidate.id}
                                memo={candidate.outreach?.memo ?? null}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <AtsCandidateDrawer
              activeCandidate={activeCandidate}
              buttonPrimaryClassName={BUTTON_PRIMARY}
              buttonSecondaryClassName={BUTTON_SECONDARY}
              candidateMemo={{
                onChange: setCandidateMemoDraft,
                onSave: handleSaveCandidateMemo,
                savePending: saveCandidateMemo.isPending,
                value: candidateMemoDraft,
              }}
              canToggleSequencePause={canToggleSequencePause}
              contact={{
                cancelScheduledPendingMessageId:
                  cancelScheduledContactEmail.isPending
                    ? (cancelScheduledContactEmail.variables?.messageId ?? null)
                    : null,
                draft: contactDraft,
                emailHistory,
                generatePending: generateContactEmail.isPending,
                manualEmail,
                onCancelScheduled: handleCancelScheduledContactEmail,
                onDraftChange: setContactDraft,
                onGenerate: handleGenerateContactEmail,
                onManualEmailChange: setManualEmail,
                onSaveManualEmail: handleSaveManualEmail,
                onSchedule: handleScheduleContactEmail,
                onScheduledAtChange: setScheduledContactAt,
                onSend: handleSendContactEmail,
                previewBody: contactPreviewBody,
                previewSubject: contactPreviewSubject,
                saveManualEmailPending: saveManualEmail.isPending,
                scheduledAt: scheduledContactAt,
                scheduledMessages: scheduledContactMessages,
                schedulePending: scheduleContactEmail.isPending,
                sendPending: sendContactEmail.isPending,
                senderEmail: workspaceDraft.senderEmail,
                userEmail: user?.email,
              }}
              detailCandidate={detailCandidate}
              detailLoading={detailQuery.isLoading}
              emailDiscovery={{
                clearPending: clearEmailTrace.isPending,
                isActive: isSelectedEmailDiscoveryActive,
                isQueued: isSelectedEmailDiscoveryQueued,
                isSearching: isEmailDiscoverySearching,
                isStopping: isSelectedEmailDiscoveryStopping,
                onClearTrace: handleClearEmailTrace,
                onDiscover: handleDiscoverEmail,
                onStop: handleStopSelectedEmailDiscovery,
                outreach: emailDiscoveryOutreach,
                queuePosition: selectedEmailDiscoveryQueuePosition,
                resolvedEmail,
              }}
              generateSequencePending={generateSequence.isPending}
              inputClassName={INPUT_CLASS}
              isOpen={isCandidateDrawerOpen}
              mainPanelTab={mainPanelTab}
              onClose={() => setIsCandidateDrawerOpen(false)}
              onGenerateSequence={handleGenerateSequence}
              onMainPanelTabChange={setMainPanelTab}
              onResetCandidateOutreach={handleResetCandidateOutreach}
              onToggleSequencePause={handleToggleSequencePause}
              profileContent={profileContent}
              resetCandidateOutreachPending={resetCandidateOutreach.isPending}
              saveWorkspacePending={saveWorkspace.isPending}
              sequence={{
                draftMessageByNumber: stepDraftMessageByNumber,
                drafts: sequenceDrafts,
                expandedStep: expandedSequenceStep,
                hasUnsavedDraftChanges: hasUnsavedSequenceDraftChanges,
                hasUnsavedScheduleChanges: hasUnsavedSequenceScheduleChanges,
                isCompleted: isSequenceCompleted,
                messages: detailMessages,
                nextStep: nextSequenceStep,
                onResetDraft: resetSequenceDraft,
                onSaveDraft: handleSaveSequenceDraft,
                onSaveSchedule: handleSaveSequenceSchedule,
                onScheduleChange: updateSequenceScheduleDraft,
                onSendStep: handleSendSequenceStep,
                onToggleEdit: toggleSequenceStepEditor,
                onUpdateDraft: updateSequenceDraft,
                outreach: detailCandidate?.outreach ?? null,
                resolvedEmail,
                savedDrafts: savedSequenceDrafts,
                saveDraftPendingStep:
                  saveSequenceDraft.isPending
                    ? (saveSequenceDraft.variables?.stepNumber ?? null)
                    : null,
                saveSchedulePending: saveSequenceSchedule.isPending,
                scheduleDraft: sequenceScheduleDraft,
                sendPendingStep:
                  sendSequenceStep.isPending
                    ? (sendSequenceStep.variables?.stepNumber ?? null)
                    : null,
                sentMessageByNumber: stepSentMessageByNumber,
              }}
              textareaClassName={TEXTAREA_CLASS}
              updateSequenceStatusPending={updateSequenceStatus.isPending}
            />

            <AtsBulkMailPanel
              body={bulkBody}
              buttonPrimaryClassName={BUTTON_PRIMARY}
              canSend={
                selectedIds.length > 0 &&
                Boolean(bulkSubject.trim()) &&
                Boolean(bulkBody.trim())
              }
              inputClassName={INPUT_CLASS}
              onBodyChange={setBulkBody}
              onCopyVariable={async (label) => {
                try {
                  await navigator.clipboard.writeText(label);
                  showToast({
                    message: `${label} 복사됨`,
                    variant: "white",
                  });
                } catch {
                  showToast({
                    message: "변수 복사에 실패했습니다.",
                    variant: "error",
                  });
                }
              }}
              onSend={handleSendBulkMail}
              onSubjectChange={setBulkSubject}
              panelClassName={PANEL_CLASS}
              previewBody={previewBody}
              previewCandidateName={previewCandidate?.name ?? "후보자 없음"}
              previewHasCandidate={Boolean(previewCandidate)}
              previewSubject={previewSubject}
              previewVariables={previewVariables}
              sendPending={sendBulkMail.isPending}
              selectedCount={selectedIds.length}
              subject={bulkSubject}
              textareaClassName={TEXTAREA_CLASS}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
