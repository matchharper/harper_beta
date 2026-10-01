import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { root,state,privateDir,readJson,writeJson,stackEnv } from "./env.mjs";

const {env,config}=stackEnv();
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const p=path.join(privateDir,"fixture.json");
let f=readJson(p);
if(!f){
  f={};for(const key of ["candidateId","companyUserId","workspaceId","roleId","introId","selectionRunId","stageId","conversationId","channelRowId"])f[key]=crypto.randomUUID();
  writeJson(p,f);
}
for(const [key,email] of [["candidateId","khj605123@gmail.com"],["companyUserId","daniel@matchharper.com"]]){
  const found=await admin.auth.admin.getUserById(f[key]);
  if(!found.data.user){const {data,error}=await admin.auth.admin.createUser({id:f[key],email,email_confirm:true,password:crypto.randomBytes(24).toString("base64url"),user_metadata:{localE2e:true}});if(error)throw error;f[key]=data.user.id;writeJson(p,f);}
  const {error:metadataError}=await admin.auth.admin.updateUserById(f[key],{user_metadata:{localE2e:true,full_name:key==="candidateId"?"김하준":"박서윤"}});if(metadataError)throw metadataError;
}
async function slack(method,params={}){
  const r=await fetch(`https://slack.com/api/${method}`,{method:"POST",headers:{authorization:`Bearer ${env.SLACK_HARPER_LOCAL_BOT_TOKEN}`,"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});const d=await r.json();if(!d.ok)throw Error(`Local Slack ${method}: ${d.error}`);return {...d,grantedScopes:(r.headers.get('x-oauth-scopes')||'').split(',').filter(Boolean)};
}
const auth=await slack("auth.test");
const channel=(await slack("conversations.info",{channel:env.HARPER_LOCAL_ONLY_CHANNEL_ID})).channel;
if(!channel.is_member)await slack("conversations.join",{channel:channel.id});
const key=crypto.createHash("sha256").update(config.secret).digest();const iv=crypto.randomBytes(12);
const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);const encrypted=Buffer.concat([cipher.update(env.SLACK_HARPER_LOCAL_BOT_TOKEN,"utf8"),cipher.final()]);
f.slack={team_id:auth.team_id,team:auth.team,user_id:auth.user_id,app_id:env.SLACK_HARPER_LOCAL_APP_ID,channel_id:channel.id,channel_name:channel.name,encrypted_token:`v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`};writeJson(p,f);
f.slack.scopes=auth.grantedScopes;f.slack.is_private=channel.is_private;writeJson(p,f);
if(channel.is_private&&!auth.grantedScopes.includes('groups:history'))console.warn('Slack private-channel replies need groups:history + message.groups on Harper Local; mentions alone are available.');
execFileSync(path.join(state,"venv/bin/python"),[path.join(root,"scripts/localE2e/database.py"),"seed"],{env,stdio:"inherit"});
const links={};for(const [name,email,next] of [["company","daniel@matchharper.com","/org"],["candidate","khj605123@gmail.com","/career"]]){
  const {data,error}=await admin.auth.admin.generateLink({type:"magiclink",email,options:{redirectTo:`http://localhost:3000/auths/callback?next=${next}`}});if(error)throw error;links[name]=data.properties.action_link;
}
writeJson(path.join(privateDir,"login-links.json"),links);
console.log(JSON.stringify({roleId:f.roleId,introId:f.introId,slackChannel:channel.name,loginLinks:".local/full-stack/private/login-links.json",syntheticProfile:true},null,2));
