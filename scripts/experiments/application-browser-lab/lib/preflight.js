import Browserbase from '@browserbasehq/sdk';
import {Stagehand,tool} from '@browserbasehq/stagehand';
import {chromium} from 'playwright-core';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {documents,sha} from './fixture.js';
import {preflightCases,preflightCandidate as candidate} from './preflight-cases.js';
import {requestDecision} from './preflight-guard.js';
import {preflightCasesV4} from './preflight-cases-v4.js';
import {preflightModel} from './preflight-model.js';

export async function runPreflight(origin,input){
  const luna=input.datasetVersion==='public-pre-submit-v4';
  const selected=(luna?preflightCasesV4:preflightCases)[input.case];if(!selected)throw Error('Unknown frozen preflight case');
  const start=Date.now(),bb=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY});
  const evidence={runId:randomUUID(),mode:'preflight',datasetVersion:luna?'public-pre-submit-v4':'historical-failures-v2',case:input.case,...selected,startedAt:new Date().toISOString(),model:luna?'openai/gpt-6-luna':'anthropic/claude-sonnet-5-5',reasoning:luna?'medium':'provider default',runtime:{node:process.version,vercel:!!process.env.VERCEL,region:process.env.VERCEL_REGION,deployment:process.env.VERCEL_URL},providerCalls:[],llmCalls:[],errors:[],requests:[],attachments:[],steps:[],pages:[]};
  let browser,stagehand,session,uploadUntil=0;const pendingResponses=[];
  try{
    session=await bb.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,timeout:600,proxies:input.proxy===true,region:'us-east-1',browserSettings:{viewport:{width:1280,height:960}}});evidence.sessionId=session.id;
    const model=preflightModel(evidence.model,evidence);
    stagehand=new Stagehand({env:'BROWSERBASE',apiKey:process.env.BROWSERBASE_API_KEY,projectId:process.env.BROWSERBASE_PROJECT_ID,browserbaseSessionID:session.id,disableAPI:true,experimental:true,model,verbose:0,disablePino:true,logger:()=>{}});await stagehand.init();
    browser=await chromium.connectOverCDP(session.connectUrl);const context=browser.contexts()[0];
    const choosers=new Map();
    const watchChooser=page=>page.on('filechooser',chooser=>choosers.set(page,chooser));
    context.pages().forEach(watchChooser);context.on('page',watchChooser);
    await context.routeWebSocket('**',ws=>ws.close());
    await context.addInitScript(()=>{
      document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
      HTMLFormElement.prototype.submit=function(){};HTMLFormElement.prototype.requestSubmit=function(){};
      navigator.sendBeacon=()=>false;
    });
    await context.route('**/*',async route=>{
      const r=route.request(),body=r.postDataBuffer()||Buffer.alloc(0),decision=requestDecision({method:r.method(),url:r.url(),contentType:r.headers()['content-type']||'',body},candidate,documents,Date.now()<uploadUntil);
      if(!decision.allow||!['GET','HEAD','OPTIONS'].includes(r.method())){
        const entry={url:r.url(),method:r.method(),bodyBytes:body.length,contentType:r.headers()['content-type'],...decision};evidence.requests.push(entry);
        // Diagnostic only: no bearer headers or bodies, bounded JSON shape.
        try{const j=JSON.parse(body.toString());entry.jsonKeys=Object.keys(j);if(typeof j.operationName==='string')entry.operationName=j.operationName.slice(0,100);if(j.variables)entry.variableKeys=Object.keys(j.variables);if(j.operationName==='ApiCreateFileUploadHandle'){entry.fileTicketQuery=j.query;entry.fileTicketMetadata=j.variables;}if(Array.isArray(j))entry.argumentKeys=j.map(v=>v&&typeof v==='object'?Object.keys(v):typeof v);}catch{}
        if(entry.contentType?.startsWith('multipart/form-data'))entry.formFields=[...body.toString().matchAll(/Content-Disposition:\s*form-data;\s*name="([^"]+)"/gi)].map(m=>m[1]);
        if(decision.allow)pendingResponses.push(r.response().then(response=>{entry.status=response?.status();}).catch(()=>{}));
      }
      return decision.allow?route.continue():route.abort('blockedbyclient');
    });
    const tools={
      listAttachmentInputs:tool({description:'List actual file inputs including hidden inputs in all tabs and frames. Use the returned indexes to attach.',inputSchema:z.object({}),execute:async()=>{
        const result=[];for(const [pageIndex,page] of context.pages().entries())for(const [frameIndex,frame] of page.frames().entries()){
          const fields=await frame.locator('input[type=file]').evaluateAll(es=>es.map((e,index)=>({index,label:[...e.labels||[]].map(l=>l.textContent).join(' ')||e.getAttribute('aria-label')||e.name,id:e.id,accept:e.accept,multiple:e.multiple}))).catch(()=>[]);
          result.push(...fields.map(f=>({...f,pageIndex,frameIndex,url:frame.url()})));
        }return {inputs:result,pendingFileChoosers:[...choosers.keys()].map(page=>({pageIndex:context.pages().indexOf(page),url:page.url()}))};
      }}),
      attachPendingFileChooser:tool({description:'Attach a synthetic document to an already opened native file chooser. Use after clicking the visible attachment control when there is no persistent input in the page. listAttachmentInputs reports pending chooser page indexes.',inputSchema:z.object({documentId:z.enum(['resume','portfolio']),pageIndex:z.number().int()}),execute:async({documentId,pageIndex})=>{
        const page=context.pages()[pageIndex],chooser=choosers.get(page);if(!chooser)throw Error('No pending file chooser; click the visible attachment button first');
        const doc=documents[documentId],r=await fetch(origin+'/documents/'+documentId),buffer=Buffer.from(await r.arrayBuffer());if(!r.ok||sha(buffer)!==sha(doc.buffer))throw Error('Document bytes differ');
        const before=evidence.requests.length;uploadUntil=Date.now()+20000;await chooser.setFiles({name:doc.name,mimeType:doc.mimeType,buffer});choosers.delete(page);await new Promise(resolve=>setTimeout(resolve,2000));
        const event={documentId,name:doc.name,size:buffer.length,sha256:sha(buffer),url:page.url(),method:'filechooser',requests:evidence.requests.slice(before)};evidence.attachments.push(event);return event;
      }}),
      attachDocument:tool({description:'Attach synthetic resume PDF or portfolio TXT through an observed file input. Ordinary upload requests may proceed; applicant submission requests are blocked. This does not prove server acceptance. Use resume for a PDF attachment.',inputSchema:z.object({documentId:z.enum(['resume','portfolio']),pageIndex:z.number().int(),frameIndex:z.number().int(),index:z.number().int()}),execute:async({documentId,pageIndex,frameIndex,index})=>{
        const frame=context.pages()[pageIndex]?.frames()[frameIndex];if(!frame||!frame.url().startsWith('https://'))throw Error('Invalid frame');
        const doc=documents[documentId],r=await fetch(origin+'/documents/'+documentId),buffer=Buffer.from(await r.arrayBuffer());if(!r.ok||sha(buffer)!==sha(doc.buffer))throw Error('Document bytes differ');
        const before=evidence.requests.length;uploadUntil=Date.now()+20000;
        await frame.locator('input[type=file]').nth(index).setInputFiles({name:doc.name,mimeType:doc.mimeType,buffer},{timeout:15000});
        await new Promise(resolve=>setTimeout(resolve,2000));
        const event={documentId,name:doc.name,size:buffer.length,sha256:sha(buffer),url:frame.url(),requests:evidence.requests.slice(before)};evidence.attachments.push(event);return event;
      }}),
      inspectCurrentFields:tool({description:'Read current field labels, required flags, values, file selections and native validity in all pages/frames. Does not submit or trigger validation. Also reports recent requests blocked by the test harness; these are not website errors.',inputSchema:z.object({}),execute:async()=>({pages:await snapshot(context),blockedRequests:evidence.requests.filter(r=>!r.allow).slice(-12)})}),
    };
    await stagehand.context.pages()[0].goto(selected.url,{waitUntil:'domcontentloaded',timeout:45000});
    const instruction=`Evaluate this real job application only as far as the final submit boundary. NEVER click the final Submit/Apply/Send application control, press Enter to submit a form, call an application API, create an account, request an email/SMS verification code, or contact the employer. Do not register for alerts. You may enter these explicitly synthetic values in the form and attach the synthetic documents through the provided tool. ${JSON.stringify(candidate)}. Answer required questions consistently from those synthetic facts; qualitative answers must clearly identify this as a synthetic test, not a real application. For optional demographic questions leave blank or decline. Do not make legal attestations that the fictional candidate is real. Follow public apply links and normal next/review steps if needed. Use observed controls; do not inject JavaScript or call endpoints directly. Try to fill all required fields and attach required documents, then inspectCurrentFields and report whether the final submission boundary was reached, any missing/invalid fields, upload confirmation and any blocker. Do not infer successful submission. Request guards can block writes; if that happens distinguish test-harness restrictions from a real website blocker. When done give a short Korean result. Do not retry the same blocked request repeatedly.`;
    const taskInstruction=instruction+(luna?' Evaluate only this exact job. If it is closed or redirects to a job list, stop and report that; do not choose another job. Preserve missing or uncertain required fields in your result. Finish by inspecting current values and the visible final submit control.':'');
    evidence.result=await stagehand.agent({mode:'hybrid',model,tools}).execute({instruction:taskInstruction,maxSteps:100,signal:AbortSignal.timeout(450000),callbacks:{onStepFinish:s=>{evidence.steps.push({toolCalls:s.toolCalls?.map(t=>({toolName:t.toolName,input:t.input})),usage:s.usage});}}});
    evidence.metrics=await stagehand.metrics;
  }catch(e){evidence.errors.push(e.message);}
  finally{
    if(browser){const context=browser.contexts()[0];evidence.pages=await snapshot(context).catch(()=>[]);evidence.screenshots=await Promise.all(context.pages().map(async p=>({url:p.url(),base64:await p.screenshot({type:'png',fullPage:true,timeout:7000}).then(b=>b.toString('base64')).catch(()=>null)})));await Promise.race([Promise.allSettled(pendingResponses),new Promise(r=>setTimeout(r,1500))]);await browser.close().catch(()=>{});}
    if(stagehand)await stagehand.close().catch(()=>{});
    if(session){await bb.sessions.update(session.id,{projectId:process.env.BROWSERBASE_PROJECT_ID,status:'REQUEST_RELEASE'}).catch(()=>{});const s=await bb.sessions.retrieve(session.id).catch(()=>null);if(s)evidence.browser={status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,proxyBytes:s.proxyBytes};}
  }
  evidence.elapsedMs=Date.now()-start;return evidence;
}
async function snapshot(context){
  return Promise.all(context.pages().map(async p=>({url:p.url(),frames:await Promise.all(p.frames().map(async f=>({url:f.url(),text:(await f.locator('body').innerText({timeout:2500}).catch(()=>'' )).slice(0,20000),fields:await f.locator('input,textarea,select,[role=combobox]').evaluateAll(es=>es.filter(e=>e.type!=='hidden').map(e=>({tag:e.tagName,type:e.type,role:e.getAttribute('role'),label:[...e.labels||[]].map(l=>l.textContent?.trim()).join(' ')||e.getAttribute('aria-label')||e.name,id:e.id,name:e.name,required:e.required||e.getAttribute('aria-required')==='true',value:e.type==='file'?[...e.files||[]].map(f=>({name:f.name,size:f.size})):['checkbox','radio'].includes(e.type)?e.checked:e.value,valid:e.validity?.valid,error:e.validationMessage,ariaInvalid:e.getAttribute('aria-invalid'),visible:e.getClientRects().length>0}))).catch(()=>[])})))})));
}
