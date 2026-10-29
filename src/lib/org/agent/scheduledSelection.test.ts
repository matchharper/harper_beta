import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledCandidateText, scheduledRecommendationOptions, type ScheduledSelectionInput } from './scheduledSelection';
import { resolveCompanyCapabilities } from './capabilities/resolver';
import { runScheduledMatchingLoop } from './scheduledMatching';
import { ORG_AGENT_SOL_MODEL } from './modelConfig';

function input(accepted = 8): ScheduledSelectionInput {
  const candidate = (ref: string, accepted: boolean) => ({ref,talentId:`uuid-${ref}`,name:ref,headline:'Engineer',
    joinedAt:'2026-10-23T00:00:00.001Z',scores:{companyFit:80,candidateFit:75,mutualFit:78},criteria:[],
    inputFingerprint:'current',evaluatedStage:2,
    acceptedRecommendation:accepted?{id:`rec-${ref}`,acceptedAt:'2026-10-23T00:00:00Z'}:null,
    allowedLabels:accepted?['connect']:['company_first','talent_first']});
  return {version:'compact_selection_v1',roleId:'role',briefVersion:'brief',ordinaryEligible:100,ordinaryShown:50,
    acceptedShown:accepted,limits:{companyFirst:5,talentFirst:3,acceptedConnect:null},
    candidates:[...Array.from({length:50},(_,i)=>candidate(`T${i+1}`,false)),
      ...Array.from({length:accepted},(_,i)=>candidate(`A${i+1}`,true))]};
}

test('compact model input includes 50 ordinary and every accepted candidate with formatted dates',()=>{
  const rendered=scheduledCandidateText(input(58));
  assert.match(rendered,/A58/);
  assert.match(rendered,/2026-10-23 09:00/);
  assert.doesNotMatch(rendered,/T00:00|\.001Z|uuid-|inputFingerprint/);
});
test('five company, three talent and all accepted map to exact commands without a read',()=>{
  const result=scheduledRecommendationOptions({actions:[
    {label:'company_first',talent_ids:['T1','T2','T3','T4','T5']},
    {label:'talent_first',talent_ids:['T6','T7','T8']},
    {label:'connect',talent_ids:Array.from({length:8},(_,i)=>`A${i+1}`)},
  ]},input(),'source');
  assert.equal(result.selections.length,16);
  assert.deepEqual(result.recommendCounts,{companyFirst:5,talentFirst:3});
  assert.equal(result.selections[15].talentId,'uuid-A8');
  assert.equal(scheduledRecommendationOptions({actions:[]},input(),'source').selections.length,0);
});
test('unknown aliases, conflicting routes, duplicates and exceeded capacity do not enqueue',()=>{
  for(const actions of [
    [{label:'company_first',talent_ids:['T999']}],
    [{label:'talent_first',talent_ids:['A1']}],
    [{label:'company_first',talent_ids:['T1','T1']}],
    [{label:'talent_first',talent_ids:['T1','T2','T3','T4']}],
  ]) assert.throws(()=>scheduledRecommendationOptions({actions},input(),'source'));
  const both=scheduledRecommendationOptions({actions:[{label:'company_first',talent_ids:['T1']},
    {label:'talent_first',talent_ids:['T1']}]},input(),'source');
  assert.equal(both.selections[0].route,'both');
});
test('ordinary company turns cannot load the scheduled action capability',()=>{
  const ordinary=resolveCompanyCapabilities({surface:'slack',mode:'full',loaded:new Set()});
  assert.equal(ordinary.offeredToolNames.has('recommend_talents'),false);
});
test('actual company loop submits a final selection in one completion with zero detail reads',async()=>{
  let calls=0, reads=0, actions=0;
  const selectionInput=input();
  const result=await runScheduledMatchingLoop({actorId:'actor',actorLabel:'Harper',currentUserMessageId:1,
    admin:new Proxy({}, {get(){throw Error('DB access forbidden');}}),
    conversation:{id:'conversation',role_id:'role',company_workspace_id:'workspace'},
    context:{workspace:{workspaceId:'workspace'},roles:[],companyText:'Fixture',rolesText:'Build systems',
      conversationText:'-',conversationMessages:[],summariesText:'-',recentContactsText:'-',recentRecommendationsText:'-',
      contextNotesText:'-',completeRoleRequestIds:[],defaultLongTextObservations:[],inProgressRoleCreationsText:'-',
      pendingUpdateText:'-',recentToolContextText:'-'},mentions:[],model:ORG_AGENT_SOL_MODEL,
    readAudience:'company_safe',scopeKey:'test',source:'slack',slackThreadId:null,user:{id:'actor'},
  } as any,{roleId:'role',scheduledSlot:'2026-10-23T00:00:00Z',rootJobId:'root',inventory:{},currentRoutes:[],selectionInput,
    completedRuns:[{runId:'prepared-run',status:'succeeded',coverage:{inputAvailable:50,inputUnavailable:1}}]},{
    complete:async(args)=>{
      calls++;
      assert.equal(calls,1,'successful submission must not cause another completion');
      assert.ok(args.tools?.some(tool=>tool.function.name==='recommend_talents'));
      const providerText=args.messages.map(message=>typeof message.content==='string'?message.content:'').join('\n');
      assert.match(providerText,/inputAvailable: 50/);
      assert.match(providerText,/inputUnavailable: 1/);
      assert.match(providerText,/prepared-run/);
      assert.doesNotMatch(providerText,/"completedRuns"\s*:/);
      return {model:ORG_AGENT_SOL_MODEL,response:{choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,
        tool_calls:[{id:'choose',type:'function',function:{name:'recommend_talents',arguments:JSON.stringify({actions:[{label:'connect',talent_ids:['A1','A2','A3']}]})}}]}}]}};
    },
    executeTool:async(args)=>{
      if(args.name!=='recommend_talents'){reads++;throw Error('Unneeded detail read');}
      const command=scheduledRecommendationOptions(args.input,selectionInput,'source');
      actions=command.selections.length;
      return {status:'queued'};
    },
  });
  assert.equal(calls,1);assert.equal(reads,0);assert.equal(actions,3);assert.equal(result.reply,'');
});
