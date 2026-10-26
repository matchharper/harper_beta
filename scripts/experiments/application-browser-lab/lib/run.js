import Browserbase from '@browserbasehq/sdk';
import { Stagehand, tool } from '@browserbasehq/stagehand';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { candidate, documents, sha, sign, verify } from './fixture.js';

export const cases={
  adyen:'https://job-boards.greenhouse.io/adyen/jobs/7095304',
  slate:'https://jobs.lever.co/slate/557fe4ab-d292-4069-8c63-36752f3da91d/apply',
  policyme:'https://jobs.lever.co/policyme/98b4ecb9-93c5-43cd-9d29-977232e343a1/apply',
};
export async function runExperiment(origin, input) {
  if(input.mode!=='submit'&&input.mode!=='inspect') throw Error('Unknown run mode');
  if(input.mode==='inspect'&&!cases[input.case])throw Error('Unknown inspection case');
  const runId=randomUUID(), started=Date.now(), submit=input.mode==='submit';
  const runToken=sign({type:'run',runId,expires:Date.now()+900000});
  const url=submit?origin+'/?run='+encodeURIComponent(runToken):cases[input.case];
  const bb=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY});
  const evidence={runId,mode:input.mode,case:input.case||'synthetic-v1',startedAt:new Date().toISOString(),model:'anthropic/claude-sonnet-5-5',runtime:{node:process.version,vercel:!!process.env.VERCEL,region:process.env.VERCEL_REGION},receipts:[],llmCalls:[],steps:[],errors:[]};
  let stagehand,pw,session;
  try {
    session=await bb.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,timeout:300,proxies:input.proxy===true,region:'us-east-1',browserSettings:{viewport:{width:1280,height:960}}});
    evidence.sessionId=session.id;
    const middleware={wrapGenerate:async({doGenerate})=>{const result=await doGenerate();evidence.llmCalls.push({usage:result.usage,providerMetadata:result.providerMetadata,finishReason:result.finishReason});return result;}};
    const model={modelName:evidence.model,apiKey:process.env.ANTHROPIC_API_KEY,middleware};
    stagehand=new Stagehand({env:'BROWSERBASE',apiKey:process.env.BROWSERBASE_API_KEY,projectId:process.env.BROWSERBASE_PROJECT_ID,browserbaseSessionID:session.id,disableAPI:true,experimental:true,model,verbose:0,disablePino:true,logger:()=>{}});
    await stagehand.init();
    pw=await chromium.connectOverCDP(session.connectUrl);
    const context=pw.contexts()[0];
    const responseTasks=[];
    const watch=page=>page.on('response',r=>{if(new URL(r.url()).origin===origin&&new URL(r.url()).pathname==='/submit')responseTasks.push((async()=>{try{const body=await r.json();if(body.signature){const receipt=verify(body.signature);if(receipt.type==='submission'&&receipt.runId===runId)evidence.receipts.push(receipt);}}catch(e){evidence.errors.push(e.message);}})());});
    context.pages().forEach(watch);context.on('page',watch);
    if(submit){await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===origin?route.continue():route.abort('blockedbyclient');});}
    else {
      await context.addInitScript(()=>{for(const event of ['submit','beforeinput','paste','drop'])document.addEventListener(event,e=>{e.preventDefault();e.stopImmediatePropagation();},true);HTMLFormElement.prototype.submit=function(){};HTMLFormElement.prototype.requestSubmit=function(){};});
      await context.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort('blockedbyclient'));
    }
    const tools=submit?{
      attachmentInputs:tool({description:'List file upload inputs, including hidden inputs, in every open tab and iframe. Returns the selector, page and frame indexes and field labels. Use before attaching a document.',inputSchema:z.object({}),execute:async()=>{
        const out=[];for(const [pageIndex,page] of context.pages().entries())for(const [frameIndex,frame] of page.frames().entries()){
          if(new URL(frame.url()).origin!==origin)continue;
          const fields=await frame.locator('input[type=file]').evaluateAll(es=>es.map((e,index)=>({index,label:[...e.labels||[]].map(x=>x.textContent).join(' ')||e.getAttribute('aria-label')||e.name,accept:e.accept,multiple:e.multiple})));
          out.push(...fields.map(f=>({...f,pageIndex,frameIndex})));
        }return out;
      }}),
      attachDocument:tool({description:'Attach an authorized document to an observed file input. Document bytes are fetched by this Next server from the document URL and sent directly to the remote browser; no local browser or user filesystem. documentId is resume or portfolio.',inputSchema:z.object({documentId:z.enum(['resume','portfolio']),pageIndex:z.number().int(),frameIndex:z.number().int(),index:z.number().int()}),execute:async({documentId,pageIndex,frameIndex,index})=>{
        const frame=context.pages()[pageIndex]?.frames()[frameIndex];if(!frame||new URL(frame.url()).origin!==origin)throw Error('Only owned fixture uploads allowed');
        const doc=documents[documentId],response=await fetch(origin+'/documents/'+documentId),buffer=Buffer.from(await response.arrayBuffer());
        if(!response.ok||sha(buffer)!==sha(doc.buffer))throw Error('Document download differs');
        await frame.locator('input[type=file]').nth(index).setInputFiles({name:doc.name,mimeType:doc.mimeType,buffer});
        return {attached:true,name:doc.name,size:buffer.length,sha256:sha(buffer)};
      }}),
    }:{};
    await stagehand.context.pages()[0].goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    const agent=stagehand.agent({mode:'hybrid',model,tools});
    const instruction=submit?
      `Complete this synthetic job application through the visible website, including final submission. You are authorized to submit only to ${origin}. Start from the current job page. Use the provided candidate facts verbatim: ${JSON.stringify(candidate)}. Attach the resume and portfolio via the attachment tools. Authorize the required synthetic test consent; leave optional newsletters unchecked. Observe the website and handle its steps, tabs, and frames yourself. Do not call the receiver endpoints directly or inject code to alter form state. Stop when the website confirms receipt. Report any actual blocker.`:
      `Read this public job application. Do not type any personal data, upload, authenticate, or submit. Discover and list application fields including required/optional, attachment formats, questions, and conditional fields visible without providing applicant data. Follow public Apply links if needed. Assess whether an agent could submit without login, and distinguish observed login/captcha/validation barriers from untested final submission. Return a concise Korean report. Do not claim successful submission.`;
    evidence.result=await agent.execute({instruction,maxSteps:45,signal:AbortSignal.timeout(270000),callbacks:{onStepFinish:step=>{evidence.steps.push({toolCalls:step.toolCalls?.map(t=>({toolName:t.toolName,input:t.input})),usage:step.usage});}}});
    await Promise.allSettled(responseTasks);
    evidence.metrics=await stagehand.metrics;
    evidence.pages=await Promise.all(context.pages().map(async p=>({url:p.url().replace(/([?&])run=[^&]+/g,'$1run=REDACTED'),frames:await Promise.all(p.frames().map(async f=>({url:f.url().replace(/([?&])run=[^&]+/g,'$1run=REDACTED'),text:(await f.locator('body').innerText({timeout:3000}).catch(()=>'' )).slice(0,12000)})))})));
  } catch(e){evidence.errors.push(String(e.message||e));}
  finally {
    if(pw)await pw.close().catch(()=>{});
    if(stagehand)await stagehand.close().catch(()=>{});
    if(session){await bb.sessions.update(session.id,{projectId:process.env.BROWSERBASE_PROJECT_ID,status:'REQUEST_RELEASE'}).catch(()=>{});const s=await bb.sessions.retrieve(session.id).catch(()=>null);if(s)evidence.browser={status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,proxyBytes:s.proxyBytes};}
  }
  evidence.elapsedMs=Date.now()-started;
  evidence.verifiedSubmission=evidence.receipts.length>0;
  return evidence;
}
