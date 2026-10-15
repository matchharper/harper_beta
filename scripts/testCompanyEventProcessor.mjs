// Execute the production processor and event turn with isolated adapters.
// No LLM provider, DB, Slack or email traffic is permitted by this harness.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = (file, dependencies, globals = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(compile(readFileSync(new URL(file, import.meta.url), 'utf8')), { module, exports: module.exports, console, Error, ...globals,
    require(name) { assert.ok(name in dependencies, `Unexpected external dependency: ${name}`); return dependencies[name]; },
  });
  return module.exports;
};
let job, permissionFailure, roleFailure, revokeAfterTurn, deliveryFailure, turns = 0, deliveries = 0;
const admin = {
  auth: { admin: { getUserById: async () => ({ data: { user: { id: 'actor', email: 'actor@example.invalid' } }, error: null }) } },
  async rpc(name) {
    assert.equal(name, 'claim_company_agent_web_action_v1');
    if (!job || !['queued','retry'].includes(job.status)) return { data: [], error: null };
    job.status = 'processing'; job.attempt_count++;
    return { data: [{ ...job }], error: null };
  },
  from(table) {
    let update;
    const q = { select() { return q; }, eq() { return q; }, update(v) { update = v; return q; },
      single: async () => ({ data: { id: 'conversation', company_workspace_id: 'workspace', role_id: 'role' }, error: null }),
      maybeSingle: async () => ({ data: table === 'company_users' ? { locale: 'en' } : job, error: null }),
      then(resolve, reject) { if (update) Object.assign(job, update); return Promise.resolve({ data: null, error: null }).then(resolve, reject); },
    }; return q;
  },
};
class Superseded extends Error {}
const processor = load('../src/lib/org/agent/webActionProcessor.server.ts', {
  'server-only': {}, '@/lib/server/candidateAccess': { getSupabaseAdmin: () => admin },
  './webActionTurn': { markOrgAgentWebActionQueueDispatched: async () => {} },
  './webActionQueue': { parseCompanyAgentWebActionQueueMessage: raw => raw?.jobId ? raw : null },
  '../workspaceLocale.server': { getOrgWorkspaceLocale: async () => 'ko' },
  '@/lib/org/server': { assertOrgWorkspacePermission: async () => { if (permissionFailure) throw Error('Permission denied'); }, assertOrgRoleAccess: async () => { if (roleFailure) throw Error('Role permission denied'); } },
  './chat': { OrgAgentWebActionSupersededError: Superseded, runOrgAgentWebActionTurn: async args => { turns++; if(revokeAfterTurn)roleFailure=true; assert.equal(args.responseLocale, job.action_name === 'company_update' ? 'ko' : 'en'); return { outcome: 'completed_message', progressMessageId: null, terminalMessageId: 42 }; } },
  './contactEvent.server': { deliverCompanyContactEventMessages: async args => { deliveries++; assert.equal(args.pendingRelayId, job.action_context.contactPendingDelivery ? 'relay' : undefined); if (deliveryFailure) throw Error('Transport failed'); } },
});
const reset = (actionName='company_update') => { job = { id: 'job', status: 'queued', action_name: actionName, company_workspace_id: 'workspace', conversation_id: 'conversation', actor_user_id: 'actor', role_id: 'role', anchor_message_id: 10, attempt_count: 0, action_context: {} }; };
const process = () => processor.processCompanyAgentWebActionJob({ jobId: 'job' }, { messageId: 'local' });
reset(); deliveryFailure = true;
await assert.rejects(process(), processor.WebActionQueueRetryError);
assert.equal(job.status, 'retry'); assert.equal(job.terminal_message_id, undefined);
deliveryFailure = false; await process();
assert.equal(job.status, 'completed_message'); assert.equal(job.terminal_message_id, 42);
const beforeReplay = turns; await process(); assert.equal(turns, beforeReplay);
reset('candidate_contact_received'); job.action_context = { contactPendingDelivery: true, relayId: 'relay', relatedRoleId: 'role' };
await process(); assert.equal(job.status, 'completed_message');
reset('move_candidate_stage'); const beforeAction = deliveries; await process(); assert.equal(deliveries, beforeAction + 1, 'ordinary action follow-up reaches the shared delivery path');
reset(); permissionFailure = true; const beforeDenied = turns;
await assert.rejects(process(), /Permission denied/); assert.equal(turns, beforeDenied); permissionFailure = false;
reset(); job.status = 'processing'; await assert.rejects(process(), processor.WebActionQueueRetryError); assert.equal(turns, beforeDenied);
reset(); job.attempt_count = 4; deliveryFailure = true;
await assert.rejects(process(), processor.WebActionQueuePermanentError); assert.equal(job.status, 'failed'); deliveryFailure = false;
job = null; await assert.rejects(process(), processor.WebActionQueuePermanentError);
reset(); roleFailure=true; const beforeRoleDenied=turns;
await assert.rejects(process(),/Role permission denied/);assert.equal(turns,beforeRoleDenied);roleFailure=false;
reset(); revokeAfterTurn=true; const beforeRevokedDelivery=deliveries;
await assert.rejects(process(),/Role permission denied/);assert.equal(deliveries,beforeRevokedDelivery);revokeAfterTurn=false;roleFailure=false;
console.log('PASS: shared processor completion after delivery, retry/exhaustion, replay, permission, busy lease, original actor locale and inline contact ownership');

// Run the actual event-turn function. Stub only storage/context/model boundaries.
const chatSource = readFileSync(new URL('../src/lib/org/agent/chat.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('chat.ts', chatSource, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'runOrgAgentWebActionTurn');
assert.ok(fn);
let existing = [], reply = '', generated = 0, stored = [], pendingContact = null;
const turnAdmin = { from() { const q = { select() { return q; }, eq() { return q; }, contains() { return q; }, order() { return q; }, single:async()=>({data:{id:'role-conversation',company_workspace_id:'workspace',role_id:'role'},error:null}),then(resolve,reject) { return Promise.resolve({ data: existing, error: null }).then(resolve,reject); } }; return q; } };
const turnModule = { exports: {} };
vm.runInNewContext(compile(fn.getText(ast)), { module: turnModule, exports: turnModule.exports,
  getSupabaseAdmin: () => turnAdmin, resolveOrgAgentModel: () => ({ model: 'synthetic/model' }), toOrgAgentMessage: x => x,
  companyConversationReadAdmin:async({admin})=>admin,
  buildOrgAgentPromptContext: async args => { assert.equal(args.includeSharedConversation,true); assert.equal(args.conversation.id,'role-conversation','private source conversation is not injected into shared Role context'); return {}; }, loadCompanyContactEventContext: async () => pendingContact,
  buildCompanyUpdatePrompt: () => 'event', buildCompanyContactEventPrompt: () => 'authorized source',
  runOrgAgentToolLoop: async args => { generated++; assert.equal(args.readAudience,'company_safe'); assert.equal(args.onVisibleProgress,undefined); return { reply, state: {}, model: 'synthetic/model' }; },
  getOrgAgentRequiredPresentationTexts: () => [], buildAssistantMetadata: () => ({}),
  appendRequiredPresentations: ({reply,requiredTexts}) => [reply,...requiredTexts].filter(Boolean).join('\n\n'),
  insertOrgAgentMessage: async args => { stored.push(args); return { id: stored.length }; },
  scheduleOrgAgentSummary: () => {}, isOrgAgentModelId: () => true, DEFAULT_ORG_AGENT_MODEL: 'synthetic/model',
});
const runTurn = (actionName, actionContext={}) => turnModule.exports.runOrgAgentWebActionTurn({ actionName, actionContext, jobId:'job', roleId:'role', user:{id:'actor'}, anchorMessageId:10, conversation:{id:'conversation',company_workspace_id:'workspace'}, actorLabel:'팀원 A' });
await assert.rejects(runTurn('company_update',{ facts: {} }), /requires a message/); assert.equal(stored.length,0,'undelivered event cannot fabricate a success fallback');
assert.equal((await runTurn('company_update',{ facts: { companyMessageAlreadyDelivered:true } })).outcome,'completed_silent');
pendingContact = { deliveryCompleted:false, originalDeliveryBody:'조건을 먼저 확인해 주세요.\n\n[이력서](https://example.invalid/document)' };
await runTurn('candidate_contact_received',{ relayId:'relay',contactPendingDelivery:true });
assert.equal(stored[0].content,'> 조건을 먼저 확인해 주세요.\n> \n> [이력서](https://example.invalid/document)','authorized original and attachment link preserved even when surrounding model reply is empty');
existing = [{id:91,metadata:{agentTurn:{phase:'terminal'}}}]; const generatedBeforeReplay = generated;
assert.equal((await runTurn('candidate_contact_received')).terminalMessageId,91); assert.equal(generated,generatedBeforeReplay,'persisted prose reused without calling model again');
existing=[]; await runTurn('candidate_contact_received',{slackThreadId:'original-thread'});
assert.equal(stored.at(-1).messageType,'slack'); assert.equal(stored.at(-1).slackThreadId,'original-thread','native Slack turn remains visible in the original thread history');
reply='An authored update';
await runTurn('company_update',{facts:{preservedPresentation:{text:'Exact immutable original',metadata:{webActionJobId:'forged-job',agentTurn:{phase:'progress',runId:'forged-run'}}}}});
assert.equal(stored.at(-1).conversation.id,'conversation','original private destination is preserved independently of shared read context');
assert.equal(stored.at(-1).metadata.webActionJobId,'job');
assert.equal(stored.at(-1).metadata.agentTurn.phase,'terminal');
assert.equal(stored.at(-1).metadata.agentTurn.runId,'job','presentation metadata cannot replace the processor identity');
console.log('PASS: actual event turn mandatory undelivered notice/no fallback, optional silence, original correspondence+attachment preservation, persisted terminal reuse and company-safe tools');

const storeSource = readFileSync(new URL('../src/lib/org/agent/store.ts', import.meta.url), 'utf8');
const storeAst = ts.createSourceFile('store.ts', storeSource, ts.ScriptTarget.Latest, true);
const scopeFn = storeAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'applyPromptMessageScope');
const scopeContext = vm.createContext({});
vm.runInContext(compile(scopeFn.getText(storeAst)),scopeContext);
const queryCalls=[];
const scopeQuery={eq(...args){queryCalls.push(['eq',...args]);return this;},is(...args){queryCalls.push(['is',...args]);return this;},in(...args){queryCalls.push(['in',...args]);return this;}};
scopeContext.applyPromptMessageScope(scopeQuery,{kind:'conversation'});
assert.equal(JSON.stringify(queryCalls),JSON.stringify([['in','message_type',['chat','slack']],['is','metadata->companyEventUiDuplicateOf',null]]));
queryCalls.length=0; scopeContext.applyPromptMessageScope(scopeQuery,{kind:'slack',slackThreadId:'original-thread'});
assert.equal(JSON.stringify(queryCalls),JSON.stringify([['eq','message_type','slack'],['eq','slack_thread_id','original-thread']]));
console.log('PASS: event history includes shared Web+Slack messages; native thread history retains its exact thread boundary');

// Execute the actual publisher's exhaustion handling. A permanently failed
// transport cannot remain an earlier queued job blocking later work forever.
let dispatchJob={id:'dispatch-job',status:'queued',queue_dispatch_attempt_count:4};
const dispatchAdmin={from(){let update;const filters=[];const q={select(){return q;},eq(key,val){filters.push(row=>row[key]===val);return q;},
  in(key,values){filters.push(row=>values.includes(row[key]));return q;},update(value){update=value;return q;},
  maybeSingle:async()=>({data:{...dispatchJob},error:null}),then(resolve,reject){if(filters.every(fn=>fn(dispatchJob)))Object.assign(dispatchJob,update);return Promise.resolve({error:null}).then(resolve,reject);}};return q;}};
const dispatch=load('../src/lib/org/agent/webActionTurn.ts',{
  'server-only':{},'@/lib/org/agent/store':{},'@/lib/server/candidateAccess':{getSupabaseAdmin:()=>dispatchAdmin},
  '@/lib/org/agent/webActionQueue':{publishCompanyAgentWebActionJob:async()=>{throw Error('Synthetic queue transport failure');}},
},{console:{error(){}}});
assert.equal(await dispatch.dispatchOrgAgentWebActionJob({jobId:'dispatch-job'}),false);
assert.equal(dispatchJob.status,'failed');assert.equal(dispatchJob.queue_dispatch_status,'failed');
assert.equal(dispatchJob.queue_dispatch_attempt_count,5);
console.log('PASS: terminal queue-publish failure releases conversation ordering without a success fallback');

// The board opens its own service client, so its final projection must still
// enforce the shared reader's Team restriction before the model sees it.
const dataSource=readFileSync(new URL('../src/lib/org/agent/data.ts',import.meta.url),'utf8');
const dataAst=ts.createSourceFile('data.ts',dataSource,ts.ScriptTarget.Latest,true);
const boardFn=dataAst.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='fetchVisibleOrgAgentBoard');
const boardContext=vm.createContext({fetchOrgBoard:async()=>({items:[{roleId:'a'},{roleId:'b'}],stages:[{roleId:'a'},{roleId:'b'},{}]}),visibleOrgRoleIds:async()=>['a']});
vm.runInContext(compile(boardFn.getText(dataAst)),boardContext);
const board=await boardContext.fetchVisibleOrgAgentBoard({admin:{},user:{id:'owner'},workspaceId:'workspace',audience:'company_safe'});
assert.equal(JSON.stringify(board),JSON.stringify({items:[{roleId:'a'}],stages:[{roleId:'a'},{}]}));
console.log('PASS: fresh-client board data is restricted to the same shared audience before it reaches the model');
