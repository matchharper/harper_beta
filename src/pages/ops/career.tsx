import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  useOpsCareerTalents,
  useOpsCareerDetail,
  useAddChecklistItem,
  useRefreshInsights,
  useUpdateInsights,
  useDeleteChecklistItem,
  useIngestCareerProfile,
  useOpsCareerMailHistory,
  useOpsCareerRecommendations,
  useOpsManualInternalRecommendationRoles,
  useQueueOpsManualInternalRecommendation,
  useSendCareerTalentMail,
  useUpdateOpsCareerRecommendationStage,
} from "@/hooks/useOpsCareer";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { renderEmailBodyHtmlWithHarperFooter } from "@/lib/email/harperFooter";
import { isInternalEmail } from "@/lib/internalAccess";
import {
  isEmailExcludedByOpsInternalTerms,
  useOpsInternalDataExclusionStore,
} from "@/store/useOpsInternalDataExclusionStore";
import type {
  CareerTalentDetailResponse,
  CareerTalentMailHistoryItem,
  CareerTalentRecommendationItem,
  OpsManualInternalRecommendationRole,
} from "@/lib/opsCareerServer";
import { useAuthStore } from "@/store/useAuthStore";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const FETCH_LIMIT = 40;

const readQueryValue = (value: string | string[] | undefined) => {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
};

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

const onboardingStatusLabel = (isDone: boolean) => {
  return isDone ? "완료" : "온보딩 미완료";
};

const onboardingStatusBadgeClass = (isDone: boolean) => {
  return isDone ? "bg-[#E4EDE2] text-[#29513A]" : "bg-[#FEF3C7] text-[#92400E]";
};

const mailActorLabel = (item: CareerTalentMailHistoryItem) => {
  if (item.direction === "inbound") return "유저";
  if (item.mailType === "manual_ops") return "Ops 수동";
  return "시스템";
};

const mailTypeLabel = (mailType: string) => {
  switch (mailType) {
    case "manual_ops":
      return "수동 발송";
    case "user_reply":
      return "유저 답장";
    case "auto_reply":
      return "자동 답장";
    case "onboarding":
      return "온보딩 1차";
    case "onboarding_review":
      return "온보딩 리뷰";
    case "opportunity_recommendation":
      return "추천 메일";
    default:
      return mailType;
  }
};

const mailStatusLabel = (status: string) => {
  switch (status) {
    case "queued":
      return "대기";
    case "sent":
      return "발송";
    case "received":
      return "수신";
    case "failed":
      return "실패";
    case "skipped":
      return "스킵";
    default:
      return status || "-";
  }
};

const mailStatusClass = (status: string) => {
  if (status === "sent" || status === "received") {
    return "bg-[#E4EDE2] text-[#29513A]";
  }
  if (status === "failed") return "bg-[#F7DBD3] text-[#8A2E1D]";
  return "bg-beige500/60 text-beige900/55";
};

const compactMailAddress = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized || "-";
};

const AUTO_RECOMMENDATION_STAGE_VALUE = "__auto__";
const CUSTOM_RECOMMENDATION_STAGE_VALUE = "__custom__";
const INTERNAL_RECOMMENDATION_FIXED_STAGES = [
  "회사에 전달됨",
  "회사에서 거절됨",
  "연결시켜줌",
  "채용됨",
  "프로세스종료됨",
] as const;
type RecommendationSourceFilter = "all" | "internal";
const RECOMMENDATION_SOURCE_FILTER_OPTIONS = [
  { id: "all", label: "전체 보기" },
  { id: "internal", label: "Internal만 보기" },
] as const satisfies readonly {
  id: RecommendationSourceFilter;
  label: string;
}[];

const recommendationSourceLabel = (
  sourceType: CareerTalentRecommendationItem["sourceType"]
) => (sourceType === "internal" ? "Internal" : "External");

const recommendationSourceClass = (
  sourceType: CareerTalentRecommendationItem["sourceType"]
) =>
  sourceType === "internal"
    ? "bg-[#E4EDE2] text-[#29513A]"
    : "bg-beige500/65 text-beige900/55";

const recommendationFeedbackLabel = (feedback: string | null | undefined) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") return "수락";
  if (normalized === "dislike" || normalized === "negative") return "거절";
  return "-";
};

const recommendationFeedbackClass = (feedback: string | null | undefined) => {
  const normalized = String(feedback ?? "").toLowerCase();
  if (normalized === "like" || normalized === "positive") {
    return "bg-[#E4EDE2] text-[#29513A]";
  }
  if (normalized === "dislike" || normalized === "negative") {
    return "bg-[#F7DBD3] text-[#8A2E1D]";
  }
  return "bg-beige500/55 text-beige900/40";
};

const getAutoRecommendationStageLabel = (
  item: CareerTalentRecommendationItem
) => (item.feedback ? "수락-거절함" : "추천됨");

const getRecommendationStageSelectValue = (
  item: CareerTalentRecommendationItem
) => {
  const processedStage = item.processedStage?.trim();
  if (!processedStage) return AUTO_RECOMMENDATION_STAGE_VALUE;
  return INTERNAL_RECOMMENDATION_FIXED_STAGES.includes(
    processedStage as (typeof INTERNAL_RECOMMENDATION_FIXED_STAGES)[number]
  )
    ? processedStage
    : CUSTOM_RECOMMENDATION_STAGE_VALUE;
};

function TalentListItem({
  talent,
  isActive,
  onClick,
}: {
  talent: {
    userId: string;
    name: string | null;
    email: string | null;
    headline: string | null;
    isOnboardingDone: boolean;
    insightCoverage: number;
    lastConversationAt: string | null;
  };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full text-left px-4 py-3 transition border-b border-beige900/5",
        isActive ? "bg-beige900/5" : "hover:bg-white/60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-geist text-sm font-medium text-beige900 truncate">
              {talent.name || talent.email || "이름 없음"}
            </span>
            <span
              className={cx(
                "shrink-0 rounded px-1.5 py-0.5 font-geist text-[11px] font-medium",
                onboardingStatusBadgeClass(talent.isOnboardingDone)
              )}
            >
              {onboardingStatusLabel(talent.isOnboardingDone)}
            </span>
          </div>
          {talent.headline ? (
            <div className="mt-0.5 font-geist text-xs text-beige900/50 truncate">
              {talent.headline}
            </div>
          ) : null}
          <div className="mt-1 flex items-center gap-3 font-geist text-[11px] text-beige900/40">
            <span>인사이트 {talent.insightCoverage}개</span>
            <span>{formatKst(talent.lastConversationAt)}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-beige900/25" />
      </div>
    </button>
  );
}

function TalentDetail({ userId }: { userId: string }) {
  const { data: detail, isLoading, error } = useOpsCareerDetail(userId);
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );
  const [activeTab, setActiveTab] = useState<
    "insights" | "messages" | "profile" | "mail" | "recommendations"
  >("insights");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className={cx(opsTheme.errorNotice, "m-4")}>
        {error instanceof Error
          ? error.message
          : "데이터를 불러오지 못했습니다."}
      </div>
    );
  }

  if (isEmailExcludedByOpsInternalTerms(detail.email, emailExclusionTerms)) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <MessageSquareText className="h-10 w-10 text-beige900/15" />
        <div className="mt-4 font-geist text-sm text-beige900/45">
          내부 데이터 제외 설정으로 숨긴 talent입니다.
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "insights" as const, label: "인사이트" },
    { id: "messages" as const, label: "대화 내역" },
    { id: "profile" as const, label: "프로필" },
    { id: "mail" as const, label: "메일" },
    { id: "recommendations" as const, label: "추천" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-beige900/10">
        <div className="flex items-center gap-3">
          {detail.profilePicture ? (
            <img
              src={detail.profilePicture}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-beige500/60">
              <User className="h-5 w-5 text-beige900/40" />
            </div>
          )}
          <div className="min-w-0">
            <div className="font-geist text-base font-medium text-beige900 truncate">
              {detail.name || "이름 없음"}
            </div>
            <div className="font-geist text-xs text-beige900/50 truncate">
              {detail.email ?? "-"}
            </div>
          </div>
        </div>
        {detail.headline ? (
          <div className="mt-2 font-geist text-sm text-beige900/65">
            {detail.headline}
          </div>
        ) : null}
        <div className="mt-2 flex items-center gap-3 font-geist text-xs text-beige900/40">
          <span>
            온보딩:{" "}
            <span
              className={cx(
                "rounded px-1.5 py-0.5 font-medium",
                onboardingStatusBadgeClass(detail.isOnboardingDone)
              )}
            >
              {onboardingStatusLabel(detail.isOnboardingDone)}
            </span>
          </span>
          <span>마지막 대화: {formatKst(detail.lastConversationAt)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-beige900/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cx(
              "px-4 py-2.5 font-geist text-sm transition",
              activeTab === tab.id
                ? "border-b-2 border-beige900 font-medium text-beige900"
                : "text-beige900/45 hover:text-beige900/70"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-5">
        {activeTab === "insights" && (
          <InsightsTab
            userId={userId}
            insights={detail.insights}
            mergedChecklist={detail.mergedChecklist}
            preferences={detail.preferences}
          />
        )}
        {activeTab === "messages" && <MessagesTab messages={detail.messages} />}
        {activeTab === "profile" && <ProfileTab detail={detail} />}
        {activeTab === "mail" && (
          <MailTab key={detail.userId} detail={detail} />
        )}
        {activeTab === "recommendations" && (
          <RecommendationsTab key={detail.userId} userId={detail.userId} />
        )}
      </div>
    </div>
  );
}

function InsightsTab({
  userId,
  insights,
  mergedChecklist,
  preferences,
}: {
  userId: string;
  insights: Record<string, string> | null;
  mergedChecklist: CareerTalentDetailResponse["mergedChecklist"];
  preferences: {
    engagementTypes: string[];
    preferredLocations: string[];
    careerMoveIntent: string | null;
    profileVisibility: string | null;
  } | null;
}) {
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPromptHint, setNewPromptHint] = useState("");
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);

  const addChecklistItemMutation = useAddChecklistItem();
  const refreshInsightsMutation = useRefreshInsights(userId);
  const updateInsightsMutation = useUpdateInsights(userId);
  const deleteChecklistItemMutation = useDeleteChecklistItem();

  // Sync editedValues when insights change
  useEffect(() => {
    if (!isEditing) {
      setEditedValues({});
    }
  }, [insights, isEditing]);

  const emptyCount = useMemo(() => {
    return mergedChecklist.filter((item) => !insights?.[item.key]?.trim())
      .length;
  }, [mergedChecklist, insights]);

  const hasChanges = useMemo(() => {
    return Object.entries(editedValues).some(
      ([key, val]) => val !== (insights?.[key] ?? "")
    );
  }, [editedValues, insights]);

  const handleEditChange = useCallback((key: string, value: string) => {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  function handleSave() {
    if (!hasChanges) return;
    const updates: Record<string, string> = {};
    for (const [key, val] of Object.entries(editedValues)) {
      if (val !== (insights?.[key] ?? "")) {
        updates[key] = val;
      }
    }
    if (Object.keys(updates).length === 0) return;
    updateInsightsMutation.mutate(updates, {
      onSuccess: () => {
        setIsEditing(false);
        setEditedValues({});
      },
    });
  }

  function handleDeleteChecklistItem(key: string, label: string) {
    if (
      !window.confirm(
        `'${label}' (${key}) 항목을 삭제하시겠습니까? 모든 인재에서 제거됩니다.`
      )
    )
      return;
    deleteChecklistItemMutation.mutate(key);
  }

  function handleAddItem() {
    const trimmedKey = newKey.trim();
    const trimmedLabel = newLabel.trim();
    if (!trimmedKey || !trimmedLabel) return;
    if (
      !window.confirm(
        `'${trimmedLabel}' (${trimmedKey}) 항목을 추가하시겠습니까? 이 항목은 모든 인재에게 적용됩니다.`
      )
    )
      return;
    addChecklistItemMutation.mutate(
      {
        key: trimmedKey,
        label: trimmedLabel,
        promptHint: newPromptHint.trim() || undefined,
      },
      {
        onSuccess: () => {
          setNewKey("");
          setNewLabel("");
          setNewPromptHint("");
        },
      }
    );
  }

  function handleRefresh() {
    if (
      !window.confirm(
        `빈 인사이트 항목 ${emptyCount}개를 LLM으로 추출합니다. 기존 값은 변경되지 않습니다.`
      )
    )
      return;
    refreshInsightsMutation.mutate();
  }

  return (
    <div className="space-y-4">
      {/* Preferences */}
      {preferences && (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>선호 설정</div>
          <div className="space-y-1.5 font-geist text-sm text-beige900/80">
            {preferences.engagementTypes.length > 0 && (
              <div>
                <span className="text-beige900/45">근무 형태:</span>{" "}
                {preferences.engagementTypes.join(", ")}
              </div>
            )}
            {preferences.preferredLocations.length > 0 && (
              <div>
                <span className="text-beige900/45">선호 지역:</span>{" "}
                {preferences.preferredLocations.join(", ")}
              </div>
            )}
            {preferences.careerMoveIntent && (
              <div>
                <span className="text-beige900/45">이직 의향:</span>{" "}
                {preferences.careerMoveIntent}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Insights section header + action buttons */}
      <div className="flex items-center justify-between">
        <div className={opsTheme.eyebrow}>인사이트</div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditedValues({});
                }}
                className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || updateInsightsMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5",
                  (!hasChanges || updateInsightsMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {updateInsightsMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className={cx(opsTheme.buttonSecondary, "h-8 px-3 text-xs")}
              >
                편집
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={emptyCount === 0 || refreshInsightsMutation.isPending}
                className={cx(
                  opsTheme.buttonSecondary,
                  "h-8 px-3 text-xs flex items-center gap-1.5",
                  (emptyCount === 0 || refreshInsightsMutation.isPending) &&
                    "opacity-50 cursor-not-allowed"
                )}
              >
                {refreshInsightsMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    추출 중...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3.5 w-3.5" />빈 항목 {emptyCount}개
                    추출
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Checklist items — ALL items in priority order */}
      <div className="space-y-2">
        {mergedChecklist.map((item) => {
          const savedValue = insights?.[item.key] ?? "";
          const displayValue = isEditing
            ? (editedValues[item.key] ?? savedValue)
            : savedValue.trim();
          const isFilled = Boolean(savedValue.trim());
          return (
            <div
              key={item.key}
              className={cx(
                "p-3 rounded-md",
                isFilled
                  ? cx(opsTheme.panelSoft)
                  : "border border-dashed border-beige900/20 bg-white/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={opsTheme.eyebrow}>{item.label}</div>
                  {item.source === "db" && (
                    <span className="rounded px-1 py-0.5 font-geist text-[10px] bg-beige500/50 text-beige900/50">
                      custom
                    </span>
                  )}
                </div>
                {item.source === "db" && !isEditing && (
                  <button
                    type="button"
                    onClick={() =>
                      handleDeleteChecklistItem(item.key, item.label)
                    }
                    disabled={deleteChecklistItemMutation.isPending}
                    className="p-1 rounded hover:bg-beige500/30 text-beige900/30 hover:text-red-500 transition-colors"
                    title="항목 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={displayValue}
                  onChange={(e) => handleEditChange(item.key, e.target.value)}
                  rows={2}
                  className={cx(
                    opsTheme.input,
                    "mt-1 w-full text-sm font-geist resize-y min-h-10"
                  )}
                  placeholder="값을 입력하세요..."
                />
              ) : isFilled ? (
                <div className="mt-1 whitespace-pre-wrap font-geist text-sm text-beige900/80">
                  {displayValue}
                </div>
              ) : (
                <div className="mt-1 font-geist text-sm text-beige900/30 italic">
                  미입력
                </div>
              )}
            </div>
          );
        })}
        {mergedChecklist.length === 0 && (
          <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
            추출된 인사이트가 없습니다.
          </div>
        )}
      </div>

      {/* Add checklist item form */}
      <div className={cx(opsTheme.panelSoft, "p-4 space-y-3")}>
        <div className={cx(opsTheme.eyebrow, "mb-1")}>체크리스트 항목 추가</div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="영문 키 (snake_case)"
            value={newKey}
            onChange={(e) =>
              setNewKey(e.target.value.replace(/[^a-z0-9_]/g, ""))
            }
            className={cx(opsTheme.input, "h-8 text-xs flex-1")}
          />
          <input
            type="text"
            placeholder="한국어 라벨"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className={cx(opsTheme.input, "h-8 text-xs flex-1")}
          />
        </div>
        <input
          type="text"
          placeholder="프롬프트 힌트 (선택)"
          value={newPromptHint}
          onChange={(e) => setNewPromptHint(e.target.value)}
          className={cx(opsTheme.input, "h-8 text-xs w-full")}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="font-geist text-[11px] text-beige900/40">
            이 항목은 수동 추출만 지원됩니다
          </p>
          <button
            type="button"
            onClick={handleAddItem}
            disabled={
              !newKey.trim() ||
              !newLabel.trim() ||
              addChecklistItemMutation.isPending
            }
            className={cx(
              opsTheme.buttonSecondary,
              "h-8 px-3 text-xs flex items-center gap-1.5 shrink-0",
              (!newKey.trim() ||
                !newLabel.trim() ||
                addChecklistItemMutation.isPending) &&
                "opacity-50 cursor-not-allowed"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            항목 추가
          </button>
        </div>
      </div>
    </div>
  );
}

function MessagesTab({
  messages,
}: {
  messages: Array<{
    id: number;
    role: string;
    content: string;
    messageType: string | null;
    createdAt: string;
  }>;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
        대화 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cx(
            "rounded-lg px-4 py-3 font-geist text-sm",
            msg.role === "assistant"
              ? "bg-beige500/40 text-beige900/80"
              : "bg-white/70 text-beige900"
          )}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={cx(opsTheme.eyebrow)}>
              {msg.role === "assistant" ? "Harper" : "Talent"}
            </span>
            <span className="font-geist text-[10px] text-beige900/30">
              {formatKst(msg.createdAt)}
            </span>
          </div>
          <div className="whitespace-pre-wrap">{msg.content}</div>
        </div>
      ))}
    </div>
  );
}

function MailHistoryPanel({ userId }: { userId: string }) {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerMailHistory(userId, 10);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const messages = useMemo(
    () => data?.pages.flatMap((page) => page.messages) ?? [],
    [data]
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <div className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Mail History</div>
          <div className="mt-1 font-geist text-xs text-beige900/45">
            시스템 발송, Ops 수동 발송, 유저 답장
          </div>
        </div>
        <Mail className="h-4 w-4 shrink-0 text-beige900/30" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
        </div>
      ) : error ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>
          {error instanceof Error
            ? error.message
            : "메일 기록을 불러오지 못했습니다."}
        </div>
      ) : messages.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
          저장된 메일 기록이 없습니다.
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-md border border-beige900/10 bg-white/55">
            <table className="min-w-[820px] w-full table-fixed border-collapse font-geist text-xs">
              <thead className="bg-beige500/45 text-left text-beige900/45">
                <tr>
                  <th className="w-[150px] px-3 py-2 font-medium">일시</th>
                  <th className="w-[100px] px-3 py-2 font-medium">구분</th>
                  <th className="w-[170px] px-3 py-2 font-medium">발신</th>
                  <th className="w-[170px] px-3 py-2 font-medium">수신</th>
                  <th className="px-3 py-2 font-medium">제목</th>
                  <th className="w-[90px] px-3 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige900/10">
                {messages.map((item) => {
                  const isExpanded = expandedIds.has(item.id);
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleExpanded(item.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleExpanded(item.id);
                          }
                        }}
                        className="cursor-pointer text-beige900/70 transition hover:bg-white/70"
                      >
                        <td className="px-3 py-2 align-top text-beige900/45">
                          {formatKst(item.occurredAt)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex items-center gap-1.5">
                            <ChevronDown
                              className={cx(
                                "h-3.5 w-3.5 shrink-0 text-beige900/30 transition",
                                isExpanded ? "rotate-0" : "-rotate-90"
                              )}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-beige900/75">
                                {mailActorLabel(item)}
                              </div>
                              <div className="truncate text-[11px] text-beige900/35">
                                {mailTypeLabel(item.mailType)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top"
                          title={compactMailAddress(item.fromEmail)}
                        >
                          {compactMailAddress(item.fromEmail)}
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top"
                          title={compactMailAddress(item.toEmail)}
                        >
                          {compactMailAddress(item.toEmail)}
                        </td>
                        <td
                          className="truncate px-3 py-2 align-top font-medium text-beige900/80"
                          title={item.subject ?? "(제목 없음)"}
                        >
                          {item.subject?.trim() || "(제목 없음)"}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <span
                            className={cx(
                              "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                              mailStatusClass(item.status)
                            )}
                          >
                            {mailStatusLabel(item.status)}
                          </span>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={6} className="bg-white/65 px-3 py-3">
                            <div className="rounded-md border border-beige900/10 bg-white/70 px-3 py-3 font-geist text-xs leading-5 text-beige900/70">
                              {item.bodyText?.trim() ? (
                                <div className="whitespace-pre-wrap">
                                  {item.bodyText.trim()}
                                </div>
                              ) : (
                                <div className="text-beige900/35">
                                  저장된 본문이 없습니다.
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  "10개 더 보기"
                )}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function MailTab({ detail }: { detail: CareerTalentDetailResponse }) {
  const sendMail = useSendCareerTalentMail();
  const [fromEmail, setFromEmail] = useState("Harper <hello@matchharper.com>");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [previewDate] = useState(() =>
    new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  );

  const recipientLabel = detail.name
    ? `${detail.name} <${detail.email ?? "email 없음"}>`
    : (detail.email ?? "email 없음");
  const previewHtml = useMemo(
    () => renderEmailBodyHtmlWithHarperFooter(content),
    [content]
  );
  const canSend =
    Boolean(detail.email?.trim()) &&
    Boolean(fromEmail.trim()) &&
    Boolean(subject.trim()) &&
    Boolean(content.trim()) &&
    !sendMail.isPending;

  async function handleSend() {
    if (!canSend) return;
    const recipient = detail.email?.trim();
    if (!recipient) return;
    if (!window.confirm(`${recipient}에게 메일을 발송할까요?`)) return;

    setNotice("");
    setError("");

    try {
      const result = await sendMail.mutateAsync({
        content: content.trim(),
        fromEmail: fromEmail.trim(),
        subject: subject.trim(),
        userId: detail.userId,
      });
      setNotice(`${result.recipientEmail}로 발송했습니다.`);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "메일 발송에 실패했습니다."
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Recipient</div>
          <div className="mt-1 break-all font-geist text-sm font-medium text-beige900">
            {recipientLabel}
          </div>
        </div>
        <Mail className="h-5 w-5 shrink-0 text-beige900/25" />
      </div>

      {!detail.email?.trim() ? (
        <div className={opsTheme.errorNotice}>
          이 talent에는 등록된 이메일이 없어 발송할 수 없습니다.
        </div>
      ) : null}
      {notice ? <div className={opsTheme.successNotice}>{notice}</div> : null}
      {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <div className={cx("space-y-3")}>
          <label className="block">
            <span className={opsTheme.label}>From</span>
            <input
              type="text"
              value={fromEmail}
              onChange={(event) => setFromEmail(event.target.value)}
              placeholder="Harper <chris@matchharper.com>"
              className={cx(opsTheme.input, "mt-2")}
            />
          </label>
          <label className="block">
            <span className={opsTheme.label}>Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="메일 제목"
              className={cx(opsTheme.input, "mt-2")}
            />
          </label>
          <label className="block">
            <span className={opsTheme.label}>Body</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={`안녕하세요 ${detail.name ?? "후보자"}님,\n\n\n\n감사합니다.\nHarper 드림`}
              className={cx(opsTheme.textarea, "mt-2 min-h-[260px]")}
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            className={cx(opsTheme.buttonPrimary, "h-11 w-full")}
          >
            {sendMail.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            발송
          </button>
        </div>

        <div className="rounded-lg border border-black/10 bg-white shadow-[0_16px_42px_rgba(0,0,0,0.08)]">
          <div className="border-b border-black/10 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-geist text-base font-semibold text-[#202124]">
                  {subject.trim() || "(제목 없음)"}
                </div>
                <div className="mt-1 truncate font-geist text-xs text-[#5f6368]">
                  From: {fromEmail.trim() || "sender@matchharper.com"}
                </div>
                <div className="mt-0.5 truncate font-geist text-xs text-[#5f6368]">
                  To: {recipientLabel}
                </div>
              </div>
              <div className="shrink-0 font-geist text-xs text-[#5f6368]">
                {previewDate}
              </div>
            </div>
          </div>
          <div className="min-h-[300px] px-5 py-5 font-geist text-sm leading-6 text-[#202124]">
            {content.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <div className="text-[#5f6368]">
                본문을 입력하면 발송될 이메일 형태로 표시됩니다.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-beige900/35" />
          <div className={opsTheme.eyebrow}>Link Format</div>
        </div>
        <div className="mt-3 space-y-2 font-geist text-xs leading-5 text-beige900/65">
          <div>
            링크는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              [보여줄 문구](https://example.com)
            </code>{" "}
            형식으로 넣으면 됩니다.
          </div>
          <div>
            이메일 링크는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              [Chris에게 문의](mailto:chris@matchharper.com)
            </code>
            처럼 넣으세요.
          </div>
          <div>
            발신자 표시명을 바꾸려면 From에{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              Harper &lt;chris@matchharper.com&gt;
            </code>
            처럼 쓰면 됩니다. Resend에서 인증된 도메인의 주소만 실제 발송됩니다.
          </div>
          <div>
            굵게는{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              **텍스트**
            </code>
            , 목록은 줄 앞에{" "}
            <code className="rounded bg-beige500/60 px-1.5 py-0.5 font-mono text-[11px]">
              -
            </code>
            를 붙이면 미리보기와 발송 HTML에 반영됩니다.
          </div>
        </div>
      </div>

      <MailHistoryPanel userId={detail.userId} />
    </div>
  );
}

function ManualInternalRecommendationModal({
  onClose,
  onQueued,
  open,
  userId,
}: {
  onClose: () => void;
  onQueued: (result: {
    role: OpsManualInternalRecommendationRole;
    runId: string;
  }) => void;
  open: boolean;
  userId: string;
}) {
  const [roleSearch, setRoleSearch] = useState("");
  const [selectedRole, setSelectedRole] =
    useState<OpsManualInternalRecommendationRole | null>(null);
  const [reason, setReason] = useState("");
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [error, setError] = useState("");
  const rolesQuery = useOpsManualInternalRecommendationRoles(
    roleSearch,
    40,
    open
  );
  const queueRecommendation = useQueueOpsManualInternalRecommendation();

  function resetModalState() {
    setRoleSearch("");
    setSelectedRole(null);
    setReason("");
    setReasonModalOpen(false);
    setError("");
  }

  function handleClose() {
    resetModalState();
    onClose();
  }

  const roles = rolesQuery.data?.roles ?? [];
  const selectedDescriptionSummary = selectedRole?.descriptionSummary?.trim();
  const selectedDescription = selectedRole?.description?.trim();
  const showSelectedDescription =
    selectedDescription && selectedDescription !== selectedDescriptionSummary;
  const canOpenReason = Boolean(selectedRole) && !queueRecommendation.isPending;
  const canSubmit = Boolean(selectedRole) && !queueRecommendation.isPending;

  function handleOpenReasonModal() {
    if (!selectedRole || !canOpenReason) return;
    setError("");
    setReasonModalOpen(true);
  }

  function handleReasonClose() {
    if (queueRecommendation.isPending) return;
    setError("");
    setReasonModalOpen(false);
  }

  async function handleSubmit() {
    if (!selectedRole || !canSubmit) return;
    setError("");
    try {
      const result = await queueRecommendation.mutateAsync({
        reason: reason.trim() || null,
        roleId: selectedRole.roleId,
        userId,
      });
      onQueued({
        role: result.role,
        runId: result.run.id,
      });
      handleClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "추천 등록에 실패했습니다."
      );
    }
  }

  return (
    <>
      <TalentCareerModal
        open={open && !reasonModalOpen}
        onClose={handleClose}
        title="Internal 추천 등록"
        panelClassName="flex h-[760px] max-h-[88vh] max-w-[1120px] flex-col border border-beige900/10 bg-beige50"
        headerClassName="shrink-0 border-b border-beige900/10 bg-beige50 pr-16"
        bodyClassName="min-h-0 flex-1 overflow-hidden bg-beige50 p-0"
        footerClassName="shrink-0 border-t border-beige900/10 bg-beige50"
        closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleOpenReasonModal}
              disabled={!canOpenReason}
              className={cx(
                opsTheme.buttonPrimary,
                "h-9 px-4 text-xs",
                !canOpenReason && "cursor-not-allowed opacity-50"
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              등록
            </button>
          </div>
        }
      >
        <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,0.85fr)_minmax(360px,0.85fr)] lg:overflow-hidden">
          <div className="flex min-w-0 flex-col border-b border-beige900/10 lg:border-b-0 lg:border-r">
            <div className="border-b border-beige900/10 px-5 py-4">
              <label className="block">
                <span className={opsTheme.label}>Internal role</span>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/30" />
                  <input
                    type="text"
                    value={roleSearch}
                    onChange={(event) => setRoleSearch(event.target.value)}
                    placeholder="회사, role, location 검색"
                    className={cx(opsTheme.input, "h-10 pl-9 text-sm")}
                  />
                </div>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {rolesQuery.isLoading ? (
                <div className="flex h-full min-h-[280px] items-center justify-center">
                  <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
                </div>
              ) : rolesQuery.error ? (
                <div className={opsTheme.errorNotice}>
                  {rolesQuery.error instanceof Error
                    ? rolesQuery.error.message
                    : "Internal role을 불러오지 못했습니다."}
                </div>
              ) : roles.length === 0 ? (
                <div className="flex h-full min-h-[280px] items-center justify-center rounded-md border border-dashed border-beige900/15 bg-white/30 font-geist text-sm text-beige900/40">
                  선택 가능한 internal role이 없습니다.
                </div>
              ) : (
                <div className="overflow-hidden rounded-md border border-beige900/10 bg-white/55">
                  <div className="max-h-[440px] overflow-auto">
                    <table className="w-full min-w-[760px] table-fixed border-collapse font-geist text-xs">
                      <thead className="sticky top-0 z-[1] bg-beige500/45 text-left text-beige900/45">
                        <tr>
                          <th className="w-[140px] px-3 py-2 font-medium">
                            회사
                          </th>
                          <th className="px-3 py-2 font-medium">역할</th>
                          <th className="w-[180px] px-3 py-2 font-medium">
                            Location
                          </th>
                          <th className="w-[96px] px-3 py-2 font-medium">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-beige900/10">
                        {roles.map((role) => {
                          const active = selectedRole?.roleId === role.roleId;
                          return (
                            <tr
                              key={role.roleId}
                              role="button"
                              tabIndex={0}
                              aria-pressed={active}
                              onClick={() => setSelectedRole(role)}
                              onKeyDown={(event) => {
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  setSelectedRole(role);
                                }
                              }}
                              className={cx(
                                "cursor-pointer align-top transition hover:opacity-80",
                                active
                                  ? "bg-[#2E1706] text-beige100"
                                  : "text-beige900/70"
                              )}
                            >
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top font-medium",
                                  active ? "text-beige100" : "text-beige900/75"
                                )}
                                title={role.companyName}
                              >
                                {role.companyName}
                              </td>
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top text-[13px] font-normal",
                                  active ? "text-beige100" : "text-beige900/85"
                                )}
                                title={role.roleName}
                              >
                                {role.roleName}
                              </td>
                              <td
                                className={cx(
                                  "truncate px-3 py-3 align-top",
                                  active
                                    ? "text-beige100/70"
                                    : "text-beige900/45"
                                )}
                                title={role.locationText ?? undefined}
                              >
                                {role.locationText || "-"}
                              </td>
                              <td className="px-3 py-3 align-top">
                                <span
                                  className={cx(
                                    "inline-flex max-w-full items-center truncate rounded border px-1 text-[11px] font-medium",
                                    active
                                      ? "border-beige100/25 bg-white/10 text-beige100"
                                      : "border-beige900/10 bg-white/75 text-beige900/45"
                                  )}
                                >
                                  {role.status ?? "active"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>

          <aside className="flex min-h-0 flex-col bg-beige500/20 px-5 py-5">
            {selectedRole ? (
              <>
                <div className="">
                  <div className="font-geist text-base font-medium text-beige900">
                    {selectedRole.roleName}
                  </div>
                  <div className="mt-1 font-geist text-sm text-beige900/85">
                    {selectedRole.companyName}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-geist text-xs text-beige900/45">
                    <div className="min-w-0 truncate">
                      {selectedRole.locationText || "Location 없음"}
                    </div>
                    <div className="min-w-0 truncate text-right">
                      {formatKst(selectedRole.updatedAt)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 min-h-0 flex-1 overflow-y-auto font-geist text-sm leading-6 text-beige900/90 pb-4">
                  {selectedDescriptionSummary ? (
                    <div className="whitespace-pre-wrap break-words font-medium text-beige900/85">
                      {selectedDescriptionSummary}
                    </div>
                  ) : null}
                  {showSelectedDescription ? (
                    <div
                      className={cx(
                        "whitespace-pre-wrap break-words",
                        selectedDescriptionSummary && "mt-4 text-beige900/65"
                      )}
                    >
                      {selectedDescription}
                    </div>
                  ) : null}
                  {!selectedDescriptionSummary && !showSelectedDescription ? (
                    <div className="text-beige900/35">
                      이 role에는 아직 description이 없습니다.
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-3 flex flex-1 items-center justify-center rounded-md border border-dashed border-beige900/15 bg-white/30 p-6 text-center font-geist text-sm text-beige900/40">
                왼쪽 테이블에서 role을 선택하면 상세 description이 여기에
                표시됩니다.
              </div>
            )}
          </aside>
        </div>
      </TalentCareerModal>

      <TalentCareerModal
        open={open && reasonModalOpen}
        onClose={handleReasonClose}
        title="추천 이유 입력"
        description="추천 이유를 작성해주세요. 작성하지 않거나 대충 작성하더라도 Harper가 알아서 잘 작성해서 추천하게 됩니다."
        panelClassName="max-w-[560px] border border-beige900/10 bg-beige50"
        headerClassName="border-b border-beige900/10 bg-beige50 pr-16"
        bodyClassName="bg-beige50 p-5"
        footerClassName="border-t border-beige900/10 bg-beige50"
        closeButtonClassName="font-geist right-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-beige900/10 bg-white/70 text-beige900/70 transition-colors hover:border-beige900/25 hover:text-beige900"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleReasonClose}
              disabled={queueRecommendation.isPending}
              className={cx(
                opsTheme.buttonSecondary,
                "h-9 px-4 text-xs",
                queueRecommendation.isPending && "cursor-not-allowed opacity-50"
              )}
            >
              이전
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className={cx(
                opsTheme.buttonPrimary,
                "h-9 px-4 text-xs",
                !canSubmit && "cursor-not-allowed opacity-50"
              )}
            >
              {queueRecommendation.isPending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              제출
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedRole ? (
            <div className="font-geist">
              <div className="text-sm font-ㅡㄷ야ㅕㅡ text-beige900">
                {selectedRole.roleName}
              </div>
              <div className="mt-1 text-xs text-beige900/55">
                {selectedRole.companyName}
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className={opsTheme.label}>추천 이유 (optional)</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 최근 agent workflow 경험과 잘 맞고, Harper가 직접 연결할 수 있는 팀이라 우선 제안하고 싶음"
              className={cx(opsTheme.textarea, "mt-2 min-h-[180px] resize-y")}
              maxLength={2000}
            />
          </label>

          {error ? <div className={opsTheme.errorNotice}>{error}</div> : null}
        </div>
      </TalentCareerModal>
    </>
  );
}

function RecommendationsTab({ userId }: { userId: string }) {
  const [sourceFilter, setSourceFilter] =
    useState<RecommendationSourceFilter>("all");
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerRecommendations(userId, 20, true, sourceFilter);
  const updateStage = useUpdateOpsCareerRecommendationStage();
  const [customOpenIds, setCustomOpenIds] = useState<Set<string>>(
    () => new Set()
  );
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stageError, setStageError] = useState("");
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualNotice, setManualNotice] = useState("");

  const recommendations = useMemo(
    () => data?.pages.flatMap((page) => page.recommendations) ?? [],
    [data]
  );
  const emptyRecommendationMessage =
    sourceFilter === "internal"
      ? "연결된 Internal 기회가 없습니다."
      : "저장된 추천 기록이 없습니다.";

  const saveStage = useCallback(
    async (
      item: CareerTalentRecommendationItem,
      processedStage: string | null
    ) => {
      if (item.sourceType !== "internal") return;
      setSavingId(item.recommendationId);
      setStageError("");
      try {
        await updateStage.mutateAsync({
          processedStage,
          recommendationId: item.recommendationId,
          userId,
        });
      } catch (stageUpdateError) {
        setStageError(
          stageUpdateError instanceof Error
            ? stageUpdateError.message
            : "추천 상태를 저장하지 못했습니다."
        );
      } finally {
        setSavingId(null);
      }
    },
    [updateStage, userId]
  );

  const closeCustomEditor = useCallback((recommendationId: string) => {
    setCustomOpenIds((prev) => {
      const next = new Set(prev);
      next.delete(recommendationId);
      return next;
    });
  }, []);

  const openCustomEditor = useCallback(
    (item: CareerTalentRecommendationItem) => {
      setCustomOpenIds((prev) => {
        const next = new Set(prev);
        next.add(item.recommendationId);
        return next;
      });
      setCustomDrafts((prev) => ({
        ...prev,
        [item.recommendationId]:
          prev[item.recommendationId] ?? item.processedStage ?? "",
      }));
    },
    []
  );

  const handleStageSelect = useCallback(
    async (item: CareerTalentRecommendationItem, value: string) => {
      if (value === CUSTOM_RECOMMENDATION_STAGE_VALUE) {
        openCustomEditor(item);
        return;
      }

      closeCustomEditor(item.recommendationId);
      await saveStage(
        item,
        value === AUTO_RECOMMENDATION_STAGE_VALUE ? null : value
      );
    },
    [closeCustomEditor, openCustomEditor, saveStage]
  );

  const handleCustomSave = useCallback(
    async (item: CareerTalentRecommendationItem) => {
      const draft = (customDrafts[item.recommendationId] ?? "").trim();
      if (!draft) return;
      await saveStage(item, draft);
      closeCustomEditor(item.recommendationId);
    },
    [closeCustomEditor, customDrafts, saveStage]
  );

  return (
    <div className={cx(opsTheme.panelSoft, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={opsTheme.eyebrow}>Recommendations</div>
          <div className="mt-1 font-geist text-xs text-beige900/45">
            Internal / External 추천 기록, 열람, 클릭, 피드백, 진행 상태
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setManualNotice("");
              setManualModalOpen(true);
            }}
            className={cx(opsTheme.buttonPrimary, "h-8 px-3 text-xs")}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Internal 추천 등록
          </button>
          <div
            role="radiogroup"
            aria-label="추천 표시 범위"
            className="flex items-center gap-1.5 rounded-md border border-beige900/10 bg-white/55 px-2 py-1 font-geist text-[11px] text-beige900/55"
          >
            {RECOMMENDATION_SOURCE_FILTER_OPTIONS.map((option) => (
              <label
                key={option.id}
                className={cx(
                  "inline-flex h-6 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded px-1 transition",
                  sourceFilter === option.id
                    ? "text-beige900"
                    : "hover:text-beige900/75"
                )}
              >
                <input
                  type="radio"
                  name={`recommendation-source-filter-${userId}`}
                  value={option.id}
                  checked={sourceFilter === option.id}
                  onChange={() => setSourceFilter(option.id)}
                  className="h-3 w-3 accent-beige900"
                />
                {option.label}
              </label>
            ))}
          </div>
          <FileText className="h-4 w-4 shrink-0 text-beige900/30" />
        </div>
      </div>

      {stageError ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>{stageError}</div>
      ) : null}
      {manualNotice ? (
        <div className={cx(opsTheme.successNotice, "mt-4")}>{manualNotice}</div>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
        </div>
      ) : error ? (
        <div className={cx(opsTheme.errorNotice, "mt-4")}>
          {error instanceof Error
            ? error.message
            : "추천 기록을 불러오지 못했습니다."}
        </div>
      ) : recommendations.length === 0 ? (
        <div className="mt-4 rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
          {emptyRecommendationMessage}
        </div>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-md border border-beige900/10 bg-white/55">
            <table className="min-w-[1080px] w-full table-fixed border-collapse font-geist text-xs">
              <thead className="bg-beige500/45 text-left text-beige900/45">
                <tr>
                  <th className="w-[135px] px-2 py-2 font-medium">추천일</th>
                  <th className="w-[90px] px-2 py-2 font-medium">구분</th>
                  <th className="px-2 py-2 font-medium">회사 / 역할</th>
                  <th className="w-[150px] px-2 py-2 font-medium">
                    열람 / 클릭
                  </th>
                  <th className="w-[150px] px-2 py-2 font-medium">피드백</th>
                  <th className="w-[230px] px-2 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige900/10">
                {recommendations.map((item) => {
                  const isInternal = item.sourceType === "internal";
                  const selectValue = getRecommendationStageSelectValue(item);
                  const isSavedCustom =
                    selectValue === CUSTOM_RECOMMENDATION_STAGE_VALUE &&
                    Boolean(item.processedStage?.trim());
                  const isCustomOpen =
                    isInternal &&
                    (customOpenIds.has(item.recommendationId) || isSavedCustom);
                  const customDraft =
                    customDrafts[item.recommendationId] ??
                    item.processedStage ??
                    "";
                  const isSaving = savingId === item.recommendationId;

                  return (
                    <tr
                      key={item.recommendationId}
                      className="text-beige900/70 transition hover:bg-white/70"
                    >
                      <td className="px-2 py-2 align-top text-beige900/45">
                        {formatKst(item.recommendedAt)}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span
                          className={cx(
                            "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                            recommendationSourceClass(item.sourceType)
                          )}
                        >
                          {recommendationSourceLabel(item.sourceType)}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="min-w-0">
                          <div
                            className="truncate font-medium text-beige900/85"
                            title={item.roleName}
                          >
                            {item.roleName}
                          </div>
                          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-beige900/45">
                            <span className="truncate" title={item.companyName}>
                              {item.companyName}
                            </span>
                            {item.externalJdUrl ? (
                              <a
                                href={item.externalJdUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 text-beige900/45 transition hover:text-beige900"
                                title="JD 열기"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                          {item.locationText ? (
                            <div className="mt-0.5 truncate text-[11px] text-beige900/35">
                              {item.locationText}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top text-[11px]">
                        <div
                          className={cx(
                            item.viewedAt
                              ? "text-beige900/65"
                              : "text-beige900/30"
                          )}
                        >
                          {item.viewedAt
                            ? `열람 ${formatKst(item.viewedAt)}`
                            : "미열람"}
                        </div>
                        <div
                          className={cx(
                            "mt-0.5",
                            item.clickedAt
                              ? "text-beige900/65"
                              : "text-beige900/30"
                          )}
                        >
                          {item.clickedAt
                            ? `클릭 ${formatKst(item.clickedAt)}`
                            : "미클릭"}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span
                          className={cx(
                            "inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium",
                            recommendationFeedbackClass(item.feedback)
                          )}
                        >
                          {recommendationFeedbackLabel(item.feedback)}
                        </span>
                        {item.feedbackAt ? (
                          <div className="mt-1 text-[11px] text-beige900/35">
                            {formatKst(item.feedbackAt)}
                          </div>
                        ) : null}
                        {item.feedbackReason ? (
                          <div
                            className="mt-0.5 truncate text-[11px] text-beige900/45"
                            title={item.feedbackReason}
                          >
                            {item.feedbackReason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top">
                        {isInternal ? (
                          <div className="space-y-1.5">
                            <select
                              value={selectValue}
                              onChange={(event) =>
                                void handleStageSelect(item, event.target.value)
                              }
                              disabled={isSaving}
                              className="h-8 w-full rounded-md border border-beige900/10 bg-white/80 px-2 font-geist text-xs text-beige900 outline-none transition focus:border-beige900/25 disabled:opacity-50"
                            >
                              <option value={AUTO_RECOMMENDATION_STAGE_VALUE}>
                                {getAutoRecommendationStageLabel(item)}
                              </option>
                              {INTERNAL_RECOMMENDATION_FIXED_STAGES.map(
                                (stage) => (
                                  <option key={stage} value={stage}>
                                    {stage}
                                  </option>
                                )
                              )}
                              <option value={CUSTOM_RECOMMENDATION_STAGE_VALUE}>
                                기타(주관식)
                              </option>
                            </select>
                            {isCustomOpen ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={customDraft}
                                  onChange={(event) =>
                                    setCustomDrafts((prev) => ({
                                      ...prev,
                                      [item.recommendationId]:
                                        event.target.value,
                                    }))
                                  }
                                  placeholder="상태 입력"
                                  className="h-8 min-w-0 flex-1 rounded-md border border-beige900/10 bg-white/80 px-2 font-geist text-xs text-beige900 outline-none transition placeholder:text-beige900/35 focus:border-beige900/25"
                                />
                                <button
                                  type="button"
                                  onClick={() => void handleCustomSave(item)}
                                  disabled={isSaving || !customDraft.trim()}
                                  className={cx(
                                    opsTheme.buttonSecondary,
                                    "h-8 px-2 text-xs"
                                  )}
                                >
                                  {isSaving ? (
                                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-beige900/45">
                            {item.effectiveStage}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hasNextPage ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className={cx(opsTheme.buttonSecondary, "h-9 px-4 text-xs")}
              >
                {isFetchingNextPage ? (
                  <>
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    불러오는 중...
                  </>
                ) : (
                  "20개 더 보기"
                )}
              </button>
            </div>
          ) : null}
        </>
      )}

      <ManualInternalRecommendationModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        userId={userId}
        onQueued={({ role, runId }) => {
          setManualNotice(
            `${role.roleName} at ${role.companyName} 추천 run을 등록했습니다. (${runId})`
          );
        }}
      />
    </div>
  );
}

const getLinkedinProfileUrl = (links: string[]) =>
  links.find((link) => /linkedin\.com\/in\//i.test(link)) ?? null;

const normalizeRegisteredLinkHref = (link: string) =>
  /^https?:\/\//i.test(link) ? link : `https://${link}`;

const formatRegisteredLinkLabel = (link: string) => {
  try {
    const url = new URL(normalizeRegisteredLinkHref(link));
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return link;
  }
};

const getResumeFileDisplayName = (detail: CareerTalentDetailResponse) => {
  const fileName = detail.resumeFileName?.trim();
  if (fileName) return fileName;
  return detail.resumeStoragePath?.trim() ? "파일명 없이 저장됨" : null;
};

function ProfileTab({ detail }: { detail: CareerTalentDetailResponse }) {
  const experiences = (detail.structuredProfile?.experiences ?? []) as Array<{
    role?: string;
    description?: string | null;
    company_name?: string;
    start_date?: string;
    end_date?: string;
  }>;
  const educations = (detail.structuredProfile?.educations ?? []) as Array<{
    school?: string;
    degree?: string;
    description?: string | null;
    field?: string;
  }>;
  const extras = (detail.structuredProfile?.extras ?? []) as Array<{
    title?: string | null;
    description?: string | null;
    date?: string | null;
  }>;
  const registeredLinks = detail.registeredLinks;
  const resumeFileDisplayName = getResumeFileDisplayName(detail);
  const hasResumeFile = Boolean(resumeFileDisplayName);
  const hasResumeText = Boolean(detail.resumeTextAvailable);
  const linkedinUrl = useMemo(
    () => getLinkedinProfileUrl(registeredLinks),
    [registeredLinks]
  );
  const ingestProfileMutation = useIngestCareerProfile(detail.userId);
  const [ingestStatus, setIngestStatus] = useState<{
    userId: string;
    type: "success" | "error";
    text: string;
  } | null>(null);
  const visibleIngestStatus =
    ingestStatus?.userId === detail.userId ? ingestStatus : null;

  function handleIngestProfile() {
    if (!linkedinUrl || ingestProfileMutation.isPending) return;
    if (
      !window.confirm(
        "등록된 LinkedIn 링크로 프로필 정보를 가져와 talent_* 테이블을 갱신합니다."
      )
    ) {
      return;
    }

    setIngestStatus(null);
    ingestProfileMutation.mutate(undefined, {
      onSuccess: (result) => {
        const stats = result.ingestion.stats;
        setIngestStatus({
          userId: detail.userId,
          type: "success",
          text: `완료: 경력 ${stats.experiencesSaved}개, 학력 ${stats.educationsSaved}개, 기타 ${stats.extrasSaved}개 저장`,
        });
      },
      onError: (error) => {
        setIngestStatus({
          userId: detail.userId,
          type: "error",
          text:
            error instanceof Error
              ? error.message
              : "프로필 정보를 가져오지 못했습니다.",
        });
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className={cx(opsTheme.panelSoft, "p-4")}>
        <div className="flex items-center justify-between gap-3">
          <div className={cx(opsTheme.eyebrow)}>등록 자료</div>
          {linkedinUrl ? (
            <button
              type="button"
              onClick={handleIngestProfile}
              disabled={ingestProfileMutation.isPending}
              className={cx(
                opsTheme.buttonSecondary,
                "h-8 px-3 text-xs flex items-center gap-1.5 shrink-0",
                ingestProfileMutation.isPending &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {ingestProfileMutation.isPending ? (
                <>
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  가져오는 중...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  LinkedIn으로 프로필 생성
                </>
              )}
            </button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-beige900/10 bg-white/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 font-geist text-xs font-medium text-beige900/70">
                <FileText className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                <span>이력서 파일</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 font-geist text-[10px] font-medium",
                  hasResumeFile
                    ? "bg-[#E4EDE2] text-[#29513A]"
                    : "bg-beige500/50 text-beige900/45"
                )}
              >
                {hasResumeFile ? "있음" : "없음"}
              </span>
            </div>
            <div className="mt-1 truncate font-geist text-xs text-beige900/45">
              {resumeFileDisplayName ?? "저장된 파일 없음"}
            </div>
          </div>

          <div className="rounded-md border border-beige900/10 bg-white/45 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 font-geist text-xs font-medium text-beige900/70">
                <FileText className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                <span>이력서 텍스트</span>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded px-1.5 py-0.5 font-geist text-[10px] font-medium",
                  hasResumeText
                    ? "bg-[#E4EDE2] text-[#29513A]"
                    : "bg-beige500/50 text-beige900/45"
                )}
              >
                {hasResumeText ? "추출됨" : "없음"}
              </span>
            </div>
            <div className="mt-1 truncate font-geist text-xs text-beige900/45">
              {hasResumeText
                ? "프로필 추출에 사용할 resume text가 저장되어 있습니다."
                : "저장된 resume text 없음"}
            </div>
          </div>
        </div>

        <div className={cx(opsTheme.eyebrow, "mt-4")}>등록 링크</div>
        {registeredLinks.length > 0 ? (
          <div className="mt-3 space-y-2">
            {registeredLinks.map((link) => {
              const isLinkedin = /linkedin\.com\/in\//i.test(link);
              return (
                <a
                  key={link}
                  href={normalizeRegisteredLinkHref(link)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-md border border-beige900/10 bg-white/45 px-3 py-2 font-geist text-xs text-beige900/70 transition hover:border-beige900/20 hover:bg-white/70"
                >
                  <span className="min-w-0 truncate">
                    {isLinkedin ? "LinkedIn · " : ""}
                    {formatRegisteredLinkLabel(link)}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-beige900/35" />
                </a>
              );
            })}
          </div>
        ) : (
          <div className="mt-2 font-geist text-sm text-beige900/35">
            등록된 링크가 없습니다.
          </div>
        )}

        {visibleIngestStatus ? (
          <div
            className={
              visibleIngestStatus.type === "success"
                ? "mt-3 rounded-md border border-[#9FB795]/35 bg-[#E4EDE2]/70 px-3 py-2 font-geist text-xs text-[#29513A]"
                : cx(opsTheme.errorNotice, "mt-3 text-xs")
            }
          >
            {visibleIngestStatus.text}
          </div>
        ) : null}
      </div>

      {detail.bio && (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-1")}>소개</div>
          <div className="whitespace-pre-wrap font-geist text-sm text-beige900/80">
            {detail.bio}
          </div>
        </div>
      )}

      {detail.location && (
        <div className={cx(opsTheme.panelSoft, "p-4")}>
          <div className={cx(opsTheme.eyebrow, "mb-1")}>위치</div>
          <div className="font-geist text-sm text-beige900/80">
            {detail.location}
          </div>
        </div>
      )}

      {experiences.length > 0 && (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>경력</div>
          <div className="space-y-2">
            {experiences.map((exp, i) => (
              <div key={i} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {exp.role ?? "역할 미상"}
                </div>
                <div className="font-geist text-xs text-beige900/50">
                  {exp.company_name ?? ""}{" "}
                  {exp.start_date
                    ? `(${exp.start_date} ~ ${exp.end_date ?? "현재"})`
                    : ""}
                </div>
                {exp.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {exp.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {educations.length > 0 && (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>학력</div>
          <div className="space-y-2">
            {educations.map((edu, i) => (
              <div key={i} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {edu.school ?? "학교 미상"}
                </div>
                <div className="font-geist text-xs text-beige900/50">
                  {[edu.degree, edu.field].filter(Boolean).join(" · ")}
                </div>
                {edu.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {edu.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {extras.length > 0 && (
        <div>
          <div className={cx(opsTheme.eyebrow, "mb-2")}>기타</div>
          <div className="space-y-2">
            {extras.map((extra, i) => (
              <div key={i} className={cx(opsTheme.panelSoft, "p-3")}>
                <div className="font-geist text-sm font-medium text-beige900">
                  {extra.title ?? "제목 없음"}
                </div>
                {extra.date ? (
                  <div className="font-geist text-xs text-beige900/50">
                    {extra.date}
                  </div>
                ) : null}
                {extra.description?.trim() ? (
                  <div className="mt-2 whitespace-pre-wrap font-geist text-xs leading-5 text-beige900/70">
                    {extra.description.trim()}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {!detail.bio &&
        !detail.location &&
        experiences.length === 0 &&
        educations.length === 0 &&
        extras.length === 0 && (
          <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
            프로필 정보가 없습니다.
          </div>
        )}
    </div>
  );
}

export default function OpsCareerPage() {
  const router = useRouter();
  const { loading: authLoading, user } = useAuthStore();
  const canFetchInternal = !authLoading && isInternalEmail(user?.email);
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerTalents(FETCH_LIMIT, canFetchInternal);
  const [searchQuery, setSearchQuery] = useState("");
  const emailExclusionTerms = useOpsInternalDataExclusionStore(
    (state) => state.emailExclusionTerms
  );

  const selectedUserId = useMemo(() => {
    if (!router.isReady) return null;
    return readQueryValue(router.query.userId).trim() || null;
  }, [router.isReady, router.query.userId]);

  const selectTalent = useCallback(
    (userId: string) => {
      const nextUserId = userId.trim();
      if (!nextUserId) return;

      void router.push(
        {
          pathname: router.pathname,
          query: {
            ...router.query,
            userId: nextUserId,
          },
        },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const allTalents = useMemo(
    () => data?.pages.flatMap((page) => page.talents) ?? [],
    [data]
  );

  const visibleTalents = useMemo(
    () =>
      allTalents.filter(
        (talent) =>
          !isEmailExcludedByOpsInternalTerms(talent.email, emailExclusionTerms)
      ),
    [allTalents, emailExclusionTerms]
  );

  const hiddenByInternalDataExclusionCount =
    allTalents.length - visibleTalents.length;
  const emptyTalentMessage = searchQuery.trim()
    ? "검색 결과가 없습니다."
    : hiddenByInternalDataExclusionCount > 0
      ? "내부 데이터 제외 설정으로 숨겨진 talent만 있습니다."
      : "등록된 talent가 없습니다.";

  const filteredTalents = useMemo(() => {
    if (!searchQuery.trim()) return visibleTalents;
    const q = searchQuery.toLowerCase();
    return visibleTalents.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.headline?.toLowerCase().includes(q)
    );
  }, [searchQuery, visibleTalents]);

  const totalCount = data?.pages[0]?.totalCount ?? 0;

  return (
    <>
      <Head>
        <title>Career Talents | Harper Ops</title>
      </Head>

      <OpsShell
        title="Career Talents"
        description={`Career 온보딩 talent 목록 및 인사이트 (${totalCount}명)`}
      >
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
          {/* Left: List */}
          <div className={cx(opsTheme.panel, "overflow-hidden")}>
            {/* Search */}
            <div className="p-3 border-b border-beige900/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-beige900/30" />
                <input
                  type="text"
                  placeholder="이름, 이메일, 헤드라인 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cx(opsTheme.input, "pl-9 h-9")}
                />
              </div>
              {hiddenByInternalDataExclusionCount > 0 ? (
                <div className="mt-2 font-geist text-[11px] text-beige900/35">
                  내부 데이터 제외 설정으로 현재 불러온 목록에서{" "}
                  {hiddenByInternalDataExclusionCount}명을 숨겼습니다.
                </div>
              ) : null}
            </div>

            {/* List */}
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
                </div>
              ) : error ? (
                <div className={cx(opsTheme.errorNotice, "m-4")}>
                  {error instanceof Error
                    ? error.message
                    : "데이터를 불러오지 못했습니다."}
                </div>
              ) : filteredTalents.length === 0 ? (
                <div className="px-4 py-12 text-center font-geist text-sm text-beige900/40">
                  {emptyTalentMessage}
                </div>
              ) : (
                <>
                  {filteredTalents.map((talent) => (
                    <TalentListItem
                      key={talent.userId}
                      talent={talent}
                      isActive={selectedUserId === talent.userId}
                      onClick={() => selectTalent(talent.userId)}
                    />
                  ))}
                  {hasNextPage && (
                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className={cx(
                          opsTheme.buttonSecondary,
                          "w-full h-9 text-xs"
                        )}
                      >
                        {isFetchingNextPage ? "불러오는 중..." : "더 보기"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Detail */}
          <div className={cx(opsTheme.panel, "overflow-hidden")}>
            {selectedUserId ? (
              <TalentDetail userId={selectedUserId} />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <MessageSquareText className="h-10 w-10 text-beige900/15" />
                <div className="mt-4 font-geist text-sm text-beige900/40">
                  왼쪽에서 talent를 선택하세요
                </div>
              </div>
            )}
          </div>
        </div>
      </OpsShell>
    </>
  );
}
