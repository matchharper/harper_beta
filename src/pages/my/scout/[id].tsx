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
import { Loader2, Play, Square } from "lucide-react";
import { Loading } from "@/components/ui/loading";
import { useMessages } from "@/i18n/useMessage";

type AutomationRow = Database["public"]["Tables"]["automation"]["Row"];

export const MAX_ACTIVE_AUTOMATIONS = 2;
const UI_START = "<<UI>>";
const UI_END = "<<END_UI>>";
const DEFAULT_AUTOMATION_TITLE = "Scout";

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `auto_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeAutomationTitle(title?: string | null) {
  const normalized = String(title ?? "").trim();
  return normalized.length > 0 ? normalized : DEFAULT_AUTOMATION_TITLE;
}

export default function AutomationDetailPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { companyUser } = useCompanyUserStore();
  const { credits } = useCredits();
  const { m } = useMessages();
  const userId = companyUser?.user_id;
  const draftCreatedRef = useRef(false);
  const initialAssistantMessage = m.scout.initialAssistantMessage;
  const shouldShowCompanyDescriptionCta =
    String(companyUser?.company_description ?? "").trim().length === 0;

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

  const automationTitle = useMemo(
    () => normalizeAutomationTitle(automation?.title),
    [automation?.title]
  );

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

  const loadAutomation = useCallback(async (automationIdToLoad: string) => {
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
  }, []);

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
          message: m.scout.limitMessage,
          variant: "white",
        });
        setIsLoading(false);
        router.push("/my/scout");
        return;
      }
    } catch {
      showToast({
        message: m.scout.checkAutomationFail,
        variant: "white",
      });
      setIsLoading(false);
      router.push("/my/scout");
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
        title: DEFAULT_AUTOMATION_TITLE,
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
      type: 0,
    });

    setAutomationId(newId);
    setAutomation(data as AutomationRow);
    setIsLoading(false);
  }, [userId, router, m.scout.limitMessage, m.scout.checkAutomationFail]);

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
  }, [
    router.isReady,
    userId,
    idParam,
    isNew,
    loadAutomation,
    createDraftAutomation,
  ]);

  useEffect(() => {
    if (!automationId || !userId) return;
    if (initMessageRef.current) return;
    initMessageRef.current = true;

    const ensureInitialMessage = async () => {
      try {
        const existing = await fetchMessages({ queryId: automationId, userId });
        if (!existing.length) {
          let content = initialAssistantMessage;

          if (shouldShowCompanyDescriptionCta) {
            const settingsCtaBlock = {
              type: "settings_cta",
              text: m.scout.companyDescriptionCtaMessage,
              buttonLabel: m.scout.companyDescriptionCtaButton,
              href: "/my/account",
            };

            content =
              content +
              "\n\n" +
              UI_START +
              "\n" +
              JSON.stringify(settingsCtaBlock) +
              "\n" +
              UI_END;
          }

          await insertMessage({
            queryId: automationId,
            userId,
            role: "assistant",
            content,
          });
        }
      } finally {
        setIsMessageReady(true);
      }
    };

    void ensureInitialMessage();
  }, [
    automationId,
    userId,
    initialAssistantMessage,
    shouldShowCompanyDescriptionCta,
    m.scout.companyDescriptionCtaMessage,
    m.scout.companyDescriptionCtaButton,
  ]);

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
    router.push("/my/scout");
  }, [isDraft, router]);

  const generateAutomationTitle = useCallback(async () => {
    if (!automationId || !userId) return null;
    try {
      const res = await fetch("/api/scout/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          queryId: automationId,
        }),
      });

      if (!res.ok) return null;

      const json = await res.json();
      const generated = String(json?.title ?? "").trim();
      if (!generated) return null;
      return normalizeAutomationTitle(generated);
    } catch {
      return null;
    }
  }, [automationId, userId]);

  const handleRegister = useCallback(async () => {
    if (!automationId || !userId) return;
    const now = new Date().toISOString();
    let titleToSave = normalizeAutomationTitle(automation?.title);
    if (credits && credits.remain_credit <= 3) {
      showToast({
        message: "이번 달 남은 월 검색 한도가 부족합니다.",
        variant: "white",
      });
      return;
    }
    try {
      const activeCount = await fetchActiveAutomationCount(automationId);
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
    const wasDraft = isDraft;
    setIsSaving(true);

    if (titleToSave === DEFAULT_AUTOMATION_TITLE) {
      const generatedTitle = await generateAutomationTitle();
      if (generatedTitle) {
        titleToSave = generatedTitle;
      }
    }

    await supabase
      .from("automation")
      .update({
        is_deleted: false,
        is_in_progress: true,
        title: titleToSave,
        last_updated_at: now,
      })
      .eq("id", automationId);

    await supabase
      .from("queries")
      .update({
        is_deleted: false,
        query_keyword: "Deep Automation",
        raw_input_text: "Deep Automation",
        type: 0,
      })
      .eq("query_id", automationId);

    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    if (wasDraft) {
      try {
        await notifyToSlack(
          `🤖 [Harper Scout 시작]\n유저: ${companyUser?.name} - ${companyUser?.company}\nuser_id=${userId}\nautomation_id=${automationId}`
        );
      } catch {}
    }
    void fetch("/api/memory/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        queryId: automationId,
      }),
    });
    setIsSaving(false);
    router.push("/my/scout");
  }, [
    automation?.title,
    automationId,
    companyUser?.company,
    companyUser?.name,
    userId,
    qc,
    router,
    fetchActiveAutomationCount,
    generateAutomationTitle,
    isDraft,
    credits,
    m.scout.limitMessage,
    m.scout.checkAutomationFail,
  ]);

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
    router.push("/my/scout");
  }, [automationId, qc, router, userId]);

  const handlePause = useCallback(async () => {
    if (!automationId) return;
    setIsSaving(true);
    await supabase
      .from("automation")
      .update({
        is_in_progress: false,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", automationId);
    await loadAutomation(automationId);
    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    try {
      await notifyToSlack(
        `🍊 [Harper Scout 진행 정지] user_id=${userId} automation_id=${automationId}`
      );
    } catch {}
    setIsSaving(false);
  }, [automationId, loadAutomation, qc, userId]);

  const handleResume = useCallback(async () => {
    if (!automationId) return;
    if (credits && credits.remain_credit <= 3) {
      showToast({
        message: "이번 달 남은 월 검색 한도가 부족합니다.",
        variant: "white",
      });
      return;
    }
    try {
      const activeCount = await fetchActiveAutomationCount(automationId);
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
    await supabase
      .from("automation")
      .update({
        is_in_progress: true,
        last_updated_at: new Date().toISOString(),
      })
      .eq("id", automationId);
    await loadAutomation(automationId);
    await qc.invalidateQueries({ queryKey: ["automation", userId] });
    try {
      await notifyToSlack(
        `🪙 [Harper Scout 진행 재개] user_id=${userId} automation_id=${automationId}`
      );
    } catch {}
    setIsSaving(false);
  }, [
    automationId,
    loadAutomation,
    qc,
    userId,
    fetchActiveAutomationCount,
    credits,
    m.scout.limitMessage,
    m.scout.checkAutomationFail,
  ]);

  const buttonClassName =
    "rounded-lg bg-white/10 px-3 py-2 text-xs text-white transition hover:bg-white/20 disabled:opacity-60 flex flex-row gap-1 items-center justify-center";

  const statusBadge = useMemo(() => {
    if (isDraft) {
      return {
        label: "Draft",
        tone: "bg-white/10 text-white/80 border-white/10",
      };
    }
    if (automation?.is_in_progress) {
      return {
        label: "Active",
        tone: "bg-emerald-500/15 text-emerald-200 border-emerald-500/20",
      };
    }
    return {
      label: "Paused",
      tone: "bg-yellow-500/15 text-yellow-200 border-yellow-500/20",
    };
  }, [isDraft, automation?.is_in_progress]);

  const statusMessage = useMemo(() => {
    if (isDraft)
      return "자동 추천이 시작되기 전입니다. 충분한 정보가 모이면 등록을 눌러주세요. 언제든지 내용을 수정하거나 추가하실 수 있습니다.";
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
          {isSaving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
            </>
          ) : (
            "등록"
          )}
        </button>
      ) : (
        <>
          {automation?.is_in_progress ? (
            <button
              type="button"
              onClick={() => setConfirmPauseOpen(true)}
              disabled={isSaving}
              className={cn(
                buttonClassName,
                "bg-white/70 hover:bg-white/60 text-black"
              )}
            >
              <Square fill="currentColor" className="w-3 h-3" />
              진행 정지
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmResumeOpen(true)}
              disabled={isSaving}
              className={cn(
                buttonClassName,
                "bg-white/70 hover:bg-white/60 text-black"
              )}
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
            <Loading
              label="불러오는 중..."
              className="text-xgray800"
              isFullScreen={true}
            />
          </div>
        )}

        {!isLoading && isMessageReady && automationId && (
          <div className="flex w-full items-start justify-center">
            <div className="w-full max-w-[780px] px-3 md:px-0">
              {/* Sticky header: title + status + actions */}
              <div className="absolute top-2 z-30 w-full max-w-[780px] ">
                <div className="bg-hgray200">
                  <div className="flex items-start justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-white">
                          {automationTitle}
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

                      <div className="mt-2 text-[13px] text-hgray700">
                        {statusMessage}
                      </div>
                    </div>

                    {headerActions}
                  </div>
                </div>
              </div>

              {/* Chat */}
              <ChatPanel
                title={automationTitle}
                scope={{ type: "query", queryId: automationId }}
                userId={userId}
                onSearchFromConversation={async () => null}
                systemPromptOverride={DEEP_AUTOMATION_PROMPT}
                memoryMode="automation"
                companyDescription={companyUser?.company_description ?? ""}
                teamLocation={companyUser?.location ?? ""}
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
          router.push("/my/scout");
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
        description="진행 정지 시 후보자 추천이 멈추며 이용량이 추가로 반영되지 않습니다."
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
        description="진행 시 추천 결과가 현재 플랜의 월 검색 한도에 반영됩니다."
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
