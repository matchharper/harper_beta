import { createClient } from "@supabase/supabase-js";
import { assertLocalStack } from "./isolation.mjs";
assertLocalStack();
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let stopped=false;
process.on("SIGTERM",()=>{stopped=true;});
process.on("SIGINT",()=>{stopped=true;});
while(!stopped){
  try {
    const {data,error}=await db.from("company_agent_web_action_jobs").select("id,status,locked_at").in("status",["queued","retry","processing"]).lte("next_attempt_at",new Date().toISOString()).order("created_at").limit(10);
    if(error)throw error;
    for(const job of data||[]){
      if(stopped)break;
      if(job.status==="processing"&&Date.parse(job.locked_at)>Date.now()-360000)continue;
      const r=await fetch(`${process.env.APP_BASE_URL}/api/queues/process-company-agent-web-action`,{method:"POST",headers:{authorization:`Bearer ${process.env.INTERNAL_WORKER_API_SECRET}`,"content-type":"application/json"},body:JSON.stringify({kind:"web_action_job",version:1,jobId:job.id})});
      if(!r.ok)console.error(`Web-action ${job.id}: ${r.status} ${(await r.text()).slice(0,500)}`);
    }
  }catch(error){console.error(error.message);}
  if(!stopped)await new Promise(resolve=>setTimeout(resolve,2000));
}
