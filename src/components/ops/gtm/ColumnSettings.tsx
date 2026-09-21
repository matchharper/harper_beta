import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MuteButton } from "@/components/ui/button";
import { moveColumn } from "@/lib/gtm/grid";
import type {
  FilterOperator,
  GtmField,
  GridColumn,
  SheetDefinition,
} from "@/lib/gtm/types";
import styles from "./GtmWorkspace.module.css";

export const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "contains", label: "포함" },
  { value: "eq", label: "같음" },
  { value: "neq", label: "다름" },
  { value: "gt", label: "초과" },
  { value: "gte", label: "이상" },
  { value: "lt", label: "미만" },
  { value: "lte", label: "이하" },
  { value: "empty", label: "비어 있음" },
  { value: "not_empty", label: "비어 있지 않음" },
];
function definitionError(definition: SheetDefinition): string {
  if (!definition.columns.some((column) => !column.hidden))
    return "표시할 컬럼을 하나 이상 선택하세요.";
  if (
    definition.columns.some(
      (column) =>
        !column.label.trim() || column.width < 60 || column.width > 1200
    ) ||
    definition.rowHeight < 28 ||
    definition.rowHeight > 600
  )
    return "컬럼 이름과 크기를 확인하세요.";
  return "";
}
export function OperatorSelect({
  value,
  onChange,
  numeric = true,
}: {
  value: FilterOperator;
  onChange: (value: FilterOperator) => void;
  numeric?: boolean;
}) {
  return (
    <select
      aria-label="조건"
      value={value}
      onChange={(event) => onChange(event.target.value as FilterOperator)}
    >
      {OPERATORS.filter(
        (item) => numeric || !["gt", "gte", "lt", "lte"].includes(item.value)
      ).map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
export function ColumnSettings({
  definition,
  fields,
  columnKey,
  onChange,
  onClose,
}: {
  definition: SheetDefinition;
  fields: GtmField[];
  columnKey: string | null;
  onChange: (definition: SheetDefinition) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(definition);
  const [search, setSearch] = useState("");
  const [activeKey, setActiveKey] = useState(columnKey);
  const error = definitionError(draft);
  const onChangeRef = useRef(onChange);
  const lastPublished = useRef(JSON.stringify(definition));
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    const validation = definitionError(draft);
    if (validation) return;
    const signature = JSON.stringify(draft);
    if (signature === lastPublished.current) return;
    const timer = setTimeout(() => {
      onChangeRef.current(draft);
      lastPublished.current = signature;
    }, 350);
    return () => clearTimeout(timer);
  }, [draft]);
  function close() {
    const validation = definitionError(draft);
    if (validation) return;
    const signature = JSON.stringify(draft);
    if (signature !== lastPublished.current) {
      onChangeRef.current(draft);
      lastPublished.current = signature;
    }
    onClose();
  }
  const selected = draft.columns.find((column) => column.key === activeKey);
  const field = fields.find((item) => item.key === activeKey);
  const patch = (update: Partial<GridColumn>) =>
    setDraft({
      ...draft,
      columns: draft.columns.map((column) =>
        column.key === activeKey ? { ...column, ...update } : column
      ),
    });
  const filter = draft.filters.find((item) => item.key === activeKey);
  const setFilter = (value: typeof filter) =>
    setDraft({
      ...draft,
      filters: [
        ...draft.filters.filter((item) => item.key !== activeKey),
        ...(value ? [value] : []),
      ],
    });
  function removeColumn(key: string) {
    setDraft({
      ...draft,
      columns: draft.columns.filter((column) => column.key !== key),
      filters: draft.filters.filter((item) => item.key !== key),
      sorting: draft.sorting.filter((item) => item.key !== key),
    });
    if (activeKey === key) setActiveKey(null);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`${styles.dialog} sm:max-w-[900px]`}
        aria-describedby={undefined}
      >
        <DialogTitle>컬럼과 표시 설정</DialogTitle>
        <div className={styles.form}>
          <div className={styles.row}>
            <input
              aria-label="컬럼 검색"
              placeholder="컬럼 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ flex: 1 }}
            />
            <label className={styles.row} style={{ flexDirection: "row" }}>
              기본 행 높이{" "}
              <input
                type="number"
                aria-label="기본 행 높이"
                min={28}
                max={600}
                value={draft.rowHeight}
                onChange={(event) =>
                  setDraft({ ...draft, rowHeight: Number(event.target.value) })
                }
                style={{ width: 74 }}
              />
            </label>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: selected
                ? "minmax(230px,1fr) minmax(280px,1fr)"
                : "1fr",
              gap: 18,
            }}
          >
            <div className={styles.columnList}>
              {draft.columns
                .filter(
                  (column) =>
                    column.label.toLowerCase().includes(search.toLowerCase()) ||
                    column.key.includes(search.toLowerCase())
                )
                .map((column) => {
                  const index = draft.columns.findIndex(
                    (item) => item.key === column.key
                  );
                  return (
                    <div
                      className={styles.columnItem}
                      key={column.key}
                      style={{
                        background:
                          column.key === activeKey ? "#e8f0fe" : undefined,
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label={`${column.label} 표시`}
                        checked={!column.hidden}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            columns: draft.columns.map((c) =>
                              c.key === column.key
                                ? { ...c, hidden: !event.target.checked }
                                : c
                            ),
                          })
                        }
                      />
                      <MuteButton
                        variant="transparent"
                        className="min-w-0 flex-1 justify-start"
                        onClick={() => setActiveKey(column.key)}
                      >
                        <span className="truncate">{column.label}</span>
                      </MuteButton>
                      <MuteButton
                        size="sm"
                        aria-label={`${column.label} 앞으로`}
                        disabled={!index}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            columns: moveColumn(
                              draft.columns,
                              column.key,
                              draft.columns[index - 1].key
                            ),
                          })
                        }
                      >
                        <ChevronUp size={13} />
                      </MuteButton>
                      <MuteButton
                        size="sm"
                        aria-label={`${column.label} 뒤로`}
                        disabled={index === draft.columns.length - 1}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            columns: moveColumn(
                              draft.columns,
                              column.key,
                              draft.columns[index + 1].key,
                              "after"
                            ),
                          })
                        }
                      >
                        <ChevronDown size={13} />
                      </MuteButton>
                      <MuteButton
                        size="sm"
                        aria-label={`${column.label} 컬럼 제거`}
                        onClick={() => removeColumn(column.key)}
                      >
                        <Trash2 size={13} />
                      </MuteButton>
                    </div>
                  );
                })}
              {fields
                .filter(
                  (f) =>
                    !draft.columns.some((column) => column.key === f.key) &&
                    `${f.label} ${f.key}`
                      .toLowerCase()
                      .includes(search.toLowerCase())
                )
                .map((f) => (
                  <div className={styles.columnItem} key={f.key}>
                    <span style={{ flex: 1 }}>{f.label}</span>
                    <MuteButton
                      size="sm"
                      aria-label={`${f.label} 컬럼 추가`}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          columns: [
                            ...draft.columns,
                            { key: f.key, label: f.label, width: 180 },
                          ],
                        });
                        setActiveKey(f.key);
                      }}
                    >
                      <Plus size={14} />
                      추가
                    </MuteButton>
                  </div>
                ))}
            </div>
            {selected && (
              <div className={styles.form}>
                <label>
                  컬럼 이름
                  <input
                    value={selected.label}
                    onChange={(event) => patch({ label: event.target.value })}
                    maxLength={160}
                  />
                </label>
                <div className={styles.row}>
                  <label style={{ flex: 1 }}>
                    너비
                    <input
                      type="number"
                      min={60}
                      max={1200}
                      value={selected.width}
                      onChange={(event) =>
                        patch({ width: Number(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    컬럼 색상
                    <input
                      type="color"
                      aria-label="컬럼 색상"
                      value={selected.color ?? "#ffffff"}
                      onChange={(event) => patch({ color: event.target.value })}
                    />
                  </label>
                  <MuteButton
                    size="sm"
                    onClick={() => {
                      const { color: _color, ...rest } = selected;
                      setDraft({
                        ...draft,
                        columns: draft.columns.map((c) =>
                          c.key === activeKey ? rest : c
                        ),
                      });
                    }}
                  >
                    색상 해제
                  </MuteButton>
                </div>
                <label>
                  정렬
                  <select
                    value={
                      draft.sorting.find((item) => item.key === activeKey)
                        ?.desc === true
                        ? "desc"
                        : draft.sorting.some((item) => item.key === activeKey)
                          ? "asc"
                          : "none"
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        sorting: [
                          ...draft.sorting.filter(
                            (item) => item.key !== activeKey
                          ),
                          ...(event.target.value === "none"
                            ? []
                            : [
                                {
                                  key: activeKey!,
                                  desc: event.target.value === "desc",
                                },
                              ]),
                        ].slice(0, 5),
                      })
                    }
                  >
                    <option value="none">없음</option>
                    <option value="asc">오름차순</option>
                    <option value="desc">내림차순</option>
                  </select>
                </label>
                <div className={styles.row}>
                  <span className={styles.mediumText}>필터</span>
                  <MuteButton
                    size="sm"
                    onClick={() =>
                      setFilter(
                        filter
                          ? undefined
                          : { key: activeKey!, operator: "contains", value: "" }
                      )
                    }
                  >
                    {filter ? "해제" : "추가"}
                  </MuteButton>
                </div>
                {filter && (
                  <div className={styles.row}>
                    <OperatorSelect
                      numeric={field?.type === "number"}
                      value={filter.operator}
                      onChange={(operator) =>
                        setFilter({ ...filter, operator })
                      }
                    />
                    {!["empty", "not_empty"].includes(filter.operator) && (
                      <input
                        aria-label="필터 값"
                        style={{ minWidth: 60, width: "100%" }}
                        value={filter.value}
                        onChange={(event) =>
                          setFilter({ ...filter, value: event.target.value })
                        }
                      />
                    )}
                  </div>
                )}
                <div className={styles.row}>
                  <span className={styles.mediumText}>값에 따른 색상</span>
                  <MuteButton
                    size="sm"
                    onClick={() =>
                      patch({
                        rules: [
                          ...(selected.rules ?? []),
                          { operator: "eq", value: "", color: "#e6f4ea" },
                        ],
                      })
                    }
                  >
                    <Plus size={13} />
                    규칙 추가
                  </MuteButton>
                </div>
                {(selected.rules ?? []).map((rule, index) => (
                  <div className={styles.rule} key={index}>
                    <OperatorSelect
                      numeric={field?.type === "number"}
                      value={rule.operator}
                      onChange={(operator) =>
                        patch({
                          rules: selected.rules!.map((r, i) =>
                            i === index ? { ...r, operator } : r
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`색상 규칙 ${index + 1} 값`}
                      disabled={["empty", "not_empty"].includes(rule.operator)}
                      value={rule.value}
                      onChange={(event) =>
                        patch({
                          rules: selected.rules!.map((r, i) =>
                            i === index
                              ? { ...r, value: event.target.value }
                              : r
                          ),
                        })
                      }
                    />
                    <input
                      aria-label={`색상 규칙 ${index + 1} 색상`}
                      type="color"
                      value={rule.color}
                      onChange={(event) =>
                        patch({
                          rules: selected.rules!.map((r, i) =>
                            i === index
                              ? { ...r, color: event.target.value }
                              : r
                          ),
                        })
                      }
                    />
                    <MuteButton
                      size="sm"
                      aria-label={`색상 규칙 ${index + 1} 삭제`}
                      onClick={() =>
                        patch({
                          rules: selected.rules!.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </MuteButton>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          <div className={styles.row} style={{ justifyContent: "flex-end" }}>
            <span className={styles.autoSaveStatus}>
              변경사항은 자동 저장됩니다.
            </span>
            <MuteButton onClick={close}>닫기</MuteButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
