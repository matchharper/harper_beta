import { isRequired, withLevel, type RoleStartBrief, type RoleStartHardCondition } from "./brief";

/**
 * When few people meet the Brief: the conditions the company set (location,
 * years, work arrangement, required criteria) that would add the most candidates
 * if loosened one step, told only as "a lot" or "a little" — never counts,
 * shares or internal steps — with the loosening each button applies.
 */
export type ThinBand = "big" | "small";

export type ThinCondition = { id: string; label: string; band: ThinBand; widen: string };

export type Relaxation = { id: string; label: string; widen: string; apply: (brief: RoleStartBrief) => RoleStartBrief };

function replaceCondition(brief: RoleStartBrief, id: string, next: RoleStartHardCondition | null): RoleStartBrief {
  return {
    ...brief,
    hardConditions: next
      ? brief.hardConditions.map((item) => (item.id === id ? next : item))
      : brief.hardConditions.filter((item) => item.id !== id),
  };
}

function withYears(label: string, years: number) {
  return /\d+(\.\d+)?년/.test(label) ? label.replace(/\d+(\.\d+)?년/, `${years}년`) : `${label} (${years}년)`;
}

/** One-step loosening of a hard condition (null: it cannot be loosened). */
export function relaxCondition(condition: RoleStartHardCondition): Relaxation | null {
  const make = (widen: string, next: RoleStartHardCondition | null): Relaxation => ({
    id: condition.id,
    label: condition.label,
    widen,
    apply: (brief) => replaceCondition(brief, condition.id, next),
  });
  switch (condition.kind) {
    case "min_years": {
      const years = Math.floor(condition.years) - 1;
      return years >= 1
        ? make(`${years}년 이상으로 낮추기`, { ...condition, years, label: withYears(condition.label, years) })
        : make("연차 조건 빼기", null);
    }
    case "max_years": {
      const years = Math.ceil(condition.years) + 2;
      return make(`${years}년 이하로 늘리기`, { ...condition, years, label: withYears(condition.label, years) });
    }
    case "location":
      if (condition.cities.length) {
        return make("같은 나라 어디서든 가능하게 넓히기", { ...condition, cities: [], label: `${condition.label} (지역 무관)` });
      }
      return condition.allowRelocation
        ? make("지역 조건 빼기", null)
        : make("이주할 수 있는 분도 포함하기", { ...condition, allowRelocation: true, label: `${condition.label} (이주 가능 포함)` });
    case "remote_ok":
      return make("다른 근무 형태도 허용하기", null);
    default:
      return null;
  }
}

/** Every one-step loosening the company could choose: hard conditions, and 필수 → 중요 (no longer filters). */
export function relaxations(brief: RoleStartBrief): Relaxation[] {
  return [
    ...brief.hardConditions.flatMap((condition) => {
      const relaxation = relaxCondition(condition);
      return relaxation ? [relaxation] : [];
    }),
    ...brief.criteria
      .filter((criterion) => isRequired(criterion))
      .map((criterion) => ({
        id: criterion.id ?? criterion.name,
        label: criterion.name,
        widen: "필수 조건에서 평가 기준(중요)으로 옮기기",
        apply: (current: RoleStartBrief) => ({
          ...current,
          criteria: current.criteria.map((item) =>
            (item.id ?? item.name) === (criterion.id ?? criterion.name) ? withLevel(item, "important") : item
          ),
        }),
      })),
  ];
}

/**
 * Up to two loosenings that add the most candidates. `passingWith` counts
 * candidates passing a Brief within the same pool; only "a lot" (at least as
 * many again as pass now) or "a little" leaves the server.
 */
export function thinConditions(brief: RoleStartBrief, passingWith: (brief: RoleStartBrief) => number): ThinCondition[] {
  const now = passingWith(brief);
  return relaxations(brief)
    .map((relaxation) => ({ relaxation, gain: passingWith(relaxation.apply(brief)) - now }))
    .filter((item) => item.gain > 0)
    .sort((left, right) => right.gain - left.gain)
    .slice(0, 2)
    .map(({ relaxation, gain }) => ({
      id: relaxation.id,
      label: relaxation.label,
      band: gain >= Math.max(1, now) ? ("big" as const) : ("small" as const),
      widen: relaxation.widen,
    }));
}

/** Stored notice (server timings) → the conditions shown; never carries counts. */
export function parseThinConditions(value: unknown): ThinCondition[] {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed)
      ? parsed.flatMap((item) =>
          item && typeof item.id === "string" && typeof item.label === "string" && typeof item.widen === "string"
            ? [{ id: item.id, label: item.label, band: item.band === "big" ? "big" : "small", widen: item.widen }]
            : []
        )
      : [];
  } catch {
    return [];
  }
}

/** The notice as plain text (Slack): same words as the web, no buttons. */
export function thinNoticeText(conditions: ThinCondition[]) {
  return [
    "지금 조건에 맞는 분이 많지 않아요. 조건을 조금 넓혀 볼까요?",
    ...conditions.map(
      (condition) => `• '${condition.label}': ${condition.band === "big" ? "풀면 후보가 크게 늘어요" : "풀면 후보가 조금 늘어요"}`
    ),
  ].join("\n");
}
