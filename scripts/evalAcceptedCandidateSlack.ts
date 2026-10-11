/** Frozen-model replay -> atomic local storage -> actual Harper-only Slack UI.
 * Requires the existing isolated local stack and Harper Local Socket Mode app.
 */
import path from "node:path";
import crypto from "node:crypto";
import Module from "node:module";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { stackEnv, readJson, writeJson, privateDir, root, worker } from "./localE2e/env.mjs";
import { assertLocalStack } from "./localE2e/isolation.mjs";

const originalLoad = (Module as any)._load;
(Module as any)._load = function(name: string, ...args: unknown[]) {
  return name === "server-only" ? {} : originalLoad.call(this, name, ...args);
};

async function main() {
  const [mode, runId] = process.argv.slice(2);
  if (!/^[a-z\d-]+$/.test(runId ?? "")) throw new Error("A registered model run ID is required");
  const env = stackEnv().env as NodeJS.ProcessEnv & Record<string, string>;
  const channelId = "C0BULQ5K5EJ";
  Object.assign(env, { APP_BASE_URL:"http://localhost:3017", NEXT_PUBLIC_APP_URL:"http://localhost:3017",
    NEXT_PUBLIC_SITE_URL:"http://localhost:3017", HARPER_LOCAL_APP_ORIGIN:"http://localhost:3017",
    HARPER_LOCAL_ONLY_CHANNEL_ID:channelId });
  Object.assign(process.env, env);
  assertLocalStack(env);
  const runDir = path.join(root,"docs/evaluation/company-first-talent-selection/runs",runId);
  const fixtureFile = path.join(runDir,"local-slack-fixture.json");
  const baseline = readJson(path.join(privateDir,"fixture.json"));
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
  const must = (result: any) => { if (result.error) throw result.error; return result.data; };
  async function slack(method: string, params: Record<string,string>={}) {
    const response = await fetch(`https://slack.com/api/${method}`, {method:"POST",headers:{Authorization:`Bearer ${env.SLACK_HARPER_LOCAL_BOT_TOKEN}`,
      "Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});
    const result = await response.json();
    if (!result.ok) throw new Error(`Slack ${method}: ${result.error}`);
    return result;
  }
  const auth = await slack("auth.test");
  const {channel} = await slack("conversations.info",{channel:channelId});
  if (auth.team_id !== "T09ASGLN207" || channel.name !== "qa" || channel.is_shared || !channel.is_member)
    throw new Error("Only the existing private Harper #qa channel is authorized");
  let fixture = readJson(fixtureFile);
  if (mode === "prepare") {
    const modelManifest = readJson(path.join(runDir,"manifest.json"));
    if (modelManifest?.status !== "complete" || !modelManifest.results.every((row:any)=>row.passed))
      throw new Error("Complete and inspect the frozen model run first");
    // Older local stacks may predate this Role flag. This never touches a remote DB.
    execFileSync(path.join(worker,"venv/bin/python"),["-c",`import os,psycopg
c=psycopg.connect(os.environ["DATABASE_URL"])
with c:
 if c.execute("select id from local_e2e.environment").fetchall()!=[("harper-local-e2e",)]:raise RuntimeError("Local marker missing")
 c.execute("alter table company_internal_roles add column if not exists is_harper_tailored_role boolean")
 c.execute("notify pgrst, 'reload schema'")`],{env,stdio:"inherit"});
    for (let attempt=0;attempt<10;attempt++) {
      const probe=await admin.from("company_internal_roles").select("is_harper_tailored_role").limit(0);
      if (!probe.error) break;
      if (probe.error.code!=="PGRST204" && probe.error.code!=="PGRST200") throw probe.error;
      if (attempt===9) throw probe.error;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    const data = readJson(path.join(root,"docs/evaluation/company-first-talent-selection/cases-accepted-v2.json"));
    const decisions = readJson(path.join(runDir,"scheduled-output.json")).decisions;
    fixture ??= {workspaceId:baseline.workspaceId, roleId:crypto.randomUUID(), runId:crypto.randomUUID(),
      leaseId:crypto.randomUUID(), channelId, teamId:auth.team_id, talents:{},recommendations:{},candidates:{}} as any;
    writeJson(fixtureFile,fixture);
    for (const item of data.cases) {
      if (fixture.talents[item.packet.talent_id]) continue;
      const user = must(await admin.auth.admin.createUser({email:`accepted-${fixture.runId}-${item.id}@example.invalid`,
        email_confirm:true,password:crypto.randomBytes(24).toString("base64url"),user_metadata:{localE2e:true}})).user;
      fixture.talents[item.packet.talent_id] = user.id;
      fixture.recommendations[item.packet.talent_id] = Object.keys(item.packet.accepted_recommendations).length ? crypto.randomUUID() : undefined;
      must(await admin.from("talent_users").insert({user_id:user.id,email:user.email,name:`합성 후보 ${item.id}`,headline:item.packet.company_visible_headline,
        bio:item.packet.profile_text,resume_text:item.packet.profile_text,location:"서울"}));
      must(await admin.from("talent_setting").insert({user_id:user.id,is_onboarding_done:true,profile_visibility:"open_to_matches",
        get_internal_recommendation:true,get_external_recommendation:false,status:"stopped"}));
      must(await admin.from("talent_experiences").insert({talent_id:user.id,company_name:"Synthetic Product Co",role:"Backend Engineer",
        description:item.packet.profile_text,start_date:"2020-10-01"}));
      for (const [index,content] of item.packet.search_brief.entries())
        must(await admin.from("talent_contexts").insert({talent_id:user.id,ref:index+1,collection:"brief",label:`희망 업무 ${index+1}`,content}));
      writeJson(fixtureFile,fixture);
    }
    const information = {testOnly:true,testFixture:"accepted-slack-v2",testTalentIds:Object.values(fixture.talents)};
    const previousRole = must(await admin.from("company_roles").select("information,company_workspace_id").eq("role_id",fixture.roleId).maybeSingle());
    if (previousRole && (previousRole.company_workspace_id!==fixture.workspaceId || previousRole.information?.testFixture!=="accepted-slack-v2" || previousRole.information?.testOnly!==true))
      throw new Error("Refusing to overwrite an unrelated Role");
    if (!previousRole) must(await admin.from("company_roles").insert({role_id:fixture.roleId,company_workspace_id:fixture.workspaceId,
      name:data.role.name,source_type:"internal",status:"active",information,description:data.role.description,
      location_text:data.role.location,work_mode:data.role.work_mode}));
    must(await admin.from("company_internal_roles").update({request:data.role.request,criteria:data.role.criteria,
      is_company_first_search:false,is_harper_tailored_role:false}).eq("role_id",fixture.roleId));
    must(await admin.from("company_role_assignees").upsert({role_id:fixture.roleId,company_user_id:baseline.companyUserId}));
    fixture.channelRowId = must(await admin.from("company_slack_channels").select("id").eq("company_workspace_id",fixture.workspaceId).eq("slack_channel_id",channelId).single()).id;
    const stages = must(await admin.from("ops_matching_role_stages").select("id").eq("role_id",fixture.roleId));
    if (!stages.length) must(await admin.from("ops_matching_role_stages").insert({id:crypto.randomUUID(),role_id:fixture.roleId,label:"첫 대화"}));
    for (const item of data.cases) {
      const id = fixture.recommendations[item.packet.talent_id];
      if (!id) continue;
      const existing = must(await admin.from("talent_opportunity_recommendation").select("id").eq("id",id).maybeSingle());
      if (existing) continue;
      must(await admin.from("talent_opportunity_recommendation").insert({id,talent_id:fixture.talents[item.packet.talent_id],role_id:fixture.roleId,
        opportunity_type:"internal_recommendation",feedback:"like",feedback_at:"2026-10-06T00:00:00Z",saved_stage:"connected",fit_summary:"Synthetic frozen acceptance"}));
      must(await admin.from("talent_opportunity_tag").insert({talent_id:fixture.talents[item.packet.talent_id],opportunity_id:fixture.roleId,tag:"내부:수락"}));
    }
    for (const decision of decisions) fixture.candidates[decision.candidate_id] ??= crypto.randomUUID();
    if (!must(await admin.from("company_first_search_runs").select("id").eq("id",fixture.runId).maybeSingle()))
      must(await admin.from("company_first_search_runs").insert({id:fixture.runId,company_workspace_id:fixture.workspaceId,scheduled_slot:new Date().toISOString(),status:"running",lease_token:fixture.leaseId}));
    writeJson(fixtureFile,fixture);
    // Apply only the local schema columns required by the real storage writer.
    const migrate = `import os, pathlib, psycopg
c=psycopg.connect(os.environ["DATABASE_URL"])
with c:
 if c.execute("select id from local_e2e.environment").fetchall()!=[("harper-local-e2e",)]:raise RuntimeError("Local marker missing")
 base=pathlib.Path(${JSON.stringify(path.join(root,"supabase/migrations"))})
 if not c.execute("select 1 from information_schema.columns where table_name='talent_opportunity_fit' and column_name='input_fingerprint'").fetchone():c.execute((base/'20261007120000_unified_talent_role_fit.sql').read_text())
 c.execute((base/'20261007122000_unified_matching_selection.sql').read_text().split('create or replace function')[0].replace('begin;',''))
 # A test-only Role must have no fit row. Production runs provide this from the fit owner.
 c.execute("alter table talent_opportunity_matching_review alter column input_fingerprint drop not null")
 for name,col in [('20261008071515_company_presentation_final_fit.sql','final_fit'),('20261008073244_company_presentation_tldr_harper_note.sql','tldr')]:
  if not c.execute("select 1 from information_schema.columns where table_name='talent_opportunity_matching_review' and column_name=%s",(col,)).fetchone():c.execute((base/name).read_text())
 if not c.execute("select 1 from information_schema.columns where table_name='company_first_slack_outbox' and column_name='delivery_kind'").fetchone():c.execute((base/'20261008080311_accepted_candidate_role_review.sql').read_text().split('create or replace function')[0].replace('begin;',''))
 c.execute("alter table talent_progress add column if not exists open_to_company boolean default false")
 c.execute("notify pgrst, 'reload schema'")
print('Required storage schema verified in local database only')`;
    execFileSync(path.join(worker,"venv/bin/python"),["-c",migrate],{env,stdio:"inherit"});
    execFileSync(path.join(worker,"venv/bin/python"),[path.join(worker,"llm_evals/company_first_talent_selection/replay_accepted_local.py"),"--fixture",fixtureFile,"--run-dir",runDir],{env,stdio:"inherit"});
    console.log(JSON.stringify({prepared:true,localOnly:true}));
    return;
  }
  if (!fixture?.connectedCandidateIds?.length) throw new Error("Prepare and persist the local fixture first");
  const {loadSlackCandidateCards,sendSlackCandidateResult} = await import("../src/lib/org/slackCandidateWorkObject.server");
  const {slackCandidatePartsFromBlocks} = await import("../src/lib/org/slackCandidateWorkObject");
  const outbox = must(await admin.from("company_first_slack_outbox").select("*").eq("id",fixture.outboxId).single());
  const candidates = await loadSlackCandidateCards({candidateIds:fixture.connectedCandidateIds,workspaceId:fixture.workspaceId});
  const receipts = readJson(path.join(runDir,"local-slack-receipts.json")) ?? {};
  if (mode === "scopes") {
    const {getHarperSlackGrantedScopes} = await import("../src/lib/org/slackHarper");
    console.log(JSON.stringify({grantedScopes:await getHarperSlackGrantedScopes(fixture.workspaceId)}));
    return;
  }
  if (mode === "native") {
    // A visual probe only: does not weaken the normal sender's optional-scope guard.
    // The normal sender above must be exercised first and its receipt preserved.
    const rootReceipt = Object.values(receipts)[0] as any;
    if (!rootReceipt?.slackMessageTs || candidates.length!==1) throw new Error("Send the canonical result first");
    const probeFile=path.join(runDir,"local-slack-channel-probe.json");
    const previousProbe = readJson(probeFile);
    if (previousProbe?.ts) {
      console.log(JSON.stringify({alreadyPosted:true,channel:"qa",messageTs:previousProbe.ts}));
      return;
    }
    const {postHarperSlackMessage,buildHarperSlackClientMessageId} = await import("../src/lib/org/slackHarper");
    const {buildSlackCandidateEntity} = await import("../src/lib/org/slackCandidateWorkObject");
    const posted=await postHarperSlackMessage({channelId,token:env.SLACK_HARPER_LOCAL_BOT_TOKEN,
      clientMessageId:buildHarperSlackClientMessageId(`local-accepted-channel-card:${fixture.runId}`,channelId),
      text:"로컬 QA · 합성 후보의 카드와 상세 내용 확인",
      entityMetadata:{entities:[buildSlackCandidateEntity({candidate:candidates[0],locale:"ko"})]}});
    writeJson(probeFile,{ts:posted.ts,channelId});
    console.log(JSON.stringify({posted:true,channel:"qa",nativeMetadataRequested:true,messageTs:posted.ts}));
    return;
  }
  if (mode === "send") {
    const sent = await sendSlackCandidateResult({text:outbox.message_text,blocks:outbox.blocks,
      parts:[{candidateId:null,text:"*로컬 QA · 합성 후보*\n실제 후보 추천이나 연락이 없는 테스트예요."},
        ...slackCandidatePartsFromBlocks(outbox.blocks,candidates)!], candidates,workspaceId:fixture.workspaceId,
      channelId,roleId:fixture.roleId,locale:"ko",idempotencyKey:`local-accepted:${fixture.runId}`,
      receipts,onReceipt:async value=>writeJson(path.join(runDir,"local-slack-receipts.json"),value)});
    if (!sent) throw new Error("No Slack destination was delivered");
    const {recordAcceptedCandidateDelivery} = await import("../src/lib/companyFirstSearch/acceptedDelivery");
    await recordAcceptedCandidateDelivery(admin,outbox,"sent");
    must(await admin.from("company_first_slack_outbox").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",outbox.id));
    console.log(JSON.stringify({sent:true,channel:"qa",localOnly:true,posts:Object.keys(receipts).length,
      link:`https://app.slack.com/client/${auth.team_id}/${channelId}/thread/${channelId}-${Object.values(receipts)[0] && (Object.values(receipts)[0] as any).slackMessageTs}`}));
    return;
  }
  if (mode === "verify") {
    const before = Object.keys(receipts).length;
    const posts = [];
    try {
      const response = await slack("conversations.replies",{channel:channelId,ts:(Object.values(receipts)[0] as any)?.slackMessageTs});
      posts.push(...response.messages);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.endsWith(": missing_scope")) throw error;
      console.log(JSON.stringify({recordedPosts:before,apiReadUnavailable:"missing_scope",requiresRenderedUiReview:true}));
      return;
    }
    writeJson(path.join(runDir,"local-slack-visible-posts.json"),posts);
    console.log(JSON.stringify({recordedPosts:before,verifiedPosts:posts.length,threadRoots:[...new Set(posts.map((post:any)=>post.thread_ts||post.ts))]}));
    return;
  }
  throw new Error("Use prepare|send|verify|scopes|native");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
