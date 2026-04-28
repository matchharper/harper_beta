import OpsShell from "@/components/ops/OpsShell";
import { cx, opsTheme } from "@/components/ops/theme";
import { useOpsCareerTalents, useOpsCareerDetail, useAddChecklistItem, useRefreshInsights, useUpdateInsights, useDeleteChecklistItem } from "@/hooks/useOpsCareer";
import type { CareerTalentDetailResponse } from "@/lib/opsCareerServer";
import {
  ChevronRight,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  User,
} from "lucide-react";
import Head from "next/head";
import React, { useCallback, useEffect, useMemo, useState } from "react";

const FETCH_LIMIT = 40;

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

const stageLabel = (stage: string | null) => {
  if (stage === "completed") return "완료";
  if (stage === "chat") return "대화 중";
  if (stage === "profile") return "프로필";
  return stage ?? "-";
};

const stageBadgeClass = (stage: string | null) => {
  if (stage === "completed") return "bg-[#E4EDE2] text-[#29513A]";
  if (stage === "chat") return "bg-[#FEF3C7] text-[#92400E]";
  return "bg-beige500/60 text-beige900/60";
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
    conversationStage: string | null;
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
        isActive
          ? "bg-beige900/5"
          : "hover:bg-white/60"
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
                stageBadgeClass(talent.conversationStage)
              )}
            >
              {stageLabel(talent.conversationStage)}
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
  const [activeTab, setActiveTab] = useState<"insights" | "messages" | "profile">("insights");

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
        {error instanceof Error ? error.message : "데이터를 불러오지 못했습니다."}
      </div>
    );
  }

  const tabs = [
    { id: "insights" as const, label: "인사이트" },
    { id: "messages" as const, label: "대화 내역" },
    { id: "profile" as const, label: "프로필" },
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
            대화:{" "}
            <span className={cx("font-medium", stageBadgeClass(detail.conversationStage))}>
              {stageLabel(detail.conversationStage)}
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
          <InsightsTab userId={userId} insights={detail.insights} mergedChecklist={detail.mergedChecklist} preferences={detail.preferences} />
        )}
        {activeTab === "messages" && <MessagesTab messages={detail.messages} />}
        {activeTab === "profile" && <ProfileTab detail={detail} />}
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
    return mergedChecklist.filter((item) => !insights?.[item.key]?.trim()).length;
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
    if (!window.confirm(`'${label}' (${key}) 항목을 삭제하시겠습니까? 모든 인재에서 제거됩니다.`)) return;
    deleteChecklistItemMutation.mutate(key);
  }

  function handleAddItem() {
    const trimmedKey = newKey.trim();
    const trimmedLabel = newLabel.trim();
    if (!trimmedKey || !trimmedLabel) return;
    if (!window.confirm(`'${trimmedLabel}' (${trimmedKey}) 항목을 추가하시겠습니까? 이 항목은 모든 인재에게 적용됩니다.`)) return;
    addChecklistItemMutation.mutate(
      { key: trimmedKey, label: trimmedLabel, promptHint: newPromptHint.trim() || undefined },
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
    if (!window.confirm(`빈 인사이트 항목 ${emptyCount}개를 LLM으로 추출합니다. 기존 값은 변경되지 않습니다.`)) return;
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
                onClick={() => { setIsEditing(false); setEditedValues({}); }}
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
                  (!hasChanges || updateInsightsMutation.isPending) && "opacity-50 cursor-not-allowed"
                )}
              >
                {updateInsightsMutation.isPending ? (
                  <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />저장 중...</>
                ) : (
                  <><Save className="h-3.5 w-3.5" />저장</>
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
                  (emptyCount === 0 || refreshInsightsMutation.isPending) && "opacity-50 cursor-not-allowed"
                )}
              >
                {refreshInsightsMutation.isPending ? (
                  <><LoaderCircle className="h-3.5 w-3.5 animate-spin" />추출 중...</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5" />빈 항목 {emptyCount}개 추출</>
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
                    onClick={() => handleDeleteChecklistItem(item.key, item.label)}
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
                    "mt-1 w-full text-sm font-geist resize-y min-h-[2.5rem]"
                  )}
                  placeholder="값을 입력하세요..."
                />
              ) : isFilled ? (
                <div className="mt-1 whitespace-pre-wrap font-geist text-sm text-beige900/80">
                  {displayValue}
                </div>
              ) : (
                <div className="mt-1 font-geist text-sm text-beige900/30 italic">미입력</div>
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
            onChange={(e) => setNewKey(e.target.value.replace(/[^a-z0-9_]/g, ""))}
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
            disabled={!newKey.trim() || !newLabel.trim() || addChecklistItemMutation.isPending}
            className={cx(
              opsTheme.buttonSecondary,
              "h-8 px-3 text-xs flex items-center gap-1.5 shrink-0",
              (!newKey.trim() || !newLabel.trim() || addChecklistItemMutation.isPending) && "opacity-50 cursor-not-allowed"
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

function ProfileTab({
  detail,
}: {
  detail: {
    bio: string | null;
    location: string | null;
    structuredProfile: {
      experiences: unknown[];
      educations: unknown[];
      extras: unknown[];
    } | null;
  };
}) {
  const experiences = (detail.structuredProfile?.experiences ?? []) as Array<{
    role?: string;
    company_name?: string;
    start_date?: string;
    end_date?: string;
  }>;
  const educations = (detail.structuredProfile?.educations ?? []) as Array<{
    school?: string;
    degree?: string;
    field?: string;
  }>;

  return (
    <div className="space-y-4">
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
          <div className="font-geist text-sm text-beige900/80">{detail.location}</div>
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
                  {exp.start_date ? `(${exp.start_date} ~ ${exp.end_date ?? "현재"})` : ""}
                </div>
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
              </div>
            ))}
          </div>
        </div>
      )}

      {!detail.bio && !detail.location && experiences.length === 0 && educations.length === 0 && (
        <div className="rounded-md border border-dashed border-beige900/15 bg-white/30 px-4 py-6 text-center font-geist text-sm text-beige900/40">
          프로필 정보가 없습니다.
        </div>
      )}
    </div>
  );
}

export default function OpsCareerPage() {
  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useOpsCareerTalents(FETCH_LIMIT);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const allTalents = useMemo(
    () => data?.pages.flatMap((page) => page.talents) ?? [],
    [data]
  );

  const filteredTalents = useMemo(() => {
    if (!searchQuery.trim()) return allTalents;
    const q = searchQuery.toLowerCase();
    return allTalents.filter(
      (t) =>
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.headline?.toLowerCase().includes(q)
    );
  }, [allTalents, searchQuery]);

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
            </div>

            {/* List */}
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <LoaderCircle className="h-5 w-5 animate-spin text-beige900/30" />
                </div>
              ) : error ? (
                <div className={cx(opsTheme.errorNotice, "m-4")}>
                  {error instanceof Error ? error.message : "데이터를 불러오지 못했습니다."}
                </div>
              ) : filteredTalents.length === 0 ? (
                <div className="px-4 py-12 text-center font-geist text-sm text-beige900/40">
                  {searchQuery ? "검색 결과가 없습니다." : "등록된 talent가 없습니다."}
                </div>
              ) : (
                <>
                  {filteredTalents.map((talent) => (
                    <TalentListItem
                      key={talent.userId}
                      talent={talent}
                      isActive={selectedUserId === talent.userId}
                      onClick={() => setSelectedUserId(talent.userId)}
                    />
                  ))}
                  {hasNextPage && (
                    <div className="p-3">
                      <button
                        type="button"
                        onClick={() => void fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className={cx(opsTheme.buttonSecondary, "w-full h-9 text-xs")}
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
