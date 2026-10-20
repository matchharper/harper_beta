/** One fixed experiment: existing six-axis scoring vs summaries + four axes.
 * Commands: prepare, run, status. Raw artifacts stay in the ignored registry runs.
 * This transport deliberately saves complete receipts and never creates a DB client.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildDecisionRequest, parseDecisionBatch } from '../src/lib/externalRecommendationsV2/decisions';
import { buildScoringInput, v2PromptCandidate } from '../src/lib/externalRecommendationsV2/scoringInput';
import { rankScore } from '../src/lib/externalRecommendationsV2/contract';
import rubric from '../src/lib/externalRecommendationsV2/fitQuestions.v4.json';

const TASK = path.resolve('docs/evaluation/external-decisions-summary-ranking');
const FROZEN = path.join(TASK, 'private/frozen-v1');
const RUN = path.join(TASK, 'runs/20261020-summary-four-axis-v1');
const METRICS = ['candidateInterest', 'companyInterest', 'roleFit', 'constraintPass'] as const;
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const lines = (p: string): any[] => fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(v => JSON.parse(v));
const save = (p: string, v: unknown) => fs.writeFileSync(p, JSON.stringify(v, null, 2)+'\n', {mode:0o600, flag:'wx'});

export function fourAxisRank(fit: Record<string, number>) {
  const base = .60*fit.candidateInterest + .35*fit.roleFit + .05*fit.companyInterest;
  return fit.constraintPass <= 50 ? base*.2*(fit.constraintPass/50)**2 : base;
}

function treatmentRequest(input: string, roleIds: string[]) {
  const request = buildDecisionRequest('openai', input, roleIds) as any;
  const selected = Object.fromEntries(METRICS.map(k => [k, structuredClone(rubric.questions[k])]));
  // Remove references to the two removed assessments as well as their questions.
  selected.constraintPass.instructions = selected.constraintPass.instructions
    .replace('roleFit, companyInterest and mutualFit', 'roleFit and companyInterest')
    .replace('uncertainty, which belongs in evidence and the fit assessments.',
             'uncertainty, which belongs in the fit assessments.');
  const shared = Object.entries(selected).map(([metric, q]) => {
    const criteria = Array.isArray(q.criteria) ? q.criteria.map((text, i) => `${i}: ${text}`)
      : Object.entries(q.criteria).map(([value, text]) => `${value}: ${text}`);
    return `### Rubric ${metric}\n${q.instructions}\nCriteria:\n${criteria.join('\n')}`;
  }).join('\n\n');
  request.input[0].content = `## Shared evaluation instructions (apply to every question)\n${rubric.commonInstructions}\nApply each named rubric in full, including all qualifications and exceptions, only to the role_id bound by the question. Other roles are independent evidence, never comparison anchors.\n## Shared metric rubrics\n${shared}`;
  request.questions = request.questions.filter((q: any) => METRICS.some(k => q.name.endsWith('_'+k)));
  if (request.input[0].content.includes('mutualFit') || request.input[0].content.includes('Rubric evidence') ||
      request.questions.length !== roleIds.length*4) throw Error('Removed axes remain in treatment');
  return request;
}

function parse(request: any, raw: any, roleIds: string[], arm: string) {
  const expected = new Map(request.questions.map((q:any) => [q.name,q]));
  const answers = Array.isArray(raw?.answers) ? raw.answers : [];
  const found = new Map<string,any>();
  const errors: string[] = [];
  for (const a of answers) {
    if (found.has(a.name)) errors.push('duplicate answer '+a.name);
    if (!expected.has(a.name)) errors.push('unknown answer '+a.name);
    found.set(a.name,a);
  }
  if (found.size !== expected.size) errors.push('missing answers');
  for (const [name,q] of expected as Map<string,any>) {
    const a=found.get(name);
    if (!a || a.type!==q.type) { errors.push('type mismatch '+name); continue; }
    if (q.type==='predicate' && !(Number.isFinite(a.probability) && a.probability>=0 && a.probability<=1)) errors.push('invalid probability '+name);
    if (q.type==='score' && !(Number.isFinite(a.score) && a.score>=0 && a.score<=4)) errors.push('invalid score '+name);
    if (q.type==='choice' && !q.choices.some((x:any)=>x.value===a.choice)) errors.push('invalid choice '+name);
  }
  if (errors.length) return {errors, evaluations:[]};
  if (arm==='baseline') {
    const parsed=parseDecisionBatch('openai',raw,roleIds);
    return {errors:parsed.errors,evaluations:parsed.evaluations.map(e=>({...e,score:rankScore(e.fit)}))};
  }
  return {errors:[], evaluations:roleIds.map((roleId,i)=>{
    const fit=Object.fromEntries(METRICS.map(k=>{const a=found.get(`r${i}_${k}`);return[k,k==='roleFit'?a.score*25:a.probability*100];}));
    return {roleId,fit,score:fourAxisRank(fit)};
  })};
}

function sourceState() {
  const files=['scripts/evalExternalDecisionsSummary.ts','scripts/prepareExternalDecisionsSummary.py',
    'src/lib/externalRecommendationsV2/decisions.ts','src/lib/externalRecommendationsV2/scoringInput.ts',
    'src/lib/externalRecommendationsV2/workerInputText.ts','src/lib/externalRecommendationsV2/descriptionText.ts',
    'src/lib/externalRecommendationsV2/fitQuestions.v4.json','src/lib/externalRecommendationsV2/contract.ts',
    'src/lib/talentOnboarding/jobPostingRecommendations.ts'];
  return {revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    dirtyDiffSha256:sha(execFileSync('git',['diff','HEAD'])),
    files:Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]))};
}

function prepare() {
  if (fs.existsSync(RUN)) throw Error('Run already exists; do not overwrite it');
  const frozen=read(path.join(FROZEN,'manifest.json'));
  for(const [name,hash] of Object.entries(frozen.files)) if(sha(fs.readFileSync(path.join(FROZEN,name)))!==hash)throw Error('Frozen input changed');
  const cases=lines(path.join(FROZEN,'cases.jsonl'));
  const jobs:any[]=[];
  fs.mkdirSync(RUN,{recursive:true,mode:0o700});
  fs.mkdirSync(path.join(RUN,'receipts'),{mode:0o700});
  fs.mkdirSync(path.join(RUN,'sources'),{mode:0o700});
  const sources=sourceState();
  for(const f of Object.keys(sources.files)){
    const p=path.join(RUN,'sources',f);fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.copyFileSync(f,p);fs.chmodSync(p,0o600);
  }
  for(let repeat=1;repeat<=2;repeat++)for(const c of cases){
    for(let offset=0;offset<c.roles.length;offset+=10){
      const roles=c.roles.slice(offset,offset+10);
      const candidates=roles.map((r:any)=>v2PromptCandidate({...r.card,row:{description:r.card.roleDescription}} as any,c.locale));
      const changed=candidates.map((r:any,i:number)=>({...r,roleDescription:roles[i].summary_content??r.roleDescription}));
      const context={...c.user_context,evaluation_date:c.as_of};
      const ids=roles.map((r:any)=>r.card.roleId);
      const requests={baseline:buildDecisionRequest('openai',buildScoringInput(context,candidates),ids),
        treatment:treatmentRequest(buildScoringInput(context,changed),ids)};
      // Counterbalance time/order across cases and repeats, identical role order in both arms.
      const first=(parseInt(sha(c.run_id).slice(0,2),16)+repeat)%2===0;
      for(const arm of first?['baseline','treatment']:['treatment','baseline']){
        const request=requests[arm as keyof typeof requests];
        jobs.push({id:`${c.run_id}-b${offset/10}-${arm}-r${repeat}`,run_id:c.run_id,talent_id:c.talent_id,
          arm,repeat,batch:offset/10,brief_exact:c.brief_exact,locale:c.locale,
          roles:roles.map((r:any)=>({role_id:r.card.roleId,recommendation_id:r.recommendation_id,has_summary:!!r.summary_content})),
          request,requestSha256:sha(JSON.stringify(request))});
      }
    }
  }
  const text=jobs.map(j=>JSON.stringify(j)).join('\n')+'\n';
  fs.writeFileSync(path.join(RUN,'requests.jsonl'),text,{flag:'wx',mode:0o600});
  save(path.join(RUN,'manifest.json'),{task:'external-decisions-summary-ranking',runId:path.basename(RUN),
    createdAt:new Date().toISOString(),frozen,source:sources,requestsSha256:sha(text),calls:jobs.length,
    model:'gpt-6-luna',endpoint:'https://api.openai.com/v1/decisions',repeats:2,concurrency:6,
    sampling:'temperature/reasoning not supplied; endpoint defaults',timeoutMs:30000,maxAttempts:2,
    baseline:'Current working-tree buildScoringInput + buildDecisionRequest + rankScore; not a verified deployed revision',
    treatment:'Historical summary[locale].content when nonempty else raw JD; only candidateInterest/companyInterest/roleFit/constraintPass',
    formula:'base=0.60*candidateInterest+0.35*roleFit+0.05*companyInterest; constraintPass<=50 => base*0.2*(constraintPass/50)^2; otherwise base',
    privacy:'User authorized this evaluation on 2026-10-20. Direct OpenAI only. No DB access or writes. Account-level retention settings not changed or independently verified. Raw files are ignored and owner-only.',
    price:{usdPerMillionUncachedInput:0.10,output:0,source:'https://developers.openai.com/api/docs/guides/decisions#pricing-and-availability',verifiedAt:'2026-10-20',invoiceVerified:false},
    primaryMetric:'Like-over-dislike pair accuracy, ties/missing=0.5 per harper_eval; report missing separately. Average each arm over its two repeats.',
    analysis:'Paired talent-cluster bootstrap 10000, seed 20261015; A/A repeat deltas; Brief-exact and both-summaries slices; no tuning after results',
    interpretationGate:'Report cost saving; non-inferiority only if paired delta CI lower bound > -0.02 and no structural failures; no deployment decision or top-20 claim',
    limitations:['Shown-only cases contain at most 15 roles: cannot measure top-20 shortlist recall over full retrieval','Two requested changes and the new rank formula are evaluated together; no attribution to individual components','Historical restoration and feedback selection bias inherited from harper_eval']});
  console.log(JSON.stringify({run:RUN,calls:jobs.length,rolesPerArm:2023,repeats:2,requestsSha256:sha(text)}));
}

async function run() {
  const manifest=read(path.join(RUN,'manifest.json'));
  if(sha(fs.readFileSync(path.join(RUN,'requests.jsonl')))!==manifest.requestsSha256)throw Error('Requests changed');
  const current=sourceState();for(const [f,h] of Object.entries(manifest.source.files))if(current.files[f as keyof typeof current.files]!==h)throw Error('Source changed '+f);
  if(!process.env.OPENAI_API_KEY)throw Error('Missing OpenAI credential');
  const all=lines(path.join(RUN,'requests.jsonl'));
  const pending=all.filter(j=>!fs.existsSync(path.join(RUN,'receipts',j.id+'.json')));
  for(const j of pending)if(fs.existsSync(path.join(RUN,'receipts',j.id+'.started.json')))throw Error('Ambiguous interrupted call; inspect receipt before resending '+j.id);
  let completed=all.length-pending.length,index=0;const began=Date.now();
  console.log(JSON.stringify({event:'start',completed,total:all.length,pending:pending.length}));
  const worker=async()=>{
    while(index<pending.length){
      const j=pending[index++];const receiptPath=path.join(RUN,'receipts',j.id+'.json');
      save(path.join(RUN,'receipts',j.id+'.started.json'),{at:new Date().toISOString(),requestSha256:j.requestSha256});
      const attempts:any[]=[];const start=Date.now();let raw:any=null;
      for(let attempt=1;attempt<=2;attempt++){
        const ts=Date.now();
        try{
          const res=await fetch(manifest.endpoint,{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(j.request),signal:AbortSignal.timeout(30000)});
          const body=await res.text();let response:any;try{response=JSON.parse(body)}catch{response={nonJson:body}}
          attempts.push({attempt,httpStatus:res.status,requestId:res.headers.get('x-request-id'),startedAt:new Date(ts).toISOString(),elapsedMs:Date.now()-ts,response});
          if(res.ok){raw=response;break;}
          if(attempt===1 && (res.status===408||res.status===429||res.status>=500)){
            await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(250,Number(res.headers.get('retry-after')||.25)*1000))));continue;
          }break;
        }catch(e){
          attempts.push({attempt,startedAt:new Date(ts).toISOString(),elapsedMs:Date.now()-ts,error:e instanceof Error?e.name+': '+e.message:String(e),costUnknown:true});
          if(attempt===1)continue;
        }
      }
      const parsed=raw?parse(j.request,raw,j.roles.map((r:any)=>r.role_id),j.arm):{errors:['request failed'],evaluations:[]};
      save(receiptPath,{id:j.id,requestSha256:j.requestSha256,arm:j.arm,repeat:j.repeat,run_id:j.run_id,
        talent_id:j.talent_id,roles:j.roles,elapsedMs:Date.now()-start,finishedAt:new Date().toISOString(),
        attempts,usage:raw?.usage??null,resolvedModel:raw?.model??null,...parsed});
      completed++;if(completed%50===0||completed===all.length)console.log(JSON.stringify({event:'progress',completed,total:all.length,elapsedSeconds:Math.round((Date.now()-began)/1000)}));
    }
  };
  await Promise.all(Array.from({length:6},worker));
  status();
}

function status(){
  const jobs=lines(path.join(RUN,'requests.jsonl'));const totals:any={expected:jobs.length,complete:0,validCalls:0,validRoles:0,failedCalls:0,inputTokens:0};
  for(const j of jobs){const p=path.join(RUN,'receipts',j.id+'.json');if(!fs.existsSync(p))continue;const r=read(p);totals.complete++;totals.validRoles+=r.evaluations.length;totals[r.errors.length?'failedCalls':'validCalls']++;totals.inputTokens+=r.usage?.input_tokens??0;}
  console.log(JSON.stringify(totals));
}

process.umask(0o077);
const command=process.argv[2];
Promise.resolve().then(()=>command==='prepare'?prepare():command==='run'?run():command==='status'?status():Promise.reject(Error('Use prepare, run, or status'))).catch(e=>{console.error(e.message);process.exitCode=1;});
