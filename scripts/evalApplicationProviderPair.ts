/** Paired public-JD evaluation. Final application writes are never authorized. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {applicationStagehandRuntime as runtime} from '../src/lib/career/simulation/applicationStagehandRuntime';
import {createApplicationBrowserRuntime} from '../src/lib/career/simulation/applicationBrowserRuntime';
import {preflightCandidate} from './experiments/application-browser-lab/lib/preflight-cases.js';
import {documents} from './experiments/application-browser-lab/lib/fixture.js';
const base='docs/evaluation/application-browser-server';
const sha=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function unpack(value:any){return value?.testCompressed?JSON.parse(gunzipSync(Buffer.from(value.testCompressed,'base64')).toString()):value;}
const candidate={...preflightCandidate,school:'Stanford University',graduationMonth:'June',graduatedYear:2020,startDate:'2026-12-01',noticePeriod:'30 days',dateOfBirth:'1995-01-15',koreanPhone:'010-0000-0000',gender:'Prefer not to say',veteranStatus:'I am not a protected veteran',disabilityStatus:'I do not want to answer',race:'Decline to self-identify',koreanName:'하퍼테스트',address:'1 Synthetic Test Street',postalCode:'94105',gpaScale:'4.0',employmentStartYear:2020,employmentStartMonth:'July',employmentEnd:'Present',jobTitle:'Software Engineer',languages:'English, Korean',skills:'TypeScript, Python, React, Node.js, SQL',privacyConsent:true,marketingConsent:false};
const sources=['scripts/evalApplicationProviderPair.ts','scripts/experiments/application-browser-lab/lib/preSubmitTest.mjs','scripts/experiments/application-browser-lab/lib/preflight-guard.js','src/lib/career/simulation/applicationStagehandRuntime.ts',...['worker.mjs','form.mjs','files.mjs','gate.mjs','browserUseCloud.mjs','network.cjs','package-lock.json'].map(n=>'src/lib/career/simulation/applicationStagehand/'+n)];
async function sourceHashes(){return Object.fromEntries(await Promise.all(sources.map(async p=>[p,sha(await fs.readFile(p))])));}
async function main(){
 const [group,caseId,provider]=process.argv.slice(2);
 if(!group||!caseId||!['browser-use','browserbase'].includes(provider))throw Error('Usage: group case browser-use|browserbase');
 const frozen=JSON.parse(await fs.readFile(path.join(base,'runs',group,'manifest.json'),'utf8'));
 const cases=JSON.parse(await fs.readFile(base+'/'+(frozen.caseFile||'cases-public-pre-submit-v4.json'),'utf8'));
 Object.assign(candidate,frozen.candidateOverrides?.[caseId]||{});
 const selected=cases.cases[caseId];if(!selected)throw Error('Unknown frozen case');
 const runId=`${caseId}-${provider}-${randomUUID()}`,dir=path.join(base,'runs',group,runId),start=Date.now();
 await fs.mkdir(dir,{recursive:true,mode:0o700});
 const write=(name:string,data:any)=>fs.writeFile(path.join(dir,name),JSON.stringify(data,null,2),{mode:0o600});
 const log=(event:string,data:any={})=>console.log(JSON.stringify({case:caseId,provider,event,seconds:Math.round((Date.now()-start)/1000),...data}));
 const hashes=await sourceHashes();
 if(JSON.stringify(frozen.sourceHashes)!==JSON.stringify(hashes))throw Error('Evaluation source changed after freeze');
 const docs=Object.entries(documents).map(([id,d]:any)=>({documentId:id,name:d.name,mimeType:d.mimeType,contentHash:sha(d.buffer),path:`/workspace/attachments/${id}/${sha(d.buffer)}/${d.name}`,data:d.buffer.toString('base64')}));
 await write('manifest.json',{runId,group,datasetVersion:frozen.datasetVersion,url:selected.url,...selected,model:'gpt-6-luna',reasoning:'medium',maxSteps:100,proxy:false,captcha:false,viewport:[1280,960],browserTimeoutMinutes:30,callerDeadlineMinutes:27,browserProvider:provider,startedAt:new Date(start).toISOString(),sourceHashes:hashes,sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:true,candidate,files:docs.map(({data,path,...x}:any)=>x),execution:'remote Chromium + existing hosted worker; local trusted orchestrator; no deployment'});
 let ref:any,latest:any,readySeconds:number|undefined,result:any,lastLabel='',stopped=false;
 try{
  log('provisioning');
  ref=await runtime.create(docs,selected.url,{browserProvider:provider as any,preSubmitTest:{candidate}});
  readySeconds=(Date.now()-start)/1000;await write('resource.json',ref);log('ready');
  const instructions=`Evaluate only this exact public job: ${JSON.stringify(selected)}. This is a synthetic PRE-SUBMISSION test, NEVER a real application. Stay on this exact job; if closed or redirected to a job list, report it and stop rather than selecting another job.
First inspect and discover the application requirements: all required fields/questions, acceptable files, custom widgets, and any further steps. Then fill the application with the supplied synthetic facts, attach required files, and reach the final submission boundary. Inspect final fields/validation/attachment indicators and finish with report_pre_submit, recording the complete requirements discovered, evidence and any remaining blocker. A ready report must mean the current form has all required inputs/files except the final submission itself; do not equate merely opening the form with success.
Use inspectCurrentFields for observed refs and fillObservedFields to fill multiple confirmed ordinary text/native select/checkbox fields together. Use visual/DOM controls to select custom dropdown search results. Continue resolving school, year, city and other controls; an unfinished field is work to complete, not itself a blocker. You have 100 action steps. Use listAttachmentInputs and attachDocument with the supplied IDs, including native choosers when needed. Read upload indicators and inspectTestRestrictions if an upload stalls. Do not repeatedly perform a write the test guard has blocked. After attaching, check that the UI shows the file, not only the tool return. If no server upload happens until final submission, state clearly that only file selection was verified.
NEVER click the FINAL Submit/Apply/Send application button, press Enter to submit, create an account, request email/SMS verification, subscribe to alerts, contact an employer, or make a legal attestation that this fictional candidate is real. Public Apply links and non-final next/review steps are allowed. Optional demographic/marketing fields remain blank/declined. Necessary privacy processing consent may be selected for this synthetic evaluation, but legal truthfulness attestations must remain unchecked and be reported. No arbitrary script or direct API calls. All applicant-data network writes are blocked, only read operations and file-only transfers can pass. If a required next step needs a blocked draft write, report it as a test-harness limitation, not provider inability.
Synthetic facts: ${JSON.stringify(candidate)}. Available documents: ${JSON.stringify(docs.map(({documentId,name,mimeType}:any)=>({documentId,name,mimeType})))}. The documents are historical synthetic fixture files and may say Alex Example: the confirmed form name is HarperQA TestOnly; do not overwrite supplied form facts from resume parsing. Use the supplied synthetic answer for qualitative required answers, adapting only within these explicit fictional facts and identifying them as synthetic test data. If a truly missing required fact/file prevents completion, report it rather than inventing a real person. Finish using report_pre_submit, never report_application_outcome as submitted.`;
  await write('instruction.json',{instructions});
  await runtime.start(ref,instructions);
  while(Date.now()-start<27*60000){
   latest=unpack(await runtime.status(ref));await write('latest.json',latest);
   const label=`${latest.status}:${latest.steps}:${latest.required_actions?.[0]?.name}`;
   if(label!==lastLabel){log('progress',{status:latest.status,steps:latest.steps,action:latest.required_actions?.[0]?.name});lastLabel=label;}
   if(latest.pendingRequest)throw Error('Unexpected production approval gate in guarded test; no request approved');
   if(latest.report){result={completed:true,reported:latest.report};break;}
   const action=latest.required_actions?.[0];
   if(action?.name==='request_application_information'){
    await write(`question-${latest.steps}.json`,action.arguments);
    await runtime.respond(ref,action.call_id,{confirmedFacts:candidate,message:'All available synthetic facts/files are already supplied. If required data remains missing, finish with report_pre_submit ready=false and name the missing item. Never submit.'});
   }else if(action?.name==='report_application_outcome'){result={completed:false,unexpectedOutcome:action.arguments};break;}
   if(['error','completed'].includes(latest.status)){result={completed:false,error:latest.error};break;}
   await sleep(5000);
  }
  result??={completed:false,error:'27-minute test deadline'};
  result.seconds=(Date.now()-start)/1000;result.readySeconds=readySeconds;result.executionSeconds=result.seconds-readySeconds!;result.steps=latest?.steps;
  try{
   const evidence:any=unpack(await createApplicationBrowserRuntime().command({...ref,provider:'openai'},{operation:'test-evidence',commandId:randomUUID()},AbortSignal.timeout(60000)));
   for(const [i,s] of (evidence.screenshots||[]).entries())if(s.base64){await fs.writeFile(path.join(dir,`final-${i}.png`),Buffer.from(s.base64,'base64'),{mode:0o600});s.file=`final-${i}.png`;delete s.base64;}
   await write('evidence.json',evidence);
   latest=unpack(await runtime.status(ref));await write('latest.json',latest);
  }catch(e){result.evidenceError=String(e);}
 }catch(e){result={...result,completed:false,error:String(e),seconds:(Date.now()-start)/1000,readySeconds};log('error',{message:String(e)});}
 finally{
  await write('result.json',result);
  if(ref){
   try{await runtime.stop(ref);stopped=true;}catch(e){await write('cleanup-error.json',{error:String(e)});log('cleanup_error');}
   try{
    let response:Response;
    if(provider==='browser-use')response=await fetch(`https://api.browser-use.com/api/v4/browsers/${encodeURIComponent(ref.browserSessionId)}`,{headers:{'X-Browser-Use-API-Key':process.env.BROWSER_USE_API_KEY!},signal:AbortSignal.timeout(20000)});
    else response=await fetch(`https://api.browserbase.com/v1/sessions/${encodeURIComponent(ref.browserSessionId)}`,{headers:{'x-bb-api-key':process.env.BROWSERBASE_API_KEY!},signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Usage fetch failed: '+response.status);
    const s=await response.json();
    await write('browser-usage.json',{id:s.id,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,finishedAt:s.finishedAt,browserCost:s.browserCost,proxyCost:s.proxyCost,proxyBytes:s.proxyBytes,proxyUsedMb:s.proxyUsedMb});
   }catch(e){await write('usage-error.json',{error:String(e)});}
   await write('cleanup.json',{stopped});
  }
  log('finished',{completed:result?.completed,reportedReady:result?.reported?.ready,steps:result?.steps,dir,stopped});
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
