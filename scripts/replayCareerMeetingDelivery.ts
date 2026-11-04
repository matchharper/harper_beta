import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { resolve, relative } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { renderReplyEmail } from "../src/lib/email/runtime/format";

// Replay captured synthetic model output through the actual outbox SQL and
// email renderer. No environment loading, HTTP transport, or production DB.
globalThis.fetch = async () => { throw new Error("Delivery replay has no network transport"); };
const root = realpathSync("docs/evaluation/career-meeting-schedules/runs");
const directory = realpathSync(process.argv[2]);
assert.ok(relative(root, directory) && !relative(root, directory).startsWith(".."));
const trace = JSON.parse(readFileSync(resolve(directory, "chain_reminder.json"), "utf8"));
assert.equal(trace.scenario.id, "chain_reminder");
assert.ok(trace.passed && trace.emails.length === 1);
const fixturePath = "src/lib/career/background/migration.test.ts";
const fixtureSource = readFileSync(fixturePath, "utf8");
// Reuse the existing migration-test fixture verbatim; do not copy the runtime
// SQL or create a second schema fixture which can drift independently.
const fixture = fixtureSource.match(/await db\.exec\(`([\s\S]*?)`\);/)?.[1];
assert.ok(fixture && !fixture.includes("${"), "Expected literal migration-test DDL");
const migrations = [
  "supabase/migrations/20261029215555_career_background_agent_delivery.sql",
  "supabase/migrations/20261102084400_career_meeting_delivery_admission.sql",
];
const user = "00000000-0000-4000-8000-000000000001";
const conversation = "00000000-0000-4000-8000-000000000002";
const appointment = "00000000-0000-4000-8000-000000000004";
const result: any = { sourceRun: relative(root, directory), transport: "local capture; no provider request", cases: [] };
const sha = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
result.hashes = Object.fromEntries([fixturePath, ...migrations, "src/lib/email/runtime/format.ts", "scripts/replayCareerMeetingDelivery.ts"].map(file => [file, sha(file)]));

async function main() {
  const rendered = await renderReplyEmail(trace.emails[0].body, { footer: true });
  writeFileSync(resolve(directory, "reminder-email.html"), rendered.html, { mode: 0o600 });
  writeFileSync(resolve(directory, "reminder-email.txt"), rendered.text, { mode: 0o600 });
  for (const lateChange of [false, true]) {
    const db = new PGlite();
    try {
      await db.exec(fixture!);
      for (const file of migrations) await db.exec(readFileSync(file, "utf8"));
      const run = crypto.randomUUID();
      await db.query("insert into talent_users values($1)", [user]);
      await db.query("insert into talent_conversations values($1,$2)", [conversation,user]);
      await db.query("insert into talent_messages(user_id,conversation_id,role,content) values($1,$2,'user','면접 일정과 리마인드를 챙겨줘')", [user,conversation]);
      await db.query("insert into meeting_schedules values($1,$2,1)", [appointment,user]);
      await db.query("insert into opportunity_discovery_run(id,talent_id,conversation_id,status,trigger,lease_token,trigger_payload) values($1,$2,$3,'running','career_schedule','synthetic-worker','{\"runContract\":\"career_agent_v1\"}')", [run,user,conversation]);
      const accepted = (await db.query<any>("select accept_career_agent_run($1,'synthetic-worker',$2) r", [run,conversation])).rows[0].r;
      const reply = accepted.trigger_payload.agentInvocation.replyId;
      await db.query("insert into talent_agent_runtime values($1,$2,$3)", [conversation,user,{activeReply:{replyId:reply,claimId:"synthetic-agent",expiresAt:new Date(Date.now()+60000).toISOString()}}]);
      const emailPayload = {from:"Harper <harper@example.test>",to:"candidate@example.test",subject:trace.emails[0].subject,...rendered,idempotencyKey:`career-agent/${run}`};
      const payload = {emailPayload,bodyMarkdown:trace.emails[0].body,sourceMessageCursor:1,meetingScheduleVersions:{[appointment]:1}};
      const reserve = async (body: unknown) => (await db.query<any>("select reserve_career_agent_email($1,$2,$3,$4,'synthetic-agent',$5) r", [user,conversation,run,reply,body])).rows[0].r;
      const delivery = await reserve(payload);
      const duplicate = await reserve({...payload,bodyMarkdown:"Attempted rewrite"});
      assert.equal(delivery.id, duplicate.id);
      assert.equal(duplicate.payload.bodyMarkdown, payload.bodyMarkdown);
      await db.query("select claim_career_agent_email($1,'capture-sender')", [delivery.id]);
      if (lateChange) await db.query("update meeting_schedules set version=2 where id=$1", [appointment]);
      const allowed = (await db.query<any>("select begin_career_agent_email_attempt($1,'capture-sender') allowed", [delivery.id])).rows[0].allowed;
      assert.equal(allowed, !lateChange);
      let capturedRequests = 0;
      if (allowed) {
        capturedRequests++;
        // A deterministic local receipt stands in for the external provider.
        await db.query("select record_career_agent_email_receipt($1,$2,'local-capture-receipt')", [delivery.id,emailPayload.idempotencyKey]);
        await db.query("select finish_career_agent_email($1)", [delivery.id]);
        await db.query("select finish_career_agent_email($1)", [delivery.id]);
        const reclaimed = (await db.query<any>("select claim_career_agent_email($1,'capture-retry') r", [delivery.id])).rows[0].r;
        assert.equal(reclaimed.status, "sent");
      }
      const stored = (await db.query<any>("select * from talent_opportunity_delivery where id=$1", [delivery.id])).rows[0];
      const history = (await db.query<any>("select subject,body_text from career_email_messages")).rows;
      assert.equal(stored.status, lateChange ? "context_changed" : "sent");
      assert.equal(history.length, lateChange ? 0 : 1);
      if (!lateChange) {
        assert.equal(history[0].subject, trace.emails[0].subject);
        assert.equal(history[0].body_text, rendered.text);
      } else assert.equal(stored.payload.firstProviderAttemptAt, undefined);
      result.cases.push({lateChange,passed:true,status:stored.status,capturedRequests,historyRows:history.length,sealedBodyPreserved:true});
    } finally { await db.close(); }
  }
  writeFileSync(resolve(directory, "delivery-replay.json"), JSON.stringify(result,null,2)+"\n", {mode:0o600});
  console.log(JSON.stringify(result.cases));
}
main().catch(error => { console.error(error); process.exitCode=1; });
