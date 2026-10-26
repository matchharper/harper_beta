import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
const base=path.dirname(new URL(import.meta.url).pathname);
const env=Object.fromEntries(fs.readFileSync(base+'/.env.lab','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const [origin,mode='submit',caseName,datasetVersion]=process.argv.slice(2);
if(!origin)throw Error('Deployment origin required');
const input={mode,...(caseName?{case:caseName}:{}),...(datasetVersion?{datasetVersion}:{}),proxy:process.env.LAB_PROXY==='1'};
const sourceHashes=Object.fromEntries(['lib/run.js','lib/fixture.js','lib/preflight.js','lib/preflight-cases.js','lib/preflight-cases-v3.js','lib/preflight-cases-v4.js','lib/preflight-model.js','lib/preflight-guard.js','package-lock.json'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(base+'/'+f)).digest('hex')]));
const start=Date.now();
const response=await new Promise((resolve,reject)=>{const req=https.request(origin+'/api/run',{method:'POST',headers:{Authorization:'Bearer '+env.LAB_SECRET,'Content-Type':'application/json'},timeout:790000},res=>{let raw='';res.setEncoding('utf8');res.on('data',c=>raw+=c);res.on('end',()=>resolve({status:res.statusCode,raw}));res.on('error',reject);});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('HTTP experiment timeout')));req.end(JSON.stringify(input));});
const raw=response.raw;let data;try{data=JSON.parse(raw);}catch{data={raw};}
const manifest={createdAt:new Date().toISOString(),origin,input,clientElapsedMs:Date.now()-start,httpStatus:response.status,sourceHashes,data};
const dir=path.resolve(base,'../../../docs/evaluation/application-browser-server/runs');fs.mkdirSync(dir,{recursive:true,mode:0o700});
const file=path.join(dir,new Date().toISOString().replaceAll(':','-')+'-'+mode+'-'+(caseName||'synthetic')+'.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2),{mode:0o600});
console.log(JSON.stringify({file,httpStatus:response.status,elapsedMs:data.elapsedMs,verifiedSubmission:data.verifiedSubmission,uploadFailed:data.uploadFailed,errors:data.errors,error:data.error,sessionId:data.sessionId,result:data.result?.message,usage:data.result?.usage,browser:data.browser,receiptCount:data.receipts?.length},null,2));
