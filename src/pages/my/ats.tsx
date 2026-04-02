import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import {
  AlertCircle,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Mail,
  PauseCircle,
  PlayCircle,
  Search,
  Send,
  Sparkles,
  Target,
  UserSquare2,
} from "lucide-react";
import AppLayout from "@/components/layout/app";
import AtsSequenceMarkButton from "@/components/ui/AtsSequenceMarkButton";
import { showToast } from "@/components/toast/toast";
import {
  useAtsCandidateDetail,
  useAtsWorkspace,
  useDiscoverAtsEmail,
  useGenerateAtsSequence,
  useSaveAtsWorkspace,
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
  replaceTemplateVariables,
  type AtsCandidateSummary,
  type AtsMessageRecord,
  type AtsOutreachRecord,
  type AtsWorkspaceRecord,
} from "@/lib/ats/shared";
import { isInternalEmail } from "@/lib/internalAccess";
import { useCandidateDetail } from "@/hooks/useCandidateDetail";
import { useAuthStore } from "@/store/useAuthStore";

const PANEL_CLASS = "rounded-md border border-white/5 bg-white/5";
const BUTTON_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-sm bg-white px-3 py-2 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40";
const BUTTON_SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40";
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
  table: "min-w-[1180px] w-full table-fixed border-collapse",
  widths: {
    candidate: "w-[300px]",
    current: "w-[220px]",
    email: "w-[180px]",
    progress: "w-[180px]",
    schedule: "w-[180px]",
    select: "w-[36px]",
    sequenceMark: "w-[124px]",
  },
} as const;

type FilterKey =
  | "all"
  | "needs_email"
  | "ready"
  | "active"
  | "paused"
  | "completed";

type MainPanelTab = "candidate" | "sequence" | "profile";

const EMPTY_CANDIDATES: AtsCandidateSummary[] = [];

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDueToday(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getTime() <= Date.now();
}

function resolveTargetEmail(candidate: AtsCandidateSummary) {
  if (candidate.outreach?.targetEmail) return candidate.outreach.targetEmail;
  return candidate.existingEmailSources[0]?.email ?? null;
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
      label: "Email ready",
    };
  }

  if (candidate.outreach?.emailDiscoveryStatus === "searching") {
    return {
      className: "border-sky-400/20 bg-sky-400/10 text-sky-100",
      label: "Searching",
    };
  }

  if (
    candidate.outreach?.emailDiscoveryStatus === "not_found" ||
    candidate.outreach?.emailDiscoveryStatus === "error"
  ) {
    return {
      className: "border-rose-400/20 bg-rose-400/10 text-rose-100",
      label: "Needs review",
    };
  }

  return {
    className: "border-white/10 bg-white/5 text-white/70",
    label: "Email missing",
  };
}

function matchesFilter(candidate: AtsCandidateSummary, filter: FilterKey) {
  const hasEmail = Boolean(resolveTargetEmail(candidate));
  const outreach = candidate.outreach;

  if (filter === "all") return true;
  if (filter === "needs_email") return !hasEmail;
  if (filter === "paused") return outreach?.sequenceStatus === "paused";
  if (filter === "completed") return outreach?.sequenceStatus === "completed";
  if (filter === "active") {
    return Boolean(
      outreach &&
      outreach.sequenceStatus === "active" &&
      outreach.activeStep > 0 &&
      outreach.activeStep < ATS_SEQUENCE_STEP_COUNT
    );
  }
  if (filter === "ready") {
    return hasEmail && (outreach?.sequenceStatus ?? "draft") !== "completed";
  }

  return true;
}

function getPreviewCandidate(
  candidates: AtsCandidateSummary[],
  selectedIds: string[],
  activeCandidate: AtsCandidateSummary | null
) {
  if (selectedIds.length === 0) {
    return activeCandidate;
  }
  if (activeCandidate && selectedIds.includes(activeCandidate.id)) {
    return activeCandidate;
  }
  return (
    candidates.find((candidate) => selectedIds.includes(candidate.id)) ?? null
  );
}

function copyVariableToClipboard(label: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(label);
  }
  return Promise.reject(new Error("Clipboard unavailable"));
}

function normalizeWorkspaceRecord(
  workspace: Partial<AtsWorkspaceRecord> | null | undefined
) {
  return {
    companyPitch: String(workspace?.companyPitch ?? "").trim(),
    jobDescription: String(workspace?.jobDescription ?? "").trim(),
    senderEmail: String(workspace?.senderEmail ?? "").trim(),
    signature: String(workspace?.signature ?? "").trim(),
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

function SequenceStepCard({
  canSend,
  label,
  message,
  onSend,
  sendPending,
  stepNumber,
  subtitle,
}: {
  canSend: boolean;
  label: { className: string; text: string };
  message: AtsMessageRecord | null;
  onSend: () => void;
  sendPending: boolean;
  stepNumber: number;
  subtitle: string;
}) {
  return (
    <div className={`${PANEL_CLASS} p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-white">
            Step {stepNumber}
          </div>
          <div className="mt-1 text-xs text-white/50">{subtitle}</div>
        </div>
        <span
          className={`rounded-md border px-2 py-1 text-xs ${label.className}`}
        >
          {label.text}
        </span>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs text-white/40">Subject</div>
          <div className="mt-1 text-sm text-white/85">
            {message?.renderedSubject ?? message?.subject ?? "Draft pending"}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/40">Body</div>
          <div className="mt-1 line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-white/70">
            {message?.renderedBody ??
              message?.body ??
              "아직 생성되지 않았습니다."}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-white/50">
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
  const isInternal = isInternalEmail(user?.email);

  const workspaceQuery = useAtsWorkspace(isInternal);
  const saveWorkspace = useSaveAtsWorkspace();
  const discoverEmail = useDiscoverAtsEmail();
  const saveManualEmail = useSetManualAtsEmail();
  const generateSequence = useGenerateAtsSequence();
  const updateSequenceStatus = useUpdateAtsSequenceStatus();
  const sendSequenceStep = useSendAtsSequenceStep();
  const sendBulkMail = useSendAtsBulkMail();

  const rawCandidates = workspaceQuery.data?.candidates;
  const candidates = useMemo(
    () => rawCandidates ?? EMPTY_CANDIDATES,
    [rawCandidates]
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
    companyPitch: "",
    jobDescription: "",
    senderEmail: "",
    signature: "",
  });
  const [manualEmail, setManualEmail] = useState("");
  const [bulkSubject, setBulkSubject] = useState("");
  const [bulkBody, setBulkBody] = useState("");

  useEffect(() => {
    if (!workspaceQuery.data?.workspace) return;
    setWorkspaceDraft(workspaceQuery.data.workspace);
  }, [workspaceQuery.data?.workspace]);

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
  const activeCandidateSummary = useMemo(
    () =>
      candidates.find((candidate) => candidate.id === selectedCandidateId) ??
      null,
    [candidates, selectedCandidateId]
  );
  const detailCandidate = detailQuery.data?.candidate ?? null;
  const activeCandidate =
    (detailCandidate as AtsCandidateSummary | null) ?? activeCandidateSummary;
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
      savedWorkspace.companyPitch !== draftWorkspace.companyPitch ||
      savedWorkspace.jobDescription !== draftWorkspace.jobDescription ||
      savedWorkspace.senderEmail !== draftWorkspace.senderEmail ||
      savedWorkspace.signature !== draftWorkspace.signature
    );
  }, [workspaceDraft, workspaceQuery.data?.workspace]);

  const ensureWorkspaceSaved = async () => {
    if (!hasUnsavedWorkspaceChanges) return;
    await saveWorkspace.mutateAsync(workspaceDraft);
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

  const handleDiscoverEmail = async () => {
    if (!selectedCandidateId) return;
    try {
      await discoverEmail.mutateAsync(selectedCandidateId);
      showToast({ message: "이메일 탐색을 완료했습니다.", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "이메일 탐색에 실패했습니다.",
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

  const handleGenerateSequence = async () => {
    if (!selectedCandidateId) return;
    try {
      await ensureWorkspaceSaved();
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
              ATS 화면은 `matchharper.com` 계정으로 로그인했을 때만 접근할 수
              있습니다.
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
                <div className="text-lg font-medium text-white">
                  ATS Workspace
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
            <div className={`${PANEL_CLASS} p-4`}>
              <div className="text-sm text-white/55">Email Ready</div>
              <div className="mt-2 text-lg font-medium text-white">
                {stats.emailReadyCount}
              </div>
            </div>
            <div className={`${PANEL_CLASS} p-4`}>
              <div className="text-sm text-white/55">Due Today</div>
              <div className="mt-2 text-lg font-medium text-white">
                {stats.dueTodayCount}
              </div>
            </div>
            <div className={`${PANEL_CLASS} p-4`}>
              <div className="text-sm text-white/55">Paused</div>
              <div className="mt-2 text-lg font-medium text-white">
                {stats.pausedCount}
              </div>
            </div>
            <div className={`${PANEL_CLASS} p-4`}>
              <div className="text-sm text-white/55">Completed</div>
              <div className="mt-2 text-lg font-medium text-white">
                {stats.completedCount}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className={`${PANEL_CLASS} overflow-hidden`}>
              <div className="border-b border-white/10 px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">
                      Candidates
                    </div>
                    <div className="mt-1 text-xs text-white/50">
                      Default shortlist · {workspaceQuery.data?.totalCount ?? 0}
                      명
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={filteredCandidates.length === 0}
                    className={BUTTON_SECONDARY}
                  >
                    {allVisibleSelected ? "선택 해제" : "전체 선택"}
                  </button>
                </div>
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
                          Seq Mark
                        </th>
                        <th
                          className={`${ATS_TABLE_LAYOUT.widths.current} ${ATS_TABLE_LAYOUT.headerCell}`}
                        >
                          Current
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
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((candidate) => {
                        const emailBadge = getEmailBadge(candidate);
                        const stageBadge = getStageBadge(candidate.outreach);

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
                                  <div
                                    className={`mt-1 line-clamp-2 text-xs leading-5 text-white/55 ${ATS_TABLE_LAYOUT.candidateHeadline}`}
                                  >
                                    {candidate.headline ?? "headline 없음"}
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
                              <div className="flex items-start gap-3">
                                {candidate.currentCompanyLogo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={candidate.currentCompanyLogo}
                                    alt={candidate.currentCompany ?? "company"}
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
                                  <div className="text-sm text-white/75">
                                    {candidate.currentCompany ?? "-"}
                                  </div>
                                  <div className="mt-1 text-xs text-white/45">
                                    {candidate.currentRole ?? "-"}
                                  </div>
                                </div>
                              </div>
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
                            <td className={ATS_TABLE_LAYOUT.bodyCell}>
                              <div className="text-xs text-white/45">
                                Next due
                              </div>
                              <div className="mt-1 text-sm text-white/70">
                                {formatDateTime(candidate.outreach?.nextDueAt)}
                              </div>
                              <div className="mt-2 text-xs text-white/45">
                                Last sent
                              </div>
                              <div className="mt-1 text-sm text-white/70">
                                {formatDateTime(candidate.outreach?.lastSentAt)}
                              </div>
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
                          disabled={discoverEmail.isPending}
                          className="inline-flex items-center justify-center gap-2 rounded-sm bg-accenta1 px-3 py-2 text-sm text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {discoverEmail.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          Find Email
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
                        ] as Array<[MainPanelTab, string]>
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setMainPanelTab(value)}
                          className={`rounded-md border px-3 py-1.5 text-sm transition ${
                            mainPanelTab === value
                              ? "border-accenta1/40 bg-accenta1 text-black"
                              : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"
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
                          <div className="rounded-md bg-white/5 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-medium text-white">
                                Email Discovery
                              </div>
                              {detailCandidate?.outreach
                                ?.emailDiscoverySummary && (
                                <div className="text-xs text-white/50">
                                  {
                                    detailCandidate.outreach
                                      .emailDiscoverySummary
                                  }
                                </div>
                              )}
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

                          <div className="rounded-md bg-white/5 p-4">
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
                                        className="mt-3 inline-flex items-center gap-1 text-xs text-white/60 transition hover:text-white"
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

                          {(
                            detailCandidate?.outreach?.emailDiscoveryTrace ?? []
                          ).length > 0 && (
                            <div className="rounded-md border border-white/10 bg-white/5 p-4">
                              <div className="text-sm font-medium text-white">
                                Agent Trace
                              </div>
                              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto">
                                {detailCandidate?.outreach?.emailDiscoveryTrace.map(
                                  (trace, index) => (
                                    <div
                                      key={`${trace.at}-${index}`}
                                      className="rounded-md border border-white/10 bg-black/10 px-3 py-2"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-xs uppercase tracking-[0.18em] text-white/35">
                                          {trace.kind}
                                        </span>
                                        <span className="text-xs text-white/35">
                                          {formatDateTime(trace.at)}
                                        </span>
                                      </div>
                                      <div className="mt-2 text-sm text-white/65">
                                        {trace.content}
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {mainPanelTab === "sequence" && (
                    <div className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                        <div className="rounded-md border border-white/10 bg-white/5 p-4">
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
                                Next Due
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(
                                  detailCandidate?.outreach?.nextDueAt
                                )}
                              </div>
                            </div>
                            <div className="rounded-md border border-white/10 bg-black/10 p-3">
                              <div className="text-xs text-white/45">
                                Last Sent
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatDateTime(
                                  detailCandidate?.outreach?.lastSentAt
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                          {Array.from(
                            { length: ATS_SEQUENCE_STEP_COUNT },
                            (_, index) => {
                              const stepNumber = index + 1;
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
                                  onSend={() =>
                                    handleSendSequenceStep(stepNumber)
                                  }
                                  sendPending={
                                    sendSequenceStep.isPending &&
                                    sendSequenceStep.variables?.stepNumber ===
                                      stepNumber
                                  }
                                  stepNumber={stepNumber}
                                  subtitle={`Follow-up interval ${stepNumber === 1 ? "start" : `${stepNumber - 1} + 2d`}`}
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
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
                                {message.renderedBody ?? message.body}
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
                  <textarea
                    value={bulkBody}
                    onChange={(event) => setBulkBody(event.target.value)}
                    rows={10}
                    placeholder="예: {{first_name}}님 안녕하세요..."
                    className={TEXTAREA_CLASS}
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
                    <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/60">
                      {previewBody || "미리보기를 위해 본문을 입력해 주세요."}
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
