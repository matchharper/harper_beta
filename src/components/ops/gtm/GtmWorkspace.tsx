import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "next/router";
import { Columns3, Copy, Plus, RefreshCw, Settings2, X } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import DataGrid, {
  type ReferenceOption,
} from "@/components/ui/data-grid/DataGrid";
import { useAuthStore } from "@/store/useAuthStore";
import { useGtmViewStore } from "@/store/useGtmViewStore";
import { gtmRequest } from "@/lib/gtm/client";
import { mailStatusLabels } from "@/lib/gtm/email";
import { resolveNavigation } from "@/lib/gtm/navigation";
import {
  gtmQueryValue,
  isGtmRecordId,
  normalizeGtmRecordTab,
} from "@/lib/gtm/url";
import {
  sourceFields,
  type GtmCatalog,
  type GtmQueryResult,
  type GtmRow,
  type GtmSheet,
  type SheetDefinition,
} from "@/lib/gtm/types";
import { ColumnSettings } from "./ColumnSettings";
import SheetDialog from "./SheetDialog";
import OutreachReviewDialog from "./OutreachReviewDialog";
import RecordWorkspace from "./RecordWorkspace";
import type { GtmSource, GtmValue } from "@/lib/gtm/types";
import styles from "./GtmWorkspace.module.css";

export default function GtmWorkspace() {
  const router = useRouter();
  const openedCreator = useRef<string | null>(null);
  const account = useAuthStore((state) => state.user?.id ?? "");
  const store = useGtmViewStore();
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState("");
  const [columnDialog, setColumnDialog] = useState<{
    key: string | null;
  } | null>(null);
  const [sheetDialog, setSheetDialog] = useState<"new" | "edit" | null>(null);
  type RecordLocation = {
    source: GtmSource;
    row: GtmRow | null;
    defaults?: Record<string, GtmValue>;
    tab?: string;
  };
  const [recordDialog, setRecordDialog] = useState<RecordLocation | null>(null);
  const [recordStack, setRecordStack] = useState<RecordLocation[]>([]);
  const updateRoute = useCallback(
    (
      updates: Record<string, string | null | undefined>,
      method: "push" | "replace" = "replace"
    ) => {
      if (!router.isReady) return Promise.resolve(false);
      const query = { ...router.query };
      for (const [key, value] of Object.entries(updates)) {
        if (value) query[key] = value;
        else delete query[key];
      }
      return router[method]({ pathname: router.pathname, query }, undefined, {
        shallow: true,
        scroll: false,
      });
    },
    [router]
  );
  function openRecord(
    sourceId: string,
    row: GtmRow | null,
    defaults?: Record<string, GtmValue>,
    tab?: string,
    replace = false
  ) {
    const nextSource = catalog.data?.sources.find(
      (item) => item.id === sourceId
    );
    if (!nextSource) return;
    if (recordDialog && !replace)
      setRecordStack((stack) => [...stack, recordDialog]);
    setRecordDialog({
      source: nextSource,
      row,
      defaults,
      tab: tab ?? (sourceId === "creators" && row ? "conversation" : "info"),
    });
    if (sourceId === "creators" && row && isGtmRecordId(row.id)) {
      openedCreator.current = row.id;
      void updateRoute(
        {
          sheet: selected?.id,
          creator: row.id,
          creatorTab: tab ?? "conversation",
        },
        "push"
      );
    }
  }
  function closeRecord() {
    const hasCreator =
      recordDialog?.source.id === "creators" ||
      recordStack.some((item) => item.source.id === "creators");
    setRecordDialog(null);
    setRecordStack([]);
    if (hasCreator) {
      void updateRoute({ creator: null, creatorTab: null });
    }
  }
  function backRecord() {
    const previous = recordStack[recordStack.length - 1];
    if (!previous) return;
    setRecordDialog(previous);
    setRecordStack((stack) => stack.slice(0, -1));
    if (
      previous.source.id === "creators" &&
      previous.row &&
      isGtmRecordId(previous.row.id)
    ) {
      openedCreator.current = previous.row.id;
      void updateRoute({
        creator: previous.row.id,
        creatorTab: previous.tab ?? "conversation",
      });
    } else if (recordDialog?.source.id === "creators") {
      void updateRoute({ creator: null, creatorTab: null });
    }
  }
  const [savingLayout, setSavingLayout] = useState(false),
    [editingCell, setEditingCell] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<
    "saved" | "waiting" | "saving" | "error"
  >("saved");
  const [layoutConflict, setLayoutConflict] = useState(false);
  const [layoutRetryTick, setLayoutRetryTick] = useState(0);
  const layoutSaveInFlight = useRef(false);
  const queuedLayoutSave = useRef<{ key: string; id: string } | null>(null);
  const layoutRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState("");
  const [sendingReviewId, setSendingReviewId] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [periodEnd, setPeriodEnd] = useState(() => Date.now());
  const pendingWrite = useRef<{ signature: string; id: string } | null>(null);
  const catalogKey = ["ops-gtm", account, "catalog"];
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => gtmRequest<GtmCatalog>("catalog", {}, signal),
    enabled: Boolean(account),
    staleTime: 30000,
    retry: false,
  });
  const sheets = catalog.data?.sheets ?? [];
  const requestedSheetId = gtmQueryValue(router.query.sheet);
  const selected =
    sheets.find((item) => item.id === requestedSheetId) ??
    sheets.find((item) => item.id === store.selected[account]) ??
    sheets[0];
  const selectedId = selected?.id;
  const creatorSource = catalog.data?.sources.find(
    (item) => item.id === "creators"
  );
  const routeCreatorId = gtmQueryValue(router.query.creator);
  const routeCreatorTab = normalizeGtmRecordTab(router.query.creatorTab);
  useEffect(() => {
    if (!router.isReady || !account || !sheets.length || !selected) return;
    if (store.selected[account] !== selected.id) {
      store.select(account, selected.id);
    }
    if (requestedSheetId !== selected.id) {
      void updateRoute({ sheet: selected.id });
    }
  }, [
    account,
    requestedSheetId,
    router.isReady,
    selected,
    sheets.length,
    store,
    updateRoute,
  ]);
  useEffect(() => {
    if (!router.isReady || !creatorSource) return;
    if (isGtmRecordId(routeCreatorId)) {
      if (openedCreator.current === routeCreatorId) {
        setRecordDialog((current) =>
          current?.source.id === "creators" &&
          current.row?.id === routeCreatorId &&
          current.tab !== routeCreatorTab
            ? { ...current, tab: routeCreatorTab }
            : current
        );
        return;
      }
      openedCreator.current = routeCreatorId;
      setRecordStack([]);
      setRecordDialog({
        source: creatorSource,
        row: { id: routeCreatorId },
        tab: routeCreatorTab,
      });
      return;
    }
    if (openedCreator.current) {
      openedCreator.current = null;
      setRecordDialog((current) =>
        current?.source.id === "creators" ? null : current
      );
      setRecordStack([]);
    }
  }, [creatorSource, routeCreatorId, routeCreatorTab, router.isReady]);
  const draftKey = `${account}:${selected?.id ?? ""}`;
  const draft = store.drafts[draftKey];
  const definition = draft?.definition ?? selected?.definition;
  const source = catalog.data?.sources.find(
    (item) => item.id === definition?.source
  );
  const fields = source
    ? sourceFields(source, catalog.data?.sources ?? [])
    : [];
  const queryShape = definition
    ? JSON.stringify({
        source: definition.source,
        columns: definition.columns.map((column) => column.key).sort(),
        filters: definition.filters,
        sorting: definition.sorting,
      })
    : "";
  const period = useMemo(
    () => ({
      start_at: new Date(periodEnd - days * 86400000).toISOString(),
      end_at: new Date(periodEnd).toISOString(),
    }),
    [days, periodEnd]
  );
  const rows = useInfiniteQuery({
    queryKey: [
      "ops-gtm",
      account,
      "rows",
      selected?.id,
      queryShape,
      debouncedSearch,
      period,
    ],
    queryFn: ({ pageParam, signal }) =>
      gtmRequest<GtmQueryResult>(
        "query",
        {
          sheet_id: selected!.id,
          definition,
          search: debouncedSearch,
          offset: pageParam,
          limit: 100,
          period,
        },
        signal
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.rows.length;
      return lastPage.rows.length > 0 && nextOffset < lastPage.total
        ? nextOffset
        : undefined;
    },
    enabled: Boolean(selected && definition && hydrated),
    retry: false,
    staleTime: 15000,
    refetchOnWindowFocus: false,
  });
  const loadedRows = useMemo(
    () => rows.data?.pages.flatMap((page) => page.rows) ?? [],
    [rows.data]
  );
  const totalRows = rows.data?.pages.at(-1)?.total ?? 0;
  useEffect(() => {
    void Promise.resolve(useGtmViewStore.persist.rehydrate()).then(() =>
      setHydrated(true)
    );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const dirty = Boolean(draft);
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (editingCell || dirty || savingLayout) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty, editingCell, savingLayout]);

  function changeDefinition(next: SheetDefinition) {
    if (!selected) return;
    setLayoutStatus("waiting");
    store.setDraft(draftKey, {
      definition: next,
      name: draft?.name ?? selected.name,
      expectedVersion: draft?.expectedVersion ?? selected.row_version,
    });
  }
  function acceptSheet(sheet: GtmSheet, activate = true) {
    queryClient.setQueryData<GtmCatalog>(catalogKey, (current) =>
      current
        ? {
            ...current,
            sheets: [
              ...current.sheets.filter((item) => item.id !== sheet.id),
              sheet,
            ].sort((a, b) => a.position - b.position),
          }
        : current
    );
    store.clearDraft(`${account}:${sheet.id}`);
    if (activate) selectSheet(sheet.id);
  }
  const persistLayout = useCallback(
    async (key: string, sheetId: string) => {
      const snapshot = useGtmViewStore.getState().drafts[key];
      if (!snapshot) return;
      if (layoutSaveInFlight.current) {
        queuedLayoutSave.current = { key, id: sheetId };
        return;
      }
      layoutSaveInFlight.current = true;
      setSavingLayout(true);
      setLayoutStatus("saving");
      setError("");
      try {
        const saved = await gtmRequest<GtmSheet>("save_sheet", {
          id: sheetId,
          name: snapshot.name,
          expected_version: snapshot.expectedVersion,
          definition: snapshot.definition,
        });
        queryClient.setQueryData<GtmCatalog>(
          ["ops-gtm", account, "catalog"],
          (current) =>
            current
              ? {
                  ...current,
                  sheets: [
                    ...current.sheets.filter((item) => item.id !== saved.id),
                    saved,
                  ].sort((a, b) => a.position - b.position),
                }
              : current
        );
        const current = useGtmViewStore.getState().drafts[key];
        if (current) {
          const snapshotContent = JSON.stringify({
            name: snapshot.name,
            definition: snapshot.definition,
          });
          const currentContent = JSON.stringify({
            name: current.name,
            definition: current.definition,
          });
          if (
            snapshotContent === currentContent &&
            current.expectedVersion === snapshot.expectedVersion
          )
            useGtmViewStore.getState().clearDraft(key);
          else
            useGtmViewStore.getState().setDraft(key, {
              ...current,
              expectedVersion: saved.row_version,
            });
        }
        setLayoutConflict(false);
        setLayoutStatus("saved");
      } catch (cause) {
        const conflict =
          cause instanceof Error && "status" in cause && cause.status === 409;
        setLayoutConflict(conflict);
        setLayoutStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "구성을 자동 저장하지 못했습니다."
        );
        if (conflict)
          void queryClient.invalidateQueries({
            queryKey: ["ops-gtm", account, "catalog"],
          });
        else {
          if (layoutRetryTimer.current) clearTimeout(layoutRetryTimer.current);
          layoutRetryTimer.current = setTimeout(
            () => setLayoutRetryTick((value) => value + 1),
            3000
          );
        }
      } finally {
        layoutSaveInFlight.current = false;
        setSavingLayout(false);
        if (queuedLayoutSave.current) {
          queuedLayoutSave.current = null;
          setLayoutRetryTick((value) => value + 1);
        }
      }
    },
    [
      account,
      queryClient,
      setError,
      setLayoutConflict,
      setLayoutRetryTick,
      setLayoutStatus,
      setSavingLayout,
    ]
  );
  useEffect(() => {
    if (!selectedId || !draft || layoutConflict) return;
    const timer = setTimeout(
      () => void persistLayout(draftKey, selectedId),
      600
    );
    return () => clearTimeout(timer);
  }, [
    draft,
    draftKey,
    layoutConflict,
    layoutRetryTick,
    persistLayout,
    selectedId,
  ]);
  useEffect(
    () => () => {
      if (layoutRetryTimer.current) clearTimeout(layoutRetryTimer.current);
    },
    []
  );
  function selectSheet(id: string) {
    if (selected && draft) void persistLayout(draftKey, selected.id);
    setError("");
    setLayoutConflict(false);
    setSearch("");
    setDebouncedSearch("");
    store.select(account, id);
    void updateRoute({ sheet: id }, "push");
  }
  const locked = editingCell;
  const staleDraft = Boolean(
    draft && selected && draft.expectedVersion !== selected.row_version
  );
  const performance = source?.performance === true;

  async function sendReview(row: GtmRow) {
    if (source?.id !== "review" || row.status !== "ready_for_review") return;
    setSendingReviewId(row.id);
    setError("");
    try {
      const result = await gtmRequest<GtmRow & { delivery_error?: string }>(
        "review_outreach",
        {
          source: source.id,
          record_id: row.id,
          expected_version: row.row_version,
          decision: "approve",
          subject: String(row.subject ?? ""),
          body: String(row.body ?? ""),
          scheduled_at: new Date().toISOString(),
          review_note: String(row.review_note ?? ""),
          request_id: crypto.randomUUID(),
        }
      );
      if (result.delivery_error) throw new Error(result.delivery_error);
      await queryClient.invalidateQueries({
        queryKey: ["ops-gtm", account],
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "메일을 발송하지 못했습니다."
      );
    } finally {
      setSendingReviewId(null);
    }
  }

  return (
    <section className={styles.workspace} aria-label="GTM 업무 시트">
      <div className={styles.toolbar}>
        <select
          className={styles.select}
          aria-label="시트 선택"
          value={selected?.id ?? ""}
          disabled={locked}
          onChange={(event) => selectSheet(event.target.value)}
        >
          {!sheets.length && <option value="">시트</option>}
          {sheets.map((sheet) => (
            <option key={sheet.id} value={sheet.id}>
              {sheet.name}
            </option>
          ))}
        </select>
        <MuteButton
          aria-label="새 시트"
          disabled={locked || !catalog.data?.can_write}
          onClick={() => setSheetDialog("new")}
        >
          <Plus size={15} />
        </MuteButton>
        <MuteButton
          aria-label="시트 관리"
          disabled={locked || !selected || !catalog.data?.can_write}
          onClick={() => setSheetDialog("edit")}
        >
          <Settings2 size={15} />
        </MuteButton>
        <span style={{ borderLeft: "1px solid #c9cdd2", height: 24 }} />
        <MuteButton
          disabled={locked || !selected}
          onClick={() => setColumnDialog({ key: null })}
        >
          <Columns3 size={15} />
          컬럼
        </MuteButton>
        <input
          className={styles.search}
          aria-label="시트 검색"
          placeholder="현재 시트 검색"
          value={search}
          disabled={locked}
          onChange={(event) => setSearch(event.target.value)}
        />
        {performance && (
          <select
            aria-label="성과 기간"
            value={days}
            disabled={locked}
            onChange={(event) => {
              setDays(Number(event.target.value));
              setPeriodEnd(Date.now());
            }}
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        )}
        {Boolean(definition?.filters.length) && (
          <MuteButton
            disabled={locked}
            onClick={() => changeDefinition({ ...definition!, filters: [] })}
          >
            <X size={14} />
            필터 {definition!.filters.length}
          </MuteButton>
        )}
        <div className={styles.spacer} />
        {source?.writable && (
          <MuteButton
            disabled={locked || !catalog.data?.can_write}
            onClick={() => openRecord(source!.id, null)}
          >
            <Plus size={15} />행 추가
          </MuteButton>
        )}
        <span
          className={styles.autoSaveStatus}
          role="status"
          aria-live="polite"
        >
          {savingLayout || layoutStatus === "saving"
            ? "자동 저장 중…"
            : layoutStatus === "waiting"
              ? ""
              : layoutStatus === "error"
                ? layoutConflict
                  ? "자동 저장 충돌"
                  : "자동 저장 재시도 중"
                : ""}
        </span>
        <MuteButton
          aria-label="새로고침"
          disabled={locked || catalog.isFetching || rows.isFetching}
          onClick={() => {
            setPeriodEnd(Date.now());
            void catalog.refetch();
          }}
        >
          <RefreshCw size={15} />
        </MuteButton>
      </div>
      {dirty && (layoutConflict || staleDraft) && (
        <div
          className={styles.notice}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <span>
            다른 팀원이 저장한 구성이 있습니다. 내 변경을 복제하거나 최신 구성을
            불러오세요.
          </span>
          <MuteButton
            size="sm"
            disabled={locked}
            onClick={() => {
              store.clearDraft(draftKey);
              void catalog.refetch();
            }}
          >
            내 구성 변경 취소
          </MuteButton>
          {(layoutConflict || staleDraft) && (
            <MuteButton
              size="sm"
              disabled={locked}
              onClick={() => setSheetDialog("edit")}
            >
              <Copy size={13} />
              복제
            </MuteButton>
          )}
        </div>
      )}
      {(error || catalog.error || rows.error) && (
        <div className={styles.error} role="alert">
          {error || catalog.error?.message || rows.error?.message}
        </div>
      )}
      <div className={styles.grid}>
        {definition && source && hydrated ? (
          <DataGrid
            key={`${selected!.id}:${queryShape}:${debouncedSearch}:${days}:${periodEnd}`}
            rows={loadedRows}
            fields={fields}
            definition={definition}
            busy={rows.isFetching && !rows.isFetchingNextPage}
            hasMore={rows.hasNextPage && !rows.isFetchNextPageError}
            loadingMore={rows.isFetchingNextPage}
            onLoadMore={() => void rows.fetchNextPage()}
            readOnly={!catalog.data?.can_write}
            onDefinitionChange={changeDefinition}
            onColumnMenu={(key) => setColumnDialog({ key })}
            onEditingChange={setEditingCell}
            minimumRowHeight={(row) =>
              source.id === "review" && row.status === "ready_for_review"
                ? 72
                : 0
            }
            isCellDoubleClickOpenable={(_row, column) =>
              source.id === "review" &&
              (column === "subject" || column === "body")
            }
            onCellDoubleClick={(row) => openRecord(source.id, row)}
            renderCellContent={({ row, field, text }) => {
              if (source.id !== "review" || field.key !== "status")
                return undefined;
              return (
                <div className={styles.reviewStatusCell}>
                  <span>{mailStatusLabels[text] ?? text}</span>
                  {text === "ready_for_review" && (
                    <MuteButton
                      size="sm"
                      variant="dark"
                      disabled={
                        locked ||
                        Boolean(sendingReviewId) ||
                        !catalog.data?.can_write
                      }
                      aria-label={`${String(row.creator_name ?? row.recipient_email ?? "크리에이터")}에게 메일 발송`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void sendReview(row);
                      }}
                    >
                      {sendingReviewId === row.id ? "발송 중…" : "발송"}
                    </MuteButton>
                  )}
                </div>
              );
            }}
            isCellOpenable={(row, column) => {
              const navigation = source.cell_navigation?.find(
                (item) => item.column === column
              );
              return Boolean(resolveNavigation(row, navigation, source.id));
            }}
            onCellOpen={(row, column) => {
              const navigation = source.cell_navigation?.find(
                (item) => item.column === column
              );
              const target = resolveNavigation(row, navigation, source.id);
              if (target)
                openRecord(
                  target.source,
                  { id: target.id },
                  undefined,
                  target.tab
                );
            }}
            referenceOptions={async (sourceId, searchValue) =>
              (
                await gtmRequest<{ options: ReferenceOption[] }>(
                  "reference_options",
                  { source: sourceId, search: searchValue }
                )
              ).options
            }
            onRowOpen={(row) => {
              const target = resolveNavigation(
                row,
                source.navigation,
                source.id
              );
              openRecord(
                target?.source ?? source.id,
                target ? { ...row, id: target.id } : row,
                undefined,
                target?.tab
              );
            }}
            onCellSave={async (row, field, value) => {
              const data = {
                sheet_id: selected!.id,
                record_id: row.id,
                expected_version: row.row_version,
                values: { [field.key]: value },
              };
              const signature = JSON.stringify(data),
                requestId =
                  pendingWrite.current?.signature === signature
                    ? pendingWrite.current.id
                    : crypto.randomUUID();
              pendingWrite.current = { signature, id: requestId };
              const result = await gtmRequest<{ record: GtmRow }>(
                "save_record",
                {
                  ...data,
                  request_id: requestId,
                }
              );
              pendingWrite.current = null;
              queryClient.setQueriesData<InfiniteData<GtmQueryResult>>(
                { queryKey: ["ops-gtm", account, "rows"] },
                (current) =>
                  current
                    ? {
                        ...current,
                        pages: current.pages.map((page) => ({
                          ...page,
                          rows: page.rows.map((item) =>
                            item.id === row.id
                              ? { ...item, ...result.record }
                              : item
                          ),
                        })),
                      }
                    : current
              );
            }}
          />
        ) : (
          <div style={{ padding: 24 }}>
            {catalog.isPending
              ? "시트 불러오는 중…"
              : "표시할 시트가 없습니다."}
          </div>
        )}
      </div>
      <div className={styles.status}>
        <span>
          {rows.isFetching && !rows.isFetchingNextPage
            ? "불러오는 중…"
            : `전체 ${totalRows.toLocaleString()}행`}
        </span>
        <span>{loadedRows.length.toLocaleString()}행 표시됨</span>
        <span>
          {definition?.columns.filter((column) => !column.hidden).length ?? 0}개
          컬럼
        </span>
        <span>셀 더블클릭으로 편집</span>
        <div className={styles.spacer} />
        <span>
          {rows.isFetchNextPageError
            ? "다음 행을 불러오지 못했습니다. 새로고침해 주세요."
            : rows.isFetchingNextPage
              ? "다음 100행 불러오는 중…"
              : rows.hasNextPage
                ? "아래로 스크롤하면 계속 불러옵니다"
                : totalRows
                  ? "모든 행을 불러왔습니다"
                  : ""}
        </span>
      </div>
      {columnDialog && definition && (
        <ColumnSettings
          key={columnDialog.key ?? "all"}
          definition={definition}
          fields={fields}
          columnKey={columnDialog.key}
          onChange={changeDefinition}
          onClose={() => setColumnDialog(null)}
        />
      )}
      {sheetDialog && catalog.data && (
        <SheetDialog
          sources={catalog.data.sources}
          sheet={
            sheetDialog === "edit" && selected
              ? {
                  ...selected,
                  row_version: draft?.expectedVersion ?? selected.row_version,
                }
              : undefined
          }
          definition={sheetDialog === "edit" ? definition : undefined}
          onClose={() => setSheetDialog(null)}
          onSaved={acceptSheet}
          onDeleted={() => {
            store.clearDraft(draftKey);
            void catalog.refetch();
          }}
        />
      )}
      {recordDialog &&
        (recordDialog.source.review ? (
          <OutreachReviewDialog
            key={`${recordDialog.source.id}:${recordDialog.row?.id ?? "new"}`}
            account={account}
            source={recordDialog.source}
            canWrite={Boolean(catalog.data?.can_write)}
            initialRow={recordDialog.row!}
            onClose={closeRecord}
            onSaved={() =>
              void queryClient.invalidateQueries({
                queryKey: ["ops-gtm", account, "rows"],
              })
            }
            onBack={recordStack.length ? backRecord : undefined}
          />
        ) : (
          <RecordWorkspace
            key={`${recordDialog.source.id}:${recordDialog.row?.id ?? "new"}:${recordDialog.tab ?? "info"}`}
            account={account}
            source={recordDialog.source}
            sources={catalog.data?.sources ?? []}
            initialRow={recordDialog.row}
            initialValues={recordDialog.defaults}
            initialTab={recordDialog.tab}
            canWrite={Boolean(catalog.data?.can_write)}
            onClose={closeRecord}
            onSaved={() =>
              void queryClient.invalidateQueries({
                queryKey: ["ops-gtm", account, "rows"],
              })
            }
            onTabChange={(tab) => {
              setRecordDialog((current) =>
                current ? { ...current, tab } : current
              );
              if (recordDialog.source.id === "creators") {
                void updateRoute({ creatorTab: tab });
              }
            }}
            onOpen={(id, row, defaults, replace) =>
              openRecord(id, row, defaults, undefined, replace)
            }
            onBack={recordStack.length ? backRecord : undefined}
          />
        ))}
    </section>
  );
}
