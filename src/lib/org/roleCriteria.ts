export const ORG_ROLE_CRITERIA_MIN_ITEMS = 0;
export const ORG_ROLE_CRITERIA_RECOMMENDED_MIN_ITEMS = 2;

export type OrgRoleCriterionRequirement = "must" | "preferred";

export type OrgRoleCriterionGrade = "excellent" | "good" | "uncertain" | "bad";

/** How the fast path measures a criterion: SQL/rules, section similarity, or a judgment left to the verdict LLM. */
export type OrgRoleCriterionKind = "rule" | "similarity" | "judgment";

export type OrgRoleCriterion = {
  criteria: string;
  name: string;
  // Structured Brief fields. Older rows only have name/criteria; readers treat
  // a missing requirement as preferred and missing signals as unspecified.
  id?: string;
  requirement?: OrgRoleCriterionRequirement;
  /** 1 있으면 좋음 / 2 중요 for a preferred criterion; must is 필수 (3). See criterionLevel. */
  importance?: number;
  kind?: OrgRoleCriterionKind;
  signals?: Partial<Record<OrgRoleCriterionGrade, string>>;
  changeReason?: string;
  changedAt?: string;
};

/**
 * How much a criterion matters, left to right on screen: 있으면 좋음 · 중요 · 필수.
 * Only 필수 keeps people out; ranking weights are 1 / 2 / 3. Stored as
 * requirement "must" (필수) or "preferred" + importance 1 / 2, so older
 * criteria read must → 필수 and preferred → 중요.
 */
export type OrgRoleCriterionLevel = "nice" | "important" | "required";

export const ORG_ROLE_CRITERION_LEVELS: Array<{ level: OrgRoleCriterionLevel; ko: string; en: string; weight: number }> = [
  { level: "nice", ko: "있으면 좋음", en: "Nice to have", weight: 1 },
  { level: "important", ko: "중요", en: "Important", weight: 2 },
  { level: "required", ko: "필수", en: "Required", weight: 3 },
];

export function criterionLevel(criterion: { importance?: number | null; requirement?: string | null }): OrgRoleCriterionLevel {
  if (criterion.requirement === "must") return "required";
  return Number(criterion.importance) === 1 ? "nice" : "important";
}

export function criterionLevelFields(level: OrgRoleCriterionLevel) {
  return {
    requirement: (level === "required" ? "must" : "preferred") as OrgRoleCriterionRequirement,
    importance: ORG_ROLE_CRITERION_LEVELS.find((item) => item.level === level)!.weight,
  };
}

export type OrgRoleCriteriaEdit = {
  criteria?: string;
  name?: string;
  operation: "add" | "delete" | "update";
  targetName?: string;
};

export type OrgRoleCriteriaEditResult = {
  counts: {
    added: number;
    deleted: number;
    updated: number;
  };
  criteria: OrgRoleCriterion[];
};

function text(value: unknown) {
  return String(value ?? "")
    .replaceAll("\u0000", "")
    .trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function has(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

const GRADES: OrgRoleCriterionGrade[] = ["excellent", "good", "uncertain", "bad"];

function structuredFields(source: Record<string, unknown>) {
  const fields: Partial<OrgRoleCriterion> = {};
  const id = text(source.id);
  if (id) fields.id = id.slice(0, 80);
  if (source.requirement === "must" || source.requirement === "preferred") {
    fields.requirement = source.requirement;
  }
  const importance = Number(source.importance);
  if (importance === 1 || importance === 2 || importance === 3) {
    fields.importance = importance;
  }
  if (
    source.kind === "rule" ||
    source.kind === "similarity" ||
    source.kind === "judgment"
  ) {
    fields.kind = source.kind;
  }
  const signalSource = record(source.signals);
  const signals = Object.fromEntries(
    GRADES.flatMap((grade) => {
      const value = text(signalSource[grade]).slice(0, 2_000);
      return value ? [[grade, value]] : [];
    })
  );
  if (Object.keys(signals).length) fields.signals = signals;
  const changeReason = text(source.changeReason).slice(0, 1_000);
  if (changeReason) fields.changeReason = changeReason;
  const changedAt = text(source.changedAt);
  if (changedAt && !Number.isNaN(Date.parse(changedAt))) {
    fields.changedAt = changedAt;
  }
  return fields;
}

export function normalizeOrgRoleCriteria(value: unknown): OrgRoleCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = record(item);
    return {
      criteria: text(source.criteria),
      name: text(source.name),
      ...structuredFields(source),
    };
  });
}

export function getOrgRoleCriteriaValidationError(value: unknown) {
  if (!Array.isArray(value)) {
    return "평가 기준은 목록 형태여야 합니다.";
  }

  const criteria = normalizeOrgRoleCriteria(value);
  if (criteria.some((item) => !item.name || !item.criteria)) {
    return "각 평가 기준의 이름과 상세 내용을 모두 작성해 주세요.";
  }
  return null;
}

export function parseOrgRoleCriteria(value: unknown): OrgRoleCriterion[] {
  const error = getOrgRoleCriteriaValidationError(value);
  if (error) throw new Error(error);
  return normalizeOrgRoleCriteria(value);
}

/**
 * Applies name-addressed edits in order and validates the final structured list.
 * Names are intentionally exact: stored criteria do not have stable item IDs,
 * so fuzzy matching could mutate the wrong evaluation dimension.
 */
export function applyOrgRoleCriteriaEdits(
  currentValue: unknown,
  editsValue: unknown
): OrgRoleCriteriaEditResult {
  if (!Array.isArray(editsValue) || editsValue.length < 1) {
    throw new Error("평가 기준 변경은 한 개 이상이어야 합니다.");
  }

  const criteria = normalizeOrgRoleCriteria(currentValue);
  const counts = { added: 0, deleted: 0, updated: 0 };

  const findTargetIndex = (targetName: string) => {
    const matches = criteria.flatMap((item, index) =>
      item.name === targetName ? [index] : []
    );
    if (matches.length === 0) {
      throw new Error(`평가 기준을 찾을 수 없습니다: ${targetName}`);
    }
    if (matches.length > 1) {
      throw new Error(
        `같은 이름의 평가 기준이 여러 개라 대상을 고를 수 없습니다: ${targetName}`
      );
    }
    return matches[0]!;
  };

  const assertUniqueName = (name: string, exceptIndex?: number) => {
    if (
      criteria.some(
        (item, index) => item.name === name && index !== exceptIndex
      )
    ) {
      throw new Error(`같은 이름의 평가 기준이 이미 있습니다: ${name}`);
    }
  };

  for (const rawEdit of editsValue) {
    const edit = record(rawEdit);
    const operation = text(edit.operation);
    if (
      operation !== "add" &&
      operation !== "update" &&
      operation !== "delete"
    ) {
      throw new Error("operation은 add, update, delete 중 하나여야 합니다.");
    }

    const targetName = text(edit.targetName);
    const name = text(edit.name);
    const detail = text(edit.criteria);

    if (operation === "add") {
      if (!name || !detail) {
        throw new Error("add에는 name과 criteria가 모두 필요합니다.");
      }
      if (targetName) {
        throw new Error("add에는 targetName을 사용할 수 없습니다.");
      }
      assertUniqueName(name);
      criteria.push({ criteria: detail, name });
      counts.added += 1;
      continue;
    }

    if (!targetName) {
      throw new Error(`${operation}에는 targetName이 필요합니다.`);
    }
    const targetIndex = findTargetIndex(targetName);

    if (operation === "delete") {
      if (has(edit, "name") || has(edit, "criteria")) {
        throw new Error("delete에는 name이나 criteria를 사용할 수 없습니다.");
      }
      criteria.splice(targetIndex, 1);
      counts.deleted += 1;
      continue;
    }

    if (!has(edit, "name") && !has(edit, "criteria")) {
      throw new Error("update에는 name이나 criteria 중 하나가 필요합니다.");
    }
    if (has(edit, "name") && !name) {
      throw new Error("평가 기준 이름은 비워둘 수 없습니다.");
    }
    if (has(edit, "criteria") && !detail) {
      throw new Error("평가 기준 상세 내용은 비워둘 수 없습니다.");
    }
    const nextName = has(edit, "name") ? name : criteria[targetIndex]!.name;
    const nextDetail = has(edit, "criteria")
      ? detail
      : criteria[targetIndex]!.criteria;
    assertUniqueName(nextName, targetIndex);
    criteria[targetIndex] = {
      ...criteria[targetIndex]!,
      criteria: nextDetail,
      name: nextName,
    };
    counts.updated += 1;
  }

  return { counts, criteria: parseOrgRoleCriteria(criteria) };
}

export function hasCompleteOrgRoleCriteria(value: unknown) {
  return getOrgRoleCriteriaValidationError(value) === null;
}
