import Browserbase from '@browserbasehq/sdk';
import { chromium } from 'playwright-core';
import crypto from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import source from './legacy-driver.json';
import { documents, candidate, sign } from './fixture.js';

// Probe the actual driver without changing its route gate or gestures. The only
// adapter replaces chromium.launch with a connection to the same cloud browser.
// This is an executor capability probe, not the full production planner/policy.
export async function legacyProbe(origin){
  const start=Date.now(),runId=randomUUID(),bb=new Browserbase({apiKey:process.env.BROWSERBASE_API_KEY});
  const evidence={mode:'legacy-executor-probe',runId,sourcePath:source.sourcePath,sourceSha256:source.sourceSha256,steps:[],failedRequests:[],runtime:{vercel:!!process.env.VERCEL,node:process.version},errors:[]};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'harper-legacy-'));let session,browser,server;
  try{
    session=await bb.sessions.create({projectId:process.env.BROWSERBASE_PROJECT_ID,timeout:120,region:'us-east-1'});evidence.sessionId=session.id;
    browser=await chromium.connectOverCDP(session.connectUrl);
    const runToken=sign({type:'run',runId,expires:Date.now()+300000});
    // Give the legacy driver the direct form URL, bypassing the tab/iframe hurdle.
    const url=origin+'/form?run='+encodeURIComponent(runToken);
    fs.writeFileSync(dir+'/initial-url',url);fs.writeFileSync(dir+'/resume.pdf',documents.resume.buffer);
    const instrumentedRequire=id=>{
      if(id==='playwright')return {chromium:{launch:async()=>({newContext:async options=>{
        const context=await browser.newContext(options);
        context.on('page',p=>p.on('requestfailed',r=>evidence.failedRequests.push({url:new URL(r.url()).pathname,method:r.method(),failure:r.failure()})));
        return context;
      }})}};
      if(id==='node:http')return {...http,createServer:(...args)=>{server=http.createServer(...args);return server;}};
      const builtins={'node:fs':fs,'node:crypto':crypto,'node:dns':dns,'node:net':net};
      if(!builtins[id])throw Error('Unexpected driver module '+id);
      return builtins[id];
    };
    new Function('require','process','__name',source.driver)(instrumentedRequire,{env:{HARPER_BROWSER_DIRECTORY:dir,HARPER_BROWSER_PUBLIC_NETWORK:'1'},exit:()=>{throw Error('Driver exited');}},f=>f);
    for(let i=0;i<100&&!fs.existsSync(dir+'/port');i++)await new Promise(r=>setTimeout(r,100));
    const port=fs.readFileSync(dir+'/port','utf8'),token=fs.readFileSync(dir+'/token','utf8');
    async function command(input){
      const r=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({...input,commandId:randomUUID()}),signal:AbortSignal.timeout(35000)});
      const result=await r.json();evidence.steps.push({input:{...input,path:input.path?'<server-temp-pdf>':undefined,url:input.url?'owned-form':undefined},result});
      if(result.pendingRequest){const p=result.pendingRequest;if(new URL(p.url).origin!==origin)throw Error('Unexpected destination');return command({operation:'resolve',id:p.id,bodyHash:p.bodyHash,formHash:p.formHash,approved:true});}
      return result;
    }
    let result=await command({action:'navigate',url});
    const find=(name,type)=>result.snapshot?.elements.find(e=>name?e.name===name:e.type===type)?.ref;
    result=await command({action:'fill',ref:find('name'),value:candidate.name});
    result=await command({action:'attach',ref:find(null,'file'),path:dir+'/resume.pdf'});
    await new Promise(r=>setTimeout(r,1500));
    result=await command({action:'inspect'});evidence.finalSnapshot=result.snapshot;
    evidence.uploadFailed=result.snapshot?.text.includes('Upload failed:')||false;
    evidence.verifiedSubmission=false;
  }catch(e){evidence.errors.push(e.message);}
  finally{if(server)server.close();if(browser)await browser.close().catch(()=>{});if(session){await bb.sessions.update(session.id,{projectId:process.env.BROWSERBASE_PROJECT_ID,status:'REQUEST_RELEASE'}).catch(()=>{});const s=await bb.sessions.retrieve(session.id).catch(()=>null);if(s)evidence.browser={status:s.status,startedAt:s.startedAt,endedAt:s.endedAt,proxyBytes:s.proxyBytes};}fs.rmSync(dir,{recursive:true,force:true});}
  evidence.elapsedMs=Date.now()-start;return evidence;
}
