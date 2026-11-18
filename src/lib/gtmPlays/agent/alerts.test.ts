import assert from "node:assert/strict";
import test from "node:test";
import { ALERT_EVERY_MS, alertText, alertWebhook } from "./alerts";

test("alerts go only to a Slack incoming webhook, and nowhere when none is set", () => {
  assert.equal(alertWebhook({}), null);
  assert.equal(alertWebhook({ GTM_AGENT_ALERT_WEBHOOK: "  " }), null);
  assert.equal(alertWebhook({ GTM_AGENT_ALERT_WEBHOOK: "https://example.com/hook" }), null);
  assert.equal(alertWebhook({ GTM_AGENT_ALERT_WEBHOOK: "http://hooks.slack.com/services/T/B/x" }), null);
  assert.equal(alertWebhook({ GTM_AGENT_ALERT_WEBHOOK: " https://hooks.slack.com/services/T0/B0/abc " }), "https://hooks.slack.com/services/T0/B0/abc");
});

test("an alert names the problem, one line of detail and the ops page", () => {
  const text = alertText("send_paused", "Resend 503\n  다시 시도", "https://matchharper.com/ops/gtm-plays");
  assert.equal(text, "[#5 후보자 소싱 에이전트] 메일 보내기가 멈췄어요\nResend 503 다시 시도\nhttps://matchharper.com/ops/gtm-plays");
  assert.equal(alertText("brake", "", "u").split("\n").length, 2);
});

test("a lasting problem is not sent on every 5-minute tick", () => {
  for (const every of Object.values(ALERT_EVERY_MS)) assert.ok(every >= 10 * 60_000);
});
