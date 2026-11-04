import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectDueCareerWork, formatCareerSchedules, nextScheduleOccurrence } from './server';
import { CAREER_SCHEDULE_TOOLS } from './tools';
import { formatToolResultText } from '@/lib/llm/promptText';
import { assertCareerSourceEventsCurrent, CareerSourceChangedError } from '../companies/server';

import { owner, other, workspace, second, role, roleTwo, setup, write, follow, localAdmin } from './testSupport';

test('schedule receipt, occurrence ownership and cadence survive a no-send invocation', async () => {
  const db = await setup();
  try {
    const input = { action: 'create', title: 'Review', instruction: 'Review context; silence is valid.', timezone: 'Asia/Seoul', next_run_at: '2020-01-01T00:00:00Z', recurrence: '0 9 * * 1' };
    const first = await write(db, input, 'create-one');
    await db.query('insert into company_talent_followups(id,talent_id) values($1,$2)', [role, owner]);
    const revisit = await write(db, { ...input, target_refs: { companyFollowupIds: [role] } }, 'revisit-company');
    assert.deepEqual(revisit.target_refs.companyFollowupIds, [role]);
    await assert.rejects(write(db, { ...input, target_refs: { companyFollowupIds: [role] } }, 'foreign-obligation', other), /unavailable/);
    await db.query(`insert into opportunity_discovery_run(talent_id,status,completed_at,coverage,trigger_payload)
      values($1,'completed',now(),'{"agentOutcome":"no_send","sourceEventsFinishedAt":"2026-10-30"}',$2)`,
      [owner, JSON.stringify({ sourceEvents: [{ sourceKind: 'company_followup', sourceId: role, revision: 1 }] })]);
    const followupExecution = (await db.query<any>('select read_career_company_followup_execution($1) items', [[role]])).rows[0].items[0];
    assert.equal(followupExecution.reviewOutcome, 'no_send'); assert.ok(followupExecution.reviewedAt);
    assert.equal(new Date(followupExecution.nextCheckAt).toISOString(), new Date(revisit.next_run_at).toISOString());
    assert.equal((await write(db, input, 'create-one')).id, first.id);
    await assert.rejects(write(db, { action: 'pause', schedule_id: first.id, expected_revision: 1 }, 'foreign', other), /unavailable/);
    const occurrence = await db.query<{ id: string }>('select enqueue_career_schedule_occurrence($1,1,$2,$3) id', [first.id, first.next_run_at, '2030-01-07T00:00:00Z']);
    assert.ok(occurrence.rows[0].id);
    assert.equal((await db.query<{ id: string | null }>('select enqueue_career_schedule_occurrence($1,1,$2,$3) id', [first.id, first.next_run_at, '2030-01-07T00:00:00Z'])).rows[0].id, null);
    const schedule = (await db.query<any>('select * from talent_agent_schedules where id=$1', [first.id])).rows[0];
    assert.equal(schedule.status, 'active');
    assert.ok(schedule.next_run_at);
    assert.equal(schedule.revision, 1);
    const moved = await write(db, { action: 'update', schedule_id: first.id, expected_revision: 1, next_run_at: '2031-01-01T00:00:00Z' }, 'move');
    assert.equal(moved.directive_revision, 1);
    const paused = await write(db, { action: 'pause', schedule_id: first.id, expected_revision: 2 }, 'pause');
    assert.equal(paused.directive_revision, 2);
    await assert.rejects(write(db, { action: 'cancel', schedule_id: first.id, expected_revision: 2 }, 'stale'), /revision conflict/);
    assert.equal((await write(db, input, 'create-one')).id, first.id);
    const once = await write(db, { ...input, recurrence: null }, 'one-time');
    const onceRun = (await db.query<any>('select enqueue_career_schedule_occurrence($1,1,$2,null) id', [once.id, once.next_run_at])).rows[0].id;
    assert.equal((await db.query<any>('select status from talent_agent_schedules where id=$1', [once.id])).rows[0].status, 'triggered');
    assert.equal((await db.query<any>('select finish_career_source_events($1) done', [onceRun])).rows[0].done, false);
    await db.query("update opportunity_discovery_run set status='completed',coverage='{\"preserved\":true}' where id=$1", [onceRun]);
    assert.equal((await db.query<any>('select finish_career_source_events($1) done', [onceRun])).rows[0].done, true);
    assert.equal((await db.query<any>('select status from talent_agent_schedules where id=$1', [once.id])).rows[0].status, 'completed');
    const coverage = (await db.query<any>('select coverage from opportunity_discovery_run where id=$1', [onceRun])).rows[0].coverage;
    assert.equal(coverage.preserved, true); assert.ok(coverage.sourceEventsFinishedAt);
    const remaining = [{ sourceKind: 'schedule', sourceId: once.id, revision: 1, targetRefs: { legacySchedulerReview: true, internalRecommendations: true, externalRecommendations: false } }];
    const requeue = async () => (await db.query<any>('select requeue_career_remaining_sources($1,$2,$3) id', [onceRun, JSON.stringify(remaining), 'matching'])).rows[0].id;
    const continued = await requeue();
    assert.equal(await requeue(), continued);
    assert.equal((await db.query<any>('select last_run_id from talent_agent_schedules where id=$1', [once.id])).rows[0].last_run_id, continued);
    await db.query("update opportunity_discovery_run set status='completed' where id=$1", [continued]);
    assert.equal((await db.query<any>('select finish_career_source_events($1) done', [continued])).rows[0].done, true);
  } finally { await db.close(); }
});

test('company scopes, source deltas and silence receipts preserve exact ownership', async () => {
  const db = await setup();
  try {
    const follow = async (input: object, key: string) => (await db.query<any>('select write_career_company_follow($1,null,$2,$3) item', [owner, key, JSON.stringify(input)])).rows[0].item;
    const broad = await follow({ action: 'follow', scope: 'company', company_db_id: 1, company_workspace_id: workspace }, 'broad');
    const narrow = await follow({ action: 'follow', scope: 'workspace', company_workspace_id: workspace }, 'narrow');
    assert.notEqual(broad.id, narrow.id);
    assert.equal((await follow({ action: 'follow', scope: 'company', company_db_id: 1 }, 'same-target')).id, broad.id);
    const snapshots = (await db.query<any>('select read_career_follow_scan(100) items')).rows[0].items;
    assert.equal(snapshots.find((f: any) => f.id === broad.id).roles.length, 2);
    assert.equal(snapshots.find((f: any) => f.id === narrow.id).roles.length, 1);
    const originalFingerprint = snapshots[0].candidateFingerprint;
    await db.exec(`update talent_users set headline='Changed evidence' where user_id='${owner}'`);
    const changed = (await db.query<any>('select read_career_follow_scan(100) items')).rows[0].items;
    assert.notEqual(changed[0].candidateFingerprint, originalFingerprint);
    await db.exec(`update company_roles set information='{"testOnly":true}' where role_id='${role}'`);
    const isolated = (await db.query<any>('select read_career_follow_scan(100) items')).rows[0].items;
    assert.equal(isolated.find((f: any) => f.id === narrow.id).roles.length, 0);
    const events = [{ sourceKind: 'company_follow', sourceId: broad.id, revision: broad.revision, sourceKey: 'delta-one', roleIds: [roleTwo] }];
    const complete = (ids: string[]) => db.query<any>('select complete_career_follow_evaluation($1,$2,null,$3,$4) id', ['evaluation-one', owner, JSON.stringify(events), JSON.stringify(ids)]);
    await db.exec('set role harper_worker');
    assert.equal((await complete([])).rows[0].id, null);
    await db.exec('reset role');
    assert.equal((await db.query<any>('select scan_state from talent_company_follow where id=$1', [broad.id])).rows[0].scan_state.processedSourceKey, 'delta-one');
    const wake = (await complete([roleTwo])).rows[0].id;
    assert.equal((await complete([roleTwo])).rows[0].id, wake);
    await follow({ action: 'unfollow', scope: 'company', company_db_id: 1 }, 'remove');
    assert.equal((await complete([roleTwo])).rows[0].id, null);
  } finally { await db.close(); }
});

test('cutover is explicit, replay-safe, and stopped only suppresses external scope', async () => {
  const db = await setup();
  try {
    await db.exec("alter table talent_setting disable trigger initialize_career_check_in; update talent_setting set is_onboarding_done=true; alter table talent_setting enable trigger initialize_career_check_in");
    await db.exec(`insert into opportunity_scheduler_state values('${owner}',now()),('${other}',now())`);
    await db.exec(`insert into opportunity_discovery_run(talent_id,status,trigger_payload) values('${owner}','running','{"runContract":"new_v2"}')`);
    const preview = (await db.query<any>('select transition_career_agent_schedules() result')).rows[0].result;
    assert.equal(preview.created, 0); assert.equal(preview.eligible, 1); assert.equal(preview.skippedActiveLegacy, 1);
    await db.exec("update opportunity_discovery_run set status='completed'");
    const applied = (await db.query<any>('select transition_career_agent_schedules(false) result')).rows[0].result;
    assert.equal(applied.created, 2);
    assert.equal((await db.query<any>('select transition_career_agent_schedules(false) result')).rows[0].result.created, 0);
    const stopped = (await db.query<any>('select status,schedule_key from talent_agent_schedules where talent_id=$1', [other])).rows[0];
    assert.equal(stopped.status, 'active'); assert.equal(stopped.schedule_key, 'career_check_in');
    assert.equal((await db.query<any>('select status from talent_setting where user_id=$1', [other])).rows[0].status, 'stopped');
    const grants = await db.query<any>("select has_table_privilege('anon','talent_agent_schedules','select') allowed, has_function_privilege('authenticated','write_career_schedule(uuid,uuid,text,jsonb)','execute') callable");
    assert.equal(grants.rows[0].allowed, false); assert.equal(grants.rows[0].callable, false);
  } finally { await db.close(); }
});

test('recurrence and model projection use a real timezone and minute precision', () => {
  assert.equal(nextScheduleOccurrence('0 9 * * 1', 'Asia/Seoul', new Date('2026-10-29T01:00:00Z')), '2026-11-02T00:00:00.000Z');
  assert.equal(nextScheduleOccurrence(null, 'Asia/Seoul', new Date()), null);
  const output = formatCareerSchedules([{ id: owner, talent_id: owner, conversation_id: null, title: 'Check', instruction: 'Read current facts.', target_refs: {}, timezone: 'Asia/Seoul', next_run_at: '2026-11-02T00:00:00Z', recurrence: null, status: 'active', revision: 1, directive_revision: 1, last_run_id: null }]);
  assert.match(output, /2026-11-02 09:00/); assert.doesNotMatch(output, /T00:00:00Z/);
});

test('the actual read tool provider projection uses its dedicated text', async () => {
  const stored = { id: owner, talent_id: owner, conversation_id: null, title: 'Check', instruction: 'Read current facts.', target_refs: { companyFollowupIds: [role] }, timezone: 'Asia/Seoul', next_run_at: '2026-11-02T00:00:00Z', recurrence: null, status: 'active', revision: 1, directive_revision: 1, last_run_id: null, raw_private_metadata: { notForPrompt: 'hidden-object' } };
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: stored, error: null }; } };
  const result = await CAREER_SCHEDULE_TOOLS.read_schedule.execute!({ schedule_id: owner }, { admin: { from: () => query }, userId: owner } as any);
  const providerText = formatToolResultText(result);
  assert.match(providerText, /2026-11-02 09:00/);
  assert.ok(providerText.includes(owner) && providerText.includes(role));
  assert.doesNotMatch(providerText, /raw_private_metadata|hidden-object|T00:00:00Z/);
});

test('schedule edits preserve in-flight authority for unchanged content and enforce actual pause/cancel revisions', async () => {
  const db = await setup();
  try {
    const input = { action: 'create', title: 'Review', instruction: 'Read my context.', target_refs: {}, timezone: 'UTC', next_run_at: '2020-01-01T00:00:00Z' };
    const [first, duplicate] = await Promise.all([write(db, input, 'same-request'), write(db, input, 'same-request')]);
    assert.equal(first.id, duplicate.id);
    const moved = await write(db, { ...input, action: 'update', schedule_id: first.id, expected_revision: 1, next_run_at: '2020-02-01T00:00:00Z' }, 'move-with-unchanged-directive');
    assert.equal(moved.directive_revision, 1);
    const changed = await write(db, { action: 'update', schedule_id: first.id, expected_revision: 2, instruction: 'Read the new document first.' }, 'change');
    assert.equal(changed.directive_revision, 2);
    const paused = await write(db, { action: 'pause', schedule_id: first.id, expected_revision: 3 }, 'pause');
    assert.equal((await db.query<any>('select enqueue_career_schedule_occurrence($1,$2,$3,null) id', [first.id, paused.revision, paused.next_run_at])).rows[0].id, null);
    const resumed = await write(db, { action: 'resume', schedule_id: first.id, expected_revision: 4 }, 'resume');
    assert.equal(resumed.status, 'active'); assert.equal(resumed.directive_revision, paused.directive_revision);
    await write(db, { action: 'cancel', schedule_id: first.id, expected_revision: 5 }, 'cancel');
    assert.equal((await db.query<any>('select enqueue_career_schedule_occurrence($1,5,$2,null) id', [first.id, resumed.next_run_at])).rows[0].id, null);
    assert.equal((await db.query<any>('select count(*) count from talent_agent_schedules')).rows[0].count, 1);
  } finally { await db.close(); }
});

test('actual schedule tool normalizes explicit timezones and recurrence follows DST without duplicate autumn occurrence', async () => {
  assert.equal(nextScheduleOccurrence('0 9 * * *', 'America/New_York', new Date('2026-03-07T15:00:00Z')), '2026-03-08T13:00:00.000Z');
  assert.equal(nextScheduleOccurrence('30 2 * * *', 'America/New_York', new Date('2026-03-08T06:00:00Z')), '2026-03-08T07:30:00.000Z');
  assert.equal(nextScheduleOccurrence('30 1 * * *', 'America/New_York', new Date('2026-11-01T05:35:00Z')), '2026-11-02T06:30:00.000Z');
  const db = await setup();
  try {
    const context = { admin: localAdmin(db), userId: owner, userMessageId: '88' } as any;
    const base = { action: 'create', title: '검토', instruction: '현재 맥락을 검토해줘.', timezone: 'Asia/Seoul', next_run_at: '2026-11-02T09:30:00' };
    const local = await CAREER_SCHEDULE_TOOLS.upsert_schedule.execute!(base, context) as any;
    assert.equal(new Date(local.schedule.next_run_at).toISOString(), '2026-11-02T00:30:00.000Z');
    assert.match(formatToolResultText(local), /2026-11-02 09:30/);
    const absolute = await CAREER_SCHEDULE_TOOLS.upsert_schedule.execute!({ ...base, next_run_at: '2026-11-02T09:30:00Z' }, context) as any;
    assert.equal(new Date(absolute.schedule.next_run_at).toISOString(), '2026-11-02T09:30:00.000Z');
    for (const bad of [{ ...base, timezone: 'Not/AZone' }, { ...base, next_run_at: 'not-a-date' }, { ...base, next_run_at: null }, { ...base, recurrence: 'not a cron' }]) {
      await assert.rejects(CAREER_SCHEDULE_TOOLS.upsert_schedule.execute!(bad, context));
    }
    assert.equal((await db.query<any>('select count(*) count from talent_agent_schedules')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('periodic collection ignores followed company changes and only queues due active schedules', async () => {
  const db = await setup();
  try {
    await follow(db, { action: 'follow', scope: 'company', company_db_id: 1 }, 'company');
    await follow(db, { action: 'follow', scope: 'workspace', company_workspace_id: workspace }, 'workspace');
    const admin = localAdmin(db);
    assert.deepEqual(await collectDueCareerWork({ admin }), { runIds: [], scheduleCount: 0 });
    await db.query("update company_roles set name='Updated opening',information='{\"changed\":true}'");
    await db.query("update talent_users set headline='Updated experience' where user_id=$1", [owner]);
    const input = { action: 'create', title: 'Review', instruction: 'Review the saved task.', timezone: 'Asia/Seoul', recurrence: null };
    await write(db, { ...input, next_run_at: '2099-01-01T00:00:00Z' }, 'future');
    const paused = await write(db, { ...input, next_run_at: '2020-01-01T00:00:00Z' }, 'paused');
    await write(db, { action: 'pause', schedule_id: paused.id, expected_revision: 1 }, 'pause');
    assert.deepEqual(await collectDueCareerWork({ admin }), { runIds: [], scheduleCount: 0 });
    const due = await write(db, { ...input, next_run_at: '2020-01-01T00:00:00Z' }, 'due');
    const collected = await collectDueCareerWork({ admin });
    assert.equal(collected.scheduleCount, 1);
    const runs = (await db.query<any>('select * from opportunity_discovery_run')).rows;
    assert.equal(runs.length, 1);
    assert.deepEqual(collected.runIds, [runs[0].id]);
    assert.equal(runs[0].trigger, 'career_schedule_due');
    assert.equal(runs[0].trigger_payload.sourceEvents[0].sourceId, due.id);
    assert.deepEqual(await collectDueCareerWork({ admin }), { runIds: [], scheduleCount: 0 });
    assert.equal((await db.query<any>('select count(*) count from talent_company_follow where unfollowed_at is null')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('unchanged follow updates do not invalidate evaluations and editing an unfollowed subscription does not restart it', async () => {
  const db = await setup();
  try {
    const input = { scope: 'workspace', company_workspace_id: workspace, instruction: 'Engineering roles' };
    const initial = await follow(db, { ...input, action: 'follow' }, 'start');
    await db.query('select record_career_follow_scan($1,1,$2)', [initial.id, JSON.stringify({ latestSourceKey: 'kept', checkedAt: '2026-10-30T00:00:00Z' })]);
    const unchanged = await follow(db, { ...input, action: 'update', expected_revision: 1 }, 'same');
    assert.equal(unchanged.revision, 1); assert.equal(unchanged.scan_state.latestSourceKey, 'kept');
    const removed = await follow(db, { ...input, action: 'unfollow' }, 'stop');
    const edited = await follow(db, { ...input, instruction: 'Research roles', action: 'update' }, 'edit-inactive');
    assert.ok(edited.unfollowed_at); assert.equal(edited.revision, removed.revision + 1);
    const resumed = await follow(db, { ...input, action: 'follow' }, 'restart');
    assert.equal(resumed.id, initial.id); assert.equal(resumed.unfollowed_at, null);
    const event = [{ sourceKind: 'company_follow', sourceId: initial.id, revision: 1, sourceKey: 'kept', roleIds: [role] }];
    assert.equal((await db.query<any>('select complete_career_follow_evaluation($1,$2,null,$3,$4) id', ['old-evaluation', owner, JSON.stringify(event), JSON.stringify([role])])).rows[0].id, null);
  } finally { await db.close(); }
});

test('out-of-order follow completion cannot consume a newer delta and partial unfollow retains only surviving role IDs', async () => {
  const db = await setup();
  try {
    const a = await follow(db, { action: 'follow', scope: 'workspace', company_workspace_id: workspace }, 'a');
    const b = await follow(db, { action: 'follow', scope: 'workspace', company_workspace_id: second }, 'b');
    const events = [a, b].map((item, index) => ({ sourceKind: 'company_follow', sourceId: item.id, revision: 1, sourceKey: 'old', occurredAt: '2026-10-29T00:00:00Z', roleIds: [index ? roleTwo : role] }));
    await db.query('select record_career_follow_scan($1,1,$2)', [a.id, JSON.stringify({ latestSourceKey: 'new', checkedAt: '2026-10-30T00:00:00Z' })]);
    assert.equal((await db.query<any>('select record_career_follow_scan($1,1,$2) saved', [a.id, JSON.stringify({ latestSourceKey: 'old', checkedAt: '2026-10-29T00:00:00Z' })])).rows[0].saved, false);
    const wake = (await db.query<any>('select complete_career_follow_evaluation($1,$2,null,$3,$4) id', ['mixed', owner, JSON.stringify(events), JSON.stringify([role, roleTwo])])).rows[0].id;
    const run = (await db.query<any>('select trigger_payload from opportunity_discovery_run where id=$1', [wake])).rows[0].trigger_payload;
    assert.deepEqual(run.roleIds, [roleTwo]); assert.equal(run.sourceEvents.length, 1);
    assert.equal((await db.query<any>('select scan_state from talent_company_follow where id=$1', [a.id])).rows[0].scan_state.processedSourceKey, undefined);
    await follow(db, { action: 'unfollow', scope: 'workspace', company_workspace_id: second }, 'remove-b');
    assert.equal((await db.query<any>('select complete_career_follow_evaluation($1,$2,null,$3,$4) id', ['mixed-again', owner, JSON.stringify(events), JSON.stringify([role, roleTwo])])).rows[0].id, null);
  } finally { await db.close(); }
});

test('same-name companies remain distinct identities and workspace-only follows support an unlinked organization', async () => {
  const db = await setup();
  try {
    await db.exec("insert into company_db values(2,'Example')");
    await db.query('update company_workspace set company_db_id=2 where company_workspace_id=$1', [second]);
    await assert.rejects(follow(db, { action: 'follow', scope: 'company', company_db_id: 1, company_workspace_id: second }, 'wrong-link'), /does not belong/);
    const first = await follow(db, { action: 'follow', scope: 'company', company_db_id: 1 }, 'first-name');
    const secondCompany = await follow(db, { action: 'follow', scope: 'company', company_db_id: 2 }, 'second-name');
    assert.notEqual(first.id, secondCompany.id);
    const snapshot = (await db.query<any>('select read_career_follow_scan(100) items')).rows[0].items;
    assert.deepEqual(snapshot.find((item: any) => item.id === first.id).roles.map((item: any) => item.roleId), [role]);
    assert.deepEqual(snapshot.find((item: any) => item.id === secondCompany.id).roles.map((item: any) => item.roleId), [roleTwo]);
    await db.query('update company_workspace set company_db_id=null where company_workspace_id=$1', [second]);
    const unlinked = await follow(db, { action: 'follow', scope: 'workspace', company_workspace_id: second }, 'unlinked');
    assert.equal(unlinked.company_db_id, null); assert.equal(unlinked.company_workspace_id, second);
  } finally { await db.close(); }
});

test('source cancellation atomically moves surviving schedule ownership and stopped does not cancel explicit work', async () => {
  const db = await setup();
  try {
    const input = { action: 'create', title: 'Read document', instruction: 'Review my saved document.', timezone: 'UTC', next_run_at: '2020-01-01T00:00:00Z' };
    const a = await write(db, input, 'a'), b = await write(db, input, 'b');
    const events = [a, b].map(item => ({ sourceKind: 'schedule', sourceId: item.id, revision: 1 }));
    const run = (await db.query<any>("insert into opportunity_discovery_run(talent_id,status,trigger_payload) values($1,'handed_off',$2) returning *", [owner, JSON.stringify({ runContract: 'career_agent_v1', contactScope: 'external_recommendations', sourceEvents: events, evaluationEvidence: { private: true } })])).rows[0];
    await db.query("update talent_agent_schedules set status='triggered',next_run_at=null,last_run_id=$1", [run.id]);
    await write(db, { action: 'cancel', schedule_id: a.id, expected_revision: 1 }, 'cancel-a');
    await db.query("update talent_setting set status='stopped',profile_visibility='dont_share' where user_id=$1", [owner]);
    await assert.rejects(assertCareerSourceEventsCurrent({ admin: localAdmin(db), run }), CareerSourceChangedError);
    await assert.rejects(assertCareerSourceEventsCurrent({ admin: localAdmin(db), run }), CareerSourceChangedError);
    const remaining = (await db.query<any>("select * from opportunity_discovery_run where trigger='career_source_reconciled'")).rows;
    assert.equal(remaining.length, 1); assert.deepEqual(remaining[0].trigger_payload.sourceEvents, [events[1]]);
    assert.equal(remaining[0].trigger_payload.evaluationEvidence, undefined);
    assert.equal(remaining[0].trigger_payload.contactScope, 'delegated_work');
    assert.equal((await db.query<any>('select last_run_id from talent_agent_schedules where id=$1', [b.id])).rows[0].last_run_id, remaining[0].id);
    await assertCareerSourceEventsCurrent({ admin: localAdmin(db), run: remaining[0] });
    await db.query("update opportunity_discovery_run set status='completed' where id=$1", [remaining[0].id]);
    await db.query('select finish_career_source_events($1)', [remaining[0].id]);
    assert.equal((await db.query<any>('select status from talent_agent_schedules where id=$1', [b.id])).rows[0].status, 'completed');
  } finally { await db.close(); }
});

test('company follow-up no-send reads only the exact revision and the actual unpaused related schedule', async () => {
  const db = await setup();
  try {
    await db.query('insert into company_talent_followups(id,talent_id) values($1,$2)', [role, owner]);
    const input = { action: 'create', title: 'Later review', instruction: 'Private user context.', timezone: 'UTC', next_run_at: '2030-01-01T00:00:00Z' };
    const schedule = await write(db, { ...input, target_refs: { companyFollowupIds: [role] } }, 'related');
    await write(db, { ...input, next_run_at: '2029-01-01T00:00:00Z' }, 'unrelated');
    const run = (await db.query<any>("insert into opportunity_discovery_run(talent_id,status,completed_at,coverage,trigger_payload) values($1,'completed',now(),'{\"agentOutcome\":\"no_send\"}',$2) returning id", [owner, JSON.stringify({ sourceEvents: [{ sourceKind: 'company_followup', sourceId: role, revision: 1 }] })])).rows[0].id;
    const read = async () => (await db.query<any>('select read_career_company_followup_execution($1) items', [[role]])).rows[0].items[0];
    assert.equal((await read()).reviewOutcome, null);
    await db.query('select finish_career_source_events($1)', [run]);
    const completed = await read();
    assert.equal(completed.reviewOutcome, 'no_send');
    assert.equal(new Date(completed.nextCheckAt).toISOString(), '2030-01-01T00:00:00.000Z');
    assert.deepEqual(Object.keys(completed).sort(), ['followupId', 'nextCheckAt', 'reviewOutcome', 'reviewedAt']);
    await write(db, { action: 'pause', schedule_id: schedule.id, expected_revision: 1 }, 'pause-related');
    assert.equal((await read()).nextCheckAt, null);
    await db.query('update company_talent_followups set revision=2 where id=$1', [role]);
    assert.equal((await read()).reviewOutcome, null);
  } finally { await db.close(); }
});
