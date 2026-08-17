export const ORG_ROLE_CRITERIA_MIN_ITEMS = 0;
export const ORG_ROLE_CRITERIA_RECOMMENDED_MIN_ITEMS = 2;
export const ORG_ROLE_CRITERIA_MAX_ITEMS = 6;

export type OrgRoleCriterion = {
  criteria: string;
  name: string;
};

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

export function normalizeOrgRoleCriteria(value: unknown): OrgRoleCriterion[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const source = record(item);
    return {
      criteria: text(source.criteria),
      name: text(source.name),
    };
  });
}

export function getOrgRoleCriteriaValidationError(value: unknown) {
  if (!Array.isArray(value)) {
    return "평가 기준은 목록 형태여야 합니다.";
  }
  if (
    value.length < ORG_ROLE_CRITERIA_MIN_ITEMS ||
    value.length > ORG_ROLE_CRITERIA_MAX_ITEMS
  ) {
    return `평가 기준은 ${ORG_ROLE_CRITERIA_MIN_ITEMS}개 이상 ${ORG_ROLE_CRITERIA_MAX_ITEMS}개 이하로 작성해 주세요.`;
  }

  const criteria = normalizeOrgRoleCriteria(value);
  if (criteria.some((item) => !item.name || !item.criteria)) {
    return "각 평가 기준의 이름과 상세 내용을 모두 작성해 주세요.";
  }
  if (criteria.some((item) => item.name.length > 200)) {
    return "평가 기준 이름은 200자 이하로 작성해 주세요.";
  }
  if (criteria.some((item) => item.criteria.length > 8_000)) {
    return "평가 기준 상세 내용은 항목당 8,000자 이하로 작성해 주세요.";
  }
  return null;
}

export function parseOrgRoleCriteria(value: unknown): OrgRoleCriterion[] {
  const error = getOrgRoleCriteriaValidationError(value);
  if (error) throw new Error(error);
  return normalizeOrgRoleCriteria(value);
}

/**
 * Applies name-addressed edits in order and validates the final 0-6 item list.
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
  if (editsValue.length > 6) {
    throw new Error("평가 기준 변경은 한 번에 6개 이하로 작성해 주세요.");
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
    criteria[targetIndex] = { criteria: nextDetail, name: nextName };
    counts.updated += 1;
  }

  return { counts, criteria: parseOrgRoleCriteria(criteria) };
}

export function hasCompleteOrgRoleCriteria(value: unknown) {
  return getOrgRoleCriteriaValidationError(value) === null;
}
