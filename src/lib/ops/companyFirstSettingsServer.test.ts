import assert from "node:assert/strict";
import test from "node:test";
import { parseCompanyFirstSettings } from "@/lib/ops/companyFirstSettingsServer";

const settings = {
  scheduled_enabled: true,
  schedule_cron: "0 9 * * 1",
  schedule_timezone: "Asia/Seoul",
  scheduled_role_limit: 3,
  requested_role_limit: 6,
  ready_backlog_limit: 30,
};

test("accepts daily, weekly, monthly and interval schedules with bounded quantities", () => {
  for (const cron of [
    "0 9 * * *",
    "40 8 * * 6",
    "15 10 1 * *",
    "0 */2 * * *",
  ]) {
    assert.equal(
      parseCompanyFirstSettings({ ...settings, schedule_cron: cron })
        .schedule_cron,
      cron
    );
  }
  assert.deepEqual(
    parseCompanyFirstSettings({
      ...settings,
      scheduled_enabled: false,
      requested_role_limit: 20,
    }),
    {
      ...settings,
      scheduled_enabled: false,
      requested_role_limit: 20,
    }
  );
  assert.equal(
    parseCompanyFirstSettings({ ...settings, schedule_timezone: "asia/seoul" })
      .schedule_timezone,
    "Asia/Seoul"
  );
});

test("rejects unsupported, impossible or unsafe operational settings", () => {
  for (const change of [
    { scheduled_enabled: "false" },
    { schedule_cron: "0 9 * * * *" },
    { schedule_cron: "0 9 31 2 *" },
    { schedule_cron: "*/0 * * * *" },
    { schedule_cron: "H 9 * * 1" },
    { schedule_timezone: "not/a-zone" },
    { scheduled_role_limit: 0 },
    { requested_role_limit: 51 },
    { ready_backlog_limit: 1.5 },
    { scheduled_role_limit: true },
  ]) {
    assert.throws(() => parseCompanyFirstSettings({ ...settings, ...change }), {
      status: 400,
    });
  }
});
