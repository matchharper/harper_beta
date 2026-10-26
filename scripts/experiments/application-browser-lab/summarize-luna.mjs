import fs from 'node:fs';
import path from 'node:path';
const dir=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../../../docs/evaluation/application-browser-server/runs');
const rows=[];
for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')&&f.includes('-preflight-')).sort()){
  const run=JSON.parse(fs.readFileSync(path.join(dir,file))),e=run.data;
  if(e?.datasetVersion!=='public-pre-submit-v4')continue;
  let llmUsd=0,missing=0,longCalls=0,inputTokens=0,outputTokens=0,cachedTokens=0,cacheWriteTokens=0;
  for(const call of e.providerCalls||[]){
    if(call.status!==200)continue;
    const u=call.usage;if(!u){missing++;continue;}
    const read=u.input_tokens_details?.cached_tokens||0,write=u.input_tokens_details?.cache_write_tokens||0;
    const uncached=u.input_tokens-read-write;if(uncached<0)throw Error('Invalid overlapping token usage');
    const long=u.input_tokens>272000;if(long)longCalls++;
    llmUsd+=(uncached*(long?.2:.1)+read*(long?.02:.01)+write*(long?.25:.125)+u.output_tokens*(long?.75:.5))/1e6;
    inputTokens+=u.input_tokens;outputTokens+=u.output_tokens;cachedTokens+=read;cacheWriteTokens+=write;
  }
  const browserSeconds=(new Date(e.browser?.endedAt)-new Date(e.browser?.startedAt))/1000;
  const browserUsd=browserSeconds*.12/3600;
  rows.push({file,case:e.case,company:e.company,site:e.site,seconds:e.elapsedMs/1000,llmUsd,browserUsd,totalUsd:llmUsd+browserUsd,browserSeconds,inputTokens,outputTokens,cachedTokens,cacheWriteTokens,longCalls,missingUsage:missing,providerCalls:e.providerCalls?.length,sdkCalls:e.llmCalls?.length,reportedModels:[...new Set(e.providerCalls?.map(c=>c.model).filter(Boolean))],sessionId:e.sessionId,startedAt:e.startedAt,deployment:e.runtime?.deployment,errors:e.errors,message:e.result?.message,steps:e.steps?.length,finalUrls:e.pages?.map(p=>p.url),attachments:e.attachments?.length,uploadResponses:e.requests?.filter(r=>r.allow&&!['GET','HEAD','OPTIONS'].includes(r.method)).map(r=>({origin:new URL(r.url).origin,method:r.method,status:r.status,reason:r.reason}))});
}
const summary={createdAt:new Date().toISOString(),datasetVersion:'public-pre-submit-v4',runs:rows,totalUsd:rows.reduce((s,r)=>s+r.totalUsd,0)};
fs.writeFileSync(path.join(dir,'luna-v4-summary.json'),JSON.stringify(summary,null,2),{mode:0o600});
console.log(JSON.stringify(summary,null,2));
