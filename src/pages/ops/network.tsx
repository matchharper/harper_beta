import OpsShell from "@/components/ops/OpsShell";
import DetailDrawer from "@/components/ops/network/DetailDrawer";
import ListView from "@/components/ops/network/ListView";
import { QuickMemoModal } from "@/components/ops/network/modals";
import { cx, opsTheme } from "@/components/ops/theme";
import {
  buildPaginationNumbers,
  copyToClipboard,
  escapeCsvCell,
  type DetailTab,
  isEditableEntryType,
  parsePositiveQueryNumber,
  readQueryValue,
} from "@/components/ops/network/shared";
import { showToast } from "@/components/toast/toast";
import {
  useCreateOpsNetworkInternalEntry,
  useCreateOpsNetworkNotification,
  useDeleteOpsNetworkInternalEntry,
  useIngestOpsNetworkLead,
  useOpsNetworkDetail,
  useOpsNetworkLeads,
  useOpsNetworkMessages,
  useSendOpsNetworkMail,
  useUpdateOpsNetworkInternalEntry,
} from "@/hooks/useOpsNetwork";
import type { NetworkLeadSummary, TalentInternalEntry } from "@/lib/opsNetwork";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useOpsNetworkStore } from "@/store/useOpsNetworkStore";
import { AnimatePresence } from "framer-motion";
import { Download, RefreshCw } from "lucide-react";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useCallback, useEffect, useMemo, useState } from "react";

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
  const messagesQuery = useOpsNetworkMessages({
    enabled: detailTab === "messages",
    leadId: selectedLeadId,
    limit: 20,
  });

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
    return () => window.removeEventListener("keydown", handleKeyDown);
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
  const messagesError =
    messagesQuery.error instanceof Error ? messagesQuery.error.message : null;

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
          throw new Error(payload.error ?? "이력서 링크를 생성하지 못했습니다.");
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
      "progress_current_step",
      "email_sent",
      "signed_up",
      "conversation_started",
      "conversation_completed",
      "role_recommended",
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
      lead.progress.currentStep ?? "",
      lead.progress.emailSent ? "yes" : "no",
      lead.progress.signedUp ? "yes" : "no",
      lead.progress.conversationStarted ? "yes" : "no",
      lead.progress.conversationCompleted ? "yes" : "no",
      lead.progress.roleRecommended ? "yes" : "no",
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
        <section className="space-y-6">
          <ListView
            currentLeads={currentLeads}
            currentPage={currentPage}
            cvOnly={cvOnly}
            isLoading={leadsQuery.isLoading}
            list={list}
            listError={listError}
            moveFilter={moveFilter}
            moveOptions={moveOptions}
            onCvOnlyChange={handleCvOnlyChange}
            onGoToPage={(page) => goToPage(page)}
            onMoveFilterChange={handleMoveFilterChange}
            onOpenLeadDrawer={openLeadDrawer}
            onOpenQuickMemo={handleOpenQuickMemo}
            onPageSizeChange={handlePageSizeChange}
            onQueryChange={handleQueryChange}
            onResetFilters={resetFilters}
            onRoleFilterChange={handleRoleFilterChange}
            pageNumbers={pageNumbers}
            pageSize={pageSize}
            query={query}
            roleFilter={roleFilter}
            roleOptions={roleOptions}
            selectedLeadId={selectedLeadId}
            stats={stats}
            totalPages={totalPages}
          />

          <AnimatePresence>
            {selectedLeadId ? (
              <DetailDrawer
                closeLeadDrawer={closeLeadDrawer}
                conversationContent={conversationContent}
                deletePendingEntryId={deletingEntryId}
                detail={detail}
                detailError={detailError}
                detailLoading={detailQuery.isLoading}
                detailTab={detailTab}
                displayedLead={displayedLead}
                editingEntryContent={editingEntryContent}
                editingEntryId={editingEntryId}
                internalPending={internalMutation.isPending}
                isOpeningCv={isOpeningCv}
                isSelectedLeadIngesting={isSelectedLeadIngesting}
                mailContent={mailContent}
                mailFromEmail={mailFromEmail}
                mailPending={mailMutation.isPending}
                mailSubject={mailSubject}
                memoContent={memoContent}
                messages={messagesQuery.messages}
                messagesError={messagesError}
                messagesHasOlder={messagesQuery.hasOlderMessages}
                messagesLoading={messagesQuery.isLoading}
                messagesLoadingOlder={messagesQuery.loadingOlderMessages}
                notificationContent={notificationContent}
                notificationPending={notificationMutation.isPending}
                onConversationContentChange={setConversationContent}
                onCopy={(value, label) => {
                  void handleCopy(value, label);
                }}
                onDeleteEntry={(entry) => {
                  void handleDeleteEntry(entry);
                }}
                onEditCancel={handleCancelEditingEntry}
                onEditChange={setEditingEntryContent}
                onEditSave={(entry) => {
                  void handleSaveEditedEntry(entry);
                }}
                onEditStart={handleStartEditingEntry}
                onIngest={() => {
                  void handleIngest();
                }}
                onLoadOlderMessages={() => {
                  void messagesQuery.loadOlderMessages();
                }}
                onMailContentChange={setMailContent}
                onMailFromEmailChange={setMailFromEmail}
                onMailSubjectChange={setMailSubject}
                onMemoContentChange={setMemoContent}
                onNotificationContentChange={setNotificationContent}
                onOpenCv={(lead) => {
                  void handleOpenCv(lead);
                }}
                onSaveConversation={() => {
                  void handleSaveInternal("conversation");
                }}
                onSaveMemo={() => {
                  void handleSaveInternal("memo");
                }}
                onSaveNotification={() => {
                  void handleSaveNotification();
                }}
                onSendMail={() => {
                  void handleSendMail();
                }}
                onSetDetailTab={setDetailTab}
                updatePendingEntryId={updatingEntryId}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {quickMemoLead ? (
              <QuickMemoModal
                isSaving={isQuickMemoSaving}
                lead={quickMemoLead}
                onChange={setQuickMemoContent}
                onClose={handleCloseQuickMemo}
                onSubmit={() => {
                  void handleSaveQuickMemo();
                }}
                value={quickMemoContent}
              />
            ) : null}
          </AnimatePresence>
        </section>
      </OpsShell>
    </>
  );
}
