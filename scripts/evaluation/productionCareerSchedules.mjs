import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { cases } from './productionCareerCases.mjs';
import { prepareProfile } from './productionCareerProfiles.mjs';
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const unwrap = x => { if(x.error) throw Error(x.error.message); return x.data; };
const [command, run, ...ids] = process.argv.slice(2);
if(!['start','check','stop'].includes(command)) throw Error('Use start, check or stop');
for(const id of ids){
  const s=cases[id];
  if(!s || !(s.scheduled || id==='01')) throw Error('Not a scheduled case');
  const {dir,account}=await prepareProfile(id,run,{name:s.name,onboarded:!s.intake,profile:s.bio&&!s.intake?{bio:s.bio}:{},history:s.history,docs:s.docs,cards:s.cards,interview:s.interview});
  const marker=path.join(dir,'reservation.json');
  if(command==='start'&&!existsSync(marker)){
    const scheduled=unwrap(await admin.from('talent_agent_schedules').select('id,status,next_run_at,last_run_id').eq('talent_id',account.userId).eq('schedule_key','career_check_in').single());
    const before=new Date().toISOString();
    const record={id:scheduled.id,before,lastRun:scheduled.last_run_id};
    writeFileSync(marker,JSON.stringify({...record,phase:'starting'}),{flag:'wx',mode:0o600});
    try{
      unwrap(await admin.from('talent_setting').update({get_external_recommendation:true,status:'active',get_internal_recommendation:false,profile_visibility:'dont_share'}).eq('user_id',account.userId));
      const updated=unwrap(await admin.from('talent_agent_schedules').update({next_run_at:before,status:'active'}).eq('talent_id',account.userId).eq('id',scheduled.id).select('id').single());
      const written=marker+'.'+randomUUID();
      writeFileSync(written,JSON.stringify({...record,phase:'scheduled'}),{mode:0o600});
      renameSync(written,marker);
      console.log(id,'due',before,updated.id);
    }catch(error){console.error(id,'setup incomplete',error.message);process.exitCode=1;}
  }else if(command==='stop'){
    unwrap(await admin.from('talent_setting').update({get_external_recommendation:false,status:'stopped',get_internal_recommendation:false,profile_visibility:'dont_share'}).eq('user_id',account.userId));
    const paused=unwrap(await admin.from('talent_agent_schedules').update({status:'paused'}).eq('talent_id',account.userId).eq('status','active').select('id'));
    console.log(id,'paused future discovery and',paused.length,'other active reservations on the QA account');
  }else if(existsSync(marker)){
    const markerData=JSON.parse(readFileSync(marker));
    const row=unwrap(await admin.from('talent_agent_schedules').select('id,status,next_run_at,last_run_id').eq('id',markerData.id).eq('talent_id',account.userId).single());
    const runs=unwrap(await admin.from('opportunity_discovery_run').select('id,trigger,status,created_at,updated_at').eq('talent_id',account.userId).gte('created_at',markerData.before));
    writeFileSync(path.join(dir,'reservation-observed.json'),JSON.stringify({at:new Date().toISOString(),row,runs}),{mode:0o600});
    console.log(id,row.status,row.next_run_at,runs.map(x=>[x.trigger,x.status]));
    if(command==='start' && markerData.phase==='starting' && !runs.length){
      console.error(id,'The last scheduling attempt has no run yet. Check its reservation before starting another profile.');
      process.exitCode=1;
    }
  }
}
