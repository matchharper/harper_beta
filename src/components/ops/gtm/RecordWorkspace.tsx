import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MuteButton } from "@/components/ui/button";
import { gtmRequest } from "@/lib/gtm/client";
import { displayValue, parseCell } from "@/lib/gtm/grid";
import type {
  GtmRecordDetail,
  GtmRow,
  GtmSource,
  GtmValue,
} from "@/lib/gtm/types";
import RecordField from "./RecordField";
import CollectionEditor from "./CollectionEditor";
import RelatedRecords from "./RelatedRecords";
import ActivityHistory from "./ActivityHistory";
import CreatorConversation from "./CreatorConversation";
import { OutreachDraft, TrackingLinks } from "./RecordOperations";
import styles from "./GtmWorkspace.module.css";

function externalHttpUrl(value: GtmValue | undefined) {
  const raw = displayValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}

function followerCount(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const count = Number(value);
  return Number.isFinite(count)
    ? new Intl.NumberFormat("ko-KR").format(count)
    : "—";
}

type MutationResult = Record<string, GtmValue> & { record?: GtmRow };

export default function RecordWorkspace({
  account,
  source,
  sources,
  initialRow,
  initialValues = {},
  initialTab = "info",
  canWrite,
  onClose,
  onSaved,
  onOpen,
  onBack,
  onTabChange,
}: {
  account: string;
  source: GtmSource;
  sources: GtmSource[];
  initialRow: GtmRow | null;
  initialValues?: Record<string, GtmValue>;
  initialTab?: string;
  canWrite: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onOpen: (
    source: string,
    row: GtmRow | null,
    defaults?: Record<string, GtmValue>,
    replace?: boolean
  ) => void;
  onBack?: () => void;
  onTabChange?: (tab: string) => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(initialValues).map(([key, value]) => [
        key,
        displayValue(value),
      ])
    )
  );
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const [autoSaving, setAutoSaving] = useState(false);
  const [childDirty, setChildDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [archive, setArchive] = useState(false);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [autoSaveBlocked, setAutoSaveBlocked] = useState(false);
  const savedInPanel = useRef(false);
  const closeRequested = useRef(false);
  const detailKey = useMemo(
    () => ["ops-gtm", account, "record", source.id, initialRow?.id] as const,
    [account, initialRow?.id, source.id]
  );
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: ({ signal }) =>
      gtmRequest<GtmRecordDetail>(
        "get_record",
        { source: source.id, record_id: initialRow!.id },
        signal
      ),
    enabled: Boolean(initialRow && source.entity),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const row = detail.data?.record ?? initialRow;
  const fields = detail.data?.fields ?? source.record_fields ?? source.fields;
  const capabilities = detail.data?.capabilities;
  const writable =
    canWrite && (row ? Boolean(capabilities?.write) : source.writable);
  const dirty = childDirty || Object.keys(draft).length > 0;
  const locked =
    pending || (Boolean(initialRow && source.entity) && !detail.data);
  const collections = detail.data?.collections ?? [];
  const currentCollection = collections.find(
    (collection) => collection.key === tab
  );
  const creatorProfileUrl =
    source.id === "creators"
      ? externalHttpUrl(
          row?.primary_profile_url ?? row?.sheet_primary_profile_url
        )
      : null;
  const creatorPlatform = displayValue(
    row?.primary_platform ?? row?.sheet_primary_platform
  );
  const creatorHandle = displayValue(
    row?.primary_handle ?? row?.sheet_primary_handle
  ).replace(/^@/, "");
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [dirty]);
  const refreshRows = useCallback(() => {
    if (!savedInPanel.current) return;
    savedInPanel.current = false;
    onSaved?.();
  }, [onSaved]);
  const finishClose = useCallback(() => {
    refreshRows();
    onClose();
  }, [onClose, refreshRows]);
  const close = () => {
    if (pending) return;
    if (
      row &&
      writable &&
      !autoSaveBlocked &&
      (autoSaving || Object.keys(draft).length > 0)
    ) {
      closeRequested.current = true;
      return;
    }
    if (dirty) {
      setDiscard(true);
      return;
    }
    finishClose();
  };
  const run = useCallback(
    async (
      action: string,
      data: Record<string, unknown>,
      options: { background?: boolean } = {}
    ): Promise<MutationResult | null> => {
      const background = options.background === true;
      const payload = {
        source: source.id,
        record_id: row?.id,
        expected_version: row?.row_version,
        ...data,
      };
      const signature = JSON.stringify({ action, payload });
      if (retry.current?.signature !== signature)
        retry.current = { signature, id: crypto.randomUUID() };
      if (background) setAutoSaving(true);
      else setPending(true);
      setError("");
      setConflict(false);
      try {
        const result = await gtmRequest<MutationResult>(action, {
          ...payload,
          request_id: retry.current.id,
        });
        retry.current = null;
        setComparing(false);
        if (background) {
          if (result.record && row) {
            queryClient.setQueryData<GtmRecordDetail>(detailKey, (current) =>
              current
                ? {
                    ...current,
                    record: { ...current.record, ...result.record },
                  }
                : current
            );
          }
          savedInPanel.current = true;
        } else {
          await queryClient.invalidateQueries({
            queryKey: ["ops-gtm", account],
          });
        }
        return result;
      } catch (cause) {
        setConflict(
          cause instanceof Error && "status" in cause && cause.status === 409
        );
        setError(
          cause instanceof Error ? cause.message : "자동 저장하지 못했습니다."
        );
        return null;
      } finally {
        if (background) setAutoSaving(false);
        else setPending(false);
      }
    },
    [account, detailKey, queryClient, row, source.id]
  );
  useEffect(() => {
    if (
      !row ||
      !writable ||
      pending ||
      autoSaving ||
      conflict ||
      autoSaveBlocked ||
      !Object.keys(draft).length
    )
      return;
    const snapshot = { ...draft };
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const values: Record<string, GtmValue> = {};
          for (const field of fields.filter((item) => item.writable)) {
            if (snapshot[field.key] !== undefined)
              values[field.key] = field.reference
                ? snapshot[field.key] || null
                : parseCell(snapshot[field.key], field.type);
          }
          if (!Object.keys(values).length) return;
          const result = await run(
            "save_record",
            { values },
            { background: true }
          );
          if (!result) {
            setAutoSaveBlocked(true);
            return;
          }
          setDraft((current) =>
            Object.fromEntries(
              Object.entries(current).filter(
                ([key, value]) => snapshot[key] !== value
              )
            )
          );
        } catch (cause) {
          setAutoSaveBlocked(true);
          setError(
            cause instanceof Error ? cause.message : "입력을 확인하세요."
          );
        }
      })();
    }, 650);
    return () => clearTimeout(timer);
  }, [
    autoSaveBlocked,
    autoSaving,
    conflict,
    draft,
    fields,
    pending,
    row,
    run,
    writable,
  ]);
  useEffect(() => {
    if (!closeRequested.current || pending || autoSaving) return;
    if (!autoSaveBlocked && Object.keys(draft).length > 0) return;
    const timer = window.setTimeout(() => {
      closeRequested.current = false;
      if (autoSaveBlocked || childDirty) setDiscard(true);
      else finishClose();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoSaveBlocked, autoSaving, childDirty, draft, finishClose, pending]);
  const tabs = [
    ...(row && source.id === "creators"
      ? [
          { key: "conversation", label: "대화 · 메일" },
          { key: "contents", label: "콘텐츠" },
        ]
      : []),
    { key: "info", label: "기본 정보" },
    ...collections.map((collection) => ({
      key: collection.key,
      label: collection.label,
    })),
    ...(row && source.entity
      ? [
          { key: "related", label: "연결 기록" },
          { key: "history", label: "활동 기록" },
        ]
      : []),
    ...(row && "tracking_links" in row
      ? [{ key: "links", label: "추적 링크" }]
      : []),
    ...(capabilities?.prepare_outreach
      ? [{ key: "outreach", label: "연락 준비" }]
      : []),
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`${styles.dialog} ${styles.recordDialog} ${styles.sidePanel}`}
        overlayClassName="bg-black/15 backdrop-blur-none"
        aria-describedby={undefined}
        onInteractOutside={(event) => {
          if (dirty || pending || autoSaving) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (pending || autoSaving) event.preventDefault();
        }}
      >
        <DialogTitle>
          {source.label} ·{" "}
          {row
            ? `#${displayValue(row.ref)} ${displayValue(row.name ?? row.title ?? row.handle ?? row.description)}`
            : "새 기록"}
        </DialogTitle>
        {source.id === "creators" && row && (
          <div className={styles.creatorSummary}>
            {creatorProfileUrl ? (
              <a href={creatorProfileUrl} target="_blank" rel="noreferrer">
                {[
                  creatorPlatform,
                  creatorHandle ? `@${creatorHandle}` : "프로필 열기",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                <span aria-hidden="true"> ↗</span>
              </a>
            ) : (
              <span>프로필 링크 없음</span>
            )}
            <span>팔로워 {followerCount(row.total_followers)}</span>
          </div>
        )}
        <div className={styles.row} style={{ flexWrap: "wrap" }}>
          {onBack && (
            <MuteButton
              disabled={dirty || pending || autoSaving}
              onClick={() => {
                refreshRows();
                onBack();
              }}
            >
              이전 기록
            </MuteButton>
          )}
          {row && (
            <MuteButton
              disabled={pending}
              onClick={() => {
                void navigator.clipboard
                  .writeText(
                    JSON.stringify(
                      {
                        source: source.id,
                        record_id: row.id,
                        ref: row.ref,
                        row_version: row.row_version,
                        read: {
                          action: "get_record",
                          data: { source: source.id, record_id: row.id },
                        },
                      },
                      null,
                      2
                    )
                  )
                  .catch(() => setError("클립보드에 복사하지 못했습니다."));
              }}
            >
              Agent 참조 복사
            </MuteButton>
          )}
          {row && (
            <MuteButton
              disabled={dirty || pending || detail.isFetching}
              onClick={() => {
                setError("");
                void detail.refetch();
              }}
            >
              최신 기록 불러오기
            </MuteButton>
          )}
          {row?.archived_at && <span>보관된 기록</span>}
          {capabilities?.restore && canWrite && (
            <MuteButton
              disabled={pending || dirty}
              onClick={() => void run("restore_record", {})}
            >
              보관 해제
            </MuteButton>
          )}
        </div>
        {row && (
          <div
            role="tablist"
            aria-label="기록 상세"
            className={styles.tabs}
            style={{ flexWrap: "wrap" }}
          >
            {tabs.map((item) => (
              <MuteButton
                role="tab"
                key={item.key}
                aria-selected={tab === item.key}
                variant={tab === item.key ? "neutral" : "transparent"}
                disabled={pending || (dirty && tab !== item.key)}
                onClick={() => {
                  setTab(item.key);
                  onTabChange?.(item.key);
                  setError("");
                  setArchive(false);
                }}
              >
                {item.label}
              </MuteButton>
            ))}
          </div>
        )}
        {(error || detail.error) && (
          <div className={styles.error} role="alert">
            {error || detail.error?.message}
          </div>
        )}
        {conflict && (
          <MuteButton
            disabled={pending || detail.isFetching}
            onClick={async () => {
              const latest = await detail.refetch();
              if (latest.data && !latest.error) {
                retry.current = null;
                setConflict(false);
                setComparing(true);
                setError("");
              }
            }}
          >
            초안을 유지하고 최신 값 비교
          </MuteButton>
        )}
        {comparing && (
          <div className={styles.notice}>
            최신 값을 불러왔습니다. 작성 중인 변경을 자동 저장합니다.
          </div>
        )}
        {locked && !pending ? (
          <div>기록 불러오는 중…</div>
        ) : (
          <div className={styles.recordBody}>
            {tab === "conversation" && row && source.id === "creators" && (
              <CreatorConversation
                account={account}
                record={row}
                canWrite={writable}
                onDirtyChange={setChildDirty}
                onPendingChange={setPending}
                onReview={(dispatch) => onOpen("review", dispatch)}
              />
            )}
            {tab === "contents" && row && (
              <RelatedRecords
                account={account}
                source={source}
                sources={sources}
                record={row}
                relations={(detail.data?.relations ?? []).filter(
                  (relation) => relation.source === "contents"
                )}
                canWrite={writable}
                onOpen={onOpen}
              />
            )}
            {tab === "info" && (
              <form
                className={styles.form}
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (row) return;
                  setError("");
                  try {
                    const values: Record<string, GtmValue> = {};
                    for (const field of fields.filter(
                      (item) => item.writable
                    )) {
                      if (draft[field.key] !== undefined)
                        values[field.key] = field.reference
                          ? draft[field.key] || null
                          : parseCell(draft[field.key], field.type);
                    }
                    if (!Object.keys(values).length) return;
                    const result = await run("save_record", { values });
                    if (result) {
                      setDraft({});
                      if (!row && result.record)
                        onOpen(
                          source.id,
                          result.record as GtmRow,
                          undefined,
                          true
                        );
                    }
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "입력을 확인하세요."
                    );
                  }
                }}
              >
                <div
                  className={styles.detailGrid}
                  style={{ maxHeight: "none" }}
                >
                  {fields
                    .filter((field) => field.writable)
                    .map((field) => (
                      <div key={field.key}>
                        <RecordField
                          field={field}
                          disabled={pending}
                          readOnly={!writable}
                          value={
                            draft[field.key] ?? displayValue(row?.[field.key])
                          }
                          onChange={(value) => {
                            setAutoSaveBlocked(false);
                            setDraft((current) => ({
                              ...current,
                              [field.key]: value,
                            }));
                          }}
                        />
                        {comparing && draft[field.key] !== undefined && (
                          <div className={styles.currentValue}>
                            최신 저장값:{" "}
                            {displayValue(row?.[field.key]) || "빈 값"}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
                {row && (
                  <details>
                    <summary>계산값과 기록 정보</summary>
                    <dl className={styles.facts}>
                      {source.fields
                        .filter(
                          (field) =>
                            !field.writable &&
                            !collections.some(
                              (collection) => collection.key === field.key
                            ) &&
                            field.key !== "tracking_links"
                        )
                        .map((field) => (
                          <div key={field.key}>
                            <dt>{field.label}</dt>
                            <dd>{displayValue(row[field.key]) || "—"}</dd>
                          </div>
                        ))}
                    </dl>
                  </details>
                )}
                {writable && (
                  <div className={styles.row}>
                    {!row ? (
                      <MuteButton
                        type="submit"
                        variant="dark"
                        disabled={pending || !Object.keys(draft).length}
                      >
                        {pending ? "만드는 중…" : "행 만들기"}
                      </MuteButton>
                    ) : (
                      (autoSaving ||
                        autoSaveBlocked ||
                        Object.keys(draft).length > 0) && (
                        <span className={styles.autoSaveStatus} role="status">
                          {autoSaving
                            ? "저장 중…"
                            : autoSaveBlocked
                              ? "자동 저장 실패 · 값을 수정하면 다시 시도합니다."
                              : ""}
                        </span>
                      )
                    )}
                    {Object.keys(draft).length > 0 && (
                      <MuteButton
                        type="button"
                        disabled={pending}
                        onClick={() => setDraft({})}
                      >
                        변경 취소
                      </MuteButton>
                    )}
                  </div>
                )}
              </form>
            )}
            {currentCollection && row && (
              <CollectionEditor
                key={`${tab}:${row.id}`}
                contract={currentCollection}
                value={row[tab]}
                canWrite={writable}
                pending={pending}
                onDirtyChange={setChildDirty}
                comparing={comparing}
                onSave={async (items) =>
                  Boolean(
                    await run(
                      "patch_items",
                      { field: tab, items },
                      { background: true }
                    )
                  )
                }
              />
            )}
            {tab === "related" && row && (
              <RelatedRecords
                account={account}
                source={source}
                sources={sources}
                record={row}
                relations={detail.data?.relations ?? []}
                canWrite={writable}
                onOpen={onOpen}
              />
            )}
            {tab === "history" && row && (
              <ActivityHistory
                account={account}
                source={source.id}
                recordId={row.id}
                canWrite={canWrite && Boolean(capabilities?.activity)}
                pending={pending}
                onDirtyChange={setChildDirty}
                onSave={async (body, evidence, kind, direction) =>
                  Boolean(
                    await run("log_activity", {
                      body,
                      source_ref: evidence,
                      kind,
                      direction,
                    })
                  )
                }
              />
            )}
            {tab === "links" && row && (
              <TrackingLinks
                record={row}
                canWrite={canWrite && Boolean(capabilities?.issue_link)}
                pending={pending}
                onDirtyChange={setChildDirty}
                onSave={async (values) =>
                  Boolean(await run("issue_link", { values }))
                }
              />
            )}
            {tab === "outreach" && row && (
              <OutreachDraft
                account={account}
                record={row}
                pending={pending}
                onDirtyChange={setChildDirty}
                onSave={async (values) => {
                  const result = await run("prepare_outreach", values);
                  if (result) {
                    onOpen("review", result as GtmRow);
                    return true;
                  }
                  return false;
                }}
              />
            )}
          </div>
        )}
        {discard && (
          <div className={styles.error}>
            저장하지 않은 변경이 있습니다.
            <div className={styles.row}>
              <MuteButton onClick={() => setDiscard(false)}>
                계속 편집
              </MuteButton>
              <MuteButton variant="warn" onClick={finishClose}>
                변경을 버리고 닫기
              </MuteButton>
            </div>
          </div>
        )}
        {archive && (
          <div className={styles.error}>
            이 기록을 보관하면 기본 목록에서 숨겨집니다. 연결 기록과 이력은
            남습니다.
            <MuteButton
              disabled={pending}
              variant="warn"
              onClick={async () => {
                if (await run("archive_record", {})) onClose();
              }}
            >
              보관 확인
            </MuteButton>
          </div>
        )}
        <div className={styles.row} style={{ justifyContent: "space-between" }}>
          {capabilities?.archive && canWrite ? (
            <MuteButton
              disabled={pending || dirty}
              variant="warn"
              onClick={() => setArchive(!archive)}
            >
              기록 보관
            </MuteButton>
          ) : (
            <span />
          )}
          <MuteButton disabled={pending} onClick={close}>
            닫기
          </MuteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
