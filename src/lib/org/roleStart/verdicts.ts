import { formatPromptText } from "@/lib/llm/promptText";
import "server-only";

import type { OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import { isRequired, levelLabel, levelOf, ROLE_START_GRADES, type RoleStartBrief, type RoleStartProbe } from "./brief";
import { callRoleStartJson, ROLE_START_VERDICT_MODEL, type RoleStartLlmUsage } from "./llm";
import type { RoleStartProfile } from "./profiles";
import { distinctChips, fillChips, MIN_CHIPS } from "./chipGuard";
import { buildVerdictSchema, buildVerdictSystemPrompt } from "./prompts";
import type { RoleStartReasonChip, RoleStartReasonKind, RoleStartVerdict } from "./session";

export type RawVerdict = {
  tldr: string;
  finalFit: RoleStartVerdict["finalFit"];
  criteria: Array<{ criterionId: string; topic?: string; fitness: OrgRoleCriterionGrade; evidence: string }>;
  companyQuestion: { question: string; options: string[] } | null;
  outsideReasons?: Array<{ label: string; evidence: string }>;
  reasonChips: Array<{
    criterionId: string;
    kind: RoleStartReasonKind;
    label: string;
    evidence: string;
    appliesTo: Array<"uncertain" | "bad">;
  }>;
};

/** 필수 criteria first, as their own group; the rest carry 중요 / 있으면 좋음. */
function orderedCriteria(brief: RoleStartBrief) {
  return [...brief.criteria].sort((left, right) => Number(isRequired(right)) - Number(isRequired(left)));
}

export function briefForPrompt(brief: RoleStartBrief) {
  return {
    summary: brief.summary,
    hardConditions: brief.hardConditions.map((condition) => condition.label),
    otherNotes: brief.otherNotes ?? [],
    criteria: orderedCriteria(brief).map((criterion) => ({
      name: criterion.name,
      importance: levelLabel(levelOf(criterion)),
      criteria: criterion.criteria,
      signals: criterion.signals ?? {},
    })),
  };
}

/** The Brief as the verdict reads it: criteria carry the ids the answer must use. */
export function verdictBrief(brief: RoleStartBrief) {
  const base = briefForPrompt(brief);
  return {
    ...base,
    hardConditions: brief.hardConditions.map((condition) => ({ conditionId: condition.id, label: condition.label })),
    criteria: base.criteria.map((criterion, index) => ({
      criterionId: criterionKey(orderedCriteria(brief)[index]!),
      ...criterion,
    })),
  };
}

function criterionKey(criterion: RoleStartBrief["criteria"][number]) {
  return criterion.id ?? criterion.name;
}

/** One verdict call per candidate. Grades come from the model; selection never does. */
export async function writeVerdict(args: {
  roleName: string;
  brief: RoleStartBrief;
  profile: RoleStartProfile;
  probe: RoleStartProbe | null;
  signal?: AbortSignal;
}): Promise<{ verdict: RoleStartVerdict; usage: RoleStartLlmUsage }> {
  const { data, usage } = await callRoleStartJson<RawVerdict>({
    label: "verdict",
    model: ROLE_START_VERDICT_MODEL,
    reasoningEffort: "low",
    schema: buildVerdictSchema(
      [...new Set(args.brief.criteria.map(criterionKey))],
      args.brief.hardConditions.map((condition) => condition.id)
    ),
    signal: args.signal,
    system: buildVerdictSystemPrompt(),
    user: `<ROLE>${args.roleName}</ROLE>
<BRIEF>
${formatPromptText(verdictBrief(args.brief))}
</BRIEF>
${args.probe ? `<WHY_INCLUDED>${args.probe.label}</WHY_INCLUDED>\n` : ""}<CANDIDATE_PROFILE>
${args.profile.document}
</CANDIDATE_PROFILE>`,
  });
  const verdict = verdictFromRaw(data, args.brief);
  // The question about this person is answered with 4-5 options like every other.
  if (verdict.companyQuestion && verdict.companyQuestion.options.length < MIN_CHIPS) {
    const filled = await fillChips({
      question: verdict.companyQuestion.question,
      chips: verdict.companyQuestion.options,
      context: verdict.tldr,
      signal: args.signal,
    }).catch(() => null);
    if (filled) {
      verdict.companyQuestion = { ...verdict.companyQuestion, options: filled.chips };
      if (filled.usage) {
        usage.inputTokens += filled.usage.inputTokens;
        usage.outputTokens += filled.usage.outputTokens;
        usage.usd = usage.usd === null || filled.usage.usd === null ? usage.usd : usage.usd + filled.usage.usd;
      }
    }
  }
  return { verdict, usage };
}

/** The model's answer mapped onto the Brief by criterion id; a criterion it left out reads as open. */
export function verdictFromRaw(data: RawVerdict, brief: RoleStartBrief): RoleStartVerdict {
  const criteria = brief.criteria.map((criterion) => {
    const found = data.criteria.find((item) => item.criterionId === criterionKey(criterion));
    if (!found) console.warn("[role-start] verdict left out a criterion", { criterionId: criterionKey(criterion) });
    return {
      criterionId: criterion.id ?? criterion.name,
      name: criterion.name,
      topic: chipTopic(found?.topic, criterion),
      fitness: found && ROLE_START_GRADES.includes(found.fitness) ? found.fitness : ("uncertain" as const),
      evidence: found?.evidence?.trim() || "프로필에서 확인할 수 있는 내용이 부족해요.",
    };
  });
  const seen = new Set<string>();
  const reasons: RoleStartReasonChip[] = data.reasonChips.flatMap((item, index) => {
    const appliesTo = [...reasonChipFit(item.label, item.kind, item.appliesTo.filter((value) => value === "uncertain" || value === "bad")).appliesTo];
    const condition = conditionOfChip(item, brief);
    const criterion = condition ? null : brief.criteria.find((entry) => criterionKey(entry) === item.criterionId);
    if (!condition && !criterion) return [];
    // A gap chip on a criterion this read found a fit would contradict the read itself.
    const read = criterion ? criteria.find((entry) => entry.criterionId === (criterion.id ?? criterion.name)) : null;
    if (read && (read.fitness === "good" || read.fitness === "excellent") && appliesTo.includes("bad")) {
      appliesTo.splice(appliesTo.indexOf("bad"), 1);
      if (!appliesTo.length) return [];
    }
    const topic = condition
      ? condition.label
      : criteria.find((entry) => entry.criterionId === (criterion!.id ?? criterion!.name))?.topic ?? criterion!.name;
    const label = condition ? conditionChipLabel(item.label, condition.label) : reasonChipLabel(item.label, topic, appliesTo);
    if (!label || seen.has(label) || !appliesTo.length) return [];
    seen.add(label);
    return [
      {
        id: `v${index}`,
        criterionId: condition ? condition.id : criterion!.id ?? criterion!.name,
        kind: item.kind,
        label,
        evidence: item.evidence.trim().slice(0, 400) || null,
        appliesTo,
        source: "verdict" as const,
        ...(condition ? { scope: "condition" as const } : {}),
      },
    ];
  });
  // "맞지 않음" offers the team its likely reasons when the model gave fewer
  // than two: only criteria this person was read as uncertain or bad on,
  // never one read as a fit. With none, the team writes its own reason.
  const weakest = [...criteria]
    .filter((item) => item.fitness === "uncertain" || item.fitness === "bad")
    .sort((left, right) => FIT_ORDER[left.fitness] - FIT_ORDER[right.fitness]);
  for (const item of weakest) {
    if (reasons.filter((chip) => chip.appliesTo.includes("bad")).length >= MIN_GAP_CHIPS) break;
    if (reasons.some((chip) => chip.criterionId === item.criterionId && chip.appliesTo.includes("bad"))) continue;
    const label = reasonChipLabel("", item.topic ?? item.name, ["bad"]);
    if (seen.has(label)) continue;
    seen.add(label);
    reasons.push({
      id: `g${reasons.length}`,
      criterionId: item.criterionId,
      kind: item.fitness === "bad" ? "mismatch" : "other",
      label,
      evidence: item.evidence,
      appliesTo: ["bad"],
      source: "verdict",
    });
  }
  // With no gap on any criterion, "맞지 않음" offers reasons the Brief does
  // not cover (industry, role direction), read from the same verdict.
  if (!reasons.some((chip) => chip.appliesTo.includes("bad"))) {
    for (const [index, item] of (data.outsideReasons ?? []).slice(0, 2).entries()) {
      const label = item.label.trim().replace(/\s+/g, " ");
      if (!label || label.length > REASON_CHIP_LABEL_MAX || CHIP_NOTE_WORDS.test(label) || PERSONAL_WORDS.test(label) || seen.has(label)) continue;
      seen.add(label);
      const condition = conditionOfChip({ criterionId: "", label }, brief);
      reasons.push({
        id: `o${index}`,
        criterionId: condition ? condition.id : "outside",
        kind: "other",
        label,
        evidence: item.evidence.trim().slice(0, 400) || null,
        appliesTo: ["bad"],
        source: "verdict",
        scope: condition ? "condition" : "outside",
      });
    }
  }
  return {
    reasonChips: reasons,
    tldr: data.tldr.trim(),
    finalFit: data.finalFit,
    criteria,
    companyQuestion:
      data.companyQuestion && data.companyQuestion.question.trim()
        ? {
            question: data.companyQuestion.question.trim(),
            options: distinctChips(data.companyQuestion.options),
          }
        : null,
  };
}

const MIN_GAP_CHIPS = 2;
const FIT_ORDER: Record<string, number> = { bad: 0, uncertain: 1, good: 2, excellent: 3 };

/** A chip is read in one glance: about this long at most (Korean characters). */
export const REASON_CHIP_LABEL_MAX = 14;

/** Words that make a chip read as Harper's note rather than the team's reason. */
const CHIP_NOTE_WORDS = /근거|정보 ?부족|확인|범위|미기재|미확인|볼지|할지|인정|에 대해|\?/;

/** A chip about something the profile does not show only explains "정보가 부족해요". */
export function reasonChipFit(label: string, kind: string, appliesTo: Array<"uncertain" | "bad">) {
  const open = kind === "missing_info" || /정보|확인|미기재|미확인|여부/.test(label);
  if (!open || !appliesTo.includes("bad")) return { appliesTo };
  return { appliesTo: ["uncertain" as const] };
}

/** Personal points that are never a reason chip, whatever the model wrote. */
const PERSONAL_WORDS = /나이|연령|성별|여성|남성|학교|학벌|대학|서열|공백|이직|잦은|결혼|출산|육아|군 ?복무|국적|종교|건강/;

/** Location, years, work arrangement: points a chip may raise that belong to hard conditions. */
const CONDITION_WORDS = /근무|거주|지역|위치|연차|경력 \d|년차|재택|원격|대면|출근|이주|비자|상주/;

/**
 * The hard condition a chip is about: the one the model named, or, when it
 * attached a location/years/arrangement point to a criterion, the matching
 * condition (any condition when none matches). Null for criterion chips.
 */
export function conditionOfChip(item: { criterionId: string; label: string }, brief: RoleStartBrief) {
  const named = brief.hardConditions.find((condition) => condition.id === item.criterionId);
  if (named) return named;
  if (!CONDITION_WORDS.test(item.label)) return null;
  const years = /연차|경력 \d|년차/.test(item.label);
  const match = brief.hardConditions.find((condition) =>
    years ? condition.kind === "min_years" || condition.kind === "max_years" : condition.kind === "location" || condition.kind === "remote_ok"
  );
  return match ?? { id: "condition", kind: "other" as const, label: item.label };
}

function conditionChipLabel(label: string, conditionLabel: string) {
  const text = label.trim().replace(/\s+/g, " ");
  if (text && text.length <= REASON_CHIP_LABEL_MAX && !CHIP_NOTE_WORDS.test(text)) return text;
  const short = conditionLabel.trim();
  return short.length <= REASON_CHIP_LABEL_MAX ? short : short.slice(0, REASON_CHIP_LABEL_MAX);
}

/** The criterion's short subject: the model's topic when short, else the criterion name. */
export function chipTopic(topic: string | undefined, criterion: { name: string }) {
  const text = String(topic ?? "").trim().replace(/\s+/g, " ");
  return text && text.length <= 10 ? text : criterion.name.trim();
}

/**
 * The model's label when it is short and worded as the team's reason;
 * otherwise "<topic> 경험 부족" for a gap and "<topic> 경험" for an open
 * point. The longer reading stays in the evidence.
 */
export function reasonChipLabel(label: string, topic: string, appliesTo: Array<"uncertain" | "bad">) {
  const text = label.trim().replace(/\s+/g, " ");
  if (text && text.length <= REASON_CHIP_LABEL_MAX && !CHIP_NOTE_WORDS.test(text)) return text;
  const subject = topic.trim();
  const counted = /(연차|경력|경험)$/.test(subject);
  if (appliesTo.includes("bad")) return counted ? `${subject} 부족` : `${subject} 경험 부족`;
  return counted ? subject : `${subject} 경험`;
}

/** Company-visible presentation shape read by the Role inbox and detail views. */
export function verdictPresentation(verdict: RoleStartVerdict, brief: RoleStartBrief) {
  return {
    tldr: verdict.tldr,
    harperNote: "",
    finalFit: verdict.finalFit,
    // Only what a reader of the proposal needs; codes (criterion ids, chip
    // kinds, where a chip came from) stay with the role start session.
    reasonChips: (verdict.reasonChips ?? []).map(({ label, appliesTo }) => ({ label, appliesTo })),
    criteriaEvaluations: verdict.criteria.map((item) => ({
      name: item.name,
      fitness: item.fitness,
      content: item.evidence,
      criterionDefinition:
        brief.criteria.find((criterion) => (criterion.id ?? criterion.name) === item.criterionId)?.criteria ?? "",
    })),
  };
}

/**
 * Rule chips added without another model call: criteria the verdict left
 * uncertain, criteria whose grade signals are still unset, and a location
 * condition the profile cannot confirm.
 */
export function withRuleReasons(args: {
  verdict: RoleStartVerdict;
  brief: RoleStartBrief;
  locationKnown: boolean;
}): RoleStartVerdict {
  const chips = [...(args.verdict.reasonChips ?? [])];
  const covered = new Set(
    chips.filter((chip) => chip.appliesTo.includes("uncertain")).map((chip) => chip.criterionId)
  );
  const add = (criterionId: string, kind: RoleStartReasonKind, label: string, scope?: "condition") => {
    if (covered.has(criterionId) || chips.length >= 8) return;
    covered.add(criterionId);
    chips.push({ id: `r${chips.length}`, criterionId, kind, label, evidence: null, appliesTo: ["uncertain"], source: "rule", ...(scope ? { scope } : {}) });
  };
  for (const item of args.verdict.criteria) {
    if (item.fitness === "uncertain") add(item.criterionId, "missing_info", reasonChipLabel("", item.topic ?? item.name, ["uncertain"]));
  }
  for (const criterion of args.brief.criteria) {
    if (!criterion.signals?.excellent && !criterion.signals?.good) {
      add(criterion.id ?? criterion.name, "unset_value", `${criterion.name} 기준 미정`);
    }
  }
  if (!args.locationKnown) {
    for (const condition of args.brief.hardConditions) {
      if (condition.kind === "location") add(condition.id, "missing_info", condition.label, "condition");
    }
  }
  return { ...args.verdict, reasonChips: chips };
}
