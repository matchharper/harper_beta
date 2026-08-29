import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const eventIngress = source("../../app/api/internal/slack/events/route.ts");
const queueConsumer = source("../../app/api/queues/process-slack-turn/route.ts");
const dispatch = source("./slackQueueDispatch.ts");
const queueAdapter = source("./slackTurnQueue.ts");
const cronRecovery = source("../../app/api/internal/slack/queue-dispatch/route.ts");
const turnProcessor = source(
  "../../app/api/internal/org-agent/slack-turn/route.ts"
);
const interactivity = source("../../app/api/internal/slack/interactivity/route.ts");
const migration = source(
  "../../../supabase/migrations/20260828110000_slack_vercel_queue.sql"
);

test("Slack ingress publishes a durable Queue message before it ACKs", () => {
  const publish = eventIngress.indexOf("await publishHarperSlackEvent(body)");
  const ack = eventIngress.indexOf("return NextResponse.json({ ok: true })");

  assert.ok(publish >= 0);
  assert.ok(ack > publish);
  assert.match(queueAdapter, /idempotencyKey: `slack-event:\$\{eventId\}`/);
});

test("the Queue consumer directly runs the turn processor without an HTTP self-hop", () => {
  assert.match(queueConsumer, /processSlackTurn\(\{/);
  assert.match(queueConsumer, /claim_slack_reply_job_v3/);
  assert.match(queueConsumer, /visibilityTimeoutSeconds: 390/);
  assert.doesNotMatch(queueConsumer, /fetch\([^\n]*slack-turn/);
});

test("capacity backpressure cannot exhaust a durable job before it is claimed", () => {
  const capacityRetry = queueConsumer.indexOf("error instanceof SlackQueueCapacityError");

  assert.ok(capacityRetry >= 0);
  assert.doesNotMatch(
    queueConsumer,
    /if \(metadata\.deliveryCount >= SLACK_TURN_MAX_ATTEMPTS\)/
  );
  assert.match(queueConsumer, /visibilityTimeoutSeconds: 390/);
});

test("a concurrent duplicate delivery stays retryable while the original owns the job", () => {
  assert.match(queueConsumer, /claim\.reason === "already_processing"/);
  assert.match(queueConsumer, /throw new SlackQueueInFlightError\(\)/);
  assert.match(queueConsumer, /error instanceof SlackQueueInFlightError/);
});

test("the turn processor exclusively owns a claimed turn's Slack status", () => {
  const claim = queueConsumer.indexOf("const claim = await claimSlackReplyJob");
  const processor = queueConsumer.indexOf("processSlackTurn({");

  assert.ok(claim >= 0);
  assert.ok(processor > claim);
  assert.doesNotMatch(queueConsumer, /setLoadingStatus/);
  assert.doesNotMatch(queueConsumer, /setHarperSlackThreadStatus/);
  assert.match(turnProcessor, /status: responseStatus/);
});

test("reply-job publish recovery uses the existing job ledger and a 20-turn claim cap", () => {
  assert.match(dispatch, /queue_dispatch_attempt_count/);
  assert.match(queueAdapter, /idempotencyKey: `slack-reply-job:\$\{jobId\}`/);
  assert.match(migration, /p_max_concurrency integer default 20/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /create table[\s\S]*slack_queue_dispatch_outbox/i);
});

test("dispatch failures are counted consecutively, not once per successful recovery", () => {
  assert.match(dispatch, /queue_dispatch_attempt_count: 0/);
  assert.match(dispatch, /const dispatchAttemptCount =[\s\S]*queue_dispatch_attempt_count/);
  assert.match(migration, /new\.queue_dispatch_attempt_count := 0/);
  assert.ok(
    dispatch.indexOf("const dispatchAttemptCount") >
      dispatch.indexOf("} catch (error) {")
  );
});

test("Cron does not report a target-switch no-op as a Queue dispatch", () => {
  assert.match(cronRecovery, /const result = await dispatchSlackReplyJob/);
  assert.match(cronRecovery, /if \(result\) dispatched \+= 1/);
  assert.match(cronRecovery, /else skipped \+= 1/);
});

test("a slow turn aborts before the Function ceiling and remains retryable", () => {
  assert.match(turnProcessor, /SLACK_TURN_TIME_BUDGET_MS = 270_000/);
  assert.match(turnProcessor, /AbortSignal\.any\(\[\s*jobWatch\.signal,\s*slackTurnTimeBudget/);
  assert.match(
    turnProcessor,
    /slackTurnSignal\?\.aborted && !slackTurnTimeBudgetExpired/
  );
});

test("only actual LLM claims spend the five-attempt budget", () => {
  assert.match(queueConsumer, /const SLACK_TURN_MAX_ATTEMPTS = 5/);
  assert.match(queueConsumer, /p_max_retry_count: SLACK_TURN_MAX_ATTEMPTS/);
  assert.match(queueConsumer, /retryAfterSeconds\(args\.attemptCount\)/);
  assert.doesNotMatch(queueConsumer, /deliveryCount >= SLACK_TURN_MAX_ATTEMPTS/);
});

test("interactive Slack ACKs do not wait for Queue publish", () => {
  const firstPublish = interactivity.indexOf("await dispatchSlackReplyJob({");
  const firstAfter = interactivity.lastIndexOf("after(async () => {", firstPublish);

  assert.ok(firstPublish >= 0);
  assert.ok(firstAfter >= 0 && firstAfter < firstPublish);
});

test("an older Slack event cannot cancel a newer queued turn in the same thread", () => {
  assert.match(migration, /superseded_by_newer_thread_message/);
  assert.match(migration, /v_has_newer_active_job/);
  assert.match(migration, /job\.slack_message_ts::numeric > p_slack_message_ts::numeric/);
});
