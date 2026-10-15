/** Runs only as deterministic setup code in OpenAI's sandbox. No model turn is
 * started in this session, so the planning model cannot read these files. */
export const hostedBrowserWorker = String.raw`
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const directory='/workspace/harper-browser';
const configuration=JSON.parse(fs.readFileSync(directory+'/configuration.json','utf8'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const publish=async(target,result)=>{
 const plain=JSON.stringify(result);
 if(Buffer.byteLength(plain)>512*1024) throw new Error('Browser result exceeds its transport limit');
 const nonce=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(target.key,'base64'),nonce);
 const ciphertext=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]);
 const body=JSON.stringify({nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:ciphertext.toString('base64')});
 for(let attempt=0;attempt<4;attempt++) {
  try {
   // urllib uses the hosted environment's mandatory HTTPS proxy; Node's fetch
   // does not inherit it. URL/body travel through stdin, never process argv.
   const delivery=spawnSync('python3',[directory+'/publish.py'],{input:JSON.stringify({url:target.url,body}),encoding:'utf8',timeout:15000,maxBuffer:2000});
   const status=JSON.parse(delivery.stdout||'{}').status;
   if(status>=200 && status<300 || status===409) return;
   fs.writeFileSync(directory+'/transport-http-'+String(status||0),'');
  }catch(error){
   const code=String(error.cause?.code||error.name||'UNKNOWN');
   if(/^[A-Z_a-z0-9]+$/.test(code)) fs.writeFileSync(directory+'/transport-error-'+code,'');
  }
  await delay(500*(attempt+1));
 }
 throw new Error('Browser result transport failed');
};
const send=async(input)=>{
 const port=fs.readFileSync(directory+'/port','utf8');
 const token=fs.readFileSync(directory+'/token','utf8');
 const response=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(input),signal:AbortSignal.timeout(35000)});
 return response.json();
};
(async()=>{
 await publish(configuration.ready,{ready:true});
 const processed=new Set();
 while(Date.now()<Date.parse(configuration.expiresAt)) {
  for(const name of fs.readdirSync(directory+'/commands').filter(name=>name.endsWith('.json')).sort()) {
   if(processed.has(name)) continue;
   let message;
   try {message=JSON.parse(fs.readFileSync(directory+'/commands/'+name,'utf8'));}catch{continue;}
   let result;
   try {
    const input=message.input;
    if(input.operation==='install_file') {
     if(configuration.readOnly) throw new Error('Read-only browser cannot receive attachments');
     if(!input.path.startsWith('/workspace/attachments/') || path.resolve(input.path)!==input.path) throw new Error('Attachment path is invalid');
     if(!Array.isArray(input.chunks) || input.chunks.some(chunk=>!chunk.startsWith(directory+'/chunks/') || path.resolve(chunk)!==chunk)) throw new Error('Attachment chunks are invalid');
     const bytes=Buffer.concat(input.chunks.map(chunk=>fs.readFileSync(chunk)));
     if(bytes.length>10*1024*1024 || digest(bytes)!==input.hash) throw new Error('Attachment bytes changed during transfer');
     fs.mkdirSync(path.dirname(input.path),{recursive:true});
     fs.writeFileSync(input.path,bytes,{mode:0o600});
     for(const chunk of input.chunks) fs.unlinkSync(chunk);
     result={installed:true};
    }else result=await send(input);
   }catch(error){result={error:String(error.message||error)};}
   await publish(message.target,{commandId:message.input.commandId,result});
   processed.add(name);
   fs.unlinkSync(directory+'/commands/'+name);
  }
  await delay(200);
 }
})().catch(()=>{process.exitCode=1;}).finally(()=>{
 try{process.kill(Number(fs.readFileSync(directory+'/browser.pid','utf8')),'SIGTERM');}catch{}
 fs.rmSync('/workspace/attachments',{recursive:true,force:true});
});
`;

export const hostedBrowserPublish = String.raw`
import json
import ssl
import sys
import urllib.error
import urllib.request
value = json.load(sys.stdin)
request = urllib.request.Request(value['url'], data=value['body'].encode('utf-8'), method='PUT', headers={'Content-Type':'text/plain', 'x-upsert':'false', 'Cache-Control':'no-store'})
try:
    with urllib.request.urlopen(request, context=ssl.create_default_context(cafile='/etc/ssl/certs/ca-certificates.crt'), timeout=10) as response:
        print(json.dumps({'status':response.status}))
except urllib.error.HTTPError as error:
    print(json.dumps({'status':error.code}))
except Exception:
    print(json.dumps({'status':0}))
`;

// A new process session survives completion of the provider's setup command.
export const hostedBrowserStart = String.raw`
import os
import json
from pathlib import Path
import subprocess
import time
directory = Path('/workspace/harper-browser')
configuration = json.loads((directory / 'configuration.json').read_text())
environment = dict(os.environ, HARPER_BROWSER_DIRECTORY=str(directory), HARPER_BROWSER_PUBLIC_NETWORK='1', HARPER_BROWSER_READ_ONLY='1' if configuration.get('readOnly') else '0')
with (directory / 'browser.log').open('ab') as log:
    browser = subprocess.Popen(['node', str(directory / 'server.cjs')], env=environment, start_new_session=True, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
(directory / 'browser.pid').write_text(str(browser.pid))
for attempt in range(300):
    if (directory / 'port').exists():
        break
    if browser.poll() is not None:
        raise RuntimeError('Controlled browser did not start')
    time.sleep(0.1)
else:
    raise RuntimeError('Controlled browser startup timed out')
with (directory / 'worker.log').open('ab') as log:
    worker_environment = dict(os.environ, NODE_EXTRA_CA_CERTS='/etc/ssl/certs/ca-certificates.crt')
    subprocess.Popen(['node', str(directory / 'worker.cjs')], env=worker_environment, start_new_session=True, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
`;
