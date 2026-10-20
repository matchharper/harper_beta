import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parseDecisionBatch} from '../src/lib/externalRecommendationsV2/decisions';
import {rankScore} from '../src/lib/externalRecommendationsV2/contract';

async function main(){
 process.umask(0o077);
 const source=path.resolve('../private/cost-input-20261019');
 const out=path.resolve('docs/evaluation/external-recommendations-v2/runs',new Date().toISOString().replace(/[:.]/g,'-')+'-compact-real');
 fs.mkdirSync(out,{recursive:true,mode:0o700});
 const read=(f:string)=>JSON.parse(fs.readFileSync(path.join(source,f),'utf8'));
 const save=(f:string,v:unknown)=>fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2),{mode:0o600});
 const roles=read('provenance-after.json').roles.map((r:any)=>r.id);
 const restoredOnly=process.argv.includes('--restore-questions');
 const restored=read('request-after.json');
 if(restoredOnly){
  const compact=read('request-compact.json');
  let expected=compact.input[1].content;
  roles.forEach((id:string,i:number)=>{expected=expected.replace(`- role_id: r${i}\n`,`- role_id: ${id}\n`);});
  if(expected!==restored.input[1].content || compact.input[0].content!==restored.input[0].content) throw Error('Evidence changed beyond role identifiers');
  if(JSON.stringify(restored.questions)!==JSON.stringify(read('request.json').questions)) throw Error('Original questions not restored');
 }
 const variants=restoredOnly ? [['restored',restored]] as const : [['baseline',read('request.json')],['compact',read('request-compact.json')]] as const;
 save('manifest.json',{dataset:'cost-input-real-20261019-v1',createdAt:new Date().toISOString(),source:'Previously reconstructed real-data snapshot; not historical wire capture',roles,expected:{roles:10,questions:60,duplicates:0,invalid:0},qualityGold:'None; score deltas are stability evidence, not accuracy',model:'gpt-6-luna',endpoint:'/v1/decisions',repeats:1,retries:0,variants:variants.map(([name,r])=>({name,sha256:createHash('sha256').update(JSON.stringify(r)).digest('hex')}))});
 save('historical-stored.json',read('stored-scoring-output.json'));
 const results:any={};
 for(const [name,request] of variants){
  save(name+'-request.json',request);
  const start=Date.now();
  const response=await fetch('https://api.openai.com/v1/decisions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
  const raw=await response.json();save(name+'-response.json',raw);
  if(!response.ok)throw Error(`${name} HTTP ${response.status}; saved response`);
  const parsed=parseDecisionBatch('openai',raw,roles);
  const names=raw.answers.map((x:any)=>x.name);
  const expected=new Set(request.questions.map((q:any)=>q.name));
  results[name]={model:raw.model,elapsedMs:Date.now()-start,usage:raw.usage,answerCount:names.length,duplicateCount:names.length-new Set(names).size,unexpected:names.filter((n:string)=>!expected.has(n)),...parsed};
  save(name+'-parsed.json',results[name]);
  console.log(JSON.stringify({name,model:raw.model,usage:raw.usage,elapsedMs:results[name].elapsedMs,valid:parsed.evaluations.length,errors:parsed.errors}));
 }
 if(restoredOnly){console.log(JSON.stringify({out,restored:results.restored}));return;}
 const rows=roles.map((roleId:string,i:number)=>{const a=results.baseline.evaluations.find((x:any)=>x.roleId===roleId)?.fit;const b=results.compact.evaluations.find((x:any)=>x.roleId===roleId)?.fit;return{alias:`r${i}`,roleId,baseline:a,compact:b,delta:a&&b?Object.fromEntries(Object.keys(a).filter(k=>typeof a[k]==='number').map(k=>[k,b[k]-a[k]])):null,baselineRank:a&&rankScore(a),compactRank:b&&rankScore(b)};});
 save('comparison.json',{baseline:results.baseline,compact:results.compact,rows});
 console.log(JSON.stringify({out,rows}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
