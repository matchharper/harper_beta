import type { Database } from "./database";
import { internalScoringDatabase } from "./database";
import type { Stage } from "./decisions";
import { scoreWithReceipt } from "./telemetry";
import { loadInputs, type FrozenInput } from "./inputs";
import {
  claim,
  assertOwner,
  evaluateDurableStage,
  EXECUTOR,
  saveCoverage,
} from "./repository";
import type { Row } from "./evidence";

async function admittedPayload(db: Database, run: Row) {
  const payload = { ...run.trigger_payload };
  if (payload.sourceEvents?.length) {
    const follows = await db.query(
      `SELECT id::text,revision,scan_state FROM public.talent_company_follow
      WHERE talent_id=$1::uuid AND id=ANY($2::uuid[]) AND unfollowed_at IS NULL`,
      [run.talent_id, payload.sourceEvents.map((e: Row) => e.sourceId)]
    );
    payload.sourceEvents = payload.sourceEvents.filter((e: Row) =>
      follows.some(
        (f) =>
          f.id === e.sourceId &&
          Number(f.revision) === e.revision &&
          (!f.scan_state?.latestSourceKey ||
            f.scan_state.latestSourceKey === e.sourceKey)
      )
    );
    const valid = new Set(
      payload.sourceEvents.flatMap((e: Row) => e.roleIds ?? [])
    );
    payload.roleIds = payload.roleIds.filter((id: string) => valid.has(id));
    if (!payload.roleIds.length) return null;
  }
  if (payload.preparationRunId) {
    const [parent] = await db.query(
      `SELECT p.id FROM public.opportunity_discovery_run p
      WHERE p.id=$1::uuid AND p.talent_id=$2::uuid AND p.status='handed_off' AND p.trigger_payload->>'runContract'='career_agent_v1'
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.trigger_payload->'sourceEvents','[]'::jsonb)) event
        WHERE event->>'sourceKind'='schedule' AND NOT EXISTS(SELECT 1 FROM public.talent_agent_schedules s
          WHERE s.id=(event->>'sourceId')::uuid AND s.talent_id=p.talent_id AND s.directive_revision=(event->>'revision')::bigint))`,
      [payload.preparationRunId, run.talent_id]
    );
    if (!parent)
      throw new Error("Follow preparation owner is no longer active");
    const current = await db.query(
      `SELECT r.role_id::text FROM public.company_roles r JOIN public.company_workspace w USING(company_workspace_id)
      WHERE r.role_id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM public.talent_company_follow f WHERE f.talent_id=$2::uuid
        AND f.unfollowed_at IS NULL AND ((f.scope='company' AND f.company_db_id=w.company_db_id) OR (f.scope='workspace' AND f.company_workspace_id=w.company_workspace_id)))
      AND NOT EXISTS(SELECT 1 FROM public.company_role_candidate_evaluations e WHERE e.talent_id=$2::uuid AND e.role_id=r.role_id)
      AND NOT EXISTS(SELECT 1 FROM public.talent_opportunity_recommendation p WHERE p.talent_id=$2::uuid AND p.role_id=r.role_id)`,
      [payload.roleIds, run.talent_id]
    );
    payload.roleIds = current.map((r) => r.role_id);
  }
  return payload;
}

export async function notifyInternalEvaluation(db: Database, run: Row) {
  if (run.status === "handed_off" || run.coverage?.completionNotifiedAt) return;
  // Internal scoring is backend work; completion must never wake the Career LLM.
  await db.query(
    `UPDATE public.opportunity_discovery_run SET coverage=coverage||jsonb_build_object('completionNotifiedAt',now())
    WHERE id=$1::uuid AND status=$2 AND lease_token IS NOT DISTINCT FROM $3::uuid`,
    [run.id, run.status, run.lease_token]
  );
}

/** Transport and ownership differ from Python; the two-stage evaluator does not. */
export async function executeInternalEvaluation(
  runId: string,
  options: {
    db?: Database;
    score?: (source: Row, stage: Stage, signal: AbortSignal) => Promise<Row>;
    notify?: (db: Database, run: Row) => Promise<void>;
    signal?: AbortSignal;
    deadlineMs?: number;
  } = {}
) {
  const db = options.db ?? internalScoringDatabase(),
    notify = options.notify ?? notifyInternalEvaluation;
  const run = await claim(db, runId);
  if (!run) {
    const [existing] = await db.query(
      `SELECT * FROM public.opportunity_discovery_run WHERE id=$1::uuid AND trigger_payload->>'executor'=$2`,
      [runId, EXECUTOR]
    );
    if (!existing) throw new Error("Beta internal evaluation unavailable");
    if (existing.status === "handed_off")
      throw new Error(
        "Internal evaluation is already running; retry after its lease or completion"
      );
    await notify(db, existing);
    return;
  }
  const abort = new AbortController();
  const signal = AbortSignal.any([
    abort.signal,
    AbortSignal.timeout(options.deadlineMs ?? 750_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  // Two connections remain available beside Python's 16 scoring slots for
  // heartbeats/progress. A dead consumer is reclaimed after five minutes.
  let heartbeatInFlight: Promise<void> | undefined;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = db
      .query(
        `UPDATE public.opportunity_discovery_run SET lease_heartbeat_at=now()
      WHERE id=$1::uuid AND lease_token=$2::uuid AND status='handed_off' RETURNING id`,
        [run.id, run.lease_token]
      )
      .then((rows) => {
        if (!rows.length) abort.abort(new Error("Evaluation lease changed"));
      })
      .catch((error) => abort.abort(error))
      .finally(() => {
        heartbeatInFlight = undefined;
      });
  }, 30_000);
  heartbeat.unref();
  const coverage: Row = { ...(run.coverage ?? {}) },
    records: Row[] = [],
    failures: Row[] = [];
  let writes = Promise.resolve();
  const persist = () => {
    // Serialize snapshots so a slower completed role cannot overwrite newer IDs.
    const next = writes.then(async () => {
      const durable = await db.query(
        "SELECT id FROM public.company_role_candidate_evaluations WHERE discovery_run_id=$1::uuid",
        [run.id]
      );
      coverage.evaluationIds = [
        ...new Set([
          ...records.map((r) => r.evaluationId),
          ...durable.map((r) => r.id),
        ]),
      ];
      coverage.evaluations = records;
      coverage.failures = failures;
      await saveCoverage(db, run, coverage);
    });
    writes = next.catch(() => {});
    return next;
  };
  try {
    const payload = await admittedPayload(db, run);
    if (!payload) {
      await db.query(
        `UPDATE public.opportunity_discovery_run SET status='cancelled',completed_at=now() WHERE id=$1::uuid AND lease_token=$2::uuid AND status='handed_off'`,
        [run.id, run.lease_token]
      );
    } else {
      let sources: FrozenInput[] | undefined = coverage.frozenInputs;
      if (sources && (payload.sourceEvents?.length || payload.preparationRunId))
        sources = sources.filter((s) =>
          payload.roleIds.includes(s.context.roleId)
        );
      // A failed Role read must not discard other frozen inputs. On resume, only
      // retry those reads; successful stages keep their original evidence/cache.
      const retryRoleIds = (coverage.inputFailures ?? []).map((failure: Row) => failure.roleId)
        .filter((id: string) => payload.roleIds.includes(id));
      if (!sources || retryRoleIds.length) {
        const loaded =
          payload.preparationRunId && !payload.roleIds.length
            ? { sources: [], unavailableRoleIds: [], failures: [] }
            : await loadInputs(db.query, run.talent_id, sources ? { ...payload, roleIds: retryRoleIds } : payload);
        sources = [...(sources ?? []), ...loaded.sources];
        failures.push(...loaded.failures);
        coverage.inputFailures = loaded.failures;
        coverage.frozenInputs = sources;
        coverage.unavailableRoleIds = [...new Set([
          ...(coverage.unavailableRoleIds ?? []).filter((id: string) => !retryRoleIds.includes(id)),
          ...loaded.unavailableRoleIds,
        ])];
        await saveCoverage(db, run, coverage);
      }
      let index = 0;
      const outcomes = await Promise.allSettled(
        Array.from({ length: Math.min(16, sources.length) }, async () => {
          for (;;) {
            const input = sources![index++];
            if (!input || signal.aborted) return;
            const roleId = input.context.roleId;
            try {
              const score = (source: Row, stage: Stage) =>
                options.score
                  ? options.score(source, stage, signal)
                  : scoreWithReceipt(db, run, source, stage, signal);
              const first = await evaluateDurableStage(
                db,
                run,
                input,
                1,
                score
              );
              records.push({ ...first, roleId });
              await persist();
              if (
                payload.publishRecommendation || payload.requestedOpportunityId ||
                first.assessment.proceedToStage2
              ) {
                signal.throwIfAborted();
                records.push({
                  ...(await evaluateDurableStage(db, run, input, 2, score)),
                  roleId,
                });
              }
            } catch (error) {
              failures.push({
                roleId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            await persist();
          }
        })
      );
      const rejected = outcomes.find((r) => r.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
      signal.throwIfAborted();
      await persist();
      // Publication and follow handoff share the owner lock with cancellation.
      await db.transaction(async (query) => {
        await assertOwner(query, run, true);
        if (payload.requestedOpportunityId) {
          // Only attach evidence: membership, feedback and company consent may
          // have changed while evaluation ran and belong to their own writers.
          await query(`UPDATE public.talent_opportunity_recommendation SET evidence=coalesce(evidence,'[]'::jsonb)||$4::jsonb
            WHERE id=$1::uuid AND talent_id=$2::uuid AND role_id=ANY($3::uuid[])
              AND NOT coalesce(evidence,'[]'::jsonb) @> $5::jsonb`, [
            payload.requestedOpportunityId, run.talent_id, payload.roleIds,
            JSON.stringify([{ sourceRunId: run.id, evaluationIds: records.map(r => r.evaluationId) }]),
            JSON.stringify([{ sourceRunId: run.id }]),
          ]);
          coverage.recommendations = [{ recommendationId: payload.requestedOpportunityId, roleId: payload.roleIds[0], created: false }];
        }
        if (payload.publishRecommendation) {
          coverage.recommendations = [];
          for (const roleId of payload.roleIds) {
            const results = records.filter((r) => r.roleId === roleId);
            if (!results.some((r) => r.stage === 2)) continue;
            const [published] = await query(
              `SELECT public.publish_evaluated_internal_role_v1($1::uuid,$2::uuid,$3::uuid[],$4::uuid,$5) AS result`,
              [
                run.talent_id,
                roleId,
                results.map((r) => r.evaluationId),
                run.id,
                payload.operationId + ":publish:" + roleId,
              ]
            );
            coverage.recommendations.push(published.result);
          }
        }
        if (payload.sourceEvents?.length && !failures.length) {
          const existing = await query(
            `SELECT role_id::text FROM public.talent_opportunity_recommendation WHERE talent_id=$1::uuid AND role_id=ANY($2::uuid[])`,
            [run.talent_id, payload.roleIds]
          );
          const prior = new Set(existing.map((r) => r.role_id));
          const good = records
            .filter((r) => r.stage === 2 && !prior.has(r.roleId))
            .map((r) => r.roleId);
          await query(
            `SELECT public.complete_career_follow_evaluation($1,$2::uuid,$3::uuid,$4::jsonb,$5::jsonb,$6::jsonb)`,
            [
              run.id,
              run.talent_id,
              run.conversation_id,
              JSON.stringify(payload.sourceEvents),
              JSON.stringify(good),
              JSON.stringify({
                source: "internal",
                evaluationIds: coverage.evaluationIds,
                failures,
              }),
            ]
          );
        }
        await query(
          `UPDATE public.opportunity_discovery_run SET status=$3,coverage=$4::jsonb,completed_at=now(),error_message=NULL,updated_at=now()
          WHERE id=$1::uuid AND lease_token=$2::uuid AND status='handed_off'`,
          [
            run.id,
            run.lease_token,
            failures.length
              ? payload.sourceEvents?.length || !records.length
                ? "failed"
                : "partial"
              : "completed",
            JSON.stringify(coverage),
          ]
        );
      });
    }
  } catch (error) {
    await writes;
    await db.query(
      `UPDATE public.opportunity_discovery_run SET status=$3,coverage=$4::jsonb,completed_at=now(),error_message=$5,updated_at=now()
      WHERE id=$1::uuid AND lease_token=$2::uuid AND status='handed_off'`,
      [
        run.id,
        run.lease_token,
        coverage.evaluationIds?.length &&
        !run.trigger_payload.sourceEvents?.length
          ? "partial"
          : "failed",
        JSON.stringify(coverage),
        error instanceof Error ? error.message : String(error),
      ]
    );
  } finally {
    clearInterval(heartbeat);
    await heartbeatInFlight;
  }
  const [finished] = await db.query(
    "SELECT * FROM public.opportunity_discovery_run WHERE id=$1::uuid",
    [run.id]
  );
  await notify(db, finished);
}
