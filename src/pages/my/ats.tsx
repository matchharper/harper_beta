import React, { useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  Github,
  GraduationCap,
  Linkedin,
  Loader2,
  Mail,
  Minus,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
  UserSquare2,
  X,
} from "lucide-react";
import AppLayout from "@/components/layout/app";
import AtsEmailBodyContent from "@/components/ats/AtsEmailBodyContent";
import AtsEmailBodyEditor from "@/components/ats/AtsEmailBodyEditor";
import AtsEmailDiscoveryActivity from "@/components/ats/AtsEmailDiscoveryActivity";
import AtsSequenceMarkButton from "@/components/ui/AtsSequenceMarkButton";
import { showToast } from "@/components/toast/toast";
import {
  useAddAtsContactHistory,
  useAtsCandidateDetail,
  useAtsWorkspace,
  useClearAtsEmailDiscoveryTrace,
  useDeleteAtsContactHistory,
  useDiscoverAtsEmail,
  useGenerateAtsContactEmail,
  useGenerateAtsSequence,
  useResetAtsCandidateOutreach,
  useSaveAtsWorkspace,
  useSaveAtsCandidateMemo,
  useSaveAtsSequenceSchedule,
  useSendAtsContactEmail,
  useSendAtsBulkMail,
  useSendAtsSequenceStep,
  useSetManualAtsEmail,
  useUpdateAtsSequenceStatus,
} from "@/hooks/useAtsWorkspace";
import CandidateProfileDetailPage from "@/pages/my/p/CandidateProfile";
import {
  ATS_SEQUENCE_STEP_COUNT,
  ATS_TEMPLATE_VARIABLES,
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
  formatDateInputValue,
  formatDateTimeInputValue,
  describeSchedule,
  resolveTargetEmail,
  isDueToday,
  matchesFilter,
  getPreviewCandidate,
  copyVariableToClipboard,
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
  table: "min-w-[1760px] w-full table-fixed border-collapse",
  widths: {
    select: "w-[36px]",
    candidate: "w-[320px]",
    sequenceMark: "w-[110px]",
    email: "w-[210px]",
    progress: "w-[180px]",
    schedule: "w-[180px]",
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

type MainPanelTab = "candidate" | "sequence" | "profile" | "contact";

const EMPTY_CONTACT_DRAFT: AtsContactEmailDraft = {
  body: "",
  subject: "",
};

const EMPTY_ATS_FOLDERS: AtsBookmarkFolderOption[] = [];
const EMPTY_CANDIDATES: AtsCandidateSummary[] = [];

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

function SequenceStageMarks({
  outreach,
}: {
  outreach: AtsOutreachRecord | null;
}) {
  const completedSteps = Math.min(
    outreach?.activeStep ?? 0,
    ATS_SEQUENCE_STEP_COUNT
  );
  const nextStep =
    outreach &&
    outreach.sequenceStatus !== "completed" &&
    completedSteps < ATS_SEQUENCE_STEP_COUNT
      ? completedSteps + 1
      : null;
  const isPaused = outreach?.sequenceStatus === "paused";
  const isDue = Boolean(outreach?.nextDueAt && isDueToday(outreach.nextDueAt));

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: ATS_SEQUENCE_STEP_COUNT }, (_, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber <= completedSteps;
        const isNext = nextStep === stepNumber;
        const tone = isCompleted
          ? "border-emerald-400/20 bg-emerald-400/15 text-emerald-100"
          : isNext && isPaused
            ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
            : isNext && isDue
              ? "border-sky-400/20 bg-sky-400/10 text-sky-100"
              : isNext
                ? "border-white/15 bg-white/5 text-white/65"
                : "border-white/10 bg-transparent text-white/25";

        return (
          <React.Fragment key={stepNumber}>
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs font-medium ${tone}`}
            >
              {stepNumber}
            </div>
            {stepNumber < ATS_SEQUENCE_STEP_COUNT && (
              <div className="h-px w-3 bg-white/10" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
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

function SequenceStepCard({
  canSend,
  label,
  message,
  onSaveSchedule,
  onScheduleChange,
  onSend,
  saveSchedulePending,
  schedule,
  sendPending,
  stepNumber,
}: {
  canSend: boolean;
  label: { className: string; text: string };
  message: AtsMessageRecord | null;
  onSaveSchedule: () => void;
  onScheduleChange: (patch: Partial<AtsSequenceStepSchedule>) => void;
  onSend: () => void;
  saveSchedulePending: boolean;
  schedule: AtsSequenceStepSchedule;
  sendPending: boolean;
  stepNumber: number;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-4 text-white">
      <div className="mb-4 rounded-md bg-black/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-white/75">예약 발송</div>
          <button
            type="button"
            onClick={onSaveSchedule}
            disabled={saveSchedulePending}
            className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {saveSchedulePending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            예약 변경 저장
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() =>
              onScheduleChange({
                date: schedule.date ?? formatDateInputValue(new Date()),
                mode: "date",
              })
            }
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              schedule.mode === "date"
                ? "border-white/0 bg-accenta1 text-black"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            날짜 지정
          </button>
          <button
            type="button"
            onClick={() => onScheduleChange({ mode: "relative" })}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              schedule.mode === "relative"
                ? "border-white/0 bg-accenta1 text-black"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            며칠 뒤
          </button>
        </div>

        {schedule.mode === "relative" && (
          <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr]">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/35">
                Days
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onScheduleChange({
                      delayDays: Math.max(0, schedule.delayDays - 1),
                    })
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/65 transition hover:bg-white/10"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-[48px] text-center text-sm text-white">
                  {schedule.delayDays}d
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onScheduleChange({ delayDays: schedule.delayDays + 1 })
                  }
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/65 transition hover:bg-white/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/35">
                Time
              </div>
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                <input
                  type="time"
                  value={schedule.sendTime}
                  onChange={(event) =>
                    onScheduleChange({ sendTime: event.target.value })
                  }
                  className={`${INPUT_CLASS} pl-9`}
                />
              </div>
            </div>
          </div>
        )}

        {schedule.mode === "date" && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/35">
                Date
              </div>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                <input
                  type="date"
                  value={schedule.date ?? ""}
                  onChange={(event) =>
                    onScheduleChange({ date: event.target.value })
                  }
                  className={`${INPUT_CLASS} pl-9`}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-white/35">
                Time
              </div>
              <div className="relative">
                <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35" />
                <input
                  type="time"
                  value={schedule.sendTime}
                  onChange={(event) =>
                    onScheduleChange({ sendTime: event.target.value })
                  }
                  className={`${INPUT_CLASS} pl-9`}
                />
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Step {stepNumber}</div>
          <div className="mt-1 text-xs text-white/45">
            {describeSchedule(schedule, stepNumber)}
          </div>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-xs ${label.className}`}
        >
          {label.text}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs text-white/45">Subject</div>
          <div className="mt-1 text-sm text-white">
            {message?.renderedSubject ?? message?.subject ?? "Draft pending"}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/45">Body</div>
          <div className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-white/65">
            {message?.renderedBody ??
              message?.body ??
              "아직 생성되지 않았습니다."}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-white/45">
            {message?.sentAt
              ? `Sent ${formatDateTime(message.sentAt)}`
              : "아직 발송되지 않음"}
          </div>
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || sendPending}
            className={BUTTON_SECONDARY}
          >
            {sendPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </button>
        </div>
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
  const clearEmailTrace = useClearAtsEmailDiscoveryTrace();
  const resetCandidateOutreach = useResetAtsCandidateOutreach();
  const generateContactEmail = useGenerateAtsContactEmail();
  const saveManualEmail = useSetManualAtsEmail();
  const saveCandidateMemo = useSaveAtsCandidateMemo();
  const saveSequenceSchedule = useSaveAtsSequenceSchedule();
  const generateSequence = useGenerateAtsSequence();
  const sendContactEmail = useSendAtsContactEmail();
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [mainPanelTab, setMainPanelTab] = useState<MainPanelTab>("candidate");
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
  const [manualEmail, setManualEmail] = useState("");
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
  const lastSyncedWorkspaceRef = useRef<NormalizedWorkspaceRecord>(
    normalizeWorkspaceRecord(null)
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

  const filteredCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates.filter((candidate) => {
      if (!matchesFilter(candidate, filter)) return false;
      if (!needle) return true;
      const haystack = [
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
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [candidates, filter, query]);

  useEffect(() => {
    if (filteredCandidates.length === 0) {
      setSelectedCandidateId(null);
      return;
    }
    if (
      !selectedCandidateId ||
      !filteredCandidates.some((c) => c.id === selectedCandidateId)
    ) {
      setSelectedCandidateId(filteredCandidates[0].id);
    }
  }, [filteredCandidates, selectedCandidateId]);

  const detailQuery = useAtsCandidateDetail(selectedCandidateId, isInternal);
  const profileDetailQuery = useCandidateDetail(
    user?.id,
    selectedCandidateId ?? undefined,
    isInternal && mainPanelTab === "profile"
  );
  const currentAtsFolder = useMemo(() => {
    if (atsFolders.length === 0) return null;
    return (
      atsFolders.find((folder) => folder.id === workspaceDraft.bookmarkFolderId) ??
      atsFolders.find((folder) => folder.isDefault) ??
      atsFolders[0] ??
      null
    );
  }, [atsFolders, workspaceDraft.bookmarkFolderId]);
  const activeCandidateSummary = useMemo(
    () =>
      candidates.find((candidate) => candidate.id === selectedCandidateId) ??
      null,
    [candidates, selectedCandidateId]
  );
  const detailCandidate = detailQuery.data?.candidate ?? null;
  const activeCandidate =
    (detailCandidate as AtsCandidateSummary | null) ?? activeCandidateSummary;
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

  const contactDraft = useMemo(
    () =>
      (selectedCandidateId && contactDraftByCandidateId[selectedCandidateId]) ||
      EMPTY_CONTACT_DRAFT,
    [contactDraftByCandidateId, selectedCandidateId]
  );
  const setContactDraft = (patch: Partial<AtsContactEmailDraft>) => {
    if (!selectedCandidateId) return;
    setContactDraftByCandidateId((prev) => ({
      ...prev,
      [selectedCandidateId]: {
        ...(prev[selectedCandidateId] ?? EMPTY_CONTACT_DRAFT),
        ...patch,
      },
    }));
  };

  const stats = useMemo(() => {
    const emailReadyCount = candidates.filter((candidate) =>
      Boolean(resolveTargetEmail(candidate))
    ).length;
    const dueTodayCount = candidates.filter(
      (candidate) =>
        candidate.outreach?.nextDueAt &&
        isDueToday(candidate.outreach.nextDueAt)
    ).length;
    const pausedCount = candidates.filter(
      (candidate) => candidate.outreach?.sequenceStatus === "paused"
    ).length;
    const completedCount = candidates.filter(
      (candidate) => candidate.outreach?.sequenceStatus === "completed"
    ).length;

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
        selectedIds.includes(candidate.id)
      ),
    [filteredCandidates, selectedIds]
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
  const emailHistory = useMemo(() => {
    return [...(detailQuery.data?.messages ?? [])]
      .filter((message) => message.status === "sent")
      .sort((a, b) => {
        const aTime = Date.parse(a.sentAt ?? a.createdAt);
        const bTime = Date.parse(b.sentAt ?? b.createdAt);
        return bTime - aTime;
      });
  }, [detailQuery.data?.messages]);
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

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }

    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
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

  const handleSaveWorkspace = async () => {
    try {
      await saveWorkspace.mutateAsync(workspaceDraft);
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
    const previousBookmarkFolderId = normalizeWorkspaceRecord(
      workspaceDraft
    ).bookmarkFolderId;
    if (previousBookmarkFolderId === nextFolderId) return;

    setWorkspaceDraft((prev) => ({
      ...prev,
      bookmarkFolderId: nextFolderId,
    }));

    try {
      await saveWorkspace.mutateAsync({
        bookmarkFolderId: nextFolderId,
      });
      showToast({ message: "ATS 대상 폴더를 변경했습니다.", variant: "white" });
    } catch (error) {
      setWorkspaceDraft((prev) => ({
        ...prev,
        bookmarkFolderId: previousBookmarkFolderId,
      }));
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

  const handleGenerateSequence = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
      await ensureSequenceScheduleSaved();
      await generateSequence.mutateAsync(selectedCandidateId);
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

  const sequenceMessages = detailQuery.data?.messages ?? [];
  const stepSentMessageByNumber = new Map<number, AtsMessageRecord>();
  const stepDraftMessageByNumber = new Map<number, AtsMessageRecord>();
  for (const message of sequenceMessages) {
    if (!message.stepNumber) continue;
    if (
      message.status === "sent" &&
      !stepSentMessageByNumber.has(message.stepNumber)
    ) {
      stepSentMessageByNumber.set(message.stepNumber, message);
    }
    if (
      message.kind === "sequence" &&
      !stepDraftMessageByNumber.has(message.stepNumber)
    ) {
      stepDraftMessageByNumber.set(message.stepNumber, message);
    }
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
    ? queuedEmailDiscoveryPositionById.get(selectedCandidateId) ?? null
    : null;
  const isSelectedEmailDiscoveryQueued =
    selectedEmailDiscoveryQueuePosition != null;
  const isSelectedEmailDiscoveryActive =
    Boolean(selectedCandidateId) && activeEmailDiscoveryId === selectedCandidateId;
  const emailDiscoveryQueueCount = queuedEmailDiscoveryIds.length;

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
          <div className={`${PANEL_CLASS} overflow-hidden`}>
            <div className="flex flex-col px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-white/10 p-2 text-white">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-lg font-medium text-white">
                    ATS Workspace
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    대상 폴더: {currentAtsFolder?.name ?? "폴더 없음"}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setWorkspaceOpen((prev) => !prev)}
                  className={BUTTON_PRIMARY}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition ${workspaceOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                  {workspaceOpen ? "접기" : "펼치기"}
                </button>
                <button
                  type="button"
                  onClick={handleSaveWorkspace}
                  disabled={saveWorkspace.isPending}
                  className={BUTTON_PRIMARY}
                >
                  {saveWorkspace.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save Workspace
                </button>
              </div>
            </div>

            {workspaceOpen && (
              <div className="flex flex-col gap-4 px-5 pb-5">
                <div className="space-y-3">
                  <div>
                    <div className="mb-2 text-sm font-medium text-white">
                      ATS Folder
                    </div>
                    {atsFolders.length === 0 ? (
                      <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-white/45">
                        선택 가능한 북마크 폴더가 없습니다.
                      </div>
                    ) : (
                      <select
                        value={currentAtsFolder?.id ?? ""}
                        onChange={(event) => {
                          const raw = Number(event.target.value);
                          void handleChangeWorkspaceFolder(
                            Number.isFinite(raw) && raw > 0 ? raw : null
                          );
                        }}
                        disabled={saveWorkspace.isPending}
                        className={INPUT_CLASS}
                      >
                        {atsFolders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                            {folder.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="mt-2 text-xs text-white/40">
                      ATS 후보 목록은 여기서 선택한 북마크 폴더를 기준으로
                      불러옵니다.
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-white">
                      JD
                    </div>
                    <textarea
                      value={workspaceDraft.jobDescription ?? ""}
                      onChange={(event) =>
                        setWorkspaceDraft((prev) => ({
                          ...prev,
                          jobDescription: event.target.value,
                        }))
                      }
                      rows={8}
                      placeholder="이 포지션의 JD를 넣어주세요. 이메일 시퀀스와 개인화 문구 생성에 사용됩니다."
                      className={TEXTAREA_CLASS}
                    />
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-medium text-white">
                      Company Pitch
                    </div>
                    <textarea
                      value={workspaceDraft.companyPitch ?? ""}
                      onChange={(event) =>
                        setWorkspaceDraft((prev) => ({
                          ...prev,
                          companyPitch: event.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="후보자에게 전달할 회사/팀 소개 문구"
                      className={TEXTAREA_CLASS}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

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
                    {(activeEmailDiscoveryId || emailDiscoveryQueueCount > 0) && (
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
                          className={`${ATS_TABLE_LAYOUT.widths.schedule} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Schedule
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
                          candidate.outreach?.emailDiscoveryStatus === "searching" ||
                          activeEmailDiscoveryId === candidate.id;
                        const rowEmailDiscoveryQueuePosition =
                          queuedEmailDiscoveryPositionById.get(candidate.id) ??
                          null;
                        const isRowEmailDiscoveryQueued =
                          queuedEmailDiscoverySet.has(candidate.id);
                        const hasRowEmailDiscoveryTrace =
                          (candidate.outreach?.emailDiscoveryTrace?.length ?? 0) > 0;
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
                                checked={selectedIds.includes(candidate.id)}
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
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleQueueCandidateEmailDiscovery(candidate.id);
                                  }}
                                  disabled={
                                    isRowEmailDiscoverySearching ||
                                    isRowEmailDiscoveryQueued
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {isRowEmailDiscoverySearching ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : isRowEmailDiscoveryQueued ? (
                                    <Clock3 className="h-3 w-3" />
                                  ) : (
                                    <Sparkles className="h-3 w-3" />
                                  )}
                                  {rowEmailActionLabel}
                                </button>
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
                                      isRowEmailDiscoverySearching
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
                                    : candidate.outreach?.emailDiscoverySummary ??
                                      "탐색 요청을 전송했습니다."}
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
                                <SequenceStageMarks
                                  outreach={candidate.outreach}
                                />
                              </div>
                            </td>
                            <td
                              className={
                                ATS_TABLE_LAYOUT.bodyCell +
                                "flex flex-row gap-4"
                              }
                            >
                              <div className="flex flex-col gap-1">
                                <div className="mt-2 text-xs text-white/45">
                                  마지막 발송
                                </div>
                                <div className="mt-1 text-sm text-white/70">
                                  {formatDateTime(
                                    candidate.outreach?.lastSentAt
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="text-xs text-white/45">
                                  Next due
                                </div>
                                <div className="mt-1 text-sm text-white/70">
                                  {formatDateTime(
                                    candidate.outreach?.nextDueAt
                                  )}
                                </div>
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

            <div className={`${PANEL_CLASS} p-5`}>
              {!activeCandidate ? (
                <div className="flex min-h-[760px] items-center justify-center text-sm text-white/50">
                  후보자를 선택해 주세요.
                </div>
              ) : detailQuery.isLoading ? (
                <div className="flex min-h-[760px] items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          {activeCandidate.profilePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={activeCandidate.profilePicture}
                              alt={activeCandidate.name ?? "candidate"}
                              className="h-11 w-11 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white">
                              <UserSquare2 className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-lg font-medium text-white">
                              {activeCandidate.name ?? "Unknown"}
                            </div>
                            <div className="mt-1 text-sm text-white/60 max-w-[360px] truncate">
                              {activeCandidate.headline ?? "headline 없음"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/55">
                          {activeCandidate.currentCompany && (
                            <span>{activeCandidate.currentCompany}</span>
                          )}
                          {activeCandidate.currentRole && (
                            <span>{activeCandidate.currentRole}</span>
                          )}
                          {activeCandidate.location && (
                            <span>{activeCandidate.location}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <AtsSequenceMarkButton
                          candidId={activeCandidate.id}
                          initialStatus={
                            activeCandidate.outreach?.sequenceMark ?? null
                          }
                          compact
                          align="end"
                        />
                        <button
                          type="button"
                          onClick={handleDiscoverEmail}
                          disabled={
                            isEmailDiscoverySearching ||
                            isSelectedEmailDiscoveryActive ||
                            isSelectedEmailDiscoveryQueued
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-sm bg-accenta1 px-3 py-2 text-sm text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isEmailDiscoverySearching ||
                          isSelectedEmailDiscoveryActive ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isSelectedEmailDiscoveryQueued ? (
                            <Clock3 className="h-4 w-4" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {isEmailDiscoverySearching ||
                          isSelectedEmailDiscoveryActive
                            ? "이메일 탐색 중"
                            : isSelectedEmailDiscoveryQueued
                              ? `대기 ${selectedEmailDiscoveryQueuePosition}`
                              : resolvedEmail
                                ? "이메일 재탐색"
                                : "이메일 찾기"}
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateSequence}
                          disabled={
                            generateSequence.isPending ||
                            saveWorkspace.isPending
                          }
                          className={BUTTON_PRIMARY}
                        >
                          {generateSequence.isPending ||
                          saveWorkspace.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          Generate 4-Step
                        </button>
                        <button
                          type="button"
                          onClick={handleResetCandidateOutreach}
                          disabled={
                            resetCandidateOutreach.isPending ||
                            isEmailDiscoverySearching ||
                            isSelectedEmailDiscoveryActive ||
                            isSelectedEmailDiscoveryQueued
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-sm border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {resetCandidateOutreach.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          Reset Outreach
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleSequencePause}
                          disabled={
                            !canToggleSequencePause ||
                            updateSequenceStatus.isPending
                          }
                          className={BUTTON_SECONDARY}
                        >
                          {isSequenceCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : detailCandidate?.outreach?.sequenceStatus ===
                            "paused" ? (
                            <PlayCircle className="h-4 w-4" />
                          ) : (
                            <PauseCircle className="h-4 w-4" />
                          )}
                          {isSequenceCompleted
                            ? "Completed"
                            : detailCandidate?.outreach?.sequenceStatus ===
                                "paused"
                              ? "Resume"
                              : "Pause"}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 border-b border-white/10 pb-3">
                      {(
                        [
                          ["candidate", "Candidate"],
                          ["sequence", "Sequence"],
                          ["profile", "Profile"],
                          ["contact", "Contact"],
                        ] as Array<[MainPanelTab, string]>
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setMainPanelTab(value)}
                          className={`rounded-md border px-3 py-1.5 text-sm transition ${
                            mainPanelTab === value
                              ? "border-accenta1/40 bg-accenta1 text-black"
                              : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {mainPanelTab === "candidate" && (
                    <div className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                        <div className="space-y-4">
                          <div className="">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">
                                이메일 찾기
                              </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-3 md:flex-row">
                              <input
                                value={manualEmail}
                                onChange={(event) =>
                                  setManualEmail(event.target.value)
                                }
                                placeholder="candidate@email.com"
                                className={INPUT_CLASS}
                              />
                              <button
                                type="button"
                                onClick={handleSaveManualEmail}
                                disabled={saveManualEmail.isPending}
                                className={BUTTON_SECONDARY}
                              >
                                {saveManualEmail.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Save
                              </button>
                            </div>
                            <div className="mt-4">
                              <AtsEmailDiscoveryActivity
                                outreach={emailDiscoveryOutreach}
                                isSearching={isEmailDiscoverySearching}
                                onClear={handleClearEmailTrace}
                                clearPending={clearEmailTrace.isPending}
                              />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {detailCandidate?.existingEmailSources.map(
                                (source) => (
                                  <span
                                    key={`${source.sourceType}-${source.email}`}
                                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60"
                                  >
                                    {source.label}: {source.email}
                                  </span>
                                )
                              )}
                            </div>
                          </div>

                          <div className="">
                            <div className="text-sm font-medium text-white">
                              Discovery Evidence
                            </div>
                            <div className="mt-4 grid gap-3">
                              {(
                                detailCandidate?.outreach
                                  ?.emailDiscoveryEvidence ?? []
                              ).length === 0 && (
                                <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                                  아직 저장된 탐색 근거가 없습니다.
                                </div>
                              )}
                              {detailCandidate?.outreach?.emailDiscoveryEvidence.map(
                                (evidence, index) => (
                                  <div
                                    key={`${evidence.email}-${index}`}
                                    className="rounded-md border border-white/10 bg-black/10 p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="text-sm font-medium text-white">
                                        {evidence.email}
                                      </div>
                                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/55">
                                        {evidence.confidence}
                                      </span>
                                    </div>
                                    {evidence.title && (
                                      <div className="mt-2 text-sm text-white/70">
                                        {evidence.title}
                                      </div>
                                    )}
                                    {evidence.snippet && (
                                      <div className="mt-2 text-sm leading-6 text-white/55">
                                        {evidence.snippet}
                                      </div>
                                    )}
                                    {evidence.url && (
                                      <a
                                        href={evidence.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mt-3 inline-flex items-center gap-1 text-xs text-accenta1 transition hover:text-accenta1/90"
                                      >
                                        Open source
                                        <ArrowUpRight className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="rounded-md p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">
                                노트
                              </div>
                              <button
                                type="button"
                                onClick={handleSaveCandidateMemo}
                                disabled={saveCandidateMemo.isPending}
                                className={BUTTON_PRIMARY}
                              >
                                {saveCandidateMemo.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Save
                              </button>
                            </div>
                            <textarea
                              value={candidateMemoDraft}
                              onChange={(event) =>
                                setCandidateMemoDraft(event.target.value)
                              }
                              rows={4}
                              placeholder="이 후보자에 대한 ATS 메모를 남겨주세요."
                              className={`${TEXTAREA_CLASS} mt-4`}
                            />
                          </div>
                          <div className="rounded-md bg-white/5 p-4">
                            <div className="text-sm font-medium text-white">
                              Candidate Snapshot
                            </div>
                            <div className="mt-4 gap-3 w-full">
                              <div className="flex flex-row gap-4 w-full">
                                <div>
                                  <div className="text-xs text-white/45">
                                    Current Company
                                  </div>
                                  <div className="mt-1 text-sm text-white/75">
                                    <span className="font-semibold">
                                      {activeCandidate.currentRole ?? "-"}
                                    </span>{" "}
                                    at{" "}
                                    <span className="text-accenta1">
                                      {activeCandidate.currentCompany ?? "-"}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-white/45">
                                    Location
                                  </div>
                                  <div className="mt-1 text-sm text-white/75">
                                    {activeCandidate.location ?? "-"}
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="text-xs text-white/45">
                                  Shortlist Memo
                                </div>
                                <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-white/65">
                                  {activeCandidate.shortlistMemo || "-"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {mainPanelTab === "sequence" && (
                    <div className="space-y-4">
                      {hasUnsavedSequenceScheduleChanges && (
                        <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          저장되지 않은 timing 변경이 있습니다. `Send` 또는
                          `Generate 4-Step` 전에 자동 반영되지만, 지금 바로
                          저장할 수도 있습니다.
                        </div>
                      )}
                      <div className="grid gap-4 xl:grid-cols-[0.5fr_1.5fr]">
                        <div className="">
                          <div className="text-sm font-medium text-white">
                            Sequence Snapshot
                          </div>
                          <div className="mt-4 grid gap-3">
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="text-xs text-white/45">
                                Target Email
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {resolvedEmail ?? "이메일 필요"}
                              </div>
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-white/45">
                                  Stage Marks
                                </div>
                                <div className="text-sm text-white">
                                  {
                                    getStageBadge(
                                      detailCandidate?.outreach ?? null
                                    ).label
                                  }
                                </div>
                              </div>
                              <div className="mt-3">
                                <SequenceStageMarks
                                  outreach={detailCandidate?.outreach ?? null}
                                />
                              </div>
                              <div className="mt-3 text-sm text-white/60">
                                {isSequenceCompleted
                                  ? "4-step 시퀀스가 모두 완료되었습니다."
                                  : !resolvedEmail
                                    ? `다음 step ${nextSequenceStep ?? 1}은 이메일 확인 후 진행할 수 있습니다.`
                                    : detailCandidate?.outreach
                                          ?.sequenceStatus === "paused"
                                      ? `다음 step ${nextSequenceStep ?? 1}이 중단된 상태입니다.`
                                      : `다음 액션은 step ${nextSequenceStep ?? 1} 발송입니다.`}
                              </div>
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="text-xs text-white/45">
                                마지막 발송
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(
                                  detailCandidate?.outreach?.lastSentAt
                                )}
                              </div>
                              <div className="text-xs text-white/45">
                                Next Due
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(
                                  detailCandidate?.outreach?.nextDueAt
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4">
                          {Array.from(
                            { length: ATS_SEQUENCE_STEP_COUNT },
                            (_, index) => {
                              const stepNumber = index + 1;
                              const stepSchedule =
                                sequenceScheduleDraft.find(
                                  (item) => item.stepNumber === stepNumber
                                ) ?? createDefaultAtsSequenceSchedule()[index];
                              const sentMessage =
                                stepSentMessageByNumber.get(stepNumber) ?? null;
                              const draftMessage =
                                stepDraftMessageByNumber.get(stepNumber) ??
                                null;
                              const isReadyStep =
                                nextSequenceStep === stepNumber;
                              const canSend =
                                Boolean(resolvedEmail) &&
                                Boolean(draftMessage) &&
                                !sentMessage &&
                                detailCandidate?.outreach?.sequenceStatus !==
                                  "paused" &&
                                !saveWorkspace.isPending &&
                                !isSequenceCompleted &&
                                isReadyStep;

                              const label = sentMessage
                                ? {
                                    className:
                                      sentMessage.kind === "manual"
                                        ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
                                        : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
                                    text:
                                      sentMessage.kind === "manual"
                                        ? "Sent manually"
                                        : "Sent",
                                  }
                                : detailCandidate?.outreach?.sequenceStatus ===
                                      "paused" && isReadyStep
                                  ? {
                                      className:
                                        "border-amber-400/20 bg-amber-400/10 text-amber-100",
                                      text: "Paused",
                                    }
                                  : !resolvedEmail &&
                                      isReadyStep &&
                                      draftMessage
                                    ? {
                                        className:
                                          "border-rose-400/20 bg-rose-400/10 text-rose-100",
                                        text: "Needs email",
                                      }
                                    : canSend
                                      ? {
                                          className:
                                            "border-sky-400/20 bg-sky-400/10 text-sky-100",
                                          text: "Ready",
                                        }
                                      : {
                                          className:
                                            "border-white/10 bg-white/5 text-white/60",
                                          text: draftMessage
                                            ? "Waiting"
                                            : "Draft pending",
                                        };

                              return (
                                <SequenceStepCard
                                  key={stepNumber}
                                  canSend={canSend}
                                  label={label}
                                  message={sentMessage ?? draftMessage}
                                  onSaveSchedule={handleSaveSequenceSchedule}
                                  onScheduleChange={(patch) =>
                                    updateSequenceScheduleDraft(
                                      stepNumber,
                                      patch
                                    )
                                  }
                                  onSend={() =>
                                    handleSendSequenceStep(stepNumber)
                                  }
                                  saveSchedulePending={
                                    saveSequenceSchedule.isPending
                                  }
                                  schedule={stepSchedule}
                                  sendPending={
                                    sendSequenceStep.isPending &&
                                    sendSequenceStep.variables?.stepNumber ===
                                      stepNumber
                                  }
                                  stepNumber={stepNumber}
                                />
                              );
                            }
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-medium text-white">
                          Mail History
                        </div>
                        <div className="mt-4 space-y-3">
                          {sequenceMessages.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                              아직 생성되거나 발송된 메일이 없습니다.
                            </div>
                          )}
                          {sequenceMessages.map((message) => (
                            <div
                              key={message.id}
                              className="rounded-md border border-white/10 bg-black/10 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">
                                    {message.kind === "manual"
                                      ? "Manual"
                                      : "Sequence"}
                                  </span>
                                  {message.stepNumber && (
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">
                                      Step {message.stepNumber}
                                    </span>
                                  )}
                                  <span className="text-xs text-white/45">
                                    {message.status}
                                  </span>
                                </div>
                                <div className="text-xs text-white/45">
                                  {formatDateTime(
                                    message.sentAt ?? message.createdAt
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 text-sm font-medium text-white">
                                {message.renderedSubject ?? message.subject}
                              </div>
                              <div className="mt-2">
                                <AtsEmailBodyContent
                                  body={message.renderedBody ?? message.body}
                                  tone="dark"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {mainPanelTab === "contact" && (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3  lg:flex-row lg:items-center lg:justify-between">
                        <div></div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleGenerateContactEmail}
                            disabled={
                              generateContactEmail.isPending ||
                              saveWorkspace.isPending
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-accenta1 px-3 py-2 text-sm text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {generateContactEmail.isPending ||
                            saveWorkspace.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            메일 내용 자동 작성
                          </button>
                          <button
                            type="button"
                            onClick={handleSendContactEmail}
                            disabled={
                              !manualEmail.trim() ||
                              !contactDraft.subject.trim() ||
                              !contactDraft.body.trim() ||
                              sendContactEmail.isPending
                            }
                            className={BUTTON_PRIMARY}
                          >
                            {sendContactEmail.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            메일 발송
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="">
                          <div className="text-sm font-medium text-white">
                            메일 작성
                          </div>
                          <div className="mt-4 space-y-4">
                            <div>
                              <div className="mb-2 text-xs text-white/45">
                                To
                              </div>
                              <div className="flex flex-col gap-3 md:flex-row">
                                <input
                                  value={manualEmail}
                                  onChange={(event) =>
                                    setManualEmail(event.target.value)
                                  }
                                  placeholder="candidate@email.com"
                                  className={INPUT_CLASS}
                                />
                                <button
                                  type="button"
                                  onClick={handleSaveManualEmail}
                                  disabled={saveManualEmail.isPending}
                                  className={BUTTON_SECONDARY}
                                >
                                  {saveManualEmail.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Check className="h-4 w-4" />
                                  )}
                                  Save Email
                                </button>
                              </div>
                            </div>

                            <div>
                              <div className="mb-2 text-xs text-white/45">
                                Subject
                              </div>
                              <input
                                value={contactDraft.subject}
                                onChange={(event) =>
                                  setContactDraft({
                                    subject: event.target.value,
                                  })
                                }
                                placeholder="메일 제목"
                                className={INPUT_CLASS}
                              />
                            </div>

                            <div>
                              <div className="mb-2 text-xs text-white/45">
                                Body
                              </div>
                              <AtsEmailBodyEditor
                                value={contactDraft.body}
                                onChange={(body) =>
                                  setContactDraft({
                                    body,
                                  })
                                }
                                rows={15}
                                placeholder="후보자에게 보낼 메일 내용을 작성하세요."
                                textareaClassName={TEXTAREA_CLASS}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-md border border-white/10 bg-white/5 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-white">
                              Preview
                            </div>
                            <div className="text-xs text-white/45">
                              {activeCandidate.name ?? "후보자 없음"}
                            </div>
                          </div>
                          <div className="mt-4 rounded-md bg-white p-4 text-black">
                            <div className="grid gap-3 border-b border-black/10 pb-4 text-sm">
                              <div className="flex items-start gap-3">
                                <div className="w-14 text-black/45">From</div>
                                <div className="flex-1 break-all">
                                  {workspaceDraft.senderEmail ||
                                    user?.email ||
                                    "-"}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-14 text-black/45">To</div>
                                <div className="flex-1 break-all">
                                  {manualEmail || "-"}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-14 text-black/45">
                                  Subject
                                </div>
                                <div className="flex-1 font-medium">
                                  {contactPreviewSubject ||
                                    "제목을 입력하면 여기에 표시됩니다."}
                                </div>
                              </div>
                            </div>
                            <div className="mt-4">
                              <AtsEmailBodyContent
                                body={contactPreviewBody}
                                emptyMessage="본문을 입력하면 여기에 실제 발송 기준 미리보기가 표시됩니다."
                                tone="light"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-medium text-white">
                          Email History
                        </div>
                        <div className="mt-4 space-y-3">
                          {emailHistory.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                              아직 발송된 메일이 없습니다.
                            </div>
                          )}
                          {emailHistory.map((message) => (
                            <div
                              key={message.id}
                              className="rounded-md border border-white/10 bg-black/10 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">
                                    {message.kind === "manual"
                                      ? "Manual"
                                      : "Sequence"}
                                  </span>
                                  {message.stepNumber && (
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">
                                      Step {message.stepNumber}
                                    </span>
                                  )}
                                  {message.toEmail && (
                                    <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/45">
                                      {message.toEmail}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-white/45">
                                  {formatDateTime(
                                    message.sentAt ?? message.createdAt
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 text-sm font-medium text-white">
                                {message.renderedSubject ?? message.subject}
                              </div>
                              <div className="mt-2">
                                <AtsEmailBodyContent
                                  body={message.renderedBody ?? message.body}
                                  tone="dark"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {mainPanelTab === "profile" && (
                    <div className="min-h-[820px]">
                      {profileDetailQuery.isLoading && (
                        <div className="flex min-h-[720px] items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        </div>
                      )}
                      {!profileDetailQuery.isLoading &&
                        profileDetailQuery.error && (
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={`${PANEL_CLASS} p-5`}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-medium text-white">
                  대량 메일 발송
                </div>
                <div className="mt-1 text-sm text-white/55">
                  선택한 후보자 {selectedIds.length}명에게 직접 메일 발송
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendBulkMail}
                disabled={
                  selectedIds.length === 0 ||
                  !bulkSubject.trim() ||
                  !bulkBody.trim() ||
                  sendBulkMail.isPending
                }
                className={BUTTON_PRIMARY}
              >
                {sendBulkMail.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Selected
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {ATS_TEMPLATE_VARIABLES.map((variable) => (
                <button
                  key={variable.key}
                  type="button"
                  onClick={async () => {
                    try {
                      await copyVariableToClipboard(variable.label);
                      showToast({
                        message: `${variable.label} 복사됨`,
                        variant: "white",
                      });
                    } catch {
                      showToast({
                        message: "변수 복사에 실패했습니다.",
                        variant: "error",
                      });
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/10"
                >
                  <Copy className="h-3 w-3" />
                  {variable.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col mt-4">
              <div className="space-y-3">
                <div>
                  <div className="mb-2 text-sm font-medium text-white">
                    Subject
                  </div>
                  <input
                    value={bulkSubject}
                    onChange={(event) => setBulkSubject(event.target.value)}
                    placeholder="예: {{name}}님께, Harper에서 연락드립니다"
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <div className="mb-2 text-sm font-medium text-white">
                    Body
                  </div>
                  <AtsEmailBodyEditor
                    value={bulkBody}
                    onChange={setBulkBody}
                    rows={10}
                    placeholder="예: {{first_name}}님 안녕하세요..."
                    textareaClassName={TEXTAREA_CLASS}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-md bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">Preview</div>
                  <div className="text-xs text-white/45">
                    {previewCandidate?.name ?? "후보자 없음"}
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs text-white/35">Subject</div>
                    <div className="mt-2 text-sm text-white/85">
                      {previewSubject ||
                        "미리보기를 위해 제목을 입력해 주세요."}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-white/35">Body</div>
                    <div className="mt-2">
                      <AtsEmailBodyContent
                        body={previewBody}
                        emptyMessage="미리보기를 위해 본문을 입력해 주세요."
                        tone="dark"
                      />
                    </div>
                  </div>
                </div>
                {previewCandidate && (
                  <div className="mt-4 rounded-md bg-black/10 p-3">
                    <div className="mt-3 grid gap-2 text-sm text-white/60">
                      {Object.entries(previewVariables).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 w-full"
                        >
                          <div className="text-white/40">{key}</div>
                          <div className="truncate text-right max-w-[600px]">
                            {value || "-"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
