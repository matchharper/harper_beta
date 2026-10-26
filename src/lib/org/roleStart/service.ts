import { formatPromptText } from "@/lib/llm/promptText";
import "server-only";

import type { User } from "@supabase/supabase-js";
import {
  fetchRoleCreationState,
  getRoleCreationMissingFields,
  setRoleCreationNotification,
  updateRoleCreationConversationMetadata,
  type RoleCreationState,
} from "@/lib/org/agent/roleCreationState";
import { after } from "next/server";
import { createHash } from "node:crypto";
import { recordOrgIntroDecision } from "@/lib/org/actionLogs";
import { coveredQuestions, fillChips, keptWithoutFill, mayAsk, MIN_CHIPS, questionCardFromReply } from "./chipGuard";
import {
  answeredForOverlap,
  isChatQuestion,
  planDraftQueue,
  questionsTowardLimit,
  replayLaterChips,
  settlingAnswer,
  withoutSettled,
} from "./chatAnswers";
import { reasonTargetsByCandidate, typedReason, YEARS_TARGET } from "./reasonTargets";
import { asksRoleInfo, briefWithRoleInfo, changedRoleInfo, type RoleInfoField } from "./roleInfoConditions";
import { notifyOrgRoleCreatedSlack } from "@/lib/org/slack";
import { OrgHttpError } from "@/lib/org/server";
import { getSupabaseAdmin } from "@/lib/server/candidateAccess";
import { normalizeOrgRoleCriteria, type OrgRoleCriterion, type OrgRoleCriterionGrade } from "@/lib/org/roleCriteria";
import {
  briefForModel,
  criterionHash,
  hardConditionsHash,
  normalizeRoleStartBrief,
  isRequired,
  keepRequired,
  keepTeamLevels,
  needsSignals,
  needsSummary,
  signalsKey,
  summaryKey,
  levelOf,
  reapplySettled,
  shortId,
  withLevel,
  verdictBriefHash,
  type RoleStartBrief,
  type RoleStartCriterion,
  type RoleStartLevel,
  type RoleStartProbe,
  type RoleStartReference,
} from "./brief";
import { roleStartSql } from "./db";
import {
  buildBroadPool,
  countByConditions,
  jdQueryText,
  pickFirstThree,
  rankPool,
  ROLE_START_POOL_TTL_MS,
  scoreCriteria,
  completePool,
  ensureJobScores,
  type PickedCandidate,
  type RankedMember,
  type RoleStartPool,
} from "./fastPath";
import { callRoleStartJson, ROLE_START_FAST_MODEL, type RoleStartLlmUsage } from "./llm";
import { loadRoleStartProfiles, type RoleStartProfile } from "./profiles";
import {
  buildBriefEditSystemPrompt,
  buildCalibrationSystemPrompt,
  buildDraftSystemPrompt,
  buildNextQuestionsOnlySystemPrompt,
  buildSignalsSystemPrompt,
  buildSummarySystemPrompt,
  buildNextQuestionsSystemPrompt,
  DRAFT_SCHEMA,
  NEXT_QUESTIONS_ONLY_SCHEMA,
  NEXT_QUESTIONS_SCHEMA,
  SIGNALS_SCHEMA,
  SUMMARY_SCHEMA,
} from "./prompts";
import {
  applyChipEffect,
  briefFromRaw,
  probesFromRaw,
  questionsFromRaw,
  QUESTION_HARD_LIMIT,
  QUESTION_MINIMUM,
  selectNextQuestion,
  type RawBrief,
  type RawProbe,
  type RawQuestion,
} from "./questions";
import {
  addPreparedStats,
  upsertRoleStartProgress,
  CHAT_BRIEF_EDIT,
  likedReasonChips,
  appendRoleStartUsage,
  mergeRoleStartTimings,
  savePreparedEntry,
  savePreparedInflight,
  roleStartLeaseHeld,
  savePreparedBatch,
  saveSpeculativeFollowUps,
  onBriefSaved,
  hasRoleStartBrief,
  isRegisteredRoleStartRole,
  wellFormedJson,
  storedBriefHash,
  createRoleStartSession,
  loadRoleStartSession,
  saveRoleStartBrief,
  saveRoleStartSession,
  isRoleStartStalled,
  isRoleStartEnded,
  roleStartOwnsRole,
  supersedeRoleStartSession,
  claimRoleStartLease,
  releaseRoleStartLease,
  markRoleStartRefined,
  type RoleStartCandidate,
  type RoleStartChip,
  type RoleStartPhase,
  type RoleStartPreparedBatch,
  type RoleStartPreparedInflight,
  type RoleStartProgressStep,
  type RoleStartQuestion,
  type RoleStartQuestionState,
  type RoleStartSession,
  type RoleStartVerdict,
} from "./session";
import { MAX_REFERENCE_ROWS, type RoleStartReferenceRow } from "./referenceRows";
import { briefForPrompt, verdictPresentation, withRuleReasons, writeVerdict } from "./verdicts";
import {
  applyAcceptedTraits,
  isRepeatedLink,
  loadReferenceSources,
  referenceTalentIds,
  ROLE_START_MAX_REFERENCES,
  mapReferenceAnswer,
  readReferences,
  repeatedLinkAnswers,
  roomForAnotherQuestion,
  withoutReference,
  withLatestReferences,
} from "./references";
import { closeRoleStartSlackQuestion, notifyRoleStartSlack } from "./slack";
import { relaxations, thinConditions } from "./widen";
import { visibleBriefHash, withLatestBackground } from "./view";
import {
  closeRoleStartQuestionCard,
  postRoleStartBriefReadyCard,
  postRoleStartQuestionCard,
  postRoleStartRegisteredMessage,
  recordRoleStartAnswerInChat,
} from "./chatCards";

/** Mirror the open question (or the end of questions) into the role chat. */
async function syncChatCards(session: RoleStartSession) {
  try {
    if (session.pendingQuestion) {
      await postRoleStartQuestionCard({
        roleId: session.roleId,
        workspaceId: session.workspaceId,
        question: session.pendingQuestion,
      });
    } else if (session.phase === "review" && session.questions.history.length) {
      await postRoleStartBriefReadyCard({ roleId: session.roleId, workspaceId: session.workspaceId });
    }
  } catch (error) {
    console.warn("[role-start] chat card", error);
  }
}

/** Product limit from the design: confirm → first three on screen. */
export const ROLE_START_FIRST_THREE_BUDGET_MS = 60_000;
/** People recommended right after registration, before the scheduled search takes over. */
export const ROLE_START_BATCH_SIZE = 1;

type Access = { roleId: string; user: User; workspaceId: string };

async function access(args: Access, allowCompletedRole = true) {
  return fetchRoleCreationState({ ...args, allowCompletedRole });
}

function roleSource(state: RoleCreationState) {
  const role = state.role as Record<string, unknown>;
  return {
    name: state.role.name,
    description: role.description ?? null,
    hiringBrief: role.request ?? null,
    existingCriteria: role.criteria ?? [],
    locationText: role.locationText ?? null,
    workMode: role.workMode ?? null,
    employmentTypes: role.employmentTypes ?? [],
    salaryRange: role.salaryRange ?? null,
    company: {
      name: state.workspace.companyName,
      about: state.workspace.pitch ?? null,
      companyFacts: state.workspace.companyFacts ?? null,
      workspace_request: state.workspace.request ?? null,
      homepageUrl: state.workspace.homepageUrl,
      linkedinUrl: state.workspace.linkedinUrl,
      relatedLinks: state.workspace.relatedLinks,
    },
  };
}

/**
 * Company-visible progress. Lines say only what Harper is doing in general
 * terms: no counts, stage names, methods or models, so the screen and the
 * responses behind it do not describe the pipeline.
 */
const STEP_KINDS = ["read", "organize", "find", "review", "apply", "choose"] as const;
// The screen words each kind (Korean/English); the server stores only the kind.
type StepKind = (typeof STEP_KINDS)[number];

async function step(
  roleId: string,
  section: RoleStartProgressStep,
  kind: StepKind,
  status: "running" | "done" | "error",
  text?: string
) {
  try {
    await upsertRoleStartProgress(roleId, {
      key: `${section}:${kind}`,
      step: section,
      status,
      kind,
      text: text ?? "",
    });
  } catch (error) {
    console.error("[role-start] progress", error);
  }
}


async function persistUsage(roleId: string, usage: RoleStartLlmUsage[]) {
  try {
    await appendRoleStartUsage(roleId, usage);
  } catch (error) {
    console.error("[role-start] usage", error);
  }
}


function askedIds(session: RoleStartSession) {
  return [
    ...session.firstCandidates.map((candidate) => candidate.talentId),
    ...(session.batch?.candidates ?? []).map((candidate) => candidate.talentId),
  ];
}

// ---------------------------------------------------------------- step 0

/**
 * Reads the JD once and returns the rubric draft, probes and first question
 * candidates in one structured call. Idempotent per Role.
 */
export async function startRoleStartDraft(args: Access) {
  return (await beginRoleStartDraft(args)).completion;
}

/** Persist ownership before handing the user a link; drafting continues beside the reply. */
export async function beginRoleStartDraft(args: Access): Promise<{
  session: RoleStartSession | null;
  completion: Promise<RoleStartSession | null>;
}> {
  const state = await access(args);
  const existing = await loadRoleStartSession(args.roleId);
  // A draft that stopped writing (the request or its background work died) can start again.
  if (existing && !isRoleStartEnded(existing.phase) && !(existing.phase === "drafting" && isRoleStartStalled(existing))) {
    return { session: existing, completion: Promise.resolve(existing) };
  }
  // Only a draft Role starts (or restarts) the flow: a Role already on keeps its own Brief.
  if (String(state.role.status ?? "").toLowerCase() !== "draft") {
    throw new OrgHttpError(409, "이미 시작된 역할은 역할 시작을 다시 켤 수 없어요.");
  }
  const source = roleSource(state);
  if (!String(source.description ?? "").trim() && !String(source.hiringBrief ?? "").trim()) {
    throw new OrgHttpError(409, "역할 설명이 저장된 뒤에 시작할 수 있어요.");
  }
  if (!existing) {
    // One draft per Role: when two starts race (the chat and the button), the
    // one that did not create the session returns the running one.
    const created = await createRoleStartSession({ roleId: args.roleId, workspaceId: args.workspaceId });
    if (!created) {
      const session = await loadRoleStartSession(args.roleId, { forView: true });
      return { session, completion: Promise.resolve(session) };
    }
  } else {
    const restarted = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: existing.revision,
      // A new draft rates new people: the earlier first three and their ratings go.
      // An open question (asked in the chat meanwhile) stays with its cards.
      patch: { phase: "drafting", firstCandidates: [], evaluations: {}, batch: null },
    });
    if (!restarted) throw new OrgHttpError(409, "이미 다시 시작했어요.");
  }
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  return { session, completion: buildRoleStartDraft(args, state) };
}

async function buildRoleStartDraft(args: Access, state: RoleCreationState) {
  const source = roleSource(state);
  const started = Date.now();
  await step(args.roleId, "draft", "organize", "running");
  try {
    // The broad pool needs no rubric: SQL eligibility + JD similarity run while
    // the model reads the JD.
    const poolStarted = Date.now();
    const poolPromise = buildBroadPool({
      roleId: args.roleId,
      queryText: jdQueryText({ roleName: state.role.name, description: String(source.description ?? source.hiringBrief ?? "") }),
      excludeIds: [],
    }).then((pool) => ({ pool, ms: Date.now() - poolStarted }));
    const [{ data, usage }, broad] = await Promise.all([
      callRoleStartJson<{
        summary: string;
        hardConditions: RawBrief["hardConditions"];
        criteria: RawBrief["criteria"];
        keywords: string[];
        probes: RawProbe[];
        questions: RawQuestion[];
      }>({
        label: "rubric_draft",
        reasoningEffort: "medium",
        // A normal draft is ~2.5k tokens; a runaway list fails fast and retries.
        maxOutputTokens: 6_000,
        schema: DRAFT_SCHEMA,
        system: buildDraftSystemPrompt(),
        user: `<ROLE_SOURCE>\n${formatPromptText(source)}\n</ROLE_SOURCE>`,
      }),
      poolPromise,
    ]);
    await persistUsage(args.roleId, [usage]);
    // Location or work arrangement changed on the first step while the Brief
    // was being written: those fields follow before anything is shown.
    const latestRole = (await access(args)).role;
    // Only a value replaced while the draft ran is the team's edit; a field
    // filled in meanwhile (the role facts read, the chat) is what the draft read from the JD.
    const roleInfoChanged = changedRoleInfo(state.role, latestRole).filter((field) =>
      field === "location" ? Boolean(String(state.role.locationText ?? "").trim()) : Boolean(state.role.workMode)
    );
    const brief = briefWithRoleInfo(briefFromRaw(data), latestRole, roleInfoChanged);
    const pool = broad.pool;
    const supplement = await completePool({ pool, roleId: args.roleId, brief });
    const probes = probesFromRaw(data.probes, brief);
    const candidates = (await questionsWithChips(args.roleId, data.questions)).filter(
      (item) => !asksRoleInfo(item, roleInfoChanged)
    );
    await step(args.roleId, "draft", "organize", "done");
    // A Role registered another way meanwhile ended this flow: its draft is dropped.
    if ((await loadRoleStartSession(args.roleId, { forView: true }))?.phase === "drafting") {
      await saveRoleStartBrief({
        roleId: args.roleId,
        brief,
        changeSource: "jd_draft",
        changeSummary: "역할 설명에서 만든 초안",
        userId: args.user.id,
        writeRole: false,
      });
    }
    const scoring = await scoreCriteria({ pool, criteria: brief.criteria });
    const selected = await selectNextQuestion({
      roleId: args.roleId,
      roleName: state.role.name,
      brief,
      pool,
      candidates,
      askedCount: 0,
    });
    const covered = new Set<string>();
    // Chat answers the overlap check has read; an answer given after it is read on the next try.
    const checkedAnswers = new Set<string>();
    let overlapMs = 0;
    let session: RoleStartSession | null = null;
    // 참고 인물 rows the team gave while the draft ran: read once it is saved.
    let boxRows: RoleStartReferenceRow[] = [];
    // Harper's open card the merge dropped (a drafted question asks the same): its chat card closes.
    let droppedCard: string | null = null;
    // Each try re-reads the session, so a lost race only repeats the merge; if
    // it still cannot save, the stalled-step retry starts the draft again.
    let attempts = 0;
    for (; attempts < 8 && !session; attempts += 1) {
      // Questions the role chat asked while the draft ran stay in the same
      // question state: an open one stays open, the draft's follow after it.
      const meanwhile = await loadRoleStartSession(args.roleId, { forView: true });
      if (!meanwhile || meanwhile.phase !== "drafting") break;
      // A question the chat asked that a draft question already covers is
      // dropped: the draft's own question carries chip effects on the Brief.
      const drafted = [selected.question, ...selected.remaining].filter((item): item is NonNullable<typeof item> => Boolean(item));
      const fromChat = [meanwhile?.pendingQuestion ?? null, ...(meanwhile?.questions.candidates ?? [])].filter(
        (item): item is NonNullable<typeof item> => Boolean(item) && item!.chips.every((chip) => chip.effect.type === "note")
      );
      // A chat question the team already answered while the draft ran drops
      // the drafted question that asks the same thing, or that its answer
      // already settles (a chip label or short words; never a link or a pasted
      // profile, whose person is not read yet).
      const answeredChat = meanwhile.questions.history.filter(isChatQuestion);
      const unchecked = answeredChat.filter((item) => !checkedAnswers.has(item.id));
      // Overlap with the chat's questions is checked on the first try, and again
      // only for an answer given while this saved; a question the chat adds
      // meanwhile counts as not covered.
      if (((attempts === 0 && fromChat.length) || unchecked.length) && drafted.length) {
        const overlapStarted = Date.now();
        const result = await coveredQuestions({
          asked: fromChat.map((item) => item.question),
          drafted: drafted.map((item) => item.question),
          answered: answeredChat.map(answeredForOverlap),
        }).catch((error) => (console.warn("[role-start] question overlap check failed", error), null));
        overlapMs += Date.now() - overlapStarted;
        answeredChat.forEach((item) => checkedAnswers.add(item.id));
        if (result) {
          await persistUsage(args.roleId, [result.usage]);
          result.covered.forEach((index) => covered.add(fromChat[index]!.id));
          result.repeated.forEach((index) => covered.add(drafted[index]!.id));
        }
      }
      // The draft's first question left is shown now; the chat answer's words
      // are applied behind it (refineOpenAnswers below), never waited on here.
      const plan = planDraftQueue({
        drafted,
        fillers: selected.fillers,
        pending: meanwhile.pendingQuestion,
        chatQueued: meanwhile.questions.candidates,
        historyLength: meanwhile.questions.history.length,
        covered,
        wordsPending: wordsPending(meanwhile),
      });
      // With no room left a new question is not shown (one already open stays) and the Brief comes next.
      const room = roomForAnotherQuestion(meanwhile.questions.history.length);
      const pending = room || (plan.pending && plan.pending.id === meanwhile.pendingQuestion?.id) ? plan.pending : null;
      const { queued } = plan;
      const waitForWords = room && plan.waitForWords;
      droppedCard = meanwhile.pendingQuestion && pending?.id !== meanwhile.pendingQuestion.id ? meanwhile.pendingQuestion.id : null;
      boxRows = meanwhile.questions.pendingReferences ?? [];
      session = await saveRoleStartSession({
        roleId: args.roleId,
        expectedPhase: "drafting",
        // A chat question or answer saved meanwhile is read again, never overwritten.
        expectedRevision: meanwhile.revision,
        patch: {
          phase: pending || waitForWords ? "questions" : "review",
          // Reference people the team gave while the draft ran stay with the Brief.
          brief: meanwhile.brief.references?.length ? { ...brief, references: meanwhile.brief.references } : brief,
          pool,
          questions: {
            history: meanwhile?.questions.history ?? [],
            candidates: queued,
            probes,
            stopped: !pending && !waitForWords,
            briefEdits: meanwhile.questions.briefEdits,
          },
          pendingQuestion: pending,
        },
        timings: {
          draftMs: Date.now() - started,
          broadPoolMs: broad.ms,
          draftScoringMs: scoring.ms,
          supplementAdded: supplement.termsAdded,
          jobSupplementAdded: supplement.jobAdded,
          supplementMs: supplement.ms,
          firstQuestionSelectMs: selected.ms,
          questionCandidates: candidates.length,
          questionOverlaps: JSON.stringify(selected.measured.map((item) => item.overlap)),
          ...(overlapMs ? { chatOverlapMs: overlapMs } : {}),
        },
      });
      if (session) break;
    }
    if (!session && attempts >= 8) console.warn("[role-start] draft could not be saved; the stalled-step retry writes it again", { roleId: args.roleId });
    // An answer given while the draft ran can leave nothing to ask: then the
    // Brief is ready, unless words are still to be applied (that refinement tells).
    if (session && (session.pendingQuestion || (session.questions.history.length && !wordsPending(session)))) {
      void notifyRoleStartSlack({ kind: session.pendingQuestion ? "question" : "brief_ready", session, state }).catch(() => undefined);
    }
    if (session && droppedCard) {
      await closeRoleStartQuestionCard({ roleId: args.roleId, workspaceId: args.workspaceId, questionId: droppedCard }).catch((error) =>
        console.warn("[role-start] close a dropped card", error)
      );
    }
    if (session) await syncChatCards(session);
    if (session?.pendingQuestion) runAfterResponse(() => prefetchFollowUps({ roleId: args.roleId, state }));
    if (session && boxRows.length) {
      const rows = boxRows;
      runAfterResponse(() => processReferenceRows({ ...args, rows }));
    }
    // A chat answer's words given while the draft ran are applied in the
    // background from here, whether the draft's question is on screen or the
    // questions step waits on them (it returns at once if the refinement
    // already ran or is running elsewhere).
    if (session && session.phase !== "drafting" && wordsPending(session)) {
      const saved = session;
      runAfterResponse(async () => {
        await refineOpenAnswers({ roleId: args.roleId, state, userId: args.user.id, from: saved.refinedAnswers + 1, to: saved.questions.history.length });
      });
    }
    return session;
  } catch (error) {
    console.error("[role-start] draft failed", error);
    await step(args.roleId, "draft", "organize", "error", "정리하지 못했어요");
    await saveRoleStartSession({ roleId: args.roleId, expectedPhase: "drafting", patch: { phase: "failed" } });
    throw error;
  }
}

/**
 * The fixed compensation question: an answer is the Role's 보상 field as
 * written; a skip (or "아직 안 정했어요") leaves it empty. Neither touches the
 * Brief or the question count.
 */
export async function answerRoleStartCompensation(args: Access & { text?: string | null; skip?: boolean }) {
  await access(args);
  const salary = args.skip ? "" : String(args.text ?? "").trim().slice(0, 200);
  if (!args.skip && !salary) throw new OrgHttpError(400, "연봉을 적거나 골라 주세요.");
  const sql = roleStartSql();
  await sql.begin(async (tx) => {
    if (salary) {
      await tx`update public.company_roles set salary_range = ${salary}, updated_at = now() where role_id = ${args.roleId}`;
    }
    await tx`
      update public.company_role_start_sessions
      -- A new revision: a save prepared before this one retries on the latest state instead of dropping it.
      set questions = jsonb_set(questions, '{compensation}', ${sql.json(salary ? "answered" : "skipped")}),
        revision = revision + 1, updated_at = now()
      where role_id = ${args.roleId}
    `;
  });
  return loadRoleStartSession(args.roleId, { forView: true });
}

// ---------------------------------------------------------------- step 1

/** Criteria or condition a chip writes to, for dropping questions an answer already settled. */
function chipTarget(chip: RoleStartChip | null | undefined) {
  const effect = chip?.effect;
  if (!effect) return null;
  if (
    effect.type === "set_requirement" ||
    effect.type === "set_importance" ||
    effect.type === "refine_criterion" ||
    effect.type === "remove_criterion"
  ) {
    return effect.criterion;
  }
  if (effect.type === "add_criterion") return effect.name;
  return null;
}

/** Draft or follow-up questions with 4-5 chips each: a short one is filled; if filling fails, one with 2+ chips stays as it is. */
async function questionsWithChips(roleId: string, raw: RawQuestion[]) {
  const candidates = questionsFromRaw(raw);
  const usage: RoleStartLlmUsage[] = [];
  const filled = await Promise.all(
    candidates.map(async (question) => {
      if (question.chips.length >= MIN_CHIPS) return question;
      const result = await fillChips({ question: question.question, chips: question.chips.map((chip) => chip.label) }).catch(
        (error) => (console.warn("[role-start] chip fill failed", error), null)
      );
      if (!result) return keptWithoutFill(question);
      if (result.usage) usage.push(result.usage);
      const added = result.chips.slice(question.chips.length).map(
        (label): RoleStartChip => ({ id: shortId("chip"), label, effect: { type: "note" } })
      );
      return { ...question, chips: [...question.chips, ...added] };
    })
  );
  if (usage.length) await persistUsage(roleId, usage);
  return filled.filter((question): question is NonNullable<typeof question> => question !== null);
}

/** Run work after the response is sent (or right away outside a request, e.g. Slack). */
function runAfterResponse(task: () => Promise<void>) {
  const run = () => task().catch((error) => console.error("[role-start] background", error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Grade signals follow the criterion they belong to: when a name or what
 * counts as evidence changed by any path, one small call writes the signals
 * of just those criteria again (the others keep theirs). The edit itself
 * never waits for it; confirming waits only while it is still needed.
 * Re-scoring follows from the changed criterion text (criterionHash), and a
 * prepared verdict for the old signals no longer matches (verdictBriefHash).
 */
export async function refreshRoleStartSignals(roleId: string, options: { wait?: boolean } = {}) {
  // Confirming waits 20 s at most in all.
  const deadline = Date.now() + 20_000;
  // A criterion edited while one write ran is skipped by it, and its own refresh
  // finds the lease taken: the writer (only) goes again, a couple of rounds at most.
  for (let round = 0; round < 3; round += 1) {
    if (round > 0 && options.wait && Date.now() >= deadline) return;
    if (!(await writeSignals(roleId, { wait: options.wait, deadline }))) return;
    const latest = await loadRoleStartSession(roleId, { forView: true });
    if (!latest?.brief.criteria.some(needsSignals)) return;
  }
}

/** One write of the stale criteria's signals; true when this call held the lease and saved some. */
async function writeSignals(roleId: string, options: { wait?: boolean; deadline: number }) {
  const session = await loadRoleStartSession(roleId);
  const stale = session?.brief.criteria.filter(needsSignals) ?? [];
  if (!session || !stale.length || session.phase === "drafting" || isRoleStartEnded(session.phase)) return false;
  const token = await claimRoleStartLease(roleId, "signals", 60_000);
  if (!token) {
    // Another server is writing them: wait for it when asked (confirming).
    while (options.wait && Date.now() < options.deadline) {
      await sleep(500);
      const latest = await loadRoleStartSession(roleId, { forView: true });
      if (!latest?.brief.criteria.some(needsSignals)) return false;
    }
    return false;
  }
  try {
    const started = Date.now();
    const { data, usage } = await callRoleStartJson<{ criteria: Array<{ id: string; signals: RoleStartCriterion["signals"] }> }>({
      label: "criterion_signals",
      model: ROLE_START_FAST_MODEL,
      reasoningEffort: "low",
      schema: SIGNALS_SCHEMA,
      system: buildSignalsSystemPrompt(),
      user: `<CRITERIA>\n${formatPromptText(stale.map(({ id, name, criteria }) => ({ id, name, criteria })))}\n</CRITERIA>`,
      // Confirming waits until its deadline only; signals still missing then are
      // written after it (the confirmed version's save asks for them again).
      signal: options.wait ? AbortSignal.timeout(Math.max(1, options.deadline - Date.now())) : undefined,
    });
    await persistUsage(roleId, [usage]);
    // Only a complete set is kept: one with an empty grade would read as stale and be written again on every save.
    const complete = (signals: RoleStartCriterion["signals"]) =>
      Boolean(signals?.excellent?.trim() && signals.good?.trim() && signals.uncertain?.trim() && signals.bad?.trim());
    const written = new Map(data.criteria.filter((item) => complete(item.signals)).map((item) => [item.id, item.signals]));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await loadRoleStartSession(roleId);
      if (!latest || isRoleStartEnded(latest.phase)) return false;
      let changed = false;
      const criteria = latest.brief.criteria.map((criterion) => {
        const was = stale.find((item) => item.id === criterion.id);
        const signals = written.get(criterion.id ?? "");
        // Only where the criterion still reads as it did when the signals were written.
        if (!was || !signals || was.name !== criterion.name || was.criteria !== criterion.criteria) return criterion;
        changed = true;
        return { ...criterion, signals, signalsOf: signalsKey(criterion) };
      });
      // Nothing complete to save (or every criterion changed again): no further round now;
      // the next save of the Brief asks again.
      if (!changed) return false;
      const brief = { ...latest.brief, criteria };
      const saved = await saveRoleStartSession({
        roleId,
        expectedRevision: latest.revision,
        patch: { brief },
        timings: { signalsMs: Date.now() - started },
      });
      if (!saved) continue;
      if (latest.pool) await scoreCriteria({ pool: latest.pool, criteria: brief.criteria }).catch(() => undefined);
      await saveRoleStartBrief({
        roleId,
        brief,
        changeSource: "signals",
        changeSummary: null,
        userId: null,
        // Once confirmed, the saved Brief text and the criteria list carry them too.
        // A chat-written Role's list is its own (this session copy can be older): left as it is.
        writeRole: ["questions", "review"].includes(latest.phase) ? false : await hasRoleStartBrief(roleId),
      });
      return true;
    }
  } finally {
    await releaseRoleStartLease(roleId, "signals", token);
  }
  return true;
}

// Every Brief version saved by any path: fresh signals in the background when a criterion's text changed,
// and a fresh summary when the conditions or criteria it recaps changed.
onBriefSaved((roleId, brief) => {
  if (brief.criteria.some(needsSignals)) runAfterResponse(() => refreshRoleStartSignals(roleId));
  if (needsSummary(brief)) runAfterResponse(() => refreshRoleStartSummary(roleId).catch((error) => console.warn("[role-start] summary", error)));
});

/**
 * The summary recaps the conditions and criteria: when they change by any
 * path (and the team did not write the summary themselves), one small call
 * rewrites only the summary, in the background, like the grade signals.
 */
export async function refreshRoleStartSummary(roleId: string) {
  const session = await loadRoleStartSession(roleId);
  if (!session || session.phase === "drafting" || isRoleStartEnded(session.phase) || !needsSummary(session.brief)) return;
  // A Brief from before summaries followed the criteria: its summary (maybe the team's own) is kept and only stamped.
  if (!session.brief.summaryOf) {
    await saveRoleStartSession({ roleId, expectedRevision: session.revision, patch: { brief: { ...session.brief, summaryOf: summaryKey(session.brief) } } });
    return;
  }
  const token = await claimRoleStartLease(roleId, "summary", 60_000);
  if (!token) return;
  try {
    const key = summaryKey(session.brief);
    const { data, usage } = await callRoleStartJson<{ summary: string }>({
      label: "brief_summary",
      model: ROLE_START_FAST_MODEL,
      reasoningEffort: "low",
      schema: SUMMARY_SCHEMA,
      system: buildSummarySystemPrompt(),
      user: `<CURRENT_BRIEF>\n${formatPromptText(briefForModel(session.brief))}\n</CURRENT_BRIEF>`,
    });
    await persistUsage(roleId, [usage]);
    const summary = String(data.summary ?? "").trim().slice(0, 4_000);
    if (!summary) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const latest = await loadRoleStartSession(roleId);
      // Only for the conditions and criteria it was written for, and over a summary nobody edited meanwhile.
      if (!latest || isRoleStartEnded(latest.phase) || summaryKey(latest.brief) !== key || latest.brief.summary !== session.brief.summary) return;
      const brief = { ...latest.brief, summary, summaryOf: key };
      const saved = await saveRoleStartSession({ roleId, expectedRevision: latest.revision, patch: { brief } });
      if (!saved) continue;
      await saveRoleStartBrief({
        roleId,
        brief,
        changeSource: "summary",
        changeSummary: null,
        userId: null,
        writeRole: ["questions", "review"].includes(latest.phase) ? false : await hasRoleStartBrief(roleId),
      });
      return;
    }
  } finally {
    await releaseRoleStartLease(roleId, "summary", token);
  }
}

const REFINE_LEASE_MS = 120_000;
const REFINE_WAIT_MS = 150_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Refine answer number `seq` after every earlier answer, in any server: the
 * session counts refined answers and a lease marks the one running. An answer
 * whose next questions were prepared needs no model call and only advances
 * the count. If an earlier refinement never finishes, this one gives up and
 * the stalled-step retry continues from the first unrefined answer.
 */
export async function refineInOrder(args: { roleId: string; state: RoleCreationState; userId: string; seq: number }) {
  const deadline = Date.now() + REFINE_WAIT_MS;
  while (Date.now() < deadline) {
    const session = await loadRoleStartSession(args.roleId, { forView: true });
    if (!session || session.refinedAnswers >= args.seq) return;
    // An answer given while the draft is still being written is applied to the draft once it exists.
    if (session.phase === "drafting") {
      await sleep(1_000);
      continue;
    }
    if (session.refinedAnswers === args.seq - 1) {
      const token = await claimRoleStartLease(args.roleId, "refine", REFINE_LEASE_MS);
      if (token) {
        // Another worker may have applied this answer between the read and the claim.
        const fresh = await loadRoleStartSession(args.roleId, { forView: true });
        if (!fresh || fresh.refinedAnswers >= args.seq) {
          await releaseRoleStartLease(args.roleId, "refine", token);
          return;
        }
        try {
          const answered = session.questions.history[args.seq - 1];
          // A prepared answer still needs its words applied to the Brief. On the
          // Brief screen, an answer without words has nothing left to apply.
          const words = Boolean(answered?.answer?.text);
          if (answered && (words || (!answered.answer?.prepared && session.phase !== "review"))) {
            const chip = answered.chips.find((item) => item.id === answered.answer?.chipId);
            await refineAfterAnswer({
              roleId: args.roleId,
              state: args.state,
              userId: args.userId,
              answerId: answered.id,
              freeText: answered.answer?.text ?? null,
              reason: `질문 '${answered.question}'에 대한 답${chip ? `: ${chip.label}` : ""}`,
              surface: answered.answer?.surface ?? "web",
            });
          }
        } finally {
          await markRoleStartRefined(args.roleId, args.seq);
          await releaseRoleStartLease(args.roleId, "refine", token);
        }
        return;
      }
    }
    await sleep(500);
  }
  console.warn("[role-start] refinement waited too long for an earlier answer", { roleId: args.roleId, seq: args.seq });
}

/** Waits until every answer so far is refined, e.g. before the Brief is confirmed. */
export async function waitForRoleStartRefinements(roleId: string, timeoutMs = REFINE_LEASE_MS + 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = await loadRoleStartSession(roleId, { forView: true });
    if (!session || session.refinedAnswers >= session.questions.history.length) return;
    await sleep(500);
  }
}

/** Stalled-step retry for answers: refine every unrefined answer in order. */
export async function continueRoleStartRefinements(args: Access) {
  const state = await access(args);
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  if (!session) return;
  await refineOpenAnswers({ roleId: args.roleId, state, userId: args.user.id, from: session.refinedAnswers + 1, to: session.questions.history.length });
}

/** Refines answers in order; stops at one that could not be refined, so a stuck answer is waited on once. */
async function refineOpenAnswers(args: { roleId: string; state: RoleCreationState; userId: string; from: number; to: number }) {
  for (let seq = args.from; seq <= args.to; seq += 1) {
    await refineInOrder({ roleId: args.roleId, state: args.state, userId: args.userId, seq });
    const after = await loadRoleStartSession(args.roleId, { forView: true });
    if (!after || after.refinedAnswers < seq) return;
  }
}

/** Criteria whose importance the team chose with a chip answer (by name). */
function teamDecidedLevels(session: RoleStartSession) {
  const names = new Set<string>();
  for (const question of session.questions.history) {
    const chip = question.chips.find((item) => item.id === question.answer?.chipId);
    if (chip && (chip.effect.type === "set_importance" || chip.effect.type === "set_requirement")) names.add(chip.effect.criterion);
  }
  return names;
}

/** Criteria the team named as why a first-three person did not fit. */
function notFitCriteria(session: RoleStartSession) {
  const ids = new Set<string>();
  for (const evaluation of Object.values(session.evaluations)) {
    if (evaluation.rating !== "bad") continue;
    for (const reason of evaluation.reasons ?? []) if (reason.criterionId && !reason.scope) ids.add(reason.criterionId);
  }
  return ids;
}

/** Answers whose words are not in the Brief yet. */
function wordsPending(session: RoleStartSession) {
  return session.questions.history.slice(session.refinedAnswers).some((item) => item.answer?.text);
}

/** The last answer given in words: its refinement tells that the Brief is ready. */
function lastWords(session: RoleStartSession) {
  return [...session.questions.history].reverse().find((item) => item.answer?.text);
}

/**
 * One answer. The next question comes from candidates already ranked by
 * overlap, so the team sees it right away; the model refreshes the Brief
 * (free text) and the candidate questions afterwards, in answer order.
 */
export async function answerRoleStartQuestion(
  args: Access & {
    questionId: string;
    chipId?: string | null;
    text?: string | null;
    skip?: boolean;
    surface?: "web" | "slack";
    /** The answer is the team's own chat message (the chat agent applied it). */
    fromChat?: boolean;
    /** Internal: tries left after a background save changed the session. */
    retries?: number;
  }
): Promise<RoleStartSession> {
  const started = Date.now();
  const state = await access(args);
  const session = await loadRoleStartSession(args.roleId);
  // A flow that failed or ended (the Role registered another way) takes no answers from old cards.
  if (session && isRoleStartEnded(session.phase)) throw new OrgHttpError(409, "이미 끝난 질문이에요.");
  const question = session?.pendingQuestion;
  if (!session || !question || question.id !== args.questionId) {
    throw new OrgHttpError(409, "이미 답한 질문이에요.");
  }
  const chip = args.chipId ? question.chips.find((item) => item.id === args.chipId) : null;
  // A chip on a question the role chat asked carries no preset change; its
  // label is applied like an answer written in the team's words.
  const freeText =
    String(args.text ?? "").trim().slice(0, 2_000) || (chip?.effect.type === "note" ? chip.label : null);
  if (!args.skip && !chip && !freeText) throw new OrgHttpError(400, "답을 골라 주세요.");
  const reason = `질문 '${question.question}'에 대한 답${chip ? `: ${chip.label}` : ""}`;
  let brief = session.brief;
  let applied: string | null = null;
  if (chip) ({ brief, applied } = applyChipEffect(brief, chip.effect, reason));
  const answered: RoleStartQuestion = {
    ...question,
    status: args.skip ? "skipped" : "answered",
    answer: { chipId: chip?.id ?? null, text: freeText, applied, surface: args.surface ?? "web" },
    answeredAt: new Date().toISOString(),
  };
  const history = [...session.questions.history, answered];
  const settled = chipTarget(chip);
  // Prepared follow-ups for this exact answer make the next question immediate.
  const typed = Boolean(String(args.text ?? "").trim());
  // Chips on Harper's own questions (applied as words) use them too; only a
  // typed answer waits for the model.
  const prepared =
    !typed && session.questions.speculative?.questionId === question.id
      ? session.questions.speculative.byChip[chip?.id ?? "skip"] ?? null
      : null;
  // Harper's queued questions stay first; prepared follow-ups replace only the drafted ones.
  const queuedChat = session.questions.candidates.filter(isChatQuestion);
  const remaining = (prepared ? [...queuedChat, ...prepared] : session.questions.candidates).filter(
    (candidate) => !settled || !candidate.chips.every((item) => chipTarget(item) === settled)
  );
  const room = roomForAnotherQuestion(history.length);
  const next: RoleStartQuestion | null =
    room && remaining[0]
      ? { ...remaining[0], status: "pending", overlap: null, askedAt: new Date().toISOString() }
      : null;
  // Claim with the revision so a double click or a Slack + web race applies once.
  // A prepared empty list means no remaining question changes who is shown.
  // With at least the minimum asked and nothing queued, the Brief screen comes
  // now; a worded answer is still applied behind it, and confirming waits
  // for that (confirmRoleStartBrief → waitForRoleStartRefinements).
  // Reference people's questions can fill the limit before the minimum is answered.
  const finished =
    !next && (Boolean(prepared) || history.length >= QUESTION_MINIMUM || !room);
  if (prepared) answered.answer = { ...answered.answer!, prepared: true };
  const saved = await saveRoleStartSession({
    roleId: args.roleId,
    expectedPhase: ["drafting", "questions", "review"],
    expectedRevision: session.revision,
    patch: {
      // Answered while the draft is still being written: the draft saves its
      // questions on top of this answer, so the phase stays as it is.
      phase: session.phase === "drafting" ? "drafting" : finished ? "review" : "questions",
      brief,
      pendingQuestion: next,
      questions: {
        ...session.questions,
        history,
        candidates: remaining.slice(next ? 1 : 0),
        stopped: finished,
        speculative: null,
      },
    },
    timings: {
      [`answer${history.length}ToNextMs`]: Date.now() - started,
      [`answer${history.length}Prepared`]: prepared ? "yes" : "no",
    },
  });
  if (!saved) {
    // A background save (an answer being applied, a chat card) moved the
    // revision; the same question still open means the answer is still wanted.
    const latest = await loadRoleStartSession(args.roleId, { forView: true });
    const retries = args.retries ?? 2;
    if (retries > 0 && latest?.pendingQuestion?.id === args.questionId) return answerRoleStartQuestion({ ...args, retries: retries - 1 });
    throw new OrgHttpError(409, "이미 답한 질문이에요.");
  }
  if (applied) {
    await saveRoleStartBrief({
      roleId: args.roleId,
      brief,
      changeSource: args.surface === "slack" ? "slack_answer" : "answer",
      changeSummary: applied,
      userId: args.user.id,
      writeRole: false,
    });
  }
  if (next) void notifyRoleStartSlack({ kind: "question", session: saved, state }).catch(() => undefined);
  // With words still to apply, the notice goes once they are in (refineAfterAnswer).
  else if (finished && !freeText && session.phase !== "drafting" && !wordsPending(session)) void notifyRoleStartSlack({ kind: "brief_ready", session: saved, state }).catch(() => undefined);
  try {
    await recordRoleStartAnswerInChat({
      roleId: args.roleId,
      workspaceId: args.workspaceId,
      question,
      chip: chip ?? null,
      skipped: Boolean(args.skip),
      text: freeText,
      fromChat: Boolean(args.fromChat),
      userId: args.user.id,
    });
  } catch (error) {
    console.warn("[role-start] chat answer", error);
  }
  await syncChatCards(saved);
  if (question.slack && args.surface !== "slack") {
    // The same question's Slack buttons close with the answer given here.
    const answerText = chip?.label ?? (args.skip ? "건너뛰기" : freeText ?? "");
    runAfterResponse(() => closeRoleStartSlackQuestion({ state, question, answer: answerText }));
  }
  // In answer order across servers; a prepared answer only advances the order.
  runAfterResponse(() => refineInOrder({ roleId: args.roleId, state, userId: args.user.id, seq: history.length }));
  // Follow-ups for the question now on screen start right away, beside this
  // answer's refinement, so the next answer finds them ready.
  if (next) runAfterResponse(() => prefetchFollowUps({ roleId: args.roleId, state }));
  return saved;
}

/**
 * Background, in answer order: apply a free-text answer to the Brief (then
 * replay chips answered meanwhile), rescore changed criteria, and refresh the
 * candidate questions. Fills the open slot if the team is waiting for one.
 */
async function refineAfterAnswer(args: {
  roleId: string;
  state: RoleCreationState;
  userId: string;
  answerId: string;
  freeText: string | null;
  reason: string;
  surface: "web" | "slack";
}) {
  const started = Date.now();
  // Words applied to a Brief that someone else changed meanwhile are applied
  // once more to the new Brief; a failure brings the question back.
  for (let round = 0; round < 2; round += 1) {
    // A second round must finish inside the refine lease; otherwise ask again.
    if (round > 0 && Date.now() - started > REFINE_LEASE_MS / 2) break;
    try {
      const result = await refineOnce({ ...args, started });
      if (result !== "stale") return;
    } catch (error) {
      console.error("[role-start] refine failed", error);
      if (args.freeText) await askAgainAfterFailedRefine(args.roleId, args.answerId, args.state);
      else await fillEmptySlot(args.roleId, args.state);
      return;
    }
  }
  if (args.freeText) await askAgainAfterFailedRefine(args.roleId, args.answerId, args.state);
  else await fillEmptySlot(args.roleId, args.state);
}

async function refineOnce(args: Parameters<typeof refineAfterAnswer>[0] & { started: number }) {
  const { started } = args;
  const session = await loadRoleStartSession(args.roleId);
  if (!session || !["questions", "review"].includes(session.phase)) return;
  // Brief changes made outside answers after this read mean the words must be applied again.
  const baseEdits = session.questions.briefEdits ?? 0;
  const answerIndex = session.questions.history.findIndex((item) => item.id === args.answerId);
  const baseBrief = session.brief;
  // A chip answer is already in the Brief: only the next questions are asked for.
  const { data, usage } = await callRoleStartJson<{
    brief?: RawBrief;
    appliedSummary?: string;
    probes: RawProbe[];
    questions: RawQuestion[];
  }>({
    label: "next_questions",
    model: ROLE_START_FAST_MODEL,
    reasoningEffort: "low",
    schema: args.freeText ? NEXT_QUESTIONS_SCHEMA : NEXT_QUESTIONS_ONLY_SCHEMA,
    system: args.freeText ? buildNextQuestionsSystemPrompt() : buildNextQuestionsOnlySystemPrompt(),
    user: `<ROLE_SOURCE>\n${formatPromptText(roleSource(args.state))}\n</ROLE_SOURCE>
<CURRENT_BRIEF>\n${formatPromptText(briefForModel(baseBrief))}\n</CURRENT_BRIEF>
<ANSWERED_QUESTIONS>\n${formatPromptText(
      session.questions.history.map((item) => ({
        question: item.question,
        status: item.status,
        chip: item.chips.find((c) => c.id === item.answer?.chipId)?.label ?? null,
        freeText: item.answer?.text ?? null,
      }))
    )}\n</ANSWERED_QUESTIONS>
<ALREADY_SHOWN_NEXT>${formatPromptText(
      [session.pendingQuestion, ...session.questions.candidates].filter(Boolean).map((item) => item!.question)
    )}</ALREADY_SHOWN_NEXT>
${args.freeText ? `<LATEST_FREE_TEXT_TO_APPLY>${args.freeText}</LATEST_FREE_TEXT_TO_APPLY>` : ""}`,
  });
  await persistUsage(args.roleId, [usage]);
  const pool = await ensurePool({ roleId: args.roleId, roleName: args.state.role.name, brief: baseBrief, session });
  const result = await applyRefinement({ ...args, data, baseBrief, baseEdits, answerIndex, pool, started });
  if (!result || result === "stale") return result;
  // The words are in from here on: a failure below must not ask the question again.
  try {
    await afterRefinement(args, result);
  } catch (error) {
    console.error("[role-start] after refinement", error);
  }
}

async function afterRefinement(
  args: Parameters<typeof refineAfterAnswer>[0],
  result: Exclude<Awaited<ReturnType<typeof applyRefinement>>, null | "stale">
) {
  const { saved, brief, appliedSummary, fillSlot, nextQuestion } = result;
  if (appliedSummary) {
    await saveRoleStartBrief({
      roleId: args.roleId,
      brief,
      changeSource: args.surface === "slack" ? "slack_answer" : "answer",
      changeSummary: appliedSummary,
      userId: args.userId,
      writeRole: false,
    });
  }
  if (fillSlot) {
    void notifyRoleStartSlack({
      kind: nextQuestion ? "question" : "brief_ready",
      session: saved,
      state: args.state,
    }).catch(() => undefined);
    await syncChatCards(saved);
  } else if (saved.phase === "review" && args.freeText && lastWords(saved)?.id === args.answerId) {
    // The last answer's words landed behind the Brief screen: the Brief is ready now.
    void notifyRoleStartSlack({ kind: "brief_ready", session: saved, state: args.state }).catch(() => undefined);
  }
  // Outside the refine lease, so the next answer's refinement does not wait for it.
  if (saved.pendingQuestion) runAfterResponse(() => prefetchFollowUps({ roleId: args.roleId, state: args.state }));
}

const REFINE_SAVE_ATTEMPTS = 3;

/**
 * Save one refinement against the latest session. An answer saved meanwhile
 * bumps the revision; then the free text is applied again to the new Brief
 * (chips answered later replayed on top) and saved again, up to three times.
 * If it still cannot be saved, a free-text answer is marked as not applied
 * and its question is queued again so the team can answer it once more.
 */
export async function applyRefinement(args: {
  roleId: string;
  state: RoleCreationState;
  answerId: string;
  freeText: string | null;
  reason: string;
  data: { brief?: RawBrief; appliedSummary?: string; probes: RawProbe[]; questions: RawQuestion[] };
  baseBrief: RoleStartBrief;
  /** questions.briefEdits when baseBrief was read; a later edit makes the words stale. */
  baseEdits?: number;
  answerIndex: number;
  pool: RoleStartPool;
  started: number;
  /** Test hook: runs right before each save attempt. */
  beforeSave?: (attempt: number) => Promise<void>;
}) {
  // Drafted questions queued before this answer that it already settles. Each
  // is checked once across save attempts; questions written with this answer
  // already know it and are not checked.
  const settledCache = new Map<string, boolean>();
  const settledByAnswer = async (latest: RoleStartSession) => {
    const answered = latest.questions.history[args.answerIndex];
    const answer = args.freeText && answered ? settlingAnswer(answered) : null;
    if (!answered || !answer) return new Set<string>();
    const unknown = latest.questions.candidates.filter((item) => !isChatQuestion(item) && !settledCache.has(item.id));
    if (unknown.length) {
      const result = await coveredQuestions({
        asked: [],
        drafted: unknown.map((item) => item.question),
        answered: [{ question: answered.question, answer }],
      }).catch((error) => (console.warn("[role-start] settled question check failed", error), null));
      if (result) await persistUsage(args.roleId, [result.usage]);
      unknown.forEach((item, index) => settledCache.set(item.id, Boolean(result?.repeated.includes(index))));
    }
    return new Set([...settledCache].filter(([, settled]) => settled).map(([id]) => id));
  };
  // Filled once (one model call per short question); every save attempt reuses them.
  let filled: ReturnType<typeof questionsWithChips> | null = null;
  for (let attempt = 0; attempt < REFINE_SAVE_ATTEMPTS; attempt += 1) {
    const latest = await loadRoleStartSession(args.roleId);
    if (!latest || !["questions", "review"].includes(latest.phase)) return null;
    let brief = latest.brief;
    let appliedSummary: string | null = null;
    if (args.freeText) {
      if (args.baseEdits !== undefined && (latest.questions.briefEdits ?? 0) !== args.baseEdits) return "stale" as const;
      // Words are always asked for with the full schema, so the Brief is there.
      // The words win over earlier choices; chips answered after that are replayed.
      brief = replayLaterChips({
        rewritten: briefFromRaw(args.data.brief!, args.baseBrief, args.reason),
        history: latest.questions.history,
        answerIndex: args.answerIndex,
      });
      appliedSummary = args.data.appliedSummary || null;
    }
    await scoreCriteria({ pool: args.pool, criteria: brief.criteria });
    // Questions already queued are chosen again with the new ones, not replaced
    // by them; Harper's own questions from the chat stay queued as they are.
    // Behind the Brief screen the questions are over: the queue stays as it is.
    // Queued questions this answer settled are dropped (never asked, never counted).
    const ranked =
      latest.phase === "review"
        ? latest.questions.candidates
        : withoutSettled(
            ...(await Promise.all([
              rankedAfterAnswer(args, latest, brief, (filled ??= questionsWithChips(args.roleId, args.data.questions))),
              settledByAnswer(latest),
            ]))
          );
    const fillSlot = latest.phase === "questions" && !latest.pendingQuestion;
    const nextQuestion: RoleStartQuestion | null =
      fillSlot && roomForAnotherQuestion(latest.questions.history.length) && ranked[0]
        ? { overlap: null, ...ranked[0], status: "pending", askedAt: new Date().toISOString() }
        : null;
    const history = latest.questions.history.map((item) =>
      item.id === args.answerId && appliedSummary
        ? { ...item, answer: { ...item.answer!, applied: appliedSummary } }
        : item
    );
    const probes = probesFromRaw(args.data.probes, brief);
    await args.beforeSave?.(attempt);
    const saved = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: latest.revision,
      patch: {
        brief,
        pool: args.pool,
        ...(fillSlot
          ? { pendingQuestion: nextQuestion, phase: (nextQuestion ? "questions" : "review") as RoleStartPhase }
          : {}),
        questions: {
          ...latest.questions,
          history,
          candidates: (nextQuestion ? ranked.slice(1) : ranked).map((item) => {
            const { status: _status, askedAt: _askedAt, overlap: _overlap, ...candidate } = item as RoleStartQuestion;
            return candidate;
          }),
          probes: probes.length ? probes : latest.questions.probes,
          // Follow-ups prepared before the team's words were applied are stale.
          ...(appliedSummary || args.freeText ? { speculative: null } : {}),
          stopped: fillSlot && !nextQuestion,
        },
      },
      timings: { [`refine${args.answerIndex + 1}Ms`]: Date.now() - args.started, [`refine${args.answerIndex + 1}Attempts`]: attempt + 1 },
    });
    if (saved) return { saved, brief, appliedSummary, fillSlot, nextQuestion };
    console.warn("[role-start] refine lost a race; applying the answer again", { attempt: attempt + 1 });
  }
  // Every save lost a race: words are asked again; a chip answer's empty slot is filled.
  if (args.freeText) await askAgainAfterFailedRefine(args.roleId, args.answerId, args.state);
  else await fillEmptySlot(args.roleId, args.state);
  return null;
}

async function rankedAfterAnswer(
  args: { roleId: string; state: RoleCreationState; data: { questions: RawQuestion[] }; pool: RoleStartPool },
  latest: RoleStartSession,
  brief: RoleStartBrief,
  /** The new questions with chips filled once for this answer; a save retry reuses them. */
  filled: ReturnType<typeof questionsWithChips>
) {
  const chatQueued = latest.questions.candidates.filter(isChatQuestion);
  const draftedQueued = latest.questions.candidates.filter((item) => !isChatQuestion(item));
  const freshCandidates = await filled;
  const known = new Set(draftedQueued.map((item) => item.question.trim()));
  const fresh = await selectNextQuestion({
    roleId: args.roleId,
    roleName: args.state.role.name,
    brief,
    pool: args.pool,
    candidates: [...draftedQueued, ...freshCandidates.filter((item) => !known.has(item.question.trim()))],
    // Questions on screen or queued from the chat count toward the minimum like answered ones.
    askedCount: latest.questions.history.length + (latest.pendingQuestion ? 1 : 0) + chatQueued.length,
  });
  return [...chatQueued, ...(fresh.question ? [fresh.question, ...fresh.remaining] : [])];
}

/** A chip answer whose refinement failed left no question open: ask the next queued one, or open the Brief. */
async function fillEmptySlot(roleId: string, state: RoleCreationState) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latest = await loadRoleStartSession(roleId);
    if (!latest || latest.phase !== "questions" || latest.pendingQuestion) return;
    // At the limit the Brief comes next.
    const [next, ...rest] = roomForAnotherQuestion(latest.questions.history.length) ? latest.questions.candidates : [];
    const saved = await saveRoleStartSession({
      roleId,
      expectedRevision: latest.revision,
      patch: next
        ? { pendingQuestion: { ...next, status: "pending", overlap: null, askedAt: new Date().toISOString() }, questions: { ...latest.questions, candidates: rest } }
        : { phase: "review", questions: { ...latest.questions, stopped: true } },
    });
    if (!saved) continue;
    void notifyRoleStartSlack({ kind: next ? "question" : "brief_ready", session: saved, state }).catch(() => undefined);
    await syncChatCards(saved).catch((error) => console.warn("[role-start] chat card after a failed refinement", error));
    return;
  }
}

/** Mark a free-text answer as not applied and queue its question first, so the team answers it again. */
async function askAgainAfterFailedRefine(roleId: string, answerId: string, state: RoleCreationState) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await loadRoleStartSession(roleId);
    // After the Brief is confirmed the questions are over.
    if (!latest || !["questions", "review"].includes(latest.phase)) return;
    const answered = latest.questions.history.find((item) => item.id === answerId);
    // Asked again already (a later failure on the same answer): once is enough.
    if (!answered || answered.answer?.notApplied) return;
    const again = {
      id: shortId("q"),
      question: answered.question,
      why: "앞서 적어 주신 답을 반영하지 못했어요. 한 번 더 알려 주세요.",
      chips: answered.chips,
    };
    const history = latest.questions.history.map((item) =>
      item.id === answerId ? { ...item, answer: { ...item.answer!, applied: null, notApplied: true } } : item
    );
    // On the Brief screen the question comes back as the open question.
    const askNow = (latest.phase === "questions" || latest.phase === "review") && !latest.pendingQuestion;
    const saved = await saveRoleStartSession({
      roleId,
      expectedRevision: latest.revision,
      patch: {
        ...(askNow
          ? {
              pendingQuestion: { ...again, status: "pending", overlap: null, askedAt: new Date().toISOString() },
              ...(latest.phase === "review" ? { phase: "questions" as const } : {}),
            }
          : {}),
        questions: {
          ...latest.questions,
          history,
          // From the Brief screen the questions were over: only this one comes back.
          candidates: askNow ? (latest.phase === "review" ? latest.questions.candidates.filter(isChatQuestion) : latest.questions.candidates) : [again, ...latest.questions.candidates],
        },
      },
    });
    if (!saved) continue;
    // Slack and the chat card show the question again, as for any new question.
    if (askNow) {
      void notifyRoleStartSlack({ kind: "question", session: saved, state }).catch(() => undefined);
      await syncChatCards(saved).catch((error) => console.warn("[role-start] chat card after asking again", error));
    }
    return;
  }
  console.error("[role-start] could not queue a failed free-text answer again", { roleId });
}

/**
 * While a question is on screen, prepare the follow-up questions for each of
 * its chips and for skipping, so a chip answer shows the next question at
 * once. Free-text answers still go through the refresh after answering.
 */
/** Follow-ups prepared per open question: its chips first, skipping only if there is room. */
export const PREFETCH_MAX_OPTIONS = 5;

async function prefetchFollowUps(args: { roleId: string; state: RoleCreationState }) {
  // Read first: follow-ups are saved only if the Brief is still this one.
  const briefHash = await storedBriefHash(args.roleId);
  const session = await loadRoleStartSession(args.roleId);
  const question = session?.pendingQuestion;
  if (!session || !question || session.questions.speculative?.questionId === question.id) return;
  // One preparation per question and Brief across servers.
  const lease = `prefetch:${question.id}:${briefHash.slice(0, 8)}`;
  const token = await claimRoleStartLease(args.roleId, lease, 180_000);
  if (!token) return;
  try {
    const pool = await ensurePool({ roleId: args.roleId, roleName: args.state.role.name, brief: session.brief, session });
    const options = [
      ...question.chips.map((chip) => ({ key: chip.id, chip })),
      { key: "skip", chip: null as RoleStartChip | null },
    ].slice(0, PREFETCH_MAX_OPTIONS);
    const usage: RoleStartLlmUsage[] = [];
    // Model calls in parallel; ranking runs one at a time on the shared pool.
    const drafted = await Promise.all(
      options.map(async ({ key, chip }) => {
        try {
          const brief = chip ? applyChipEffect(session.brief, chip.effect, "prefetch").brief : session.brief;
          const history = [
            ...session.questions.history,
            { ...question, status: chip ? "answered" : "skipped", answer: { chipId: chip?.id ?? null, text: null, applied: null } },
          ];
          const { data, usage: used } = await callRoleStartJson<{ questions: RawQuestion[] }>({
            label: "next_questions_prefetch",
            model: ROLE_START_FAST_MODEL,
            reasoningEffort: "low",
            // The chip is applied here already; the model only proposes what to ask next.
            schema: NEXT_QUESTIONS_ONLY_SCHEMA,
            system: buildNextQuestionsOnlySystemPrompt(),
            user: `<ROLE_SOURCE>\n${formatPromptText(roleSource(args.state))}\n</ROLE_SOURCE>
<CURRENT_BRIEF>\n${formatPromptText(briefForModel(brief))}\n</CURRENT_BRIEF>
<ANSWERED_QUESTIONS>\n${formatPromptText(
              history.map((item) => ({
                question: item.question,
                status: item.status,
                chip: item.chips.find((c) => c.id === item.answer?.chipId)?.label ?? null,
              }))
            )}\n</ANSWERED_QUESTIONS>`,
          });
          usage.push(used);
          return { key, brief, data, askedCount: history.length };
        } catch (error) {
          console.warn("[role-start] prefetch", error);
          return null;
        }
      })
    );
    await persistUsage(args.roleId, usage);
    const byChip: Record<string, RoleStartQuestionState["candidates"]> = {};
    // Drafted questions already queued compete with the new ones, as in refinement.
    const draftedQueued = session.questions.candidates.filter((item) => !isChatQuestion(item));
    const chatQueued = session.questions.candidates.length - draftedQueued.length;
    for (const item of drafted) {
      if (!item) continue;
      const fresh = await questionsWithChips(args.roleId, item.data.questions);
      const known = new Set(draftedQueued.map((entry) => entry.question.trim()));
      const selected = await selectNextQuestion({
        roleId: args.roleId,
        roleName: args.state.role.name,
        brief: item.brief,
        pool,
        candidates: [...draftedQueued, ...fresh.filter((entry) => !known.has(entry.question.trim()))],
        askedCount: item.askedCount + chatQueued,
      });
      const ranked = selected.question ? [selected.question, ...selected.remaining] : [];
      byChip[item.key] = ranked.map((entry) => {
        const { status: _status, askedAt: _askedAt, overlap: _overlap, ...candidate } = entry as RoleStartQuestion;
        return candidate;
      });
    }
    await saveSpeculativeFollowUps(args.roleId, question.id, byChip, briefHash);
  } finally {
    await releaseRoleStartLease(args.roleId, lease, token);
  }
}

/** Ends questions early; the company can always go straight to the Brief. */
export async function finishRoleStartQuestions(args: Access) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId);
  if (!session) throw new OrgHttpError(404, "시작 정보를 찾을 수 없어요.");
  // Only from the questions: a stale tab must not move a confirmed Role back.
  if (session.phase !== "questions") return session;
  const saved = await saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: session.revision,
    patch: {
      phase: "review",
      pendingQuestion: null,
      questions: { ...session.questions, stopped: true },
    },
  });
  if (session.pendingQuestion) {
    await closeRoleStartQuestionCard({
      roleId: args.roleId,
      workspaceId: args.workspaceId,
      questionId: session.pendingQuestion.id,
    }).catch((error) => console.warn("[role-start] close card", error));
  }
  if (saved) await syncChatCards(saved);
  return saved;
}

// ---------------------------------------------------------------- step 2

export type RoleStartConsistencyIssue = { level: "conflict"; text: string };

/** Deterministic checks across Brief, hard conditions and saved Role facts. */
export function checkBriefConsistency(
  brief: RoleStartBrief,
  role: { workMode?: unknown; locationText?: unknown; description?: unknown }
): RoleStartConsistencyIssue[] {
  const issues: RoleStartConsistencyIssue[] = [];
  const min = brief.hardConditions.find((item) => item.kind === "min_years");
  const max = brief.hardConditions.find((item) => item.kind === "max_years");
  if (min && max && min.kind === "min_years" && max.kind === "max_years" && min.years > max.years) {
    issues.push({ level: "conflict", text: `최소 연차(${min.years}년)가 최대 연차(${max.years}년)보다 커요.` });
  }
  for (const criterion of brief.criteria) {
    const rule = criterion.rule;
    if (!rule) continue;
    if (min && min.kind === "min_years" && rule.maxYears !== null && rule.maxYears < min.years) {
      issues.push({
        level: "conflict",
        text: `'${criterion.name}'의 연차 범위가 필수 조건의 최소 연차(${min.years}년)와 겹치지 않아요.`,
      });
    }
  }
  const workMode = String(role.workMode ?? "");
  const remoteCondition = brief.hardConditions.some((item) => item.kind === "remote_ok");
  if (remoteCondition && (workMode === "onsite" || workMode === "hybrid")) {
    issues.push({
      level: "conflict",
      text: `역할 정보의 근무 형태는 ${workMode === "onsite" ? "대면 근무" : "하이브리드"}인데 필수 조건은 원격 근무예요.`,
    });
  }
  if (!brief.criteria.length) {
    issues.push({ level: "conflict", text: "기준이 하나도 없어요." });
  }
  return issues;
}

/** A screen's Brief save refused because the Brief changed after the screen loaded it. */
export const BRIEF_CHANGED_ELSEWHERE = "그사이 다른 곳에서 바뀌었어요. 새로 불러온 뒤 다시 저장해 주세요.";

/**
 * Applies a Brief edited in the browser onto the stored one. The browser holds
 * only the visible Brief; grade signals, evidence terms, rules and location
 * details come back from the stored version (signals, terms and rules only
 * while the criterion's own text is unchanged).
 */
export function mergeVisibleBriefEdit(
  stored: RoleStartBrief,
  sent: unknown,
  reason: string,
  options: { summaryEdited?: boolean } = {}
): RoleStartBrief {
  const brief = stored;
  const edited = normalizeRoleStartBrief(sent);
  const now = new Date().toISOString();
  edited.criteria = edited.criteria.map((criterion) => {
    const before = brief.criteria.find((item) => item.id === criterion.id);
    const textChanged = !before || before.name !== criterion.name || before.criteria !== criterion.criteria;
    const changed = textChanged || (before ? levelOf(before) !== levelOf(criterion) : true);
    const internal = before
      ? {
          kind: before.kind,
          ...(!textChanged && before.rule ? { rule: before.rule } : {}),
          ...(!textChanged && before.signals ? { signals: before.signals } : {}),
          ...(!textChanged && before.evidenceTerms ? { evidenceTerms: before.evidenceTerms } : {}),
          ...(before.reference ? { reference: before.reference } : {}),
        }
      : {};
    // Where a criterion came from is the Brief's own record, never taken from what was sent.
    const { reference: _sentReference, ...sentCriterion } = criterion;
    return {
      ...sentCriterion,
      ...internal,
      ...(changed ? { changeReason: reason, changedAt: now } : {}),
    };
  });
  const sentIds = (Array.isArray((sent as { hardConditions?: unknown })?.hardConditions)
    ? ((sent as { hardConditions: Array<{ id?: unknown }> }).hardConditions ?? [])
    : []
  ).map((item) => String(item?.id ?? ""));
  edited.hardConditions = sentIds.flatMap((id) => {
    const storedCondition = brief.hardConditions.find((item) => item.id === id);
    const sentCondition = edited.hardConditions.find((item) => item.id === id);
    if (storedCondition && ["location", "remote_ok", "other"].includes(storedCondition.kind)) return [storedCondition];
    return sentCondition ? [sentCondition] : storedCondition ? [storedCondition] : [];
  });
  edited.keywords = brief.keywords;
  if (brief.titles) edited.titles = brief.titles;
  // Reference people are kept as stored; an edit never adds or changes them.
  if (brief.references?.length) edited.references = brief.references;
  else delete edited.references;
  // A summary the team wrote stays theirs (it now counts as up to date);
  // otherwise the stored one stays, with the key it was written for, and follows the criteria.
  if (options.summaryEdited && edited.summary !== brief.summary) edited.summaryOf = summaryKey(edited);
  else {
    edited.summary = brief.summary;
    if (brief.summaryOf) edited.summaryOf = brief.summaryOf;
    else delete edited.summaryOf;
  }
  return edited;
}

export async function saveRoleStartBriefEdit(
  args: Access & {
    brief?: unknown;
    request?: string | null;
    /** visibleBriefHash of the Brief the screen loaded; a Brief changed since then is not overwritten. */
    briefHash?: string;
    /** The screen's summary was edited by the team (otherwise the stored, maybe newer, summary stays). */
    summaryEdited?: boolean;
  }
) {
  const state = await access(args);
  // An answer still being applied would otherwise rebuild the Brief over this edit.
  await waitForRoleStartRefinements(args.roleId);
  const session = await loadRoleStartSession(args.roleId);
  if (!session) throw new OrgHttpError(404, "시작 정보를 찾을 수 없어요.");
  if (!["questions", "review"].includes(session.phase)) {
    throw new OrgHttpError(409, "확정한 뒤에는 역할 화면에서 기준을 고쳐 주세요.");
  }
  if (args.briefHash !== undefined && visibleBriefHash(session.brief) !== args.briefHash) {
    throw new OrgHttpError(409, BRIEF_CHANGED_ELSEWHERE);
  }
  let brief = session.brief;
  let summary: string | null = null;
  let probes = session.questions.probes;
  if (args.brief) {
    brief = mergeVisibleBriefEdit(brief, args.brief, "확인 화면에서 직접 수정", { summaryEdited: args.summaryEdited });
    summary = "확인 화면에서 직접 수정";
  }
  const request = String(args.request ?? "").trim().slice(0, 4_000);
  if (request) {
    const { data, usage } = await callRoleStartJson<{
      brief: RawBrief;
      appliedSummary: string;
      probes: RawProbe[];
      questions: RawQuestion[];
    }>({
      label: "brief_edit",
      model: ROLE_START_FAST_MODEL,
      reasoningEffort: "low",
      schema: NEXT_QUESTIONS_SCHEMA,
      system: buildBriefEditSystemPrompt(),
      user: `<ROLE_SOURCE>\n${formatPromptText(roleSource(state))}\n</ROLE_SOURCE>
<CURRENT_BRIEF>\n${formatPromptText(briefForModel(brief))}\n</CURRENT_BRIEF>
<TEAM_REQUEST>${request}</TEAM_REQUEST>`,
    });
    await persistUsage(args.roleId, [usage]);

    brief = briefFromRaw(data.brief, brief, `요청: ${request.slice(0, 200)}`);
    const nextProbes = probesFromRaw(data.probes, brief);
    if (nextProbes.length) probes = nextProbes;
    summary = data.appliedSummary || "요청에 맞춰 수정";
  }
  if (!summary) return { session, issues: checkBriefConsistency(session.brief, state.role as never) };
  // A change made meanwhile that the screen would show (an answer, another tab) is
  // not overwritten; a background grade-signals write during the request is not one.
  const latest = await loadRoleStartSession(args.roleId);
  const saved =
    latest && visibleBriefHash(latest.brief) === visibleBriefHash(session.brief)
      ? await saveRoleStartSession({
          roleId: args.roleId,
          expectedRevision: latest.revision,
          expectedPhase: ["questions", "review"],
          patch: {
            brief: (brief = withLatestBackground(brief, latest.brief, session.brief)),
            questions: { ...latest.questions, probes, speculative: null, briefEdits: (latest.questions.briefEdits ?? 0) + 1 },
          },
        })
      : null;
  if (!saved) throw new OrgHttpError(409, "그사이 Brief가 바뀌었어요. 다시 확인한 뒤 고쳐 주세요.");
  await saveRoleStartBrief({
    roleId: args.roleId,
    brief,
    changeSource: request ? "review_request" : "review_edit",
    changeSummary: summary,
    userId: args.user.id,
    writeRole: false,
  });
  return { session: saved, applied: summary, issues: checkBriefConsistency(brief, state.role as never) };
}

/**
 * The role chat calibrated the Hiring Brief from a reference person. With a
 * role start Brief, the result goes in as a Brief change request (the same
 * path as the Brief screen's change box, or the board panel once confirmed)
 * instead of replacing the saved text alone. Returns false when the Role has
 * no role start Brief, so the chat keeps its own path, and "drafting" when
 * the first draft is still being written (the chat asks again later).
 */
export async function applyCalibrationToRoleStart(args: Access & { hiringBrief: string }) {
  if (!(await hasRoleStartBrief(args.roleId))) {
    // A draft still being written counts too: wait for it (it takes about a minute).
    const drafting = await loadRoleStartSession(args.roleId, { forView: true });
    if (drafting?.phase !== "drafting") return false;
  }
  // A chat turn waits a short while only; a draft still running is answered with "drafting".
  for (let waited = 0; waited < 30_000; waited += 1_000) {
    const current = await loadRoleStartSession(args.roleId, { forView: true });
    if (!current || current.phase !== "drafting") break;
    await sleep(1_000);
  }
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  if (session?.phase === "drafting") return "drafting" as const;
  if (!session || isRoleStartEnded(session.phase)) return false;
  const request = `참고 인물에서 읽은 기준을 반영해 주세요. 아래는 그 인물을 바탕으로 다시 쓴 채용 요구예요:\n${args.hiringBrief}`.slice(0, 4_000);
  if (["questions", "review"].includes(session.phase)) {
    await saveRoleStartBriefEdit({ ...args, request });
  } else {
    const { updateRoleRubric } = await import("./rubricUpdate");
    const result = await updateRoleRubric({ ...args, request, source: "filter_panel" });
    runAfterResponse(() => result.run());
  }
  return true;
}

/**
 * A chat edit of a registered Role's Brief text or criteria list. With a role
 * start Brief neither is written on its own: a new list goes in as the
 * 매칭 기준 tab's would, changed text as words (only the lines that changed),
 * and both are then written again from the one Brief. Grade signals are not
 * the chat's to set; they are rewritten for criteria whose text changed.
 * False when the Role is not a registered one with a role start Brief (the
 * chat writes as before; a draft's Brief follows through
 * applyChatCriteriaToRoleStart). Otherwise the Brief as saved, and whether
 * anything changed (a list equal to the Brief's is not saved again).
 */
export async function applyChatEditToRoleStart(
  args: Access & {
    previousRequest: string | null;
    request?: string | null;
    criteria?: OrgRoleCriterion[];
    /** The list an edit was made against; a different saved list means someone changed it meanwhile. */
    expectedCriteria?: unknown;
    historySource?: string;
  }
) {
  if (!(await isRegisteredRoleStartRole(args.roleId, args.workspaceId))) return false;
  if (args.expectedCriteria !== undefined) {
    const sql = roleStartSql();
    const [row] = await sql<Array<{ criteria: unknown }>>`select criteria from public.company_internal_roles where role_id = ${args.roleId}`;
    const key = (value: unknown) => JSON.stringify(normalizeOrgRoleCriteria(value).map((item) => [item.name, item.criteria, item.requirement ?? null, item.importance ?? null]));
    if (key(row?.criteria) !== key(args.expectedCriteria)) throw new OrgHttpError(409, "그사이 평가 기준이 바뀌었어요. 다시 확인한 뒤 고쳐 주세요.");
  }
  const { updateRoleRubric } = await import("./rubricUpdate");
  let brief = (await loadRoleStartSession(args.roleId, { forView: true }))?.brief ?? null;
  // Only the last update's re-judging runs: it also judges rows the earlier one left pending.
  let last: (() => Promise<void>) | null = null;
  // The 매칭 기준 tab shows the Brief locked while this edit runs.
  await upsertRoleStartProgress(args.roleId, { key: CHAT_BRIEF_EDIT, text: "", status: "running" });
  let failed = true;
  try {
    // A list given with the text goes in first, exactly as given; the text's changed lines after it.
    // Compared as the Brief would hold it (at most six, levels filled in).
    const key = (items: OrgRoleCriterion[]) =>
      JSON.stringify(
        normalizeRoleStartBrief({ summary: "", hardConditions: [], criteria: items }).criteria.map((item) => [
          item.name, item.criteria, item.requirement ?? null, item.importance ?? null,
        ])
      );
    if (args.criteria && (!brief || key(args.criteria) !== key(brief.criteria))) {
      const result = await updateRoleRubric({ ...args, historySource: args.historySource ?? "chat", savedCriteria: args.criteria, source: "matching_tab" });
      brief = result.brief;
      last = result.run;
    }
    if (args.request !== undefined) {
      const before = new Set(lines(args.previousRequest));
      const after = new Set(lines(args.request));
      const removed = [...before].filter((line) => !after.has(line));
      const added = [...after].filter((line) => !before.has(line));
      if (removed.length || added.length) {
        const request = [
          "채팅에서 Brief 글을 아래처럼 고쳤어요. 같은 뜻이 되도록 Brief를 고쳐 주세요.",
          removed.length ? `뺀 줄:\n${removed.map((line) => `- ${line}`).join("\n")}` : "",
          added.length ? `넣은 줄:\n${added.map((line) => `+ ${line}`).join("\n")}` : "",
        ].filter(Boolean).join("\n");
        const result = await updateRoleRubric({ ...args, request, source: "filter_panel" });
        brief = result.brief;
        last = result.run;
      }
    }
    failed = false;
  } finally {
    await upsertRoleStartProgress(args.roleId, { key: CHAT_BRIEF_EDIT, text: "", status: failed ? "error" : "done" }).catch(() => undefined);
    // A second update that failed still leaves the first one's rows to be judged.
    const run = last;
    if (run) runAfterResponse(() => run());
  }
  if (!brief) throw new OrgHttpError(500, "기준을 불러오지 못했어요.");
  return { brief, changed: last !== null };
}

function lines(text: string | null | undefined) {
  return String(text ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
}

// ---------------------------------------------------------------- reference people

/**
 * A change to the Brief from a reference person, on the latest Brief. Before
 * confirming it is a Brief edit like any other (the draft keeps references
 * saved while it runs); once confirmed it goes through the board panel's
 * path, so the saved Brief text and the criteria list change together.
 */
async function saveReferenceChange(args: Access & { apply: (brief: RoleStartBrief) => RoleStartBrief; summary: string }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const session = await loadRoleStartSession(args.roleId);
    if (!session || isRoleStartEnded(session.phase)) throw new OrgHttpError(409, "이 역할의 Brief를 찾을 수 없어요.");
    const brief = args.apply(session.brief);
    // Before confirming, and for a change to the reference list alone (nothing the
    // criteria or the Role's text show), the session is written directly.
    if (["drafting", "questions", "review"].includes(session.phase) || visibleBriefHash(brief) === visibleBriefHash(session.brief)) {
      const saved = await saveRoleStartSession({
        roleId: args.roleId,
        expectedRevision: session.revision,
        patch: {
          brief,
          questions: { ...session.questions, speculative: null, briefEdits: (session.questions.briefEdits ?? 0) + 1 },
        },
      });
      if (!saved) continue;
      // A draft still running writes its own first version; this one would carry no criteria.
      if (session.phase !== "drafting") {
        await saveRoleStartBrief({ roleId: args.roleId, brief, changeSource: "reference", changeSummary: args.summary, userId: args.user.id, writeRole: false });
      }
      return brief;
    }
    const { updateRoleRubric } = await import("./rubricUpdate");
    try {
      const result = await updateRoleRubric({ ...args, change: { apply: args.apply, summary: args.summary }, source: "reference" });
      const run = result.run;
      runAfterResponse(() => run());
      return result.brief;
    } catch (error) {
      if (error instanceof OrgHttpError && error.status === 409 && attempt < 3) continue;
      throw error;
    }
  }
  throw new OrgHttpError(409, "그사이 Brief가 바뀌었어요. 다시 말씀해 주세요.");
}

/**
 * The team gave reference people in the 참고 인물 box. Each is read once (a
 * link that opens, or a profile; never guessed from a URL or a name) and
 * recorded apart from the criteria. Nothing is asked here.
 */
export async function addRoleStartReferences(args: Access & { rows: RoleStartReferenceRow[] }) {
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  if (!session || isRoleStartEnded(session.phase) || session.phase === "drafting") return null;
  const known = session.brief.references ?? [];
  // A link already recorded, or given twice at once, is read once; its 마음에 든 점 goes to that person.
  const rows = args.rows.filter((_, index) => !isRepeatedLink(args.rows, index, known));
  const sources = await loadReferenceSources(rows);
  const room = ROLE_START_MAX_REFERENCES - known.length;
  if (!sources.length || room <= 0) return repeatedLinkAnswers(args.rows, known, known);
  const { references, usage } = await readReferences({
    brief: session.brief,
    sources: sources.slice(0, room),
    labels: known.map((item) => item.label),
  });
  await persistUsage(args.roleId, usage);
  const added = references.map(({ sourceKey, ...reference }) => ({
    reference: { ...reference, liked: [], notUsed: [], waiting: [], answered: false },
    // What the team liked in this person's row, read from the source it came from.
    liked: sources.find((source) => source.key === sourceKey)?.liked ?? null,
  }));
  if (!added.length) return repeatedLinkAnswers(args.rows, known, known);
  const saved = await saveReferenceChange({
    ...args,
    apply: (brief) => {
      // Two adds at once: the later one keeps only who still fits, never pushing out an earlier person.
      const current = brief.references ?? [];
      return { ...brief, references: [...current, ...added.map((item) => item.reference).slice(0, Math.max(0, ROLE_START_MAX_REFERENCES - current.length))] };
    },
    summary: `참고 인물 ${added.length}명 기록`,
  });
  // A Harper talent matched from a link is kept out of this Role's start-flow picks
  // (referenceTalentIds) without any record the company could see.
  return [...added, ...repeatedLinkAnswers(args.rows, known, saved.references ?? [])];
}

/**
 * The team's answer about one reference person: accepted traits become
 * 평가 기준 (있으면 좋음 unless the team said 없으면 추천 안 함), the rest is
 * recorded as not used, and a conflict changes the Brief only when the team
 * asked for it (a Brief edit in their words). No answer keeps the Brief.
 */
export async function answerRoleStartReference(args: Access & { referenceId?: string | null; answer: string; again?: boolean }) {
  // Criteria added while the draft runs would be replaced by it: wait for it, briefly.
  for (let waited = 0; waited < 20_000; waited += 1_000) {
    const current = await loadRoleStartSession(args.roleId, { forView: true });
    if (current?.phase !== "drafting") break;
    await sleep(1_000);
  }
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  if (session?.phase === "drafting") throw new OrgHttpError(409, "Brief를 아직 쓰고 있어요. 잠시 뒤 다시 말씀해 주세요.");
  // `again`: a box row about a person already answered adds to that answer.
  const open = (session?.brief.references ?? []).filter((reference) => args.again || !reference.answered);
  // A given id must match exactly; only with no id does the single open person stand in.
  const reference = args.referenceId ? open.find((item) => item.id === args.referenceId) : open.length === 1 ? open[0] : undefined;
  if (!session || !reference) throw new OrgHttpError(404, "답할 참고 인물을 찾을 수 없어요.");
  const mapped = await mapReferenceAnswer({ brief: session.brief, reference, answer: args.answer });
  await persistUsage(args.roleId, [mapped.usage]);
  let applied: string[] = [];
  let waiting: string[] = [];
  let already = false;
  const brief = await saveReferenceChange({
    ...args,
    apply: (current) => {
      const target = current.references?.find((item) => item.id === reference.id);
      // Answered meanwhile (a second message): the first answer stands.
      if (!target || (target.answered && !args.again)) {
        already = true;
        return current;
      }
      const result = applyAcceptedTraits(current, target, mapped.accepted, mapped.required);
      applied = result.applied;
      waiting = result.waiting;
      return {
        ...result.brief,
        references: (current.references ?? []).map((item) =>
          item.id === reference.id
            ? {
                ...item,
                liked: [...new Set([...item.liked, ...result.applied])],
                notUsed: [...new Set([...item.notUsed, ...mapped.notUsed])],
                waiting: [...new Set([...item.waiting, ...result.waiting])],
                conflicts: item.conflicts.map((conflict) =>
                  conflict.id === mapped.conflict?.id ? { ...conflict, answer: mapped.changeForConflict ?? "지금 기준 유지" } : conflict
                ),
                answered: true,
              }
            : item
        ),
      };
    },
    summary: `${reference.label}에게서 ${mapped.accepted.length}개 받아들임`,
  });
  if (already) {
    return { accepted: [], notUsed: [], waiting: [], conflictChange: null, conflictChanged: false, alreadyAnswered: true, criteria: brief.criteria.map((criterion) => criterion.name) };
  }
  // The team asked to change the Brief over a conflict (or named years): their words, as a Brief edit.
  let conflictChanged = false;
  if (mapped.changeForConflict) {
    // The points they liked are already applied: the edit changes only what the question asked.
    const request = [
      mapped.conflict ? `${reference.label} 질문: ${mapped.conflict.question}` : null,
      "마음에 든 점은 이미 평가 기준에 들어가 있어요. 이 질문이 묻는 것만 바꿔 주세요.",
      `${reference.label} 질문에 대한 답: ${mapped.changeForConflict}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const phase = (await loadRoleStartSession(args.roleId, { forView: true }))?.phase;
      if (phase === "questions" || phase === "review") await saveRoleStartBriefEdit({ ...args, request });
      else {
        const { updateRoleRubric } = await import("./rubricUpdate");
        const result = await updateRoleRubric({ ...args, request, source: "filter_panel" });
        runAfterResponse(() => result.run());
      }
      conflictChanged = true;
    } catch (error) {
      console.warn("[role-start] reference conflict change", error);
      // Not applied: the conflict stays open, so the team can be asked again.
      await saveReferenceChange({
        ...args,
        apply: (current) => ({
          ...current,
          references: (current.references ?? []).map((item) =>
            item.id === reference.id
              ? { ...item, conflicts: item.conflicts.map((conflict) => (conflict.id === mapped.conflict?.id ? { ...conflict, answer: null } : conflict)) }
              : item
          ),
        }),
        summary: `${reference.label} 충돌 답 반영 실패`,
      }).catch(() => undefined);
    }
  }
  return {
    alreadyAnswered: false,
    accepted: applied,
    notUsed: mapped.notUsed,
    waiting,
    conflictChange: mapped.changeForConflict,
    conflictChanged,
    criteria: brief.criteria.map((criterion) => criterion.name),
  };
}

/**
 * Rows from the 참고 인물 box. While the draft is written they wait in the
 * session and are read right after it is saved, so the draft is never slowed;
 * once the Brief exists they are read in the background now. Nothing is asked:
 * a row's 마음에 든 점 is applied as the team's answer, and a person without
 * one is only recorded (a conflict stays unanswered, the Brief as it is).
 */
export async function submitRoleStartReferences(args: Access & { rows: RoleStartReferenceRow[] }) {
  await access(args);
  const rows = args.rows.slice(0, MAX_REFERENCE_ROWS);
  if (!rows.length) throw new OrgHttpError(400, "링크나 프로필을 넣어 주세요.");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const session = await loadRoleStartSession(args.roleId, { forView: true });
    if (!session || isRoleStartEnded(session.phase)) throw new OrgHttpError(409, "Brief를 쓰기 시작한 뒤에 넣을 수 있어요.");
    const waiting = session.questions.pendingReferences ?? [];
    const known = session.brief.references ?? [];
    // A row repeating a recorded person's link (or an earlier row, waiting ones included) adds to that person, not a new one.
    const all = [...waiting, ...rows];
    const fresh = all.filter((_, index) => !isRepeatedLink(all, index, known)).length;
    if (known.length + fresh > ROLE_START_MAX_REFERENCES) {
      throw new OrgHttpError(400, "참고 인물은 역할마다 5명까지 넣을 수 있어요.");
    }
    if (session.phase !== "drafting") {
      runAfterResponse(() => processReferenceRows({ ...args, rows }));
      return { queued: false };
    }
    const saved = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: session.revision,
      expectedPhase: "drafting",
      patch: { questions: { ...session.questions, pendingReferences: [...waiting, ...rows] } },
    });
    if (saved) return { queued: true };
  }
  throw new OrgHttpError(409, "그사이 Brief가 바뀌었어요. 다시 넣어 주세요.");
}

/** Reads the box's rows into reference people, then applies each row's 마음에 든 점 to its person. */
async function processReferenceRows(args: Access & { rows: RoleStartReferenceRow[] }) {
  const added = await addRoleStartReferences(args);
  for (const { reference, liked } of added ?? []) {
    if (!liked) continue;
    await answerRoleStartReference({ ...args, referenceId: reference.id, answer: liked, again: true }).catch((error) =>
      console.warn("[role-start] reference box answer", error)
    );
  }
}

/**
 * Takes a person off the Brief's 참고 인물. 평가 기준 already added from them
 * stay (the team deletes those in the Brief).
 */
export async function removeRoleStartReference(args: Access & { referenceId: string }) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  const reference = session?.brief.references?.find((item) => item.id === args.referenceId);
  if (!session || isRoleStartEnded(session.phase) || !reference) throw new OrgHttpError(404, "뺄 참고 인물을 찾을 수 없어요.");
  await saveReferenceChange({ ...args, apply: (brief) => withoutReference(brief, args.referenceId), summary: `${reference.label} 뺌` });
}

/**
 * The team changed the role's location or work arrangement on the first step
 * after the Brief started. Only the changed fields are written into the
 * Brief's conditions, in code (roleInfoConditions.ts), on the latest Brief:
 * after the draft (which applies changes made while it ran) and after any
 * answer still being applied, so neither overwrites the other. Questions only
 * about a changed field leave the queue.
 */
export async function applyRoleInfoToRoleStart(args: Access & { fields: RoleInfoField[] }) {
  const fields = args.fields.filter((field): field is RoleInfoField => field === "location" || field === "workMode");
  if (!fields.length) return;
  // A draft runs about a minute; with the refinement wait below this stays inside the route's 300 s.
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const current = await loadRoleStartSession(args.roleId, { forView: true });
    // No session yet: the Brief has not started and will read the role as it is now.
    if (!current || !["drafting", "questions", "review"].includes(current.phase)) return;
    if (current.phase !== "drafting") break;
    await sleep(1_000);
  }
  if ((await loadRoleStartSession(args.roleId, { forView: true }))?.phase === "drafting") {
    console.warn("[role-start] role info not applied: the draft is still running", { roleId: args.roleId, fields });
    return;
  }
  await waitForRoleStartRefinements(args.roleId);
  const state = await access(args);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const session = await loadRoleStartSession(args.roleId);
    if (!session || !["questions", "review"].includes(session.phase)) return;
    const brief = briefWithRoleInfo(session.brief, state.role, fields);
    if (JSON.stringify(brief.hardConditions) === JSON.stringify(session.brief.hardConditions)) return;
    const saved = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: session.revision,
      patch: {
        brief,
        questions: {
          ...session.questions,
          candidates: session.questions.candidates.filter((item) => !asksRoleInfo(item, fields)),
          speculative: null,
          briefEdits: (session.questions.briefEdits ?? 0) + 1,
        },
      },
    });
    if (!saved) continue;
    await saveRoleStartBrief({
      roleId: args.roleId,
      brief,
      changeSource: "role_info",
      changeSummary: "역할 정보의 근무 지역·근무 형태를 반영했어요.",
      userId: args.user.id,
      writeRole: false,
    });
    return;
  }
}

/** The broad pool, reused while fresh; rebuilt from the current Brief otherwise. */
async function ensurePool(args: {
  roleId: string;
  roleName: string;
  brief: RoleStartBrief;
  session: RoleStartSession;
}): Promise<RoleStartPool> {
  const pool = args.session.pool;
  if (pool && Array.isArray(pool.members) && Date.now() - Date.parse(pool.builtAt) < ROLE_START_POOL_TTL_MS) {
    await ensureJobScores({ pool, brief: args.brief });
    return pool;
  }
  // Same text as the first pool (the JD), so the first three and the first
  // batch are drawn from candidates found the same way.
  const role = pool?.queryText
    ? null
    : (await roleStartSql()<Array<{ description: string | null }>>`
        select description from public.company_roles where role_id = ${args.roleId}
      `)[0];
  const rebuilt = await buildBroadPool({
    roleId: args.roleId,
    queryText: pool?.queryText ?? jdQueryText({ roleName: args.roleName, description: role?.description ?? null }),
    excludeIds: [],
  });
  await completePool({ pool: rebuilt, roleId: args.roleId, brief: args.brief });
  if (pool && Array.isArray(pool.members) && pool.scores) {
    // Only people who are new or whose profile changed since the last pool
    // are scored again; the others keep their criterion scores.
    const present = new Set(rebuilt.members.map((member) => member.talentId));
    const common = pool.members.map((member) => member.talentId).filter((id) => present.has(id));
    const changed = new Set(
      common.length
        ? (
            await roleStartSql()<Array<{ talent_id: string }>>`
              select distinct talent_id::text as talent_id from public.talent_profile_chunk_embeddings
              where talent_id = any(${common}::uuid[]) and updated_at > ${pool.builtAt}::timestamptz
            `
          ).map((row) => row.talent_id)
        : []
    );
    for (const [hash, map] of Object.entries(pool.scores)) {
      rebuilt.scores[hash] = Object.fromEntries(
        Object.entries(map).filter(([id]) => present.has(id) && !changed.has(id))
      );
    }
    rebuilt.timings.carriedScores = common.length - changed.size;
  }
  return rebuilt;
}


/**
 * Brief review: pick the first three from the current Brief and write their
 * verdicts now, so confirmation only computes what changed. Re-run after each
 * edit; a verdict whose Brief changed before it finished is counted as discarded.
 */
export async function prepareRoleStartFirstThree(roleId: string) {
  let session = await loadRoleStartSession(roleId);
  if (!session || session.phase !== "review") return;
  const hash = verdictBriefHash(session.brief);
  // One preparation per Brief at a time, across servers.
  const lease = `prepare:${hash}`;
  const token = await claimRoleStartLease(roleId, lease, 180_000);
  if (!token) return;
  const started = Date.now();
  try {
    const sql = roleStartSql();
    const role = (await sql<Array<{ name: string }>>`select name from public.company_roles where role_id = ${roleId}`)[0];
    const pool = await ensurePool({ roleId, roleName: role?.name ?? "", brief: session.brief, session });
    await scoreCriteria({ pool, criteria: session.brief.criteria });
    const { ranked } = rankPool({ pool, brief: session.brief, excludeIds: referenceTalentIds(session.brief) });
    const picked = pickFirstThree({ ranked, probes: session.questions.probes, criteria: session.brief.criteria });
    await saveRoleStartSession({ roleId, expectedPhase: "review", patch: { pool }, timings: { prewarmMs: Date.now() - started } });
    const missing = picked.filter((member) => session!.prepared.entries[member.talentId]?.briefHash !== hash);
    if (!missing.length) return;
    const profiles = await loadRoleStartProfiles(missing.map((member) => member.talentId));
    const usage: RoleStartLlmUsage[] = [];
    // Confirming while these run waits for them instead of judging the same people again.
    await savePreparedInflight(roleId, {
      briefHash: hash,
      talentIds: missing.map((member) => member.talentId),
      until: new Date(Date.now() + PREPARED_WAIT_MS).toISOString(),
    });
    await Promise.all(
      missing.map(async (member) => {
        const profile = profiles.get(member.talentId);
        if (!profile) return;
        try {
          const result = await writeVerdict({ roleName: role?.name ?? "", brief: session!.brief, profile, probe: member.probe });
          usage.push(result.usage);
          const latest = await loadRoleStartSession(roleId);
          // Kept while the Brief is the same: under review, or confirmed meanwhile
          // (the first three then use it). A changed Brief discards it.
          const stillCurrent =
            latest && verdictBriefHash(latest.brief) === hash && ["review", "searching", "evaluating"].includes(latest.phase);
          if (!stillCurrent) {
            await addPreparedStats(roleId, { prepared: 1, preparedUsd: result.usage.usd ?? 0, discarded: 1, discardedUsd: result.usage.usd ?? 0 });
            return;
          }
          const replaced = latest.prepared.entries[member.talentId];
          if (replaced && replaced.briefHash !== hash) {
            await addPreparedStats(roleId, { discarded: 1, discardedUsd: replaced.usd ?? 0 });
          }
          await savePreparedEntry(roleId, member.talentId, {
            briefHash: hash,
            verdict: result.verdict,
            usd: result.usage.usd,
            ms: result.usage.ms,
            at: new Date().toISOString(),
          });
          await addPreparedStats(roleId, { prepared: 1, preparedUsd: result.usage.usd ?? 0 });
        } catch (error) {
          console.warn("[role-start] prepared verdict", error);
        }
      })
    );
    await persistUsage(roleId, usage);
    session = await loadRoleStartSession(roleId);
  } finally {
    await releaseRoleStartLease(roleId, lease, token);
  }
}

/** How long confirming waits for a verdict prepared during review before judging the person itself. */
const PREPARED_WAIT_MS = 90_000;

/**
 * A verdict for this person and this Brief that review-time preparation is
 * still writing: wait for it (same model input and output, judged once).
 * Null when none is in flight, the Brief differs, or it does not arrive in time.
 */
async function waitForPreparedVerdict(
  roleId: string,
  talentId: string,
  briefHash: string,
  inflight: RoleStartPreparedInflight | null
) {
  if (!inflight || inflight.briefHash !== briefHash || !inflight.talentIds.includes(talentId)) return null;
  const until = Date.parse(inflight.until);
  while (Date.now() < until) {
    const entry = (await loadRoleStartSession(roleId))?.prepared.entries[talentId];
    if (entry?.briefHash === briefHash) return entry.verdict;
    // The preparation gave up on this person (its lease is gone and nothing was written).
    if (!(await roleStartLeaseHeld(roleId, `prepare:${briefHash}`))) {
      const last = (await loadRoleStartSession(roleId))?.prepared.entries[talentId];
      return last?.briefHash === briefHash ? last.verdict : null;
    }
    await sleep(500);
  }
  return null;
}

/** Kept for the review screen call; preparation includes the pool refresh. */
export async function prewarmRoleStartPool(roleId: string) {
  // The first three are judged against the final Brief: answers still being
  // applied behind the Brief screen finish first.
  await waitForRoleStartRefinements(roleId);
  return prepareRoleStartFirstThree(roleId);
}

export async function confirmRoleStartBrief(args: Access & { acknowledgeWarnings?: boolean }) {
  const state = await access(args);
  await waitForRoleStartRefinements(args.roleId);
  // Grade signals for criteria edited just before confirming (usually already written).
  await refreshRoleStartSignals(args.roleId, { wait: true }).catch((error) => console.warn("[role-start] signals before confirm", error));
  const session = await loadRoleStartSession(args.roleId);
  if (!session) throw new OrgHttpError(404, "시작 정보를 찾을 수 없어요.");
  if (!["questions", "review"].includes(session.phase)) {
    throw new OrgHttpError(409, "이미 확정했어요.");
  }
  // A new confirmation starts a new registration: an earlier stopped one no longer applies.
  if (session.progress.some((item) => item.key === "batch:choose" && item.status === "error")) {
    await step(args.roleId, "batch", "choose", "running");
  }
  // Words still being applied after the wait would be dropped by confirming now.
  if (wordsPending(session)) {
    throw new OrgHttpError(409, "마지막 답을 아직 Brief에 반영하고 있어요. 잠시 뒤 다시 눌러 주세요.");
  }
  const issues = checkBriefConsistency(session.brief, state.role as never);
  if (issues.some((issue) => issue.level === "conflict")) {
    return { session, issues, started: false };
  }
  await saveRoleStartBrief({
    roleId: args.roleId,
    brief: session.brief,
    changeSource: "confirmed",
    changeSummary: "Brief 확정",
    userId: args.user.id,
    writeRole: true,
  });
  const saved = await saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: session.revision,
    patch: { phase: "searching", pendingQuestion: null, firstCandidates: [] },
    timings: { confirmedAt: new Date().toISOString(), firstThreeShownMs: null, firstThreeVerdictsMs: null },
  });
  if (!saved) throw new OrgHttpError(409, "다른 곳에서 먼저 확정했어요.");
  return { session: saved, issues, started: true };
}

/** Before registration the team can go back, change the Brief and get a new first three. */
export async function reopenRoleStartReview(args: Access) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId);
  if (!session || !["evaluating", "review"].includes(session.phase)) {
    throw new OrgHttpError(409, "등록한 뒤에는 Brief로 돌아갈 수 없어요.");
  }
  return saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: session.revision,
    patch: { phase: "review", firstCandidates: [], evaluations: {} },
  });
}

// ---------------------------------------------------------------- step 3

function candidateFromRanked(
  member: RankedMember & { probe: RoleStartProbe | null },
  brief: RoleStartBrief,
  profile: { name: string | null; headline: string | null; location: string | null; current: string | null } | undefined
): RoleStartCandidate {
  return {
    talentId: member.talentId,
    name: profile?.name ?? null,
    headline: profile?.headline ?? null,
    location: profile?.location ?? null,
    current: profile?.current ?? null,
    years: member.years,
    ...(member.yearsBasis ? { yearsBasis: member.yearsBasis } : {}),
    locationKnown: Boolean(member.countryCode || member.city),
    probe: member.probe,
    overall: Math.round(member.overall * 1000) / 1000,
    scores: brief.criteria.map((criterion) => {
      const score = member.perCriterion[criterion.id ?? criterion.name];
      return {
        criterionId: criterion.id ?? criterion.name,
        name: criterion.name,
        score: Math.round((score?.score ?? 0.5) * 100) / 100,
        evidence: score?.evidence ?? null,
      };
    }),
    verdict: null,
  };
}

/**
 * Write one first-three verdict onto the candidate it was made for. The row
 * is matched by talentId and the run that picked it, so a verdict that lands
 * after the team reopened the Brief (a new run) is dropped, not written onto
 * whoever now sits at the same position. Returns whether it was written.
 */
export async function setCandidateVerdict(
  roleId: string,
  target: { talentId: string; runId: string },
  patch: Pick<RoleStartCandidate, "verdict"> & { verdictError?: string | null }
) {
  const sql = roleStartSql();
  const fields = wellFormedJson({ verdict: patch.verdict, ...(patch.verdictError ? { verdictError: patch.verdictError } : {}) });
  const rows = await sql<Array<{ role_id: string }>>`
    update public.company_role_start_sessions
    set first_candidates = (
          select coalesce(jsonb_agg(
            case when item->>'talentId' = ${target.talentId} and item->>'runId' = ${target.runId}
              then item || ${sql.json(fields)} else item end
            order by position), '[]'::jsonb)
          from jsonb_array_elements(first_candidates) with ordinality as list(item, position)
        ),
        updated_at = now()
    where role_id = ${roleId}
      and exists (
        select 1 from jsonb_array_elements(first_candidates) as list(item)
        where item->>'talentId' = ${target.talentId} and item->>'runId' = ${target.runId}
      )
    returning role_id
  `;
  return rows.length > 0;
}

/** Background: confirmed Brief → three people on screen in under a minute. */
export async function runRoleStartFirstThree(args: { roleId: string; userId: string | null }) {
  const startedAt = Date.now();
  let session = await loadRoleStartSession(args.roleId);
  if (!session || session.phase !== "searching") return;
  const sql = roleStartSql();
  const role = (await sql<Array<{ name: string }>>`select name from public.company_roles where role_id = ${args.roleId}`)[0];
  try {
    await step(args.roleId, "first_three", "find", "running");
    const pool = await ensurePool({ roleId: args.roleId, roleName: role?.name ?? "", brief: session.brief, session });
    // Counts stay server-side (timings) for measurement; the screen shows no numbers.
    const counts = await countByConditions({ roleId: args.roleId, brief: session.brief, excludeIds: [] });
    const changed = session.brief.criteria.filter((criterion) => !pool.scores[criterionHash(criterion)]).length;
    const { ranked } = rankPool({ pool, brief: session.brief, excludeIds: referenceTalentIds(session.brief) });
    const scored = await scoreCriteria({ pool, criteria: session.brief.criteria });
    const final = changed ? rankPool({ pool, brief: session.brief, excludeIds: referenceTalentIds(session.brief) }).ranked : ranked;
    const passing = final.filter((member) => member.passesMust);
    const picked: PickedCandidate[] = pickFirstThree({
      ranked: final,
      probes: session.questions.probes,
      criteria: session.brief.criteria,
    });
    const hash = verdictBriefHash(session.brief);
    const prepared = session.prepared.entries;
    const profiles = await loadRoleStartProfiles(picked.map((member) => member.talentId));
    // Verdicts written later are matched to this run, not to array positions.
    const runId = crypto.randomUUID();
    const candidates = picked.map((member) => {
      const candidate = { ...candidateFromRanked(member, session!.brief, profiles.get(member.talentId)), runId };
      const entry = prepared[member.talentId];
      return entry && entry.briefHash === hash
        ? {
            ...candidate,
            verdict: withRuleReasons({
              verdict: entry.verdict,
              brief: session!.brief,
              locationKnown: candidate.locationKnown ?? false,
            }),
          }
        : candidate;
    });
    const reused = candidates.filter((candidate) => candidate.verdict).length;
    // Verdicts written for an older Brief are discarded; ones for this Brief
    // stay usable (e.g. after reopening and confirming the same Brief again).
    const unusedPrepared = Object.entries(prepared).filter(([, entry]) => entry.briefHash !== hash);
    await addPreparedStats(args.roleId, {
      used: reused,
      discarded: unusedPrepared.length,
      discardedUsd: unusedPrepared.reduce((sum, [, entry]) => sum + (entry.usd ?? 0), 0),
    });
    const shownMs = Date.now() - startedAt;
    session = await saveRoleStartSession({
      roleId: args.roleId,
      expectedPhase: "searching",
      patch: {
        phase: "evaluating",
        pool,
        firstCandidates: candidates,
      },
      timings: {
        firstThreeShownMs: shownMs,
        firstThreeVerdictsReused: reused,
        scoringMs: scored.ms,
        poolSize: pool.members.length,
        passingCount: passing.length,
        // Shown without numbers: that few people qualify, the conditions that
        // narrowed most in coarse bands, and a way to widen each.
        thin: passing.length < 4 ? "true" : null,
        thinConditionLabel: null,
        thinConditions:
          passing.length < 4
            ? JSON.stringify(
                thinConditions(session!.brief, (candidate) =>
                  rankPool({ pool, brief: candidate }).ranked.filter((member) => member.passesMust).length
                )
              )
            : null,
        filteredCount: counts.filteredIds.length,
        eligibleCount: counts.eligibleCount,
        // Cards appear one by one as verdicts land; prepared ones appear now.
        firstCardMs: reused ? shownMs : null,
        ...(reused === candidates.length ? { firstThreeVerdictsMs: shownMs, lastCardMs: shownMs } : {}),
      },
    });
    if (!session) return;
    await roleStartSql()`
      update public.company_role_start_sessions
      set prepared = jsonb_set(prepared, '{entries}', coalesce((
        select jsonb_object_agg(entry.key, entry.value)
        from jsonb_each(prepared->'entries') as entry
        where entry.value->>'briefHash' = ${hash}
      ), '{}'::jsonb))
      where role_id = ${args.roleId}
    `;
    if (!candidates.length) {
      await step(args.roleId, "first_three", "find", "error", "조건에 맞는 후보를 찾지 못했어요");
      return;
    }
    await step(args.roleId, "first_three", "find", "done");
    const pending = candidates.filter((candidate) => !candidate.verdict);
    if (!pending.length) {
      const state = session ? await fetchRoleCreationStateForBackground(session, args.userId) : null;
      if (state && session) void notifyRoleStartSlack({ kind: "first_three", session, state }).catch(() => undefined);
      return;
    }
    await step(args.roleId, "first_three", "review", "running");
    let done = reused;
    let waitedFor = 0;
    const inflight = session?.prepared.inflight ?? null;
    const usage: RoleStartLlmUsage[] = [];
    await Promise.all(
      candidates.map(async (candidate) => {
        if (candidate.verdict) return;
        const profile = profiles.get(candidate.talentId);
        if (!profile) return;
        try {
          const ready = await waitForPreparedVerdict(args.roleId, candidate.talentId, hash, inflight);
          if (ready) {
            const verdict = withRuleReasons({ verdict: ready, brief: session!.brief, locationKnown: candidate.locationKnown ?? false });
            const written = await setCandidateVerdict(args.roleId, { talentId: candidate.talentId, runId }, { verdict });
            if (!written) return;
            waitedFor += 1;
            done += 1;
            const elapsed = Date.now() - startedAt;
            await mergeRoleStartTimings(args.roleId, {
              ...(done === 1 ? { firstCardMs: elapsed } : {}),
              ...(done === candidates.length ? { lastCardMs: elapsed } : {}),
              [`card${done}Ms`]: elapsed,
            });
            return;
          }
          const result = await writeVerdict({
            roleName: role?.name ?? "",
            brief: session!.brief,
            profile,
            probe: candidate.probe,
            // Its own limit, counted after any wait for a prepared verdict.
            signal: AbortSignal.timeout(ROLE_START_FIRST_THREE_BUDGET_MS * 2),
          });
          usage.push(result.usage);
          const verdict = withRuleReasons({
            verdict: result.verdict,
            brief: session!.brief,
            locationKnown: candidate.locationKnown ?? false,
          });
          const written = await setCandidateVerdict(args.roleId, { talentId: candidate.talentId, runId }, { verdict });
          if (!written) {
            console.warn("[role-start] verdict from a replaced run dropped", { roleId: args.roleId });
            return;
          }
          // Kept for this Brief: reopening and confirming it again reuses the verdict.
          await savePreparedEntry(args.roleId, candidate.talentId, {
            briefHash: hash,
            verdict: result.verdict,
            usd: result.usage.usd,
            ms: result.usage.ms,
            at: new Date().toISOString(),
          });
          done += 1;
          const elapsed = Date.now() - startedAt;
          await mergeRoleStartTimings(args.roleId, {
            ...(done === 1 ? { firstCardMs: elapsed } : {}),
            ...(done === candidates.length ? { lastCardMs: elapsed } : {}),
            [`card${done}Ms`]: elapsed,
          });
        } catch (error) {
          console.error("[role-start] verdict", error);
          await setCandidateVerdict(args.roleId, { talentId: candidate.talentId, runId }, {
            verdict: null,
            verdictError: "이 후보의 정리를 마치지 못했어요.",
          });
        }
      })
    );
    await persistUsage(args.roleId, usage);
    const latest = await saveRoleStartSession({
      roleId: args.roleId,
      expectedPhase: "evaluating",
      patch: {},
      timings: { firstThreeVerdictsMs: Date.now() - startedAt, firstThreeVerdictsAwaited: waitedFor },
    });
    await step(args.roleId, "first_three", "review", "done");
    if (latest) {
      const state = await fetchRoleCreationStateForBackground(latest, args.userId);
      if (state) void notifyRoleStartSlack({ kind: "first_three", session: latest, state }).catch(() => undefined);
    }
  } catch (error) {
    console.error("[role-start] first three failed", error);
    await step(args.roleId, "first_three", "find", "error", "후보를 찾는 중 문제가 생겼어요");
    await saveRoleStartSession({ roleId: args.roleId, expectedPhase: "searching", patch: { phase: "review" } });
  }
}

async function fetchRoleCreationStateForBackground(session: RoleStartSession, userId: string | null) {
  if (!userId) return null;
  const admin = getSupabaseAdmin();
  const { data } = await admin.auth.admin.getUserById(userId);
  if (!data.user) return null;
  return fetchRoleCreationState({
    allowCompletedRole: true,
    roleId: session.roleId,
    user: data.user,
    workspaceId: session.workspaceId,
  });
}

export async function evaluateRoleStartCandidate(
  args: Access & {
    talentId: string;
    rating: OrgRoleCriterionGrade;
    answer?: string | null;
    note?: string | null;
    reasonIds?: string[] | null;
    reasonText?: string | null;
    reasonsSkipped?: boolean;
  }
) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId);
  if (!session || session.phase !== "evaluating") {
    throw new OrgHttpError(409, "지금은 평가할 수 없어요.");
  }
  const candidate = session.firstCandidates.find((item) => item.talentId === args.talentId);
  if (!candidate) throw new OrgHttpError(404, "후보를 찾을 수 없어요.");
  // Every rating can carry reasons: chips for its rating and the team's own words.
  const chips = [...(candidate.verdict?.reasonChips ?? []), ...likedReasonChips(candidate.verdict)].filter((chip) =>
    chip.appliesTo.includes(args.rating)
  );
  const sql = roleStartSql();
  const entry = {
    reasons: chips
      .filter((chip) => (args.reasonIds ?? []).includes(chip.id))
      .map(({ id, criterionId, kind, label, evidence, scope }) => ({ chipId: id, criterionId, kind, label, evidence, ...(scope ? { scope } : {}) })),
    reasonText: String(args.reasonText ?? "").trim().slice(0, 1_000) || null,
    reasonsSkipped: args.reasonsSkipped === true,
    rating: args.rating,
    answer: String(args.answer ?? "").trim().slice(0, 500) || null,
    note: String(args.note ?? "").trim().slice(0, 1_000) || null,
    at: new Date().toISOString(),
  };
  const rows = await sql<Array<{ role_id: string }>>`
    update public.company_role_start_sessions
    set evaluations = evaluations || ${sql.json({ [args.talentId]: entry })}, updated_at = now(), revision = revision + 1
    where role_id = ${args.roleId} and phase = 'evaluating'
    returning role_id
  `;
  if (!rows.length) throw new OrgHttpError(404, "시작 정보를 찾을 수 없어요.");
  const updated = await loadRoleStartSession(args.roleId);
  // All three rated: start the pick after the ratings now, so the last step
  // only commits it. A short pause lets a quick follow-up change (a reason
  // chip) settle first; a later change computes again.
  if (updated?.firstCandidates.length && updated.firstCandidates.every((candidate) => updated.evaluations[candidate.talentId])) {
    runAfterResponse(async () => {
      await sleep(PREPARE_SETTLE_MS);
      await prepareRoleStartBatch({ roleId: args.roleId, userId: args.user.id });
    });
  }
  return updated;
}

const PREPARE_SETTLE_MS = 3_000;

// ---------------------------------------------------------------- step 4

export async function registerRoleStart(
  args: Access & {
    /**
     * Chosen on the finish step: the Slack channels, email and the owner, saved
     * before the Role turns on. An empty channel list with email means email only.
     */
    notification?: { channelIds?: string[]; emailEnabled?: boolean; assigneeUserId?: string };
  }
) {
  let state = await access(args);
  const session = await loadRoleStartSession(args.roleId);
  if (!session || session.phase !== "evaluating") {
    throw new OrgHttpError(409, "첫 3명을 평가한 뒤 등록할 수 있어요.");
  }
  // From the chat's Create role too: every person shown is rated first.
  if (!session.firstCandidates.length || session.firstCandidates.some((candidate) => !session.evaluations[candidate.talentId])) {
    throw new OrgHttpError(409, "첫 3명을 모두 평가한 뒤 등록할 수 있어요.");
  }
  if (state.role.status !== "draft" && state.role.status !== "active") {
    throw new OrgHttpError(409, "등록할 수 없는 역할 상태예요.");
  }
  // Claim the registration first so a double click or a second tab cannot activate twice.
  const claimed = await saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: session.revision,
    expectedPhase: "evaluating",
    // A new registration starts with no pick and no earlier failure.
    patch: { phase: "registering", batch: null },
  });
  if (!claimed) throw new OrgHttpError(409, "이미 등록을 진행하고 있어요.");
  const release = () =>
    saveRoleStartSession({ roleId: args.roleId, expectedPhase: "registering", patch: { phase: "evaluating" } });
  try {
    let defaults: { channel: string | null; assignee: string | null } | null = null;
    if (state.role.status === "draft") {
      const chosen = args.notification;
      const chosenChannels =
        chosen?.channelIds && (chosen.channelIds.length || chosen.emailEnabled === true) ? chosen.channelIds : undefined;
      if (chosen && (chosenChannels || chosen.assigneeUserId || chosen.emailEnabled !== undefined)) {
        state = await setRoleCreationNotification({
          ...(chosenChannels ? { channelIds: chosenChannels } : {}),
          ...(chosen.emailEnabled !== undefined ? { emailEnabled: chosen.emailEnabled } : {}),
          ...(chosen.assigneeUserId ? { assigneeUserId: chosen.assigneeUserId } : {}),
          roleId: args.roleId,
          user: args.user,
          workspaceId: args.workspaceId,
        });
      }
      let missing = getRoleCreationMissingFields(state);
      // Same transparent defaults the role creation chat uses: one channel and the current author.
      const enabledChannels = state.channels.filter((channel) => channel.enabled !== false);
      if (missing.length && enabledChannels.length === 1) {
        state = await setRoleCreationNotification({
          assigneeUserId: state.assigneeUserIds[0] ?? args.user.id,
          channelIds: [enabledChannels[0]!.channelId],
          roleId: args.roleId,
          user: args.user,
          workspaceId: args.workspaceId,
        });
        defaults = {
          channel: enabledChannels[0]!.channelName,
          assignee: state.members.find((member) => member.userId === (state.assigneeUserIds[0] ?? args.user.id))?.name ?? null,
        };
        missing = getRoleCreationMissingFields(state);
      }
      if (missing.length) {
        return { registered: false, missingFields: missing, session: (await release()) ?? session };
      }
    }
    // The Role turns on after the first-three ratings are applied to the
    // Brief (runRoleStartFirstBatch), so the scheduled search starts from
    // the updated Brief.
    return { registered: true, missingFields: [], session: claimed, defaults };
  } catch (error) {
    await release();
    throw error;
  }
}

const RATING_WEIGHT: Record<OrgRoleCriterionGrade, number> = {
  excellent: 1,
  good: 0.6,
  uncertain: 0,
  bad: -1,
};

/** Probe ratings settle the open point deterministically. */
/**
 * Info candidates settle their open point. Liked → the criterion becomes
 * 있으면 좋음. "맞지 않음" counts only when the team's reason points at that
 * criterion (or at years, for a years point); otherwise nothing changes.
 * `reasonTargets`: per candidate, what its "맞지 않음" reasons point at.
 */
export function applyProbeRatings(
  brief: RoleStartBrief,
  session: RoleStartSession,
  reasonTargets: Map<string, Set<string>> = new Map(),
  /** teamDecidedLevels / notFitCriteria: the same rule as keepTeamLevels. */
  decided: Set<string> = new Set(),
  gaps: Set<string> = new Set()
) {
  let next = { ...brief, criteria: brief.criteria.map((criterion) => ({ ...criterion })), hardConditions: [...brief.hardConditions] };
  const notes: string[] = [];
  const settled: Array<{ criterionId: string; name: string; level: RoleStartLevel }> = [];
  const now = new Date().toISOString();
  for (const candidate of session.firstCandidates) {
    const probe = candidate.probe;
    const evaluation = session.evaluations[candidate.talentId];
    if (!probe || !evaluation || evaluation.rating === "uncertain") continue;
    const liked = evaluation.rating === "excellent" || evaluation.rating === "good";
    const about = reasonTargets.get(candidate.talentId) ?? new Set<string>();
    if (probe.type === "criterion_low") {
      const criterion = next.criteria.find((item) => item.id === probe.criterionId);
      if (!criterion) continue;
      // Only between 있으면 좋음 and 중요: liked without it → nice, disliked → important.
      // Whether it is required (필수) stays the company's call.
      if (isRequired(criterion)) continue;
      if (!liked && !about.has(criterion.id ?? criterion.name)) continue;
      const current = levelOf(criterion);
      const level: RoleStartLevel = liked ? "nice" : "important";
      // A level the team chose stays; a named gap may only go up.
      const key = criterion.id ?? criterion.name;
      if (gaps.has(key) ? level === "nice" : decided.has(criterion.name) || decided.has(key)) continue;
      settled.push({ criterionId: criterion.id ?? criterion.name, name: criterion.name, level });
      if (level !== current) {
        Object.assign(criterion, withLevel(criterion, level), { changeReason: "첫 후보 평가 반영", changedAt: now });
        notes.push(`'${criterion.name}' 기준을 ${level === "nice" ? "있으면 좋음으로" : "중요로"} 바꿨어요.`);
      }
    } else if (probe.type === "years_above" && !liked && about.has(YEARS_TARGET) && candidate.years !== null) {
      const cap = Math.max(probe.years ?? 0, Math.floor(candidate.years) - 1);
      next.hardConditions = next.hardConditions.filter((item) => item.kind !== "max_years");
      next.hardConditions.push({ id: `hc_max_${cap}`, kind: "max_years", label: `경력 ${cap}년 이하`, years: cap });
      notes.push(`경력 ${cap}년 이하를 필수 조건으로 넣었어요.`);
    } else if (probe.type === "years_below" && !liked && about.has(YEARS_TARGET) && candidate.years !== null) {
      const floor = Math.min(probe.years ?? 0, Math.ceil(candidate.years) + 1);
      next.hardConditions = next.hardConditions.filter((item) => item.kind !== "min_years");
      next.hardConditions.push({ id: `hc_min_${floor}`, kind: "min_years", label: `경력 ${floor}년 이상`, years: floor });
      notes.push(`경력 ${floor}년 이상을 필수 조건으로 넣었어요.`);
    }
  }
  return { brief: next, notes, settled };
}


/** A criterion score at or below this reads as weak on that criterion. */
const SHARED_WEAKNESS = 0.35;

/**
 * Rank nudges from the first-three ratings, at most ±0.08 per rated person.
 * Liked: people whose whole career resembles that person move up. "맞지 않음":
 * only people who share the weak point the team named (weak on that criterion
 * too) and resemble that person move down; no reason, or a reason about years
 * or something else, pushes nobody down.
 */
export function adjustmentsFrom(args: {
  ratings: Array<{ talentId: string; rating: OrgRoleCriterionGrade; similarity: Map<string, number>; weakOn: string[] }>;
  criterionScores: (criterionId: string, talentId: string) => number | null;
}) {
  const adjustments = new Map<string, number>();
  for (const rated of args.ratings) {
    const weight = RATING_WEIGHT[rated.rating];
    if (!weight || !rated.similarity.size) continue;
    if (weight < 0 && !rated.weakOn.length) continue;
    const values = [...rated.similarity.values()];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) || 1;
    for (const [talentId, similarity] of rated.similarity) {
      const z = Math.max(-2, Math.min(2, (similarity - mean) / sd));
      if (weight < 0) {
        const shares = rated.weakOn.some((criterionId) => {
          const score = args.criterionScores(criterionId, talentId);
          return score !== null && score <= SHARED_WEAKNESS;
        });
        // Only alike people (z > 0) who share the weak point move down.
        if (!shares || z <= 0) continue;
        adjustments.set(talentId, (adjustments.get(talentId) ?? 0) + weight * z * 0.04);
        continue;
      }
      adjustments.set(talentId, (adjustments.get(talentId) ?? 0) + weight * z * 0.04);
    }
  }
  return adjustments;
}

async function similarityAdjustments(
  pool: RoleStartPool,
  session: RoleStartSession,
  brief: RoleStartBrief,
  reasonTargets: Map<string, Set<string>>
) {
  const sql = roleStartSql();
  const ids = pool.members.map((member) => member.talentId);
  const ratings: Parameters<typeof adjustmentsFrom>[0]["ratings"] = [];
  for (const candidate of session.firstCandidates) {
    const evaluation = session.evaluations[candidate.talentId];
    if (!evaluation || !RATING_WEIGHT[evaluation.rating] || !ids.length) continue;
    const weakOn = [...(reasonTargets.get(candidate.talentId) ?? [])].filter((id) =>
      brief.criteria.some((criterion) => (criterion.id ?? criterion.name) === id)
    );
    if (RATING_WEIGHT[evaluation.rating] < 0 && !weakOn.length) continue;
    const rows = await sql<Array<{ talent_id: string; similarity: number }>>`
      with target as (
        select avg(embedding) as vec from public.talent_profile_chunk_embeddings where talent_id = ${candidate.talentId}
      )
      select c.talent_id::text as talent_id, 1 - (avg(c.embedding) <=> (select vec from target)) as similarity
      from public.talent_profile_chunk_embeddings c
      where c.talent_id = any(${ids}::uuid[])
      group by c.talent_id
    `;
    ratings.push({
      talentId: candidate.talentId,
      rating: evaluation.rating,
      similarity: new Map(rows.map((row) => [row.talent_id, Number(row.similarity)])),
      weakOn,
    });
  }
  return adjustmentsFrom({
    ratings,
    criterionScores: (criterionId, talentId) => {
      const criterion = brief.criteria.find((item) => (item.id ?? item.name) === criterionId);
      const score = criterion ? pool.scores[criterionHash(criterion)]?.[talentId] : undefined;
      return score ? (score.similarity ?? score.score) : null;
    },
  });
}

/** The Role's role-start selection run, created once and shared by every proposal it makes. */
async function ensureSelectionRun(workspaceId: string, roleId: string, sql = roleStartSql()) {
  const existing = await sql<Array<{ id: string }>>`
    select id::text from public.company_first_search_runs
    where role_id = ${roleId} and trigger_reason = 'role_start'
    order by scheduled_slot desc limit 1
  `;
  if (existing[0]) return existing[0].id;
  const rows = await sql<Array<{ id: string }>>`
    insert into public.company_first_search_runs (company_workspace_id, scheduled_slot, trigger_reason, status,
      result, finished_at, role_id, requested_role_ids)
    values (${workspaceId}, now(), 'role_start', 'completed',
      ${sql.json({ source: "role_start_first_batch", note: "Role start fast path; not a scheduled search run." })},
      now(), ${roleId}, ${[roleId]}::uuid[])
    returning id
  `;
  return rows[0]!.id;
}

/** Applying the ratings and picking one person; past this the Role turns on without that person. */
const BATCH_BUDGET_MS = 180_000;
/** People judged at once, and at most this many in all. */
const BATCH_WAVE = 3;
/** A wave is not started with less time left than one verdict needs. */
const BATCH_WAVE_RESERVE_MS = 20_000;
const BATCH_MAX_JUDGED = 9;
const GRADE_ORDER: Record<OrgRoleCriterionGrade, number> = { excellent: 3, good: 2, uncertain: 1, bad: 0 };
const FIT_ORDER: Record<RoleStartVerdict["finalFit"], number> = { excellent: 4, good: 3, borderline: 2, uncertain: 1, unfit: 0 };

/**
 * Inbox proposals: every required criterion read as good or better (or a good
 * overall read when there is none). `named`: criteria the team named as the
 * reason an info candidate did not fit; they must read good or better too.
 */
export function qualifiesForBatch(verdict: RoleStartVerdict, brief: RoleStartBrief, named: string[] = []) {
  if (verdict.finalFit === "unfit") return false;
  const must = new Set([...brief.criteria.filter((c) => isRequired(c)).map((c) => c.id ?? c.name), ...named]);
  if (!must.size) return verdict.finalFit === "excellent" || verdict.finalFit === "good";
  return verdict.criteria
    .filter((item) => must.has(item.criterionId))
    .every((item) => item.fitness === "excellent" || item.fitness === "good");
}

/**
 * Inbox proposals written before the Role turns on. A change to the Role row
 * closes its open proposals while the Role is not live
 * (close_company_intro_on_role_change_v1), so a test-only Role's allow-list is
 * extended first and the proposals are inserted after it; turning the Role on
 * then keeps them. Real Roles are not test-only and skip that update.
 */
export async function insertProposals(
  sql: ReturnType<typeof roleStartSql>,
  args: {
    roleId: string;
    workspaceId: string;
    runId: string | null;
    items: Array<{ talentId: string; reason: string; presentation: unknown }>;
    roleFingerprint: string;
  }
) {
  if (!args.items.length) return [];
  // Test-only Roles (local E2E) expose proposals only for listed talents.
  await sql`
    update public.company_roles
    set information = jsonb_set(information, '{testTalentIds}',
      coalesce(information->'testTalentIds', '[]'::jsonb) || ${sql.json(args.items.map((item) => item.talentId))})
    where role_id = ${args.roleId} and (information->>'testOnly') = 'true'
  `;
  const ids: string[] = [];
  for (const item of args.items) {
    const rows = await sql<Array<{ id: string }>>`
      insert into public.company_intro_candidates (company_workspace_id, role_id, talent_id, selection_run_id,
        selection_reason, presentation, role_fingerprint, talent_fingerprint)
      values (${args.workspaceId}, ${args.roleId}, ${item.talentId}, ${args.runId},
        ${item.reason}, ${sql.json(wellFormedJson(item.presentation) as never)}, ${args.roleFingerprint}, ${"role-start-v1"})
      on conflict do nothing
      returning id
    `;
    if (rows[0]) ids.push(rows[0].id);
  }
  return ids;
}

/** What a proposal shows: the first-three verdict, or only the headline when that read failed. */
function candidatePresentation(candidate: RoleStartCandidate, brief: RoleStartBrief) {
  return candidate.verdict
    ? verdictPresentation(candidate.verdict, brief)
    : { tldr: candidate.headline ?? "", harperNote: "", finalFit: "uncertain", reasonChips: [], criteriaEvaluations: [] };
}

/** First-three people the team rated 잘 맞음 or better (with a verdict to show). */
export function likedFirstThree(session: Pick<RoleStartSession, "firstCandidates" | "evaluations">) {
  return session.firstCandidates.filter((candidate) => {
    const rating = session.evaluations[candidate.talentId]?.rating;
    return Boolean(candidate.verdict) && (rating === "excellent" || rating === "good");
  });
}

/** First-three people that stay with the Role: rated 잘 맞음 or better, or 정보가 부족해요 (to look at again). */
export function keptFirstThree(session: Pick<RoleStartSession, "firstCandidates" | "evaluations">) {
  return session.firstCandidates.filter((candidate) => {
    const rating = session.evaluations[candidate.talentId]?.rating;
    // A person whose read failed was still rated by the team: their rating counts too.
    return rating === "excellent" || rating === "good" || rating === "uncertain";
  });
}

/**
 * Registration: the first-three people the team rated 잘 맞음 or better, or
 * 정보가 부족해요, go to the inbox with their first-three verdicts, once the
 * Role is on. Returns their names.
 */
export async function keepLikedFirstThree(
  sql: ReturnType<typeof roleStartSql>,
  args: { roleId: string; workspaceId: string; session: Pick<RoleStartSession, "firstCandidates" | "evaluations" | "brief"> }
) {
  const liked = keptFirstThree(args.session);
  if (!liked.length) return [];
  const runId = await ensureSelectionRun(args.workspaceId, args.roleId, sql);
  await insertProposals(sql, {
    roleId: args.roleId,
    workspaceId: args.workspaceId,
    runId,
    items: liked.map((candidate) => ({
      talentId: candidate.talentId,
      reason: candidate.verdict?.tldr ?? candidate.headline ?? "",
      presentation: candidatePresentation(candidate, args.session.brief),
    })),
    roleFingerprint: `role-start:${hardConditionsHash(args.session.brief)}`,
  });
  return liked.map((candidate) => candidate.name || "").filter(Boolean);
}

/**
 * Registration: first-three people rated 맞지 않음 are recorded as passed for
 * this Role exactly like the inbox Pass button (a proposal, then
 * pass_company_intro_v1 and the same decision log). Eligibility for every
 * later search (company_first_pair_is_available_v1) skips any person with a
 * proposal row for the Role, so they are not proposed again. 정보가 부족해요
 * goes to the inbox instead (keepLikedFirstThree). Returns how many were passed.
 */
export async function passDislikedFirstThree(
  sql: ReturnType<typeof roleStartSql>,
  args: {
    roleId: string;
    workspaceId: string;
    userId: string;
    session: Pick<RoleStartSession, "firstCandidates" | "evaluations" | "brief">;
  }
) {
  const rated = args.session.firstCandidates.filter(
    (candidate) => args.session.evaluations[candidate.talentId]?.rating === "bad"
  );
  // Already recorded for this Role (a rerun, or the inbox): nothing new.
  const present = new Set(
    rated.length
      ? (
          await sql<Array<{ talent_id: string }>>`
            select talent_id::text from public.company_intro_candidates
            where role_id = ${args.roleId} and talent_id = any(${rated.map((candidate) => candidate.talentId)}::uuid[])
          `
        ).map((row) => row.talent_id)
      : []
  );
  const disliked = rated.filter((candidate) => !present.has(candidate.talentId));
  if (!disliked.length) return 0;
  const runId = await ensureSelectionRun(args.workspaceId, args.roleId, sql);
  const ids = await insertProposals(sql, {
    roleId: args.roleId,
    workspaceId: args.workspaceId,
    runId,
    items: disliked.map((candidate) => ({
      talentId: candidate.talentId,
      reason: candidate.verdict?.tldr ?? candidate.headline ?? "",
      presentation: candidatePresentation(candidate, args.session.brief),
    })),
    roleFingerprint: `role-start:${hardConditionsHash(args.session.brief)}`,
  });
  for (const id of ids) {
    await sql`select public.pass_company_intro_v1(${id}::uuid, ${args.workspaceId}::uuid, ${args.userId}::uuid)`;
    await recordOrgIntroDecision({ admin: getSupabaseAdmin(), workspaceId: args.workspaceId, introCandidateId: id, decision: "pass" });
  }
  return ids.length;
}

/** Criteria the team named as why an info candidate did not fit (years and conditions excluded). */
export function namedWeakCriteria(
  session: Pick<RoleStartSession, "firstCandidates" | "evaluations">,
  reasonTargets: Map<string, Set<string>>,
  brief: RoleStartBrief
) {
  const ids = new Set(brief.criteria.map((criterion) => criterion.id ?? criterion.name));
  return [
    ...new Set(
      session.firstCandidates
        .filter((candidate) => candidate.probe && session.evaluations[candidate.talentId]?.rating === "bad")
        .flatMap((candidate) => [...(reasonTargets.get(candidate.talentId) ?? [])].filter((id) => ids.has(id)))
    ),
  ];
}

function batchOrder(verdict: RoleStartVerdict) {
  return FIT_ORDER[verdict.finalFit] * 100 + verdict.criteria.reduce((sum, item) => sum + GRADE_ORDER[item.fitness], 0);
}

/** Background: registration → up to six new people in under a minute. */
export async function runRoleStartFirstBatch(args: {
  roleId: string;
  userId: string | null;
  user?: User;
  workspaceId?: string;
}) {
  const startedAt = Date.now();
  let session = await loadRoleStartSession(args.roleId);
  if (!session || session.phase !== "registering") return;
  await step(args.roleId, "batch", "choose", "running");
  // People rated 맞지 않음 are passed the way the inbox Pass button does it, so
  // no later search proposes them to this Role again.
  if (args.userId) {
    await passDislikedFirstThree(roleStartSql(), { roleId: args.roleId, workspaceId: session.workspaceId, session, userId: args.userId }).catch(
      (error) => console.error("[role-start] passing disliked first three failed", error)
    );
  }
  const pick = recommendAfterRatings({ ...args, session, startedAt }).catch((error) => {
    console.error("[role-start] recommendation after ratings failed", error);
    return null;
  });
  let outcome = await Promise.race([pick, sleep(BATCH_BUDGET_MS).then(() => null)]);
  // Without a pick in time, mark it before turning the Role on: a pick that
  // finishes later sees the mark and changes nothing. A pick already writing
  // its result (it claimed the batch first) is waited for instead.
  if (!outcome) {
    let claimed = false;
    // An unrelated save in between only moves the revision: read again and mark.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await loadRoleStartSession(args.roleId, { forView: true });
      if (latest?.phase !== "registering") break;
      if (latest.batch) {
        claimed = true;
        break;
      }
      const marked = await saveRoleStartSession({
        roleId: args.roleId,
        expectedPhase: "registering",
        expectedRevision: latest.revision,
        patch: { batch: { status: "failed", shown: 0, passing: 0, introIds: [], candidates: [], error: "batch_failed" } },
      });
      if (marked) break;
    }
    // Only the database writes are left once it claimed the batch: wait for them.
    if (claimed) outcome = await pick;
  }
  // A retry (back to rating) or a Role registered another way meanwhile ends
  // this run: nothing more is written for it.
  const stillRegistering = async () =>
    (await loadRoleStartSession(args.roleId, { forView: true }))?.phase === "registering";
  if (!(await stillRegistering())) return;
  // The Role turns on last, so the scheduled search starts from the Brief the
  // ratings updated; without a recommendation it still turns on.
  try {
    await activateRoleStartRole({ roleId: args.roleId, userId: args.userId, user: args.user, workspaceId: args.workspaceId ?? session.workspaceId });
  } catch (error) {
    console.error("[role-start] activation after ratings failed", error);
    await step(args.roleId, "batch", "choose", "error", "등록을 마치지 못했어요");
    await saveRoleStartSession({ roleId: args.roleId, expectedPhase: "registering", patch: { phase: "evaluating" } });
    return;
  }
  // The people the team liked go to the inbox once the Role is on (a proposal
  // saved while it is still a draft is closed by a later change to the Role's
  // status or information, e.g. the test-only allow-list update in insertProposals),
  // whatever happened to the pick above (their first-three verdicts are reused).
  if (!(await stillRegistering())) return;
  let keptCount = 0;
  const kept = await keepLikedFirstThree(roleStartSql(), { roleId: args.roleId, workspaceId: session.workspaceId, session })
    .then((names) => ((keptCount = keptFirstThree(session).length), names))
    .catch((error) => (console.error("[role-start] keeping liked first three failed", error), [] as string[]));
  const candidates = outcome?.candidates ?? [];
  // Written before the step turns done, so a chat reading again on "done" finds it.
  await postRoleStartRegisteredMessage({
    roleId: args.roleId,
    workspaceId: args.workspaceId ?? session.workspaceId,
    kept: keptCount,
    picked: outcome?.candidates.length ?? 0,
  }).catch((error) => console.warn("[role-start] registration message", error));
  await saveRoleStartSession({
    roleId: args.roleId,
    expectedPhase: "registering",
    patch: {
      phase: "done",
      batch: outcome
        ? { status: "done", shown: candidates.length, passing: outcome.passing, introIds: outcome.introIds, candidates, kept }
        : { status: "failed", shown: 0, passing: 0, introIds: [], candidates: [], kept, error: "batch_failed" },
    },
    timings: { registeredAt: new Date().toISOString(), firstBatchMs: Date.now() - startedAt },
  });
  await step(
    args.roleId,
    "batch",
    "choose",
    "done",
    candidates.length ? "인박스에 새 후보를 올렸어요" : "지금 기준에 맞는 새 후보를 찾지 못했어요"
  );
  // Ratings that reworded a criterion leave the moved people's grades on the
  // old wording: re-read just that criterion for them.
  const after = (await loadRoleStartSession(args.roleId, { forView: true }))?.brief;
  // Only people whose proposal is in the inbox now (the keep step can fail or find one already there).
  const inInbox = new Set(
    (
      await roleStartSql()<Array<{ talent_id: string }>>`
        select talent_id::text as talent_id from public.company_intro_candidates
        where role_id = ${args.roleId} and status = 'ready'
      `.catch(() => [])
    ).map((row) => row.talent_id)
  );
  if (after) {
    const people = keptFirstThree(session).flatMap((candidate) =>
      candidate.verdict && inInbox.has(candidate.talentId)
        ? [{
            talentId: candidate.talentId,
            evaluations: candidate.verdict.criteria.map(({ name, fitness, evidence }) => ({ name, fitness, content: evidence })),
          }]
        : []
    );
    const { regradeAfterRegistration } = await import("./rubricUpdate");
    await regradeAfterRegistration({ roleId: args.roleId, before: session.brief, after, people }).catch((error) =>
      console.warn("[role-start] regrade after registration", error)
    );
  }
}

/** Turn the draft Role on (the same completion the role creation chat uses). */
async function activateRoleStartRole(args: { roleId: string; userId: string | null; user?: User; workspaceId: string }) {
  const admin = getSupabaseAdmin();
  let user = args.user ?? null;
  if (!user && args.userId) user = (await admin.auth.admin.getUserById(args.userId)).data.user ?? null;
  if (!user) throw new Error("no user to complete the Role");
  const state = await fetchRoleCreationState({ roleId: args.roleId, user, workspaceId: args.workspaceId, allowCompletedRole: true });
  if (state.role.status !== "draft") return;
  const { data: activated, error } = await (admin.rpc as any)("complete_company_role_creation_v1", {
    p_role_id: args.roleId,
    p_workspace_id: args.workspaceId,
  });
  if (error) throw error;
  if (activated !== true) throw new Error("role already changed");
  await updateRoleCreationConversationMetadata({
    admin,
    conversationId: state.conversation.id,
    current: state.metadata,
    patch: { completedAt: new Date().toISOString(), completedBy: user.id, phase: "completed" },
  });
  // The same start notice the chat's Create role sends, now that the Role is on.
  await notifyOrgRoleCreatedSlack({
    actor: state.currentUser,
    introSearchDate: state.role.introSearchDate,
    introSearchTime: state.role.introSearchTime,
    isCompanyFirstSearch: state.role.isCompanyFirstSearch,
    roleId: args.roleId,
    roleName: state.role.name,
    workspace: { companyName: state.workspace.companyName, workspaceId: state.workspace.workspaceId },
  }).catch((error) => console.error("[role-start] start notice failed", error));
}

/**
 * The Role is registered another way (the form or the chat): the start flow
 * ends there, and its open question's chat and Slack cards close.
 */
export async function supersedeRoleStart(args: Access) {
  const pending = await supersedeRoleStartSession(args.roleId);
  if (!pending) return;
  await closeRoleStartQuestionCard({ roleId: args.roleId, workspaceId: args.workspaceId, questionId: pending.id }).catch(
    (error) => console.warn("[role-start] close card", error)
  );
  if (pending.slack) {
    const state = await access(args).catch(() => null);
    if (state) {
      await closeRoleStartSlackQuestion({ state, question: pending, answer: "다른 방법으로 등록을 시도해서 이 질문은 닫혔어요" }).catch(
        (error) => console.warn("[role-start] close Slack question", error)
      );
    }
  }
}

/**
 * The role chat's Create role (button, tool or API) while the start flow owns
 * the Role: register through the flow so the Role turns on only after the
 * ratings reach the Brief and one more person is proposed. "not_owned": no
 * open start flow; the caller activates as before.
 */
export async function registerRoleStartFromChat(
  args: Access
): Promise<"not_owned" | "registering" | "needs_ratings" | "missing"> {
  const session = await loadRoleStartSession(args.roleId);
  if (!roleStartOwnsRole(session)) {
    // The caller turns the Role on next: end the flow so its late results are dropped.
    if (session && session.phase !== "done") await supersedeRoleStart(args);
    return "not_owned";
  }
  if (!session) return "not_owned";
  if (session.phase === "registering") return "registering";
  if (session.phase !== "evaluating") return "needs_ratings";
  if (!session.firstCandidates.length || session.firstCandidates.some((candidate) => !session.evaluations[candidate.talentId])) {
    return "needs_ratings";
  }
  const result = await registerRoleStart(args);
  if (!result.registered) return "missing";
  runAfterResponse(() =>
    runRoleStartFirstBatch({ roleId: args.roleId, userId: args.user.id, user: args.user, workspaceId: args.workspaceId })
  );
  return "registering";
}

/** What the pick after the ratings depends on: the confirmed Brief and the team's ratings, not when they were saved. */
export function ratingsKey(session: Pick<RoleStartSession, "brief" | "firstCandidates" | "evaluations">) {
  return createHash("sha1")
    .update(
      JSON.stringify([
        session.brief,
        session.firstCandidates.map((candidate) => {
          const entry = session.evaluations[candidate.talentId];
          return entry
            ? [candidate.talentId, entry.rating, entry.answer, entry.note, (entry.reasons ?? []).map((reason) => reason.chipId ?? reason.label), entry.reasonText ?? null]
            : [candidate.talentId, null];
        }),
      ])
    )
    .digest("hex");
}

type AfterRatings = NonNullable<RoleStartPreparedBatch["result"]>;

/**
 * Compute the pick after the first-three ratings as soon as the team has
 * rated all three, so the last step only commits it. Writes nothing the
 * Role or the inbox can see; a later change of ratings computes again.
 */
export async function prepareRoleStartBatch(args: { roleId: string; userId: string | null }) {
  const session = await loadRoleStartSession(args.roleId);
  if (!session || session.phase !== "evaluating") return;
  if (!session.firstCandidates.length || session.firstCandidates.some((candidate) => !session.evaluations[candidate.talentId])) return;
  const key = ratingsKey(session);
  const current = session.prepared.batch;
  if (
    current?.key === key &&
    (current.status === "done" || (current.status === "running" && Date.now() - Date.parse(current.startedAt) < BATCH_BUDGET_MS))
  ) {
    return;
  }
  const startedAt = new Date().toISOString();
  await savePreparedBatch(args.roleId, { key, status: "running", startedAt });
  try {
    const result = await Promise.race([
      computeAfterRatings({ roleId: args.roleId, session, startedAt: Date.now(), report: false }),
      sleep(BATCH_BUDGET_MS).then(() => null),
    ]);
    await savePreparedBatch(
      args.roleId,
      result ? { key, status: "done", startedAt, result } : { key, status: "failed", startedAt },
      key
    );
  } catch (error) {
    console.error("[role-start] preparing the pick after ratings failed", error);
    await savePreparedBatch(args.roleId, { key, status: "failed", startedAt }, key);
  }
}

/**
 * Apply the first-three ratings to the Brief, then pick one more person from
 * the same pool: unseen must-passers judged three at a time in ranking order,
 * the best whose must criteria all read good or better, up to nine judged.
 * Uses the pick prepared when the team finished rating when the ratings are
 * the same (waiting for it while it runs), then commits it.
 */
async function recommendAfterRatings(args: {
  roleId: string;
  userId: string | null;
  session: RoleStartSession;
  startedAt: number;
}): Promise<{ candidates: RoleStartCandidate[]; introIds: string[]; passing: number }> {
  const key = ratingsKey(args.session);
  let prepared = args.session.prepared.batch ?? null;
  while (prepared?.key === key && prepared.status === "running" && Date.now() - Date.parse(prepared.startedAt) < BATCH_BUDGET_MS) {
    await step(args.roleId, "batch", "choose", "running");
    await sleep(1_000);
    prepared = (await loadRoleStartSession(args.roleId))?.prepared.batch ?? null;
  }
  const reused = prepared?.key === key && prepared.status === "done" && prepared.result ? prepared.result : null;
  const result = reused ?? (await computeAfterRatings({ ...args, report: true }));
  await mergeRoleStartTimings(args.roleId, { batchPrepared: reused ? "reused" : "computed" });
  return commitAfterRatings({ roleId: args.roleId, userId: args.userId, result });
}

async function computeAfterRatings(args: {
  roleId: string;
  session: RoleStartSession;
  startedAt: number;
  /** Show progress lines (registration); a prepared run is silent. */
  report: boolean;
}): Promise<AfterRatings> {
  const session = args.session;
  const startedAt = args.startedAt;
  const report = (kind: StepKind, status: "running" | "done") => (args.report ? step(args.roleId, "batch", kind, status) : Promise.resolve());
  const sql = roleStartSql();
  const role = (await sql<Array<{ name: string; company_workspace_id: string }>>`
    select name, company_workspace_id from public.company_roles where role_id = ${args.roleId}
  `)[0];
  const usage: RoleStartLlmUsage[] = [];
  try {
    // (1) Brief changes from the evaluation and (3) info candidate outcomes.
    // What each "맞지 않음" was about, from the team's own reasons.
    const reasons = await reasonTargetsByCandidate(session, session.brief);
    usage.push(...reasons.usage);
    let { brief, notes, settled } = applyProbeRatings(
      session.brief,
      session,
      reasons.targets,
      teamDecidedLevels(session),
      notFitCriteria(session)
    );
    const feedback = session.firstCandidates
      .map((candidate) => ({ candidate, evaluation: session.evaluations[candidate.talentId] }))
      .filter(
        (item) =>
          item.evaluation &&
          (item.evaluation.answer || item.evaluation.note || item.evaluation.reasons?.length || item.evaluation.reasonText)
      );
    if (feedback.length) {
      await report("apply", "running");
      const { data, usage: used } = await callRoleStartJson<{ brief: RawBrief; appliedSummary: string }>({
        label: "calibration",
        // Registration → first batch has a one-minute budget; verdicts need most of it.
        model: ROLE_START_FAST_MODEL,
        reasoningEffort: "low",
        schema: NEXT_QUESTIONS_SCHEMA,
        system: buildCalibrationSystemPrompt(),
        user: `<CURRENT_BRIEF>\n${formatPromptText(briefForModel(brief))}\n</CURRENT_BRIEF>
<SETTLED>\n${formatPromptText(notes)}\n</SETTLED>
<FEEDBACK>\n${formatPromptText(
          session.firstCandidates.map((candidate) => {
            const evaluation = session.evaluations[candidate.talentId];
            return {
              includedBecause: candidate.probe?.label ?? null,
              harperRead: candidate.verdict ? { tldr: candidate.verdict.tldr, criteria: candidate.verdict.criteria } : null,
              question: candidate.verdict?.companyQuestion?.question ?? null,
              teamRating: evaluation?.rating ?? null,
              teamAnswer: evaluation?.answer ?? null,
              teamNote: evaluation?.note ?? null,
              // Reasons about a hard condition stay with the rating; they never change the Brief.
              // 맞지 않음 names gaps; 정보가 부족해요 names open points.
              [evaluation?.rating === "bad"
                ? "teamNotFitBecause"
                : evaluation?.rating === "uncertain"
                  ? "teamUnsureBecause"
                  : "teamLikedBecause"]: evaluation?.reasons?.filter((reason) => !reason.scope).map((reason) => ({
                about:
                  brief.criteria.find((criterion) => criterion.id === reason.criterionId)?.name ??
                  brief.hardConditions.find((condition) => condition.id === reason.criterionId)?.label ??
                  reason.criterionId,
                kind: reason.kind,
                point: reason.label,
                // The short chip names the point; this is the profile fact behind it.
                ...(reason.evidence ? { detail: reason.evidence } : {}),
              })) ?? [],
              // A picked chip for a reason outside the Brief reads as typed text.
              teamUnsureText: evaluation ? typedReason(evaluation) || null : null,
            };
          })
        )}\n</FEEDBACK>`,
      });
      usage.push(used);
      // An empty summary means nothing changed: keep the Brief from the ratings.
      if (data.appliedSummary?.trim()) {
        brief = keepTeamLevels(
          brief,
          keepRequired(brief, reapplySettled(briefFromRaw(data.brief, brief, "첫 후보 평가 반영", { modelSignals: true }), settled)),
          teamDecidedLevels(session),
          notFitCriteria(session)
        );
        notes.push(data.appliedSummary);
      }
      await report("apply", "done");
    }
    await report("choose", "running");
    const shownIds = session.firstCandidates.map((candidate) => candidate.talentId);
    const pool = await ensurePool({ roleId: args.roleId, roleName: role?.name ?? "", brief, session });
    await scoreCriteria({ pool, criteria: brief.criteria });
    // (2) Move people who resemble well-rated candidates up, poorly rated down.
    const adjustments = await similarityAdjustments(pool, session, brief, reasons.targets);
    // A weak point the team named on an info candidate must hold for the pick:
    // that criterion has to read good or better too. Nobody qualifying means
    // no pick now (the team said it matters), not a pick that leaves it open.
    const named = namedWeakCriteria(session, reasons.targets, brief);
    const ranked = rankPool({ pool, brief, excludeIds: [...shownIds, ...referenceTalentIds(brief)], adjustments }).ranked.filter(
      (member) => member.passesMust
    );
    // Judge the best-ranked people three at a time until one qualifies.
    const deadline = AbortSignal.timeout(Math.max(10_000, BATCH_BUDGET_MS - (Date.now() - startedAt)));
    const judged: Array<{ member: RankedMember; verdict: RoleStartVerdict; profile: RoleStartProfile; rank: number }> = [];
    let next = 0;
    while (
      next < ranked.length &&
      next < BATCH_MAX_JUDGED &&
      judged.filter((item) => qualifiesForBatch(item.verdict, brief, named)).length < ROLE_START_BATCH_SIZE &&
      Date.now() - startedAt < BATCH_BUDGET_MS - BATCH_WAVE_RESERVE_MS
    ) {
      const wave = ranked.slice(next, next + BATCH_WAVE);
      const offset = next;
      next += wave.length;
      const profiles = await loadRoleStartProfiles(wave.map((member) => member.talentId));
      const results = await Promise.all(
        wave.map(async (member, index) => {
          const profile = profiles.get(member.talentId);
          if (!profile) return null;
          try {
            const result = await writeVerdict({ roleName: role?.name ?? "", brief, profile, probe: null, signal: deadline });
            usage.push(result.usage);
            return { member, verdict: result.verdict, profile, rank: offset + index };
          } catch (error) {
            console.error("[role-start] batch verdict", error);
            return null;
          }
        })
      );
      judged.push(...results.filter((item): item is NonNullable<typeof item> => Boolean(item)));
    }
    const accepted = judged
      .filter((item) => qualifiesForBatch(item.verdict, brief, named))
      .sort((left, right) => batchOrder(right.verdict) - batchOrder(left.verdict) || left.rank - right.rank)
      .slice(0, ROLE_START_BATCH_SIZE);
    await persistUsage(args.roleId, usage);
    await mergeRoleStartTimings(args.roleId, { batchPassingCount: ranked.length, batchJudged: judged.length, batchComputeMs: Date.now() - startedAt });
    return {
      brief,
      notes,
      proposals: accepted.map((item) => ({ talentId: item.member.talentId, verdict: item.verdict })),
      candidates: accepted.map((item) => ({
        ...candidateFromRanked({ ...item.member, probe: null }, brief, item.profile),
        verdict: item.verdict,
      })),
      passing: ranked.length,
      judged: judged.length,
    };
  } catch (error) {
    await persistUsage(args.roleId, usage);
    throw error;
  }
}

/** Save the Brief the ratings changed and put the pick in the inbox. */
async function commitAfterRatings(args: { roleId: string; userId: string | null; result: AfterRatings }) {
  const { notes, proposals, candidates, passing } = args.result;
  const sql = roleStartSql();
  const role = (await sql<Array<{ company_workspace_id: string }>>`
    select company_workspace_id from public.company_roles where role_id = ${args.roleId}
  `)[0];
  // Only while registration still waits for it: a pick that finished after
  // the time limit (the Role is already on and the screen says so) changes nothing.
  const current = await loadRoleStartSession(args.roleId, { forView: true });
  if (!current || current.phase !== "registering" || current.batch) return { candidates: [], introIds: [], passing };
  // People added or answered after the ratings were read stay with the Brief.
  const brief = withLatestReferences(args.result.brief, current.brief);
  // Claims the batch, so the time limit no longer marks it failed while this writes.
  const still = await saveRoleStartSession({
    roleId: args.roleId,
    expectedPhase: "registering",
    expectedRevision: current.revision,
    patch: {
      ...(notes.length ? { brief } : {}),
      batch: { status: "running", shown: 0, passing: 0, introIds: [], candidates: [] },
    },
  });
  if (!still) return { candidates: [], introIds: [], passing };
  if (notes.length) {
    await saveRoleStartBrief({
      roleId: args.roleId,
      brief,
      changeSource: "evaluation",
      changeSummary: notes.join(" "),
      userId: args.userId,
      writeRole: true,
    });
  }
  const runId = proposals.length ? await ensureSelectionRun(role!.company_workspace_id, args.roleId) : null;
  const introIds = await insertProposals(sql, {
    roleId: args.roleId,
    workspaceId: role!.company_workspace_id,
    runId,
    items: proposals.map((item) => ({
      talentId: item.talentId,
      reason: item.verdict.tldr,
      presentation: JSON.parse(JSON.stringify(verdictPresentation(item.verdict, brief))),
    })),
    roleFingerprint: `role-start:${hardConditionsHash(brief)}`,
  });
  return { candidates, introIds, passing };
}

/**
 * Start a stopped background step again: the draft, the first three or the
 * first batch. Only when the step has not written anything for a while.
 * Returns which step to run after the response.
 */
export async function retryStalledRoleStart(args: Access) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId);
  if (!session) throw new OrgHttpError(404, "시작 정보를 찾을 수 없어요.");
  if (!isRoleStartStalled(session)) throw new OrgHttpError(409, "아직 진행하고 있어요. 조금만 기다려 주세요.");
  if (session.phase === "questions" || session.phase === "review") {
    // Answers whose refinement died: continue from the first one.
    return { session, run: "refine" as const };
  }
  if (session.phase === "registering") {
    // Registration stopped midway: back to the first three so the team can register again.
    await step(args.roleId, "batch", "choose", "error", "등록을 마치지 못했어요");
    const back = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: session.revision,
      patch: { phase: "evaluating" },
    });
    if (!back) throw new OrgHttpError(409, "이미 다시 시작했어요.");
    return { session: back, run: null };
  }
  if (session.phase === "drafting") {
    await saveRoleStartSession({ roleId: args.roleId, expectedPhase: "drafting", patch: { phase: "failed" } });
    return { session: await startRoleStartDraft(args), run: null };
  }
  // Touch the row so a second click does not start the step twice.
  const touched = await saveRoleStartSession({ roleId: args.roleId, expectedRevision: session.revision, patch: {} });
  if (!touched) throw new OrgHttpError(409, "이미 다시 시작했어요.");
  return { session: touched, run: session.phase === "searching" ? ("first_three" as const) : ("batch" as const) };
}

/**
 * Criteria saved from the role chat while the start flow is open go into the
 * session Brief too, so the Brief stays the one source: confirmation writes
 * the Role from it and the chat edit is not overwritten. Strength, kind,
 * signals and ids of unchanged names are kept; the chat sends the full list.
 */
export async function applyChatCriteriaToRoleStart(args: {
  roleId: string;
  userId: string;
  criteria: Array<{ name: string; criteria: string }>;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await loadRoleStartSession(args.roleId, { forView: true });
    if (!session || !["questions", "review"].includes(session.phase)) return null;
    const now = new Date().toISOString();
    const criteria = args.criteria.map((item) => {
      const before = session.brief.criteria.find((criterion) => criterion.name === item.name);
      if (!before) {
        return { id: shortId("cr"), name: item.name, criteria: item.criteria, requirement: "preferred" as const, importance: 2,
          kind: "similarity" as const, changeReason: "채팅에서 추가", changedAt: now };
      }
      if (before.criteria === item.criteria) return before;
      const { signals: _signals, evidenceTerms: _terms, rule: _rule, ...kept } = before;
      return { ...kept, criteria: item.criteria, changeReason: "채팅에서 수정", changedAt: now };
    });
    const unchanged =
      criteria.length === session.brief.criteria.length &&
      criteria.every((item, index) => item === session.brief.criteria[index]);
    if (unchanged) return session;
    const brief = { ...session.brief, criteria };
    const saved = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: session.revision,
      patch: { brief, questions: { ...session.questions, speculative: null, briefEdits: (session.questions.briefEdits ?? 0) + 1 } },
    });
    if (!saved) continue;
    await saveRoleStartBrief({
      roleId: args.roleId,
      brief,
      changeSource: "chat_edit",
      changeSummary: "채팅에서 기준 수정",
      userId: args.userId,
      writeRole: false,
    });
    return saved;
  }
  console.warn("[role-start] chat criteria could not be applied to the Brief", { roleId: args.roleId });
  return null;
}

/**
 * Widen one hard condition from the first-three notice and pick the first
 * three again with the wider Brief (only before any rating is given).
 */
export async function widenRoleStartCondition(args: Access & { conditionId: string }) {
  await access(args);
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  if (!session || session.phase !== "evaluating") throw new OrgHttpError(409, "지금은 조건을 바꿀 수 없어요.");
  if (Object.keys(session.evaluations).length) {
    throw new OrgHttpError(409, "평가를 시작한 뒤에는 'Brief로 돌아가 고치기'에서 바꿔 주세요.");
  }
  const relaxation = relaxations(session.brief).find((item) => item.id === args.conditionId);
  if (!relaxation) throw new OrgHttpError(400, "넓힐 수 없는 조건이에요.");
  const brief = relaxation.apply(session.brief);
  // People who stay in the first three keep their verdicts; only newcomers are judged.
  const nextHash = verdictBriefHash(brief);
  for (const candidate of session.firstCandidates) {
    if (!candidate.verdict) continue;
    await savePreparedEntry(args.roleId, candidate.talentId, {
      briefHash: nextHash,
      verdict: candidate.verdict,
      usd: 0,
      ms: 0,
      at: new Date().toISOString(),
    });
  }
  const saved = await saveRoleStartSession({
    roleId: args.roleId,
    expectedRevision: session.revision,
    expectedPhase: "evaluating",
    patch: { brief, phase: "searching", firstCandidates: [], evaluations: {} },
    timings: { confirmedAt: new Date().toISOString(), firstThreeShownMs: null, firstThreeVerdictsMs: null, thin: null, thinConditions: null },
  });
  if (!saved) throw new OrgHttpError(409, "그사이 바뀌었어요. 다시 확인해 주세요.");
  await saveRoleStartBrief({
    roleId: args.roleId,
    brief,
    changeSource: "widen_condition",
    changeSummary: `'${relaxation.label}' 조건: ${relaxation.widen}`,
    userId: args.user.id,
    writeRole: true,
  });
  return saved;
}

/**
 * A question the role chat wrote as plain text goes out as a chip card
 * instead (chipGuard); the reply keeps the rest of its text. Only while the
 * start flow takes questions; otherwise the reply is returned unchanged.
 */
export async function moveReplyQuestionToCard(args: Access & { reply: string; surface?: "chat" | "slack" }) {
  if (!mayAsk(args.reply)) return args.reply;
  const session = await loadRoleStartSession(args.roleId, { forView: true });
  // The JD-reading turn saves the description and starts the draft after this
  // reply, so the session may not exist yet; its question still becomes a card
  // once the session does. With no description there is no start flow yet:
  // the question stays in the reply (the Setup step shows it).
  const pendingDraft = !session && (await roleHasDescription(args.roleId));
  if (!pendingDraft && (!session || !["drafting", "questions", "review"].includes(session.phase))) return args.reply;
  try {
    const { card, usage } = await questionCardFromReply({ reply: args.reply });
    if (session) await persistUsage(args.roleId, [usage]);
    if (!card) return args.reply;
    const { surface: _surface, reply: _reply, ...access } = args;
    if (pendingDraft) {
      runAfterResponse(async () => {
        if (!(await waitForRoleStartSession(args.roleId))) return;
        await persistUsage(args.roleId, [usage]);
        await askRoleStartQuestionFromChat({ ...access, question: card.question, why: card.why, chips: card.chips, afterReply: true });
      });
      return card.reply || args.reply;
    }
    const posted = await askRoleStartQuestionFromChat({
      ...access,
      question: card.question,
      why: card.why,
      chips: card.chips,
      afterReply: true,
    });
    if (!posted.posted && posted.reason !== "already_asked") return args.reply;
    // In Slack the same question goes out as chip buttons in the role thread;
    // a button answers it exactly like the web card.
    if (args.surface === "slack" && posted.posted && posted.shownNow) {
      runAfterResponse(async () => {
        const [state, shown] = await Promise.all([fetchRoleCreationState({ roleId: args.roleId, user: args.user, workspaceId: args.workspaceId, allowCompletedRole: true }), loadRoleStartSession(args.roleId)]);
        if (shown) await notifyRoleStartSlack({ kind: "question", session: shown, state });
      });
    }
    return card.reply || "아래 질문에 골라 답하거나 직접 적어 주세요.";
  } catch (error) {
    console.warn("[role-start] reply question card failed", error);
    return args.reply;
  }
}

async function roleHasDescription(roleId: string) {
  const rows = await roleStartSql()<Array<{ described: boolean }>>`
    select coalesce(btrim(description), '') <> '' as described from public.company_roles where role_id = ${roleId}
  `;
  return rows[0]?.described === true;
}

/** Waits for the start session the draft creates (it starts right after the reply). */
async function waitForRoleStartSession(roleId: string, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const session = await loadRoleStartSession(roleId, { forView: true });
    if (session && ["drafting", "questions", "review"].includes(session.phase)) return true;
    if (session) return false;
    await sleep(1_000);
  }
  return false;
}

/**
 * A question the role chat wants to ask the team, posted as a card with chips
 * (the team can also answer in their own words). It joins the role start
 * questions: shown now if none is open, otherwise asked next.
 */
export async function askRoleStartQuestionFromChat(
  args: Access & { question: string; why?: string | null; chips: string[]; afterReply?: boolean }
) {
  const question = args.question.trim().slice(0, 300);
  if (!question) throw new OrgHttpError(400, "question is required");
  // Short of 4 chips: filled, not refused; more than 5: the first five.
  const filled = await fillChips({ question, chips: args.chips });
  if (filled.usage) await persistUsage(args.roleId, [filled.usage]);
  const labels = filled.chips;
  // Asked in the JD-reading turn, before the draft that turn starts has made
  // the session: the card joins the questions once the session exists.
  if (!(await loadRoleStartSession(args.roleId, { forView: true })) && (await roleHasDescription(args.roleId))) {
    runAfterResponse(async () => {
      if (await waitForRoleStartSession(args.roleId)) await askRoleStartQuestionFromChat({ ...args, chips: labels });
    });
    return { posted: true as const, shownNow: false };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const session = await loadRoleStartSession(args.roleId, { forView: true });
    if (!session || !["drafting", "questions", "review"].includes(session.phase)) return { posted: false as const, reason: "not_open" };
    const asked = [session.pendingQuestion, ...session.questions.candidates, ...session.questions.history];
    if (asked.some((item) => item && item.question.trim() === question)) return { posted: false as const, reason: "already_asked" };
    // Harper's cards count toward the same limit as the Brief's questions (asked, shown or queued cards);
    // a question skipped or dropped because an answer settled it is not counted.
    const counted = questionsTowardLimit({
      history: session.questions.history,
      pending: session.pendingQuestion,
      queued: session.questions.candidates,
    });
    if (counted >= QUESTION_HARD_LIMIT) {
      return { posted: false as const, reason: "question_limit" };
    }
    const card = {
      id: shortId("q"),
      question,
      why: String(args.why ?? "").trim().slice(0, 300),
      chips: labels.map((label) => ({ id: shortId("chip"), label, effect: { type: "note" as const } })),
    };
    const showNow = !session.pendingQuestion;
    const saved = await saveRoleStartSession({
      roleId: args.roleId,
      expectedRevision: session.revision,
      patch: {
        ...(showNow
          ? {
              pendingQuestion: { ...card, status: "pending" as const, overlap: null, askedAt: new Date().toISOString() },
              ...(session.phase === "review" ? { phase: "questions" as const } : {}),
            }
          : {}),
        questions: { ...session.questions, stopped: false, candidates: showNow ? session.questions.candidates : [card, ...session.questions.candidates] },
      },
    });
    if (!saved) continue;
    // A card moved out of the chat's own reply follows that reply.
    if (showNow && args.afterReply) runAfterResponse(() => syncChatCards(saved).then(() => undefined));
    else if (showNow) await syncChatCards(saved);
    return { posted: true as const, shownNow: showNow };
  }
  throw new OrgHttpError(409, "질문을 올리지 못했어요. 다시 시도해 주세요.");
}

export function roleStartBriefForPrompt(brief: RoleStartBrief) {
  return briefForPrompt(brief);
}
