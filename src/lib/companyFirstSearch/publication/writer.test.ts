import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { evidence, presentationInput, parsePresentation, type PublicationCandidate, type PublicationRole } from './writer';
import { parsePublicationCommand } from './service';

const role: PublicationRole = {roleId:'role',name:'Audio Engineer',description:'Build audio models',hiringBrief:'Own training',
  companyBehavior:'',salary:'',criteria:[{name:'Audio research',criteria:'Evidence of audio research'}],outputLanguage:'한국어'};
const candidate: PublicationCandidate = {talentId:'talent',profile:{profile:{name:'Synthetic Person',headline:'Engineer',bio:'Built a speech model',location:'Seoul'},
  experiences:[{companyName:'Synthetic Co',role:'Engineer',startDate:'2020-01-01',endDate:null,description:'Improved inference'}],educations:[],extra:{talentExtras:[]}},
  searchBrief:[{label:'Work',content:'Wants to own training',ref:1,revision:1,created_at:'2026-10-26T01:02:03Z',updated_at:'2026-10-26T01:02:03Z'}],
  assessment:{criteria:[{name:'Audio research',score:0.65,label:'good',distribution:{good:.8,uncertain:.2}}],mutualFit:.9},evaluationId:'evaluation',sourceFingerprint:'source'};

test('web system prompt matches both interactive Worker branches exactly', () => {
  assert.match(execFileSync('python3',['scripts/syncCompanyPublicationPrompt.py','--check'],{encoding:'utf8'}),/match exactly/);
});
test('provider input is per person, readable, dated and preserves recorded scores separately', () => {
  const input = presentationInput(role,candidate,new Date('2026-10-27T00:00:00Z'));
  for (const fact of ['Synthetic Person','Improved inference','Wants to own training','c1','score: 0.65','label: good','2026-10-26 10:02','2026-10-27 (Asia/Seoul)'])
    assert.ok(input.user.includes(fact),fact);
  for (const absent of ['T01:02:03Z','mutualFit','sourceFingerprint','evaluationId','distribution','"profile":']) assert.ok(!input.user.includes(absent),absent);
  assert.match(input.system,/do not assign a new fitness label, numerical score or final fit/);
  assert.equal(evidence({content:'2026-10-26T01:02:03Z',updated_at:'2026-10-26T01:02:03Z'}),
    '- content: 2026-10-26T01:02:03Z\n- updated_at: 2026-10-26 10:02');
});
test('executor preserves original scores and maps exact criterion refs without qualitative validation', () => {
  const result = parsePresentation({tldr:'Evidence',harper_note:'',criteriaEvaluations:[{criterionRef:'c1',content:'Detailed evidence'}]},role,candidate);
  assert.equal(result.finalFit,null);
  assert.deepEqual(result.criteriaEvaluations[0],{name:'Audio research',fitness:'good',content:'Detailed evidence',criterionDefinition:'Evidence of audio research',
    score:.65,label:'good',distribution:{good:.8,uncertain:.2}});
  assert.throws(()=>parsePresentation({tldr:'Evidence',harper_note:'',criteriaEvaluations:[{criterionRef:'c2',content:'Wrong identifier'}]},role,candidate),/criteria/);
});
test('publication command has only exact IDs, kind and optional evidence reference', () => {
  const id='11111111-1111-4111-8111-111111111111';
  const base={workspaceId:id,userId:id,roleId:id,requestId:'stable-request'};
  const command=parsePublicationCommand({...base,input:{kind:'add',talentIds:[id],sourceRunId:id,briefVersion:'ignored',poolVersion:'ignored'}});
  assert.deepEqual(command,{...base,kind:'add',talentIds:[id],sourceRunId:id});
  assert.deepEqual(parsePublicationCommand({...base,input:{kind:'replace',talentIds:[]}}).talentIds,[]);
  assert.throws(()=>parsePublicationCommand({...base,input:{kind:'add',talentIds:[id,id]}}),/unique/);
});
