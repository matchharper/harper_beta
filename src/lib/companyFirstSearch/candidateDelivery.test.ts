import assert from 'node:assert/strict';
import test from 'node:test';
import { readCandidateDeliveryFacts } from './candidateDelivery';

test('optional delivery evidence preserves only verified facts for the authorized scope', async () => {
  const facts = await readCandidateDeliveryFacts({workspaceId:'workspace',roleIds:['role'],talentIds:['talent'],admin:{
    async rpc(name, input) {
      assert.equal(name,'read_company_candidate_delivery_v1');
      assert.deepEqual(input,{p_company_workspace_id:'workspace',p_role_ids:['role'],p_talent_ids:['talent']});
      return {data:[{talent_id:'talent',role_id:'role',available_in_app_at:'2026-10-06T01:00:00Z',email_sent_at:null}],error:null};
    }
  }});
  assert.deepEqual(facts.get('talent:role'),{availableInAppAt:'2026-10-06T01:00:00Z',emailSentAt:null});
});

test('unavailable delivery evidence does not break the board or invent a not-sent record', async () => {
  for (const code of ['PGRST202','42501','57014']) {
    const facts = await readCandidateDeliveryFacts({workspaceId:'workspace',roleIds:['role'],talentIds:['talent'],admin:{
      async rpc() {return {data:null,error:{code}};}
    }});
    assert.equal(facts.size,0);
    assert.equal(facts.has('talent:role'),false);
  }
});

test('empty scoped targets make no delivery query', async () => {
  const facts = await readCandidateDeliveryFacts({workspaceId:'workspace',roleIds:[],talentIds:['talent'],admin:{
    rpc() {throw Error('No query expected');}
  }});
  assert.equal(facts.size,0);
});
