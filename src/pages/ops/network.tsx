import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useCreateOpsNetworkNotification,
  useCreateOpsNetworkInternalEntry,
  useDeleteOpsNetworkInternalEntry,
  useIngestOpsNetworkLead,
  useOpsNetworkDetail,
  useOpsNetworkLeads,
  useSendOpsNetworkMail,
  useUpdateOpsNetworkInternalEntry,
} from "@/hooks/useOpsNetwork";
import type { NetworkLeadSummary, TalentInternalEntry } from "@/lib/opsNetwork";
import {
  getTalentCareerMoveIntentLabel,
  getTalentEngagementLabels,
  getTalentLocationLabels,
} from "@/lib/talentNetworkApplication";
import { showToast } from "@/components/toast/toast";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import {
  OPS_NETWORK_PAGE_SIZE_OPTIONS,
  useOpsNetworkStore,
} from "@/store/useOpsNetworkStore";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
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
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type DetailTab = "internal" | "profile" | "waitlist";

const DETAIL_TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "profile", label: "구조화 프로필" },
  { id: "waitlist", label: "원본 제출 정보" },
  { id: "internal", label: "내부 활동" },
];

const PAGINATION_BUTTON_COUNT = 5;

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

const formatKstDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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

function readQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveQueryNumber(value: string | string[] | undefined) {
  const raw = readQueryValue(value);
  const numeric = Number(raw ?? "");
  if (!Number.isInteger(numeric) || numeric <= 0) return null;
  return numeric;
}

function buildPaginationNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 0) return [];

  const half = Math.floor(PAGINATION_BUTTON_COUNT / 2);
  const start = Math.max(
    1,
    Math.min(currentPage - half, totalPages - PAGINATION_BUTTON_COUNT + 1)
  );
  const end = Math.min(totalPages, start + PAGINATION_BUTTON_COUNT - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function getLatestExperienceText(lead: NetworkLeadSummary) {
  const latestExperience = lead.latestExperience;
  if (latestExperience?.companyName || latestExperience?.role) {
    return {
      meta: [
        latestExperience.startDate || latestExperience.endDate
          ? `${latestExperience.startDate ?? "-"} ~ ${
              latestExperience.endDate ?? "Present"
            }`
          : null,
        latestExperience.companyLocation,
      ]
        .filter(Boolean)
        .join(" · "),
      primary: [
        latestExperience.companyName ?? "회사 없음",
        latestExperience.role ?? "역할 없음",
      ].join(" / "),
    };
  }

  return {
    meta: null,
    primary: lead.selectedRole ?? "구조화된 최근 경력 없음",
  };
}

function getLeadPreferenceLabels(lead: NetworkLeadSummary) {
  const moveLabel =
    lead.careerMoveIntentLabel ??
    getTalentCareerMoveIntentLabel(lead.careerMoveIntent) ??
    null;
  const engagementLabels = getTalentEngagementLabels(lead.engagementTypes);
  const locationLabels = getTalentLocationLabels(lead.preferredLocations);

  return {
    engagementLabels,
    locationLabels,
    moveLabel,
  };
}

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

const StatCard = ({ hint, value }: { hint: string; value: string }) => (
  <div className="p-2 flex flex-row items-center justify-center gap-2 bg-beige500">
    <div className="font-halant text-[1.4rem] leading-none text-beige900">
      {value}
    </div>
    <div className="font-geist text-sm text-beige900/60">{hint}</div>
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
  const router = useRouter();
  const { user } = useAuthStore();
  const pageSize = useOpsNetworkStore((state) => state.pageSize);
  const setPageSize = useOpsNetworkStore((state) => state.setPageSize);

  const currentPage = parsePositiveQueryNumber(router.query.page) ?? 1;
  const selectedLeadId = parsePositiveQueryNumber(router.query.leadId);
  const currentOffset = Math.max(0, (currentPage - 1) * pageSize);

  const ingestMutation = useIngestOpsNetworkLead();
  const internalMutation = useCreateOpsNetworkInternalEntry();
  const notificationMutation = useCreateOpsNetworkNotification();
  const updateInternalMutation = useUpdateOpsNetworkInternalEntry();
  const deleteInternalMutation = useDeleteOpsNetworkInternalEntry();
  const mailMutation = useSendOpsNetworkMail();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [moveFilter, setMoveFilter] = useState("all");
  const [cvOnly, setCvOnly] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("profile");
  const [mailFromEmail, setMailFromEmail] = useState("");
  const [mailSubject, setMailSubject] = useState("");
  const [mailContent, setMailContent] = useState("");
  const [memoContent, setMemoContent] = useState("");
  const [notificationContent, setNotificationContent] = useState("");
  const [conversationContent, setConversationContent] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editingEntryContent, setEditingEntryContent] = useState("");
  const [isOpeningCv, setIsOpeningCv] = useState<number | null>(null);
  const [quickMemoLead, setQuickMemoLead] = useState<NetworkLeadSummary | null>(
    null
  );
  const [quickMemoContent, setQuickMemoContent] = useState("");

  const leadsQuery = useOpsNetworkLeads({
    cvOnly,
    enabled: router.isReady,
    limit: pageSize,
    move: moveFilter !== "all" ? moveFilter : null,
    offset: currentOffset,
    query,
    role: roleFilter !== "all" ? roleFilter : null,
  });
  const detailQuery = useOpsNetworkDetail(selectedLeadId);

  const list = leadsQuery.data;
  const currentLeads = useMemo(() => list?.leads ?? [], [list?.leads]);
  const totalPages = list?.totalPages ?? 1;
  const pageNumbers = useMemo(
    () => buildPaginationNumbers(currentPage, totalPages),
    [currentPage, totalPages]
  );

  const updateRouteQuery = useCallback(
    (
      patch: Record<string, string | null | undefined>,
      replaceHistory = false
    ) => {
      const nextQuery = { ...router.query } as Record<
        string,
        string | string[] | undefined
      >;

      Object.entries(patch).forEach(([key, value]) => {
        if (!value) {
          delete nextQuery[key];
          return;
        }

        nextQuery[key] = value;
      });

      const navigate = replaceHistory ? router.replace : router.push;

      void navigate(
        {
          pathname: router.pathname,
          query: nextQuery,
        },
        undefined,
        { scroll: false, shallow: true }
      );
    },
    [router]
  );

  const goToPage = useCallback(
    (page: number, replaceHistory = false) => {
      updateRouteQuery({ page: String(Math.max(1, page)) }, replaceHistory);
    },
    [updateRouteQuery]
  );

  const openLeadDrawer = useCallback(
    (leadId: number) => {
      setDetailTab("profile");
      updateRouteQuery(
        {
          leadId: String(leadId),
          page: String(currentPage),
        },
        false
      );
    },
    [currentPage, updateRouteQuery]
  );

  const closeLeadDrawer = useCallback(() => {
    updateRouteQuery({ leadId: null }, false);
  }, [updateRouteQuery]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (currentPage !== 1) {
        goToPage(1, true);
      }
    },
    [currentPage, goToPage]
  );

  const handleRoleFilterChange = useCallback(
    (value: string) => {
      setRoleFilter(value);
      if (currentPage !== 1) {
        goToPage(1, true);
      }
    },
    [currentPage, goToPage]
  );

  const handleMoveFilterChange = useCallback(
    (value: string) => {
      setMoveFilter(value);
      if (currentPage !== 1) {
        goToPage(1, true);
      }
    },
    [currentPage, goToPage]
  );

  const handleCvOnlyChange = useCallback(
    (value: boolean) => {
      setCvOnly(value);
      if (currentPage !== 1) {
        goToPage(1, true);
      }
    },
    [currentPage, goToPage]
  );

  const handlePageSizeChange = useCallback(
    (value: number) => {
      setPageSize(value);
      if (currentPage !== 1) {
        goToPage(1, true);
      }
    },
    [currentPage, goToPage, setPageSize]
  );

  useEffect(() => {
    if (user?.email && !mailFromEmail) {
      setMailFromEmail(user.email);
    }
  }, [mailFromEmail, user?.email]);

  useEffect(() => {
    if (!router.isReady) return;

    const rawPage = readQueryValue(router.query.page);
    if (!rawPage || parsePositiveQueryNumber(rawPage) === null) {
      goToPage(1, true);
    }
  }, [goToPage, router.isReady, router.query.page]);

  useEffect(() => {
    if (!router.isReady || !list) return;
    if (currentPage <= totalPages) return;
    goToPage(totalPages, true);
  }, [currentPage, goToPage, list, router.isReady, totalPages]);

  useEffect(() => {
    if (!selectedLeadId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLeadDrawer();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLeadDrawer, selectedLeadId]);

  useEffect(() => {
    if (!quickMemoLead) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickMemoLead(null);
        setQuickMemoContent("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [quickMemoLead]);

  useEffect(() => {
    setMemoContent("");
    setConversationContent("");
    setMailSubject("");
    setMailContent("");
    setEditingEntryId(null);
    setEditingEntryContent("");
    setNotificationContent("");
  }, [selectedLeadId]);

  const selectedLead = useMemo(
    () => currentLeads.find((lead) => lead.id === selectedLeadId) ?? null,
    [currentLeads, selectedLeadId]
  );

  const detail = detailQuery.data;
  const displayedLead = detail?.lead ?? selectedLead;
  const stats = list?.stats ?? {
    readyNowCount: 0,
    recentCount: 0,
    totalCount: 0,
    withCvCount: 0,
  };
  const roleOptions = list?.filters.roleOptions ?? [];
  const moveOptions = list?.filters.moveOptions ?? [];

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

    const rows = currentLeads.map((lead) => [
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
  }, [currentLeads]);

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

  const handleSaveNotification = useCallback(async () => {
    if (!selectedLeadId) return;

    const message = notificationContent.trim();
    if (!message) return;

    try {
      await notificationMutation.mutateAsync({
        id: selectedLeadId,
        message,
      });
      setNotificationContent("");
      showToast({
        message: "후보자 알림 저장 완료",
        variant: "white",
      });
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "후보자 알림 저장에 실패했습니다.",
        variant: "error",
      });
    }
  }, [notificationContent, notificationMutation, selectedLeadId]);

  const handleOpenQuickMemo = useCallback((lead: NetworkLeadSummary) => {
    setQuickMemoLead(lead);
    setQuickMemoContent("");
  }, []);

  const handleCloseQuickMemo = useCallback(() => {
    if (internalMutation.isPending) return;
    setQuickMemoLead(null);
    setQuickMemoContent("");
  }, [internalMutation.isPending]);

  const handleSaveQuickMemo = useCallback(async () => {
    if (!quickMemoLead) return;

    const content = quickMemoContent.trim();
    if (!content) return;

    try {
      await internalMutation.mutateAsync({
        content,
        id: quickMemoLead.id,
        type: "memo",
      });
      setQuickMemoLead(null);
      setQuickMemoContent("");
      showToast({ message: "메모 저장 완료", variant: "white" });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : "메모 저장에 실패했습니다.",
        variant: "error",
      });
    }
  }, [internalMutation, quickMemoContent, quickMemoLead]);

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
    if (currentPage !== 1) {
      goToPage(1, true);
    }
  }, [currentPage, goToPage]);

  const isSelectedLeadIngesting =
    ingestMutation.isPending && ingestMutation.variables === displayedLead?.id;
  const updatingEntryId = updateInternalMutation.isPending
    ? (updateInternalMutation.variables?.entryId ?? null)
    : null;
  const deletingEntryId = deleteInternalMutation.isPending
    ? (deleteInternalMutation.variables?.entryId ?? null)
    : null;
  const isQuickMemoSaving =
    internalMutation.isPending &&
    internalMutation.variables?.type === "memo" &&
    internalMutation.variables?.id === quickMemoLead?.id;

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
              disabled={currentLeads.length === 0}
              className={cx(opsTheme.buttonSecondary, "h-10")}
            >
              <Download className="h-4 w-4" />
              현재 페이지 CSV
            </button>
          </>
        }
      >
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            value={String(stats.totalCount)}
            hint="현재 waitlist 전체 수"
          />
          <StatCard
            value={String(stats.readyNowCount)}
            hint="좋은 기회면 바로 이직 가능"
          />
          <StatCard
            value={String(stats.withCvCount)}
            hint="CV 또는 이력서 파일 포함"
          />
          <StatCard
            value={String(stats.recentCount)}
            hint="최근 7일 신규 제출"
          />
        </section>

        <section className="space-y-6">
          <div className="px-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_180px_220px_160px_160px_auto]">
              <label
                className={cx(
                  opsTheme.panelSoft,
                  "flex h-11 items-center gap-2 px-3"
                )}
              >
                <Search className="h-4 w-4 text-beige900/40" />
                <input
                  value={query}
                  onChange={(event) => handleQueryChange(event.target.value)}
                  placeholder="이름, 이메일, 역할, 링크 검색"
                  className="h-full w-full bg-transparent font-geist text-sm text-beige900 outline-none placeholder:text-beige900/35"
                />
              </label>

              <select
                value={roleFilter}
                onChange={(event) => handleRoleFilterChange(event.target.value)}
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
                onChange={(event) => handleMoveFilterChange(event.target.value)}
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
                  onChange={(event) => handleCvOnlyChange(event.target.checked)}
                  className="accent-[#2E1706]"
                />
                CV만 보기
              </label>

              <select
                value={pageSize}
                onChange={(event) =>
                  handlePageSizeChange(Number(event.target.value))
                }
                className={cx(opsTheme.input, "appearance-none")}
              >
                {OPS_NETWORK_PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    페이지당 {option}명
                  </option>
                ))}
              </select>

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

          <div className={cx(opsTheme.panel, "overflow-hidden")}>
            <div className="flex flex-col gap-3 border-b border-beige900/10 px-4 py-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className={opsTheme.eyebrow}>Candidates</div>
                <div className="mt-1 font-geist text-sm text-beige900/70">
                  필터 결과 {list?.filteredCount ?? 0}명 / 전체{" "}
                  {list?.allCount ?? 0}명
                </div>
              </div>
              <div className="font-geist text-sm text-beige900/55">
                페이지 {currentPage} / {totalPages} · 현재 {currentLeads.length}
                명
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[1360px] w-full table-fixed border-collapse">
                <thead className="bg-white/55 text-left">
                  <tr className="border-b border-beige900/10 font-geist text-xs uppercase text-beige900/50">
                    <th className="w-[240px] px-4 py-3 font-medium">이름</th>
                    <th className="w-[280px] px-4 py-3 font-medium">
                      최근 회사 / 역할
                    </th>
                    <th className="w-[320px] px-4 py-3 font-medium">
                      선택한 값
                    </th>
                    <th className="w-[360px] px-4 py-3 font-medium">메모</th>
                    <th className="w-[160px] px-4 py-3 font-medium">가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsQuery.isLoading && !list ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12">
                        <div className="flex items-center justify-center">
                          <LoaderCircle className="h-5 w-5 animate-spin text-beige900/45" />
                        </div>
                      </td>
                    </tr>
                  ) : currentLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-12 text-center font-geist text-sm text-beige900/55"
                      >
                        조건에 맞는 후보자가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    currentLeads.map((lead) => {
                      const isSelected = selectedLeadId === lead.id;
                      const latestExperience = getLatestExperienceText(lead);
                      const preferenceLabels = getLeadPreferenceLabels(lead);
                      const submittedDaysAgo = daysAgo(lead.submittedAt);

                      return (
                        <tr
                          key={lead.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openLeadDrawer(lead.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openLeadDrawer(lead.id);
                            }
                          }}
                          className={cx(
                            "cursor-pointer border-b border-beige900/10 align-top transition hover:bg-white/50 focus-visible:bg-white/60",
                            isSelected && "bg-[#2E1706] text-beige100"
                          )}
                        >
                          <td className="px-4 py-4 align-top">
                            <div className="min-w-0">
                              <div className="truncate font-geist text-base font-medium">
                                {lead.name ?? "이름 없음"}
                              </div>
                              <div
                                className={cx(
                                  "mt-1 truncate font-geist text-sm",
                                  isSelected
                                    ? "text-beige100/72"
                                    : "text-beige900/55"
                                )}
                              >
                                {lead.email ?? "이메일 없음"}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {lead.hasCv ? (
                                  <Badge
                                    tone={isSelected ? "inverse" : "default"}
                                  >
                                    CV
                                  </Badge>
                                ) : null}
                                {lead.hasStructuredProfile ? (
                                  <Badge
                                    tone={isSelected ? "inverse" : "default"}
                                  >
                                    Structured
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-geist text-sm font-medium">
                              {latestExperience.primary}
                            </div>
                            <div
                              className={cx(
                                "mt-2 font-geist text-xs",
                                isSelected
                                  ? "text-beige100/65"
                                  : "text-beige900/55"
                              )}
                            >
                              {latestExperience.meta ?? "세부 경력 정보 없음"}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              {preferenceLabels.moveLabel ? (
                                <Badge
                                  tone={isSelected ? "inverse" : "default"}
                                >
                                  {preferenceLabels.moveLabel}
                                </Badge>
                              ) : null}
                              {preferenceLabels.engagementLabels.map(
                                (label) => (
                                  <Badge
                                    key={`${lead.id}-engagement-${label}`}
                                    tone={isSelected ? "inverse" : "default"}
                                  >
                                    {label}
                                  </Badge>
                                )
                              )}
                              {preferenceLabels.locationLabels.map((label) => (
                                <Badge
                                  key={`${lead.id}-location-${label}`}
                                  tone={isSelected ? "inverse" : "default"}
                                >
                                  {label}
                                </Badge>
                              ))}
                              {!preferenceLabels.moveLabel &&
                              preferenceLabels.engagementLabels.length === 0 &&
                              preferenceLabels.locationLabels.length === 0 ? (
                                <span
                                  className={cx(
                                    "font-geist text-sm",
                                    isSelected
                                      ? "text-beige100/65"
                                      : "text-beige900/50"
                                  )}
                                >
                                  저장된 선택 값 없음
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenQuickMemo(lead);
                                }}
                                className={cx(
                                  "inline-flex h-8 items-center justify-center rounded-md px-3 font-geist text-xs transition bg-beige900 text-beige100 hover:opacity-90"
                                )}
                              >
                                메모 추가
                              </button>
                              {lead.recentMemos.length > 0 ? (
                                <div className="space-y-3">
                                  {lead.recentMemos.map((memo) => (
                                    <div key={memo.id}>
                                      <div
                                        className={cx(
                                          "font-geist text-xs",
                                          isSelected
                                            ? "text-beige100/60"
                                            : "text-beige900/45"
                                        )}
                                      >
                                        {formatKstDate(memo.createdAt)}
                                      </div>
                                      <div className="mt-1 line-clamp-2 font-geist text-sm leading-6">
                                        {memo.content}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div
                                  className={cx(
                                    "font-geist text-sm",
                                    isSelected
                                      ? "text-beige100/65"
                                      : "text-beige900/50"
                                  )}
                                >
                                  최근 메모 없음
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className="font-geist text-sm">
                              {formatKstDate(lead.createdAt)}
                            </div>
                            <div
                              className={cx(
                                "mt-2 font-geist text-xs",
                                isSelected
                                  ? "text-beige100/60"
                                  : "text-beige900/45"
                              )}
                            >
                              {submittedDaysAgo !== null
                                ? `${submittedDaysAgo}일 전 제출`
                                : formatKstDate(lead.submittedAt)}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-beige900/10 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="font-geist text-sm text-beige900/55">
                페이지당 {pageSize}명
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </button>
                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => goToPage(page)}
                    className={cx(
                      "inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 font-geist text-sm transition",
                      page === currentPage
                        ? "bg-beige900 text-beige100"
                        : "bg-white/60 text-beige900 hover:bg-white/80"
                    )}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {selectedLeadId ? (
              <div className="fixed inset-0 z-[70]">
                <motion.button
                  type="button"
                  aria-label="Close candidate drawer"
                  className="absolute inset-0 bg-beige900/28 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeLeadDrawer}
                />
                <motion.aside
                  initial={{ opacity: 0, x: "100%" }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: "100%" }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="absolute inset-y-0 right-0 w-full max-w-[min(1080px,94vw)] overflow-hidden border-l border-beige900/10 bg-[#F4E8D8] shadow-[-24px_0_80px_rgba(46,23,6,0.18)]"
                >
                  <div className="h-full overflow-y-auto">
                    {!displayedLead ? (
                      <div className="flex h-full items-center justify-center px-6 py-10 font-geist text-sm text-beige900/55">
                        {detailError ? (
                          <div className={opsTheme.errorNotice}>
                            {detailError}
                          </div>
                        ) : (
                          <LoaderCircle className="h-6 w-6 animate-spin text-beige900/45" />
                        )}
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
                              <button
                                type="button"
                                onClick={closeLeadDrawer}
                                className={cx(opsTheme.buttonSoft, "h-10 px-3")}
                              >
                                <X className="h-4 w-4" />
                                닫기
                              </button>
                              {displayedLead.email ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopy(
                                      displayedLead.email ?? "",
                                      "이메일"
                                    )
                                  }
                                  className={cx(
                                    opsTheme.buttonSoft,
                                    "h-10 px-3"
                                  )}
                                >
                                  <Copy className="h-4 w-4" />
                                  이메일 복사
                                </button>
                              ) : null}
                              {displayedLead.hasCv ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleOpenCv(displayedLead)
                                  }
                                  disabled={isOpeningCv === displayedLead.id}
                                  className={cx(
                                    opsTheme.buttonSoft,
                                    "h-10 px-3"
                                  )}
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
                                className={cx(
                                  opsTheme.buttonSecondary,
                                  "h-10 px-3"
                                )}
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
                            <div className={opsTheme.errorNotice}>
                              {detailError}
                            </div>
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
                                  <div
                                    className={cx(opsTheme.panelSoft, "p-5")}
                                  >
                                    <div className="font-geist text-base font-semibold text-beige900">
                                      아직 구조화 프로필이 없습니다.
                                    </div>
                                    <div className="mt-2 font-geist text-sm leading-6 text-beige900/65">
                                      LinkedIn 링크와 CV를 바탕으로
                                      `talent_users`, `talent_experiences`,
                                      `talent_educations`, `talent_extras`를
                                      채웁니다. LinkedIn 링크가 있어야 추출
                                      가능합니다.
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                      <Badge>
                                        LinkedIn{" "}
                                        {displayedLead.linkedinProfileUrl
                                          ? "있음"
                                          : "없음"}
                                      </Badge>
                                      <Badge>
                                        CV{" "}
                                        {displayedLead.hasCv ? "있음" : "없음"}
                                      </Badge>
                                    </div>
                                  </div>
                                ) : null}

                                <StructuredSection
                                  icon={FileUp}
                                  title="기본 프로필"
                                >
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
                                      {detail?.structuredProfile?.talentUser
                                        ?.bio || detail?.talentProfile?.bio ? (
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

                                    <div
                                      className={cx(opsTheme.panelSoft, "p-4")}
                                    >
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
                                            detail?.talentProfile
                                              ?.resume_links ?? []
                                          ).map((link) => (
                                            <ProfileChip key={link} href={link}>
                                              <ExternalLink className="h-4 w-4" />
                                              {getProfileLinkChipLabel(link)}
                                            </ProfileChip>
                                          ))}
                                        </div>
                                        {(
                                          detail?.talentProfile?.resume_links ??
                                          []
                                        ).length > 0 ? (
                                          <div className="space-y-2">
                                            {(
                                              detail?.talentProfile
                                                ?.resume_links ?? []
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
                                            CV는 있지만 현재 저장된 resume
                                            text는 없습니다.
                                          </div>
                                        ) : null}
                                        {displayedLead.hasCv ||
                                        (
                                          detail?.talentProfile?.resume_links ??
                                          []
                                        ).length > 0 ? null : (
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
                                    detail?.structuredProfile
                                      ?.talentExperiences ?? []
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
                                          {item.company_id ||
                                          item.company_link ? (
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
                                      detail?.structuredProfile
                                        ?.talentEducations ?? []
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
                                                .join(" · ") ||
                                                "세부 정보 없음"}
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
                                    {(
                                      detail?.structuredProfile?.talentExtras ??
                                      []
                                    ).length > 0 ? (
                                      <div className="space-y-3">
                                        {(
                                          detail?.structuredProfile
                                            ?.talentExtras ?? []
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
                                  <div className={opsTheme.eyebrow}>
                                    핵심 상태
                                  </div>
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {displayedLead.careerMoveIntentLabel ? (
                                      <Badge tone="strong">
                                        {displayedLead.careerMoveIntentLabel}
                                      </Badge>
                                    ) : null}
                                    <Badge>
                                      {displayedLead.hasCv
                                        ? "CV 있음"
                                        : "CV 없음"}
                                    </Badge>
                                    {displayedLead.selectedRole ? (
                                      <Badge>
                                        {displayedLead.selectedRole}
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>

                                <div
                                  className={cx(
                                    opsTheme.panelSoft,
                                    "px-4 py-2"
                                  )}
                                >
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
                                      value={formatKst(
                                        displayedLead.submittedAt
                                      )}
                                    />
                                    <InfoRow
                                      label="생성 시각"
                                      value={formatKst(displayedLead.createdAt)}
                                    />
                                    <InfoRow
                                      label="Engagement"
                                      value={
                                        displayedLead.engagementTypes.length > 0
                                          ? displayedLead.engagementTypes.join(
                                              ", "
                                            )
                                          : "-"
                                      }
                                    />
                                    <InfoRow
                                      label="Preferred Location"
                                      value={
                                        displayedLead.preferredLocations
                                          .length > 0
                                          ? displayedLead.preferredLocations.join(
                                              ", "
                                            )
                                          : "-"
                                      }
                                    />
                                    <InfoRow
                                      label="Profile Inputs"
                                      value={
                                        displayedLead.profileInputTypes.length >
                                        0
                                          ? displayedLead.profileInputTypes.join(
                                              ", "
                                            )
                                          : "-"
                                      }
                                    />
                                    <InfoRow
                                      label="LinkedIn"
                                      value={
                                        displayedLead.linkedinProfileUrl ? (
                                          <a
                                            href={
                                              displayedLead.linkedinProfileUrl
                                            }
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
                                            href={
                                              displayedLead.personalWebsiteUrl
                                            }
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
                                            href={
                                              displayedLead.githubProfileUrl
                                            }
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
                                            href={
                                              displayedLead.scholarProfileUrl
                                            }
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
                                    className={cx(
                                      opsTheme.panelSoft,
                                      "px-4 py-2"
                                    )}
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
                                          detail.latestNetworkApplication
                                            .profileInputTypes.length > 0
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
                                          detail.latestTalentSetting
                                            .engagement_types.length > 0
                                            ? getTalentEngagementLabels(
                                                detail.latestTalentSetting
                                                  .engagement_types
                                              ).join(", ")
                                            : "-"
                                        }
                                      />
                                      <InfoRow
                                        label="선호 지역"
                                        value={
                                          detail?.latestTalentSetting &&
                                          detail.latestTalentSetting
                                            .preferred_locations.length > 0
                                            ? getTalentLocationLabels(
                                                detail.latestTalentSetting
                                                  .preferred_locations
                                              ).join(", ")
                                            : "-"
                                        }
                                      />
                                      {detail?.latestTalentInsights &&
                                      Object.keys(detail.latestTalentInsights)
                                        .length > 0 ? (
                                        Object.entries(
                                          detail.latestTalentInsights
                                        )
                                          .filter(([, value]) => value?.trim())
                                          .sort(([left], [right]) =>
                                            left.localeCompare(right)
                                          )
                                          .map(([key, value]) => (
                                            <InfoRow
                                              key={key}
                                              label={formatTalentInsightLabel(
                                                key
                                              )}
                                              value={
                                                <div className="whitespace-pre-wrap">
                                                  {value}
                                                </div>
                                              }
                                            />
                                          ))
                                      ) : (
                                        <InfoRow
                                          label="Harper insight"
                                          value="-"
                                        />
                                      )}
                                    </div>
                                  </div>
                                ) : null}

                                <div className={cx(opsTheme.panelSoft, "p-4")}>
                                  <div className={opsTheme.eyebrow}>
                                    원본 payload
                                  </div>
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

                                <StructuredSection
                                  icon={Send}
                                  title="메일 보내기"
                                >
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
                                      <label className={opsTheme.label}>
                                        제목
                                      </label>
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
                                      <label className={opsTheme.label}>
                                        본문
                                      </label>
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
                                      className={cx(
                                        opsTheme.buttonPrimary,
                                        "h-11"
                                      )}
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
                                      onClick={() =>
                                        void handleSaveInternal("memo")
                                      }
                                      disabled={
                                        internalMutation.isPending ||
                                        !memoContent.trim()
                                      }
                                      className={cx(
                                        opsTheme.buttonSoft,
                                        "mt-3 h-10"
                                      )}
                                    >
                                      메모 저장
                                    </button>

                                    <div className="mt-5 border-t border-beige900/10 pt-5">
                                      <label className={opsTheme.label}>
                                        Candidate Notification
                                      </label>
                                      <p className="mt-2 font-geist text-sm leading-6 text-beige900/60">
                                        여기서 입력한 내용은 후보자의 `career`
                                        페이지 Notification에 표시됩니다. 아직
                                        계정 연결 전이어도 이후 이어지도록
                                        저장됩니다.
                                      </p>
                                      <textarea
                                        value={notificationContent}
                                        onChange={(event) =>
                                          setNotificationContent(
                                            event.target.value
                                          )
                                        }
                                        className={cx(
                                          opsTheme.textarea,
                                          "mt-3 min-h-[120px]"
                                        )}
                                        placeholder="후보자에게 보여줄 알림 내용을 입력하세요."
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleSaveNotification()
                                        }
                                        disabled={
                                          notificationMutation.isPending ||
                                          !notificationContent.trim()
                                        }
                                        className={cx(
                                          opsTheme.buttonSoft,
                                          "mt-3 h-10"
                                        )}
                                      >
                                        {notificationMutation.isPending ? (
                                          <LoaderCircle className="h-4 w-4 animate-spin" />
                                        ) : null}
                                        알림 저장
                                      </button>
                                    </div>
                                  </StructuredSection>

                                  <StructuredSection
                                    icon={MessageSquareText}
                                    title="직접 대화 기록"
                                  >
                                    <textarea
                                      value={conversationContent}
                                      onChange={(event) =>
                                        setConversationContent(
                                          event.target.value
                                        )
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
                                      className={cx(
                                        opsTheme.buttonSoft,
                                        "mt-3 h-10"
                                      )}
                                    >
                                      대화 기록 저장
                                    </button>
                                  </StructuredSection>
                                </div>

                                <StructuredSection
                                  icon={FileText}
                                  title="활동 타임라인"
                                >
                                  {(detail?.internalEntries ?? []).length >
                                  0 ? (
                                    <div className="space-y-3">
                                      {(detail?.internalEntries ?? []).map(
                                        (entry) => (
                                          <ActivityEntryCard
                                            key={entry.id}
                                            deletePending={
                                              deletingEntryId === entry.id
                                            }
                                            editPending={
                                              updatingEntryId === entry.id
                                            }
                                            editingValue={
                                              editingEntryId === entry.id
                                                ? editingEntryContent
                                                : ""
                                            }
                                            entry={entry}
                                            isEditing={
                                              editingEntryId === entry.id
                                            }
                                            onDelete={handleDeleteEntry}
                                            onEditCancel={
                                              handleCancelEditingEntry
                                            }
                                            onEditChange={
                                              setEditingEntryContent
                                            }
                                            onEditSave={handleSaveEditedEntry}
                                            onEditStart={
                                              handleStartEditingEntry
                                            }
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
                </motion.aside>
              </div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {quickMemoLead ? (
              <div className="fixed inset-0 z-[80]">
                <motion.button
                  type="button"
                  aria-label="Close quick memo modal"
                  className="absolute inset-0 bg-beige900/24 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCloseQuickMemo}
                />
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="absolute left-1/2 top-1/2 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-beige900/10 bg-[#F4E8D8] p-4 shadow-[0_24px_80px_rgba(46,23,6,0.18)]"
                >
                  <textarea
                    value={quickMemoContent}
                    onChange={(event) =>
                      setQuickMemoContent(event.target.value)
                    }
                    className={cx(opsTheme.textarea, "min-h-[180px]")}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void handleSaveQuickMemo()}
                    disabled={isQuickMemoSaving || !quickMemoContent.trim()}
                    className={cx(opsTheme.buttonPrimary, "mt-3 h-11 w-full")}
                  >
                    {isQuickMemoSaving ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : null}
                    등록
                  </button>
                </motion.div>
              </div>
            ) : null}
          </AnimatePresence>
        </section>
      </OpsShell>
    </>
  );
}
