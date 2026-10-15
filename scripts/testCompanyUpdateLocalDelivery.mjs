// Local transport regression: execute production modules; no network or real accounts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(path, dependencies) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, console,
    require(name) { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; },
  });
  return module.exports;
}
const jobs = [
  { id: 'event', action_name: 'company_update', status: 'failed', last_error: 'company_update_runtime_required' },
  { id: 'no-owner', action_name: 'company_update', status: 'failed', last_error: 'company_update_owner_missing' },
  { id: 'done', action_name: 'company_update', status: 'completed_message', last_error: null },
];
const messages = [
  { id: 1, role_id:'role', company_workspace_id: 'workspace', content: 'Synthetic authored company message', metadata: { webActionJobId: 'event' } },
  { id: 2, company_workspace_id: 'other', content: 'Other workspace', metadata: { webActionJobId: 'event' } },
  { id: 3, company_workspace_id: 'workspace', content: 'Other event', metadata: { webActionJobId: 'other-event' } },
];
let rpcId = 'event';
const admin = {
  async rpc(name) { assert.equal(name, 'enqueue_company_update_v1'); return { data: rpcId, error: null }; },
  from(table) {
    const rows = ({ company_agent_web_action_jobs: jobs, company_messages: messages,
      company_conversations: [{id:'role-conversation',company_workspace_id:'workspace',role_id:'role',metadata:{}}] })[table];
    assert.ok(rows, table);
    const filters = []; let update;
    const query = {
      select() { return query; },
      eq(key, val) { filters.push(row => row[key] === val); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      contains(key, values) { filters.push(row => Object.entries(values).every(([k,v]) => row[key]?.[k] === v)); return query; },
      order() { return query; }, limit() { return query; },
      update(value) { update = value; return query; },
      async maybeSingle() { const selected=rows.filter(row=>filters.every(fn=>fn(row)));return {data:selected[0]??null,error:null}; },
      async single() { const selected=rows.filter(row=>filters.every(fn=>fn(row)));return {data:selected[0],error:null}; },
      then(resolve, reject) {
        const selected = rows.filter(row => filters.every(fn => fn(row)));
        if (update) selected.forEach(row => Object.assign(row, update));
        return Promise.resolve({ data: selected.map(row => structuredClone(row)), error: null }).then(resolve, reject);
      },
    }; return query;
  },
};
const dispatched = [];
const updates = load('../src/lib/org/agent/companyUpdate.server.ts', {
  'server-only': {}, '@/lib/server/candidateAccess': { getSupabaseAdmin: () => admin },
  './webActionTurn': { dispatchOrgAgentWebActionJob: async ({jobId}) => { dispatched.push(jobId); } },
  './companyUpdate': {}, '../workspaceLocale.server': {},
  '../slackHarper': {}, '../onboarding': {}, './modelConfig': {},
});
await updates.enqueueCompanyUpdate({ workspaceId: 'workspace', roleId: 'role', eventKey: 'decline', purpose: 'Notify decision', facts: {} });
assert.equal(jobs[0].status, 'queued');
assert.equal(jobs[0].queue_dispatch_status, 'pending');
assert.deepEqual(dispatched, ['event']);
jobs[0].status = 'failed'; jobs[0].last_error = 'company_update_runtime_required';
await updates.releasePendingCompanyUpdates();
assert.equal(jobs[0].status, 'queued', 'committed event recovered if caller failed before enqueue');
assert.equal(jobs[1].status, 'failed', 'missing owner must not become a runnable job');
rpcId = 'done'; await updates.enqueueCompanyUpdate({});
assert.equal(jobs[2].status, 'completed_message', 'duplicate enqueue cannot reset completed event');
let fail = true; const sent = [];
const delivery = load('../src/lib/org/agent/contactEvent.server.ts', {
  'server-only': {}, '@/lib/server/candidateAccess': { getSupabaseAdmin: () => admin },
  '@/lib/org/slackHarper': {
    async sendHarperWorkspaceSlackMessage(args) { sent.push(args); if (fail) throw Error('Synthetic transport failure'); return true; },
    async sendHarperSlackThreadReply() { throw Error('Unexpected thread destination'); },
  },
  '@/lib/org/slackOrgLinkTargets.server': { loadSlackOrgLinkTargets: async () => ({}) },
  '@/lib/org/slackTalentLinks': { renderSlackOrgLinks: ({message}) => message },
  '@/lib/org/slackMessages': { convertMarkdownLinksToSlackMrkdwn: text => text, getOrgPublicSiteUrl: () => 'https://example.invalid' },
  '../slackTalentReviewView': { markdownToSlackMrkdwn: text => text },
  './store': {},
});
const invalidArgs = { jobId: 'event', messageIds: [1,2,3,null], roleId: 'role', slackThreadId: null, workspaceId: 'workspace' };
await assert.rejects(delivery.deliverCompanyContactEventMessages(invalidArgs),/missing or belongs/);
assert.equal(sent.length,0,'foreign/missing presentations never count as a completed send');
await assert.rejects(delivery.deliverCompanyContactEventMessages({...invalidArgs,messageIds:[],pendingRelayId:'relay'}),/no persisted/);
const args = { ...invalidArgs, messageIds:[1] };
await assert.rejects(delivery.deliverCompanyContactEventMessages(args), /Synthetic transport failure/);
assert.equal(messages[0].metadata.contactEventSlackDelivered, undefined);
fail = false;
await delivery.deliverCompanyContactEventMessages(args);
assert.equal(messages[0].metadata.contactEventSlackDelivered, true);
assert.equal(sent.length, 2);
assert.equal(sent[0].idempotencyKey, sent[1].idempotencyKey);
assert.equal(sent[1].text, messages[0].content, 'retry reuses persisted LLM prose');
await delivery.deliverCompanyContactEventMessages(args);
assert.equal(sent.length, 2, 'completed delivery skipped');
assert.equal(messages[1].metadata.contactEventSlackDelivered, undefined);
assert.equal(messages[2].metadata.contactEventSlackDelivered, undefined);
console.log('PASS: local enqueue/recovery/completed-event preservation; Slack failure/retry/same prose/idempotency/workspace+event isolation');
assert.equal(sent[1].requireAllDeliveries, true);
assert.equal(sent[1].enforceAudiencePermission,true);
// Execute the actual multi-channel sender body with isolated external dependencies.
const senderSource = readFileSync(new URL('../src/lib/org/slackHarper.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('slackHarper.ts', senderSource, ts.ScriptTarget.Latest, true);
const senderNode = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'sendHarperWorkspaceSlackMessage');
assert.ok(senderNode);
const senderModule = { exports: {} };
let channelFailure = true;
const attempts = [];
const channelAdmin = { from(table) {
  const query = {
    select() { return query; }, eq() { return query; }, upsert() { return query; },
    single: async () => ({ data: {id:'thread'}, error:null }),
    then(resolve, reject) { return Promise.resolve({ data: table === 'company_slack_channels' ? [{id:'one',slack_channel_id:'one'},{id:'two',slack_channel_id:'two'}] : [], error:null }).then(resolve,reject); },
  }; return query;
} };
vm.runInNewContext(ts.transpileModule(senderNode.getText(ast), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module: senderModule, exports: senderModule.exports,
  text: value => String(value ?? '').trim(),
  installation: async () => ({company_workspace_id:'workspace',slack_team_id:'team',bot_token_ciphertext:'fake'}),
  getSupabaseAdmin: () => channelAdmin,
  isHarperSlackAudienceAllowed: async () => true,
  decryptHarperSlackToken: () => 'fake',
  buildHarperSlackClientMessageId: (key, channel) => `${key}:${channel}`,
  postHarperSlackMessage: async args => { attempts.push(args); if (channelFailure && args.channelId === 'two') throw Error('Channel two failed'); return {ts:'123'}; },
});
const sender = senderModule.exports.sendHarperWorkspaceSlackMessage;
const senderArgs = { workspaceId:'workspace',roleId:'role',text:'authored prose',idempotencyKey:'event:1',recordConversationMessage:false,requireAllDeliveries:true };
await assert.rejects(sender(senderArgs), /Channel two failed/);
channelFailure = false;
assert.equal(await sender(senderArgs), true);
assert.equal(attempts[0].clientMessageId, attempts[2].clientMessageId);
assert.equal(attempts[1].clientMessageId, attempts[3].clientMessageId);
console.log('PASS: partial multi-channel failure retries with stable per-channel delivery identifiers');
// Use the actual sender inside the actual durable delivery adapter. Channel
// one's acknowledged post must be skipped after channel two fails.
const durableDelivery=load('../src/lib/org/agent/contactEvent.server.ts',{
  'server-only':{},'@/lib/server/candidateAccess':{getSupabaseAdmin:()=>admin},
  '@/lib/org/slackHarper':{sendHarperWorkspaceSlackMessage:sender},
  '@/lib/org/slackOrgLinkTargets.server':{loadSlackOrgLinkTargets:async()=>({})},
  '@/lib/org/slackTalentLinks':{renderSlackOrgLinks:({message})=>message},
  '@/lib/org/slackMessages':{getOrgPublicSiteUrl:()=> 'https://example.invalid'},
  '../slackTalentReviewView':{markdownToSlackMrkdwn:text=>text},'./store':{
    insertOrgAgentMessage:async args=>{
      const message={id:100+messages.length,company_workspace_id:args.conversation.company_workspace_id,
        conversation_id:args.conversation.id,role_id:args.roleId,content:args.content,metadata:args.metadata};
      messages.push(message);return message;
    },
  },
});
messages[0].role_id=null;
messages[0].metadata={webActionJobId:'event',agentTurn:{phase:'terminal',runId:'event'}};channelFailure=true;attempts.length=0;
await assert.rejects(durableDelivery.deliverCompanyContactEventMessages(args),/Channel two failed/);
assert.equal(messages[0].metadata.contactEventSlackPosts.one.slackMessageTs,'123');
channelFailure=false;await durableDelivery.deliverCompanyContactEventMessages(args);
assert.equal(attempts.filter(a=>a.channelId==='one').length,1);
assert.equal(attempts.filter(a=>a.channelId==='two').length,2);
assert.equal(messages[0].metadata.contactEventSlackDelivered,true);
await durableDelivery.deliverCompanyContactEventMessages(args);
assert.equal(attempts.length,3,'completed replay causes no additional physical posts');
const mirrors=messages.filter(message=>message.metadata.companyEventSourceMessageId===1);
assert.equal(mirrors.length,1,'Role log receives the workspace response once across retries');
assert.equal(mirrors[0].content,messages[0].content);
assert.equal(mirrors[0].metadata.agentTurn,undefined,'Role copy does not collide with the original terminal phase');
assert.equal(mirrors[0].conversation_id,'role-conversation');
await assert.rejects(sender({...senderArgs,onPosted:async()=>{throw Error('Receipt persistence failed');}}),/Receipt persistence failed/);
console.log('PASS: acknowledged channels are persisted and skipped; async receipt failures are retried; incomplete/foreign presentations cannot be finalized');

// Native Slack sync may run between the external post and receipt persistence.
// Later sync must enrich that existing row instead of leaving a duplicate in UI.
const syncNode=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='syncHarperSlackThreadContext');
assert.ok(syncNode);
let receiptAvailable=false;
const syncRows=[{id:1,company_workspace_id:'workspace',conversation_id:'private-conversation',metadata:{}},
  {id:100,conversation_id:'role-conversation',metadata:{companyEventSourceMessageId:1}}];
const syncAdmin={from(){
  const filters=[];let update,insert;
  const q={select(){return q;},eq(key,val){filters.push(row=>row[key]===val);return q;},
    in(key,values){filters.push(row=>values.includes(String(key.startsWith('metadata->>')?row.metadata[key.slice(11)]:row[key])));return q;},
    contains(_key,value){filters.push(row=>Object.entries(value).every(([key,values])=>Array.isArray(values)?values.every(v=>row.metadata[key]?.includes(v)):row.metadata[key]===values));return q;},
    update(value){update=value;return q;},insert(values){insert=values;return q;},
    then(resolve,reject){
      if(receiptAvailable)syncRows[0].metadata={contactEventSlackThreadIds:['thread'],contactEventSlackPosts:{one:{threadId:'thread',channelId:'one',slackMessageTs:'123'}}};
      const selected=syncRows.filter(row=>filters.every(fn=>fn(row)));
      if(update)selected.forEach(row=>Object.assign(row,update));
      if(insert)syncRows.push(...insert.map((row,i)=>({...row,id:200+syncRows.length+i})));
      return Promise.resolve({data:selected.map(row=>structuredClone(row)),error:null}).then(resolve,reject);
    }};return q;
}};
const syncModule={exports:{}};
vm.runInNewContext(ts.transpileModule(syncNode.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  module:syncModule,exports:syncModule.exports,
  getSupabaseAdmin:()=>syncAdmin,ensureSlackConversation:async()=>({id:'role-conversation'}),text:value=>String(value??'').trim(),
  slackApi:async()=>({messages:[{ts:'123',user:'bot',text:'original delivered prose'},{ts:'124',user:'human',text:'other message'},{ts:'125',user:'bot',text:'unrelated bot post'}]}),
  selectPendingHarperSlackFiles:()=>[],resolveHarperSlackUserNames:async()=>new Map([['bot','Harper']]),metadataRecord:value=>value??{},
  buildHarperSlackFileFallbackPrompt:value=>value,stripSlackSentUsingAttribution:value=>value,slackMessageDate:()=> 'synthetic-time',
});
const syncArgs={workspaceId:'workspace',roleId:'role',threadId:'thread',channelId:'one',threadTs:'root',currentMessageTs:'124',botUserId:'bot',token:'synthetic-token'};
await syncModule.exports.syncHarperSlackThreadContext(syncArgs);
const physical=syncRows.find(row=>row.slack_message_ts==='123');
assert.equal(physical.metadata.companyEventUiDuplicateOf,undefined);
receiptAvailable=true;
await syncModule.exports.syncHarperSlackThreadContext(syncArgs);
assert.equal(physical.metadata.companyEventUiDuplicateOf,100,'exact acknowledged post links to its Role UI artifact after the receipt becomes available');
assert.equal(syncRows.filter(row=>row.slack_message_ts==='123').length,1);
assert.equal(syncRows.find(row=>row.slack_message_ts==='125').metadata.companyEventUiDuplicateOf,undefined,'unrelated bot replies stay visible');
console.log('PASS: private-to-Role exact message mirroring and receipt-based native Slack/UI deduplication, including delayed receipts');

const contactSource=readFileSync(new URL('../src/lib/org/agent/contactEvent.server.ts',import.meta.url),'utf8');
const contactAst=ts.createSourceFile('contactEvent.server.ts',contactSource,ts.ScriptTarget.Latest,true);
const authorizedRelayFn=contactAst.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isAuthorizedCompanyRelay');
const relayContext=vm.createContext({});vm.runInContext(ts.transpileModule(authorizedRelayFn.getText(contactAst),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,relayContext);
for(const status of ['queued','processing','failed'])assert.equal(relayContext.isAuthorizedCompanyRelay({deliveries:[{type:'company_contact_company_delivery',status}]}),true);
assert.equal(relayContext.isAuthorizedCompanyRelay({deliveries:[{type:'company_contact_company_delivery',status:'sent',sent_at:'receipt'}]}),true);
for(const status of ['cancelled','sent'])assert.equal(relayContext.isAuthorizedCompanyRelay({deliveries:[{type:'company_contact_company_delivery',status}]}),false);
assert.equal(relayContext.isAuthorizedCompanyRelay({deliveries:[{type:'other',status:'queued'}]}),false);
console.log('PASS: related candidate history excludes cancelled, unscheduled and unacknowledged contacts');
