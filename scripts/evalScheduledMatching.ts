/** Real company-side loop, captured read facts, file-only search receipts. */
import { config } from 'dotenv';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import Module from 'node:module';
import { scheduledRecommendationOptions } from '../src/lib/org/agent/scheduledSelection';
import { stringifyLlmDateTimes } from '../src/lib/llm/promptDateTime';

async function main() {
  process.umask(0o077);
  // This CLI is already server-side. Keep the live provider/network boundary below;
  // the unit-test preload deliberately replaces credentials and cannot run this CLI.
  const nodeModule = Module as typeof Module & { _load: (name: string, parent: unknown, isMain: boolean) => unknown };
  const load = nodeModule._load;
  nodeModule._load = function (name, parent, isMain) {
    return name === 'server-only' ? {} : load.call(this, name, parent, isMain);
  };
  config({path:'.env.local',quiet:true});
  const option=(name:string)=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
  const capturePath=path.resolve(option('capture')!);
  const output=path.resolve(option('output')!);
  const root=path.resolve('docs/evaluation/company-agentic-role-search/runs');
  if(!capturePath.startsWith(root+path.sep)||!output.startsWith(root+path.sep)) throw Error('Private run paths required');
  mkdirSync(output,{recursive:false,mode:0o700});
  const save=(name:string,value:unknown)=>writeFileSync(path.join(output,name),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});
  save('source-manifest.json',{files:Object.fromEntries([
    'src/lib/org/agent/scheduledMatching.ts','src/lib/org/agent/scheduledSelection.ts',
    'src/lib/org/agent/chat.ts','src/lib/org/agent/tools.ts','src/lib/org/agent/capabilities/registry.ts',
    'src/lib/org/agent/capabilities/policies.ts','scripts/evalScheduledMatching.ts',
  ].map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')]))});
  const capture=JSON.parse(readFileSync(capturePath,'utf8'));
  const selectionInput=option('selection-input') ? JSON.parse(readFileSync(option('selection-input')!,'utf8')) : undefined;
  const completed=option('results')?.split(',').map(file=>{const row=JSON.parse(readFileSync(file,'utf8'));const request=path.join(path.dirname(file),'request.json');return {...row,options:row.options??(existsSync(request)?JSON.parse(readFileSync(request,'utf8')):undefined)};})??[];
  const network:Array<Record<string,unknown>>=[];
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    const provider=['api.openai.com','api.anthropic.com','openrouter.ai','generativelanguage.googleapis.com'].includes(url.hostname);
    // Existing last-mile candidate-email privacy lookup may perform table reads.
    const privacyRead=url.hostname===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname&&method==='GET'&&url.pathname.startsWith('/rest/v1/')&&!url.pathname.includes('/rpc/');
    if(!provider&&!privacyRead) throw Error(`Read-only evaluation blocked ${method} ${url.origin}${url.pathname}`);
    network.push({host:url.hostname,path:url.pathname,method});
    const response=await originalFetch(input,init);
    if(provider&&typeof init?.body==='string') {
      const body=await response.clone().text();
      save(`provider-${network.length}.json`,{request:JSON.parse(init.body),status:response.status,response:body});
    }
    return response;
  };
  const {runScheduledMatchingLoop}=await import('../src/lib/org/agent/scheduledMatching');
  const {ORG_AGENT_SOL_MODEL}=await import('../src/lib/org/agent/modelConfig');
  const ctx=capture.context, role=capture.snapshot.roles[0];
  const roleData={roleId:ctx.roleId,name:role.name,status:'active',sourceType:'internal',request:role.request,
    criteria:role.criteria,description:role.description,matchingSlotType:role.matching_slot_type};
  const context:any={workspace:{workspaceId:ctx.workspaceId,companyName:capture.snapshot.company_name},
    companyText:stringifyLlmDateTimes({name:capture.snapshot.company_name,description:capture.snapshot.description}),
    roles:[roleData],rolesText:stringifyLlmDateTimes(roleData),completeRoleRequestIds:[ctx.roleId],
    contextNotesText:stringifyLlmDateTimes({companyMemory:ctx.companyMemory,inventory:capture.inventory}),
    conversationText:'-',conversationMessages:capture.messages.map((message:any)=>({id:message.id,role:message.role,
      content:message.content,createdAt:message.created_at,source:message.message_type})),
    conversationHistoryInfo:{hasMore:capture.messages.length===30,threadId:null,returnedItems:capture.messages.length},
    summariesText:'-',recentContactsText:'Details not captured; do not infer none.',
    recentRecommendationsText:stringifyLlmDateTimes({companyReady:capture.inventory.readyCompanyWide,pending:capture.inventory.pendingForRole}),
    recentToolContextText:'-',inProgressRoleCreationsText:'-',pendingUpdateText:'-',defaultLongTextObservations:[]};
  const rehearsalInventory={...capture.inventory,
    ...(capture.scheduleSimulation ? {scheduleSimulation:capture.scheduleSimulation,observedAt:capture.observedAt} : {}),
    executionEnvironment:'Isolated in-memory rehearsal authorized by the operator. All effects are applied only to this rehearsal state; production writes and sends are blocked. Do not repeat completed rehearsal effects just to perform them in production.',
    acceptedUnintroduced:Math.max(0,capture.inventory.acceptedUnintroduced-completed.reduce((sum:number,row:any)=>sum+(row.counts?.connect??0)+(row.counts?.reject??0),0)),
    pendingForRole:capture.inventory.pendingForRole+completed.reduce((sum:number,row:any)=>sum+(row.acceptedIntroductions??0),0),
    readyCompanyWide:capture.inventory.readyCompanyWide+completed.reduce((sum:number,row:any)=>sum+(row.newCompanyRecommendations??0),0)};
  const rehearsalResults=completed.map((row:any,index:number)=>({roleId:row.roleId,counts:row.counts,
    roleSearch:{counts:{...row.coverage,...row.usage}},options:row.options,
    status:'completed_in_rehearsal',runId:`rehearsal-result-${index+1}`,
    effects:'Completed in isolated rehearsal state. Selected introductions/recommendations are reserved here; do not repeat them. Production DB writes and external sends remain blocked.',
    introductionDraftsPrepared:row.slackDrafts,productionDeliveryConfirmed:false}));
  context.recentRecommendationsText=stringifyLlmDateTimes({companyReady:rehearsalInventory.readyCompanyWide,pending:rehearsalInventory.pendingForRole});
  context.contextNotesText=stringifyLlmDateTimes({companyMemory:ctx.companyMemory,inventory:rehearsalInventory});
  const requests:Array<Record<string,unknown>>=[];
  const reads:Array<Record<string,unknown>>=[];
  const started=performance.now();
  const result=await runScheduledMatchingLoop({actorId:capture.actor.company_user_id,actorLabel:'Harper scheduled matching service',
    admin:new Proxy({}, {get(){throw Error('Uncaptured database operation blocked');}}) as any,
    context,conversation:capture.conversation,currentUserMessageId:-1,mentions:[],model:ORG_AGENT_SOL_MODEL,
    responseLocale:'auto',readAudience:'company_safe',scopeKey:`scheduled:${ctx.roleId}`,
    source:'slack',slackThreadId:null,user:{id:capture.actor.company_user_id} as any,
    signal:AbortSignal.timeout(240000)},
    {roleId:ctx.roleId,scheduledSlot:capture.snapshot.scheduled_slot,rootJobId:path.dirname(capturePath),
      inventory:rehearsalInventory,currentRoutes:capture.currentRoutes,completedRuns:rehearsalResults,selectionInput},
    {requestTime:new Date(capture.observedAt??capture.snapshot.route_evaluated_at),executeTool:async(args:any)=>{
      const input=args.input;
      if(args.name==='recommend_talents') {
        if(!selectionInput) throw Error('No selection input in this frozen run');
        const request=scheduledRecommendationOptions(input,selectionInput,'frozen-source');
        save(`request-${requests.length+1}.json`,request); requests.push(request);
        return {status:'queued_in_rehearsal',complete:false,deliveryConfirmed:false};
      }
      if(args.name==='request_matching_search') {
        if(input.roleId!==ctx.roleId) throw Error('Role outside scheduled authority');
        const id=randomUUID();
        const request={...input,requestId:id};
        save(`request-${requests.length+1}.json`,request); requests.push(request);
        return {status:'queued',runId:id,options:input,complete:false,deliveryConfirmed:false,
          resultRead:{kind:'matching_runs',runId:id},executionBoundary:'file-only preview; no database or delivery effects'};
      }
      reads.push({name:args.name,input});
      if(args.name==='read_role') return {role:roleData,memory:ctx.companyMemory,pipeline:rehearsalInventory,fieldCompleteness:{complete:true}};
      if(args.name==='read_conversation_history') return {messages:context.conversationMessages,hasMore:context.conversationHistoryInfo.hasMore};
      if(args.name==='get_more_data') return {inventory:rehearsalInventory,companyMemory:ctx.companyMemory,
        completedRuns:rehearsalResults,queuedRequests:requests.map(row=>({runId:row.requestId,status:'queued',options:row})),
        evaluationCompatibility:'Current input fingerprint must be checked by Worker. Unknown is not zero.',
        capturedGroups:['matching inventory','company Memory','recent conversation'],
        missingGroups:(input.kinds??[]).filter((kind:string)=>!['matching_runs','company_memory','company_details'].includes(kind))};
      return {status:'not_available_in_capture',name:args.name,reason:'This frozen read-only capture does not include this detailed read. This is not an empty result.'};
    }});
  save('result.json',{reply:result.reply,usage:result.usage,model:result.model,requests,reads,
    elapsedMs:Math.round(performance.now()-started),databaseWrites:0,delivered:0});
  save('transcript.json',result.toolTranscript);
  save('network.json',network);
  console.log(JSON.stringify({company:capture.snapshot.company_name,requests:requests.length,
    elapsedMs:Math.round(performance.now()-started),reply:result.reply}));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
