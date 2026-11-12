import assert from "node:assert/strict";
import { test } from "node:test";
import { deliverInternalHiringNotification } from "./internalHiringNotifications";
import { internalHiringNotificationText, type InternalHiringFacts } from "./internalHiringNotificationText";
import { dispatchInternalHiringNotification } from "./internalHiringNotificationDispatch";

const facts: InternalHiringFacts = {
  workspaceId: "workspace", companyName: "Example VC", roleId: "role", roleName: "Associate",
  talentId: "talent", talentName: "Candidate", actor: "Jay", actorEmail: "jay@example.invalid",
  action: "company_connection_declined", occurredAt: "2026-11-11T01:00:00Z", details: { notifyCandidate: true },
};

test("internal lines distinguish decision, delivery and meeting time without Slack injection", () => {
  const line = internalHiringNotificationText(facts);
  assert.match(line,/Example VC \/ Associate/);
  assert.match(line,/Candidate \| Jay\(jay@example.invalid, 회사\) \| 회사에서 후보자 연결 거절 — 후보자 종료 안내 예정/);
  assert.match(line,/2026-11-11 10:00 KST$/);
  assert.doesNotMatch(line,/\n/);
  const request = internalHiringNotificationText({...facts,action:"intro_requested"});
  assert.match(request,/Intro 요청 — 발송 전/);
  const email = internalHiringNotificationText({...facts,action:"connection_email_sent",actor:"Harper 시스템",actorEmail:null});
  assert.match(email,/소개 이메일 발송 완료/);
  const meeting = internalHiringNotificationText({...facts,action:"meeting_rescheduled",details:{
    previousStartsAt:"2026-11-12T01:00Z",startsAt:"2026-11-12T03:00Z",timezone:"Asia/Seoul",organizer:"Jay",
  }});
  assert.match(meeting,/2026-11-12 10:00 → 2026-11-12 12:00 \(Asia\/Seoul\)/);
  assert.match(meeting,/주최 Jay/);
  const escaped=internalHiringNotificationText({...facts,talentName:"<@U123>\n<!channel>",actor:"x\ny"});
  assert.doesNotMatch(escaped,/[\n\r]|<@|<!/);
  assert.throws(()=>internalHiringNotificationText({...facts,action:'unknown'}));
});

function fixture() {
  const row:any = {id:"notice",facts,sent_at:null,attempt_after:new Date(0).toISOString(),lease_id:null};
  const admin={from(table:string) {
    assert.equal(table,"internal_hiring_notifications");
    let changes:any={}; const filters:Array<()=>boolean>=[];
    const run=()=>{ if(!filters.every(f=>f())) return {data:null,error:null}; Object.assign(row,changes); return {data:{...row},error:null}; };
    return {
      update(v:any) {changes=v;return this;}, eq(k:string,v:any) {filters.push(()=>row[k]===v);return this;},
      is(k:string,v:any) {filters.push(()=>row[k]===v);return this;},
      lte(k:string,v:any) {filters.push(()=>row[k]<=v);return this;}, select(){return this;},
      async maybeSingle(){return run();}, then(resolve:any,reject:any){return Promise.resolve(run()).then(resolve,reject);},
    };
  }};
  return {row,admin};
}

test("concurrent recovery posts once to the internal channel and records the receipt", async () => {
  process.env.SLACK_BOT_TOKEN="test-token";
  const f=fixture(), posts:any[]=[];
  const send:typeof fetch=async(url,init)=>{
    assert.equal(url,"https://slack.com/api/chat.postMessage");
    posts.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ok:true,ts:"123.456"}));
  };
  const results=await Promise.all([deliverInternalHiringNotification(f.admin,"notice",send),deliverInternalHiringNotification(f.admin,"notice",send)]);
  assert.deepEqual(results.sort(),["sent","skipped"]);
  assert.equal(posts.length,1);
  assert.equal(posts[0].channel,"C0AKK93FMH8");
  assert.equal(f.row.slack_ts,"123.456");
  assert.ok(f.row.sent_at);
  await deliverInternalHiringNotification(f.admin,"notice",send);
  assert.equal(posts.length,1);
});

test("Slack failures remain retryable; retries reuse the same provider message identity", async () => {
  process.env.SLACK_BOT_TOKEN="test-token";
  const f=fixture(), ids:string[]=[];
  const send:typeof fetch=async(_url,init)=>{
    ids.push(JSON.parse(String(init?.body)).client_msg_id);
    return new Response(JSON.stringify(ids.length===1?{ok:false,error:"ratelimited"}:{ok:true,ts:"1.2"}));
  };
  assert.equal(await deliverInternalHiringNotification(f.admin,"notice",send),"retry");
  assert.equal(f.row.sent_at,null);
  assert.match(f.row.last_error,/ratelimited/);
  assert.equal(await deliverInternalHiringNotification(f.admin,"notice",send),"skipped");
  f.row.attempt_after=new Date(0).toISOString();
  assert.equal(await deliverInternalHiringNotification(f.admin,"notice",send),"sent");
  assert.equal(ids[0],ids[1]);
});

test("test-only runs never claim or post production notifications",async()=>{
  const f=fixture(); process.env.HARPER_LOCAL_E2E="1";
  try {
    assert.equal(await deliverInternalHiringNotification(f.admin,"notice",async()=>{throw new Error('must not post');}),"isolated");
    assert.equal(f.row.lease_id,null);
  } finally {delete process.env.HARPER_LOCAL_E2E;}
});

test("committed-event webhook sends immediately without cron and duplicate webhooks do not resend", async () => {
  process.env.SLACK_BOT_TOKEN="test-token";
  const f=fixture();
  f.row.id="11111111-1111-4111-8111-111111111111";
  f.row.dispatch_token="22222222-2222-4222-8222-222222222222";
  const posts:any[]=[];
  const send:typeof fetch=async(_url,init)=>{
    posts.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ok:true,ts:"immediate-receipt"}));
  };
  const request=()=>new Request("http://localhost/api/internal/slack/hiring-notification",{
    method:"POST",body:JSON.stringify({id:f.row.id,token:f.row.dispatch_token,text:"forged",channel:"other-channel"}),
  });
  const deliver=(admin:any,id:string)=>deliverInternalHiringNotification(admin,id,send);
  const response=await dispatchInternalHiringNotification(request(),()=>f.admin,deliver);
  assert.equal(response.status,200);
  assert.equal(posts.length,1,"delivery happened during webhook handling, without running recovery");
  assert.equal(f.row.slack_ts,"immediate-receipt");
  assert.equal(posts[0].channel,"C0AKK93FMH8");
  assert.notEqual(posts[0].text,"forged");
  await dispatchInternalHiringNotification(request(),()=>f.admin,deliver);
  assert.equal(posts.length,1);
});

test("webhook requires the event's own secret before it can claim or deliver anything",async()=>{
  const f=fixture(); f.row.id="11111111-1111-4111-8111-111111111111";
  f.row.dispatch_token="22222222-2222-4222-8222-222222222222";
  for(const body of [{id:f.row.id},{id:f.row.id,token:"33333333-3333-4333-8333-333333333333"},
    {id:"44444444-4444-4444-8444-444444444444",token:f.row.dispatch_token}]) {
    const response=await dispatchInternalHiringNotification(new Request("http://localhost",{method:"POST",body:JSON.stringify(body)}),()=>f.admin,
      async()=>{throw new Error('unauthorized dispatch');});
    assert.ok([400,403].includes(response.status));
    assert.equal(f.row.lease_id,null);
  }
});
