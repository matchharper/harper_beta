// Resend-compatible local transport. All messages are durably retained in the
// private local mailbox. Gmail mode changes transport addresses, never content.
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { privateDir, sourceEnv, readJson, writeJson } from "./env.mjs";
import { assertLocalStack } from "./isolation.mjs";
assertLocalStack();
const file = path.join(privateDir, "mailbox.json");
const box = readJson(file, { outgoing: {}, incoming: {}, aliases: {}, seen: {}, idempotency: {} });
const save = () => writeJson(file, box);
const config = () => readJson(path.join(privateDir, "config.json"));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const list = x => Array.isArray(x) ? x : x ? [x] : [];
const address = x => String(x || "").match(/<([^>]+)>/)?.[1]?.toLowerCase() || String(x || "").trim().toLowerCase();
const escape = x => String(x ?? "").replace(/[&<>"']/g, x => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[x]));
let gmailState = "not checked";
let verifiedGmail = { accountId: "", at: 0 };
let polling = false;
function allowRecipient(value) {
  if (!config().recipients.includes(address(value))) throw Error("Recipient outside local test allowlist");
}
function mapAlias(value) {
  const a = address(value);
  if (!a.endsWith(`@${process.env.EMAIL_REPLY_DOMAIN}`)) { allowRecipient(a); return a; }
  if (!box.aliases[a]) {
    const c = config(); const [local, domain] = c.mailbox.split("@");
    box.aliases[a] = `${local}+harperlocal.${c.namespace}.${crypto.createHash("sha256").update(a).digest("hex").slice(0,16)}@${domain}`;
    save();
  }
  return box.aliases[a];
}
function canonical(value) {
  const a = address(value);
  return Object.entries(box.aliases).find(([, alias]) => alias === a)?.[0] || a;
}
async function composio(endpoint, body) {
  const response = await fetch(`https://backend.composio.dev/api/v3.1${endpoint}`, {
    method: body ? "POST" : "GET", headers: { "x-api-key": sourceEnv.COMPOSIO_API_KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || data.successful === false) throw Error(`Gmail bridge request failed (${response.status})`);
  return data;
}
async function requireGmail() {
  const c = readJson(path.join(privateDir, "gmail.json"));
  if (!c) throw Error("Gmail connection has not been configured");
  const account = await composio(`/connected_accounts/${c.accountId}`);
  gmailState = account.status;
  if (account.status !== "ACTIVE") throw Error(`Gmail connection is ${account.status}; no real mail sent`);
  if (verifiedGmail.accountId !== c.accountId || Date.now()-verifiedGmail.at > 60000) {
    const result = await composio("/tools/execute/GMAIL_GET_PROFILE", { connected_account_id: c.accountId, user_id: c.owner, version:"20260817_00", arguments:{user_id:"me"} });
    const profile = result.data?.data || result.data;
    if (address(profile?.emailAddress) !== config().mailbox) throw Error("Gmail account does not match the configured local test mailbox");
    verifiedGmail = { accountId:c.accountId, at:Date.now() };
  }
  return c;
}
async function ingest(email, id) {
  allowRecipient(email.from);
  const recipients = [...list(email.to), ...list(email.cc)].map(canonical);
  if (!recipients.some(x => x.endsWith(`@${process.env.EMAIL_REPLY_DOMAIN}`))) throw Error("No local reply alias");
  const normalized = { ...email, to: list(email.to).map(canonical), cc: list(email.cc).map(canonical), id, email_id: id, created_at: email.created_at || new Date().toISOString() };
  box.incoming[id] = normalized; save();
  const payload = JSON.stringify({ type: "email.received", created_at: normalized.created_at, data: normalized });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", Buffer.from(config().webhook, "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
  const r = await fetch(`${process.env.APP_BASE_URL}/api/internal/email/resend`, { method: "POST", body: payload,
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw Error(`Local inbound webhook returned ${r.status}`);
  box.seen[id] = true; save();
  console.log(`Local inbound queued: ${id}`);
}
function mimeBodies(part, result = {}) {
  if (part?.body?.data && ["text/plain", "text/html"].includes(part.mimeType)) {
    result[part.mimeType] = (result[part.mimeType] || "") + Buffer.from(part.body.data, "base64url").toString("utf8");
  }
  for (const child of part?.parts || []) mimeBodies(child, result);
  return result;
}
async function poll() {
  if (polling || config().mailMode !== "gmail" || !Object.keys(box.aliases).length) return;
  polling = true;
  try {
    const c = await requireGmail();
    // Exact generated addresses only: no general inbox synchronization.
    const aliases = Object.values(box.aliases);
    for (let start=0; start<aliases.length; start+=20) {
      let page = "";
      do {
        const response = await composio("/tools/execute/GMAIL_FETCH_EMAILS", { connected_account_id: c.accountId, user_id: c.owner, version: "20260817_00",
          arguments: { user_id: "me", query: `{${aliases.slice(start,start+20).flatMap(x => [`to:${x}`, `cc:${x}`]).join(" ")}}`, max_results: 100, include_payload: true, ...(page ? {page_token:page}: {}) } });
        const data = response.data?.data || response.data;
        if (!Array.isArray(data?.messages)) throw Error("Gmail returned an unexpected message response");
        for (const m of data?.messages || []) {
          const id = `gmail_${m.messageId}`;
          if (box.seen[id]) continue;
          const headers = Object.fromEntries((m.payload?.headers || []).map(x => [x.name.toLowerCase(), x.value]));
          const split = x => String(x || "").split(",").map(address).filter(Boolean);
          const to = split(headers.to || m.to), cc = split(headers.cc);
          if (![...to,...cc].some(x=>aliases.includes(x))) continue;
          // Introduction emails CC the capture alias too. Do not ingest our
          // own outbound mail, or let an unrelated sender block later replies.
          if (!config().recipients.includes(address(headers.from || m.sender))) {
            box.seen[id] = true; save(); continue;
          }
          const bodies = mimeBodies(m.payload);
          await ingest({ from: headers.from || m.sender, to, cc, subject: headers.subject || m.subject,
            message_id: headers["message-id"] || `<${id}@local.invalid>`, headers,
            text: bodies["text/plain"] || m.messageText || "", html: bodies["text/html"] || null }, id);
        }
        page = data?.nextPageToken || "";
      } while (page);
    }
  } catch (error) { gmailState = error.message; console.error(error.message); }
  finally { polling = false; }
}
function htmlPage() {
  const entries = Object.values(box.outgoing).reverse().map(m => `<article><h2>${escape(m.subject)}</h2><p>${escape(m.to)} · ${escape(m.mode)} · ${escape(m.created_at)}</p><iframe sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" srcdoc="${escape(m.html || `<pre>${escape(m.text)}</pre>`)}" style="width:100%;height:400px;border:1px solid #ddd"></iframe><form method="post" action="/reply"><input type="hidden" name="token" value="${escape(config().secret)}"><input type="hidden" name="id" value="${escape(m.id)}"><label>Reply as <select name="from">${config().recipients.map(e=>`<option>${escape(e)}</option>`).join("")}</select></label><br><textarea name="text" rows="4" cols="90" required></textarea><br><button>로컬 이메일 회신 보내기</button></form></article>`).join("<hr>");
  return `<!doctype html><meta charset="utf-8"><title>Harper Local Mail</title><body style="max-width:1000px;margin:30px auto;font-family:system-ui"><h1>Harper Local Mail</h1><p><a href="/login/company">회사 담당자로 로그인</a> · <a href="/login/candidate">후보자로 로그인</a></p><p>Mode: ${escape(config().mailMode)} · Gmail: ${escape(gmailState)}</p><p>로컬 전용 메일함. capture 모드는 실제 이메일을 발송하지 않습니다. 회신은 실제 로컬 이메일 Worker가 처리합니다.</p>${entries || "아직 메일이 없습니다."}</body>`;
}
const server = http.createServer(async (req,res) => {
  try {
    if (!["127.0.0.1:3211", "localhost:3211"].includes(req.headers.host)) {
      res.writeHead(403);return res.end("Local host required");
    }
    const pathname = new URL(req.url, "http://127.0.0.1:3211").pathname;
    const json = (code, data) => {res.writeHead(code,{"content-type":"application/json"}); res.end(JSON.stringify(data));};
    if (req.method === "GET" && ["/login/candidate","/login/company"].includes(pathname)) {
      const candidate=pathname.endsWith("candidate");
      const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email:candidate?"khj605123@gmail.com":"daniel@matchharper.com",options:{redirectTo:`http://localhost:3200/auths/callback?next=${candidate?"/career":"/org"}`}});
      if(error)throw error;res.writeHead(303,{location:data.properties.action_link,"cache-control":"no-store"});return res.end();
    }
    if (req.method === "GET" && pathname === "/health") return json(200,{ok:true,mode:config().mailMode,gmail:gmailState,outgoing:Object.keys(box.outgoing).length,incoming:Object.keys(box.incoming).length});
    if (req.method === "GET" && pathname === "/") { res.writeHead(200,{"content-type":"text/html;charset=utf-8","x-frame-options":"DENY","cache-control":"no-store"}); return res.end(htmlPage()); }
    let raw="";for await (const chunk of req) {raw+=chunk;if(raw.length>5_000_000)throw Error("Mail body too large");}
    if (req.method === "POST" && pathname === "/reply") {
      const form = new URLSearchParams(raw);
      if (form.get("token") !== config().secret) return json(403,{error:"invalid form token"});
      const m=box.outgoing[form.get("id")];if(!m)throw Error("Unknown local message");
      const recipients=list(m.reply_to).length?list(m.reply_to):list(m.cc).filter(x=>address(x).endsWith(`@${process.env.EMAIL_REPLY_DOMAIN}`));
      await ingest({from:form.get("from"),to:recipients,cc:[],subject:`Re: ${m.subject}`,text:form.get("text"),message_id:`<${crypto.randomUUID()}@local.invalid>`,headers:{"In-Reply-To":m.message_id||`<${m.id}@local.invalid>`}},`local_${crypto.randomUUID()}`);
      res.writeHead(303,{location:"/"});return res.end();
    }
    if(req.headers.authorization!==`Bearer ${process.env.RESEND_API_KEY}`)return json(401,{error:"local credentials required"});
    if(req.method==="POST" && pathname==="/emails") {
      const p=JSON.parse(raw);for(const recipient of [...list(p.to),...list(p.bcc),...list(p.cc).filter(x=>!address(x).endsWith(`@${process.env.EMAIL_REPLY_DOMAIN}`))])allowRecipient(recipient);
      if(!list(p.to).length)throw Error("Email recipient required");
      const key=String(req.headers["idempotency-key"]||"");if(key&&box.idempotency[key])return json(200,{id:box.idempotency[key]});
      const mode=config().mailMode;
      let id=crypto.randomUUID();let message_id=`<${id}@local.invalid>`;
      if(mode==="gmail") {
        await requireGmail();
        const sent={...p}; if(p.reply_to)sent.reply_to=list(p.reply_to).map(mapAlias); if(p.cc)sent.cc=list(p.cc).map(mapAlias);
        const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{authorization:`Bearer ${sourceEnv.RESEND_API_KEY}`,"content-type":"application/json",...(key?{"idempotency-key":`local-${config().namespace}-${key}`.slice(0,256)}:{})},body:JSON.stringify(sent),signal:AbortSignal.timeout(30000)});
        const result=await response.json();if(!response.ok)throw Error(`Resend send failed (${response.status})`);id=result.id;message_id=result.message_id;
      }
      box.outgoing[id]={...p,id,message_id,mode,created_at:new Date().toISOString()};if(key)box.idempotency[key]=id;save();return json(200,{id,message_id});
    }
    const receive=pathname.match(/^\/emails\/receiving\/([^/]+)(\/attachments)?$/);
    if(req.method==="GET"&&receive){const m=box.incoming[decodeURIComponent(receive[1])];return m?json(200,receive[2]?{data:[]}:m):json(404,{error:"unknown local inbound"});}
    const sent=pathname.match(/^\/emails\/([^/]+)$/);
    if(req.method==="GET"&&sent){
      const m=box.outgoing[sent[1]];if(!m)return json(404,{error:"unknown local outbound"});
      if(m.mode==="gmail"&&!m.message_id){
        const r=await fetch(`https://api.resend.com/emails/${encodeURIComponent(m.id)}`,{headers:{authorization:`Bearer ${sourceEnv.RESEND_API_KEY}`},signal:AbortSignal.timeout(30000)});
        if(!r.ok)throw Error(`Resend read failed (${r.status})`);
        const remote=await r.json();m.message_id=remote.message_id;save();
      }
      return json(200,m);
    }
    return json(404,{error:"unsupported local mail endpoint"});
  }catch(error){res.writeHead(400,{"content-type":"application/json"});res.end(JSON.stringify({error:error.message}));console.error(error.message);}
});
server.listen(3211,"127.0.0.1",()=>console.log("Local mail: http://127.0.0.1:3211"));
setInterval(poll,15000);await poll();
