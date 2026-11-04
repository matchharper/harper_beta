import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import postgres from "postgres";
import { stackEnv, privateDir } from "./env.mjs";
import {
  sendAgentContact,
  assertAgentContactSource,
  isCareerAgentContactEventCurrent,
  readAgentContacts,
} from "../../src/lib/agentContacts/store";
import { encodeMaterialSelection } from "../../src/lib/agentContacts/contracts";

const { env } = stackEnv();
const url = new URL(env.DATABASE_URL);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
const sql = postgres(env.DATABASE_URL, {
  max: 1,
  prepare: false,
  types: {
    json: {
      to: 114,
      from: [114, 3802],
      serialize: (v: unknown) =>
        typeof v === "string" ? v : JSON.stringify(v),
      parse: JSON.parse,
    },
  },
});
const fixture = JSON.parse(
  fs.readFileSync(path.join(privateDir, "fixture.json"), "utf8")
);
const migration = fs
  .readFileSync(
    "supabase/migrations/20261103125705_internal_role_agent_introductions.sql",
    "utf8"
  )
  .replace(/^begin;/, " ")
  .replace(/commit;\s*$/, " ");
const rollback = new Error("test_rollback");
try {
  await sql.begin(async (tx) => {
    const query = async (text: string, params: any[] = []) =>
      Array.from(await tx.unsafe(text, params));
    const db = {
      query,
      transaction: async <T,>(work: (q: typeof query) => Promise<T>) =>
        tx.savepoint(async (sub) =>
          work(async (text, params = []) =>
            Array.from(await sub.unsafe(text, params))
          )
        ) as Promise<T>,
    };
    // This local snapshot predates a dependency; execute its original DDL inside this rollback-only test.
    const columns = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='company_role_candidate_evaluations' AND column_name='discovery_run_id'"
    );
    if (!columns.length)
      await tx.unsafe(
        fs
          .readFileSync(
            "supabase/migrations/20261026051109_shared_worker_role_evaluations.sql",
            "utf8"
          )
          .split("-- A Role-search selection")[0]
      );
    const [legacy] = await query(
      "SELECT to_regprocedure('public.accepted_role_pair_is_available_v1(uuid)') AS name"
    );
    if (!legacy.name) {
      const original = fs.readFileSync(
        "supabase/migrations/20261023102919_scheduled_agentic_matching.sql",
        "utf8"
      );
      await tx.unsafe(
        original.slice(0, original.indexOf("-- A Role-slot root"))
      );
      await tx.unsafe(
        original.slice(
          original.indexOf(
            "create or replace function public.scheduled_talent_source_fingerprint_v1"
          ),
          original.indexOf(
            "create or replace function public.accepted_role_pair_is_available_v1"
          )
        )
      );
      await tx.unsafe(
        original.slice(
          original.indexOf(
            "create or replace function public.accepted_role_pair_is_available_v1"
          ),
          original.indexOf("-- The exact queued delivery")
        )
      );
    }
    const [mailTable] = await query(
      "SELECT to_regclass('public.company_email_outbox') AS name"
    );
    if (!mailTable.name) {
      const mail = fs.readFileSync(
        "supabase/migrations/20261015130959_company_connection_email_delivery.sql",
        "utf8"
      );
      await tx.unsafe(
        mail.slice(0, mail.indexOf("create or replace function"))
      );
    }
    const [outboxContract] = await query(
      "SELECT to_regprocedure('public.company_first_outbox_is_deliverable_v1(uuid)') AS name"
    );
    if (!outboxContract.name)
      throw new Error(
        "Local fixture is missing the original company outbox delivery contract"
      );
    const email = fs.readFileSync(
      "supabase/migrations/20261023133155_company_candidate_email.sql",
      "utf8"
    );
    await tx.unsafe(
      email
        .slice(0, email.indexOf("-- 5. Company mail table"))
        .replace(/^begin;/im, "")
    );
    const [installed] = await query(
      "SELECT to_regclass('public.agent_contact_messages') AS name"
    );
    if (!installed.name) await tx.unsafe(migration);
    const talent = fixture.candidateId,
      role = fixture.roleId,
      workspace = fixture.workspaceId;
    const conversation = randomUUID();
    await query(
      "INSERT INTO public.talent_conversations(id,user_id) VALUES($1::uuid,$2::uuid)",
      [conversation, talent]
    );
    await query(
      "UPDATE public.company_roles SET status='paused',is_expired=false,expires_at=null,information=information||$2::jsonb WHERE role_id=$1::uuid",
      [
        role,
        JSON.stringify({
          testOnly: true,
          testFixture: "agent-introduction-transaction",
          testTalentIds: [talent],
        }),
      ]
    );
    await query(
      "UPDATE public.talent_setting SET profile_visibility='open_to_matches',is_onboarding_done=true,blocked_companies='{}' WHERE user_id=$1::uuid",
      [talent]
    );
    const [sourceMessage] = await query(
      "INSERT INTO public.talent_messages(user_id,conversation_id,role,content,message_type) VALUES($1::uuid,$2::uuid,'user','Please introduce me.','chat') RETURNING id",
      [talent, conversation]
    );
    const source = {
      kind: "career" as const,
      talentId: talent,
      conversationId: conversation,
      messageId: Number(sourceMessage.id),
    };
    const [saved] = await query(
      "SELECT public.ensure_requested_internal_role_v1($1::uuid,$2::uuid,'test',$3::jsonb) AS result",
      [
        talent,
        role,
        JSON.stringify({
          conversationId: conversation,
          userMessageId: source.messageId,
        }),
      ]
    );
    const rec = saved.result.recommendationId;
    const [voice] = await query(
      "SELECT public.record_career_voice_tool_request_v1($1::uuid,$2::uuid,'voice-apply','apply_to_internal_role',$3::jsonb) AS id",
      [talent, conversation, JSON.stringify({ roleId: role })]
    );
    const [voiceAgain] = await query(
      "SELECT public.record_career_voice_tool_request_v1($1::uuid,$2::uuid,'voice-apply','apply_to_internal_role',$3::jsonb) AS id",
      [talent, conversation, JSON.stringify({ roleId: role })]
    );
    assert.equal(voiceAgain.id, voice.id);
    await assert.rejects(
      db.transaction((q) =>
        q(
          "SELECT public.record_career_voice_tool_request_v1($1::uuid,$2::uuid,'voice-apply','apply_to_internal_role','{}')",
          [talent, conversation]
        )
      )
    );
    const [voiceSaved] = await query(
      "SELECT public.ensure_requested_internal_role_v1($1::uuid,$2::uuid,'voice-test',$3::jsonb) AS result",
      [
        talent,
        role,
        JSON.stringify({
          conversationId: conversation,
          voiceEventId: voice.id,
        }),
      ]
    );
    assert.equal(voiceSaved.result.recommendationId, rec);
    const [voiceContact] = await query(
      "SELECT public.record_career_voice_tool_request_v1($1::uuid,$2::uuid,'voice-contact','contact_company',$3::jsonb) AS id",
      [
        talent,
        conversation,
        JSON.stringify({ recommendationId: rec, acceptIntroduction: true }),
      ]
    );
    await assertAgentContactSource(
      query,
      {
        kind: "career",
        talentId: talent,
        conversationId: conversation,
        voiceEventId: voiceContact.id,
      },
      role,
      talent
    );
    await assert.rejects(
      assertAgentContactSource(
        query,
        {
          kind: "career",
          talentId: randomUUID(),
          conversationId: conversation,
          voiceEventId: voiceContact.id,
        },
        role
      )
    );
    console.log(
      "PASS: authenticated voice execution sources are durable and replay-safe without fabricated user messages"
    );
    assert.equal(saved.result.visible, true);
    assert.equal(saved.result.role.roleId, role);
    assert.equal(saved.result.role.status, undefined);
    assert.equal(saved.result.role.internalRequest, undefined);
    console.log(
      "PASS: paused role saved independently of evaluation; public projection"
    );
    // Reset only synthetic local-fixture progress inside this uncommitted transaction.
    await query(
      "DELETE FROM public.talent_opportunity_tag WHERE talent_id=$1::uuid AND opportunity_id=$2::uuid",
      [talent, role]
    );
    await query(
      "DELETE FROM public.company_intro_candidates WHERE talent_id=$1::uuid AND role_id=$2::uuid",
      [talent, role]
    );
    await query(
      "DELETE FROM public.talent_progress WHERE recommendation_id=$1::uuid AND kind='intro_to_company'",
      [rec]
    );
    await query(
      "UPDATE public.talent_opportunity_recommendation SET feedback=null,saved_stage=null,opportunity_type='internal_recommendation',shared_material_id=null WHERE id=$1::uuid",
      [rec]
    );
    const stale = encodeMaterialSelection({
      materialId: randomUUID(),
      assignmentRevision: 9999,
    });
    await assert.rejects(
      sendAgentContact(
        {
          source,
          operationKey: "stale-material",
          message: "Introduce me",
          recommendationId: rec,
          acceptIntroduction: true,
          selectionRef: stale,
        },
        db
      )
    );
    await query(
      "UPDATE public.talent_setting SET profile_visibility='dont_share' WHERE user_id=$1::uuid",
      [talent]
    );
    await assert.rejects(
      sendAgentContact(
        {
          source,
          operationKey: "privacy-disabled",
          message: "Introduce me",
          recommendationId: rec,
          acceptIntroduction: true,
        },
        db
      )
    );
    await query(
      "UPDATE public.talent_setting SET profile_visibility='open_to_matches' WHERE user_id=$1::uuid",
      [talent]
    );
    assert.equal(
      (
        await query(
          "SELECT id FROM public.agent_contact_messages WHERE recommendation_id=$1::uuid",
          [rec]
        )
      ).length,
      0
    );
    console.log(
      "PASS: stale reviewed materials and disabled sharing have no partial acceptance or mailbox effect"
    );
    const originalIntakeSetting = process.env.AGENT_INTRODUCTION_ACCEPTING;
    process.env.AGENT_INTRODUCTION_ACCEPTING = "false";
    try {
      await assert.rejects(
        sendAgentContact(
          {
            source,
            operationKey: "intake-disabled",
            message: "Introduce me",
            recommendationId: rec,
            acceptIntroduction: true,
          },
          db
        ),
        /temporarily unavailable/
      );
      assert.equal(
        (
          await query(
            "SELECT id FROM public.agent_contact_messages WHERE recommendation_id=$1::uuid",
            [rec]
          )
        ).length,
        0
      );
    } finally {
      if (originalIntakeSetting === undefined)
        delete process.env.AGENT_INTRODUCTION_ACCEPTING;
      else process.env.AGENT_INTRODUCTION_ACCEPTING = originalIntakeSetting;
    }
    const first = await sendAgentContact(
      {
        source,
        operationKey: "transaction-test",
        message: "Introduce this candidate to the company for the Role.",
        recommendationId: rec,
        acceptIntroduction: true,
      },
      db
    );
    assert.equal(first.message.direction, "to_company");
    assert.ok(first.message.material_id);
    const [shared] = await query(
      "SELECT shared_material_id FROM public.talent_opportunity_recommendation WHERE id=$1::uuid",
      [rec]
    );
    assert.equal(shared.shared_material_id, first.message.material_id);
    assert.ok(first.message.receiver_job_id);
    const [job] = await query(
      "SELECT * FROM public.company_agent_web_action_jobs WHERE id=$1::uuid",
      [first.message.receiver_job_id]
    );
    assert.equal(job.actor_user_id, null);
    assert.equal(job.action_name, "agent_contact_received");
    const repeated = await sendAgentContact(
      {
        source,
        operationKey: "transaction-test",
        message: "different retry body",
        recommendationId: rec,
        acceptIntroduction: true,
      },
      db
    );
    assert.equal(repeated.message.id, first.message.id);
    assert.equal(repeated.message.body, first.message.body);
    assert.equal(repeated.reused, true);
    process.env.AGENT_INTRODUCTION_ACCEPTING = "false";
    try {
      const acceptedReplay = await sendAgentContact(
        {
          source,
          operationKey: "intake-disabled-existing",
          message: "Introduce me",
          recommendationId: rec,
          acceptIntroduction: true,
        },
        db
      );
      assert.equal(acceptedReplay.message.id, first.message.id);
      assert.equal(acceptedReplay.reused, true);
    } finally {
      if (originalIntakeSetting === undefined)
        delete process.env.AGENT_INTRODUCTION_ACCEPTING;
      else process.env.AGENT_INTRODUCTION_ACCEPTING = originalIntakeSetting;
    }
    console.log(
      "PASS: intake pause rejects new introductions without blocking accepted receipts"
    );
    const [eligibility] = await query(
      "SELECT public.accepted_role_pair_is_available_v1($1::uuid) AS eligible",
      [rec]
    );
    assert.equal(eligibility.eligible, false);
    const {
      reserveAgentExecution,
      settleAgentExecution,
      AgentContactBudgetBusyError,
      AgentContactBudgetExhaustedError,
    } = await import("../../src/lib/agentContacts/executionBudget");
    await reserveAgentExecution(first.message.id, "company-running", 1500, db);
    await assert.rejects(
      reserveAgentExecution(first.message.id, "career-waiting", 430, db),
      AgentContactBudgetBusyError
    );
    await settleAgentExecution(first.message.id, "company-running", db);
    assert.ok(
      (await reserveAgentExecution(first.message.id, "career-ready", 430, db)) >
        0
    );
    await settleAgentExecution(first.message.id, "career-ready", db);
    const [usage] = await query(
      "SELECT execution_usage FROM public.agent_contact_messages WHERE id=$1::uuid",
      [first.message.id]
    );
    await query(
      "UPDATE public.agent_contact_messages SET execution_usage=execution_usage||'{\"spentSeconds\":1500}'::jsonb WHERE id=$1::uuid",
      [first.message.id]
    );
    await assert.rejects(
      reserveAgentExecution(first.message.id, "exhausted", 430, db),
      AgentContactBudgetExhaustedError
    );
    await query(
      "UPDATE public.agent_contact_messages SET execution_usage=$2::jsonb WHERE id=$1::uuid",
      [first.message.id, JSON.stringify(usage.execution_usage)]
    );
    console.log(
      "PASS: both agents share an atomic compute allowance; concurrent reservations and exhausted work are distinguished"
    );
    console.log(
      "PASS: atomic acceptance, default snapshot, service inbox, replay and old Worker exclusion"
    );
    await query(
      "UPDATE public.company_agent_web_action_jobs SET status='processing',locked_by='test-lease',locked_at=now() WHERE id=$1::uuid",
      [job.id]
    );
    const companySource = {
      kind: "company_event" as const,
      workspaceId: workspace,
      roleId: role,
      jobId: job.id,
      leaseOwner: "test-lease",
    };
    await assert.rejects(
      assertAgentContactSource(query, companySource, role, randomUUID()),
      /another candidate relationship/
    );
    Object.assign(process.env, env);
    const { executeCompanyCorrespondence, companyContactSource } =
      await import("../../src/lib/agentContacts/companyTools");
    // The receiver's CJS module and dynamic ESM tools must share the same
    // lease-bound capability; a fake team-member identity must never replace it.
    const { withCompanyAgentScope } = createRequire(import.meta.url)(
      "../../src/lib/agentContacts/companyScope.ts"
    );
    const scopedAdmin = withCompanyAgentScope({}, {
      ...companySource,
      assertCurrent: () => assertAgentContactSource(query, companySource, role),
    });
    const toolSource = companyContactSource({
      admin: scopedAdmin, workspaceId: workspace, userId: job.id,
      sourceMessageId: Number(job.anchor_message_id),
    });
    assert.equal(toolSource.kind, "company_event");
    const publish = () =>
      executeCompanyCorrespondence(
        {
          source: toolSource,
          name: "publish_role_recommendations",
          input: {
            roleId: role,
            introductionRootId: first.message.id,
            presentation:
              "The candidate requested an introduction and has relevant platform experience.",
          },
          sourceMessageId: Number(job.anchor_message_id),
          conversationId: job.conversation_id,
        },
        db
      );
    await publish();
    await publish();
    const published = await query(
      "SELECT id FROM public.talent_progress WHERE metadata->>'agentIntroductionRootId'=$1 AND kind='intro_to_company'",
      [first.message.id]
    );
    assert.equal(published.length, 1);
    const beforeInbox = await query(
      "SELECT id FROM public.company_messages WHERE metadata->>'webActionJobId'=$1 AND role='assistant'",
      [job.id]
    );
    assert.equal(beforeInbox.length, 0);
    const tell = () =>
      executeCompanyCorrespondence(
        {
          source: toolSource,
          name: "contact_user",
          input: {
            channel: "chat",
            roleId: role,
            body: "A candidate requested an introduction. Their shared profile is available in the Role inbox.",
          },
          sourceMessageId: Number(job.anchor_message_id),
          conversationId: job.conversation_id,
        },
        db
      );
    await tell();
    await tell();
    assert.equal(
      (
        await query(
          "SELECT id FROM public.company_messages WHERE metadata->>'webActionJobId'=$1 AND role='assistant'",
          [job.id]
        )
      ).length,
      1
    );
    console.log(
      "PASS: company presentation and own-user chat are independent, idempotent effects"
    );
    const { manageCompanySchedule, enqueueDueCompanyAgentSchedules } =
      await import("../../src/lib/agentContacts/schedules");
    const scheduleInput = {
      action: "create",
      roleId: role,
      title: "Review response",
      instruction: "Review any new response and contact the team if useful.",
      nextRunAt: new Date(Date.now() - 60_000).toISOString(),
      introductionRootId: first.message.id,
    };
    const [unrelatedSchedule] = await query(
      `INSERT INTO public.company_agent_schedules(company_workspace_id,role_id,title,instruction,timezone,source,operation_key)
      VALUES($1::uuid,$2::uuid,'Other responsibility','Existing general Role work','Asia/Seoul','{}','scope-test') RETURNING *`,
      [workspace, role]
    );
    await assert.rejects(
      manageCompanySchedule(
        companySource,
        {
          action: "update",
          roleId: role,
          scheduleId: unrelatedSchedule.id,
          expectedRevision: Number(unrelatedSchedule.revision),
          introductionRootId: first.message.id,
          instruction: "Must not take over unrelated work",
        },
        "scope-test-update",
        db
      ),
      /cannot change/
    );
    await manageCompanySchedule(
      companySource,
      scheduleInput,
      "schedule-test",
      db
    );
    await manageCompanySchedule(
      companySource,
      scheduleInput,
      "schedule-test",
      db
    );
    await enqueueDueCompanyAgentSchedules(db);
    await enqueueDueCompanyAgentSchedules(db);
    const [schedule] = await query(
      "SELECT * FROM public.company_agent_schedules WHERE operation_key='schedule-test'"
    );
    assert.ok(schedule.last_job_id);
    assert.equal(schedule.next_run_at, null);
    const [scheduledJob] = await query(
      "UPDATE public.company_agent_web_action_jobs SET status='processing',locked_by='schedule-lease',locked_at=now() WHERE id=$1::uuid RETURNING *",
      [schedule.last_job_id]
    );
    assert.equal(
      scheduledJob.action_context.agentContactBudgetAnchor,
      first.message.id
    );
    const scheduledSource = {
      ...companySource,
      jobId: scheduledJob.id,
      leaseOwner: "schedule-lease",
    };
    await manageCompanySchedule(
      scheduledSource,
      {
        action: "pause",
        roleId: role,
        scheduleId: schedule.id,
        expectedRevision: Number(schedule.revision),
      },
      "self-pause",
      db
    );
    await assertAgentContactSource(query, scheduledSource, role);
    await assert.rejects(
      manageCompanySchedule(
        companySource,
        {
          action: "cancel",
          roleId: role,
          scheduleId: schedule.id,
          expectedRevision: 0,
        },
        "cancel-test",
        db
      )
    );
    await manageCompanySchedule(
      companySource,
      {
        action: "cancel",
        roleId: role,
        scheduleId: schedule.id,
        expectedRevision: Number(schedule.revision) + 1,
      },
      "cancel-test",
      db
    );
    await assert.rejects(
      assertAgentContactSource(query, scheduledSource, role)
    );
    console.log(
      "PASS: one-shot schedule, deduplicated occurrence and revision conflict"
    );
    const reply = await sendAgentContact(
      {
        source: companySource,
        operationKey: "reply-test",
        message: "Can we clarify availability?",
        rootId: first.message.root_id,
      },
      db
    );
    assert.equal(reply.message.direction, "to_talent");
    const [run] = await query(
      "SELECT trigger_payload FROM public.opportunity_discovery_run WHERE id=$1::uuid",
      [reply.message.receiver_job_id]
    );
    assert.equal(run.trigger_payload.runContract, "career_agent_v1");
    assert.equal(
      run.trigger_payload.sourceEvents[0].sourceId,
      reply.message.id
    );
    assert.equal(
      run.trigger_payload.agentContactBudgetAnchor,
      first.message.id
    );
    assert.equal(
      await isCareerAgentContactEventCurrent(
        reply.message.id,
        reply.message.receiver_job_id!,
        talent,
        db
      ),
      true
    );
    await query(
      "UPDATE public.talent_setting SET blocked_companies=ARRAY[$2] WHERE user_id=$1::uuid",
      [talent, workspace]
    );
    assert.equal(
      await isCareerAgentContactEventCurrent(
        reply.message.id,
        reply.message.receiver_job_id!,
        talent,
        db
      ),
      false
    );
    await assert.rejects(
      sendAgentContact(
        {
          source: companySource,
          operationKey: "blocked",
          message: "Blocked",
          rootId: first.message.id,
        },
        db
      )
    );
    assert.equal(
      (
        await readAgentContacts(
          { source: companySource, rootId: first.message.id },
          db
        )
      ).messages.length,
      0
    );
    await query(
      "UPDATE public.talent_setting SET blocked_companies='{}' WHERE user_id=$1::uuid",
      [talent]
    );
    await assert.rejects(
      sendAgentContact(
        {
          source: { ...companySource, leaseOwner: "stale" },
          operationKey: "stale",
          message: "No",
          rootId: first.message.id,
        },
        db
      )
    );
    console.log("PASS: reverse Career event and lease fencing");
    const { contactCompanyByEmail, deliverAgentCompanyEmail } =
      await import("../../src/lib/agentContacts/companyEmail.server");
    await query(
      "UPDATE public.company_internal_roles SET email_notifications_enabled=true WHERE role_id=$1::uuid",
      [role]
    );
    const audience = await query(
      "SELECT * FROM public.company_role_email_recipients_v1($1::uuid)",
      [role]
    );
    assert.ok(
      audience.length,
      "The synthetic fixture must contain an approved company recipient"
    );
    let sends = 0;
    const delivery = {
      createReplyAlias: async (args: any) => ({
        to: audience.find((p) => p.user_id === args.userId)!.email,
        replyTo: "capture@example.invalid",
      }),
      send: async () => {
        sends++;
        throw new Error("synthetic timeout after submission");
      },
    };
    const mailArgs = {
      source: companySource,
      operationKey: "mail-unknown",
      body: "Frozen company message",
      subject: "Synthetic introduction",
      roleId: role,
      rootId: first.message.id,
    };
    await contactCompanyByEmail(mailArgs, db, delivery);
    await contactCompanyByEmail(
      { ...mailArgs, body: "Must not replace the original body" },
      db,
      delivery
    );
    const mails = await query(
      "SELECT * FROM public.company_email_outbox WHERE topic='agent_contact_v1' AND snapshot->>'agentContactDeliveryKey'=$1",
      [`${workspace}:mail-unknown`]
    );
    assert.equal(sends, audience.length);
    for (const mail of mails) {
      assert.equal(mail.status, "delivery_unknown");
      assert.equal(mail.draft.body, mailArgs.body);
    }
    const { readAgentCorrespondence } =
      await import("../../src/lib/agentContacts/read");
    const companyHistory = await readAgentCorrespondence(
      companySource,
      { introductionRootId: first.message.id },
      db
    );
    assert.equal(companyHistory.deliveries.length, mails.length);
    assert.ok(companyHistory.modelOutput.includes("delivery_unknown"));
    assert.ok(companyHistory.modelOutput.includes(mailArgs.body));
    const careerHistory = await readAgentCorrespondence(
      source,
      { introductionRootId: first.message.id },
      db
    );
    assert.equal(careerHistory.deliveries.length, 0);
    assert.equal(careerHistory.modelOutput.includes(mailArgs.body), false);
    console.log(
      "PASS: company agent can reread actual email receipts; candidate cannot read private company email"
    );
    const recovery = {
      ...delivery,
      send: async () => {
        sends++;
        return { id: "synthetic-receipt" };
      },
    };
    await query(
      "UPDATE public.company_email_outbox SET status='queued',attempted_at=null,lease_until=null WHERE id=$1::uuid",
      [mails[0].id]
    );
    await query(
      "UPDATE public.talent_setting SET blocked_companies=ARRAY[$2] WHERE user_id=$1::uuid",
      [talent, workspace]
    );
    await deliverAgentCompanyEmail(mails[0].id, db, recovery);
    assert.equal(sends, audience.length);
    assert.equal(
      (
        await query(
          "SELECT status FROM public.company_email_outbox WHERE id=$1::uuid",
          [mails[0].id]
        )
      )[0].status,
      "cancelled"
    );
    await query(
      "UPDATE public.talent_setting SET blocked_companies='{}' WHERE user_id=$1::uuid",
      [talent]
    );
    console.log(
      "PASS: uncertain email is frozen and not resent; audience withdrawal cancels pending delivery"
    );
    await manageCompanySchedule(
      companySource,
      scheduleInput,
      "withdrawal-schedule",
      db
    );
    await query(
      "UPDATE public.talent_opportunity_recommendation SET saved_stage='hidden' WHERE id=$1::uuid",
      [rec]
    );
    const [hidden] = await query(
      "SELECT cancelled_at FROM public.agent_contact_messages WHERE id=$1::uuid",
      [first.message.id]
    );
    assert.equal(hidden.cancelled_at, null);
    await query(
      "UPDATE public.talent_opportunity_recommendation SET feedback='dislike',saved_stage='hidden' WHERE id=$1::uuid",
      [rec]
    );
    await assert.rejects(
      sendAgentContact(
        {
          source: companySource,
          operationKey: "withdrawn",
          message: "No",
          rootId: first.message.id,
        },
        db
      )
    );
    const [root] = await query(
      "SELECT cancelled_at,material_id FROM public.agent_contact_messages WHERE id=$1::uuid",
      [first.message.id]
    );
    assert.ok(root.cancelled_at);
    assert.equal(root.material_id, first.message.material_id);
    assert.equal(await enqueueDueCompanyAgentSchedules(db), 0);
    const [cancelledSchedule] = await query(
      "SELECT status,next_run_at,last_job_id FROM public.company_agent_schedules WHERE operation_key='withdrawal-schedule'"
    );
    assert.equal(cancelledSchedule.status, "cancelled");
    assert.equal(cancelledSchedule.next_run_at, null);
    assert.equal(cancelledSchedule.last_job_id, null);
    console.log(
      "PASS: withdrawal stops new correspondence and scheduled work while preserving historical material"
    );
    throw rollback;
  });
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await sql.end();
}
console.log("All integration effects rolled back; no messages sent.");
