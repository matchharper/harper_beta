import type { OrgAgentAdminClient } from "@/lib/org/agent/data";
import {
  humanizeOrgEmploymentType,
  humanizeOrgRoleStatus,
  humanizeOrgWorkMode,
} from "@/lib/org/pipelineStage";
import {
  COMPANY_DATA_CATALOG,
  companyDataDisplayLabel,
  companyDataTargetKey,
  isCompanyDataKey,
  type CompanyDataChangeKind,
  type CompanyDataKey,
  type CompanyDataRequestSection,
} from "@/lib/org/agent/companyDataCatalog";

const MAX_CHANGES = 12;
const MAX_TOOL_TEXT_INPUT = 22_000;
const MAX_SUMMARY_LENGTH = 160;
const MAX_PREVIEW_LENGTH = 3_000;
const HARD_HEADING = "## Hard constraints";
const PREFERRED_HEADING = "## Preferred criteria";
const LEGACY_HEADING = "## Legacy notes — unclassified";

export class CompanyDataMutationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type CompanyDataChangeInput = {
  key: CompanyDataKey;
  kind: CompanyDataChangeKind;
  oldValue?: unknown;
  roleId: string | null;
  section?: CompanyDataRequestSection;
  value: unknown;
};

export type CompanyDataSnapshotEntry = {
  expected?: unknown;
  expected_physical?: Record<string, unknown>;
  label?: string;
  value: unknown;
};

export type CompanyDataSnapshot = Map<string, CompanyDataSnapshotEntry>;

export type ResolvedCompanyDataChange = {
  expected?: unknown;
  expected_physical?: Record<string, unknown>;
  key: CompanyDataKey;
  preview: string;
  role_id: string | null;
  value: unknown;
};

export type ResolvedCompanyDataMutation = {
  changes: ResolvedCompanyDataChange[];
  confirmationRequired: boolean;
  preview: string;
  summary: string;
};

type RawChange = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function singleLine(value: unknown) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roleIdFrom(value: unknown) {
  const roleId = singleLine(value);
  if (roleId.length > 100) {
    throw new CompanyDataMutationError("invalid_role", "roleId is too long");
  }
  return roleId || null;
}

function normalizeSummary(value: unknown) {
  const summary = singleLine(value);
  if (!summary) {
    throw new CompanyDataMutationError(
      "invalid_summary",
      "summary is required"
    );
  }
  if (Array.from(summary).length > MAX_SUMMARY_LENGTH) {
    throw new CompanyDataMutationError(
      "invalid_summary",
      `summary must be ${MAX_SUMMARY_LENGTH} characters or fewer`
    );
  }
  return summary;
}

function textInputLength(value: unknown): number {
  if (typeof value === "string") return Array.from(value).length;
  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + textInputLength(item), 0);
  }
  return 0;
}

export function parseCompanyDataChanges(args: {
  changes: unknown;
  summary: unknown;
}) {
  if (!Array.isArray(args.changes) || args.changes.length === 0) {
    throw new CompanyDataMutationError(
      "invalid_changes",
      "changes must contain at least one change"
    );
  }
  if (args.changes.length > MAX_CHANGES) {
    throw new CompanyDataMutationError(
      "invalid_changes",
      `changes may contain at most ${MAX_CHANGES} items`
    );
  }

  const summary = normalizeSummary(args.summary);
  let totalTextLength = Array.from(summary).length;
  const parsed: CompanyDataChangeInput[] = args.changes.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new CompanyDataMutationError(
        "invalid_change",
        `changes[${index}] must be an object`
      );
    }
    const keyText = singleLine(raw.key);
    if (!isCompanyDataKey(keyText)) {
      throw new CompanyDataMutationError(
        "unknown_key",
        `changes[${index}].key is not supported`
      );
    }
    const catalog = COMPANY_DATA_CATALOG[keyText];
    const roleId = roleIdFrom(raw.roleId);
    if (catalog.roleScoped !== Boolean(roleId)) {
      throw new CompanyDataMutationError(
        "invalid_scope",
        catalog.roleScoped
          ? `${keyText} requires roleId`
          : `${keyText} does not accept roleId`
      );
    }
    const kind = singleLine(raw.kind) as CompanyDataChangeKind;
    if (kind !== "append" && kind !== "replace" && kind !== "rewrite") {
      throw new CompanyDataMutationError(
        "invalid_kind",
        `changes[${index}].kind must be append, replace, or rewrite`
      );
    }
    if (kind === "replace" && !("oldValue" in raw)) {
      throw new CompanyDataMutationError(
        "old_value_required",
        `changes[${index}].oldValue is required for replace`
      );
    }
    if (!("value" in raw)) {
      throw new CompanyDataMutationError(
        "value_required",
        `changes[${index}].value is required`
      );
    }

    const sectionText = singleLine(raw.section);
    const section = sectionText
      ? (sectionText as CompanyDataRequestSection)
      : undefined;
    if (
      section &&
      section !== "hard_constraints" &&
      section !== "preferred_criteria"
    ) {
      throw new CompanyDataMutationError(
        "invalid_section",
        "section must be hard_constraints or preferred_criteria"
      );
    }
    if (keyText === "role_request" && kind === "append" && !section) {
      throw new CompanyDataMutationError(
        "section_required",
        "role_request append requires section"
      );
    }
    if (section && !(keyText === "role_request" && kind === "append")) {
      throw new CompanyDataMutationError(
        "invalid_section",
        "section is only valid for role_request append"
      );
    }
    totalTextLength +=
      textInputLength(raw.value) + textInputLength(raw.oldValue);
    return {
      key: keyText,
      kind,
      oldValue: raw.oldValue,
      roleId,
      section,
      value: raw.value,
    };
  });

  if (totalTextLength > MAX_TOOL_TEXT_INPUT) {
    throw new CompanyDataMutationError(
      "rewrite_too_large",
      `update_data text input may not exceed ${MAX_TOOL_TEXT_INPUT.toLocaleString()} characters`
    );
  }

  const seen = new Map<string, CompanyDataChangeInput[]>();
  for (const change of parsed) {
    const target = companyDataTargetKey(change.key, change.roleId);
    const previous = seen.get(target) ?? [];
    const allowedRequestPair =
      previous.length === 1 &&
      previous[0].key === "role_request" &&
      previous[0].kind === "append" &&
      change.key === "role_request" &&
      change.kind === "append" &&
      previous[0].section !== change.section;
    if (previous.length > 0 && !allowedRequestPair) {
      throw new CompanyDataMutationError(
        "duplicate_change",
        `Multiple operations for ${change.key} require one rewrite`
      );
    }
    seen.set(target, [...previous, change]);
  }

  return { changes: parsed, summary };
}

function normalizeString(value: unknown, nullable: boolean, maxLength: number) {
  if (value === null || value === undefined) {
    if (!nullable) {
      throw new CompanyDataMutationError(
        "null_not_allowed",
        "Value cannot be empty"
      );
    }
    return null;
  }
  const normalized = String(value).replaceAll("\u0000", "").trim();
  if (!normalized) {
    if (!nullable) {
      throw new CompanyDataMutationError(
        "null_not_allowed",
        "Value cannot be empty"
      );
    }
    return null;
  }
  if (Array.from(normalized).length > maxLength) {
    throw new CompanyDataMutationError(
      "value_too_long",
      `Value may not exceed ${maxLength.toLocaleString()} characters`
    );
  }
  return normalized;
}

function normalizeUrl(value: unknown, nullable: boolean, maxLength: number) {
  const normalized = normalizeString(value, nullable, maxLength);
  if (normalized === null) return null;
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new CompanyDataMutationError(
      "invalid_url",
      "Value must be a valid URL"
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CompanyDataMutationError(
      "invalid_url",
      "Only http and https URLs are allowed"
    );
  }
  return url.toString();
}

function normalizeInteger(value: unknown, nullable: boolean) {
  if (value === null || value === undefined || value === "") {
    if (!nullable) {
      throw new CompanyDataMutationError(
        "null_not_allowed",
        "Value cannot be empty"
      );
    }
    return null;
  }
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 2_147_483_647) {
    throw new CompanyDataMutationError(
      "invalid_integer",
      "Value must be a non-negative integer"
    );
  }
  return number;
}

function normalizeList(args: {
  allowedValues?: readonly string[];
  key: CompanyDataKey;
  maxItems: number;
  nullable: boolean;
  value: unknown;
}) {
  if (args.value === null || args.value === undefined) {
    if (!args.nullable) return [];
    return null;
  }
  const raw = Array.isArray(args.value) ? args.value : [args.value];
  const values: string[] = [];
  for (const item of raw) {
    const value = singleLine(item);
    if (!value || values.includes(value)) continue;
    if (args.allowedValues && !args.allowedValues.includes(value)) {
      throw new CompanyDataMutationError(
        "invalid_enum",
        `${args.key} accepts only: ${args.allowedValues.join(", ")}`
      );
    }
    if (args.key === "related_links") {
      values.push(String(normalizeUrl(value, false, 2_000)));
    } else {
      values.push(value);
    }
  }
  if (values.length > args.maxItems) {
    throw new CompanyDataMutationError(
      "too_many_items",
      `${args.key} accepts at most ${args.maxItems} items`
    );
  }
  return values;
}

function normalizeRewriteValue(key: CompanyDataKey, value: unknown) {
  const catalog = COMPANY_DATA_CATALOG[key];
  if (catalog.type === "integer") {
    return normalizeInteger(value, catalog.nullable);
  }
  if (catalog.type === "string_list") {
    return normalizeList({
      allowedValues: catalog.allowedValues,
      key,
      maxItems: catalog.maxItems ?? 24,
      nullable: catalog.nullable,
      value,
    });
  }
  if (catalog.type === "enum") {
    const normalized = normalizeString(value, catalog.nullable, 100);
    if (
      normalized !== null &&
      catalog.allowedValues &&
      !catalog.allowedValues.includes(normalized)
    ) {
      throw new CompanyDataMutationError(
        "invalid_enum",
        `${key} accepts only: ${catalog.allowedValues.join(", ")}`
      );
    }
    return normalized;
  }
  if (catalog.type === "url") {
    return normalizeUrl(value, catalog.nullable, catalog.maxLength ?? 2_000);
  }
  const normalized = normalizeString(
    value,
    catalog.nullable,
    catalog.maxLength ?? 20_000
  );
  if (
    key === "role_request" &&
    normalized !== null &&
    (!normalized.includes(HARD_HEADING) ||
      !normalized.includes(PREFERRED_HEADING))
  ) {
    throw new CompanyDataMutationError(
      "invalid_request_format",
      `role_request rewrite must include ${HARD_HEADING} and ${PREFERRED_HEADING}`
    );
  }
  return normalized;
}

function asText(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function appendText(current: unknown, value: unknown, maxLength: number) {
  const addition = normalizeString(value, false, maxLength)!;
  const existing = asText(current);
  let occurrence = existing.indexOf(addition);
  while (occurrence >= 0) {
    const before = existing.slice(0, occurrence);
    const after = existing.slice(occurrence + addition.length);
    const startsAtBlock = !before.trim() || /\n\s*\n\s*$/.test(before);
    const endsAtBlock = !after.trim() || /^\s*\n\s*\n/.test(after);
    if (startsAtBlock && endsAtBlock) return existing;
    occurrence = existing.indexOf(addition, occurrence + addition.length);
  }
  const next = existing.trim()
    ? `${existing.trimEnd()}\n\n${addition}`
    : addition;
  if (Array.from(next).length > maxLength) {
    throw new CompanyDataMutationError(
      "value_too_long",
      `Final value may not exceed ${maxLength.toLocaleString()} characters`
    );
  }
  return next;
}

function requestBullet(value: unknown) {
  const normalized = normalizeString(value, false, 4_000)!;
  return `- ${normalized.replace(/^[-*]\s+/, "").replace(/\s*\n\s*/g, " ")}`;
}

function insertRequestBullet(
  document: string,
  heading: string,
  bullet: string
) {
  const headingIndex = document.indexOf(heading);
  if (headingIndex < 0) return document;
  const bodyStart = headingIndex + heading.length;
  const nextHeadingOffset = document.slice(bodyStart).search(/\n##\s+/);
  const bodyEnd =
    nextHeadingOffset < 0 ? document.length : bodyStart + nextHeadingOffset;
  const before = document.slice(0, bodyEnd).trimEnd();
  const after = document.slice(bodyEnd);
  return `${before}\n\n${bullet}${after ? `\n${after}` : ""}`;
}

function requestSectionHasBullet(
  document: string,
  heading: string,
  bullet: string
) {
  const headingIndex = document.indexOf(heading);
  if (headingIndex < 0) return false;
  const bodyStart = headingIndex + heading.length;
  const nextHeadingOffset = document.slice(bodyStart).search(/\n##\s+/);
  const bodyEnd =
    nextHeadingOffset < 0 ? document.length : bodyStart + nextHeadingOffset;
  return document
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .some((line) => line.trim() === bullet);
}

function appendRoleRequest(
  current: unknown,
  value: unknown,
  section: CompanyDataRequestSection
) {
  const existing = asText(current);
  const bullet = requestBullet(value);
  const hasCanonicalHeadings =
    existing.includes(HARD_HEADING) && existing.includes(PREFERRED_HEADING);
  let next: string;
  if (hasCanonicalHeadings) {
    const heading =
      section === "hard_constraints" ? HARD_HEADING : PREFERRED_HEADING;
    if (requestSectionHasBullet(existing, heading, bullet)) return existing;
    next = insertRequestBullet(existing, heading, bullet);
  } else {
    const hard = section === "hard_constraints" ? bullet : "";
    const preferred = section === "preferred_criteria" ? bullet : "";
    const legacy = existing ? `\n\n${LEGACY_HEADING}\n\n${existing}` : "";
    next =
      `${HARD_HEADING}\n\n${hard}\n\n${PREFERRED_HEADING}\n\n${preferred}${legacy}`.trimEnd();
  }
  if (Array.from(next).length > 20_000) {
    throw new CompanyDataMutationError(
      "oversized_legacy",
      "The final role request would exceed 20,000 characters"
    );
  }
  return next;
}

function exactReplace(current: unknown, oldValue: unknown, value: unknown) {
  const source = asText(current);
  const oldText =
    typeof oldValue === "string" ? oldValue : String(oldValue ?? "");
  if (!oldText) {
    throw new CompanyDataMutationError(
      "old_value_required",
      "oldValue must be a non-empty exact substring"
    );
  }
  const first = source.indexOf(oldText);
  const second =
    first < 0 ? -1 : source.indexOf(oldText, first + oldText.length);
  if (first < 0 || second >= 0) {
    throw new CompanyDataMutationError(
      "replace_match_error",
      first < 0
        ? "oldValue was not found in the current value"
        : "oldValue appears more than once; use rewrite or a more specific match"
    );
  }
  const replacement =
    value == null ? "" : String(value).replaceAll("\u0000", "");
  return `${source.slice(0, first)}${replacement}${source.slice(first + oldText.length)}`;
}

function validateReplacedText(
  key: CompanyDataKey,
  value: string,
  before: unknown
) {
  const catalog = COMPANY_DATA_CATALOG[key];
  const maxLength = catalog.maxLength ?? 20_000;
  if (Array.from(value).length > maxLength) {
    throw new CompanyDataMutationError(
      "value_too_long",
      `Final value may not exceed ${maxLength.toLocaleString()} characters`
    );
  }
  if (!value.trim()) {
    if (!catalog.nullable) {
      throw new CompanyDataMutationError(
        "null_not_allowed",
        "Value cannot be empty"
      );
    }
    return null;
  }
  const previousRequest = asText(before);
  const previousRequestWasCanonical =
    previousRequest.includes(HARD_HEADING) &&
    previousRequest.includes(PREFERRED_HEADING);
  if (
    key === "role_request" &&
    previousRequestWasCanonical &&
    (!value.includes(HARD_HEADING) || !value.includes(PREFERRED_HEADING))
  ) {
    throw new CompanyDataMutationError(
      "invalid_request_format",
      `role_request must retain ${HARD_HEADING} and ${PREFERRED_HEADING}`
    );
  }
  return value;
}

function applyOperation(change: CompanyDataChangeInput, current: unknown) {
  const catalog = COMPANY_DATA_CATALOG[change.key];
  if (change.kind === "rewrite") {
    return normalizeRewriteValue(change.key, change.value);
  }
  if (change.kind === "replace") {
    if (catalog.type !== "text") {
      throw new CompanyDataMutationError(
        "invalid_kind",
        "replace is only available for text fields"
      );
    }
    const next = exactReplace(current, change.oldValue, change.value);
    return validateReplacedText(change.key, next, current);
  }
  if (catalog.type === "string_list") {
    const existing = Array.isArray(current) ? current : [];
    const additions =
      normalizeList({
        allowedValues: catalog.allowedValues,
        key: change.key,
        maxItems: catalog.maxItems ?? 24,
        nullable: false,
        value: change.value,
      }) ?? [];
    return normalizeList({
      allowedValues: catalog.allowedValues,
      key: change.key,
      maxItems: catalog.maxItems ?? 24,
      nullable: catalog.nullable,
      value: [...existing, ...additions],
    });
  }
  if (catalog.type !== "text") {
    throw new CompanyDataMutationError(
      "invalid_kind",
      "append is only available for text and list fields"
    );
  }
  if (change.key === "role_request") {
    return appendRoleRequest(current, change.value, change.section!);
  }
  return appendText(current, change.value, catalog.maxLength ?? 20_000);
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalizeComparable(nested)])
    );
  }
  return value ?? null;
}

function valuesEqual(left: unknown, right: unknown) {
  return (
    JSON.stringify(normalizeComparable(left)) ===
    JSON.stringify(normalizeComparable(right))
  );
}

function previewValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "(삭제)";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function formatCompanyDataValueForPreview(
  key: CompanyDataKey,
  value: unknown
) {
  if (key === "role_status" && value != null) {
    return humanizeOrgRoleStatus(value);
  }
  if (key === "role_work_mode" && value != null) {
    return humanizeOrgWorkMode(value);
  }
  if (key === "role_employment_types" && Array.isArray(value)) {
    return value.map(humanizeOrgEmploymentType).join(", ");
  }
  return previewValue(value);
}

function rewriteDiff(before: unknown, after: unknown) {
  if (typeof before !== "string" || typeof after !== "string") {
    return `- ${previewValue(before)}\n+ ${previewValue(after)}`;
  }
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] ===
      afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  return [
    ...removed.map((line) => `- ${line}`),
    ...added.map((line) => `+ ${line}`),
  ].join("\n");
}

function buildChangePreview(args: {
  before: unknown;
  change: CompanyDataChangeInput;
  final: unknown;
  label?: string;
}) {
  const label = companyDataDisplayLabel(args.change.key, args.label);
  if (args.change.kind === "append") {
    const section =
      args.change.section === "hard_constraints"
        ? " / 필수 조건"
        : args.change.section === "preferred_criteria"
          ? " / 우대 조건"
          : "";
    if (args.change.key === "role_request") {
      const bullet = requestBullet(args.change.value);
      const existing = asText(args.before);
      const hasCanonicalHeadings =
        existing.includes(HARD_HEADING) && existing.includes(PREFERRED_HEADING);
      if (hasCanonicalHeadings) {
        return `[추가] ${label}${section}\n+ ${bullet}`;
      }
      const wrapperLines = [
        HARD_HEADING,
        ...(args.change.section === "hard_constraints" ? [bullet] : []),
        PREFERRED_HEADING,
        ...(args.change.section === "preferred_criteria" ? [bullet] : []),
        ...(existing ? [LEGACY_HEADING] : []),
      ];
      return [
        `[추가] ${label}${section}`,
        ...wrapperLines.map((line) => `+ ${line}`),
        ...(existing
          ? ["  기존 자유 형식 기준은 Legacy section 아래에 원문 그대로 보존"]
          : []),
      ].join("\n");
    }
    const catalog = COMPANY_DATA_CATALOG[args.change.key];
    if (catalog.type === "string_list") {
      const before = Array.isArray(args.before) ? args.before : [];
      const final = Array.isArray(args.final) ? args.final : [];
      const additions = final.filter(
        (item) => !before.some((current) => valuesEqual(current, item))
      );
      return `[추가] ${label}${section}\n+ ${formatCompanyDataValueForPreview(
        args.change.key,
        additions
      )}`;
    }
    const addition = normalizeString(
      args.change.value,
      false,
      catalog.maxLength ?? 20_000
    )!;
    return [
      `[추가] ${label}${section}`,
      ...addition.split("\n").map((line) => `+ ${line}`),
    ].join("\n");
  }
  if (args.change.kind === "replace") {
    const replacement =
      args.change.value == null
        ? null
        : String(args.change.value).replaceAll("\u0000", "");
    return `[부분 수정] ${label}\n- ${formatCompanyDataValueForPreview(args.change.key, args.change.oldValue)}\n+ ${formatCompanyDataValueForPreview(args.change.key, replacement)}`;
  }
  return `[전체 수정] ${label}\n${
    typeof args.before === "string" && typeof args.final === "string"
      ? rewriteDiff(args.before, args.final)
      : `- ${formatCompanyDataValueForPreview(args.change.key, args.before)}\n+ ${formatCompanyDataValueForPreview(args.change.key, args.final)}`
  }`;
}

export function buildCompanyDataFinalDiffPreview(args: {
  after: unknown;
  before: unknown;
  key: CompanyDataKey;
  roleName?: string | null;
}) {
  const label = companyDataDisplayLabel(args.key, args.roleName);
  const diff =
    typeof args.before === "string" && typeof args.after === "string"
      ? rewriteDiff(args.before, args.after)
      : `- ${formatCompanyDataValueForPreview(args.key, args.before)}\n+ ${formatCompanyDataValueForPreview(args.key, args.after)}`;
  return `[최종 변경] ${label}\n${diff}`;
}

function snapshotAlreadyHasFinalValue(
  snapshot: CompanyDataSnapshotEntry,
  final: unknown
) {
  if (snapshot.expected_physical) {
    return Object.values(snapshot.expected_physical).every((value) =>
      valuesEqual(value, final)
    );
  }
  return valuesEqual(snapshot.value, final);
}

export function resolveCompanyDataMutation(args: {
  changes: CompanyDataChangeInput[];
  isComplete: (
    key: CompanyDataKey,
    roleId: string | null,
    currentValue: unknown
  ) => boolean;
  snapshot: CompanyDataSnapshot;
  summary: string;
}): ResolvedCompanyDataMutation {
  const finalByTarget = new Map<string, unknown>();
  const sourceChangeByTarget = new Map<string, CompanyDataChangeInput>();
  const previewByTarget = new Map<string, string[]>();

  for (const change of args.changes) {
    const target = companyDataTargetKey(change.key, change.roleId);
    const snapshot = args.snapshot.get(target);
    if (!snapshot) {
      throw new CompanyDataMutationError(
        "target_not_found",
        `Could not read current value for ${change.key}`
      );
    }
    const current = finalByTarget.has(target)
      ? finalByTarget.get(target)
      : snapshot.value;
    const catalog = COMPANY_DATA_CATALOG[change.key];
    if (
      change.kind === "rewrite" &&
      catalog.longText &&
      !args.isComplete(change.key, change.roleId, current)
    ) {
      throw new CompanyDataMutationError(
        "complete_read_required",
        `Read the complete current ${change.key} before rewriting it`
      );
    }
    const final = applyOperation(change, current);
    previewByTarget.set(target, [
      ...(previewByTarget.get(target) ?? []),
      buildChangePreview({
        before: current,
        change,
        final,
        label: snapshot.label,
      }),
    ]);
    finalByTarget.set(target, final);
    sourceChangeByTarget.set(target, change);
  }

  const start = args.snapshot.get(
    companyDataTargetKey("employee_count_start", null)
  );
  const end = args.snapshot.get(
    companyDataTargetKey("employee_count_end", null)
  );
  const finalStart = finalByTarget.has("employee_count_start:workspace")
    ? finalByTarget.get("employee_count_start:workspace")
    : start?.value;
  const finalEnd = finalByTarget.has("employee_count_end:workspace")
    ? finalByTarget.get("employee_count_end:workspace")
    : end?.value;
  if (
    typeof finalStart === "number" &&
    typeof finalEnd === "number" &&
    finalStart > finalEnd
  ) {
    throw new CompanyDataMutationError(
      "invalid_employee_range",
      "employee_count_start cannot be greater than employee_count_end"
    );
  }

  const resolved: ResolvedCompanyDataChange[] = [];
  for (const [target, value] of finalByTarget) {
    const source = sourceChangeByTarget.get(target)!;
    const snapshot = args.snapshot.get(target)!;
    if (snapshotAlreadyHasFinalValue(snapshot, value)) continue;
    resolved.push({
      ...(snapshot.expected_physical
        ? { expected_physical: snapshot.expected_physical }
        : { expected: snapshot.expected ?? snapshot.value ?? null }),
      key: source.key,
      preview: (previewByTarget.get(target) ?? []).join("\n\n"),
      role_id: source.roleId,
      value,
    });
  }

  const preview = resolved.map((change) => change.preview).join("\n\n");
  if (Array.from(preview).length > MAX_PREVIEW_LENGTH) {
    throw new CompanyDataMutationError(
      "smaller_operation_required",
      "The complete change preview is too long. Use smaller append/replace operations or the website editor."
    );
  }
  return {
    changes: resolved,
    confirmationRequired: args.changes.some(
      (change) => COMPANY_DATA_CATALOG[change.key].confirmationRequired
    ),
    preview,
    summary: args.summary,
  };
}

function resolvedChangeExpectedValue(change: ResolvedCompanyDataChange) {
  if (change.expected_physical) {
    return Object.prototype.hasOwnProperty.call(
      change.expected_physical,
      "workspace"
    )
      ? change.expected_physical.workspace
      : null;
  }
  return Object.prototype.hasOwnProperty.call(change, "expected")
    ? change.expected
    : null;
}

export function assertCompanyDataProposalSnapshotUnchanged(args: {
  changes: ResolvedCompanyDataChange[];
  snapshot: CompanyDataSnapshot;
}) {
  for (const change of args.changes) {
    const target = companyDataTargetKey(change.key, change.role_id);
    const current = args.snapshot.get(target);
    if (!current) {
      throw new CompanyDataMutationError(
        "stale_base_proposal",
        "The pending proposal target is no longer available"
      );
    }
    const unchanged = change.expected_physical
      ? valuesEqual(current.expected_physical, change.expected_physical)
      : valuesEqual(current.value, change.expected);
    if (!unchanged) {
      throw new CompanyDataMutationError(
        "stale_base_proposal",
        "The pending proposal is stale because its current data changed"
      );
    }
  }
}

function withOriginalProposalExpectation(args: {
  base: ResolvedCompanyDataChange;
  revised: ResolvedCompanyDataChange;
  roleName?: string | null;
}) {
  const {
    expected: _expected,
    expected_physical: _physical,
    ...revised
  } = args.revised;
  return {
    ...revised,
    ...(args.base.expected_physical
      ? { expected_physical: args.base.expected_physical }
      : { expected: args.base.expected ?? null }),
    preview: buildCompanyDataFinalDiffPreview({
      after: args.revised.value,
      before: resolvedChangeExpectedValue(args.base),
      key: args.revised.key,
      roleName: args.roleName,
    }),
  } satisfies ResolvedCompanyDataChange;
}

export function mergeCompanyDataProposalRevision(args: {
  baseChanges: ResolvedCompanyDataChange[];
  revisedChanges: ResolvedCompanyDataChange[];
  roleNamesById?: Record<string, string | null | undefined>;
}) {
  for (const change of args.baseChanges) {
    if (!singleLine(change.preview)) {
      throw new CompanyDataMutationError(
        "base_proposal_regeneration_required",
        "This older pending proposal cannot be revised safely; reject it and create a new proposal"
      );
    }
  }
  const baseByTarget = new Map(
    args.baseChanges.map((change) => [
      companyDataTargetKey(change.key, change.role_id),
      change,
    ])
  );
  const revisedTargets = new Set(
    args.revisedChanges.map((change) =>
      companyDataTargetKey(change.key, change.role_id)
    )
  );
  const inherited = args.baseChanges.filter(
    (change) =>
      !revisedTargets.has(companyDataTargetKey(change.key, change.role_id))
  );
  const revised = args.revisedChanges.map((change) => {
    const base = baseByTarget.get(
      companyDataTargetKey(change.key, change.role_id)
    );
    if (!base) return change;
    return withOriginalProposalExpectation({
      base,
      revised: change,
      roleName: change.role_id ? args.roleNamesById?.[change.role_id] : null,
    });
  });
  const changes = [...inherited, ...revised];
  const preview = changes.map((change) => change.preview).join("\n\n");
  if (Array.from(preview).length > MAX_PREVIEW_LENGTH) {
    throw new CompanyDataMutationError(
      "smaller_operation_required",
      "The revised proposal preview is too long; use smaller operations"
    );
  }
  const labels = Array.from(
    new Set(
      changes.map((change) =>
        companyDataDisplayLabel(
          change.key,
          change.role_id ? args.roleNamesById?.[change.role_id] : null
        )
      )
    )
  );
  const summary = `최종 변경: ${labels.join(", ")}`;
  if (Array.from(summary).length > MAX_SUMMARY_LENGTH) {
    throw new CompanyDataMutationError(
      "smaller_operation_required",
      "The revised proposal has too many or overly long target labels; revise fewer targets at once"
    );
  }
  return { changes, preview, summary };
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function splitList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(singleLine).filter(Boolean);
  }
  return typeof value === "string"
    ? value
        .split(/[\n,]+/g)
        .map(singleLine)
        .filter(Boolean)
    : [];
}

function jsonRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

export async function fetchCompanyDataSnapshot(args: {
  admin: OrgAgentAdminClient;
  changes: CompanyDataChangeInput[];
  workspaceId: string;
}): Promise<CompanyDataSnapshot> {
  const roleIds = Array.from(
    new Set(
      args.changes.flatMap((change) => (change.roleId ? [change.roleId] : []))
    )
  ).sort();
  const [workspaceResult, dataResult, rolesResult, memoriesResult] =
    await Promise.all([
      (args.admin.from("company_workspace" as any) as any)
        .select(
          "company_workspace_id, company_db_id, company_name, company_description, pitch, request, logo_url, homepage_url, career_url, linkedin_url"
        )
        .eq("company_workspace_id", args.workspaceId)
        .single(),
      (args.admin.from("company_data" as any) as any)
        .select(
          "total_funding_raised, main_investors, last_funding_stage, last_funding_round_description"
        )
        .eq("company_workspace_id", args.workspaceId)
        .maybeSingle(),
      roleIds.length
        ? (args.admin.from("company_roles" as any) as any)
            .select(
              "role_id, company_workspace_id, name, description, external_jd_url, location_text, status, work_mode, type, source_type, is_expired"
            )
            .eq("company_workspace_id", args.workspaceId)
            .eq("source_type", "internal")
            .eq("is_expired", false)
            .in("role_id", roleIds)
        : Promise.resolve({ data: [], error: null }),
      (args.admin.from("company_memories" as any) as any)
        .select("role_id, content")
        .eq("company_workspace_id", args.workspaceId)
        .or(
          roleIds.length
            ? `role_id.is.null,role_id.in.(${roleIds.join(",")})`
            : "role_id.is.null"
        ),
    ]);
  for (const result of [
    workspaceResult,
    dataResult,
    rolesResult,
    memoriesResult,
  ]) {
    if (result.error) throw result.error;
  }
  const workspace = workspaceResult.data as Record<string, unknown>;
  const companyData = (dataResult.data as Record<string, unknown> | null) ?? {};
  const roles = (rolesResult.data ?? []) as Record<string, unknown>[];
  if (roles.length !== roleIds.length) {
    throw new CompanyDataMutationError(
      "role_not_found",
      "A role was not found as an active internal role in this workspace"
    );
  }

  const companyDbId = numberOrNull(workspace.company_db_id);
  const companyDbResult = companyDbId
    ? await (args.admin.from("company_db" as any) as any)
        .select(
          "name, description, logo, website_url, linkedin_url, short_description, funding_url, location, founded_year, employee_count_range, specialities, investors, related_links"
        )
        .eq("id", companyDbId)
        .maybeSingle()
    : { data: null, error: null };
  if (companyDbResult.error) throw companyDbResult.error;
  const companyDb =
    (companyDbResult.data as Record<string, unknown> | null) ?? {};

  const internalResult = roleIds.length
    ? await (args.admin.from("company_internal_roles" as any) as any)
        .select("role_id, request")
        .in("role_id", roleIds)
    : { data: [], error: null };
  if (internalResult.error) throw internalResult.error;
  const internalByRole = new Map(
    ((internalResult.data ?? []) as Record<string, unknown>[]).map((row) => [
      singleLine(row.role_id),
      row,
    ])
  );
  if (internalByRole.size !== roleIds.length) {
    throw new CompanyDataMutationError(
      "role_not_found",
      "Canonical internal role data is missing"
    );
  }
  const memoryByRole = new Map(
    ((memoriesResult.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.role_id == null ? "workspace" : singleLine(row.role_id),
      row.content,
    ])
  );

  const range = jsonRecord(companyDb.employee_count_range);
  const snapshot: CompanyDataSnapshot = new Map();
  const setWorkspace = (
    key: CompanyDataKey,
    value: unknown,
    expectedPhysical?: Record<string, unknown>
  ) => {
    snapshot.set(companyDataTargetKey(key, null), {
      ...(expectedPhysical
        ? { expected_physical: expectedPhysical }
        : { expected: value ?? null }),
      value,
    });
  };
  setWorkspace("company_name", workspace.company_name ?? null, {
    company_db: companyDb.name ?? null,
    workspace: workspace.company_name ?? null,
  });
  setWorkspace("company_description", workspace.company_description ?? null, {
    company_db: companyDb.description ?? null,
    workspace: workspace.company_description ?? null,
  });
  setWorkspace("pitch", workspace.pitch ?? null);
  setWorkspace("workspace_request", workspace.request ?? null);
  setWorkspace("logo_url", workspace.logo_url ?? null, {
    company_db: companyDb.logo ?? null,
    workspace: workspace.logo_url ?? null,
  });
  setWorkspace("homepage_url", workspace.homepage_url ?? null, {
    company_db: companyDb.website_url ?? null,
    workspace: workspace.homepage_url ?? null,
  });
  setWorkspace("career_url", workspace.career_url ?? null);
  setWorkspace("linkedin_url", workspace.linkedin_url ?? null, {
    company_db: companyDb.linkedin_url ?? null,
    workspace: workspace.linkedin_url ?? null,
  });
  setWorkspace("short_description", companyDb.short_description ?? null);
  setWorkspace("funding_url", companyDb.funding_url ?? null);
  setWorkspace("location", companyDb.location ?? null);
  setWorkspace("founded_year", numberOrNull(companyDb.founded_year));
  setWorkspace("employee_count_start", numberOrNull(range.start));
  setWorkspace("employee_count_end", numberOrNull(range.end));
  setWorkspace("specialities", splitList(companyDb.specialities));
  setWorkspace("investors", splitList(companyDb.investors));
  const storedRelatedLinks = splitList(companyDb.related_links);
  const consolidatedRelatedLinks = Array.from(
    new Set(
      [
        singleLine(workspace.career_url),
        singleLine(companyDb.funding_url),
        ...storedRelatedLinks,
      ].filter(Boolean)
    )
  ).slice(0, COMPANY_DATA_CATALOG.related_links.maxItems ?? 12);
  snapshot.set(companyDataTargetKey("related_links", null), {
    expected: storedRelatedLinks,
    value: consolidatedRelatedLinks,
  });
  setWorkspace(
    "total_funding_raised",
    companyData.total_funding_raised ?? null
  );
  setWorkspace("main_investors", companyData.main_investors ?? null);
  setWorkspace("last_funding_stage", companyData.last_funding_stage ?? null);
  setWorkspace(
    "last_funding_round_description",
    companyData.last_funding_round_description ?? null
  );
  setWorkspace("workspace_memory", memoryByRole.get("workspace") ?? null);

  for (const role of roles) {
    const roleId = singleLine(role.role_id);
    const internal = internalByRole.get(roleId)!;
    const values: Partial<Record<CompanyDataKey, unknown>> = {
      role_name: role.name,
      role_description: role.description ?? null,
      role_external_jd_url: role.external_jd_url ?? null,
      role_location: role.location_text ?? null,
      role_status: role.status,
      role_work_mode: role.work_mode ?? null,
      role_employment_types: Array.isArray(role.type) ? role.type : [],
      role_request: internal.request ?? null,
      role_memory: memoryByRole.get(roleId) ?? null,
    };
    for (const [key, value] of Object.entries(values)) {
      snapshot.set(companyDataTargetKey(key as CompanyDataKey, roleId), {
        expected: value ?? null,
        label: singleLine(role.name),
        value,
      });
    }
  }
  return snapshot;
}

export function buildCompanyAgentEventContent(args: {
  actorLabel: string;
  summary: string;
}) {
  const actor =
    singleLine(args.actorLabel).replaceAll("·", " ").slice(0, 40) ||
    "회사 사용자";
  const summary = singleLine(args.summary);
  return `${actor} · ${summary}`.slice(0, 300);
}
