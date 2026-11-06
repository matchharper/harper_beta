import {
  ALL_COMPANY_TERMS,
  COMPANY_TERMS,
  type CompanyStageId,
  withKoreanRo,
} from "@/lib/org/terms";

/**
 * Stored progress records keep the words they were written with. Companies and
 * Harper read the system-written ones through these helpers, so older records
 * use the current names too (the stored text itself is never rewritten).
 * User-written records (notes, activity) are returned as stored.
 */

/** Stage labels older records were written with, before the names in terms.ts. */
const LEGACY_STAGE_LABELS: Readonly<Record<string, CompanyStageId>> = {
  수락: "accepted",
  "수락 후 대기": "accepted",
  "연결 대기": "pending_connection",
};

const STAGE_BY_LABEL: ReadonlyMap<string, CompanyStageId> = new Map([
  ...Object.entries(LEGACY_STAGE_LABELS),
  ...Object.entries(COMPANY_TERMS.stage).flatMap(([stage, value]) =>
    [value.ko, ...value.former].map((label) => [label, stage as CompanyStageId] as const)
  ),
]);

/** A built-in stage label, old or current, as it is called now; a company's own stage name is kept. */
export function currentStageLabel(label: string) {
  const stage = STAGE_BY_LABEL.get(label.trim());
  return stage ? COMPANY_TERMS.stage[stage].ko : label.trim();
}

/** "A에서 B로 옮겼습니다", "B로 옮기고 …", "B로 표시했습니다" with current stage names. */
function currentStageChangeText(text: string) {
  const moved = text.match(/^(.+?)에서 (.+?)(?:으로|로) (옮겼습니다|옮기고)/);
  if (moved) {
    const [whole, from, to, verb] = moved;
    return `${currentStageLabel(from)}에서 ${withKoreanRo(currentStageLabel(to))} ${verb}${text.slice(whole.length)}`;
  }
  const marked = text.match(/^(.+?)(?:으로|로) (옮겼습니다|옮기고|표시했습니다)/);
  if (marked) {
    const [whole, to, verb] = marked;
    return `${withKoreanRo(currentStageLabel(to))} ${verb}${text.slice(whole.length)}`;
  }
  return text;
}

const KOREAN_FORMERS = ALL_COMPANY_TERMS.flatMap((value) =>
  value.former.filter((former) => /[가-힣]/.test(former)).map((former) => [former, value.ko] as const)
).sort((left, right) => right[0].length - left[0].length);

const PARTICLES: ReadonlyArray<readonly [string, string]> = [
  ["으로", "로"], ["이에요", "예요"], ["이라", "라"], ["이나", "나"],
  ["은", "는"], ["이", "가"], ["을", "를"], ["과", "와"],
];

function particleAfter(name: string, particle: string) {
  const last = name.charCodeAt(name.length - 1);
  const final = last >= 0xac00 && last <= 0xd7a3 ? (last - 0xac00) % 28 : 0;
  const pair = PARTICLES.find(([withFinal, without]) => particle === withFinal || particle === without);
  if (!pair) return particle;
  if (pair[0] === "으로") return final === 0 || final === 8 ? "로" : "으로";
  return final === 0 ? pair[1] : pair[0];
}

/** Former Korean names in a system sentence, replaced with current ones (particles follow). */
export function currentCompanyNames(text: string) {
  let result = text;
  for (const [former, current] of KOREAN_FORMERS) {
    const escaped = former.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`(?<!내부:)${escaped}([’”)]*)(으로|로|이에요|예요|이라|라|이나|나|은|는|이|가|을|를|과|와)?(?![가-힣])`, "g"),
      (_match, close: string, particle?: string) =>
        `${current}${close}${particle ? particleAfter(current, particle) : ""}`
    );
  }
  return result;
}

/** Records people write themselves; their words are theirs. */
const USER_WRITTEN_KINDS = new Set(["org_note", "memo", "manual_note", "org_candidate_activity"]);

/** The company-facing text of a stored progress record, with current names. */
export function companyProgressText(kind: string | null | undefined, text: string | null | undefined) {
  const stored = text ?? "";
  if (!stored || (kind && USER_WRITTEN_KINDS.has(kind))) return stored;
  const named = kind === "org_stage_change" ? currentStageChangeText(stored) : stored;
  return currentCompanyNames(named).replace("warm intro를 요청했습니다", "소개 메일을 요청했습니다");
}
