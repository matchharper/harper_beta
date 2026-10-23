import "server-only";

import type { User } from "@supabase/supabase-js";
import { fetchOrgBoard, OrgHttpError, type OrgBoardItem } from "@/lib/org/server";
import { fetchRoleCreationState } from "@/lib/org/agent/roleCreationState";
import { normalizeOrgRoleCriteria, type OrgRoleCriterion } from "@/lib/org/roleCriteria";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { briefForModel, exceedsCriteriaCap, normalizeRoleStartBrief, shortId, TOO_MANY_CRITERIA, type RoleStartBrief, type RoleStartCriterion } from "./brief";
import { CHANGED_CRITERION_NOTE, isGradedCriterion } from "@/lib/companyFirstSearch/presentation";
import { roleStartSql } from "./db";
import { scoreCriteria } from "./fastPath";
import { callRoleStartJson, ROLE_START_FAST_MODEL, type RoleStartLlmUsage } from "./llm";
import { loadRoleStartProfiles } from "./profiles";
import { buildBriefEditSystemPrompt, NEXT_QUESTIONS_SCHEMA } from "./prompts";
import { briefFromRaw, type RawBrief, type RawProbe, type RawQuestion } from "./questions";
import {
  appendRoleStartUsage,
  createRoleStartSession,
  loadRoleStartSession,
  mergeRoleStartTimings,
  saveBriefVersion,
  saveRoleStartSession,
  wellFormedJson,
  hasRoleStartBrief,
} from "./session";
import { BRIEF_CHANGED_ELSEWHERE, mergeVisibleBriefEdit } from "./service";
import { writeVerdict } from "./verdicts";
import { visibleBriefHash, withLatestBackground } from "./view";

/**
 * One path for changing a Role's rubric after the start flow, used by the
 * board's filter panel and the 매칭 기준 tab:
 *  1) a new Brief version (reason, date) and the Role's criteria;
 *  2) candidates now shown in the inbox (연결 대기, 먼저 제안 가능한 후보) keep
 *     grades for unchanged criteria; changed or added criteria are judged
 *     again (one call per candidate, in parallel) and show "다시 보는 중";
 *     removed criteria disappear from cards (the history stays in versions);
 *  3) a level-only change (있으면 좋음 · 중요 · 필수) is not judged again;
 *  4) criterion scores of the pool are recomputed only for changed criteria,
 *     and the next batch uses the new Brief.
 * Candidates already shown are never removed or replaced here.
 */

type Access = { roleId: string; user: User; workspaceId: string };

function definitionKey(criterion: OrgRoleCriterion) {
  return JSON.stringify([criterion.name, criterion.criteria, criterion.signals ?? {}]);
}

async function storedBrief(args: Access) {
  const state = await fetchRoleCreationState({ ...args, allowCompletedRole: true });
  let session = await loadRoleStartSession(args.roleId);
  if (!session) {
    await createRoleStartSession({ roleId: args.roleId, workspaceId: args.workspaceId });
    const fromRole = normalizeRoleStartBrief({
      summary: "",
      criteria: normalizeOrgRoleCriteria((state.role as Record<string, unknown>).criteria),
      hardConditions: [],
    });
    session = await saveRoleStartSession({ roleId: args.roleId, patch: { phase: "done", brief: fromRole } });
  } else if (state.role.status !== "draft" && !(await hasRoleStartBrief(args.roleId))) {
    // A chat-written Role: its own list is the source (chat edits write the list
    // alone), so the stored copy follows it before anything is saved from it.
    const listed = normalizeOrgRoleCriteria((state.role as Record<string, unknown>).criteria);
    // Compared as the Brief would hold them (levels filled in), so an unchanged list writes nothing.
    const key = (items: RoleStartCriterion[]) =>
      JSON.stringify(items.map((item) => [item.name, item.criteria, item.requirement ?? null, item.importance ?? null]));
    const asBrief = normalizeRoleStartBrief({ summary: "", hardConditions: [], criteria: listed }).criteria;
    if (key(asBrief) !== key(normalizeRoleStartBrief(session.brief).criteria)) {
      const criteria = listed.map((item) => {
        const kept = session!.brief.criteria.find((criterion) => criterion.name === item.name);
        return kept ? { ...kept, ...item, id: kept.id } : item;
      });
      session =
        (await saveRoleStartSession({
          roleId: args.roleId,
          expectedRevision: session.revision,
          patch: { brief: normalizeRoleStartBrief({ ...session.brief, criteria }) },
        })) ?? session;
    }
  }
  if (!session) throw new OrgHttpError(500, "기준을 불러오지 못했어요.");
  return { state, session };
}

/** The visible rubric for editing, even for Roles that did not use the start flow. */
export async function loadRoleRubric(args: Access) {
  const { session } = await storedBrief(args);
  return session.brief;
}

function visibleCandidates(items: OrgBoardItem[]) {
  return items.filter(
    (item) =>
      item.stage === "pending_connection" ||
      (item.source === "company_intro" && item.companyIntro?.status === "ready")
  );
}

export async function updateRoleRubric(
  args: Access & {
    brief?: unknown;
    request?: string | null;
    /** From the 매칭 기준 tab: criteria already saved on the Role. */
    savedCriteria?: OrgRoleCriterion[];
    /** A change made in code on the latest Brief (reference people), with its summary. */
    change?: { apply: (brief: RoleStartBrief) => RoleStartBrief; summary: string };
    source: "filter_panel" | "matching_tab" | "reference";
    /** visibleBriefHash of the Brief a screen loaded; a Brief changed since then is not overwritten. */
    briefHash?: string;
    /** The screen's summary was edited by the team (otherwise the stored, maybe newer, summary stays). */
    summaryEdited?: boolean;
  }
) {
  const started = Date.now();
  const { state, session } = await storedBrief(args);
  if (args.briefHash !== undefined && visibleBriefHash(session.brief) !== args.briefHash) {
    throw new OrgHttpError(409, BRIEF_CHANGED_ELSEWHERE);
  }
  const before = session.brief;
  const usage: RoleStartLlmUsage[] = [];
  let next: RoleStartBrief;
  let summary: string;
  if (args.savedCriteria && exceedsCriteriaCap(args.savedCriteria)) throw new OrgHttpError(400, TOO_MANY_CRITERIA);
  if (args.savedCriteria) {
    // Matching tab: keep structured fields of criteria whose names are unchanged.
    next = normalizeRoleStartBrief({
      ...before,
      criteria: args.savedCriteria.map((given) => {
        // Grade signals are never taken from a list (chat lists can carry them): kept or rewritten.
        const { signals: _signals, signalsOf: _of, ...criterion } = given as OrgRoleCriterion & { signals?: unknown; signalsOf?: unknown };
        const match = before.criteria.find((item) => item.name === criterion.name);
        if (!match) return { ...criterion, id: shortId("cr") };
        // A rule (e.g. minimum years) belongs to the text it was read from.
        const { rule: _rule, ...rest } = match;
        return { ...(match.criteria === criterion.criteria ? match : rest), ...criterion, id: match.id };
      }),
    });
    summary = "매칭 기준 탭에서 수정";
  } else if (String(args.request ?? "").trim()) {
    const request = String(args.request).trim().slice(0, 4_000);
    const { data, usage: used } = await callRoleStartJson<{
      brief: RawBrief;
      appliedSummary: string;
      probes: RawProbe[];
      questions: RawQuestion[];
    }>({
      label: "rubric_edit",
      model: ROLE_START_FAST_MODEL,
      reasoningEffort: "low",
      schema: NEXT_QUESTIONS_SCHEMA,
      system: buildBriefEditSystemPrompt(),
      user: `<ROLE>${state.role.name}</ROLE>
<CURRENT_BRIEF>\n${JSON.stringify(briefForModel(before), null, 2)}\n</CURRENT_BRIEF>
<TEAM_REQUEST>${request}</TEAM_REQUEST>`,
    });
    usage.push(used);
    // An edit past the criteria cap is refused, never cut off silently.
    if (exceedsCriteriaCap(data.brief?.criteria)) throw new OrgHttpError(400, TOO_MANY_CRITERIA);
    next = briefFromRaw(data.brief, before, `요청: ${request.slice(0, 200)}`);
    summary = data.appliedSummary || "요청에 맞춰 수정";
  } else if (args.change) {
    next = normalizeRoleStartBrief(args.change.apply(before));
    summary = args.change.summary;
  } else if (args.brief) {
    next = mergeVisibleBriefEdit(before, args.brief, "후보 목록에서 직접 수정", { summaryEdited: args.summaryEdited });
    summary = "후보 목록에서 직접 수정";
  } else {
    throw new OrgHttpError(400, "바꿀 내용을 알려 주세요.");
  }
  if (!next.criteria.length) throw new OrgHttpError(400, "기준이 하나 이상 있어야 해요.");

  // Grades shown now, read before the Role's criteria change.
  const board = await fetchOrgBoard({ roleId: args.roleId, user: args.user, workspaceId: args.workspaceId });
  const visible = visibleCandidates(board.items);

  // Scored before the re-read below, so a background write cannot slip in between.
  if (session.pool) await scoreCriteria({ pool: session.pool, criteria: next.criteria });
  // The session first: a refused save leaves the Role as it was. Only a change the
  // screen would show refuses it; a background grade-signals write does not.
  const latest = await loadRoleStartSession(args.roleId);
  if (!latest || visibleBriefHash(latest.brief) !== visibleBriefHash(before)) {
    throw new OrgHttpError(409, "그사이 기준이 바뀌었어요. 다시 확인한 뒤 고쳐 주세요.");
  }
  next = withLatestBackground(next, latest.brief, before);
  // A reference change keeps its own list, applied to the reference people as they are now.
  if (args.change) next = { ...next, references: args.change.apply(latest.brief).references };
  const savedSession = await saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: latest.revision,
    // Counted like the other Brief edits, so words still being applied do not overwrite it.
    patch: { brief: next, pool: session.pool ?? latest.pool, questions: { ...latest.questions, speculative: null, briefEdits: (latest.questions.briefEdits ?? 0) + 1 } },
  });
  if (!savedSession) throw new OrgHttpError(409, "그사이 기준이 바뀌었어요. 다시 확인한 뒤 고쳐 주세요.");
  const version = await saveBriefVersion({
    roleId: args.roleId,
    brief: next,
    changeSource: args.source,
    changeSummary: summary,
    userId: args.user.id,
    // The saved Brief text and the 평가 기준 목록 always come from the same Brief.
    // A chat-written Role keeps its own text (there is no role start Brief to render it from).
    writeRole: (await hasRoleStartBrief(args.roleId)) ? true : "criteria",
  });

  const beforeKeys = new Map(before.criteria.map((criterion) => [criterion.name, definitionKey(criterion)]));
  const toJudge = next.criteria.filter((criterion) => beforeKeys.get(criterion.name) !== definitionKey(criterion));
  const judgeNames = new Set(toJudge.map((criterion) => criterion.name));
  const sql = roleStartSql();
  const rows = visible.map((item) => {
    const evaluations = next.criteria.map((criterion) => {
      const old = item.criteriaEvaluations.find((evaluation) => evaluation.name === criterion.name && isGradedCriterion(evaluation));
      const pending = judgeNames.has(criterion.name) || !old;
      return pending
        ? { name: criterion.name, fitness: "uncertain", content: "", pending: true, criterionDefinition: criterion.criteria }
        : { ...old, criterionDefinition: criterion.criteria };
    });
    return { talentId: item.talent.userId, evaluations };
  });
  for (const row of rows) {
    await sql`
      insert into public.company_role_candidate_evaluations (role_id, talent_id, evaluations, brief_version)
      values (${args.roleId}, ${row.talentId}, ${sql.json(wellFormedJson(row.evaluations))}, ${version})
      on conflict (role_id, talent_id) do update
      set evaluations = excluded.evaluations, brief_version = excluded.brief_version, updated_at = now()
    `;
  }
  await appendRoleStartUsage(args.roleId, usage).catch(() => undefined);
  const pending = rows.filter((row) => row.evaluations.some((evaluation) => "pending" in evaluation));
  return {
    brief: next,
    judging: pending.length,
    run: () =>
      rejudge({
        roleId: args.roleId,
        roleName: state.role.name,
        brief: next,
        rows: pending,
        version,
        started,
      }),
  };
}

/**
 * Registration rewrote some criteria from the team's ratings after the first
 * three were read: re-read only those criteria for the people moved to the
 * inbox (the same "다시 보는 중" path as a criteria edit), so their cards keep
 * every grade instead of none.
 */
export async function regradeAfterRegistration(args: {
  roleId: string;
  before: RoleStartBrief;
  after: RoleStartBrief;
  people: Array<{ talentId: string; evaluations: Array<{ name: string; fitness: string; content: string }> }>;
}) {
  const wordingBefore = new Map(args.before.criteria.map((criterion) => [criterion.name, criterion.criteria]));
  const judgeNames = new Set(
    args.after.criteria.filter((criterion) => wordingBefore.get(criterion.name) !== criterion.criteria).map((criterion) => criterion.name)
  );
  if (!judgeNames.size || !args.people.length) return 0;
  const sql = roleStartSql();
  const role = (await sql<Array<{ name: string; version: number | null }>>`
    select r.name, (select max(v.version) from public.company_role_brief_versions v where v.role_id = r.role_id) as version
    from public.company_roles r where r.role_id = ${args.roleId}
  `)[0];
  if (!role) return 0;
  const rows = args.people.map((person) => ({
    talentId: person.talentId,
    evaluations: args.after.criteria.map((criterion) => {
      const old = person.evaluations.find((evaluation) => evaluation.name === criterion.name && isGradedCriterion(evaluation));
      return judgeNames.has(criterion.name) || !old
        ? { name: criterion.name, fitness: "uncertain", content: "", pending: true, criterionDefinition: criterion.criteria }
        : { ...old, criterionDefinition: criterion.criteria };
    }),
  }));
  for (const row of rows) {
    await sql`
      insert into public.company_role_candidate_evaluations (role_id, talent_id, evaluations, brief_version)
      values (${args.roleId}, ${row.talentId}, ${sql.json(wellFormedJson(row.evaluations))}, ${role.version})
      on conflict (role_id, talent_id) do update
      set evaluations = excluded.evaluations, brief_version = excluded.brief_version, updated_at = now()
    `;
  }
  await rejudge({ roleId: args.roleId, roleName: role.name, brief: args.after, rows, version: role.version, started: Date.now() });
  return rows.length;
}

async function rejudge(args: {
  roleId: string;
  roleName: string;
  brief: RoleStartBrief;
  rows: Array<{ talentId: string; evaluations: Array<Record<string, unknown>> }>;
  version: number | null;
  started: number;
}) {
  const sql = roleStartSql();
  const profiles = await loadRoleStartProfiles(args.rows.map((row) => row.talentId));
  const usage: RoleStartLlmUsage[] = [];
  // A criterion that could not be judged shows as 확인 필요 instead of staying "다시 보는 중".
  const unjudged = ({ pending: _pending, ...evaluation }: Record<string, unknown>) => ({
    ...evaluation,
    fitness: "uncertain",
    content: evaluation.content || CHANGED_CRITERION_NOTE,
  });
  // Only write if no newer rubric change replaced this row meanwhile.
  const write = (talentId: string, evaluations: Array<Record<string, unknown>>, reasonChips?: unknown[]) => sql`
    update public.company_role_candidate_evaluations
    set evaluations = ${sql.json(wellFormedJson(evaluations))},
        reason_chips = ${reasonChips ? sql.json(wellFormedJson(reasonChips)) : sql`reason_chips`},
        updated_at = now()
    where role_id = ${args.roleId} and talent_id = ${talentId}
      and brief_version is not distinct from ${args.version}
  `;
  await Promise.all(
    args.rows.map(async (row) => {
      const profile = profiles.get(row.talentId);
      const names = row.evaluations.filter((evaluation) => evaluation.pending).map((evaluation) => evaluation.name);
      if (!names.length) return;
      const settled = () => row.evaluations.map((evaluation) => (evaluation.pending ? unjudged(evaluation) : evaluation));
      try {
        if (!profile) {
          await write(row.talentId, settled());
          return;
        }
        const subset: RoleStartBrief = {
          ...args.brief,
          criteria: args.brief.criteria.filter((criterion) => names.includes(criterion.name)) as RoleStartCriterion[],
        };
        const result = await writeVerdict({ roleName: args.roleName, brief: subset, profile, probe: null });
        usage.push(result.usage);
        const evaluations = row.evaluations.map((evaluation) => {
          if (!evaluation.pending) return evaluation;
          const judged = result.verdict.criteria.find((item) => item.name === evaluation.name);
          return judged
            ? { name: judged.name, fitness: judged.fitness, content: judged.evidence, criterionDefinition: evaluation.criterionDefinition }
            : unjudged(evaluation);
        });
        await write(row.talentId, evaluations, result.verdict.reasonChips ?? []);
      } catch (error) {
        console.warn("[role-start] rejudge", error);
        await write(row.talentId, settled()).catch(() => undefined);
      }
    })
  );
  await appendRoleStartUsage(args.roleId, usage).catch(() => undefined);
  await mergeRoleStartTimings(args.roleId, {
    lastRubricUpdateMs: Date.now() - args.started,
    lastRubricUpdateUsd: Math.round(usage.reduce((sum, item) => sum + (item.usd ?? 0), 0) * 10_000) / 10_000,
    lastRubricUpdateCandidates: args.rows.length,
  });
}

export function getSupabaseForRubric() {
  return getSupabaseAdmin();
}

