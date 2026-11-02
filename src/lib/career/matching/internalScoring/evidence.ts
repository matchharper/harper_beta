import { createHash } from "node:crypto";
import { formatLlmDateTime } from "@/lib/llm/promptDateTime";
import contract from "./workerContract.json";

// Literal port of opp/utils/llm_input_text.py, matching/text.py and
// company_requested.evaluation_text. Keep source snapshots separate from prose.
export type Row = Record<string, any>;
export const INPUT_CONTRACT = "worker_behavior_v1";
class PythonFloat extends Number {}
const object = (v: unknown): v is Row =>
  Boolean(
    v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof PythonFloat)
  );
const floatText = (value: number) => {
  if (Object.is(value, -0)) return "-0.0";
  const text = String(value);
  if (text.includes("e")) return text.replace(/e([+-]?)(\d)$/, "e$10$2");
  if (value !== 0 && Math.abs(value) < 0.0001)
    return value.toExponential().replace(/e([+-]?)(\d)$/, "e$10$2");
  return Number.isInteger(value) ? text + ".0" : text;
};
// psycopg converts these PostgreSQL numeric columns through Decimal -> float.
// Keep its decimal marker in both the readable prompt and shared cache key.
function pythonRole(role: Row): Row {
  return Object.fromEntries(
    Object.entries(role).map(([key, value]) => [
      key,
      ["salary_min", "salary_max"].includes(key) && typeof value === "number"
        ? new PythonFloat(value)
        : value,
    ])
  );
}
export function displayValue(value: unknown): string {
  if (value == null) return "미제공";
  if (typeof value === "boolean") return String(value);
  if (value instanceof PythonFloat) return floatText(Number(value));
  if (typeof value === "number" && !Number.isInteger(value))
    return floatText(value);
  if (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(
      value
    )
  ) {
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(value))
      return value.slice(0, 16).replace("T", " ") + " (timezone unspecified)";
    const date = formatLlmDateTime(value);
    if (date !== "-") return date + " KST";
  }
  if (value instanceof Date) return formatLlmDateTime(value) + " KST";
  return value === "" ? "(빈 값)" : String(value);
}
export function renderEvidence(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item, i) =>
            object(item) || Array.isArray(item)
              ? `${pad}${i + 1}.\n${renderEvidence(item, indent + 3)}`
              : `${pad}${i + 1}. ${displayValue(item).replaceAll("\n", "\n" + pad + "   ")}`
          )
          .join("\n")
      : pad + "(항목 없음)";
  if (object(value) && !(value instanceof Date))
    return Object.keys(value).length
      ? Object.entries(value)
          .map(([key, item]) =>
            object(item) || Array.isArray(item)
              ? `${pad}- ${key}:\n${renderEvidence(item, indent + 2)}`
              : `${pad}- ${key}: ${displayValue(item).replaceAll("\n", "\n" + pad + "  ")}`
          )
          .join("\n")
      : pad + "(항목 없음)";
  return displayValue(value)
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}
export function profileText(profile: unknown): string {
  if (!object(profile)) return renderEvidence(profile);
  return Object.entries(profile)
    .map(([key, value]) => {
      if (key === "profile" && object(value)) return renderEvidence(value);
      if (["experiences", "educations"].includes(key) && Array.isArray(value)) {
        const items = value.map((entry, i) => {
          if (!object(entry)) return `${i + 1}. ${renderEvidence(entry)}`;
          const keys = ["start", "end"].map(
            (k) =>
              [`${k}Date`, `${k}_date`, k].find((n) => n in entry) ?? `${k}Date`
          );
          const period = keys.map((k) => displayValue(entry[k])).join(" → ");
          return `${i + 1}. 기간: ${period}\n${renderEvidence(Object.fromEntries(Object.entries(entry).filter(([k]) => !keys.includes(k))), 3)}`;
        });
        return `#### ${key === "experiences" ? "경력 (종료일 미제공은 현재 재직의 확인이 아님)" : "학력"}\n${items.join("\n") || "(항목 없음)"}`;
      }
      return renderEvidence({ [key]: value });
    })
    .join("\n\n");
}
export function evaluationText(
  candidate: Row,
  stage: 1 | 2,
  now = new Date()
): string {
  const role = pythonRole(candidate.role);
  const separate = new Set([
    "request",
    "criteria",
    "description",
    "company_name",
    "company_description",
    "role_id",
  ]);
  const facts = Object.fromEntries(
    Object.entries(role)
      .filter(([k]) => !separate.has(k))
      .map(([k, v]) => [
        ["location", "location_text"].includes(k) ? "role_work_location" : k,
        v,
      ])
  );
  const contextRows = (rows: Row[] = []) =>
    rows.map((row) =>
      object(row)
        ? Object.fromEntries(
            Object.entries(row).filter(
              ([k]) => !["ref", "id", "revision"].includes(k)
            )
          )
        : row
    );
  const profile = object(candidate.profile?.profile)
    ? {
        ...candidate.profile,
        profile: Object.fromEntries(
          Object.entries(candidate.profile.profile).map(([k, v]) => [
            k === "location" ? "recorded_current_residence" : k,
            v,
          ])
        ),
      }
    : (candidate.profile ?? "");
  const sections = {
    "현재 회사 Hiring Brief — 회사가 찾는 후보 요건": role.request ?? "",
    ...(stage === 1
      ? { "현재 Criteria — 세부 충족도는 2차에서 평가": role.criteria ?? [] }
      : {}),
    "실제 역할의 제공 조건 — 후보자의 조건과 비교할 사실": facts,
    "회사 소개·기존 공고 — 현재 Hiring Brief와 일치하는 범위에서 참고":
      Object.fromEntries(
        ["company_name", "company_description", "description"].map((k) => [
          k,
          role[k] ?? null,
        ])
      ),
    "회사 Memory — 범위별 원문 맥락": contextRows(candidate.companyMemory),
    "후보자의 기록된 사실 — Profile": profileText(profile),
    "후보자가 밝힌 조건 — 전체 Search Brief": contextRows(
      candidate.searchBrief
    ),
    "후보자 Memory — 원문 맥락과 수정 시각": contextRows(candidate.memory),
    "Behavior Context — 요구조건을 만들지 않는 참고 해석":
      candidate.behaviorContext ?? "",
  };
  return [
    ...Object.entries(sections).map(
      ([title, value]) => `## ${title}\n${renderEvidence(value)}`
    ),
    `## 기준 날짜\n${formatLlmDateTime(now).slice(0, 10)} (Asia/Seoul)`,
  ].join("\n\n");
}

// Python json.dumps(sort_keys=True, ensure_ascii=False, separators=(',', ':')).
export function canonicalJson(value: any): string {
  if (value instanceof PythonFloat) return floatText(Number(value));
  if (typeof value === "number" && !Number.isInteger(value))
    return floatText(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (object(value))
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function inputFingerprint(source: Row): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        input: { ...source, role: pythonRole(source.role) },
        model: contract.MODEL,
        prompt: contract.PROMPT_VERSION,
      })
    )
    .digest("hex");
}
