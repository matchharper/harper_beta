/** Read-only diagnostic through the product entry point. No applicant data or files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {applicationStagehandRuntime as runtime} from '../src/lib/career/simulation/applicationStagehandRuntime';
import {inspectApplicationForm} from '../src/lib/career/simulation/applicationFormInspection';
async function main() {
 const [group,caseId]=process.argv.slice(2);
 if(!group || !caseId || path.basename(group)!==group) throw Error('Expected registered group and case');
 const base='docs/evaluation/application-browser-server';
 const frozen=JSON.parse(await fs.readFile(`${base}/runs/${group}/manifest.json`,'utf8'));
 const cases=JSON.parse(await fs.readFile(`${base}/${frozen.caseFile}`,'utf8'));
 const selected=cases.cases[caseId]; if(!selected) throw Error('Unknown frozen case');
 const dir=`${base}/runs/${group}/inspection-${randomUUID()}`;
 await fs.mkdir(dir,{mode:0o700});
 const write=(name:string,data:unknown)=>fs.writeFile(`${dir}/${name}.json`,JSON.stringify(data,null,2),{mode:0o600});
 const sources=['scripts/evalPublicApplicationInspection.ts','src/lib/career/simulation/applicationFormInspection.ts',...Object.keys(frozen.sourceHashes)];
 await write('manifest',{url:selected.url,model:'gpt-6-luna',maxSteps:100,readOnly:true,productEntryPoint:'inspectApplicationForm',datasetVersion:frozen.datasetVersion,sourceHashes:Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update(await fs.readFile(p)).digest('hex')])))});
 const create=runtime.create.bind(runtime),status=runtime.status.bind(runtime),stop=runtime.stop.bind(runtime);
 let ref:any;
 runtime.create=async(...args)=>{ref=await create(...args);await write('resource',ref);return ref;};
 runtime.status=async(...args)=>{const value=await status(...args);await write('latest',value);return value;};
 runtime.stop=async(...args)=>{await stop(...args);await write('cleanup',{stopped:true});};
 const start=Date.now();
 try {
  const result=await inspectApplicationForm(selected.url);
  await write('result',{seconds:(Date.now()-start)/1000,result});
  console.log(JSON.stringify({dir,seconds:(Date.now()-start)/1000,status:result.status,fields:result.fields.length,submission:result.submission,limitations:result.limitations.slice(0,1)}));
 } finally {
  runtime.create=create;runtime.status=status;runtime.stop=stop;
  if(ref?.browserSessionId){
   const response=await fetch(`https://api.browserbase.com/v1/sessions/${encodeURIComponent(ref.browserSessionId)}`,{headers:{'x-bb-api-key':process.env.BROWSERBASE_API_KEY!},signal:AbortSignal.timeout(15000)});
   if(response.ok){const s=await response.json();await write('browser-usage',{id:s.id,status:s.status,startedAt:s.startedAt,endedAt:s.endedAt});}
  }
 }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
