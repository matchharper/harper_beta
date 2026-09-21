import type {
  ColorRule,
  FieldType,
  GtmValue,
  GridColumn,
  SheetDefinition,
} from "./types";

export function displayValue(value: GtmValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) && value.every((item) => typeof item !== "object"))
    return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}
export function parseCell(value: string, type: FieldType): GtmValue {
  if (type === "text") return value;
  if (!value.trim()) return type === "array" ? [] : null;
  if (type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("숫자를 입력하세요.");
    return number;
  }
  if (type === "boolean") {
    if (/^(true|1)$/i.test(value)) return true;
    if (/^(false|0)$/i.test(value)) return false;
    throw new Error("TRUE 또는 FALSE를 입력하세요.");
  }
  if (type === "date") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new Error("날짜와 시간을 확인하세요.");
    return date.toISOString();
  }
  if (type === "array") {
    if (value.trim().startsWith("[")) {
      const parsed: unknown = JSON.parse(value);
      if (
        !Array.isArray(parsed) ||
        parsed.some((item) => typeof item !== "string")
      )
        throw new Error("문자열 목록을 입력하세요.");
      return parsed as string[];
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return JSON.parse(value) as GtmValue;
}
export function matchesRule(
  value: GtmValue | undefined,
  rule: ColorRule
): boolean {
  const text = displayValue(value);
  switch (rule.operator) {
    case "empty":
      return value == null || text === "";
    case "not_empty":
      return value != null && text !== "";
    case "contains":
      return text.toLocaleLowerCase().includes(rule.value.toLocaleLowerCase());
    case "eq":
      return text.toLocaleLowerCase() === rule.value.toLocaleLowerCase();
    case "neq":
      return text.toLocaleLowerCase() !== rule.value.toLocaleLowerCase();
    default: {
      if (!text.trim() || !rule.value.trim()) return false;
      const left = Number(text),
        right = Number(rule.value);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      return rule.operator === "gt"
        ? left > right
        : rule.operator === "gte"
          ? left >= right
          : rule.operator === "lt"
            ? left < right
            : left <= right;
    }
  }
}
export function cellColor(
  value: GtmValue | undefined,
  column: GridColumn
): string | undefined {
  return (
    column.rules?.find((rule) => matchesRule(value, rule))?.color ??
    column.color
  );
}
export function moveColumn(
  columns: GridColumn[],
  key: string,
  target: string,
  position: "before" | "after" = "before"
): GridColumn[] {
  const from = columns.findIndex((column) => column.key === key);
  if (from < 0 || key === target) return columns;
  const next = columns.filter((column) => column.key !== key);
  const targetIndex = next.findIndex((column) => column.key === target);
  if (targetIndex < 0) return columns;
  next.splice(targetIndex + (position === "after" ? 1 : 0), 0, columns[from]);
  if (next.every((column, index) => column.key === columns[index]?.key))
    return columns;
  return next;
}
export function columnLetter(index: number): string {
  let label = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26))
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  return label;
}
export function freshDefinition(
  source: string,
  fields: { key: string; label: string }[]
): SheetDefinition {
  return {
    source,
    columns: fields.map((field) => ({
      ...field,
      width: field.key === "ref" ? 80 : 180,
    })),
    filters: [],
    sorting: [],
    rowHeight: 36,
    rowHeights: {},
  };
}
