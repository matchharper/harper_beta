import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { requestDecision } from './preflight-guard.js';

// Loaded only by the explicit evaluation option, never by product callers.
// It cannot authorize application writes, even when the ordinary gate would.
export async function installPreSubmitTest({context,config,state,tool,z,snapshot}) {
  const candidate=config.preSubmitTest.candidate;
  const docs=Object.fromEntries(config.files.map(f=>[f.documentId,{...f,buffer:f.data?Buffer.from(f.data,'base64'):readFileSync(f.path)}]));
  const evidence=state.testEvidence={inventory:[],requests:[],attachments:[],nativeSubmitsBlocked:0};
  let uploadUntil=0;
  const seen=new Set();
  await context.exposeBinding('__harperTestSubmitBlocked',()=>{evidence.nativeSubmitsBlocked++;});
  await context.addInitScript(()=>{
    document.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();void window.__harperTestSubmitBlocked();},true);
    HTMLFormElement.prototype.submit=function(){void window.__harperTestSubmitBlocked();};
    HTMLFormElement.prototype.requestSubmit=function(){void window.__harperTestSubmitBlocked();};
    navigator.sendBeacon=()=>false;
  });
  return {
    pack(value){
      const raw=JSON.stringify(value);
      return Buffer.byteLength(raw)>300000 ? {testCompressed:gzipSync(raw).toString('base64'),rawBytes:Buffer.byteLength(raw)} : value;
    },
    beginAttachment(){uploadUntil=Date.now()+120000;},
    recordAttachment(entry){evidence.attachments.push(entry);},
    recordSnapshot(s){
      for(const f of s.elements||[]){
        const k=JSON.stringify([s.url,f.pageIndex,f.frameIndex,f.label,f.type,f.requiredState]);
        if(!seen.has(k)){seen.add(k);evidence.inventory.push({...f,value:undefined,observedUrl:s.url});}
      }
    },
    async route(route){
      const r=route.request(),body=r.postDataBuffer()||Buffer.alloc(0);
      const decision=requestDecision({method:r.method(),url:r.url(),contentType:r.headers()['content-type']||'',body},candidate,docs,Date.now()<uploadUntil);
      if(!decision.allow||!['GET','HEAD','OPTIONS'].includes(r.method())){
        const entry={url:r.url(),method:r.method(),bodyBytes:body.length,...decision};
        try{const j=JSON.parse(body.toString());entry.jsonKeys=Object.keys(j);entry.operationName=j.operationName;entry.variableKeys=j.variables?Object.keys(j.variables):undefined;}catch{}
        evidence.requests.push(entry);
        if(decision.allow)void r.response().then(x=>{entry.status=x?.status();}).catch(()=>{});
      }
      return decision.allow?route.continue():route.abort('blockedbyclient');
    },
    tools:{
      report_pre_submit:tool({
        description:'Finish this NO-SUBMISSION evaluation after inspecting the current form. Report observed application requirements, required-field completeness and attachment evidence. This report does not submit anything and will be independently reviewed.',
        inputSchema:z.object({requirements:z.string(),ready:z.boolean(),attachmentEvidence:z.string(),remaining:z.string(),summary:z.string()}),
        execute:async(report)=>{await snapshot();state.report=report;state.status='completed';return {recorded:true};},
      }),
      inspectTestRestrictions:tool({
        description:'Read network writes blocked by the pre-submit test guard. These can be harness restrictions rather than provider failures. Do not retry blocked application/draft writes.',
        inputSchema:z.object({}),
        execute:async()=>({blocked:evidence.requests.filter(x=>!x.allow).slice(-15),attachments:evidence.attachments,uploadResponses:evidence.requests.filter(x=>x.allow&&x.reason!=='GraphQL read query').slice(-15)}),
      }),
    },
    async capture(){
      await snapshot();
      const screenshots=[];
      let remaining=220000;
      for(const p of context.pages()){
        let bytes=await p.screenshot({type:'jpeg',quality:35,fullPage:true,timeout:10000}).catch(()=>null);
        let fullPage=true;
        if(bytes && bytes.length>remaining){fullPage=false;bytes=await p.screenshot({type:'jpeg',quality:30,timeout:10000}).catch(()=>null);}
        const included=bytes && bytes.length<=remaining;
        screenshots.push({url:p.url(),mimeType:'image/jpeg',fullPage,base64:included?bytes.toString('base64'):null});
        if(included)remaining-=bytes.length;
      }
      return {snapshot:state.snapshot,...evidence,screenshots};
    },
  };
}
