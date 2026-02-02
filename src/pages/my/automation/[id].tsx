import AppLayout from "@/components/layout/app";
import ChatPanel from "@/components/chat/ChatPanel";
import ConfirmModal from "@/components/Modal/ConfirmModal";
import { fetchMessages, insertMessage } from "@/lib/message";
import { supabase } from "@/lib/supabase";
import { showToast } from "@/components/toast/toast";
import { notifyToSlack } from "@/lib/slack";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useCredits } from "@/hooks/useCredit";
import type { Database } from "@/types/database.types";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEEP_AUTOMATION_PROMPT } from "@/app/api/chat/chat_prompt";
import { cn } from "@/lib/utils";
import { LIMIT_MESSAGE } from "../automation";
import { Play, Square } from "lucide-react";

type AutomationRow = Database["public"]["Tables"]["automation"]["Row"];

export const MAX_ACTIVE_AUTOMATIONS = 2;
const INITIAL_ASSISTANT_MESSAGE =
  "안녕하세요 하퍼입니다. 찾고자하시는 후보자에 대해서 알려주시면 가장 적합한 후보자를 찾아 매일 1~3명을 추천해드립니다.\n담당하실 역할, 필요한 기술/경험, 팀 문화, 채용 일정 등 핵심 정보를 알려주세요.\n충분히 정보가 모이면 오른쪽 위의 등록 버튼을 눌러 진행하실 수 있어요.";

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `auto_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function AutomationDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { companyUser } = useCompanyUserStore();
  const { credits } = useCredits();
  const userId = companyUser?.user_id;
  const draftCreatedRef = useRef(false);

  const idParam =
    typeof router.query.id === "string" ? router.query.id : undefined;
  const isNew = idParam === "new";

  const [automation, setAutomation] = useState<AutomationRow | null>(null);
  const [automationId, setAutomationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isMessageReady, setIsMessageReady] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmPauseOpen, setConfirmPauseOpen] = useState(false);
  const [confirmResumeOpen, setConfirmResumeOpen] = useState(false);
  const initMessageRef = useRef(false);

  const isDraft = useMemo(() => {
    if (!automation) return isNew;
    return !!automation.is_deleted;
  }, [automation, isNew]);

  const fetchActiveAutomationCount = useCallback(
    async (excludeId?: string) => {
      let query = supabase
        .from("automation")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .eq("is_in_progress", true);

      if (excludeId) {
        query = query.neq("id", excludeId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    [userId]
  );

  const loadAutomation = useCallback(
    async (automationIdToLoad: string) => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("automation")
        .select("*")
        .eq("id", automationIdToLoad)
        .single();
      if (!error) {
        setAutomation(data as AutomationRow);
      }
      setIsLoading(false);
    },
    []
  );

  const createDraftAutomation = useCallback(async () => {
    if (!userId) return;
    try {
      const { count, error } = await supabase
        .from("automation")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .eq("is_in_progress", true);
      if (error) throw error;
      if ((count ?? 0) >= MAX_ACTIVE_AUTOMATIONS) {
        showToast({
          message: LIMIT_MESSAGE,
          variant: "white",
        });
        setIsLoading(false);
        router.push("/my/automation");
        return;
      }
    } catch {
      showToast({
        message: "자동화 상태를 확인하지 못했습니다.",
        variant: "white",
      });
      setIsLoading(false);
      router.push("/my/automation");
      return;
    }
    const newId = createLocalId();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("automation")
      .insert({
        id: newId,
        user_id: userId,
        is_deleted: true,
        is_in_progress: true,
        last_updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      setIsLoading(false);
      return;
    }

    await supabase.from("queries").insert({
      query_id: newId,
      user_id: userId,
      is_deleted: true,
      query_keyword: "Deep Automation",
      raw_input_text: "Deep Automation",
      query: null,
      retries: 0,
    });

    setAutomationId(newId);
    setAutomation(data as AutomationRow);
    setIsLoading(false);
  }, [userId, router]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!userId) return;
    if (!idParam) return;

    if (isNew) {
      if (draftCreatedRef.current) return;
      draftCreatedRef.current = true;
      void createDraftAutomation();
      return;
    }

    setAutomationId(idParam);
    void loadAutomation(idParam);
  }, [router.isReady, userId, idParam, isNew, loadAutomation, createDraftAutomation]);

  useEffect(() => {
    if (!automationId || !userId) return;
    if (initMessageRef.current) return;
    initMessageRef.current = true;

    const ensureInitialMessage = async () => {
      try {
        const existing = await fetchMessages({ queryId: automationId, userId });
        if (!existing.length) {
          await insertMessage({
            queryId: automationId,
            userId,
            role: "assistant",
            content: INITIAL_ASSISTANT_MESSAGE,
          });
        }
      } finally {
        setIsMessageReady(true);
      }
    };

    void ensureInitialMessage();
  }, [automationId, userId]);

  useEffect(() => {
    if (!isDraft) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue =
        "등록하지 않고 나가면 채팅이 저장되지 않으며 사라집니다.";
      return event.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDraft]);

  useEffect(() => {
    if (!isDraft) return;
    router.beforePopState(() => {
      setConfirmLeaveOpen(true);
      return false;
    });
    return () => {
      router.beforePopState(() => true);
    };
  }, [isDraft, router]);

  const cleanupDraft = useCallback(async () => {
    if (!automationId) return;
    await supabase.from("messages").delete().eq("query_id", automationId);
    await supabase.from("queries").delete().eq("query_id", automationId);
    await supabase.from("automation").delete().eq("id", automationId);
  }, [automationId]);

  const handleBack = useCallback(() => {
    if (isDraft) {
      setConfirmLeaveOpen(true);
      return;
    }
    router.push("/my/automation");
  }, [isDraft, router]);

  const handleRegister = useCallback(async () => {
    if (!automationId || !userId) return;
    const now = new Date().toISOString();
    if (credits && credits.remain_credit <= 3) {
      showToast({
        message: "진행에 필요한 최소 크레딧이 부족합니다.",
        variant: "white",
      });
      return;
    }
    try {
      const activeCount = await fetchActiveAutomationCount(automationId);
      if (activeCount >= MAX_ACTIVE_AUTOMATIONS) {
        showToast({
          message: LIMIT_MESSAGE,
          variant: "white",
        });
        return;
      }
    } catch {
      showToast({
        message: "자동화 상태를 확인하지 못했습니다.",
        variant: "white",
      });
      return;
    }
    const wasDraft = isDraft;
    setIsSaving(true);
    await supabase
      .from("automation")
      .update({
        is_deleted: false,
        is_in_progress: true,
        last_updated_at: now,
      })
      .eq("id", automationId);

    await supabase
      .from("queries")
      .update({
        is_deleted: false,
        query_keyword: "Deep Automation",
        raw_input_text: "Deep Automation",
      })
      .eq("query_id", automationId);

    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    if (wasDraft) {
      try {
        await notifyToSlack(
          `[Deep Automation 시작]\n유저: ${companyUser?.name} - ${companyUser?.company}\nuser_id=${userId}\nautomation_id=${automationId}`
        );
      } catch { }
    }
    setIsSaving(false);
    router.push("/my/automation");
  }, [automationId, userId, qc, router, fetchActiveAutomationCount, isDraft, credits]);

  const handleDelete = useCallback(async () => {
    if (!automationId) return;
    setIsSaving(true);
    await supabase
      .from("automation")
      .update({ is_deleted: true, last_updated_at: new Date().toISOString() })
      .eq("id", automationId);
    await supabase
      .from("queries")
      .update({ is_deleted: true })
      .eq("query_id", automationId);
    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    setIsSaving(false);
    router.push("/my/automation");
  }, [automationId, qc, router, userId]);

  const handlePause = useCallback(async () => {
    if (!automationId) return;
    setIsSaving(true);
    await supabase
      .from("automation")
      .update({ is_in_progress: false, last_updated_at: new Date().toISOString() })
      .eq("id", automationId);
    await loadAutomation(automationId);
    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    try {
      await notifyToSlack(
        `[Deep Automation 진행 정지] user_id=${userId} automation_id=${automationId}`
      );
    } catch { }
    setIsSaving(false);
  }, [automationId, loadAutomation, qc, userId]);

  const handleResume = useCallback(async () => {
    if (!automationId) return;
    if (credits && credits.remain_credit <= 3) {
      showToast({
        message: "진행에 필요한 최소 크레딧이 부족합니다.",
        variant: "white",
      });
      return;
    }
    try {
      const activeCount = await fetchActiveAutomationCount(automationId);
      if (activeCount >= MAX_ACTIVE_AUTOMATIONS) {
        showToast({
          message: LIMIT_MESSAGE,
          variant: "white",
        });
        return;
      }
    } catch {
      showToast({
        message: "자동화 상태를 확인하지 못했습니다.",
        variant: "white",
      });
      return;
    }
    setIsSaving(true);
    await supabase
      .from("automation")
      .update({ is_in_progress: true, last_updated_at: new Date().toISOString() })
      .eq("id", automationId);
    await loadAutomation(automationId);
    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    try {
      await notifyToSlack(
        `[Deep Automation 진행 재개] user_id=${userId} automation_id=${automationId}`
      );
    } catch { }
    setIsSaving(false);
  }, [automationId, loadAutomation, qc, userId, fetchActiveAutomationCount, credits]);

  const buttonClassName = "rounded-lg bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20 disabled:opacity-60 flex flex-row gap-1 items-center justify-center";

  const statusBadge = useMemo(() => {
    if (isDraft) {
      return { label: "Draft", tone: "bg-white/10 text-white/80 border-white/10" };
    }
    if (automation?.is_in_progress) {
      return { label: "Active", tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20" };
    }
    return { label: "Paused", tone: "bg-yellow-500/15 text-yellow-200 border-yellow-500/20" };
  }, [isDraft, automation?.is_in_progress]);

  const statusMessage = useMemo(() => {
    if (isDraft) return "자동 추천 등록 전입니다. 충분한 정보가 모이면 등록을 눌러주세요.";
    if (automation?.is_in_progress) return "현재 매일 후보자 추천 중입니다.";
    return "현재 추천이 중지되어 있습니다. 진행을 누르면 다시 추천이 시작됩니다.";
  }, [isDraft, automation?.is_in_progress]);

  const headerActions = (
    <div className="flex items-center gap-2">
      {isDraft ? (
        <button
          type="button"
          onClick={handleRegister}
          disabled={isSaving}
          className={cn(
            buttonClassName,
            "bg-accenta1 font-medium text-black shadow-lg hover:bg-accenta1/90"
          )}
        >
          등록
        </button>
      ) : (
        <>
          {automation?.is_in_progress ? (
            <button
              type="button"
              onClick={() => setConfirmPauseOpen(true)}
              disabled={isSaving}
              className={cn(buttonClassName, "bg-white/70 hover:bg-white/60 text-black")}
            >
              <Square fill="currentColor" className="w-3 h-3" />
              진행 정지
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmResumeOpen(true)}
              disabled={isSaving}
              className={cn(buttonClassName, "bg-white/70 hover:bg-white/60 text-black")}
            >
              <Play fill="currentColor" className="w-3 h-3" />
              진행
            </button>
          )}

          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isSaving}
            className={cn(buttonClassName, "bg-red-500/70 hover:bg-red-500/80")}
          >
            삭제
          </button>
        </>
      )}
    </div>
  );

  return (
    <AppLayout>
      <div className="relative flex w-full min-h-screen">
        {(isLoading || !isMessageReady) && (
          <div className="w-full px-6 py-8 text-sm text-xgray800">
            불러오는 중...
          </div>
        )}


        {!isLoading && isMessageReady && automationId && (
          <div className="flex w-full items-start justify-center">
            <div className="w-full max-w-[780px] px-3 md:px-0">
              {/* Sticky header: title + status + actions */}
              <div className="absolute top-2 z-30 w-full max-w-[780px] ">
                <div className="rounded-2xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
                  <div className="flex items-start justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-white">
                          Deep Automation
                        </div>

                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            statusBadge.tone
                          )}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      <div className="mt-1 text-[12px] text-white/70">
                        {statusMessage}
                      </div>
                    </div>

                    {headerActions}
                  </div>
                </div>
              </div>

              {/* Chat */}
              <ChatPanel
                title="Deep Automation"
                scope={{ type: "query", queryId: automationId }}
                userId={userId}
                onSearchFromConversation={async () => { }}
                systemPromptOverride={DEEP_AUTOMATION_PROMPT}
                onBack={handleBack}
              />
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmLeaveOpen}
        title="등록하지 않고 나가시겠어요?"
        description="등록하지 않고 나가면 채팅이 저장되지 않으며 사라집니다."
        confirmLabel="나가기"
        cancelLabel="계속하기"
        onClose={() => setConfirmLeaveOpen(false)}
        onConfirm={async () => {
          setConfirmLeaveOpen(false);
          await cleanupDraft();
          router.push("/my/automation");
        }}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        title="자동화 내역을 삭제할까요?"
        description="삭제하면 진행이 자동 중지되고, 내역이 더 이상 표시되지 않습니다."
        confirmLabel="삭제"
        cancelLabel="취소"
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          setConfirmDeleteOpen(false);
          await handleDelete();
        }}
      />

      <ConfirmModal
        open={confirmPauseOpen}
        title="진행을 정지할까요?"
        description="진행 정지 시 후보자 추천이 진행되지 않으며 크레딧이 소모되지 않습니다."
        confirmLabel="진행 정지"
        cancelLabel="취소"
        onClose={() => setConfirmPauseOpen(false)}
        onConfirm={async () => {
          setConfirmPauseOpen(false);
          await handlePause();
        }}
      />

      <ConfirmModal
        open={confirmResumeOpen}
        title="진행을 재개할까요?"
        description="진행 시 하루에 1~2명의 후보자가 추천되며 1명당 1크레딧이 소모됩니다."
        confirmLabel="진행"
        cancelLabel="취소"
        onClose={() => setConfirmResumeOpen(false)}
        onConfirm={async () => {
          setConfirmResumeOpen(false);
          await handleResume();
        }}
      />
    </AppLayout>
  );
}
