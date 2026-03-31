import AppLayout from "@/components/layout/app";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import { supabase } from "@/lib/supabase";
import { notifyToSlack } from "@/lib/slack";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import type { Database } from "@/types/database.types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState, useEffect } from "react";
import { showToast } from "@/components/toast/toast";
import { MAX_ACTIVE_AUTOMATIONS } from "./[id]";
import CandidateViews from "@/components/CandidateViews";
import { useAutomationResults } from "@/hooks/useAutomationResults";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import { useMessages } from "@/i18n/useMessage";
import ScoutCard from "@/components/scout/ScoutCard";
import ScoutEmptyState from "@/components/scout/ScoutEmptyState";

type AutomationRow = Database["public"]["Tables"]["automation"]["Row"];
const PAGE_SIZE = 10;
const DEFAULT_AUTOMATION_TITLE = "Scout";

function normalizeAutomationTitle(title?: string | null) {
  const normalized = String(title ?? "").trim();
  return normalized.length > 0 ? normalized : DEFAULT_AUTOMATION_TITLE;
}

async function fetchAutomations(userId: string) {
  const { data, error } = await supabase
    .from("automation")
    .select(
      "id, title, created_at, last_updated_at, is_in_progress, is_deleted"
    )
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as AutomationRow[];
}

async function fetchActiveAutomationCount(userId: string) {
  const { count, error } = await supabase
    .from("automation")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_deleted", false)
    .eq("is_in_progress", true);

  if (error) throw error;
  return count ?? 0;
}

export default function AutomationIndexPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { companyUser } = useCompanyUserStore();
  const userId = companyUser?.user_id;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: "pause" | "resume" | "delete";
    automationId: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { m } = useMessages();

  const { data, isLoading } = useQuery({
    queryKey: ["automation", userId],
    queryFn: () => fetchAutomations(userId!),
    enabled: !!userId,
    staleTime: 20_000,
  });

  const items = useMemo(() => data ?? [], [data]);
  const automationIds = useMemo(
    () => items.map((item) => item.id).filter(Boolean),
    [items]
  );

  const { data: resultCountRows } = useQuery({
    queryKey: ["automationResultsCount", userId, automationIds],
    enabled: !!userId && automationIds.length > 0,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("automation_results")
        .select("automation_id")
        .eq("user_id", userId)
        .in("automation_id", automationIds);

      if (error) throw error;
      return rows ?? [];
    },
    staleTime: 10_000,
  });

  const resultCountByAutomationId = useMemo(() => {
    const map: Record<string, number> = {};
    (resultCountRows ?? []).forEach((row: any) => {
      if (!row?.automation_id) return;
      map[row.automation_id] = (map[row.automation_id] ?? 0) + 1;
    });
    return map;
  }, [resultCountRows]);

  useEffect(() => {
    if (expandedId && !items.find((item) => item.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, items]);

  const handleRequestAction = useCallback(
    (action: "pause" | "resume" | "delete", item: AutomationRow) => {
      setPendingAction({ type: action, automationId: item.id });
    },
    []
  );

  const handleAddAutomation = async () => {
    if (!userId) return;
    try {
      const activeCount = await fetchActiveAutomationCount(userId);
      if (activeCount >= MAX_ACTIVE_AUTOMATIONS) {
        showToast({
          message: m.scout.limitMessage,
          variant: "white",
        });
        return;
      }
      router.push("/my/scout/new");
    } catch {
      showToast({
        message: m.scout.checkAutomationFail,
        variant: "white",
      });
    }
  };

  const handlePause = useCallback(
    async (automationId: string) => {
      if (!automationId || !userId) return;
      setIsSaving(true);
      try {
        await supabase
          .from("automation")
          .update({
            is_in_progress: false,
            last_updated_at: new Date().toISOString(),
          })
          .eq("id", automationId);
        await qc.invalidateQueries({ queryKey: ["automation", userId] });
        try {
          await notifyToSlack(
            `🍊 [Harper Scout 진행 정지] user_id=${userId} automation_id=${automationId}`
          );
        } catch {}
      } finally {
        setIsSaving(false);
      }
    },
    [qc, userId]
  );

  const handleResume = useCallback(
    async (automationId: string) => {
      if (!automationId || !userId) return;
      try {
        const activeCount = await fetchActiveAutomationCount(userId);
        if (activeCount >= MAX_ACTIVE_AUTOMATIONS) {
          showToast({
            message: m.scout.limitMessage,
            variant: "white",
          });
          return;
        }
      } catch {
        showToast({
          message: m.scout.checkAutomationFail,
          variant: "white",
        });
        return;
      }
      setIsSaving(true);
      try {
        await supabase
          .from("automation")
          .update({
            is_in_progress: true,
            last_updated_at: new Date().toISOString(),
          })
          .eq("id", automationId);
        await qc.invalidateQueries({ queryKey: ["automation", userId] });
        try {
          await notifyToSlack(
            `🪙 [Harper Scout 진행 재개] user_id=${userId} automation_id=${automationId}`
          );
        } catch {}
      } finally {
        setIsSaving(false);
      }
    },
    [m.scout.checkAutomationFail, m.scout.limitMessage, qc, userId]
  );

  const handleDelete = useCallback(
    async (automationId: string) => {
      if (!automationId || !userId) return;
      setIsSaving(true);
      try {
        const now = new Date().toISOString();
        await supabase
          .from("automation")
          .update({ is_deleted: true, last_updated_at: now })
          .eq("id", automationId);
        await supabase
          .from("queries")
          .update({ is_deleted: true })
          .eq("query_id", automationId);
        await qc.invalidateQueries({ queryKey: ["automation", userId] });
      } finally {
        setIsSaving(false);
      }
    },
    [qc, userId]
  );

  const handleRenameTitle = useCallback(
    async (automationId: string, title: string) => {
      if (!automationId || !userId) return null;
      const nextTitle = normalizeAutomationTitle(title);
      const currentTitle = normalizeAutomationTitle(
        items.find((item) => item.id === automationId)?.title
      );
      if (nextTitle === currentTitle) return nextTitle;

      const now = new Date().toISOString();
      const { error } = await supabase
        .from("automation")
        .update({
          title: nextTitle,
          last_updated_at: now,
        })
        .eq("id", automationId)
        .eq("user_id", userId);

      if (error) {
        showToast({
          message: "제목 저장에 실패했습니다. 다시 시도해주세요.",
          variant: "white",
        });
        return null;
      }

      await qc.invalidateQueries({ queryKey: ["automation", userId] });
      return nextTitle;
    },
    [items, qc, userId]
  );

  return (
    <AppLayout initialCollapse={false}>
      <div className="min-h-screen w-full text-white">
        {items.length !== 0 && (
          <div className="sticky top-0 z-40 w-full backdrop-blur bg-hgray200/60">
            <div className="mx-auto w-full px-4 pt-6 pb-4 flex items-end justify-between gap-4">
              <div className="w-full">
                <div className="flex flex-row items-center justify-between">
                  <div className="text-3xl font-hedvig font-light tracking-tight text-white">
                    {m.scout.title}
                  </div>
                </div>
                <div className="mt-4 text-sm text-xgray800 whitespace-pre-line">
                  {m.scout.intro}
                </div>
              </div>
            </div>
          </div>
        )}
        {!isLoading && items.length === 0 && (
          <ScoutEmptyState onCreateAgent={handleAddAutomation} />
        )}

        {items.length > 0 && (
          <div className="mx-auto w-full px-4 pb-16 mt-8">
            {isLoading && (
              <div className="py-8 text-sm text-xgray800">
                <Loading
                  label={m.scout.loadingList}
                  className="text-xgray800"
                  isFullScreen={true}
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mt-8">
              {items.map((item) => {
                if (!item) return null;

                return (
                  <ScoutCard
                    key={item.id}
                    item={item}
                    setExpandedId={setExpandedId}
                    expandedId={expandedId}
                    onRequestAction={handleRequestAction}
                    onRenameTitle={handleRenameTitle}
                    isActionLoading={isSaving}
                    resultCount={resultCountByAutomationId[item.id] ?? 0}
                  />
                );
              })}
              <button
                type="button"
                onClick={handleAddAutomation}
                className="flex flex-row items-center gap-2 justify-center min-w-[280px] rounded-xl border border-white/5 border-dashed bg-hgray900/5 hover:bg-hgray900/10 py-3 text-sm font-medium text-hgray900 transition"
              >
                <span className="w-6 h-6 rounded-full bg-hgray600/20 text-accenta1 flex items-center justify-center">
                  <Plus size={12} />
                </span>
                <span>{m.scout.addAgent}</span>
              </button>
            </div>

            {expandedId && (
              <div className="mt-8">
                <AutomationResultsList
                  userId={userId}
                  automationId={expandedId}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingAction?.type === "delete"}
        title="자동화 내역을 삭제할까요?"
        description="삭제하면 진행이 자동 중지되고, 내역이 더 이상 표시되지 않습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          const automationId = pendingAction?.automationId;
          setPendingAction(null);
          if (automationId) {
            await handleDelete(automationId);
          }
        }}
      />

      <ConfirmModal
        open={pendingAction?.type === "pause"}
        title="진행을 정지할까요?"
        description="진행 정지 시 후보자 추천이 멈추며 이용량이 추가로 반영되지 않습니다."
        confirmLabel="진행 정지"
        cancelLabel="취소"
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          const automationId = pendingAction?.automationId;
          setPendingAction(null);
          if (automationId) {
            await handlePause(automationId);
          }
        }}
      />

      <ConfirmModal
        open={pendingAction?.type === "resume"}
        title="진행을 재개할까요?"
        description="진행 시 후보자 추천이 다시 시작됩니다."
        confirmLabel="진행"
        cancelLabel="취소"
        onClose={() => setPendingAction(null)}
        onConfirm={async () => {
          const automationId = pendingAction?.automationId;
          setPendingAction(null);
          if (automationId) {
            await handleResume(automationId);
          }
        }}
      />
    </AppLayout>
  );
}

function AutomationResultsList({
  userId,
  automationId,
}: {
  userId?: string;
  automationId: string;
}) {
  const [pageIdx, setPageIdx] = useState(0);

  useEffect(() => {
    setPageIdx(0);
  }, [automationId]);

  const { data, isLoading, error, isFetching } = useAutomationResults(
    userId,
    automationId,
    pageIdx,
    PAGE_SIZE
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const hasNext = data?.hasNext ?? false;
  const hasPrev = pageIdx > 0;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (isLoading) return <Loading className="text-xgray800" />;
  if (error)
    return <div className="text-sm text-red-400">불러오지 못했습니다.</div>;

  if (items.length === 0) {
    return (
      <div className="text-sm text-xgray800">추천된 후보자가 없습니다.</div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex flex-row items-center gap-3 text-sm text-hgray900">
          <span>Page</span>
          <span
            className={`rounded-md p-1 bg-white/5 ${!hasPrev || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft size={16} className="text-accenta1" />
          </span>
          <span className="font-medium">{pageIdx + 1}</span> /{" "}
          <span className="font-medium">{pageCount}</span>{" "}
          <span
            className={`rounded-md p-1 bg-white/5 ${!hasNext || isFetching ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            onClick={() => {
              if (!hasNext) return;
              setPageIdx((p) => p + 1);
            }}
          >
            <ChevronRight size={16} className="text-accenta1" />
          </span>
          {isFetching && <span className="ml-2 text-hgray500">Syncing…</span>}
        </div>
      </div>

      <CandidateViews
        items={items}
        userId={userId ?? ""}
        isMyList={true}
        criterias={[]}
      />
    </div>
  );
}
