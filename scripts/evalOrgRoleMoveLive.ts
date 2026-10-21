/**
 * Explicitly authorized production fixture verification. Uses actual relay,
 * company-side event processor, DB mutations and Slack delivery; no tool adapter.
 * The UI creates requests. This runner injects a dedicated test-account answer.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

process.umask(0o077);
const root = process.cwd();
const task = path.join(root, "docs/evaluation/company-side-conversational-qa");
const command = process.argv[2];
const option = (name: string) =>
  process.argv
    .find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const run = option("run");
if (!run || !/^[a-z0-9-]+$/.test(run))
  throw Error("Explicit private run required");
if (!process.argv.includes("--allow-production-fixture"))
  throw Error("Explicit authorization for the production fixture is required");
const dir = path.join(task, "runs", run);
const fixture = JSON.parse(
  readFileSync(path.join(dir, "fixture.json"), "utf8")
);
const specText = readFileSync(
  path.join(task, "role-move-live-v1.json"),
  "utf8"
);
const spec = JSON.parse(specText);
assert.equal(fixture.fixture, spec.fixture);
const roleIds = [fixture.sourceRoleId, fixture.targetRoleId];
const save = (name: string, value: unknown) =>
  writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
  });
config({ path: path.join(root, ".env.local"), quiet: true });
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
assert.ok(
  ["zzojrniuppueizhnmqfd.supabase.co", "auth.matchharper.com"].includes(host)
);

async function checked(query: any): Promise<any> {
  const result = await query;
  if (result.error) throw result.error;
  return result.data;
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const admin: any = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const workspace = await checked(
    admin
      .from("company_workspace")
      .select("company_workspace_id,company_name,is_internal")
      .eq("company_workspace_id", fixture.workspaceId)
      .single()
  );
  assert.equal(workspace.company_name, "Harper");
  assert.equal(workspace.is_internal, true);
  const talent = await checked(
    admin
      .from("talent_users")
      .select("user_id,email,name")
      .eq("user_id", fixture.talentId)
      .single()
  );
  assert.ok(fixture.talentEmail, "Private fixture email must be recorded");
  assert.equal(talent.email, fixture.talentEmail);
  const roles = await checked(
    admin
      .from("company_roles")
      .select("role_id,company_workspace_id,information,status")
      .in("role_id", roleIds)
  );
  assert.equal(roles.length, 2);
  for (const role of roles) {
    assert.equal(role.company_workspace_id, fixture.workspaceId);
    assert.equal(role.information.testOnly, true);
    assert.equal(role.information.testFixture, fixture.fixture);
    assert.deepEqual(role.information.testTalentIds, [fixture.talentId]);
  }
  const snapshot = async () => {
    const positions = await checked(
      admin
        .from("talent_opportunity_recommendation")
        .select(
          "id,talent_id,role_id,feedback,saved_stage,processed_stage,updated_at"
        )
        .in("role_id", roleIds)
    );
    assert.ok(positions.every((p: any) => p.talent_id === fixture.talentId));
    const fits = await checked(
      admin
        .from("talent_opportunity_fit")
        .select("id")
        .in("opportunity_id", roleIds)
    );
    assert.equal(fits.length, 0);
    const [tags, requests, queues, messages, progress, jobs] =
      await Promise.all([
        checked(
          admin
            .from("talent_opportunity_tag")
            .select("*")
            .in("opportunity_id", roleIds)
        ),
        checked(
          admin
            .from("company_talent_requests")
            .select("*")
            .in("role_id", roleIds)
        ),
        checked(admin.from("contact_queue").select("*").in("role_id", roleIds)),
        checked(
          admin
            .from("company_messages")
            .select("*")
            .in("role_id", roleIds)
            .order("id")
        ),
        checked(
          admin
            .from("talent_progress")
            .select("*")
            .in("role_id", roleIds)
            .order("created_at")
        ),
        checked(
          admin
            .from("company_agent_web_action_jobs")
            .select("*")
            .in("role_id", roleIds)
        ),
      ]);
    const relays = positions.length
      ? await checked(
          admin
            .from("company_talent_relays")
            .select("*")
            .in(
              "recommendation_id",
              positions.map((p: any) => p.id)
            )
        )
      : [];
    const result = {
      capturedAt: new Date().toISOString(),
      positions,
      tags,
      requests,
      queues,
      messages,
      progress,
      jobs,
      relays,
    };
    save(`status-${Date.now()}.json`, result);
    return result;
  };
  if (command === "status") {
    const state = await snapshot();
    console.log(
      JSON.stringify(
        {
          positions: state.positions,
          requests: state.requests.map((r: any) => ({
            id: r.id,
            workflow: r.workflow_status,
          })),
          queues: state.queues.map((q: any) => ({
            id: q.id,
            type: q.type,
            status: q.status,
            sentAt: q.sent_at,
            emailId: q.resend_email_id,
            error: q.last_error,
          })),
          messages: state.messages
            .filter((m: any) => m.role === "assistant")
            .map((m: any) => ({
              id: m.id,
              content: m.content,
              metadata: m.metadata,
            })),
          jobs: state.jobs.map((j: any) => ({
            id: j.id,
            status: j.status,
            error: j.last_error,
          })),
        },
        null,
        2
      )
    );
    return;
  }
  const caseName = option("case");
  if (!caseName || !spec.cases[caseName])
    throw Error("Exact frozen case required");
  if (command === "request") {
    const state = await snapshot();
    const sourceRoleId =
      caseName === "accept" ? fixture.sourceRoleId : fixture.targetRoleId;
    const targetRoleId =
      caseName === "accept" ? fixture.targetRoleId : fixture.sourceRoleId;
    const position = state.positions.find(
      (p: any) => p.role_id === sourceRoleId
    );
    assert.equal(position?.processed_stage, "pending_connection");
    await checked(
      admin
        .from("company_user_workspace")
        .select("company_user_id")
        .eq("company_workspace_id", fixture.workspaceId)
        .eq("company_user_id", fixture.actorId)
        .single()
    );
    // Obtain a real session for the explicitly authorized fixture account.
    // Tokens stay in memory and never enter evidence or console output.
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: talent.email,
    });
    if (link.error) throw link.error;
    const sessionClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const verified = await sessionClient.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.data.properties.hashed_token,
    });
    if (verified.error) throw verified.error;
    assert.equal(verified.data.user?.id, fixture.actorId);
    const response = await fetch(
      "http://localhost:3000/api/org/candidate-role",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${verified.data.session!.access_token}`,
        },
        body: JSON.stringify({
          workspaceId: fixture.workspaceId,
          talentId: fixture.talentId,
          sourceRoleId,
          targetRoleId,
          recommendationId: position.id,
          expectedStage: "pending_connection",
          targetStageId: "pending_connection",
          method: "ask_candidate",
          requestId: randomUUID(),
        }),
      }
    );
    const result = await response.json();
    save(`request-${caseName}.json`, { status: response.status, result });
    assert.equal(response.status, 200, JSON.stringify(result));
    assert.equal(result.status, "requested");
    console.log(result);
    return;
  }
  const recordPath = path.join(dir, `reply-${caseName}.json`);
  if (command === "reply") {
    if (existsSync(recordPath))
      throw Error("Reply already recorded; use retry");
    const state = await snapshot();
    save(`before-${caseName}.json`, state);
    const roleId =
      caseName === "accept" ? fixture.sourceRoleId : fixture.targetRoleId;
    const position = state.positions.find((p: any) => p.role_id === roleId);
    assert.ok(position);
    const request = state.requests
      .filter((r: any) => r.role_id === roleId)
      .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
    assert.ok(request, "Create the request through the actual UI first");
    assert.ok(
      state.queues.some(
        (q: any) =>
          q.company_talent_request_id === request.id &&
          q.type === "company_request_candidate_delivery" &&
          q.status === "sent" &&
          q.sent_at
      ),
      "The actual question must be sent before creating an answer"
    );
    const content = spec.cases[caseName].reply;
    const message = await checked(
      admin
        .from("talent_messages")
        .insert({
          user_id: fixture.talentId,
          role: "user",
          content,
          message_type: "chat",
          payload: { testFixture: fixture.fixture, testRun: run },
        })
        .select("id,created_at")
        .single()
    );
    save(`reply-${caseName}.json`, {
      message,
      roleId,
      recommendationId: position.id,
      requestId: request.id,
      content,
      specSha256: createHash("sha256").update(specText).digest("hex"),
    });
    const { createCompanyTalentRelayRecord } =
      await import("../src/lib/companyTalentRequests/relayRecord");
    const relay = await createCompanyTalentRelayRecord(admin, {
      p_talent_id: fixture.talentId,
      p_source_message_id: message.id,
      p_recommendation_id: position.id,
      p_request_id: null,
      p_relay_content: content,
      p_document_id: null,
    });
    save(`relay-${caseName}.json`, relay);
    // Hold only this fixture's dispatcher entry while the new local runtime
    // owns the test. Otherwise the old deployed runtime can consume the event.
    await checked(
      admin
        .from("contact_queue")
        .update({
          scheduled_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        })
        .eq("company_talent_relay_id", relay.id)
        .eq("status", "queued")
    );
  } else if (command !== "retry") {
    throw Error("Use status, reply or retry");
  }
  const relay = JSON.parse(
    readFileSync(path.join(dir, `relay-${caseName}.json`), "utf8")
  );
  const reply = JSON.parse(readFileSync(recordPath, "utf8"));
  const replyRole = await checked(
    admin
      .from("company_roles")
      .select("name")
      .eq("role_id", reply.roleId)
      .single()
  );
  // The ordinary delivery entry point stores this exact approved correspondence
  // before invoking the processor. Keep the same required delivery contract.
  await checked(
    admin.rpc("store_company_talent_relay_body_v2", {
      p_relay_id: relay.id,
      p_body: `${talent.name} · ${replyRole.name}\n\n${reply.content}`,
    })
  );
  const { enqueueCompanyContactEvent } =
    await import("../src/lib/org/agent/contactEvent.server");
  const { processCompanyAgentWebActionJob } =
    await import("../src/lib/org/agent/webActionProcessor.server");
  const result = await enqueueCompanyContactEvent(
    relay.id,
    fixture.workspaceId
  );
  save(`job-${caseName}.json`, result);
  await checked(
    admin
      .from("company_agent_web_action_jobs")
      .update({
        queue_next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      })
      .eq("id", result.jobId)
      .eq("status", "queued")
  );
  await processCompanyAgentWebActionJob(
    { jobId: result.jobId, kind: "web_action_job", version: 1 },
    { messageId: `local-fixture:${run}:${caseName}` }
  );
  save(`delivery-${caseName}-${Date.now()}.json`, result);
  const state = await snapshot();
  const job = state.jobs.find((j: any) => j.id === result.jobId);
  assert.equal(job?.status, "completed_message");
  const presentations = state.messages.filter(
    (m: any) =>
      m.role === "assistant" && m.metadata?.webActionJobId === result.jobId
  );
  assert.equal(presentations.length, 1);
  assert.equal(presentations[0].metadata.contactEventSlackDelivered, true);
  assert.ok(fixture.slackChannelId, "Private fixture channel must be recorded");
  assert.deepEqual(
    Object.keys(presentations[0].metadata.contactEventSlackPosts),
    [fixture.slackChannelId]
  );
  const positionKey = (rows: any[]) =>
    rows
      .map((p: any) => ({
        id: p.id,
        role: p.role_id,
        stage: p.processed_stage,
        updatedAt: p.updated_at,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  assert.equal(
    state.positions.find((p: any) => p.role_id === fixture.sourceRoleId)
      ?.processed_stage,
    "archived"
  );
  assert.equal(
    state.positions.find((p: any) => p.role_id === fixture.targetRoleId)
      ?.processed_stage,
    "pending_connection"
  );
  if (caseName === "decline") {
    const before = JSON.parse(
      readFileSync(path.join(dir, "before-decline.json"), "utf8")
    );
    assert.deepEqual(
      positionKey(state.positions),
      positionKey(before.positions)
    );
    assert.equal(
      state.queues.filter(
        (q: any) => q.type === "internal_candidate_role_changed"
      ).length,
      before.queues.filter(
        (q: any) => q.type === "internal_candidate_role_changed"
      ).length
    );
  }
  save(`verified-${caseName}.json`, {
    jobId: result.jobId,
    messageId: presentations[0].id,
    slack: presentations[0].metadata.contactEventSlackPosts,
    positions: positionKey(state.positions),
  });
  console.log(
    JSON.stringify(
      {
        result,
        positions: state.positions,
        jobs: state.jobs.map((j: any) => ({
          id: j.id,
          status: j.status,
          error: j.last_error,
        })),
        messages: state.messages
          .filter((m: any) => m.role === "assistant")
          .map((m: any) => ({ id: m.id, content: m.content })),
      },
      null,
      2
    )
  );
}
main().catch((error) => {
  save(`error-${Date.now()}.json`, { message: String(error), error });
  console.error(error);
  process.exitCode = 1;
});
