import assert from "node:assert/strict";
import { test } from "node:test";
import {
  companyRequestWaitUntil,
  connectionNoticeWaitUntil,
  crmRecipientBlock,
  meetingDeliveryBlock,
  nextKstWorkingTime,
} from "./contactPolicy";

test("connection notice preserves the 24-hour wait and Seoul 08:00–19:00 window", () => {
  const rec = { feedback_at: "2026-10-12T12:00:00Z" };
  assert.equal(
    connectionNoticeWaitUntil(
      { payload: {} },
      rec,
      Date.parse("2026-10-13T11:00:00Z")
    ),
    "2026-10-13T23:00:00.000Z"
  );
  assert.equal(
    nextKstWorkingTime(Date.parse("2026-10-12T21:00:00Z")),
    "2026-10-12T23:00:00.000Z"
  );
  assert.equal(
    connectionNoticeWaitUntil(
      {
        payload: {
          manualOverride: {
            bypassAcceptanceDelay: true,
            bypassWorkingTime: true,
          },
        },
      },
      rec,
      0
    ),
    null
  );
});
test("company contact timing keeps the explicit immediate mode and ordinary five-minute wait", () => {
  const request = { created_at: "2026-10-13T00:00:00Z" };
  assert.equal(
    companyRequestWaitUntil(
      { payload: {} },
      request,
      Date.parse(request.created_at)
    ),
    "2026-10-13T00:05:00.000Z"
  );
  assert.equal(
    companyRequestWaitUntil(
      { payload: { deliveryMode: "immediate" } },
      request,
      0
    ),
    null
  );
});
test("meeting delivery requires the currently active owned round, email and expiry", () => {
  const job = {
    id: "job",
    user_id: "talent",
    payload: {
      to: "talent@example.com",
      meetingScheduleId: "schedule",
      meetingScheduleRoundId: "round",
    },
  };
  const round = {
    id: "round",
    schedule_id: "schedule",
    delivery_queue_id: "job",
    status: "queued",
    invitation_expires_at: "2030-01-01T00:00:00Z",
  };
  const schedule = {
    id: "schedule",
    talent_id: "talent",
    active_round_id: "round",
    status: "awaiting_talent",
  };
  const profile = { email: "talent@example.com" };
  assert.equal(meetingDeliveryBlock(job, round, schedule, profile, 0), null);
  assert.equal(
    meetingDeliveryBlock(
      job,
      round,
      { ...schedule, active_round_id: "new" },
      profile,
      0
    ),
    "meeting_invitation_not_sendable"
  );
  assert.equal(
    meetingDeliveryBlock(job, round, schedule, { email: "new@example.com" }, 0),
    "candidate_email_changed"
  );
  assert.equal(
    meetingDeliveryBlock(
      job,
      round,
      { ...schedule, talent_id: "other" },
      profile,
      0
    ),
    "meeting_invitation_schedule_mismatch"
  );
});
test("CRM respects paused/deleted identities and the actual all-contact privacy setting", () => {
  const broadcast = { status: "queued" },
    profile = { email: "talent@example.com" };
  assert.equal(
    crmRecipientBlock(
      broadcast,
      profile,
      {
        profile_visibility: "open_to_matches",
        get_external_recommendation: false,
        get_internal_recommendation: true,
      },
      profile.email
    ),
    null
  );
  assert.equal(
    crmRecipientBlock(
      broadcast,
      profile,
      { profile_visibility: "dont_share", get_external_recommendation: true },
      profile.email
    ),
    "all_harper_contact_stopped"
  );
  assert.equal(
    crmRecipientBlock(
      broadcast,
      { ...profile, deleted_at: "now" },
      {},
      profile.email
    ),
    "talent_account_deleted"
  );
});
