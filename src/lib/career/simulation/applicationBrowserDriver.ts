import {
  fillApplicationText,
  inspectApplicationFields,
} from "./applicationFormInput";

export const readOnlyFormGuard = String.raw`
 await context.addInitScript(() => {
   document.addEventListener('submit', event => {event.preventDefault();event.stopImmediatePropagation();}, true);
   for(const type of ['beforeinput','paste','drop']) document.addEventListener(type,event=>{event.preventDefault();event.stopImmediatePropagation();},true);
   document.addEventListener('click',event=>{
     const target=event.target instanceof Element?event.target.closest('input,textarea,select,button'):null;
     if(target && (target.matches('input,textarea,select') || (target instanceof HTMLButtonElement && target.form))) {event.preventDefault();event.stopImmediatePropagation();}
   },true);
   HTMLFormElement.prototype.submit = function() {};
   HTMLFormElement.prototype.requestSubmit = function() {};
 });
`;

// This process belongs to Harper's executor. The planning model has no VM,
// filesystem, shell, browser credentials or route to this command endpoint.
export const controlledBrowserDriver = String.raw`
const { chromium } = require(process.env.HARPER_BROWSER_PLAYWRIGHT_MODULE || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const {BlockList,isIP} = require('node:net');
const denied = new BlockList();
for(const [address,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) denied.addSubnet(address,bits,'ipv4');
for(const [address,bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8]]) denied.addSubnet(address,bits,'ipv6');
const publicDestination=async(value)=>{
 if(process.env.HARPER_BROWSER_PUBLIC_NETWORK!=='1') return true;
 try {
  const url=new URL(value), host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443')) return false;
  // The hosted browser's injected diagnostic sink is not an application
  // destination. Refuse its egress rather than treating telemetry as a submit.
  if(host==='bzr.openai.com') return false;
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await dns.lookup(host,{all:true});
  return addresses.length>0 && addresses.every(({address,family})=>!denied.check(address,family===6?'ipv6':'ipv4'));
 }catch{return false;}
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
(async () => {
 const directory = process.env.HARPER_BROWSER_DIRECTORY || '/vercel/sandbox/harper-browser';
 const browser = await chromium.launch({headless:true,...(process.env.HARPER_BROWSER_CHROMIUM_EXECUTABLE?{executablePath:process.env.HARPER_BROWSER_CHROMIUM_EXECUTABLE}:{})});
 const context = await browser.newContext({serviceWorkers:'block'});
 const readOnly=process.env.HARPER_BROWSER_READ_ONLY==='1';
 if(readOnly) {${readOnlyFormGuard}}
 const page = await context.newPage();
 const fillText = ${fillApplicationText.toString()};
 const inspectFields = ${inspectApplicationFields.toString()};
 const refs = new Map(); let nextRef = 1;
 const frameRefs = new Map(); const frameIds = new WeakMap(); let nextFrameRef = 1;
 const selectedFrames = new Set();
 const frameId = frame => {if(!frameIds.has(frame)) frameIds.set(frame,String(nextFrameRef++));return frameIds.get(frame);};
 page.on('framenavigated', frame => {if(frame===page.mainFrame()) {
   // A hash/history change also emits this event. Keep still-attached selected
   // documents so their entered values remain part of the approval capture.
   for(const selected of selectedFrames) if(selected.isDetached()) selectedFrames.delete(selected);
   frameRefs.clear();refs.clear();
 }});
 const scopes = () => [page.mainFrame(),...Array.from(selectedFrames).filter(frame=>!frame.isDetached())];
 const boundedRead = async (operation, label) => {
   let timer;
   try {return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(label+' read timed out')),4000);})]);}
   finally {clearTimeout(timer);}
 };
 let active = false, pending = null, notify = null, executing = null, released = false, dataEntered = false, actionState = null;
 const initialUrl = fs.existsSync(directory+'/initial-url') ? fs.readFileSync(directory+'/initial-url','utf8') : null;
 let initialNavigation = true;
 const committed = new Map();
 const approvedRequests = new Set();
 const completed = new Map();
 const token = crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(directory+'/token',token,{mode:0o600});
 const fields = async () => (await Promise.all(scopes().map(frame=>
   boundedRead(frame.locator('input,textarea,select').evaluateAll(elements => elements
     .filter(e => !['hidden','submit','button','reset'].includes(e.type))
     .map(e => ({label: Array.from(e.labels || []).map(l=>l.textContent.trim()).join(' ') || e.getAttribute('aria-label') || e.name || e.type,
       value: e.type==='file' ? Array.from(e.files || []).map(f=>f.name).join(', ') : ['checkbox','radio'].includes(e.type) ? String(e.checked) : e.value}))), 'Approval fields')
 ))).flat();
 const formState = async () => ({pageUrl:page.url(),fields:await fields()});
 const validation = async () => readOnly?undefined:(await Promise.all(scopes().map(frame=>boundedRead(inspectFields(frame),'Form validation')))).flat();
 // One renderer read per selected document. Never wait for an iframe body,
 // load event, or element actionability just to provide the planner context.
 const readScope = async frame => {
   const prefix=String(nextRef++);
   return boundedRead(frame.evaluate(prefix=>{
     const elements=Array.from(document.querySelectorAll('*')).filter(e=>{
       if(!(e instanceof HTMLElement)) return false;
       const style=getComputedStyle(e);
       // Include observable custom controls without guessing from their wording.
       // A pointer root avoids returning every descendant of a clickable card.
       const pointerRoot=style.cursor==='pointer' && (!e.parentElement || getComputedStyle(e.parentElement).cursor!=='pointer');
       if(!e.matches('input,textarea,select,button,a,[role="button"],[role="link"],[onclick],[tabindex]') && !pointerRoot) return false;
       return e.getClientRects().length>0 && style.visibility!=='hidden' && style.display!=='none' && e.getAttribute('aria-hidden')!=='true' && e.type!=='hidden';
     }).map((e,index)=>{
       const ref=prefix+String(index).padStart(8,'0');
       e.setAttribute('data-harper-browser-ref',ref);
       const attributes=(()=>{
         const labelledBy=(e.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>e.ownerDocument.getElementById(id)?.innerText||'').filter(Boolean).join(' ');
         const nativeLabel=Array.from(e.labels||[]).map(label=>{
           const walker=label.ownerDocument.createTreeWalker(label,NodeFilter.SHOW_TEXT),parts=[];
           let node;
           while(node=walker.nextNode()) {
             let parent=node.parentElement, visible=true;
             while(parent && label.contains(parent)) {
               const style=getComputedStyle(parent);
               if(parent.matches('input,textarea,select,button') || style.display==='none' || style.visibility==='hidden') {visible=false;break;}
               if(parent===label) break;
               parent=parent.parentElement;
             }
             if(visible && node.textContent.trim()) parts.push(node.textContent.trim());
           }
           return parts.join(' ');
         }).filter(Boolean).join(' ');
         // Read surrounding DOM text for controls without an accessible label.
         // This records source content, with no keyword/semantic classification.
         let container=e.closest('fieldset,[role="group"]');
         if(!container) for(let p=e.parentElement;p && p!==e.form && p.tagName!=='BODY';p=p.parentElement) {
           if(p.innerText.trim()) {container=p;break;}
         }
         const surrounding=container?.innerText.trim()||'';
         let groupText='';
         if(['checkbox','radio'].includes(e.type) && e.name && e.form) {
           const peers=Array.from(e.form.querySelectorAll('input')).filter(other=>other.type===e.type && other.name===e.name);
           if(peers.length>1) {
             let group=e.parentElement;
             while(group && !peers.every(other=>group.contains(other))) group=group.parentElement;
             let scope=group?.parentElement;
             while(scope && scope!==e.form) {
               if(Array.from(scope.childNodes).some(child=>child.nodeType===Node.TEXT_NODE?child.textContent.trim():!child.contains(group) && child.innerText?.trim())) break;
               scope=scope.parentElement;
             }
             groupText=((scope && scope!==e.form?scope:group)?.innerText||'').trim();
           }
         }
         const ownLabel=labelledBy||e.getAttribute('aria-label')||nativeLabel||(['INPUT','TEXTAREA','SELECT'].includes(e.tagName)?surrounding:e.innerText.trim())||e.name||'';
         return {tag:e.tagName.toLowerCase(),type:e.getAttribute('role')==='combobox'?'combobox':e.type||'',name:e.name||'',label:ownLabel,value:e.type==='file'?Array.from(e.files||[]).map(f=>f.name).join(', '):['checkbox','radio'].includes(e.type)?String(e.checked):e.value||'',href:e instanceof HTMLAnchorElement?e.href:undefined,required:!!e.required,
         requiredState:e.required||e.getAttribute('aria-required')==='true'?true:e.getAttribute('aria-required')==='false'?false:null,
         maxLength:e.hasAttribute('maxlength')&&e.maxLength>=0?e.maxLength:null,
         fileTypes:e.type==='file'?(e.getAttribute('accept')||'').split(',').map(v=>v.trim()).filter(Boolean):[],
         instructions:[groupText||surrounding,...(e.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean).map(id=>e.ownerDocument.getElementById(id)?.innerText||''),e.getAttribute('placeholder')||''].filter(Boolean).join('\n').slice(0,2000),
         options:e instanceof HTMLSelectElement?Array.from(e.options).map(o=>({value:o.value,label:o.text})):undefined};
       })();
       return {ref,...attributes};
     });
     return {text:document.body?.innerText||'',title:document.title,elements};
   },prefix),'Document');
 };
 const snapshot = async () => {
   refs.clear();frameRefs.clear();
   const frames=page.frames().filter(frame=>frame!==page.mainFrame() && !frame.isDetached()).map(frame=>{
     const ref=frameId(frame);frameRefs.set(ref,frame);
     return {ref,url:frame.url(),name:frame.name(),inspected:selectedFrames.has(frame)};
   });
   const currentScopes=scopes();
   const results=await Promise.allSettled(currentScopes.map(readScope));
   const elements=[],texts=[],readErrors=[];let title='';
   results.forEach((result,index)=>{
     const frame=currentScopes[index];
     if(result.status==='rejected') {
       readErrors.push({frameRef:index===0?null:frameId(frame),error:String(result.reason?.message||result.reason)});
       return;
     }
     if(index===0) title=result.value.title;
     texts.push((index===0?'':'[Selected frame '+frameId(frame)+' '+frame.url()+']\n')+result.value.text);
     for(const item of result.value.elements) {
       refs.set(item.ref,frame.locator('[data-harper-browser-ref="'+item.ref+'"]'));
       elements.push(item);
     }
   });
   const text=texts.join('\n\n');
   return {url:page.url(),title,text:text.slice(0,40000)+(text.length>40000?'\n[Source text truncated; remaining content is unknown.]':''),elements,frames,readErrors};
 };
 await context.routeWebSocket('**',ws=>ws.close());
 await context.route('**/*', async route => {
   const request=route.request();
   if(!await publicDestination(request.url())) return route.abort('blockedbyclient');
   if(readOnly) {
     if(['GET','HEAD','OPTIONS'].includes(request.method())) return route.continue();
     // Public anonymous bootstrap queries may use POST. Explicit click writes
     // and non-read navigations are never authorized by the inspection runtime.
     if(!active && !request.isNavigationRequest()) return route.continue();
     return route.abort('blockedbyclient');
   }
   const redirect=request.redirectedFrom();
   if(redirect && approvedRequests.has(redirect) && request.method()==='GET' && new URL(request.url()).origin===new URL(redirect.url()).origin) {
     approvedRequests.add(request);return route.continue();
   }
   const formRead = request.isNavigationRequest() && active;
   if (['GET','HEAD','OPTIONS'].includes(request.method()) && !formRead && !dataEntered) return route.continue();
   // Fresh contexts have no credentials or candidate data. Anonymous bootstrap
   // requests (including POST-based form reads) may load the initial page.
   // Once any supplied input/file enters it, background writes stay blocked and
   // every foreground transmission stays held for the exact server approval.
   if(!active && !dataEntered) return route.continue();
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
   if(readOnly && (input.operation==='resolve' || !['inspect','navigate','click'].includes(input.action))) throw new Error('Read-only browser cannot edit, attach or submit');
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
   if(input.action==='navigate' && !await publicDestination(input.url)) throw new Error('ERR_BLOCKED_BY_CLIENT: navigation destination is not public HTTPS');
   actionState=readOnly || input.action==='inspect'?null:await formState();
   let wake;const waiting=new Promise(resolve=>wake=resolve);notify=wake;
   const firstRead = input.action==='navigate' && initialNavigation && input.url===initialUrl;
   if(input.action==='navigate') initialNavigation=false;
   active=readOnly?input.action==='click':!firstRead && input.action!=='inspect';released=false;
   if(['fill','select','check','attach','fill_fields'].includes(input.action)) dataEntered=true;
   const work=(async()=>{
     const a=input.action;
     if(a==='inspect') {
       if(input.frameRef!==undefined) {
         const frame=frameRefs.get(input.frameRef);
         if(!frame || frame.isDetached()) throw new Error('Frame ref is no longer current; inspect again');
         selectedFrames.add(frame);
       }
       return {snapshot:await snapshot()};
     }
     if(a==='fill_fields') {
       let completedFields=0, error;
       try {
         // Keep the original refs until the batch ends. Each field remains a
         // separate gesture under the existing exact-request approval gate.
         for(const field of input.fields) {
           if(pending || released) break;
           actionState=await formState();
           if(field.action==='fill') await fillText(element(field.ref),field.value);
           else if(field.action==='select') await element(field.ref).selectOption(field.value);
           else if(field.action==='check') await element(field.ref).setChecked(field.checked);
           else if(field.action==='attach') await element(field.ref).setInputFiles(field.path);
           else throw new Error('Unsupported form field operation');
           completedFields++;
           await page.waitForTimeout(200);
         }
       }catch(cause){error=String(cause.message||cause);}
       return {snapshot:await snapshot(),validation:await validation(),completedFields,...(error?{error}:{})};
     }
     if(a==='navigate') await page.goto(input.url,{waitUntil:'commit',timeout:20000});
     else if(a==='fill') await fillText(element(input.ref),input.value);
     else if(a==='select') await element(input.ref).selectOption(input.value);
     else if(a==='check') await element(input.ref).setChecked(input.checked);
     else if(a==='attach') await element(input.ref).setInputFiles(input.path);
     else if(a==='click') {
       const target=element(input.ref);
       if(readOnly && !await target.evaluate(e=>e instanceof HTMLAnchorElement || (!e.closest('form') && !e.matches('input,textarea,select,[contenteditable="true"],[role="checkbox"],[role="radio"],[role="switch"],[role="combobox"]') && (e instanceof HTMLButtonElement || e.matches('[role="button"],[role="link"],[onclick]') || getComputedStyle(e).cursor==='pointer')))) throw new Error('Read-only browser cannot operate form controls');
       const href=readOnly?await target.evaluate(e=>e instanceof HTMLAnchorElement && e.target==='_blank'?e.href:null):null;
       if(href) await page.goto(href,{waitUntil:'commit',timeout:20000});
       else await target.click({timeout:25000});
     }
     else throw new Error('Unsupported browser operation');
     await page.waitForTimeout(200);
     return {snapshot:await snapshot(),validation:await validation()};
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
