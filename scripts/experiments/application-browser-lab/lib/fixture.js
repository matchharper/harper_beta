import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
export const sha = b => createHash('sha256').update(b).digest('hex');
export function sign(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload + '.' + createHmac('sha256', process.env.LAB_SECRET).update(payload).digest('base64url');
}
export function verify(token) {
  const [payload, signature] = String(token || '').split('.');
  const expected = createHmac('sha256', process.env.LAB_SECRET).update(payload || '').digest('base64url');
  if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw Error('Invalid signed token');
  const value = JSON.parse(Buffer.from(payload, 'base64url'));
  if (value.expires && value.expires < Date.now()) throw Error('Expired token');
  return value;
}
function pdf() {
  const content='BT /F1 16 Tf 50 740 Td (SYNTHETIC TEST - Alex Example) Tj 0 -30 Td (Software engineer. Five years of TypeScript and Python.) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let result='%PDF-1.4\n', offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(result)); result+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const start=Buffer.byteLength(result);
  result+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(result);
}
export const documents = {
  resume: { name: 'alex-example-resume.pdf', mimeType: 'application/pdf', buffer: pdf() },
  portfolio: { name: 'alex-example-portfolio.txt', mimeType: 'text/plain', buffer: Buffer.from('SYNTHETIC TEST PORTFOLIO\nAlex Example\nBuilt accessible recruiting forms with TypeScript and Python.\n') },
};
export const candidate = {name:'Alex Example',email:'alex@example.com',phone:'+12025550123',country:'Canada',city:'Toronto',experience:'5',sponsorship:'No',answer:'I build reliable and accessible web applications. I have five years of TypeScript and Python experience. This synthetic role matches my work on forms and document processing.'};
const style=`body{font:17px system-ui;background:#f3f4f6;color:#152136;margin:0;padding:32px}main{max-width:780px;margin:auto;background:white;padding:32px;border-radius:14px}label{display:block;margin:20px 0 6px}input:not([type=checkbox]),select,textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #9ca3af;border-radius:6px}button,a.button{display:inline-block;background:#164e63;color:white;border:0;border-radius:6px;padding:12px 20px;margin:12px 10px 0 0;cursor:pointer}iframe{width:100%;height:1600px;border:0}small{color:#596579}pre{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#b91c1c}`;
const html = body => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harper Synthetic Recruiting Lab</title><style>${style}</style></head><body><main>${body}</main></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
export async function handleFixture(request) {
  const url=new URL(request.url), path=url.pathname, token=url.searchParams.get('run');
  if(path==='/health') return Response.json({ok:true,runtime:process.version,vercel:!!process.env.VERCEL});
  if(path.startsWith('/documents/')) {
    const doc=documents[path.split('/').pop()];
    return doc?new Response(doc.buffer,{headers:{'Content-Type':doc.mimeType,'Content-Disposition':`attachment; filename="${doc.name}"`}}):new Response('Not found',{status:404});
  }
  if(path==='/') return html(`<h1>Senior Software Engineer</h1><p>This is a synthetic application test. No real employer receives this application.</p><p>Three steps: contact details and documents, additional questions, review and submit.</p><a class="button" href="/apply?run=${encodeURIComponent(token||'')}" target="_blank">Apply now</a>`);
  if(path==='/apply') return html(`<h1>Application portal</h1><p>Synthetic applications only.</p><iframe title="Application form" src="/form?run=${encodeURIComponent(token||'')}"></iframe>`);
  if(path==='/form') return html(`<h1>Apply — Software Engineer</h1><small>Synthetic test only. Fields marked * are required.</small><div id="app"></div>
<script>
const token=${JSON.stringify(token)}, state={files:{}}, root=document.querySelector('#app');
async function api(path,body,method='POST',headers={}){const r=await fetch(path,{method,headers:{Authorization:'Bearer '+token,...headers},body:body instanceof File?body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;}
function first(){root.innerHTML='<h2>Step 1 of 3 — Contact and documents</h2><form id="first"><label>Full name *<input name="name" autocomplete="name" required></label><label>Email *<input name="email" type="email" required></label><label>Phone *<input name="phone" type="tel" required></label><label>Country *<select name="country" required><option value="">Choose a country</option><option>Canada</option><option>United States</option></select></label><label>City *<select name="city" required disabled><option value="">Choose country first</option></select></label><label>Resume PDF *<input id="resume" type="file" accept=".pdf"></label><span id="resume-status">No file uploaded</span><label>Portfolio *<input id="portfolio" type="file" accept=".txt,.pdf"></label><span id="portfolio-status">No file uploaded</span><p id="error" class="error"></p><button type="submit">Continue to questions</button></form>';
const form=document.querySelector('#first');form.country.onchange=async()=>{form.city.disabled=true;const r=await fetch('/cities?country='+encodeURIComponent(form.country.value));const cities=await r.json();form.city.innerHTML='<option value="">Choose a city</option>'+cities.map(c=>'<option>'+c+'</option>').join('');form.city.disabled=false;};
for(const kind of ['resume','portfolio'])document.getElementById(kind).onchange=async e=>{const file=e.target.files[0],status=document.getElementById(kind+'-status');try{status.textContent='Uploading...';const ticket=await api('/upload-ticket',{kind,name:file.name,type:file.type});const uploaded=await api('/upload?ticket='+encodeURIComponent(ticket.token),file,'PUT',{'Content-Type':file.type});const committed=await api('/upload-commit',{receipt:uploaded.token});state.files[kind]=committed.token;status.textContent='Uploaded: '+file.name;}catch(e){status.textContent='Upload failed: '+e.message;}};
form.onsubmit=e=>{e.preventDefault();if(!state.files.resume||!state.files.portfolio){document.querySelector('#error').textContent='Both documents must finish uploading.';return;}Object.assign(state,Object.fromEntries(new FormData(form)));second();};}
function second(){root.innerHTML='<h2>Step 2 of 3 — Additional questions</h2><form id="second"><label>Years of professional experience *<input name="experience" type="number" min="0" required></label><label>Will you need sponsorship? *<select name="sponsorship" required><option value="">Choose</option><option>No</option><option>Yes</option></select></label><div id="conditional"></div><label>Why are you interested? (at least 60 characters) *<textarea name="answer" minlength="60" required rows="5"></textarea></label><label><input name="newsletter" type="checkbox"> Optional recruiting newsletter</label><button type="submit">Review application</button></form>';const f=document.querySelector('#second');f.sponsorship.onchange=()=>document.querySelector('#conditional').innerHTML=f.sponsorship.value==='Yes'?'<label>Required sponsorship details *<textarea name="sponsorshipDetails" required></textarea></label>':'';f.onsubmit=e=>{e.preventDefault();Object.assign(state,Object.fromEntries(new FormData(f)));review();};}
function review(){root.innerHTML='<h2>Step 3 of 3 — Review</h2><pre id="review"></pre><label><input id="consent" type="checkbox"> I confirm this is synthetic test data and authorize this test submission. *</label><p id="error" class="error"></p><button id="submit">Submit application</button>';document.querySelector('#review').textContent=JSON.stringify({...state,files:Object.keys(state.files)},null,2);document.querySelector('#submit').onclick=async()=>{if(!document.querySelector('#consent').checked){document.querySelector('#error').textContent='Confirmation is required';return;}try{const receipt=await api('/submit',{...state,consent:true});root.innerHTML='<h2>Application received</h2><p>Both uploaded documents and all fields were received by the server.</p><pre id="receipt"></pre>';document.querySelector('#receipt').textContent=JSON.stringify(receipt,null,2);}catch(e){document.querySelector('#error').textContent=e.message;}};}
first();
</script>`);
  if(path==='/cities'){await new Promise(r=>setTimeout(r,650));return Response.json(url.searchParams.get('country')==='Canada'?['Toronto','Vancouver']:['New York','Seattle']);}
  if(['/upload-ticket','/upload','/upload-commit','/submit'].includes(path)) {
    try {
      const run=verify(request.headers.get('authorization')?.replace('Bearer ',''));
      if(run.type!=='run') throw Error('Run authorization required');
      if(path==='/upload-ticket') {const b=await request.json();if(!documents[b.kind])throw Error('Unknown document kind');return Response.json({token:sign({...b,runId:run.runId,type:'upload-ticket',mimeType:b.type,expires:run.expires})});}
      if(path==='/upload') {const t=verify(url.searchParams.get('ticket'));if(t.type!=='upload-ticket'||t.runId!==run.runId)throw Error('Wrong upload');const bytes=Buffer.from(await request.arrayBuffer());if(bytes.length>1024*1024)throw Error('Too large');return Response.json({token:sign({type:'uploaded',runId:run.runId,kind:t.kind,name:t.name,mimeType:t.mimeType,size:bytes.length,sha256:sha(bytes)})});}
      if(path==='/upload-commit') {const b=await request.json(),v=verify(b.receipt);if(v.type!=='uploaded'||v.runId!==run.runId)throw Error('Upload missing');return Response.json({token:sign({...v,type:'committed'})});}
      const b=await request.json();const files=Object.fromEntries(['resume','portfolio'].map(kind=>{const f=verify(b.files?.[kind]);if(f.type!=='committed'||f.runId!==run.runId||f.kind!==kind||f.sha256!==sha(documents[kind].buffer))throw Error('Attachment bytes differ');return [kind,f];}));
      for(const key of ['name','email','phone','country','city','experience','sponsorship','answer']) if(b[key]!==candidate[key])throw Error('Unexpected synthetic field: '+key);
      if(b.newsletter||b.consent!==true)throw Error('Consent mismatch');
      const receipt={type:'submission',runId:run.runId,receivedAt:new Date().toISOString(),fields:{...b,files:undefined},files};
      console.log(JSON.stringify({event:'synthetic_application_received',runId:run.runId,files:Object.values(files).map(f=>({name:f.name,sha256:f.sha256,size:f.size}))}));
      return Response.json({receipt,signature:sign(receipt)});
    } catch(e) {return Response.json({error:e.message},{status:400});}
  }
  return new Response('Not found',{status:404});
}
