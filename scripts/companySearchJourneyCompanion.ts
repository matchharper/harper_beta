/** Local companion for an actual browser journey. No production DB or delivery. */
import { config } from 'dotenv';
import { mkdirSync,readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
async function main(){
 process.umask(0o077);
 const arg=(n:string)=>process.argv.find(x=>x.startsWith('--'+n+'='))?.slice(n.length+3);
 const root=path.resolve('docs/evaluation/company-agentic-role-search/runs');
 const source=path.resolve(root,arg('sandbox')??'');const output=path.resolve(root,arg('run')??'');
 if(!source.startsWith(root+'/')||!output.startsWith(root+'/'))throw Error('Private run paths required');
 const meta=JSON.parse(readFileSync(path.join(source,'sandbox.json'),'utf8'));
 if(new URL(meta.url).hostname!=='127.0.0.1'||!new URL(meta.databaseUrl).pathname.startsWith('/harper_agentic_'))throw Error('Isolated local database required');
 mkdirSync(output,{mode:0o700});const save=(n:string,v:any)=>writeFileSync(path.join(output,n),JSON.stringify(v,null,2)+'\n',{mode:0o600});
 config({path:'.env.local',quiet:true});Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:meta.url,SUPABASE_SERVICE_ROLE_KEY:'local-evaluation-only',NEXT_PUBLIC_SUPABASE_ANON_KEY:'local-evaluation-only',HARPER_LOCAL_E2E:'1'});
 let sequence=0;const native=globalThis.fetch;const pending:Promise<any>[]=[];
 globalThis.fetch=async(input,init)=>{const u=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);const provider=['api.openai.com','api.anthropic.com','openrouter.ai'].includes(u.hostname);if(!provider&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('External effect blocked: '+u.origin);const id=++sequence;const r=await native(input,init);if(provider)pending.push(r.clone().text().then(response=>save('provider-'+id+'.json',{url:u.origin+u.pathname,request:typeof init?.body==='string'?JSON.parse(init.body):null,status:r.status,response})));return r;};
 const {createClient}=await import('@supabase/supabase-js');const admin:any=createClient(meta.url,'local-evaluation-only',{auth:{persistSession:false}});
 const tables=['company_internal_roles','company_intro_candidates','company_first_search_runs','company_role_hiring_brief_history','company_agent_web_action_jobs','company_messages','company_first_slack_outbox'];
 async function state(){const all:any={};for(const table of tables){const {data,error}=await admin.from(table).select('*');if(error)throw error;all[table]=data;}return all;}
 save('state-before.json',await state());save('manifest.json',{source,action:arg('action'),historyId:arg('history'),jobId:arg('job'),externalDelivery:false,productionWrites:0,actualQueueProcessor:true,queueTransport:'local direct consumption'});
 try{
  if(arg('action')==='consume'){
   if(arg('history')){const {processHiringBriefSummary}=await import('../src/lib/org/hiringBriefHistory.server');save('summary.json',await processHiringBriefSummary({historyId:arg('history')!},{admin}));}
   if(arg('job')){const {processCompanyAgentWebActionJob}=await import('../src/lib/org/agent/webActionProcessor.server');await processCompanyAgentWebActionJob({jobId:arg('job'),kind:'web_action_job',version:1},{messageId:'journey:'+arg('job')});}
  }else if(arg('action')!=='snapshot')throw Error('Unknown action');
 }catch(error){save('error.json',{error:String(error)});process.exitCode=1;}finally{save('state-after.json',await state());await Promise.all(pending);}
 console.log(JSON.stringify({output,complete:!process.exitCode}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
