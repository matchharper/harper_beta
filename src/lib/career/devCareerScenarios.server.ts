import { getCareerDevSqlClient } from "./devSql";
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { APPLICATION_CHECKPOINT_SHA256, APPLICATION_CHECKPOINT_USER_ID } from './devApplicationCheckpoint';
import { restoreApplicationCheckpoint } from './devApplicationCheckpoint.server';
import { CONSECUTIVE_APPLICATIONS_CHECKPOINT, POST_INTRODUCTION_APPLICATION_CHECKPOINT, COMPANY_EXPLORATION_CHECKPOINT, POST_MAIL_COMPANY_EXPLORATION_CHECKPOINT } from './devConsecutiveApplicationsCheckpoint';
import { HARPER_TEST_ROLE_ID, resetHarperTestRoleRecommendation } from './devHarperRoleReset';
import type { TalentAdminClient } from '@/lib/talentOnboarding/admin';

export type CareerScenario = {
  id: string; title: string;
  setup: { kind: 'account' } | { kind: 'harper_test_role' | 'saved_external_role'; roleId: string; list: 'new' | 'saved' };
  action: { kind: 'apply' | 'chat'; label: string; message: string };
  review: string[];
  followup?: { message: string; review: string };
};
function checkpointSource(hash: string) {
  if (hash === APPLICATION_CHECKPOINT_SHA256) return undefined;
  const source = [CONSECUTIVE_APPLICATIONS_CHECKPOINT, POST_INTRODUCTION_APPLICATION_CHECKPOINT, COMPANY_EXPLORATION_CHECKPOINT, POST_MAIL_COMPANY_EXPLORATION_CHECKPOINT].find(source => source.sha256 === hash);
  if (!source) throw new Error('Unknown scenario checkpoint');
  return source;
}
export async function readCareerScenarioRegistry(file = path.resolve(process.cwd(), '../harper_eval/scenarios/career/v1/cases.json')) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local development only');
  const bytes = await readFile(file);
  const registry = JSON.parse(bytes.toString()) as { version: string; checkpoint: string; profile: string; cases: CareerScenario[] };
  if (typeof registry.version !== 'string' || !registry.version.trim()) throw new Error('Scenario version is required for run provenance');
  checkpointSource(registry.checkpoint);
  if (!Array.isArray(registry.cases) || new Set(registry.cases.map(c => c.id)).size !== registry.cases.length) throw new Error('Scenario IDs must be unique');
  for (const scenario of registry.cases) {
    // IDs become filenames inside the private run directory.
    if (typeof scenario.id !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(scenario.id) || typeof scenario.title !== 'string'
      || typeof scenario.action?.label !== 'string' || typeof scenario.action?.message !== 'string' || !scenario.action.message.trim()
      || !Array.isArray(scenario.review) || !scenario.review.every(value => typeof value === 'string')
      || (scenario.followup && (typeof scenario.followup.message !== 'string' || typeof scenario.followup.review !== 'string')))
      throw new Error('Invalid scenario input or review definition');
    if (!['account', 'harper_test_role', 'saved_external_role'].includes(scenario.setup?.kind) || !['apply', 'chat'].includes(scenario.action?.kind)) throw new Error('Unsupported scenario executor');
    if (scenario.setup.kind === 'account') {
      if (scenario.action.kind !== 'chat') throw new Error('Account-only setup supports ordinary chat, not a role Apply action');
      continue;
    }
    if (!['new', 'saved'].includes(scenario.setup.list)) throw new Error('Unsupported opportunity list');
    if (!/^[0-9a-f-]{36}$/i.test(scenario.setup.roleId)) throw new Error('Invalid role identifier');
    if (scenario.setup.kind === 'harper_test_role' && scenario.setup.roleId !== HARPER_TEST_ROLE_ID) throw new Error('Harper reset targets its fixed fixture only');
  }
  return { ...registry, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function resetCareerScenario(scenario: CareerScenario, checkpoint = APPLICATION_CHECKPOINT_SHA256) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local development only');
  const source = checkpointSource(checkpoint);
  const userId = APPLICATION_CHECKPOINT_USER_ID;
  await restoreApplicationCheckpoint(source);
  const setup = scenario.setup;
  if (setup.kind === 'account') return;
  // Release checkpoint-wide locks before the ordinary role reset's account work.
  await getCareerDevSqlClient().begin(async tx => {
    const query = (sql: string, parameters: unknown[] = []) => tx.unsafe(sql, parameters as never[]);
    if (setup.kind === 'harper_test_role') {
      await resetHarperTestRoleRecommendation((sql, parameters) => query(sql, parameters), userId,
        async () => { throw new Error('Close the existing browser before restoring the scenario'); });
    } else {
      const [role] = await query("select role_id from company_roles where role_id=$1::uuid and source_type='external'", [setup.roleId]);
      if (!role) throw new Error('Scenario external role unavailable');
      const rows = await query(`update talent_opportunity_recommendation set feedback=$3, saved_stage=$4, dismissed_at=null, processed_stage=null where talent_id=$1::uuid and role_id=$2::uuid returning id`, [userId, setup.roleId, setup.list === 'saved' ? 'like' : null, setup.list === 'saved' ? 'saved' : null]);
      if (rows.length !== 1) throw new Error('Frozen scenario must contain exactly one selected recommendation');
    }
  });
}

/** ExternalOpportunityApplyModal saves interest before sending the Apply message. */
export async function performCareerScenarioApplyAction(admin: TalentAdminClient, scenario: CareerScenario) {
  if (process.env.NODE_ENV === 'production') throw new Error('Local development only');
  if (scenario.setup.kind === 'account') throw new Error('Apply requires a selected role');
  const userId = APPLICATION_CHECKPOINT_USER_ID;
  const { data, error } = await (admin.from('talent_opportunity_recommendation') as any)
    .select('id,feedback').eq('talent_id', userId).eq('role_id', scenario.setup.roleId).single();
  if (error || !data) throw new Error('Scenario action requires the owned recommendation');
  const { updateTalentOpportunityHistoryItem } = await import('@/lib/talentOpportunity');
  return updateTalentOpportunityHistoryItem({ admin, userId, opportunityId: data.id,
    action: data.feedback === 'like' ? 'saved_stage' : 'feedback',
    ...(data.feedback === 'like' ? {} : { feedback: 'positive' as const }), savedStage: 'saved',
  });
}
