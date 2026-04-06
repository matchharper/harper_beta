import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useCreateOpsNetworkInternalEntry,
  useDeleteOpsNetworkInternalEntry,
  useIngestOpsNetworkLead,
  useOpsNetworkDetail,
  useOpsNetworkLeads,
  useSendOpsNetworkMail,
  useUpdateOpsNetworkInternalEntry,
} from "@/hooks/useOpsNetwork";
import type { NetworkLeadSummary, TalentInternalEntry } from "@/lib/opsNetwork";
import { INTERNAL_EMAIL_DOMAIN } from "@/lib/internalAccess";
import {
  getTalentCareerMoveIntentLabel,
  getTalentEngagementLabels,
  getTalentLocationLabels,
} from "@/lib/talentNetworkApplication";
import { showToast } from "@/components/toast/toast";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FileUp,
  GraduationCap,
  LoaderCircle,
  Mail,
  MessageSquareText,
  NotebookPen,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Head from "next/head";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type DetailTab = "internal" | "profile" | "waitlist";

const FETCH_LIMIT = 40;

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "profile", label: "구조화 프로필" },
  { id: "waitlist", label: "원본 제출 정보" },
  { id: "internal", label: "내부 활동" },
];

const formatKst = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const daysAgo = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
};

const copyToClipboard = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
};

const escapeCsvCell = (value: string | null | undefined) => {
  const safe = String(value ?? "");
  if (!/[",\n]/.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
};

function formatEntryType(type: TalentInternalEntry["type"]) {
  if (type === "mail") return "메일";
  if (type === "memo") return "메모";
  return "대화";
}

function isEditableEntryType(
  type: TalentInternalEntry["type"]
): type is "conversation" | "memo" {
  return type === "conversation" || type === "memo";
}

const Badge = ({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "inverse" | "strong";
}) => (
  <span
    className={
      tone === "strong"
        ? opsTheme.badgeStrong
        : tone === "inverse"
          ? opsTheme.badgeInverse
          : opsTheme.badge
    }
  >
    {children}
  </span>
);

function getProfileLinkChipLabel(raw: string) {
  const normalized = String(raw ?? "").trim();
  const lower = normalized.toLowerCase();

  if (lower.includes("linkedin.com")) return "LinkedIn";
  if (lower.includes("github.com")) return "GitHub";
  if (lower.includes("scholar.google.")) return "Scholar";

  try {
    const url = new URL(
      normalized.startsWith("http://") || normalized.startsWith("https://")
        ? normalized
        : `https://${normalized}`
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return normalized;
  }
}

function formatTalentInsightLabel(key: string) {
  if (key === "technical_strengths") return "기술적 강점";
  if (key === "desired_teams") return "원하는 팀";
  return key.replace(/_/g, " ");
}

function ProfileChip({
  children,
  href,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const className =
    "inline-flex items-center gap-2 rounded-md bg-beige500/70 px-3 py-2 font-geist text-sm text-beige900 shadow-[inset_0_1px_0_rgba(255,255,255,0.76)] transition hover:bg-beige500/90";

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    );
  }

  return <div className={className}>{children}</div>;
}

const StatCard = ({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) => (
  <div className={cx(opsTheme.panelSoft, "px-4 py-4")}>
    <div className={opsTheme.eyebrow}>{label}</div>
    <div className="mt-3 font-halant text-[2.1rem] leading-none tracking-[-0.07em] text-beige900">
      {value}
    </div>
    <div className="mt-2 font-geist text-sm text-beige900/60">{hint}</div>
  </div>
);

const InfoRow = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="grid gap-2 py-3 sm:grid-cols-[160px_1fr] sm:gap-4">
    <div className={opsTheme.eyebrow}>{label}</div>
    <div className="font-geist text-sm leading-6 text-beige900">{value}</div>
  </div>
);

const TabButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      "rounded-md px-3 py-2 font-geist text-sm transition",
      active
        ? "bg-beige900 text-beige100"
        : "bg-white/60 text-beige900 hover:bg-white/80"
    )}
  >
    {label}
  </button>
);

function ActivityEntryCard({
  deletePending,
  editPending,
  editingValue,
  entry,
  isEditing,
  onDelete,
  onEditCancel,
  onEditChange,
  onEditSave,
  onEditStart,
}: {
  deletePending: boolean;
  editPending: boolean;
  editingValue: string;
  entry: TalentInternalEntry;
  isEditing: boolean;
  onDelete: (entry: TalentInternalEntry) => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: (entry: TalentInternalEntry) => void;
  onEditStart: (entry: TalentInternalEntry) => void;
}) {
  const editable = isEditableEntryType(entry.type);

  return (
    <div className={cx(opsTheme.panelSoft, "px-4 py-4")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={entry.type === "mail" ? "strong" : "default"}>
            {formatEntryType(entry.type)}
          </Badge>
          <span className="font-geist text-xs text-beige900/55">
            {formatKst(entry.created_at)}
          </span>
        </div>

        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onEditCancel}
                  disabled={editPending}
                  className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
                >
                  <X className="h-3.5 w-3.5" />
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => onEditSave(entry)}
                  disabled={editPending || !editingValue.trim()}
                  className={cx(opsTheme.buttonSoft, "h-8 px-3 text-xs")}
                >
                  {editPending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  저장
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onEditStart(entry)}
                  disabled={deletePending}
                  className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry)}
                  disabled={deletePending}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-[#F7DBD3] px-3 font-geist text-xs font-medium text-[#8A2E1D] transition hover:bg-[#f2c9be] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletePending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  삭제
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 font-geist text-sm text-beige900/70">
        <div>작성자: {entry.created_by}</div>
        {entry.type === "mail" && entry.subject ? (
          <div>제목: {entry.subject}</div>
        ) : null}
        {entry.type === "mail" && entry.from_email ? (
          <div>보낸 사람: {entry.from_email}</div>
        ) : null}
        {entry.type === "mail" && entry.to_email ? (
          <div>받는 사람: {entry.to_email}</div>
        ) : null}
      </div>

      {isEditing ? (
        <textarea
          value={editingValue}
          onChange={(event) => onEditChange(event.target.value)}
          className={cx(opsTheme.textarea, "mt-4 min-h-[140px]")}
          placeholder="내용을 수정하세요."
        />
      ) : (
        <div className="mt-4 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
          {entry.content}
        </div>
      )}
    </div>
  );
}

function StructuredSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-beige500/70 p-2 text-beige900">
          <Icon className="h-4 w-4" />
        </div>
        <div className="font-geist text-sm font-semibold text-beige900">
          {title}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function NetworkOpsPage() {
  const { user } = useAuthStore();

  const leadsQuery = useOpsNetworkLeads(FETCH_LIMIT);
  const ingestMutation = useIngestOpsNetworkLead();
  const internalMutation = useCreateOpsNetworkInternalEntry();
  const updateInternalMutation = useUpdateOpsNetworkInternalEntry();
  const deleteInternalMutation = useDeleteOpsNetworkInternalEntry();
  const mailMutation = useSendOpsNetworkMail();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [moveFilter, setMoveFilter] = useState("all");
  const [cvOnly, setCvOnly] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [mailFromEmail, setMailFromEmail] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailContent, setMailContent] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [conversationContent, setConversationContent] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingEntryContent, setEditingEntryContent] = useState("");
  const [isOpeningCv, setIsOpeningCv] = useState<number | null>(null);

  const detailQuery = useOpsNetworkDetail(selectedLeadId);

  const leadPages = leadsQuery.data?.pages;
  const lastPage = leadPages?.[leadPages.length - 1] ?? null;
  const allLeads = useMemo(
    () => (leadPages ?? []).flatMap((page) => page.leads),
    [leadPages]
  );

  useEffect(() => {
    if (user?.email && !mailFromEmail) {
      setMailFromEmail(user.email);
    }
  }, [mailFromEmail, user?.email]);

  useEffect(() => {
    if (allLeads.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!allLeads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(allLeads[0].id);
    }
  }, [allLeads, selectedLeadId]);

  const roleOptions = useMemo(() => {
    return Array.from(
      new Set(
        allLeads
          .map((lead) => lead.selectedRole)
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [allLeads]);

  const moveOptions = useMemo(() => {
    return Array.from(
      new Set(
        allLeads
          .map(
            (lead) =>
              lead.careerMoveIntentLabel ?? lead.careerMoveIntent ?? "미입력"
          )
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [allLeads]);

  const filteredLeads = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return allLeads.filter((lead) => {
      if (cvOnly && !lead.hasCv) return false;
      if (roleFilter !== "all" && lead.selectedRole !== roleFilter)
        return false;

      const moveValue =
        lead.careerMoveIntentLabel ?? lead.careerMoveIntent ?? "미입력";
      if (moveFilter !== "all" && moveValue !== moveFilter) return false;

      if (!needle) return true;

      const haystack = [
        lead.name,
        lead.email,
        lead.selectedRole,
        lead.linkedinProfileUrl,
        lead.githubProfileUrl,
        lead.scholarProfileUrl,
        lead.primaryProfileUrl,
        lead.impactSummary,
        lead.dreamTeams,
        lead.careerMoveIntentLabel,
        lead.careerMoveIntent,
        lead.engagementTypes.join(" "),
        lead.preferredLocations.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [allLeads, cvOnly, moveFilter, query, roleFilter]);

  useEffect(() => {
    if (filteredLeads.length === 0) {
      setSelectedLeadId(null);
      return;
    }

    if (!filteredLeads.some((lead) => lead.id === selectedLeadId)) {
      setSelectedLeadId(filteredLeads[0].id);
    }
  }, [filteredLeads, selectedLeadId]);

  useEffect(() => {
    setMemoContent("");
    setConversationContent("");
    setMailSubject("");
    setMailContent("");
    setEditingEntryId(null);
    setEditingEntryContent("");
  }, [selectedLeadId]);

  const selectedLead = useMemo(
    () => filteredLeads.find((lead) => lead.id === selectedLeadId) ?? null,
    [filteredLeads, selectedLeadId]
  );

  const detail = detailQuery.data;
  const displayedLead = detail?.lead ?? selectedLead;

  const stats = useMemo(() => {
    const readyNowCount = allLeads.filter(
      (lead) => lead.careerMoveIntent === "ready_to_move"
    ).length;
    const withCvCount = allLeads.filter((lead) => lead.hasCv).length;
    const recentCount = allLeads.filter((lead) => {
      const diff = daysAgo(lead.submittedAt);
      return diff !== null && diff <= 7;
    }).length;

    return {
      readyNowCount,
      recentCount,
      totalCount: lastPage?.totalCount ?? allLeads.length,
      withCvCount,
    };
  }, [allLeads, lastPage?.totalCount]);

  const listError =
    leadsQuery.error instanceof Error ? leadsQuery.error.message : null;
  const detailError =
    detailQuery.error instanceof Error ? detailQuery.error.message : null;

  const handleCopy = useCallback(async (value: string, label: string) => {
    try {
      await copyToClipboard(value);
      showToast({ message: `${label} 복사됨`, variant: "white" });
    } catch {
      showToast({ message: `${label} 복사 실패`, variant: "error" });
    }
  }, []);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  }, []);

  const handleOpenCv = useCallback(
    async (lead: NetworkLeadSummary) => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        showToast({
          message: "세션이 없습니다. 다시 로그인해 주세요.",
          variant: "error",
        });
        return;
      }

      setIsOpeningCv(lead.id);

      try {
        const response = await fetch(`/api/internal/network/cv?id=${lead.id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          url?: string;
        };

        if (!response.ok || !payload.url) {
          throw new Error(
            payload.error ?? "이력서 링크를 생성하지 못했습니다."
          );
        }

        window.open(payload.url, "_blank", "noopener,noreferrer");
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "이력서 링크를 열지 못했습니다.",
          variant: "error",
        });
      } finally {
        setIsOpeningCv(null);
      }
    },
    [getAccessToken]
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      leadsQuery.refetch(),
      selectedLeadId ? detailQuery.refetch() : Promise.resolve(),
    ]);
  }, [detailQuery, leadsQuery, selectedLeadId]);

  const handleExportCsv = useCallback(() => {
    const header = [
      "submitted_at",
      "name",
      "email",
      "selected_role",
      "career_move_intent",
      "engagement_types",
      "preferred_locations",
      "linkedin",
      "github",
      "scholar",
      "has_cv",
      "cv_file_name",
      "impact_summary",
      "dream_teams",
      "local_id",
      "talent_id",
      "has_structured_profile",
    ];

    const rows = filteredLeads.map((lead) => [
      lead.submittedAt,
      lead.name,
      lead.email,
      lead.selectedRole,
      lead.careerMoveIntentLabel ?? lead.careerMoveIntent,
      lead.engagementTypes.join(" | "),
      lead.preferredLocations.join(" | "),
      lead.linkedinProfileUrl,
      lead.githubProfileUrl,
      lead.scholarProfileUrl,
      lead.hasCv ? "yes" : "no",
      lead.cvFileName,
      lead.impactSummary,
      lead.dreamTeams,
      lead.localId,
      lead.talentId,
      lead.hasStructuredProfile ? "yes" : "no",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `network-candidates-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [filteredLeads]);

  const handleIngest = useCallback(async () => {
    if (!displayedLead) return;

    try {
      await ingestMutation.mutateAsync(displayedLead.id);
      showToast({
        message: "후보자 정보 추출이 완료되었습니다.",
        variant: "white",
      });
      setDetailTab("profile");
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "후보자 정보 추출에 실패했습니다.",
        variant: "error",
      });
    }
  }, [displayedLead, ingestMutation]);

  const handleSaveInternal = useCallback(
    async (type: "conversation" | "memo") => {
      if (!selectedLeadId) return;

      const content =
        type === "memo" ? memoContent.trim() : conversationContent.trim();
      if (!content) return;

      try {
        await internalMutation.mutateAsync({
          content,
          id: selectedLeadId,
          type,
        });

        if (type === "memo") {
          setMemoContent("");
        } else {
          setConversationContent("");
        }

        showToast({
          message: type === "memo" ? "메모 저장 완료" : "대화 기록 저장 완료",
          variant: "white",
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "내부 활동 저장에 실패했습니다.",
          variant: "error",
        });
      }
    },
    [conversationContent, internalMutation, memoContent, selectedLeadId]
  );

  const handleSendMail = useCallback(async () => {
    if (!selectedLeadId) return;

    try {
      await mailMutation.mutateAsync({
        content: mailContent.trim(),
        fromEmail: mailFromEmail.trim(),
        id: selectedLeadId,
        subject: mailSubject.trim(),
      });
      setMailSubject("");
      setMailContent("");
      showToast({ message: "메일 발송 완료", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메일 발송에 실패했습니다.",
        variant: "error",
      });
    }
  }, [mailContent, mailFromEmail, mailMutation, mailSubject, selectedLeadId]);

  const handleStartEditingEntry = useCallback((entry: TalentInternalEntry) => {
    if (!isEditableEntryType(entry.type)) return;
    setEditingEntryId(entry.id);
    setEditingEntryContent(entry.content);
  }, []);

  const handleCancelEditingEntry = useCallback(() => {
    if (updateInternalMutation.isPending) return;
    setEditingEntryId(null);
    setEditingEntryContent("");
  }, [updateInternalMutation.isPending]);

  const handleSaveEditedEntry = useCallback(
    async (entry: TalentInternalEntry) => {
      if (!selectedLeadId || !isEditableEntryType(entry.type)) return;

      const content = editingEntryContent.trim();
      if (!content) return;

      try {
        await updateInternalMutation.mutateAsync({
          content,
          entryId: entry.id,
          leadId: selectedLeadId,
        });
        setEditingEntryId(null);
        setEditingEntryContent("");
        showToast({
          message:
            entry.type === "memo" ? "메모 수정 완료" : "대화 기록 수정 완료",
          variant: "white",
        });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "내부 활동 수정에 실패했습니다.",
          variant: "error",
        });
      }
    },
    [editingEntryContent, selectedLeadId, updateInternalMutation]
  );

  const handleDeleteEntry = useCallback(
    async (entry: TalentInternalEntry) => {
      if (!selectedLeadId || !isEditableEntryType(entry.type)) return;

      const label = entry.type === "memo" ? "메모" : "대화 기록";
      if (!window.confirm(`${label}를 삭제하시겠습니까?`)) return;

      try {
        await deleteInternalMutation.mutateAsync({
          entryId: entry.id,
          leadId: selectedLeadId,
        });
        if (editingEntryId === entry.id) {
          setEditingEntryId(null);
          setEditingEntryContent("");
        }
        showToast({ message: `${label} 삭제 완료`, variant: "white" });
      } catch (error) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : "내부 활동 삭제에 실패했습니다.",
          variant: "error",
        });
      }
    },
    [deleteInternalMutation, editingEntryId, selectedLeadId]
  );

  const resetFilters = useCallback(() => {
    setQuery("");
    setRoleFilter("all");
    setMoveFilter("all");
    setCvOnly(false);
  }, []);

  const isSelectedLeadIngesting =
    ingestMutation.isPending && ingestMutation.variables === displayedLead?.id;
  const updatingEntryId = updateInternalMutation.isPending
    ? (updateInternalMutation.variables?.entryId ?? null)
    : null;
  const deletingEntryId = deleteInternalMutation.isPending
    ? (deleteInternalMutation.variables?.entryId ?? null)
    : null;

  return (
    <>
      <Head>
        <title>Network Ops</title>
        <meta
          name="description"
          content="Internal ops dashboard for Harper Network leads"
        />
      </Head>

      <OpsShell
        title="Network Leads"
        description={
          <>
            <span className="font-medium text-beige900">harper_waitlist</span>에
            저장된 후보자 제출 데이터를 확인하고, LinkedIn 및 CV를 바탕으로
            `talent_*` 테이블 프로필을 만들 수 있는 내부 화면입니다. 현재{" "}
            {allLeads.length}건을 불러왔고 전체는{" "}
            {lastPage?.totalCount ?? allLeads.length}
            건입니다. 허용 도메인 기준은{" "}
            <span className="font-medium text-beige900">
              {INTERNAL_EMAIL_DOMAIN}
            </span>
            입니다.
          </>
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={leadsQuery.isFetching || detailQuery.isFetching}
              className={cx(opsTheme.buttonSoft, "h-10")}
            >
              <RefreshCw
                className={cx(
                  "h-4 w-4",
                  (leadsQuery.isFetching || detailQuery.isFetching) &&
                    "animate-spin"
                )}
              />
              새로고침
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className={cx(opsTheme.buttonSecondary, "h-10")}
            >
              <Download className="h-4 w-4" />
              CSV 내보내기
            </button>
          </>
        }
      >
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="전체 후보자"
            value={String(stats.totalCount)}
            hint="현재 waitlist 전체 수"
          />
          <StatCard
            label="즉시 이직 가능"
            value={String(stats.readyNowCount)}
            hint="좋은 기회면 바로 이직 가능"
          />
          <StatCard
            label="CV 업로드"
            value={String(stats.withCvCount)}
            hint="CV 또는 이력서 파일 포함"
          />
          <StatCard
            label="최근 7일"
            value={String(stats.recentCount)}
            hint="최근 7일 신규 제출"
          />
        </section>

        <section className="space-y-6">
          <div className={cx(opsTheme.panel, "p-4")}>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_180px_220px_160px_auto]">
              <label
                className={cx(
                  opsTheme.panelSoft,
                  "flex h-11 items-center gap-2 px-3"
                )}
              >
                <Search className="h-4 w-4 text-beige900/40" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="이름, 이메일, 역할, 링크, 메모 검색"
                  className="h-full w-full bg-transparent font-geist text-sm text-beige900 outline-none placeholder:text-beige900/35"
                />
              </label>

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                className={cx(opsTheme.input, "appearance-none")}
              >
                <option value="all">모든 역할</option>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>

              <select
                value={moveFilter}
                onChange={(event) => setMoveFilter(event.target.value)}
                className={cx(opsTheme.input, "appearance-none")}
              >
                <option value="all">모든 이직 의향</option>
                {moveOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <label
                className={cx(
                  opsTheme.panelSoft,
                  "flex h-11 items-center gap-2 px-3 font-geist text-sm text-beige900/70"
                )}
              >
                <input
                  type="checkbox"
                  checked={cvOnly}
                  onChange={(event) => setCvOnly(event.target.checked)}
                  className="accent-[#2E1706]"
                />
                CV만 보기
              </label>

              <button
                type="button"
                onClick={resetFilters}
                className={cx(opsTheme.buttonSoft, "h-11")}
              >
                필터 초기화
              </button>
            </div>
          </div>

          {listError ? (
            <div className={opsTheme.errorNotice}>{listError}</div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div className={cx(opsTheme.panel)}>
              <div className="flex items-center justify-between gap-3 px-4 py-4">
                <div>
                  <div className={opsTheme.eyebrow}>Candidates</div>
                  <div className="mt-1 font-geist text-sm text-beige900/70">
                    불러온 후보자 {allLeads.length}명 / 전체{" "}
                    {lastPage?.totalCount ?? allLeads.length}명
                  </div>
                </div>
                {lastPage?.hasMore && (
                  <button
                    type="button"
                    onClick={() => void leadsQuery.fetchNextPage()}
                    disabled={leadsQuery.isFetchingNextPage}
                    className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                  >
                    {leadsQuery.isFetchingNextPage ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    더 보기
                  </button>
                )}
              </div>

              <div className="max-h-[calc(100vh)] overflow-y-auto divide-y divide-beige900/10">
                {leadsQuery.isLoading && allLeads.length === 0 ? (
                  <div className="flex items-center justify-center px-4 py-12">
                    <LoaderCircle className="h-5 w-5 animate-spin text-beige900/45" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <div className="px-4 py-10 text-center font-geist text-sm text-beige900/55">
                    조건에 맞는 후보자가 없습니다.
                  </div>
                ) : (
                  filteredLeads.map((lead) => {
                    const isSelected = selectedLeadId === lead.id;
                    const submittedDaysAgo = daysAgo(lead.submittedAt);

                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedLeadId(lead.id)}
                        className={cx(
                          "w-full px-4 py-4 text-left transition",
                          isSelected
                            ? "bg-beige900 text-beige100"
                            : "hover:bg-white/55"
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-geist text-base font-semibold">
                              {lead.name ?? "이름 없음"}
                            </div>
                            <div
                              className={cx(
                                "mt-1 truncate font-geist text-sm",
                                isSelected
                                  ? "text-beige100/70"
                                  : "text-beige900/55"
                              )}
                            >
                              {lead.email ?? "이메일 없음"}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {lead.hasCv ? (
                              <Badge tone={isSelected ? "inverse" : "default"}>
                                CV
                              </Badge>
                            ) : null}
                            {lead.hasStructuredProfile ? (
                              <Badge tone={isSelected ? "inverse" : "default"}>
                                Structured
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <div
                          className={cx(
                            "mt-3 font-geist text-sm",
                            isSelected ? "text-beige100/75" : "text-beige900/70"
                          )}
                        >
                          {lead.selectedRole ?? "역할 미입력"}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {lead.careerMoveIntentLabel ? (
                            <Badge tone={isSelected ? "inverse" : "default"}>
                              {lead.careerMoveIntentLabel}
                            </Badge>
                          ) : null}
                          {lead.lastInternalActivityAt ? (
                            <Badge tone={isSelected ? "inverse" : "default"}>
                              최근 활동 있음
                            </Badge>
                          ) : null}
                        </div>

                        <div
                          className={cx(
                            "mt-3 font-geist text-xs",
                            isSelected ? "text-beige100/55" : "text-beige900/50"
                          )}
                        >
                          {formatKst(lead.submittedAt)}
                          {submittedDaysAgo !== null
                            ? ` · ${submittedDaysAgo}일 전`
                            : ""}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className={cx(opsTheme.panel, "overflow-hidden")}>
              {!displayedLead ? (
                <div className="px-6 py-10 text-center font-geist text-sm text-beige900/55">
                  왼쪽에서 후보자를 선택해 주세요.
                </div>
              ) : (
                <>
                  <div className="px-5 py-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <div className={opsTheme.eyebrow}>Candidate</div>
                        <h2 className={cx(opsTheme.titleSm, "mt-1")}>
                          {displayedLead.name ?? "이름 없음"}
                        </h2>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {displayedLead.careerMoveIntentLabel ? (
                            <Badge tone="strong">
                              {displayedLead.careerMoveIntentLabel}
                            </Badge>
                          ) : null}
                          {displayedLead.hasCv ? (
                            <Badge>CV 업로드</Badge>
                          ) : null}
                          {detail?.hasStructuredProfile ? (
                            <Badge>구조화 완료</Badge>
                          ) : null}
                          {detail?.claimedTalentId ? (
                            <Badge>후보자 계정 연결됨</Badge>
                          ) : null}
                          {displayedLead.selectedRole ? (
                            <Badge>{displayedLead.selectedRole}</Badge>
                          ) : null}
                        </div>
                        <div className="mt-3 font-geist text-sm text-beige900/65">
                          {displayedLead.email ?? "이메일 없음"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {displayedLead.email ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopy(
                                displayedLead.email ?? "",
                                "이메일"
                              )
                            }
                            className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                          >
                            <Copy className="h-4 w-4" />
                            이메일 복사
                          </button>
                        ) : null}
                        {displayedLead.hasCv ? (
                          <button
                            type="button"
                            onClick={() => void handleOpenCv(displayedLead)}
                            disabled={isOpeningCv === displayedLead.id}
                            className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                          >
                            {isOpeningCv === displayedLead.id ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                            CV 열기
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleIngest()}
                          disabled={isSelectedLeadIngesting}
                          className={cx(opsTheme.buttonSecondary, "h-10 px-3")}
                        >
                          {isSelectedLeadIngesting ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {detail?.hasStructuredProfile
                            ? "정보 다시 추출하기"
                            : "정보 추출하기"}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-beige900/10 px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {DETAIL_TABS.map((tab) => (
                        <TabButton
                          key={tab.id}
                          active={detailTab === tab.id}
                          label={tab.label}
                          onClick={() => setDetailTab(tab.id)}
                        />
                      ))}
                    </div>
                  </div>

                  {detailError && !detail ? (
                    <div className="px-5 pb-5">
                      <div className={opsTheme.errorNotice}>{detailError}</div>
                    </div>
                  ) : detailQuery.isLoading && !detail ? (
                    <div className="flex min-h-[420px] items-center justify-center">
                      <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
                    </div>
                  ) : (
                    <div className="px-5 pb-5">
                      {detailTab === "profile" ? (
                        <div className="space-y-4">
                          {!detail?.hasStructuredProfile ? (
                            <div className={cx(opsTheme.panelSoft, "p-5")}>
                              <div className="font-geist text-base font-semibold text-beige900">
                                아직 구조화 프로필이 없습니다.
                              </div>
                              <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
                                LinkedIn 링크와 CV를 바탕으로 `talent_users`,
                                `talent_experiences`, `talent_educations`,
                                `talent_extras`를 채웁니다. LinkedIn 링크가
                                있어야 추출 가능합니다.
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                <Badge>
                                  LinkedIn{" "}
                                  {displayedLead.linkedinProfileUrl
                                    ? "있음"
                                    : "없음"}
                                </Badge>
                                <Badge>
                                  CV {displayedLead.hasCv ? "있음" : "없음"}
                                </Badge>
                              </div>
                            </div>
                          ) : null}

                          <StructuredSection icon={FileUp} title="기본 프로필">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                              <div
                                className={cx(
                                  opsTheme.panel,
                                  "p-4 shadow-none"
                                )}
                              >
                                <div className="font-geist text-base font-semibold text-beige900">
                                  {detail?.structuredProfile?.talentUser
                                    ?.name ??
                                    detail?.talentProfile?.name ??
                                    displayedLead.name ??
                                    "이름 없음"}
                                </div>
                                {detail?.structuredProfile?.talentUser
                                  ?.headline ||
                                detail?.talentProfile?.headline ? (
                                  <div className="mt-2 font-geist text-sm text-beige900/70">
                                    {detail?.structuredProfile?.talentUser
                                      ?.headline ??
                                      detail?.talentProfile?.headline}
                                  </div>
                                ) : null}
                                {detail?.structuredProfile?.talentUser
                                  ?.location ||
                                detail?.talentProfile?.location ? (
                                  <div className="mt-2 font-geist text-sm text-beige900/60">
                                    {detail?.structuredProfile?.talentUser
                                      ?.location ??
                                      detail?.talentProfile?.location}
                                  </div>
                                ) : null}
                                {detail?.structuredProfile?.talentUser?.bio ||
                                detail?.talentProfile?.bio ? (
                                  <div className="mt-4 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                                    {detail?.structuredProfile?.talentUser
                                      ?.bio ?? detail?.talentProfile?.bio}
                                  </div>
                                ) : (
                                  <div className="mt-4 font-geist text-sm text-beige900/55">
                                    구조화된 bio가 아직 없습니다.
                                  </div>
                                )}
                              </div>

                              <div className={cx(opsTheme.panelSoft, "p-4")}>
                                <div className={opsTheme.eyebrow}>
                                  프로필 링크와 파일
                                </div>
                                <div className="mt-3 space-y-3 font-geist text-sm text-beige900/70">
                                  <div className="flex flex-wrap gap-2">
                                    {displayedLead.hasCv ? (
                                      <ProfileChip
                                        onClick={() =>
                                          void handleOpenCv(displayedLead)
                                        }
                                      >
                                        <FileText className="h-4 w-4" />
                                        {detail?.talentProfile
                                          ?.resume_file_name ??
                                          displayedLead.cvFileName ??
                                          "CV 파일"}
                                      </ProfileChip>
                                    ) : null}
                                    <ProfileChip>
                                      <FileText className="h-4 w-4" />
                                      Resume text{" "}
                                      {detail?.ingestionState
                                        .resumeTextAvailable
                                        ? "추출됨"
                                        : "없음"}
                                    </ProfileChip>
                                    {(
                                      detail?.talentProfile?.resume_links ?? []
                                    ).map((link) => (
                                      <ProfileChip key={link} href={link}>
                                        <ExternalLink className="h-4 w-4" />
                                        {getProfileLinkChipLabel(link)}
                                      </ProfileChip>
                                    ))}
                                  </div>
                                  {(detail?.talentProfile?.resume_links ?? [])
                                    .length > 0 ? (
                                    <div className="space-y-2">
                                      {(
                                        detail?.talentProfile?.resume_links ??
                                        []
                                      ).map((link) => (
                                        <div
                                          key={`${link}-raw`}
                                          className="break-all text-beige900/55"
                                        >
                                          {link}
                                        </div>
                                      ))}
                                    </div>
                                  ) : null}
                                  {displayedLead.hasCv ? (
                                    <div className="text-beige900/55">
                                      파일명:{" "}
                                      {detail?.talentProfile
                                        ?.resume_file_name ??
                                        displayedLead.cvFileName ??
                                        "-"}
                                    </div>
                                  ) : null}
                                  {displayedLead.hasCv &&
                                  isOpeningCv === displayedLead.id ? (
                                    <div className="text-beige900/55">
                                      CV 열기 준비 중...
                                    </div>
                                  ) : null}
                                  {displayedLead.hasCv &&
                                  !detail?.ingestionState
                                    .resumeTextAvailable ? (
                                    <div className="text-beige900/55">
                                      CV는 있지만 현재 저장된 resume text는
                                      없습니다.
                                    </div>
                                  ) : null}
                                  {displayedLead.hasCv ||
                                  (detail?.talentProfile?.resume_links ?? [])
                                    .length > 0 ? null : (
                                    <div className="text-beige900/55">
                                      저장된 링크와 파일이 없습니다.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </StructuredSection>

                          <StructuredSection
                            icon={BriefcaseBusiness}
                            title="경력"
                          >
                            {(
                              detail?.structuredProfile?.talentExperiences ?? []
                            ).length > 0 ? (
                              <div className="space-y-3">
                                {(
                                  detail?.structuredProfile
                                    ?.talentExperiences ?? []
                                ).map((item) => (
                                  <div
                                    key={item.id}
                                    className={cx(
                                      opsTheme.panel,
                                      "p-4 shadow-none"
                                    )}
                                  >
                                    <div className="font-geist text-sm font-semibold text-beige900">
                                      {item.role ?? "직함 없음"}
                                    </div>
                                    <div className="mt-1 font-geist text-sm text-beige900/65">
                                      {item.company_name ?? "회사 없음"}
                                      {item.company_location
                                        ? ` · ${item.company_location}`
                                        : ""}
                                    </div>
                                    <div className="mt-2 font-geist text-xs text-beige900/55">
                                      {item.start_date || item.end_date
                                        ? `${item.start_date ?? "-"} ~ ${
                                            item.end_date ?? "Present"
                                          }`
                                        : "날짜 정보 없음"}
                                      {item.months
                                        ? ` · ${item.months}개월`
                                        : ""}
                                    </div>
                                    {item.company_id || item.company_link ? (
                                      <div className="mt-2 flex flex-wrap items-center gap-2 font-geist text-xs text-beige900/55">
                                        {item.company_id ? (
                                          <span>
                                            LinkedIn company id:{" "}
                                            {item.company_id}
                                          </span>
                                        ) : null}
                                        {item.company_link ? (
                                          <a
                                            href={item.company_link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className={opsTheme.link}
                                          >
                                            Company link
                                          </a>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {item.description ? (
                                      <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                                        {item.description}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="font-geist text-sm text-beige900/55">
                                저장된 경력 정보가 없습니다.
                              </div>
                            )}
                          </StructuredSection>

                          <div className="grid gap-4 lg:grid-cols-1">
                            <StructuredSection
                              icon={GraduationCap}
                              title="학력"
                            >
                              {(
                                detail?.structuredProfile?.talentEducations ??
                                []
                              ).length > 0 ? (
                                <div className="space-y-3">
                                  {(
                                    detail?.structuredProfile
                                      ?.talentEducations ?? []
                                  ).map((item) => (
                                    <div
                                      key={item.id}
                                      className={cx(
                                        opsTheme.panel,
                                        "p-4 shadow-none"
                                      )}
                                    >
                                      <div className="font-geist text-sm font-semibold text-beige900">
                                        {item.school ?? "학교 없음"}
                                      </div>
                                      <div className="mt-1 font-geist text-sm text-beige900/65">
                                        {[item.degree, item.field]
                                          .filter(Boolean)
                                          .join(" · ") || "세부 정보 없음"}
                                      </div>
                                      <div className="mt-2 font-geist text-xs text-beige900/55">
                                        {item.start_date || item.end_date
                                          ? `${item.start_date ?? "-"} ~ ${
                                              item.end_date ?? "-"
                                            }`
                                          : "날짜 정보 없음"}
                                      </div>
                                      {item.description ? (
                                        <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                                          {item.description}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="font-geist text-sm text-beige900/55">
                                  저장된 학력 정보가 없습니다.
                                </div>
                              )}
                            </StructuredSection>

                            <StructuredSection
                              icon={BookOpen}
                              title="추가 정보"
                            >
                              {(detail?.structuredProfile?.talentExtras ?? [])
                                .length > 0 ? (
                                <div className="space-y-3">
                                  {(
                                    detail?.structuredProfile?.talentExtras ??
                                    []
                                  ).map((item, index) => (
                                    <div
                                      key={`${item.title}-${index}`}
                                      className={cx(
                                        opsTheme.panel,
                                        "p-4 shadow-none"
                                      )}
                                    >
                                      <div className="font-geist text-sm font-semibold text-beige900">
                                        {item.title ?? "제목 없음"}
                                      </div>
                                      {item.date ? (
                                        <div className="mt-1 font-geist text-xs text-beige900/55">
                                          {item.date}
                                        </div>
                                      ) : null}
                                      {item.description ? (
                                        <div className="mt-3 whitespace-pre-wrap font-geist text-sm leading-6 text-beige900">
                                          {item.description}
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="font-geist text-sm text-beige900/55">
                                  저장된 추가 정보가 없습니다.
                                </div>
                              )}
                            </StructuredSection>
                          </div>
                        </div>
                      ) : null}

                      {detailTab === "waitlist" ? (
                        <div className="space-y-4">
                          <div className={cx(opsTheme.panelSoft, "p-4")}>
                            <div className={opsTheme.eyebrow}>핵심 상태</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {displayedLead.careerMoveIntentLabel ? (
                                <Badge tone="strong">
                                  {displayedLead.careerMoveIntentLabel}
                                </Badge>
                              ) : null}
                              <Badge>
                                {displayedLead.hasCv ? "CV 있음" : "CV 없음"}
                              </Badge>
                              {displayedLead.selectedRole ? (
                                <Badge>{displayedLead.selectedRole}</Badge>
                              ) : null}
                            </div>
                          </div>

                          <div className={cx(opsTheme.panelSoft, "px-4 py-2")}>
                            <div className="divide-y divide-beige900/10">
                              <InfoRow
                                label="이메일"
                                value={
                                  displayedLead.email ? (
                                    <div className="flex items-center gap-2">
                                      <Mail className="h-4 w-4 text-beige900/35" />
                                      <span>{displayedLead.email}</span>
                                    </div>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="제출 시각"
                                value={formatKst(displayedLead.submittedAt)}
                              />
                              <InfoRow
                                label="생성 시각"
                                value={formatKst(displayedLead.createdAt)}
                              />
                              <InfoRow
                                label="Engagement"
                                value={
                                  displayedLead.engagementTypes.length > 0
                                    ? displayedLead.engagementTypes.join(", ")
                                    : "-"
                                }
                              />
                              <InfoRow
                                label="Preferred Location"
                                value={
                                  displayedLead.preferredLocations.length > 0
                                    ? displayedLead.preferredLocations.join(
                                        ", "
                                      )
                                    : "-"
                                }
                              />
                              <InfoRow
                                label="Profile Inputs"
                                value={
                                  displayedLead.profileInputTypes.length > 0
                                    ? displayedLead.profileInputTypes.join(", ")
                                    : "-"
                                }
                              />
                              <InfoRow
                                label="LinkedIn"
                                value={
                                  displayedLead.linkedinProfileUrl ? (
                                    <a
                                      href={displayedLead.linkedinProfileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cx(
                                        opsTheme.link,
                                        "inline-flex items-center gap-2"
                                      )}
                                    >
                                      열기
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="Personal Website"
                                value={
                                  displayedLead.personalWebsiteUrl ? (
                                    <a
                                      href={displayedLead.personalWebsiteUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cx(
                                        opsTheme.link,
                                        "inline-flex items-center gap-2"
                                      )}
                                    >
                                      열기
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="GitHub / HF"
                                value={
                                  displayedLead.githubProfileUrl ? (
                                    <a
                                      href={displayedLead.githubProfileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cx(
                                        opsTheme.link,
                                        "inline-flex items-center gap-2"
                                      )}
                                    >
                                      열기
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="Scholar"
                                value={
                                  displayedLead.scholarProfileUrl ? (
                                    <a
                                      href={displayedLead.scholarProfileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={cx(
                                        opsTheme.link,
                                        "inline-flex items-center gap-2"
                                      )}
                                    >
                                      열기
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="Impact Summary"
                                value={
                                  displayedLead.impactSummary ? (
                                    <div className="whitespace-pre-wrap">
                                      {displayedLead.impactSummary}
                                    </div>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="Dream Teams"
                                value={
                                  displayedLead.dreamTeams ? (
                                    <div className="whitespace-pre-wrap">
                                      {displayedLead.dreamTeams}
                                    </div>
                                  ) : (
                                    "-"
                                  )
                                }
                              />
                              <InfoRow
                                label="Local ID"
                                value={displayedLead.localId ?? "-"}
                              />
                            </div>
                          </div>

                          {detail?.latestNetworkApplication ||
                          detail?.latestTalentSetting ||
                          detail?.latestTalentInsights ? (
                            <div
                              className={cx(opsTheme.panelSoft, "px-4 py-2")}
                            >
                              <div className="divide-y divide-beige900/10">
                                <InfoRow
                                  label="원하는 역할"
                                  value={
                                    detail?.latestNetworkApplication
                                      ?.selectedRole ?? "-"
                                  }
                                />
                                <InfoRow
                                  label="제출 자료"
                                  value={
                                    detail?.latestNetworkApplication &&
                                    detail.latestNetworkApplication.profileInputTypes
                                      .length > 0
                                      ? detail.latestNetworkApplication.profileInputTypes.join(
                                          ", "
                                        )
                                      : "-"
                                  }
                                />
                                <InfoRow
                                  label="이직 의향"
                                  value={
                                    getTalentCareerMoveIntentLabel(
                                      detail?.latestTalentSetting
                                        ?.career_move_intent ?? null
                                    ) ?? "-"
                                  }
                                />
                                <InfoRow
                                  label="선호 형태"
                                  value={
                                    detail?.latestTalentSetting &&
                                    detail.latestTalentSetting.engagement_types
                                      .length > 0
                                      ? getTalentEngagementLabels(
                                          detail.latestTalentSetting.engagement_types
                                        ).join(", ")
                                      : "-"
                                  }
                                />
                                <InfoRow
                                  label="선호 지역"
                                  value={
                                    detail?.latestTalentSetting &&
                                    detail.latestTalentSetting.preferred_locations
                                      .length > 0
                                      ? getTalentLocationLabels(
                                          detail.latestTalentSetting.preferred_locations
                                        ).join(", ")
                                      : "-"
                                  }
                                />
                                {detail?.latestTalentInsights &&
                                Object.keys(detail.latestTalentInsights).length > 0
                                  ? Object.entries(detail.latestTalentInsights)
                                      .filter(([, value]) => value?.trim())
                                      .sort(([left], [right]) =>
                                        left.localeCompare(right)
                                      )
                                      .map(([key, value]) => (
                                        <InfoRow
                                          key={key}
                                          label={formatTalentInsightLabel(key)}
                                          value={
                                            <div className="whitespace-pre-wrap">
                                              {value}
                                            </div>
                                          }
                                        />
                                      ))
                                  : (
                                    <InfoRow label="Harper insight" value="-" />
                                  )}
                              </div>
                            </div>
                          ) : null}

                          <div className={cx(opsTheme.panelSoft, "p-4")}>
                            <div className={opsTheme.eyebrow}>원본 payload</div>
                            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-6 text-beige900/70">
                              {JSON.stringify(
                                displayedLead.rawPayload,
                                null,
                                2
                              )}
                            </pre>
                          </div>
                        </div>
                      ) : null}

                      {detailTab === "internal" ? (
                        <div className="space-y-4">
                          {detailError ? (
                            <div className={opsTheme.errorNotice}>
                              {detailError}
                            </div>
                          ) : null}

                          <StructuredSection icon={Send} title="메일 보내기">
                            <div className="space-y-3">
                              <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                                <div>
                                  <label className={opsTheme.label}>
                                    보내는 사람
                                  </label>
                                  <input
                                    type="text"
                                    value={mailFromEmail}
                                    onChange={(event) =>
                                      setMailFromEmail(event.target.value)
                                    }
                                    className={cx(opsTheme.input, "mt-2")}
                                    placeholder="team@matchharper.com"
                                  />
                                </div>
                                <div>
                                  <label className={opsTheme.label}>
                                    받는 사람
                                  </label>
                                  <div
                                    className={cx(
                                      opsTheme.panelSoft,
                                      "mt-2 flex h-11 items-center px-3 font-geist text-sm text-beige900/70"
                                    )}
                                  >
                                    {displayedLead.email ?? "이메일 없음"}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <label className={opsTheme.label}>제목</label>
                                <input
                                  type="text"
                                  value={mailSubject}
                                  onChange={(event) =>
                                    setMailSubject(event.target.value)
                                  }
                                  className={cx(opsTheme.input, "mt-2")}
                                  placeholder="후보자에게 보낼 메일 제목"
                                />
                              </div>

                              <div>
                                <label className={opsTheme.label}>본문</label>
                                <textarea
                                  value={mailContent}
                                  onChange={(event) =>
                                    setMailContent(event.target.value)
                                  }
                                  className={cx(
                                    opsTheme.textarea,
                                    "mt-2 min-h-[180px]"
                                  )}
                                  placeholder="후보자에게 보낼 메일 내용을 작성하세요."
                                />
                              </div>

                              <button
                                type="button"
                                onClick={() => void handleSendMail()}
                                disabled={
                                  mailMutation.isPending ||
                                  !displayedLead.email ||
                                  !mailFromEmail.trim() ||
                                  !mailSubject.trim() ||
                                  !mailContent.trim()
                                }
                                className={cx(opsTheme.buttonPrimary, "h-11")}
                              >
                                {mailMutation.isPending ? (
                                  <LoaderCircle className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                                메일 발송
                              </button>
                            </div>
                          </StructuredSection>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <StructuredSection
                              icon={NotebookPen}
                              title="공용 메모"
                            >
                              <textarea
                                value={memoContent}
                                onChange={(event) =>
                                  setMemoContent(event.target.value)
                                }
                                className={cx(
                                  opsTheme.textarea,
                                  "min-h-[180px]"
                                )}
                                placeholder="후보자에 대한 공용 메모를 남기세요."
                              />
                              <button
                                type="button"
                                onClick={() => void handleSaveInternal("memo")}
                                disabled={
                                  internalMutation.isPending ||
                                  !memoContent.trim()
                                }
                                className={cx(opsTheme.buttonSoft, "mt-3 h-10")}
                              >
                                메모 저장
                              </button>
                            </StructuredSection>

                            <StructuredSection
                              icon={MessageSquareText}
                              title="직접 대화 기록"
                            >
                              <textarea
                                value={conversationContent}
                                onChange={(event) =>
                                  setConversationContent(event.target.value)
                                }
                                className={cx(
                                  opsTheme.textarea,
                                  "min-h-[180px]"
                                )}
                                placeholder="전화나 미팅으로 직접 나눈 대화 내용을 기록하세요."
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  void handleSaveInternal("conversation")
                                }
                                disabled={
                                  internalMutation.isPending ||
                                  !conversationContent.trim()
                                }
                                className={cx(opsTheme.buttonSoft, "mt-3 h-10")}
                              >
                                대화 기록 저장
                              </button>
                            </StructuredSection>
                          </div>

                          <StructuredSection
                            icon={FileText}
                            title="활동 타임라인"
                          >
                            {(detail?.internalEntries ?? []).length > 0 ? (
                              <div className="space-y-3">
                                {(detail?.internalEntries ?? []).map(
                                  (entry) => (
                                    <ActivityEntryCard
                                      key={entry.id}
                                      deletePending={
                                        deletingEntryId === entry.id
                                      }
                                      editPending={updatingEntryId === entry.id}
                                      editingValue={
                                        editingEntryId === entry.id
                                          ? editingEntryContent
                                          : ""
                                      }
                                      entry={entry}
                                      isEditing={editingEntryId === entry.id}
                                      onDelete={handleDeleteEntry}
                                      onEditCancel={handleCancelEditingEntry}
                                      onEditChange={setEditingEntryContent}
                                      onEditSave={handleSaveEditedEntry}
                                      onEditStart={handleStartEditingEntry}
                                    />
                                  )
                                )}
                              </div>
                            ) : (
                              <div className="font-geist text-sm text-beige900/55">
                                아직 저장된 내부 활동이 없습니다.
                              </div>
                            )}
                          </StructuredSection>
                        </div>
                      ) : null}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </OpsShell>
    </>
  );
}
