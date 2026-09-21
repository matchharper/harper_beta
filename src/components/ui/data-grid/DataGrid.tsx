import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Filter,
  GripVertical,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  cellColor,
  columnLetter,
  displayValue,
  moveColumn,
  parseCell,
} from "@/lib/gtm/grid";
import type {
  GridColumn,
  GtmField,
  GtmRow,
  GtmValue,
  SheetDefinition,
} from "@/lib/gtm/types";
import styles from "./DataGrid.module.css";

export type ReferenceOption = { id: string; label: string };
type Props = {
  rows: GtmRow[];
  fields: GtmField[];
  definition: SheetDefinition;
  offset?: number;
  readOnly?: boolean;
  busy?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onDefinitionChange: (definition: SheetDefinition) => void;
  onColumnMenu: (key: string) => void;
  onCellSave: (row: GtmRow, field: GtmField, value: GtmValue) => Promise<void>;
  referenceOptions?: (
    source: string,
    search: string
  ) => Promise<ReferenceOption[]>;
  onRowOpen?: (row: GtmRow) => void;
  onCellOpen?: (row: GtmRow, column: string) => void;
  isCellOpenable?: (row: GtmRow, column: string) => boolean;
  onCellDoubleClick?: (row: GtmRow, column: string) => void;
  isCellDoubleClickOpenable?: (row: GtmRow, column: string) => boolean;
  minimumRowHeight?: (row: GtmRow) => number;
  renderCellContent?: (args: {
    row: GtmRow;
    field: GtmField;
    text: string;
  }) => ReactNode | undefined;
  onEditingChange?: (editing: boolean) => void;
};
type Edit = { row: GtmRow; field: GtmField; value: string; original: string };
type ColumnDrag = {
  key: string;
  target: string;
  position: "before" | "after";
};

export default function DataGrid({
  rows,
  fields,
  definition,
  offset = 0,
  readOnly,
  busy,
  hasMore,
  loadingMore,
  onLoadMore,
  onDefinitionChange,
  onColumnMenu,
  onCellSave,
  referenceOptions,
  onRowOpen,
  onCellOpen,
  isCellOpenable,
  onCellDoubleClick,
  isCellDoubleClickOpenable,
  minimumRowHeight,
  renderCellContent,
  onEditingChange,
}: Props) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [references, setReferences] = useState<ReferenceOption[]>([]);
  const [referenceSearch, setReferenceSearch] = useState("");
  const [columnDrag, setColumnDrag] = useState<ColumnDrag | null>(null);
  const referenceSeq = useRef(0);
  const [sizePreview, setSizePreview] = useState<{
    key: string;
    size: number;
    axis: "column" | "row";
  } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const loadMore = useRef<HTMLDivElement>(null);
  const loadRequested = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    onEditingChange?.(Boolean(edit) || saving);
  }, [edit, saving, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  useEffect(() => {
    if (!loadingMore) loadRequested.current = false;
  }, [loadingMore, rows.length]);
  useEffect(() => {
    const root = viewport.current;
    const target = loadMore.current;
    if (!root || !target || !hasMore || !onLoadMore || busy || loadingMore)
      return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadRequested.current) {
          loadRequested.current = true;
          onLoadMore();
        }
      },
      { root, rootMargin: "400px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [busy, hasMore, loadingMore, onLoadMore, rows.length]);
  const columns = definition.columns.filter((column) => !column.hidden);
  const fieldMap = new Map(fields.map((field) => [field.key, field]));
  const interactionLocked = Boolean(edit || saving || busy);
  const width = (column: GridColumn) =>
    sizePreview?.axis === "column" && sizePreview.key === column.key
      ? sizePreview.size
      : column.width;
  const rowHeight = (row: GtmRow) =>
    Math.max(
      sizePreview?.axis === "row" && sizePreview.key === row.id
        ? sizePreview.size
        : (definition.rowHeights[row.id] ?? definition.rowHeight),
      minimumRowHeight?.(row) ?? 0
    );

  function focusCell(row: number, column: number) {
    const r = Math.max(0, Math.min(rows.length - 1, row));
    const c = Math.max(0, Math.min(columns.length - 1, column));
    requestAnimationFrame(() =>
      viewport.current
        ?.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)
        ?.focus()
    );
  }
  async function startEdit(row: GtmRow, field: GtmField, initial?: string) {
    if (!field.writable || readOnly || interactionLocked) return;
    setError("");
    setReferences([]);
    setReferenceSearch("");
    setEdit({
      row,
      field,
      value: initial ?? displayValue(row[field.key]),
      original: displayValue(row[field.key]),
    });
    if (field.reference && referenceOptions) {
      const seq = ++referenceSeq.current;
      try {
        const options = await referenceOptions(field.reference, "");
        if (seq === referenceSeq.current) setReferences(options);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "연결 목록을 불러오지 못했습니다."
        );
      }
    }
  }
  async function commit(
    rowIndex: number,
    columnIndex: number,
    direction?: "next" | "previous" | "down",
    nextValue?: string
  ) {
    if (!edit || saving) return;
    setError("");
    try {
      const editedValue = nextValue ?? edit.value;
      if (editedValue !== edit.original) {
        const value = edit.field.reference
          ? editedValue || null
          : parseCell(editedValue, edit.field.type);
        setSaving(true);
        await onCellSave(edit.row, edit.field, value);
      }
      setEdit(null);
      referenceSeq.current++;
      focusCell(
        rowIndex + (direction === "down" ? 1 : 0),
        columnIndex +
          (direction === "next" ? 1 : direction === "previous" ? -1 : 0)
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "저장하지 못했습니다.");
      editorRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }
  function keyDown(
    event: KeyboardEvent,
    rowIndex: number,
    columnIndex: number,
    field: GtmField
  ) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      void startEdit(rows[rowIndex], field);
    } else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      event.preventDefault();
      focusCell(
        rowIndex +
          (event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0),
        columnIndex +
          (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)
      );
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      void startEdit(rows[rowIndex], field, event.key);
    }
  }
  function resize(
    event: PointerEvent<HTMLSpanElement>,
    key: string,
    initial: number,
    axis: "column" | "row"
  ) {
    if (interactionLocked || readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    const element = event.currentTarget,
      start = axis === "column" ? event.clientX : event.clientY;
    let size = initial;
    element.setPointerCapture(event.pointerId);
    const move = (ev: globalThis.PointerEvent) => {
      size = Math.max(
        axis === "column" ? 60 : 28,
        Math.min(
          axis === "column" ? 1200 : 600,
          initial + (axis === "column" ? ev.clientX : ev.clientY) - start
        )
      );
      setSizePreview({ key, size, axis });
    };
    const finish = (ev: globalThis.PointerEvent) => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", cancel);
      if (element.hasPointerCapture(ev.pointerId))
        element.releasePointerCapture(ev.pointerId);
      setSizePreview(null);
      onDefinitionChange(
        axis === "column"
          ? {
              ...definition,
              columns: definition.columns.map((column) =>
                column.key === key ? { ...column, width: size } : column
              ),
            }
          : {
              ...definition,
              rowHeights: { ...definition.rowHeights, [key]: size },
            }
      );
    };
    const cancel = (ev: globalThis.PointerEvent) => {
      size = initial;
      finish(ev);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", cancel);
  }
  return (
    <div
      className={styles.viewport}
      ref={viewport}
      aria-busy={busy || loadingMore || saving}
    >
      <table
        className={styles.table}
        aria-label="GTM 데이터"
        style={{
          width: 48 + columns.reduce((sum, column) => sum + width(column), 0),
        }}
      >
        <colgroup>
          <col style={{ width: 48 }} />
          {columns.map((column) => (
            <col key={column.key} style={{ width: width(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={styles.number}>#</th>
            {columns.map((column, index) => {
              const sorted = definition.sorting.find(
                  (item) => item.key === column.key
                ),
                filtered = definition.filters.some(
                  (item) => item.key === column.key
                );
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={`${
                    columnDrag?.key === column.key ? styles.draggingColumn : ""
                  } ${
                    columnDrag?.target === column.key
                      ? columnDrag.position === "before"
                        ? styles.dropBefore
                        : styles.dropAfter
                      : ""
                  }`}
                  aria-sort={
                    sorted ? (sorted.desc ? "descending" : "ascending") : "none"
                  }
                  onDragOver={(event) => {
                    if (interactionLocked || readOnly || !columnDrag) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const position =
                      event.clientX < bounds.left + bounds.width / 2
                        ? "before"
                        : "after";
                    if (
                      columnDrag.target !== column.key ||
                      columnDrag.position !== position
                    )
                      setColumnDrag({
                        key: columnDrag.key,
                        target: column.key,
                        position,
                      });
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dragged =
                      columnDrag?.key ||
                      event.dataTransfer.getData("text/gtm-column");
                    if (!interactionLocked && !readOnly && dragged)
                      onDefinitionChange({
                        ...definition,
                        columns: moveColumn(
                          definition.columns,
                          dragged,
                          columnDrag?.target ?? column.key,
                          columnDrag?.position ?? "before"
                        ),
                      });
                    setColumnDrag(null);
                  }}
                >
                  <div
                    className={styles.header}
                    style={{ background: column.color }}
                  >
                    <div className={styles.letter}>{columnLetter(index)}</div>
                    <div className={styles.heading}>
                      <span
                        className={styles.dragHandle}
                        draggable={!interactionLocked && !readOnly}
                        role="button"
                        tabIndex={-1}
                        aria-label={`${column.label} 컬럼 이동`}
                        aria-grabbed={columnDrag?.key === column.key}
                        title="드래그해서 컬럼 이동"
                        onDragStart={(event) => {
                          event.stopPropagation();
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/gtm-column",
                            column.key
                          );
                          const ghost = document.createElement("div");
                          ghost.className = styles.dragGhost;
                          ghost.textContent = column.label;
                          document.body.appendChild(ghost);
                          event.dataTransfer.setDragImage(ghost, 18, 18);
                          requestAnimationFrame(() => ghost.remove());
                          setColumnDrag({
                            key: column.key,
                            target: column.key,
                            position: "before",
                          });
                        }}
                        onDragEnd={() => setColumnDrag(null)}
                      >
                        <GripVertical size={14} />
                      </span>
                      <span
                        className={styles.label}
                        title={column.label}
                        role="button"
                        tabIndex={0}
                        aria-label={`${column.label} 정렬`}
                        onClick={() => {
                          if (!interactionLocked)
                            onDefinitionChange({
                              ...definition,
                              sorting: sorted?.desc
                                ? []
                                : [{ key: column.key, desc: Boolean(sorted) }],
                            });
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !interactionLocked)
                            onDefinitionChange({
                              ...definition,
                              sorting: sorted?.desc
                                ? []
                                : [{ key: column.key, desc: Boolean(sorted) }],
                            });
                        }}
                      >
                        {column.label}
                      </span>
                      {sorted &&
                        (sorted.desc ? (
                          <ArrowDown size={12} />
                        ) : (
                          <ArrowUp size={12} />
                        ))}
                      <button
                        type="button"
                        className={styles.menu}
                        aria-label={`${column.label} 컬럼 설정`}
                        disabled={interactionLocked}
                        onClick={() => onColumnMenu(column.key)}
                      >
                        {filtered ? (
                          <Filter size={13} color="#1a73e8" />
                        ) : (
                          <ChevronDown size={13} />
                        )}
                      </button>
                    </div>
                  </div>
                  <span
                    className={styles.resizeColumn}
                    role="separator"
                    aria-label={`${column.label} 너비`}
                    aria-orientation="vertical"
                    tabIndex={0}
                    aria-valuenow={column.width}
                    aria-valuemin={60}
                    aria-valuemax={1200}
                    onPointerDown={(event) =>
                      resize(event, column.key, column.width, "column")
                    }
                    onKeyDown={(event) => {
                      if (
                        ["ArrowLeft", "ArrowRight"].includes(event.key) &&
                        !interactionLocked &&
                        !readOnly
                      ) {
                        event.preventDefault();
                        onDefinitionChange({
                          ...definition,
                          columns: definition.columns.map((c) =>
                            c.key === column.key
                              ? {
                                  ...c,
                                  width: Math.max(
                                    60,
                                    Math.min(
                                      1200,
                                      c.width +
                                        (event.key === "ArrowRight" ? 10 : -10)
                                    )
                                  ),
                                }
                              : c
                          ),
                        });
                      }
                    }}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              <th
                className={styles.number}
                scope="row"
                style={{ height: rowHeight(row) }}
              >
                {onRowOpen ? (
                  <button
                    className={styles.menu}
                    style={{ width: "100%" }}
                    aria-label={`${offset + rowIndex + 1}행 상세`}
                    onClick={() => {
                      if (!interactionLocked) onRowOpen(row);
                    }}
                  >
                    {offset + rowIndex + 1}
                  </button>
                ) : (
                  offset + rowIndex + 1
                )}
                <span
                  className={styles.resizeRow}
                  role="separator"
                  aria-label={`${offset + rowIndex + 1}행 높이`}
                  aria-orientation="horizontal"
                  aria-valuenow={rowHeight(row)}
                  aria-valuemin={28}
                  aria-valuemax={600}
                  tabIndex={0}
                  onPointerDown={(event) =>
                    resize(event, row.id, rowHeight(row), "row")
                  }
                  onKeyDown={(event) => {
                    if (
                      ["ArrowUp", "ArrowDown"].includes(event.key) &&
                      !interactionLocked &&
                      !readOnly
                    ) {
                      event.preventDefault();
                      const height = Math.max(
                        28,
                        Math.min(
                          600,
                          rowHeight(row) + (event.key === "ArrowDown" ? 4 : -4)
                        )
                      );
                      onDefinitionChange({
                        ...definition,
                        rowHeights: {
                          ...definition.rowHeights,
                          [row.id]: height,
                        },
                      });
                    }
                  }}
                />
              </th>
              {columns.map((column, columnIndex) => {
                const field = fieldMap.get(column.key) ?? {
                  key: column.key,
                  label: column.label,
                  type: "text" as const,
                  writable: false,
                };
                const isEditing =
                  edit?.row.id === row.id && edit.field.key === column.key;
                const text = displayValue(
                  field.reference
                    ? (row[`${column.key}__display`] ?? row[column.key])
                    : row[column.key]
                );
                const customContent = renderCellContent?.({
                  row,
                  field,
                  text,
                });
                const opensOnDoubleClick =
                  isCellDoubleClickOpenable?.(row, column.key) ?? false;
                return (
                  <td
                    key={column.key}
                    className={`${
                      columnDrag?.key === column.key ? styles.draggingCell : ""
                    } ${
                      columnDrag?.target === column.key
                        ? columnDrag.position === "before"
                          ? styles.dropBefore
                          : styles.dropAfter
                        : ""
                    }`}
                    style={{
                      height: rowHeight(row),
                      backgroundColor: cellColor(row[column.key], column),
                    }}
                  >
                    <div
                      className={styles.cell}
                      style={{ height: rowHeight(row) }}
                      tabIndex={0}
                      data-cell={`${rowIndex}:${columnIndex}`}
                      aria-label={`${column.label}, ${offset + rowIndex + 1}행`}
                      aria-readonly={!field.writable || readOnly}
                      title={
                        opensOnDoubleClick ? `${text}\n더블클릭하여 편집` : text
                      }
                      onKeyDown={(event) =>
                        keyDown(event, rowIndex, columnIndex, field)
                      }
                      onDoubleClick={() => {
                        if (opensOnDoubleClick) {
                          onCellDoubleClick?.(row, column.key);
                          return;
                        }
                        void startEdit(row, field);
                      }}
                      onCopy={(event) => {
                        if (!edit) {
                          event.clipboardData.setData(
                            "text/plain",
                            displayValue(row[column.key])
                          );
                          event.preventDefault();
                        }
                      }}
                      onPaste={(event) => {
                        if (field.writable && !readOnly && !interactionLocked) {
                          event.preventDefault();
                          void startEdit(
                            row,
                            field,
                            event.clipboardData.getData("text/plain")
                          );
                        }
                      }}
                    >
                      {customContent !== undefined ? (
                        customContent
                      ) : onCellOpen && isCellOpenable?.(row, column.key) ? (
                        <button
                          type="button"
                          className={styles.recordLink}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!interactionLocked) onCellOpen(row, column.key);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          {text}
                        </button>
                      ) : /^https?:\/\/\S+$/.test(text) ? (
                        <a
                          href={text}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </div>
                    {isEditing && (
                      <div
                        className={styles.editor}
                        style={{
                          height: field.reference
                            ? 112
                            : Math.max(rowHeight(row), 72),
                        }}
                      >
                        {field.reference ? (
                          <>
                            <input
                              aria-label="연결 검색"
                              value={referenceSearch}
                              disabled={saving}
                              onChange={async (event) => {
                                const search = event.target.value;
                                setReferenceSearch(search);
                                const seq = ++referenceSeq.current;
                                try {
                                  const options = await referenceOptions?.(
                                    field.reference!,
                                    search
                                  );
                                  if (seq === referenceSeq.current)
                                    setReferences(options ?? []);
                                } catch (cause) {
                                  setError(String(cause));
                                }
                              }}
                              style={{
                                width: "100%",
                                height: 28,
                                border: "1px solid #c9cdd2",
                              }}
                            />
                            <select
                              autoFocus
                              aria-label={`${column.label} 연결`}
                              value={edit.value}
                              disabled={saving}
                              style={{ height: 32 }}
                              onChange={(event) => {
                                const value = event.target.value;
                                setEdit({ ...edit, value });
                                void commit(
                                  rowIndex,
                                  columnIndex,
                                  undefined,
                                  value
                                );
                              }}
                            >
                              <option value="">연결 없음</option>
                              {edit.value &&
                                !references.some(
                                  (item) => item.id === edit.value
                                ) && (
                                  <option value={edit.value}>
                                    {text || edit.value}
                                  </option>
                                )}
                              {references.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                            <span className={styles.autoSaveHint}>
                              선택하면 자동 저장됩니다.
                            </span>
                          </>
                        ) : (
                          <Textarea
                            unstyled
                            ref={editorRef}
                            autoFocus
                            aria-label={`${column.label} 편집`}
                            disabled={saving}
                            value={edit.value}
                            onChange={(event) =>
                              setEdit({ ...edit, value: event.target.value })
                            }
                            onBlur={() => void commit(rowIndex, columnIndex)}
                            onKeyDown={(event) => {
                              if (
                                event.nativeEvent.isComposing ||
                                event.keyCode === 229
                              )
                                return;
                              if (event.key === "Escape") {
                                event.preventDefault();
                                setEdit(null);
                                setError("");
                                focusCell(rowIndex, columnIndex);
                              }
                              if (
                                (event.key === "Enter" && !event.shiftKey) ||
                                event.key === "Tab"
                              ) {
                                event.preventDefault();
                                void commit(
                                  rowIndex,
                                  columnIndex,
                                  event.key === "Tab"
                                    ? event.shiftKey
                                      ? "previous"
                                      : "next"
                                    : "down"
                                );
                              }
                            }}
                          />
                        )}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div ref={loadMore} className={styles.loadMore} aria-hidden="true" />
      {loadingMore && (
        <div className={styles.loadingMore} role="status">
          다음 100행 불러오는 중…
        </div>
      )}
      {!rows.length && (
        <div className={styles.empty}>
          {busy ? "불러오는 중…" : "표시할 데이터가 없습니다."}
        </div>
      )}
      {edit && !error && (
        <div
          className={styles.error}
          style={{ background: "#e8f0fe", color: "#174ea6" }}
        >
          {saving
            ? "자동 저장 중…"
            : "변경하면 자동 저장됩니다 · Shift+Enter 줄바꿈 · Esc 취소"}
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
