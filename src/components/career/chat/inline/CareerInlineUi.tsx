import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BriefcaseBusiness, Search } from "lucide-react";
import type { FetchWithAuth } from "@/hooks/career/useCareerApi";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useCareerMobileHistoryOpportunities } from "@/hooks/career/useCareerMobileHistoryOpportunities";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import type { CareerInlineUiReference } from "@/lib/career/inlineUi";
import type { CareerMatchingResultsPage } from "@/lib/career/matching/listTypes";
import { getPostingRoleIdFromOpportunityId } from "@/lib/career/postingLinks";
import { MuteButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppleSwitch } from "@/components/ui/switch";
import { TabBoxes } from "@/components/ui/tab-boxes";
import { useOptionalCareerChatPanelContext } from "../../CareerChatPanelContext";
import {
  useCareerHistoryContext,
  useCareerProfileContext,
  type CareerHistoryContextValue,
  type CareerProfileContextValue,
} from "../../CareerSidebarContext";
import type { CareerHistoryOpportunity } from "../../types";
import OpportunityCard from "../../history/OpportunityCard";
import ProgressOpportunityRow from "../../history/ProgressOpportunityRow";
import SavedOpportunityList from "../../history/SavedOpportunityList";
import CareerOpportunityPreviewModal from "../../history/CareerOpportunityPreviewModal";
import ExternalOpportunityApplyModal from "../../history/ExternalOpportunityApplyModal";
import { getCareerOpportunityManagementStatus } from "../../history/savedOpportunityStatus";
import CareerTalentContextSection from "../../profile/CareerTalentContextSection";

export type CareerInlineUiRuntime = {
  userId: string | null;
  fetchWithAuth: FetchWithAuth;
  history: Pick<
    CareerHistoryContextValue,
    | "historyOpportunities"
    | "historyOpportunityCounts"
    | "historyLoading"
    | "historyUpdateError"
    | "onLoadMoreHistoryOpportunities"
    | "onLoadSavedStageHistoryOpportunityPages"
    | "getHistoryOpportunityPageFilterState"
  >;
  profile: Pick<
    CareerProfileContextValue,
    | "talentBrief"
    | "talentContextsSavePending"
    | "talentContextsSaveError"
    | "mutateTalentContexts"
  >;
  pendingIds: readonly string[];
  actionError?: string;
  onOpen: (item: CareerHistoryOpportunity) => void;
  onApply: (item: CareerHistoryOpportunity) => void;
  onSave: (item: CareerHistoryOpportunity) => void | Promise<void>;
};

// The preview supplies synthetic readers/actions to the same renderer, without production requests.
const RuntimeContext = createContext<CareerInlineUiRuntime | null>(null);
export const CareerInlineUiProvider = RuntimeContext.Provider;
const surface = "w-full min-w-0 rounded-3xl bg-black/4 p-4 sm:p-5";

export function CareerInlineUiUnavailable() {
  const t = useCareerT();
  return (
    <p role="status" className={`${surface} text-sm text-neutral-muted`}>
      {t("career.chat.inline_ui.unavailable", "이 내용을 표시할 수 없어요.")}
    </p>
  );
}

function ReadState({
  loading,
  error,
  empty,
  onRetry,
  children,
}: {
  loading: boolean;
  error: boolean;
  empty: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const t = useCareerT();
  return (
    <>
      {children}
      {loading && empty ? (
        <div aria-busy="true" className="space-y-3 py-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 py-3 text-sm text-neutral-muted"
        >
          {t("career.matchings.load_failed", "목록을 불러오지 못했어요.")}
          <MuteButton onClick={onRetry}>
            {t("career.matchings.retry", "다시 시도")}
          </MuteButton>
        </div>
      ) : !loading && empty ? (
        <p className="py-5 text-sm text-neutral-muted">
          {t("career.chat.inline_ui.empty", "표시할 기회가 없어요.")}
        </p>
      ) : null}
    </>
  );
}

function More({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  const t = useCareerT();
  return (
    <MuteButton
      className="mt-3 w-full"
      variant="transparent"
      disabled={pending}
      onClick={onClick}
    >
      {t(
        "career.history.opportunity_recommendation_preview.show_more",
        "더보기"
      )}
    </MuteButton>
  );
}

function SaveAction({
  item,
  runtime,
}: {
  item: CareerHistoryOpportunity;
  runtime: CareerInlineUiRuntime;
}) {
  const t = useCareerT();
  if (
    item.isInternal ||
    item.sourceType === "internal" ||
    (item.savedStage && item.savedStage !== "saved")
  )
    return null;
  const saved = item.savedStage === "saved";
  return (
    <MuteButton
      variant="transparent"
      disabled={runtime.pendingIds.includes(item.id)}
      aria-label={`${item.companyName} ${saved ? t("career.chat.inline_ui.unsave", "저장 취소") : t("career.company.jobs.save", "저장하기")}`}
      aria-pressed={saved}
      onClick={() => void runtime.onSave(item)}
    >
      <Bookmark className={`size-4 ${saved ? "fill-current" : ""}`} />
    </MuteButton>
  );
}

function Matching({
  reference,
  runtime,
}: {
  reference: Extract<CareerInlineUiReference, { type: "matching" }>;
  runtime: CareerInlineUiRuntime;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const [excludeRecommended, setExcludeRecommended] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [
      "career-matching-results",
      runtime.userId,
      reference.matchingId,
      excludeRecommended,
      locale,
      ...(reference.runId ? [reference.runId] : []),
    ],
    enabled: Boolean(runtime.userId),
    initialPageParam: null as string | null,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<CareerMatchingResultsPage> => {
      const params = new URLSearchParams({
        matchingId: reference.matchingId,
        locale,
        excludeRecommended: String(excludeRecommended),
      });
      if (reference.runId) params.set("runId", reference.runId);
      if (pageParam) params.set("cursor", pageParam);
      const response = await runtime.fetchWithAuth(
        `/api/talent/matchings?${params}`,
        { signal }
      );
      if (!response.ok) throw new Error("Matching unavailable");
      return response.json();
    },
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 60_000,
  });
  const rows = useMemo(
    () => [
      ...new Map(
        (query.data?.pages.flatMap((page) => page.opportunities) ?? []).map(
          (row) => [row.roleId, row]
        )
      ).values(),
    ],
    [query.data]
  );
  const currentItems = useMemo(
    () =>
      new Map(
        runtime.history.historyOpportunities.map((item) => [item.roleId, item])
      ),
    [runtime.history.historyOpportunities]
  );
  return (
    <section
      aria-label={t("career.chat.inline_ui.matching", "매칭 결과")}
      className={surface}
    >
      <div className="flex items-center gap-3">
        <Search className="size-5 shrink-0 text-black/40" />
        <div>
          <h3 className="text-sm font-normal">
            {t("career.chat.inline_ui.matching", "매칭 결과")}
          </h3>
          {query.data?.pages[0]?.matching?.title ? (
            <p className="mt-0.5 text-xs font-light text-neutral-muted">
              {query.data.pages[0].matching.title}
            </p>
          ) : null}
        </div>
      </div>
      <label className="mt-5 flex items-center justify-between gap-3 text-xs text-neutral-muted">
        {t("career.matchings.exclude_recommended", "추천된 포지션 제외")}
        <AppleSwitch
          checked={excludeRecommended}
          onCheckedChange={setExcludeRecommended}
          aria-label={t(
            "career.matchings.exclude_recommended",
            "추천된 포지션 제외"
          )}
        />
      </label>
      <ReadState
        loading={query.isPending && Boolean(runtime.userId)}
        error={query.isError || !runtime.userId}
        empty={!rows.length}
        onRetry={() => void query.refetch()}
      >
        <ul className="mt-4 space-y-3">
          {rows.map((row) => {
            const item = currentItems.get(row.roleId) ?? row.opportunity;
            if (!item)
              return (
                <li
                  key={row.roleId}
                  className="rounded-lg bg-bg-floating p-4 text-sm text-neutral-muted"
                >
                  {row.title || row.companyName} ·{" "}
                  {t("career.matchings.unavailable", "포지션 정보 없음")}
                </li>
              );
            // Existing candidate-facing notes only; private assessment payloads are not UI copy.
            const reason =
              row.opportunity?.recommendationNote ||
              row.opportunity?.recommendationSummary;
            return (
              <li key={row.roleId}>
                <OpportunityCard
                  item={item}
                  expanded={false}
                  showUnreadIndicator={false}
                  connectionIndicator="logo"
                  onOpenDetail={() => runtime.onOpen(item)}
                  collapsedActions={
                    <SaveAction item={item} runtime={runtime} />
                  }
                  collapsedFooter={
                    <div className="mt-2 space-y-1 pl-[52px] sm:pl-[60px]">
                      <p
                        className={`text-[11px] font-normal leading-4 ${row.isRecommended ? "text-action" : "text-neutral-muted"}`}
                      >
                        {row.isRecommended
                          ? t("career.company.jobs.recommended", "추천됨")
                          : t(
                              "career.chat.inline_ui.not_recommended",
                              "추천 제외"
                            )}
                      </p>
                      {reason ? (
                        <p className="whitespace-pre-line text-[13px] font-normal leading-5 text-neutral-secondary">
                          {reason}
                        </p>
                      ) : null}
                    </div>
                  }
                />
              </li>
            );
          })}
        </ul>
      </ReadState>
      {runtime.actionError ? (
        <p role="alert" className="mt-3 text-sm text-critical">
          {runtime.actionError}
        </p>
      ) : null}
      {query.hasNextPage ? (
        <More
          pending={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        />
      ) : null}
    </section>
  );
}

function OpportunityRows({
  items,
  runtime,
}: {
  items: CareerHistoryOpportunity[];
  runtime: CareerInlineUiRuntime;
}) {
  const pendingIds = useMemo(
    () => new Set(runtime.pendingIds),
    [runtime.pendingIds]
  );
  return (
    <div className="mt-4 space-y-3">
      {items.map((item) => {
        const status = getCareerOpportunityManagementStatus(item);
        const pending = pendingIds.has(item.id);
        if (
          status === "applied" ||
          status === "connected" ||
          status === "offer"
        )
          return (
            <ProgressOpportunityRow
              key={item.roleId}
              item={item}
              status={status}
              pending={pending}
              onOpenDetail={runtime.onOpen}
            />
          );
        if (status === "saved")
          return (
            <SavedOpportunityList
              key={item.roleId}
              items={[item]}
              pendingOpportunityIds={pendingIds}
              onOpenDetail={runtime.onOpen}
              onApply={runtime.onApply}
            />
          );
        return (
          <OpportunityCard
            key={item.roleId}
            item={item}
            expanded={false}
            showUnreadIndicator={false}
            connectionIndicator="logo"
            onOpenDetail={() => runtime.onOpen(item)}
            collapsedActions={<SaveAction item={item} runtime={runtime} />}
          />
        );
      })}
      {runtime.actionError ? (
        <p role="alert" className="text-sm text-critical">
          {runtime.actionError}
        </p>
      ) : null}
    </div>
  );
}

function Collection({
  reference,
  runtime,
}: {
  reference: Extract<CareerInlineUiReference, { scope: string }>;
  runtime: CareerInlineUiRuntime;
}) {
  const t = useCareerT();
  const [tab, setTab] = useState(reference.scope);
  const saved = useCareerMobileHistoryOpportunities({
    ...runtime.history,
    enabled: Boolean(runtime.userId) && tab !== "progress",
    activeTab: "saved",
  });
  const progress = useCareerMobileHistoryOpportunities({
    ...runtime.history,
    enabled: Boolean(runtime.userId) && tab !== "saved",
    activeTab: "applied",
  });
  const selected =
    tab === "saved"
      ? [saved]
      : tab === "progress"
        ? [progress]
        : [progress, saved];
  const items = selected.flatMap((page) => page.opportunities);
  const loadMore = () => selected.forEach((page) => page.loadMore());
  return (
    <section
      aria-label={t("career.chat.inline_ui.collection", "기회 모음")}
      className={surface}
    >
      <h3 className="flex items-center gap-3 text-sm font-normal">
        <BriefcaseBusiness className="size-5 text-black/40" />
        {t("career.workspace.my_opportunities", "내 기회")}
      </h3>
      <TabBoxes
        className="mt-5"
        activeValue={tab}
        onValueChange={setTab}
        size="sm"
        variant="neutral"
        items={[
          {
            value: "all",
            label: t("career.chat.inline_ui.all", "전체"),
            count: saved.totalCount + progress.totalCount,
          },
          {
            value: "saved",
            label: t(
              "career.common.career_history_panel.saved_positions_tab",
              "저장함"
            ),
            count: saved.totalCount,
          },
          {
            value: "progress",
            label: t("career.common.career_history_panel.0y27adb", "진행중"),
            count: progress.totalCount,
          },
        ]}
      />
      <ReadState
        loading={selected.some((page) => page.isLoading)}
        error={Boolean(runtime.history.historyUpdateError) || !runtime.userId}
        empty={!items.length}
        onRetry={loadMore}
      >
        <OpportunityRows items={items} runtime={runtime} />
      </ReadState>
      {selected.some((page) => page.hasMore) ? (
        <More
          pending={selected.some((page) => page.isLoading)}
          onClick={loadMore}
        />
      ) : null}
    </section>
  );
}

function SelectedOpportunities({
  reference,
  runtime,
}: {
  reference: Extract<CareerInlineUiReference, { roleIds: string[] }>;
  runtime: CareerInlineUiRuntime;
}) {
  const t = useCareerT();
  const { locale } = useMessages();
  const query = useInfiniteQuery({
    queryKey: [
      "career-inline-opportunities",
      runtime.userId,
      locale,
      reference.roleIds,
    ],
    enabled: Boolean(runtime.userId),
    initialPageParam: 0,
    queryFn: async ({
      pageParam,
      signal,
    }): Promise<{
      items: CareerHistoryOpportunity[];
      requestedCount: number;
      nextOffset: number | null;
    }> => {
      // Same ten-row presentation page as the existing history reader; no per-card requests.
      const roleIds = reference.roleIds.slice(pageParam, pageParam + 10);
      const response = await runtime.fetchWithAuth(
        `/api/talent/opportunities?${new URLSearchParams({ roleIds: roleIds.join(","), locale })}`,
        { signal }
      );
      if (!response.ok) throw new Error("Opportunities unavailable");
      const data = await response.json();
      const byRoleId = new Map<string, CareerHistoryOpportunity>(
        data.items.map((item: CareerHistoryOpportunity) => [item.roleId, item])
      );
      return {
        items: roleIds.flatMap((id) =>
          byRoleId.has(id) ? [byRoleId.get(id)!] : []
        ),
        requestedCount: roleIds.length,
        nextOffset:
          pageParam + roleIds.length < reference.roleIds.length
            ? pageParam + roleIds.length
            : null,
      };
    },
    getNextPageParam: (page) => page.nextOffset,
    staleTime: 60_000,
  });
  const currentItems = new Map(
    runtime.history.historyOpportunities.map((item) => [item.roleId, item])
  );
  const items =
    query.data?.pages
      .flatMap((page) => page.items)
      .map((item) => currentItems.get(item.roleId) ?? item) ?? [];
  return (
    <section
      aria-label={t("career.chat.inline_ui.collection", "기회 모음")}
      className={surface}
    >
      <h3 className="flex items-center gap-3 text-sm font-normal">
        <BriefcaseBusiness className="size-5 text-black/40" />
        {t("career.chat.inline_ui.collection", "기회 모음")}
      </h3>
      <ReadState
        loading={query.isPending && Boolean(runtime.userId)}
        error={query.isError || !runtime.userId}
        empty={!items.length}
        onRetry={() => void query.refetch()}
      >
        <OpportunityRows items={items} runtime={runtime} />
      </ReadState>
      {items.length > 0 &&
      query.data?.pages.some(
        (page) => page.items.length < page.requestedCount
      ) ? (
        <p role="status" className="mt-3 text-xs text-neutral-muted">
          {t(
            "career.chat.inline_ui.partly_unavailable",
            "일부 기회는 조회할 수 없어요."
          )}
        </p>
      ) : null}
      {query.hasNextPage ? (
        <More
          pending={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        />
      ) : null}
    </section>
  );
}

function InlineUiView({
  reference,
  runtime,
}: {
  reference: CareerInlineUiReference;
  runtime: CareerInlineUiRuntime;
}) {
  if (!runtime.userId) return <CareerInlineUiUnavailable />;
  if (reference.type === "matching")
    return <Matching reference={reference} runtime={runtime} />;
  if (reference.type === "opportunities")
    return "roleIds" in reference ? (
      <SelectedOpportunities reference={reference} runtime={runtime} />
    ) : (
      <Collection reference={reference} runtime={runtime} />
    );
  return (
    <section className={surface}>
      {runtime.profile.talentBrief === undefined ? (
        <div aria-busy="true">
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : (
        <CareerTalentContextSection
          brief={runtime.profile.talentBrief ?? []}
          memories={[]}
          mutate={runtime.profile.mutateTalentContexts}
          pending={runtime.profile.talentContextsSavePending}
          error={runtime.profile.talentContextsSaveError}
        />
      )}
    </section>
  );
}

function ConnectedInlineUi({
  reference,
}: {
  reference: CareerInlineUiReference;
}) {
  const chat = useOptionalCareerChatPanelContext();
  const history = useCareerHistoryContext();
  const profile = useCareerProfileContext();
  const { fetchWithAuth } = useCareerApi();
  const { locale } = useMessages();
  const t = useCareerT();
  const queries = useQueryClient();
  const [preview, setPreview] = useState<CareerHistoryOpportunity | null>(null);
  const [application, setApplication] =
    useState<CareerHistoryOpportunity | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const saving = useRef(false);
  const [error, setError] = useState("");
  const refresh = async (roleId: string) => {
    await history.onRefreshHistoryOpportunities(roleId);
    await Promise.all([
      queries.invalidateQueries({
        queryKey: ["career-matching-results", profile.user?.id],
      }),
      queries.invalidateQueries({
        queryKey: ["career-inline-opportunities", profile.user?.id],
      }),
    ]);
  };
  const open = (item: CareerHistoryOpportunity) => {
    if (
      !getPostingRoleIdFromOpportunityId(item.id) &&
      chat?.onOpenHistoryOpportunity
    )
      chat.onOpenHistoryOpportunity(item.roleId);
    else setPreview(item);
  };
  const save = async (item: CareerHistoryOpportunity) => {
    if (saving.current) return;
    saving.current = true;
    setSavingId(item.id);
    setError("");
    try {
      if (item.savedStage === "saved") {
        if (
          (await history.onUpdateHistoryOpportunityFeedback(item.id, null, {
            fallbackOpportunity: item,
          })) !== true
        )
          throw new Error("Save failed");
      } else {
        const response = await fetchWithAuth("/api/talent/opportunities/save", {
          method: "POST",
          body: JSON.stringify({ roleId: item.roleId, locale }),
        });
        if (!response.ok) throw new Error("Save failed");
      }
      await refresh(item.roleId);
    } catch {
      setError(
        t(
          "career.company.jobs.save_failed",
          "포지션을 저장하지 못했어요. 다시 시도해 주세요."
        )
      );
    } finally {
      saving.current = false;
      setSavingId(null);
    }
  };
  const runtime: CareerInlineUiRuntime = {
    userId: profile.user?.id ?? null,
    fetchWithAuth,
    history,
    profile,
    pendingIds: savingId
      ? [...history.historyUpdatingOpportunityIds, savingId]
      : history.historyUpdatingOpportunityIds,
    actionError: error,
    onOpen: open,
    onSave: save,
    onApply: (item) =>
      item.isInternal || item.sourceType === "internal"
        ? open(item)
        : setApplication(item),
  };
  return (
    <>
      <InlineUiView reference={reference} runtime={runtime} />
      <CareerOpportunityPreviewModal
        item={preview}
        onClose={() => setPreview(null)}
        onSaved={(item) => void refresh(item.roleId)}
      />
      {application && chat ? (
        <ExternalOpportunityApplyModal
          item={application}
          pending={history.historyUpdatingOpportunityIds.includes(
            application.id
          )}
          error={history.historyUpdateError || null}
          onClose={() => setApplication(null)}
          onOpenChat={() => undefined}
          onApplied={() => void refresh(application.roleId)}
          onOpenLink={(url) =>
            window.open(url, "_blank", "noopener,noreferrer")
          }
          onSave={async (stage) =>
            (await history.onUpdateHistoryOpportunityFeedback(
              application.id,
              "positive",
              { fallbackOpportunity: application, savedStage: stage }
            )) === true
          }
        />
      ) : null}
    </>
  );
}

export default function CareerInlineUi({
  reference,
}: {
  reference: CareerInlineUiReference;
}) {
  const runtime = useContext(RuntimeContext);
  return runtime ? (
    <InlineUiView reference={reference} runtime={runtime} />
  ) : (
    <ConnectedInlineUi reference={reference} />
  );
}
