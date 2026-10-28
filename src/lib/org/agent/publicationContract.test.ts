import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCompanyCapabilities } from './capabilities/resolver';
import { serializeOrgAgentToolResult } from './promptFormat';

test('loaded publication schema requires kind and IDs, with no model-managed versions', () => {
  const before = resolveCompanyCapabilities({surface:'chat',mode:'progressive',loaded:new Set()});
  assert.ok(!before.offeredToolNames.has('publish_role_recommendations'));
  const loaded = resolveCompanyCapabilities({surface:'chat',mode:'progressive',loaded:new Set(['candidate_search'])});
  const schema = loaded.tools.find(tool=>tool.function.name==='publish_role_recommendations')!.function.parameters as any;
  assert.deepEqual(schema.required, ['roleId','kind','talentIds']);
  assert.deepEqual(schema.properties.kind.enum, ['add','replace']);
  assert.equal(schema.properties.briefVersion, undefined);
  assert.equal(schema.properties.poolVersion, undefined);
});

test('publication receipts project effect and exact references without internal execution objects', () => {
  for (const kind of ['add','replace']) {
    const original = {status:'queued',runId:'run-exact',kind,requestedRoleName:'Fixture role',
      options:{scope:'evaluated',talentIds:['talent-exact'],publication:{kind,sourceRunId:'source-exact',
        expectedBriefVersion:'private-version',expectedPoolVersion:'private-pool'}}};
    const saved = structuredClone(original);
    const rendered = serializeOrgAgentToolResult('publish_role_recommendations',original);
    assert.ok(rendered.includes(`kind=${kind}`));
    for (const ref of ['run-exact','talent-exact','source-exact']) assert.ok(rendered.includes(ref));
    for (const internal of ['private-version','private-pool','"publication"','"options"']) assert.ok(!rendered.includes(internal));
    assert.deepEqual(original,saved);
  }
  const failed = serializeOrgAgentToolResult('publish_role_recommendations',{
    status:'already_completed',runId:'failed-run',runStatus:'failed',kind:'add'});
  assert.ok(failed.includes('run_status=failed'));
  const rejected = serializeOrgAgentToolResult('publish_role_recommendations',{
    status:'not_queued',unavailableReason:'역할이 종료됨'});
  assert.ok(rejected.includes('실행되지 않음: 역할이 종료됨'));
});

test('completed publication supplies actual saved additions and no pending-writing instruction', () => {
  const output=serializeOrgAgentToolResult('publish_role_recommendations',{
    status:'completed',runId:'exact-run',kind:'add',roleName:'Audio role',requestedTalentIds:['new-1','existing-1'],
    addedTalentIds:['new-1'],refreshedTalentIds:[],removedTalentIds:[],retainedTalentIds:['existing-1'],
    sourceRunId:'source-run',candidateContact:false,model_manifest:{private:'not for model'},
  });
  for (const fact of ['저장 완료','추가=new-1','기존 목록 유지=existing-1','source_run=source-run']) assert.ok(output.includes(fact));
  for (const missing of ['요청 접수','아직','model_manifest','not for model']) assert.ok(!output.includes(missing));
});
