import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Loader2,
  Mail,
  Minus,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  UserSquare2,
  X,
} from "lucide-react";
import AtsEmailBodyContent from "@/components/ats/AtsEmailBodyContent";
import AtsEmailBodyEditor from "@/components/ats/AtsEmailBodyEditor";
import AtsEmailDiscoveryActivity from "@/components/ats/AtsEmailDiscoveryActivity";
import AtsSequenceStageMarks from "@/components/ats/AtsSequenceStageMarks";
import AtsSequenceMarkButton from "@/components/ui/AtsSequenceMarkButton";
import {
  ATS_SEQUENCE_STEP_COUNT,
  createDefaultAtsSequenceSchedule,
  type AtsCandidateSummary,
  type AtsContactEmailDraft,
  type AtsEmailDiscoveryTraceItem,
  type AtsMessageRecord,
  type AtsOutreachRecord,
  type AtsSequenceStepSchedule,
} from "@/lib/ats/shared";
import {
  describeSchedule,
  formatDateInputValue,
  formatDateTime,
  isDueToday,
} from "@/components/ats/utils";

export type AtsMainPanelTab =
  | "candidate"
  | "sequence"
  | "profile"
  | "contact";

type SequenceDraftState = Record<number, AtsContactEmailDraft>;

type AtsCandidateDrawerProps = {
  activeCandidate: AtsCandidateSummary | null;
  buttonPrimaryClassName: string;
  buttonSecondaryClassName: string;
  candidateMemo: {
    onChange: (value: string) => void;
    onSave: () => void | Promise<void>;
    savePending: boolean;
    value: string;
  };
  canToggleSequencePause: boolean;
  contact: {
    cancelScheduledPendingMessageId: number | null;
    draft: AtsContactEmailDraft;
    emailHistory: AtsMessageRecord[];
    generatePending: boolean;
    manualEmail: string;
    onCancelScheduled: (messageId: number) => void | Promise<void>;
    onDraftChange: (patch: Partial<AtsContactEmailDraft>) => void;
    onGenerate: () => void | Promise<void>;
    onManualEmailChange: (value: string) => void;
    onSaveManualEmail: () => void | Promise<void>;
    onSchedule: () => void | Promise<void>;
    onScheduledAtChange: (value: string) => void;
    onSend: () => void | Promise<void>;
    previewBody: string;
    previewSubject: string;
    saveManualEmailPending: boolean;
    scheduledAt: string;
    scheduledMessages: AtsMessageRecord[];
    schedulePending: boolean;
    sendPending: boolean;
    senderEmail: string | null | undefined;
    userEmail: string | null | undefined;
  };
  detailCandidate: AtsCandidateSummary | null;
  detailLoading: boolean;
  emailDiscovery: {
    clearPending: boolean;
    isActive: boolean;
    isQueued: boolean;
    isSearching: boolean;
    isStopping: boolean;
    onClearTrace: () => void | Promise<void>;
    onDiscover: () => void | Promise<void>;
    onStop: () => void | Promise<void>;
    outreach: AtsOutreachRecord | null;
    queuePosition: number | null;
    resolvedEmail: string | null;
  };
  generateSequencePending: boolean;
  inputClassName: string;
  isOpen: boolean;
  mainPanelTab: AtsMainPanelTab;
  onClose: () => void;
  onGenerateSequence: () => void | Promise<void>;
  onMainPanelTabChange: (tab: AtsMainPanelTab) => void;
  onResetCandidateOutreach: () => void | Promise<void>;
  onToggleSequencePause: () => void | Promise<void>;
  profileContent: React.ReactNode;
  resetCandidateOutreachPending: boolean;
  saveWorkspacePending: boolean;
  sequence: {
    draftMessageByNumber: Map<number, AtsMessageRecord>;
    drafts: SequenceDraftState;
    expandedStep: number | null;
    hasUnsavedDraftChanges: boolean;
    hasUnsavedScheduleChanges: boolean;
    isCompleted: boolean;
    messages: AtsMessageRecord[];
    nextStep: number | null;
    onResetDraft: (stepNumber: number) => void;
    onSaveDraft: (stepNumber: number) => void | Promise<void>;
    onSaveSchedule: () => void | Promise<void>;
    onScheduleChange: (
      stepNumber: number,
      patch: Partial<AtsSequenceStepSchedule>
    ) => void;
    onSendStep: (stepNumber: number) => void | Promise<void>;
    onToggleEdit: (stepNumber: number) => void;
    onUpdateDraft: (
      stepNumber: number,
      patch: Partial<AtsContactEmailDraft>
    ) => void;
    outreach: AtsOutreachRecord | null;
    resolvedEmail: string | null;
    savedDrafts: SequenceDraftState;
    saveDraftPendingStep: number | null;
    saveSchedulePending: boolean;
    scheduleDraft: AtsSequenceStepSchedule[];
    sendPendingStep: number | null;
    sentMessageByNumber: Map<number, AtsMessageRecord>;
  };
  textareaClassName: string;
  updateSequenceStatusPending: boolean;
};

type ManualReviewUrlSuggestion = {
  category:
    | "github"
    | "scholar"
    | "homepage"
    | "blog"
    | "resume"
    | "publication"
    | "paper_pdf"
    | "lab_profile"
    | "company_profile"
    | "other";
  label: string;
  reason: string;
  scrapeStatus:
    | "blocked"
    | "not_checked"
    | "scrape_failed"
    | "scraped_no_email"
    | "scraped_with_email"
    | "search_only";
  source: string;
  url: string;
};

function extractManualReviewSuggestions(
  trace: AtsEmailDiscoveryTraceItem[] | null | undefined
) {
  const items = Array.isArray(trace) ? [...trace].reverse() : [];

  for (const item of items) {
    const raw = item.meta?.suggestedManualReviewUrls;
    if (!Array.isArray(raw)) continue;

    return raw
      .map((entry) => {
        const candidate = entry as Partial<ManualReviewUrlSuggestion>;
        const url = String(candidate.url ?? "").trim();
        if (!url) return null;

        return {
          category:
            candidate.category === "github" ||
            candidate.category === "scholar" ||
            candidate.category === "homepage" ||
            candidate.category === "blog" ||
            candidate.category === "resume" ||
            candidate.category === "publication" ||
            candidate.category === "paper_pdf" ||
            candidate.category === "lab_profile" ||
            candidate.category === "company_profile" ||
            candidate.category === "other"
              ? candidate.category
              : "other",
          label: String(candidate.label ?? "").trim() || url,
          reason: String(candidate.reason ?? "").trim(),
          scrapeStatus:
            candidate.scrapeStatus === "blocked" ||
            candidate.scrapeStatus === "not_checked" ||
            candidate.scrapeStatus === "scrape_failed" ||
            candidate.scrapeStatus === "scraped_no_email" ||
            candidate.scrapeStatus === "scraped_with_email" ||
            candidate.scrapeStatus === "search_only"
              ? candidate.scrapeStatus
              : "not_checked",
          source: String(candidate.source ?? "").trim(),
          url,
        } satisfies ManualReviewUrlSuggestion;
      })
      .filter(Boolean) as ManualReviewUrlSuggestion[];
  }

  return [];
}

function getManualReviewCategoryLabel(
  category: ManualReviewUrlSuggestion["category"]
) {
  if (category === "github") return "GitHub";
  if (category === "scholar") return "Scholar";
  if (category === "homepage") return "Homepage";
  if (category === "blog") return "Blog";
  if (category === "resume") return "Resume/CV";
  if (category === "publication") return "Paper";
  if (category === "paper_pdf") return "Paper PDF";
  if (category === "lab_profile") return "Lab/Profile";
  if (category === "company_profile") return "Company";
  return "Other";
}

function getManualReviewStatusLabel(
  status: ManualReviewUrlSuggestion["scrapeStatus"]
) {
  if (status === "blocked") return "Manual Only";
  if (status === "scrape_failed") return "Scrape Failed";
  if (status === "scraped_no_email") return "Checked";
  if (status === "scraped_with_email") return "Email Found";
  if (status === "search_only") return "Search Result";
  return "Not Checked";
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

function SequenceStepCard({
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  canSend,
  draft,
  inputClassName,
  isDraftDirty,
  isEditing,
  isSent,
  label,
  message,
  onDraftChange,
  onResetDraft,
  onSaveDraft,
  onSaveSchedule,
  onScheduleChange,
  onSend,
  onToggleEdit,
  saveDraftPending,
  saveSchedulePending,
  schedule,
  sendPending,
  stepNumber,
  textareaClassName,
}: {
  buttonPrimaryClassName: string;
  buttonSecondaryClassName: string;
  canSend: boolean;
  draft: AtsContactEmailDraft;
  inputClassName: string;
  isDraftDirty: boolean;
  isEditing: boolean;
  isSent: boolean;
  label: { className: string; text: string };
  message: AtsMessageRecord | null;
  onDraftChange: (patch: Partial<AtsContactEmailDraft>) => void;
  onResetDraft: () => void;
  onSaveDraft: () => void;
  onSaveSchedule: () => void;
  onScheduleChange: (patch: Partial<AtsSequenceStepSchedule>) => void;
  onSend: () => void;
  onToggleEdit: () => void;
  saveDraftPending: boolean;
  saveSchedulePending: boolean;
  schedule: AtsSequenceStepSchedule;
  sendPending: boolean;
  stepNumber: number;
  textareaClassName: string;
}) {
  const subjectPreview = isSent
    ? (message?.renderedSubject ?? message?.subject ?? "Draft pending")
    : draft.subject.trim() || message?.subject || "Draft pending";
  const bodyPreview = isSent
    ? (message?.renderedBody ?? message?.body ?? "아직 생성되지 않았습니다.")
    : draft.body.trim() || message?.body || "아직 생성되지 않았습니다.";

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
                  className={`${inputClassName} pl-9`}
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
                  className={`${inputClassName} pl-9`}
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
                  className={`${inputClassName} pl-9`}
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-md border px-2 py-1 text-xs ${label.className}`}
          >
            {label.text}
          </span>
          {!isSent && message && (
            <button
              type="button"
              onClick={onToggleEdit}
              className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${isEditing ? "rotate-180" : ""}`}
              />
              {isEditing ? "Close" : "Edit Draft"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {isEditing && !isSent ? (
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-xs text-white/45">Subject</div>
              <input
                value={draft.subject}
                onChange={(event) =>
                  onDraftChange({ subject: event.target.value })
                }
                placeholder="메일 제목"
                className={inputClassName}
              />
            </div>
            <div>
              <div className="mb-2 text-xs text-white/45">Body</div>
              <AtsEmailBodyEditor
                value={draft.body}
                onChange={(body) => onDraftChange({ body })}
                rows={10}
                placeholder="메일 본문을 작성하세요."
                textareaClassName={textareaClassName}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-white/45">
                템플릿 변수는 발송 시 실제 후보자 값으로 치환됩니다.
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onResetDraft}
                  disabled={saveDraftPending || !isDraftDirty}
                  className={buttonSecondaryClassName}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={
                    saveDraftPending ||
                    !isDraftDirty ||
                    !draft.subject.trim() ||
                    !draft.body.trim()
                  }
                  className={buttonPrimaryClassName}
                >
                  {saveDraftPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Save Draft
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="text-xs text-white/45">Subject</div>
              <div className="mt-1 text-sm text-white">{subjectPreview}</div>
            </div>
            <div>
              <div className="text-xs text-white/45">Body</div>
              <div className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-white/65">
                {bodyPreview}
              </div>
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-white/45">
            {isDraftDirty && !isSent
              ? "저장되지 않은 draft 변경이 있습니다."
              : message?.sentAt
                ? `Sent ${formatDateTime(message.sentAt)}`
                : "아직 발송되지 않음"}
          </div>
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend || sendPending || saveDraftPending}
            className={buttonSecondaryClassName}
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

export default function AtsCandidateDrawer({
  activeCandidate,
  buttonPrimaryClassName,
  buttonSecondaryClassName,
  candidateMemo,
  canToggleSequencePause,
  contact,
  detailCandidate,
  detailLoading,
  emailDiscovery,
  generateSequencePending,
  inputClassName,
  isOpen,
  mainPanelTab,
  onClose,
  onGenerateSequence,
  onMainPanelTabChange,
  onResetCandidateOutreach,
  onToggleSequencePause,
  profileContent,
  resetCandidateOutreachPending,
  saveWorkspacePending,
  sequence,
  textareaClassName,
  updateSequenceStatusPending,
}: AtsCandidateDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  const manualReviewSuggestions = extractManualReviewSuggestions(
    emailDiscovery.outreach?.emailDiscoveryTrace
  );
  const stageBadge = getStageBadge(sequence.outreach);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[140]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            type="button"
            aria-label="Close ATS candidate drawer"
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            className="absolute right-0 top-0 h-full w-[92vw] border-l border-white/10 bg-hgray200 shadow-2xl lg:w-[min(60vw,1120px)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              type: "tween",
              ease: "easeOut",
              duration: 0.22,
            }}
          >
            <div className="h-full overflow-y-auto p-5">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close candidate drawer"
                  className="inline-flex items-center justify-center rounded-sm border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {!activeCandidate ? (
                <div className="flex min-h-[760px] items-center justify-center text-sm text-white/50">
                  후보자를 선택해 주세요.
                </div>
              ) : detailLoading ? (
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
                            <div className="mt-1 max-w-[360px] truncate text-sm text-white/60">
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
                        {emailDiscovery.isSearching ||
                        emailDiscovery.isActive ||
                        emailDiscovery.isQueued ? (
                          <button
                            type="button"
                            onClick={() => {
                              void emailDiscovery.onStop();
                            }}
                            disabled={emailDiscovery.isStopping}
                            className="inline-flex items-center justify-center gap-2 rounded-sm border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {emailDiscovery.isStopping ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <X className="h-4 w-4" />
                            )}
                            {emailDiscovery.isSearching ||
                            emailDiscovery.isActive
                              ? "이메일 탐색 중지"
                              : `대기 ${emailDiscovery.queuePosition} 취소`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              void emailDiscovery.onDiscover();
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-accenta1 px-3 py-2 text-sm text-black transition hover:opacity-90"
                          >
                            <Sparkles className="h-4 w-4" />
                            {emailDiscovery.resolvedEmail
                              ? "이메일 재탐색"
                              : "이메일 찾기"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            void onGenerateSequence();
                          }}
                          disabled={generateSequencePending || saveWorkspacePending}
                          className={buttonPrimaryClassName}
                        >
                          {generateSequencePending || saveWorkspacePending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Mail className="h-4 w-4" />
                          )}
                          Generate 4-Step
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onResetCandidateOutreach();
                          }}
                          disabled={
                            resetCandidateOutreachPending ||
                            emailDiscovery.isSearching ||
                            emailDiscovery.isActive ||
                            emailDiscovery.isQueued ||
                            emailDiscovery.isStopping
                          }
                          className="inline-flex items-center justify-center gap-2 rounded-sm border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {resetCandidateOutreachPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          Reset Outreach
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void onToggleSequencePause();
                          }}
                          disabled={
                            !canToggleSequencePause || updateSequenceStatusPending
                          }
                          className={buttonSecondaryClassName}
                        >
                          {sequence.isCompleted ? (
                            <Check className="h-4 w-4" />
                          ) : sequence.outreach?.sequenceStatus === "paused" ? (
                            <PlayCircle className="h-4 w-4" />
                          ) : (
                            <PauseCircle className="h-4 w-4" />
                          )}
                          {sequence.isCompleted
                            ? "Completed"
                            : sequence.outreach?.sequenceStatus === "paused"
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
                        ] as Array<[AtsMainPanelTab, string]>
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => onMainPanelTabChange(value)}
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
                    <div className="w-full min-w-0 space-y-4">
                      <div className="grid w-full min-w-0 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                        <div className="min-w-0 space-y-4">
                          <div className="w-full min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">
                                이메일 찾기
                              </div>
                            </div>
                            <div className="mt-4 flex flex-col gap-3 md:flex-row">
                              <input
                                value={contact.manualEmail}
                                onChange={(event) =>
                                  contact.onManualEmailChange(
                                    event.target.value
                                  )
                                }
                                placeholder="candidate@email.com"
                                className={inputClassName}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  void contact.onSaveManualEmail();
                                }}
                                disabled={contact.saveManualEmailPending}
                                className={buttonSecondaryClassName}
                              >
                                {contact.saveManualEmailPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Save
                              </button>
                            </div>
                            <div className="mt-4 min-w-0">
                              <AtsEmailDiscoveryActivity
                                outreach={emailDiscovery.outreach}
                                isSearching={emailDiscovery.isSearching}
                                onClear={emailDiscovery.onClearTrace}
                                clearPending={emailDiscovery.clearPending}
                              />
                            </div>
                            <div className="mt-4 rounded-md border border-white/10 bg-black/10 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-medium text-white">
                                  Manual Review URLs
                                </div>
                                <div className="text-xs text-white/40">
                                  {manualReviewSuggestions.length > 0
                                    ? `${manualReviewSuggestions.length}개 추천`
                                    : emailDiscovery.isSearching
                                      ? "탐색 종료 후 갱신"
                                      : "아직 없음"}
                                </div>
                              </div>
                              <div className="mt-3 space-y-3">
                                {manualReviewSuggestions.length === 0 ? (
                                  <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-sm text-white/50">
                                    {emailDiscovery.isSearching
                                      ? "이메일 탐색이 끝나면 수동 확인 추천 URL이 여기에 표시됩니다."
                                      : "추천 URL이 아직 없습니다. 이메일 탐색을 실행하면 후보자와 가장 관련 있는 링크들을 정리합니다."}
                                  </div>
                                ) : (
                                  manualReviewSuggestions.map(
                                    (suggestion, index) => (
                                      <div
                                        key={`${suggestion.url}-${index}`}
                                        className="rounded-md border border-white/10 bg-white/[0.03] p-3"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                                            {index + 1}
                                          </span>
                                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/60">
                                            {getManualReviewCategoryLabel(
                                              suggestion.category
                                            )}
                                          </span>
                                          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/45">
                                            {getManualReviewStatusLabel(
                                              suggestion.scrapeStatus
                                            )}
                                          </span>
                                        </div>
                                        <a
                                          href={suggestion.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="mt-3 inline-flex items-start gap-1 break-all text-sm text-accenta1 transition hover:text-accenta1/90"
                                        >
                                          <span>{suggestion.label}</span>
                                          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        </a>
                                        <div className="mt-2 break-words text-xs leading-5 text-white/60">
                                          {suggestion.reason}
                                        </div>
                                      </div>
                                    )
                                  )
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {(detailCandidate?.existingEmailSources ?? []).map(
                                (source) => (
                                  <span
                                    key={`${source.sourceType}-${source.email}`}
                                    className="break-all rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60"
                                  >
                                    {source.label}: {source.email}
                                  </span>
                                )
                              )}
                            </div>
                          </div>

                          <div className="w-full min-w-0">
                            <div className="text-sm font-medium text-white">
                              Discovery Evidence
                            </div>
                            <div className="mt-4 grid gap-3">
                              {(detailCandidate?.outreach?.emailDiscoveryEvidence ??
                                []).length === 0 && (
                                <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                                  아직 저장된 탐색 근거가 없습니다.
                                </div>
                              )}
                              {(
                                detailCandidate?.outreach?.emailDiscoveryEvidence ??
                                []
                              ).map((evidence, index) => (
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
                                    <div className="mt-2 break-words text-sm text-white/70">
                                      {evidence.title}
                                    </div>
                                  )}
                                  {evidence.snippet && (
                                    <div className="mt-2 break-words text-sm leading-6 text-white/55">
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
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-4">
                          <div className="rounded-md p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">
                                노트
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  void candidateMemo.onSave();
                                }}
                                disabled={candidateMemo.savePending}
                                className={buttonPrimaryClassName}
                              >
                                {candidateMemo.savePending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Check className="h-4 w-4" />
                                )}
                                Save
                              </button>
                            </div>
                            <textarea
                              value={candidateMemo.value}
                              onChange={(event) =>
                                candidateMemo.onChange(event.target.value)
                              }
                              rows={4}
                              placeholder="이 후보자에 대한 ATS 메모를 남겨주세요."
                              className={`${textareaClassName} mt-4`}
                            />
                          </div>
                          <div className="rounded-md bg-white/5 p-4">
                            <div className="text-sm font-medium text-white">
                              Candidate Snapshot
                            </div>
                            <div className="mt-4 w-full gap-3">
                              <div className="flex w-full flex-row gap-4">
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
                      {sequence.hasUnsavedDraftChanges && (
                        <div className="rounded-md border border-sky-400/20 bg-sky-400/10 px-4 py-3 text-sm text-sky-100">
                          저장되지 않은 sequence draft 변경이 있습니다. `Send`
                          전에 자동 반영되지만, step 카드에서 바로 저장할 수도
                          있습니다.
                        </div>
                      )}
                      {sequence.hasUnsavedScheduleChanges && (
                        <div className="rounded-md border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                          저장되지 않은 timing 변경이 있습니다. `Send` 또는
                          `Generate 4-Step` 전에 자동 반영되지만, 지금 바로
                          저장할 수도 있습니다.
                        </div>
                      )}
                      <div className="grid gap-4 xl:grid-cols-[0.5fr_1.5fr]">
                        <div>
                          <div className="text-sm font-medium text-white">
                            Sequence Snapshot
                          </div>
                          <div className="mt-4 grid gap-3">
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="text-xs text-white/45">
                                Target Email
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {sequence.resolvedEmail ?? "이메일 필요"}
                              </div>
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-white/45">
                                  Stage Marks
                                </div>
                                <div className="text-sm text-white">
                                  {stageBadge.label}
                                </div>
                              </div>
                              <div className="mt-3">
                                <AtsSequenceStageMarks
                                  outreach={sequence.outreach}
                                />
                              </div>
                              <div className="mt-3 text-sm text-white/60">
                                {sequence.isCompleted
                                  ? "4-step 시퀀스가 모두 완료되었습니다."
                                  : !sequence.resolvedEmail
                                    ? `다음 step ${sequence.nextStep ?? 1}은 이메일 확인 후 진행할 수 있습니다.`
                                    : sequence.outreach?.sequenceStatus ===
                                        "paused"
                                      ? `다음 step ${sequence.nextStep ?? 1}이 중단된 상태입니다.`
                                      : `다음 액션은 step ${sequence.nextStep ?? 1} 발송입니다.`}
                              </div>
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="text-xs text-white/45">
                                마지막 발송
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(sequence.outreach?.lastSentAt)}
                              </div>
                              <div className="text-xs text-white/45">
                                Next Due
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(sequence.outreach?.nextDueAt)}
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
                                sequence.scheduleDraft.find(
                                  (item) => item.stepNumber === stepNumber
                                ) ?? createDefaultAtsSequenceSchedule()[index];
                              const sentMessage =
                                sequence.sentMessageByNumber.get(stepNumber) ??
                                null;
                              const draftMessage =
                                sequence.draftMessageByNumber.get(stepNumber) ??
                                null;
                              const stepDraft =
                                sequence.drafts[stepNumber] ?? {
                                  body: "",
                                  subject: "",
                                };
                              const savedStepDraft =
                                sequence.savedDrafts[stepNumber] ?? {
                                  body: "",
                                  subject: "",
                                };
                              const isDraftDirty =
                                stepDraft.subject !== savedStepDraft.subject ||
                                stepDraft.body !== savedStepDraft.body;
                              const isReadyStep =
                                sequence.nextStep === stepNumber;
                              const canSend =
                                Boolean(sequence.resolvedEmail) &&
                                Boolean(draftMessage) &&
                                !sentMessage &&
                                sequence.outreach?.sequenceStatus !== "paused" &&
                                !saveWorkspacePending &&
                                !sequence.isCompleted &&
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
                                : sequence.outreach?.sequenceStatus ===
                                        "paused" && isReadyStep
                                  ? {
                                      className:
                                        "border-amber-400/20 bg-amber-400/10 text-amber-100",
                                      text: "Paused",
                                    }
                                  : !sequence.resolvedEmail &&
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
                                  buttonPrimaryClassName={
                                    buttonPrimaryClassName
                                  }
                                  buttonSecondaryClassName={
                                    buttonSecondaryClassName
                                  }
                                  canSend={canSend}
                                  draft={stepDraft}
                                  inputClassName={inputClassName}
                                  isDraftDirty={isDraftDirty}
                                  isEditing={sequence.expandedStep === stepNumber}
                                  isSent={Boolean(sentMessage)}
                                  label={label}
                                  message={sentMessage ?? draftMessage}
                                  onDraftChange={(patch) =>
                                    sequence.onUpdateDraft(stepNumber, patch)
                                  }
                                  onResetDraft={() =>
                                    sequence.onResetDraft(stepNumber)
                                  }
                                  onSaveDraft={() => {
                                    void sequence.onSaveDraft(stepNumber);
                                  }}
                                  onSaveSchedule={() => {
                                    void sequence.onSaveSchedule();
                                  }}
                                  onScheduleChange={(patch) =>
                                    sequence.onScheduleChange(stepNumber, patch)
                                  }
                                  onSend={() => {
                                    void sequence.onSendStep(stepNumber);
                                  }}
                                  onToggleEdit={() =>
                                    sequence.onToggleEdit(stepNumber)
                                  }
                                  saveDraftPending={
                                    sequence.saveDraftPendingStep === stepNumber
                                  }
                                  saveSchedulePending={
                                    sequence.saveSchedulePending
                                  }
                                  schedule={stepSchedule}
                                  sendPending={
                                    sequence.sendPendingStep === stepNumber
                                  }
                                  stepNumber={stepNumber}
                                  textareaClassName={textareaClassName}
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
                          {sequence.messages.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                              아직 생성되거나 발송된 메일이 없습니다.
                            </div>
                          )}
                          {sequence.messages.map((message) => (
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
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="flex flex-col gap-2">
                          <div className="text-sm font-medium text-white">
                            예약 발송
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                              type="datetime-local"
                              value={contact.scheduledAt}
                              onChange={(event) =>
                                contact.onScheduledAtChange(event.target.value)
                              }
                              className={inputClassName}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                void contact.onSchedule();
                              }}
                              disabled={
                                !contact.manualEmail.trim() ||
                                !contact.draft.subject.trim() ||
                                !contact.draft.body.trim() ||
                                !contact.scheduledAt ||
                                contact.schedulePending
                              }
                              className={buttonSecondaryClassName}
                            >
                              {contact.schedulePending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Clock3 className="h-4 w-4" />
                              )}
                              예약 저장
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void contact.onGenerate();
                            }}
                            disabled={
                              contact.generatePending || saveWorkspacePending
                            }
                            className="inline-flex items-center justify-center gap-2 rounded-sm bg-accenta1 px-3 py-2 text-sm text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {contact.generatePending || saveWorkspacePending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                            메일 내용 자동 작성
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void contact.onSend();
                            }}
                            disabled={
                              !contact.manualEmail.trim() ||
                              !contact.draft.subject.trim() ||
                              !contact.draft.body.trim() ||
                              contact.sendPending ||
                              contact.schedulePending
                            }
                            className={buttonPrimaryClassName}
                          >
                            {contact.sendPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            메일 발송
                          </button>
                        </div>
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div>
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
                                  value={contact.manualEmail}
                                  onChange={(event) =>
                                    contact.onManualEmailChange(
                                      event.target.value
                                    )
                                  }
                                  placeholder="candidate@email.com"
                                  className={inputClassName}
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    void contact.onSaveManualEmail();
                                  }}
                                  disabled={contact.saveManualEmailPending}
                                  className={buttonSecondaryClassName}
                                >
                                  {contact.saveManualEmailPending ? (
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
                                value={contact.draft.subject}
                                onChange={(event) =>
                                  contact.onDraftChange({
                                    subject: event.target.value,
                                  })
                                }
                                placeholder="메일 제목"
                                className={inputClassName}
                              />
                            </div>

                            <div>
                              <div className="mb-2 text-xs text-white/45">
                                Body
                              </div>
                              <AtsEmailBodyEditor
                                value={contact.draft.body}
                                onChange={(body) =>
                                  contact.onDraftChange({ body })
                                }
                                rows={15}
                                placeholder="후보자에게 보낼 메일 내용을 작성하세요."
                                textareaClassName={textareaClassName}
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
                                  {contact.senderEmail || contact.userEmail || "-"}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-14 text-black/45">To</div>
                                <div className="flex-1 break-all">
                                  {contact.manualEmail || "-"}
                                </div>
                              </div>
                              <div className="flex items-start gap-3">
                                <div className="w-14 text-black/45">Subject</div>
                                <div className="flex-1 font-medium">
                                  {contact.previewSubject ||
                                    "제목을 입력하면 여기에 표시됩니다."}
                                </div>
                              </div>
                            </div>
                            <div className="mt-4">
                              <AtsEmailBodyContent
                                body={contact.previewBody}
                                emptyMessage="본문을 입력하면 여기에 실제 발송 기준 미리보기가 표시됩니다."
                                tone="light"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-white/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-white">
                            Scheduled Emails
                          </div>
                          <div className="text-xs text-white/45">
                            {contact.scheduledMessages.length}개 예약됨
                          </div>
                        </div>
                        <div className="mt-4 space-y-3">
                          {contact.scheduledMessages.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                              아직 예약된 메일이 없습니다.
                            </div>
                          )}
                          {contact.scheduledMessages.map((message) => (
                            <div
                              key={message.id}
                              className="rounded-md border border-white/10 bg-black/10 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-xs text-sky-100">
                                      Scheduled
                                    </span>
                                    {message.toEmail && (
                                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/45">
                                        {message.toEmail}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2 text-sm font-medium text-white">
                                    {message.subject}
                                  </div>
                                  <div className="mt-1 text-xs text-white/45">
                                    {formatDateTime(message.scheduledFor)}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void contact.onCancelScheduled(message.id);
                                  }}
                                  disabled={
                                    contact.cancelScheduledPendingMessageId ===
                                    message.id
                                  }
                                  className="inline-flex items-center gap-2 rounded-sm border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {contact.cancelScheduledPendingMessageId ===
                                  message.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                  예약 취소
                                </button>
                              </div>
                              <div className="mt-3">
                                <AtsEmailBodyContent
                                  body={message.body}
                                  tone="dark"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-md border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-medium text-white">
                          Email History
                        </div>
                        <div className="mt-4 space-y-3">
                          {contact.emailHistory.length === 0 && (
                            <div className="rounded-md border border-dashed border-white/10 px-4 py-4 text-sm text-white/50">
                              아직 발송된 메일이 없습니다.
                            </div>
                          )}
                          {contact.emailHistory.map((message) => (
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
                    <div className="min-h-[820px]">{profileContent}</div>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
