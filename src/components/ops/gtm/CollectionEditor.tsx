import { useEffect, useMemo, useRef, useState } from "react";
import { MuteButton } from "@/components/ui/button";
import { displayValue, parseCell } from "@/lib/gtm/grid";
import type { GtmCollection, GtmValue } from "@/lib/gtm/types";
import RecordField from "./RecordField";
import styles from "./GtmWorkspace.module.css";
type Item = Record<string, GtmValue> & { id: string };
function buildUpdates(
  items: Item[],
  changes: Record<string, Record<string, string>>,
  added: Item[],
  contract: GtmCollection
): Item[] {
  return items
    .filter(
      (item) =>
        changes[item.id] || added.some((newItem) => newItem.id === item.id)
    )
    .map((item) => {
      const update: Item = {
        id: item.id,
        ...(added.some((newItem) => newItem.id === item.id) ? item : {}),
      };
      for (const field of contract.fields) {
        const input = changes[item.id]?.[field.key];
        if (input !== undefined) {
          if (field.reference && !input && !item[field.key]) continue;
          update[field.key] = field.reference
            ? input || null
            : parseCell(input, field.type ?? "text");
        }
      }
      if (
        contract.key === "action_items" &&
        update.status &&
        update.status !== item.status
      )
        update.completed_at =
          update.status === "done" ? new Date().toISOString() : null;
      return update;
    });
}
export default function CollectionEditor({
  contract,
  value,
  canWrite,
  pending,
  onSave,
  onDirtyChange,
  comparing = false,
}: {
  contract: GtmCollection;
  value: GtmValue | undefined;
  canWrite: boolean;
  pending: boolean;
  onSave: (items: Item[]) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
  comparing?: boolean;
}) {
  const original = useMemo(
    () => (Array.isArray(value) ? value : []) as Item[],
    [value]
  );
  const [changes, setChanges] = useState<
    Record<string, Record<string, string>>
  >({});
  const [added, setAdded] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  const dirty = Object.keys(changes).length > 0 || added.length > 0;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  const items = useMemo(
    () => [
      ...original,
      ...added.filter(
        (item) => !original.some((existing) => existing.id === item.id)
      ),
    ],
    [added, original]
  );
  const reset = () => {
    setChanges({});
    setAdded([]);
    setError("");
    setSaveBlocked(false);
  };
  const addedIncomplete = added.some((item) =>
    contract.fields.some(
      (field) =>
        field.required &&
        !String(changes[item.id]?.[field.key] ?? item[field.key] ?? "").trim()
    )
  );
  useEffect(() => {
    if (
      !dirty ||
      !canWrite ||
      pending ||
      saving ||
      saveBlocked ||
      addedIncomplete
    )
      return;
    const savedChanges = changes;
    const savedAdded = added;
    const timer = setTimeout(() => {
      try {
        const payload = buildUpdates(items, savedChanges, savedAdded, contract);
        if (!payload.length) return;
        setSaving(true);
        void onSaveRef
          .current(payload)
          .then((saved) => {
            if (saved) {
              setChanges((current) =>
                Object.fromEntries(
                  Object.entries(current).flatMap(([itemId, fields]) => {
                    const remaining = Object.fromEntries(
                      Object.entries(fields).filter(
                        ([key, value]) => savedChanges[itemId]?.[key] !== value
                      )
                    );
                    return Object.keys(remaining).length
                      ? [[itemId, remaining]]
                      : [];
                  })
                )
              );
              const savedIds = new Set(savedAdded.map((item) => item.id));
              setAdded((current) =>
                current.filter((item) => !savedIds.has(item.id))
              );
            } else setSaveBlocked(true);
          })
          .catch((cause) => {
            setSaveBlocked(true);
            setError(
              cause instanceof Error ? cause.message : "저장하지 못했습니다."
            );
          })
          .finally(() => setSaving(false));
      } catch (cause) {
        setSaving(false);
        setSaveBlocked(true);
        setError(cause instanceof Error ? cause.message : "입력을 확인하세요.");
      }
    }, 650);
    return () => clearTimeout(timer);
  }, [
    added,
    addedIncomplete,
    canWrite,
    changes,
    contract,
    dirty,
    items,
    pending,
    saving,
    saveBlocked,
  ]);
  return (
    <div className={styles.form}>
      {contract.key === "payments" && (
        <div>
          실제 지급·환불 기록입니다. 여기서 송금하지 않습니다. 저장한 기록은
          증빙을 남겨 별도로 정정합니다.
        </div>
      )}
      {!items.length && <div>등록된 항목 없음</div>}
      {items.map((item, index) => {
        const persisted = original.some((existing) => existing.id === item.id);
        const locked = !canWrite || (persisted && contract.immutable);
        return (
          <fieldset
            key={item.id}
            className={styles.collectionItem}
            disabled={pending || locked}
          >
            <legend>
              {contract.label} {index + 1}
            </legend>
            <div className={styles.detailGrid} style={{ maxHeight: "none" }}>
              {contract.fields.map((field) => (
                <div key={field.key}>
                  <RecordField
                    field={field}
                    readOnly={locked}
                    value={
                      changes[item.id]?.[field.key] ??
                      displayValue(item[field.key])
                    }
                    onChange={(next) => {
                      setSaveBlocked(false);
                      setError("");
                      setChanges({
                        ...changes,
                        [item.id]: { ...changes[item.id], [field.key]: next },
                      });
                    }}
                  />
                  {comparing &&
                    changes[item.id]?.[field.key] !== undefined &&
                    persisted && (
                      <div className={styles.currentValue}>
                        최신 저장값: {displayValue(item[field.key]) || "빈 값"}
                      </div>
                    )}
                </div>
              ))}
            </div>
            {!persisted && (
              <MuteButton
                type="button"
                size="sm"
                onClick={() => {
                  setAdded(added.filter((newItem) => newItem.id !== item.id));
                  setChanges((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                  });
                }}
              >
                추가 취소
              </MuteButton>
            )}
          </fieldset>
        );
      })}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      {canWrite && (
        <div className={styles.row}>
          <MuteButton
            type="button"
            disabled={pending || items.length >= 100}
            onClick={() => {
              const item: Item = { id: crypto.randomUUID() };
              if (contract.key === "action_items") item.status = "open";
              if (contract.key === "contacts")
                item.as_of = new Date().toISOString();
              if (contract.key === "payments") {
                item.kind = "payment";
                item.occurred_at = new Date().toISOString();
              }
              setAdded([...added, item]);
              setSaveBlocked(false);
              setError("");
            }}
          >
            {contract.label} 추가
          </MuteButton>
          {dirty && (
            <>
              <MuteButton
                type="button"
                disabled={pending || saving}
                onClick={reset}
              >
                변경 취소
              </MuteButton>
              <span className={styles.autoSaveStatus} role="status">
                {saving
                  ? "저장 중…"
                  : addedIncomplete
                    ? "필수값을 입력하면 자동 저장됩니다."
                    : saveBlocked
                      ? "자동 저장 실패 · 값을 수정하면 다시 시도합니다."
                      : ""}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
