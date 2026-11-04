import { randomUUID } from "node:crypto";
import type { Database, Query } from "./database";
import { assertInput, type FrozenInput } from "./inputs";
import { INPUT_CONTRACT, inputFingerprint, type Row } from "./evidence";
import type { Stage } from "./decisions";

export const EXECUTOR = "career_internal_beta_v1";
let activeStages = 0;
const waitingStages: (() => void)[] = [];
async function withStageSlot<T>(work: () => Promise<T>) {
  if (activeStages >= 16)
    await new Promise<void>((resolve) => waitingStages.push(resolve));
  else activeStages++;
  try {
    return await work();
  } finally {
    const next = waitingStages.shift();
    if (next) next();
    else activeStages--;
  }
}
export function receiptStatus(run: Row) {
  return run.status === "handed_off"
    ? run.lease_token
      ? "running"
      : "queued"
    : run.status;
}
export async function enqueue(
  db: Database,
  args: {
    userId: string;
    conversationId?: string;
    operationId: string;
    payload: Row;
  }
) {
  return db.transaction(async (query) => {
    // A separate operation namespace cannot reuse legacy runs marked completed
    // by the unrelated recommendation engine. Never rewrite historical work.
    const key = `career-internal-beta:${args.userId}:${args.operationId}`;
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [key]);
    const [owner] = await query(
      `SELECT t.user_id FROM public.talent_users t WHERE t.user_id=$1::uuid AND t.deleted_at IS NULL
      AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM public.talent_conversations c WHERE c.id=$2::uuid AND c.user_id=t.user_id))`,
      [args.userId, args.conversationId ?? null]
    );
    if (!owner) throw new Error("Talent or conversation unavailable");
    const [existing] = await query(
      "SELECT * FROM public.opportunity_discovery_run WHERE talent_id=$1::uuid AND dedupe_key=$2",
      [args.userId, key]
    );
    if (existing) return existing;
    const [profile] = await query(
      `SELECT 1 FROM public.talent_profiles p JOIN public.talent_profile_revisions v ON v.profile_id=p.id
      WHERE p.talent_id=$1::uuid AND p.id=$2::uuid AND v.revision=$3::bigint`,
      [args.userId, args.payload.profileId, args.payload.profileRevision]
    );
    if (!profile) throw new Error("Profile revision unavailable");
    // handed_off is the existing non-Python execution state. Crucially, there
    // is NEVER an intermediate queued/running row for old workers to claim/recover.
    const [run] = await query(
      `INSERT INTO public.opportunity_discovery_run
      (talent_id,conversation_id,trigger,run_mode,status,dedupe_key,trigger_payload)
      VALUES($1::uuid,$2::uuid,'career_internal_evaluation','refresh','handed_off',$3,$4::jsonb) RETURNING *`,
      [
        args.userId,
        args.conversationId ?? null,
        key,
        JSON.stringify({
          ...args.payload,
          executor: EXECUTOR,
          operationId: args.operationId,
        }),
      ]
    );
    return run;
  });
}
export async function control(
  db: Database,
  userId: string,
  runId: string,
  action: "resume" | "cancel"
) {
  return db.transaction(async (query) => {
    const [run] = await query(
      `SELECT * FROM public.opportunity_discovery_run WHERE id=$1::uuid AND talent_id=$2::uuid
      AND trigger='career_internal_evaluation' AND trigger_payload->>'executor'=$3 FOR UPDATE`,
      [runId, userId, EXECUTOR]
    );
    if (!run)
      throw new Error(
        "This evaluation is not owned by beta; request a new evaluation"
      );
    if (action === "cancel") {
      if (run.status !== "handed_off") return run;
      const [cancelled] = await query(
        `UPDATE public.opportunity_discovery_run SET status='cancelled',
        trigger_payload=trigger_payload||'{"cancelRequested":true}'::jsonb,lease_token=NULL,
        completed_at=now(),updated_at=now() WHERE id=$1::uuid RETURNING *`,
        [runId]
      );
      return cancelled;
    }
    if (run.status === "handed_off") return run;
    const [resumed] = await query(
      `UPDATE public.opportunity_discovery_run SET status='handed_off',lease_token=NULL,
      lease_heartbeat_at=NULL,trigger_payload=trigger_payload-'cancelRequested',coverage=coverage-'completionNotifiedAt',
      error_message=NULL,completed_at=NULL,updated_at=now() WHERE id=$1::uuid RETURNING *`,
      [runId]
    );
    return resumed;
  });
}
export async function claim(db: Database, runId: string) {
  const token = randomUUID();
  const [run] = await db.query(
    `UPDATE public.opportunity_discovery_run SET lease_token=$2::uuid,lease_heartbeat_at=now(),
    started_at=coalesce(started_at,now()),updated_at=now()
    WHERE id=$1::uuid AND trigger='career_internal_evaluation' AND trigger_payload->>'executor'=$3
      AND status='handed_off' AND NOT coalesce((trigger_payload->>'cancelRequested')::boolean,false)
      AND (lease_token IS NULL OR lease_heartbeat_at < now()-interval '5 minutes') RETURNING *`,
    [runId, token, EXECUTOR]
  );
  return run;
}
export async function assertOwner(query: Query, run: Row, lock = false) {
  const [current] = await query(
    `SELECT id FROM public.opportunity_discovery_run WHERE id=$1::uuid AND talent_id=$2::uuid
    AND status='handed_off' AND trigger_payload->>'executor'=$4 AND lease_token=$3::uuid
    AND NOT coalesce((trigger_payload->>'cancelRequested')::boolean,false)${lock ? " FOR SHARE" : ""}`,
    [run.id, run.talent_id, run.lease_token, EXECUTOR]
  );
  if (!current) throw new Error("Evaluation owner lease changed");
}
export async function saveCoverage(db: Database, run: Row, coverage: Row) {
  const updated = await db.query(
    `UPDATE public.opportunity_discovery_run SET coverage=$3::jsonb,updated_at=now(),last_progress_at=now()
    WHERE id=$1::uuid AND lease_token=$2::uuid AND status='handed_off' RETURNING id`,
    [run.id, run.lease_token, JSON.stringify(coverage)]
  );
  if (!updated.length) throw new Error("Evaluation owner lease changed");
}
export function evaluationRecord(row: Row) {
  return {
    evaluationId: row.id,
    talentId: row.talent_id,
    stage: row.stage,
    inputFingerprint: row.input_fingerprint,
    assessment: row.assessment,
    evaluatedAt: row.evaluated_at,
    runId: row.run_id ?? null,
    discoveryRunId: row.discovery_run_id ?? null,
  };
}
export async function evaluateDurableStage(
  db: Database,
  run: Row,
  input: FrozenInput,
  stage: Stage,
  score: (source: Row, stage: Stage) => Promise<Row>
) {
  const { context, source } = input,
    fingerprint = inputFingerprint(source);
  return withStageSlot(() =>
    db.transaction(async (query) => {
      // Same advisory key as Python, including stage and exact input. Transaction
      // locks also work with transaction-pooler URLs and release on connection loss.
      // Model calls may exceed the DB's default idle-transaction timeout.
      await query("SET LOCAL idle_in_transaction_session_timeout='0'");
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        `worker-decisions:${context.roleId}:${source.talentId}:${stage}:${fingerprint}`,
      ]);
      await assertOwner(query, run);
      const [cached] = await query(
        `SELECT * FROM public.company_role_candidate_evaluations WHERE role_id=$1::uuid AND talent_id=$2::uuid
      AND brief_version=$3 AND stage=$4 AND input_fingerprint=$5 AND input_contract_version=$6 ORDER BY evaluated_at DESC,id DESC LIMIT 1`,
        [
          context.roleId,
          source.talentId,
          context.version,
          stage,
          fingerprint,
          INPUT_CONTRACT,
        ]
      );
      if (cached) {
        await assertInput(query, input);
        return { ...evaluationRecord(cached), reused: true };
      }
      const response = await score(source, stage);
      await assertInput(query, input);
      await assertOwner(query, run, true);
      const [saved] = await query(
        `INSERT INTO public.company_role_candidate_evaluations
      (company_workspace_id,role_id,talent_id,run_id,discovery_run_id,brief_version,stage,input_fingerprint,assessment,
       input_contract_version,source_profile_id,source_profile_revision,source_material_id,evidence_scope)
      VALUES($1::uuid,$2::uuid,$3::uuid,NULL,$4::uuid,$5,$6,$7,$8::jsonb,$9,$10::uuid,$11,NULL,$12) RETURNING *`,
        [
          context.workspaceId,
          context.roleId,
          source.talentId,
          run.id,
          context.version,
          stage,
          fingerprint,
          JSON.stringify(response.assessment),
          INPUT_CONTRACT,
          source.sourceProfileId,
          source.sourceProfileRevision,
          source.evidenceScope ?? "default",
        ]
      );
      return {
        ...evaluationRecord(saved),
        reused: false,
        ...Object.fromEntries(
          ["model", "usage", "elapsedMs", "attempts", "requestCount"]
            .filter((k) => k in response)
            .map((k) => [k, response[k]])
        ),
      };
    })
  );
}
