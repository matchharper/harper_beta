import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledSearchOptions} from './scheduledMatchingOptions';

test('scheduled model arguments cannot change Role or manufacture delegated authority',()=>{
  assert.throws(()=>scheduledSearchOptions({roleId:'other'},'role'));
  const value=scheduledSearchOptions({roleId:'role',rootJobId:'forged',origin:'company_requested',requestId:'forged',
    recommendCount:8,recommendCounts:{companyFirst:5,talentFirst:3}},'role');
  assert.deepEqual(value.recommendCounts,{companyFirst:5,talentFirst:3});
  for(const key of ['rootJobId','origin','requestId']) assert.equal(key in value,false);
});
test('evaluation-only requests cannot also authorize an effect',()=>{
  assert.throws(()=>scheduledSearchOptions({roleId:'role',recommendCount:0,
    recommendCounts:{companyFirst:1,talentFirst:0}},'role'));
  assert.deepEqual(scheduledSearchOptions({roleId:'role',recommendCount:0},'role').recommendCounts,
    {companyFirst:0,talentFirst:0});
});
test('accepted review uses source relationships and is not constrained to two people',()=>{
  const value=scheduledSearchOptions({roleId:'role',sourceRelation:'accepted',recommendCount:10},'role');
  assert.equal(value.sourceRelation,'accepted');
  assert.equal(value.recommendCount,10);
});
