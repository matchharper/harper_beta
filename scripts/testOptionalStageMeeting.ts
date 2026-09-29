/** Production preparation/RPC adapter with hermetic HTTP fixtures. No network. */
import assert from "node:assert/strict";
const userId = "00000000-0000-4000-8000-000000000002";
const workspaceId = "00000000-0000-4000-8000-000000000001";
const roleId = "00000000-0000-4000-8000-000000000003";
const talentId = "00000000-0000-4000-8000-000000000004";
const recommendationId = "00000000-0000-4000-8000-000000000005";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:1";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "synthetic";
process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic";
process.env.OPENAI_API_KEY = "synthetic";
process.env.COMPOSIO_API_KEY = "synthetic";
process.env.COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID = "ac_synthetic";
let member = true,
  activeCalendar = true;
const requests: Array<{ table: string; method: string; body: any }> = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const table = url.pathname.split("/").at(-1)!;
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  requests.push({ table, method, body });
  const send = (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  if (url.hostname === "backend.composio.dev" && table === "ca_synthetic")
    return send({
      id: "ca_synthetic",
      user_id: userId,
      status: "ACTIVE",
      toolkit: { slug: "googlecalendar" },
      auth_config: { id: "ac_synthetic" },
    });
  assert.equal(
    url.origin,
    "http://127.0.0.1:1",
    `Unexpected external endpoint ${url.origin}`
  );
  assert.equal(method, "GET", `Unexpected write ${table}`);
  const rows: Record<string, any[]> = {
    company_user_workspace: member
      ? [{ id: "membership", authority: "owner", company_user_id: userId }]
      : [],
    company_workspace: [
      { company_workspace_id: workspaceId, company_name: "Synthetic company" },
    ],
    company_roles: [{ role_id: roleId, company_workspace_id: workspaceId }],
    talent_users: [{ user_id: talentId, name: "Synthetic candidate" }],
    talent_opportunity_recommendation: [{ id: recommendationId }],
    company_users: [
      { user_id: userId, name: "팀원", email: "member@example.invalid" },
    ],
    meeting_availability: [
      {
        company_workspace_id: workspaceId,
        company_user_id: userId,
        timezone: "Asia/Seoul",
        weekly_rules: Object.fromEntries(
          Array.from({ length: 7 }, (_, index) => [
            String(index + 1),
            index < 5 ? [{ start: "09:00", end: "18:00" }] : [],
          ])
        ),
        date_overrides: {},
        version: 1,
        updated_at: new Date().toISOString(),
      },
    ],
    company_user_integrations: activeCalendar
      ? [
          {
            company_user_id: userId,
            provider: "google_calendar",
            status: "active",
            composio_connected_account_id: "ca_synthetic",
            last_synced_at: new Date().toISOString(),
          },
        ]
      : [],
    company_user_calendar_busy_blocks: [],
    ops_matching_role_stages: [],
  };
  assert.ok(table in rows, `Unexpected fixture query ${table}`);
  return send(rows[table]);
};
async function main() {
  const { prepareMeetingScheduleDraftForStage, createMeetingScheduleDraft } =
    await import("../src/lib/meetings/scheduleDraftServer");
  const base = {
    recommendationId,
    roleId,
    talentId,
    workspaceId,
    sourceStage: "pending_connection",
    user: {
      id: userId,
      email: "member@example.invalid",
      user_metadata: {},
    } as any,
  };
  const prepared = await prepareMeetingScheduleDraftForStage({
    ...base,
    meetingPurpose: "운영 경험 논의",
    meetingCandidateMessage: "최근 프로젝트 경험을 들려주세요.",
  });
  assert.equal(prepared.draft.draftBlocker, null);
  assert.equal(prepared.draft.config.processStageId, null);
  assert.equal(prepared.draft.config.durationMinutes, 60);
  assert.equal(
    prepared.draft.config.invitationKind,
    "first_company_conversation"
  );
  assert.equal(
    prepared.draft.additionalMessage?.sourceText,
    "최근 프로젝트 경험을 들려주세요."
  );
  assert.equal(prepared.draft.meetingStage, null);
  assert.equal(
    requests.some((r) => r.table === "ops_matching_role_stages"),
    false
  );
  const missing = await prepareMeetingScheduleDraftForStage(base);
  assert.equal(missing.draft.draftBlocker, "meeting_stage_missing");
  const followup = await prepareMeetingScheduleDraftForStage({
    ...base,
    sourceStage: "connected",
    meetingPurpose: "설계 경험 논의",
    durationMinutes: 45,
  });
  assert.equal(followup.draft.config.durationMinutes, 45);
  assert.equal(followup.draft.config.processStageId, null);
  const writes: any[] = [];
  const admin = {
    rpc: async (name: string, params: any) => {
      assert.equal(name, "create_meeting_schedule_draft_v1");
      writes.push(params);
      return {
        data: { scheduleId: "schedule", roundId: "round", status: "preparing" },
        error: null,
      };
    },
  } as any;
  for (const sourceCompanyMessageId of [10, 10, 11])
    await createMeetingScheduleDraft({
      ...base,
      admin,
      draft: prepared.draft,
      sourceCompanyMessageId,
    });
  assert.equal(writes[0].p_idempotency_key, writes[1].p_idempotency_key);
  assert.notEqual(writes[0].p_idempotency_key, writes[2].p_idempotency_key);
  assert.equal(writes[0].p_meeting_config_snapshot.processStageId, null);
  await assert.rejects(
    prepareMeetingScheduleDraftForStage({
      ...base,
      stageId: "00000000-0000-4000-8000-000000000099",
      meetingPurpose: "설계 논의",
    })
  );
  activeCalendar = false;
  assert.equal(
    (
      await prepareMeetingScheduleDraftForStage({
        ...base,
        meetingPurpose: "운영 논의",
      })
    ).draft.draftBlocker,
    "calendar_connection_missing"
  );
  member = false;
  await assert.rejects(
    prepareMeetingScheduleDraftForStage({
      ...base,
      meetingPurpose: "운영 논의",
    }),
    /Workspace access denied/
  );
  console.log(
    "PASS: no-stage production preparation, 60-minute default, purpose/calendar/permission blockers, candidate note, explicit duration, request-key RPC boundary; no external network"
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
