import {
  fillApplicationText,
  inspectApplicationFields,
} from "./applicationFormInput";

// This process belongs to Harper's executor. The planning model has no VM,
// filesystem, shell, browser credentials or route to this command endpoint.
export const controlledBrowserDriver = String.raw`
const { chromium } = require(process.env.HARPER_BROWSER_PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
 const directory = process.env.HARPER_BROWSER_DIRECTORY || '/vercel/sandbox/harper-browser';
 const browser = await chromium.launch({headless:true,...(process.env.HARPER_BROWSER_CHROMIUM_EXECUTABLE?{executablePath:process.env.HARPER_BROWSER_CHROMIUM_EXECUTABLE}:{})});
 const context = await browser.newContext({serviceWorkers:'block'});
 const page = await context.newPage();
 const fillText = ${fillApplicationText.toString()};
 const inspectFields = ${inspectApplicationFields.toString()};
 const refs = new Map(); let nextRef = 1;
 let active = false, pending = null, notify = null, executing = null, released = false, dataEntered = false, actionState = null;
 const initialUrl = fs.existsSync(directory+'/initial-url') ? fs.readFileSync(directory+'/initial-url','utf8') : null;
 let initialNavigation = true;
 const committed = new Map();
 const approvedRequests = new Set();
 const completed = new Map();
 const token = crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(directory+'/token',token,{mode:0o600});
 const fields = async () => {
   const result = [];
   for (const frame of page.frames()) {
     result.push(...await frame.locator('input,textarea,select').evaluateAll(elements => elements
       .filter(e => !['hidden','submit','button','reset'].includes(e.type))
       .map(e => ({label: Array.from(e.labels || []).map(l=>l.textContent.trim()).join(' ') || e.getAttribute('aria-label') || e.name || e.type,
         value: e.type==='file' ? Array.from(e.files || []).map(f=>f.name).join(', ') : ['checkbox','radio'].includes(e.type) ? String(e.checked) : e.value}))));
   }
   return result;
 };
 const formState = async () => ({pageUrl:page.url(),fields:await fields()});
 const snapshot = async () => {
   const elements = [];
   refs.clear();
   for (const frame of page.frames()) {
     for (const handle of await frame.locator('input,textarea,select,button,a').elementHandles()) {
       if (!await handle.isVisible()) continue;
       const ref=String(nextRef++); await handle.evaluate((e,id)=>e.setAttribute('data-harper-browser-ref',id),ref); refs.set(ref,frame.locator('[data-harper-browser-ref="'+ref+'"]'));
       elements.push({ref,...await handle.evaluate(e=>({tag:e.tagName.toLowerCase(),type:e.type||'',label:Array.from(e.labels||[]).map(l=>l.textContent.trim()).join(' ')||e.getAttribute('aria-label')||e.textContent.trim()||e.name||'',value:e.type==='file'?Array.from(e.files||[]).map(f=>f.name).join(', '):['checkbox','radio'].includes(e.type)?String(e.checked):e.value||'',href:e instanceof HTMLAnchorElement?e.href:undefined,required:!!e.required,options:e instanceof HTMLSelectElement?Array.from(e.options).map(o=>({value:o.value,label:o.text})):undefined}))});
     }
   }
   return {url:page.url(),title:await page.title(),text:(await page.locator('body').innerText()).slice(0,40000),elements};
 };
 await context.routeWebSocket('**',ws=>ws.close());
 await context.route('**/*', async route => {
   const request=route.request();
   const redirect=request.redirectedFrom();
   if(redirect && approvedRequests.has(redirect) && request.method()==='GET' && new URL(request.url()).origin===new URL(redirect.url()).origin) {
     approvedRequests.add(request);return route.continue();
   }
   const formRead = request.isNavigationRequest() && active;
   if (['GET','HEAD','OPTIONS'].includes(request.method()) && !formRead && !dataEntered) return route.continue();
   // Background analytics and writes during initial page loading never receive
   // approval and never leave the browser. Foreground writes are reviewed exactly.
   if (!active || pending || released) return route.abort('blockedbyclient');
   // Capture before the gesture: a paused native navigation prevents renderer
   // evaluation. The serialized HTTP request itself is immutable while held.
   const current=actionState;
   if(!current) return route.abort('blockedbyclient');
   const body=request.postDataBuffer()||Buffer.alloc(0);
   const contentType=request.headers()['content-type']||'';
   let bodyPreview;
   if(/^(application\/(json|x-www-form-urlencoded)|text\/)/i.test(contentType)) {
     if(body.length>256000) return route.abort('blockedbyclient');
     const text=body.toString('utf8');
     if(/^application\/x-www-form-urlencoded/i.test(contentType)) bodyPreview=Array.from(new URLSearchParams(text)).map(([key,value])=>key+': '+value).join('\n');
     else if(/^application\/json/i.test(contentType)) {try{bodyPreview=JSON.stringify(JSON.parse(text),null,2);}catch{bodyPreview=text;}}
     else bodyPreview=text;
   }
   const item={id:crypto.randomUUID(),url:request.url(),method:request.method(),bodyHash:hash(body),formHash:hash(JSON.stringify(current)),bodyPreview,...current};
   await new Promise(resolve=>{
     pending={item,route,resolve};
     if(notify) {notify({pendingRequest:item});notify=null;}
   });
 });
 const element = ref => {const handle=refs.get(ref);if(!handle) throw new Error('Element ref is no longer current; inspect again');return handle;};
 const command = async input => {
   if(input.operation==='status') return pending?{pendingRequest:pending.item}:{snapshot:await snapshot()};
   if(input.operation==='resolve') {
     if(committed.has(input.id)) {
       const receipt=committed.get(input.id);
       if(input.bodyHash!==receipt.bodyHash || input.formHash!==receipt.formHash || input.approved!==true) throw new Error('Request approval scope differs from the executed request');
       return {executed:true};
     }
     if(!pending || pending.item.id!==input.id || pending.item.bodyHash!==input.bodyHash || pending.item.formHash!==input.formHash) throw new Error('Request approval is no longer current');
     const held=pending;
     pending=null;
     released=true; // A denial also blocks later writes from the same gesture.
     if(input.approved) {committed.set(input.id,{bodyHash:input.bodyHash,formHash:input.formHash});approvedRequests.add(held.route.request());await held.route.continue();}
     else await held.route.abort('blockedbyclient');
     held.resolve();
     if(executing) await executing.catch(()=>{});
     await page.waitForTimeout(200);
     return {executed:input.approved,...(pending?{pendingRequest:pending.item}:{snapshot:await snapshot()})};
   }
   if(pending) return {pendingRequest:pending.item};
   if(executing) throw new Error('A browser operation is still running');
   actionState=await formState();
   let wake;const waiting=new Promise(resolve=>wake=resolve);notify=wake;
   const firstRead = input.action==='navigate' && initialNavigation && input.url===initialUrl;
   if(input.action==='navigate') initialNavigation=false;
   active=!firstRead;released=false;
   if(['fill','select','check','attach'].includes(input.action)) dataEntered=true;
   const work=(async()=>{
     const a=input.action;
     if(a==='inspect') return {snapshot:await snapshot()};
     if(a==='navigate') await page.goto(input.url,{waitUntil:'domcontentloaded',timeout:25000});
     else if(a==='fill') await fillText(element(input.ref),input.value);
     else if(a==='select') await element(input.ref).selectOption(input.value);
     else if(a==='check') await element(input.ref).setChecked(input.checked);
     else if(a==='attach') await element(input.ref).setInputFiles(input.path);
     else if(a==='click') await element(input.ref).click({timeout:25000});
     else throw new Error('Unsupported browser operation');
     await page.waitForTimeout(200);
     return {snapshot:await snapshot(),validation:await inspectFields(page)};
   })();
   executing=work;
   work.finally(()=>{active=false;notify=null;executing=null;}).catch(()=>{});
   return Promise.race([work,waiting]);
 };
 const server=http.createServer((req,res)=>{
   if(req.headers.authorization!=='Bearer '+token){res.writeHead(403);res.end();return;}
   let raw='';req.on('data',c=>{raw+=c;if(raw.length>200000)req.destroy();});
   req.on('end',async()=>{
     try {
       const input=JSON.parse(raw);
       if(typeof input.commandId!=='string') throw new Error('Command identifier required');
       let result=completed.get(input.commandId);
       if(!result){result=command(input);completed.set(input.commandId,result);if(completed.size>256)completed.delete(completed.keys().next().value);}
       res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await result));
     }catch(error){res.statusCode=409;res.end(JSON.stringify({error:String(error.message||error)}));}
   });
 });
 server.listen(0,'127.0.0.1',()=>fs.writeFileSync(directory+'/port',String(server.address().port)));
})().catch(error=>{console.error(error);process.exit(1)});
`;
export const controlledBrowserClient = String.raw`
const fs=require('node:fs');
(async()=>{
 const raw=fs.readFileSync(process.argv[2],'utf8');
 const port=fs.readFileSync('/vercel/sandbox/harper-browser/port','utf8');
 const token=fs.readFileSync('/vercel/sandbox/harper-browser/token','utf8');
 const response=await fetch('http://127.0.0.1:'+port,{method:'POST',headers:{Authorization:'Bearer '+token},body:raw});
 const body=await response.text();console.log(body);if(!response.ok)process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1)});
`;
