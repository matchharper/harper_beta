import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanyUpdateEmailMessages } from "./companyUpdateEmail";

test("outbound company email anchors the event to the supplied clock and preserves history", () => {
  const history = [
    { role: "user" as const, content: "오늘 오후 2시로 정했어요." },
    { role: "assistant" as const, content: "일정이 확정됐어요." },
  ];
  const facts = { meeting: { startAt: "2026-10-23T14:00:00+09:00", endAt: "2026-10-23T14:45:00+09:00" } };
  const messages = buildCompanyUpdateEmailMessages({
    purpose: "대화 뒤 안부", facts, locale: "ko", recentConversation: history,
    requestTime: new Date("2026-10-23T06:00:00Z"),
  });
  assert.deepEqual(messages.slice(1, -1), history);
  const input = messages.at(-1)!.content;
  assert.match(input, /<runtime_context>\ntime_zone=Asia\/Seoul\ncurrent_time_kst=2026-10-23 15:00\nrecipient_locale=ko\n<\/runtime_context>/);
  const event = JSON.parse(input.split("<company_update>\n")[1].split("\n</company_update>")[0]);
  assert.equal(event.purpose, "대화 뒤 안부");
  assert.deepEqual(event.facts.meeting, { startAt: "2026-10-23 14:00", endAt: "2026-10-23 14:45" });
  assert.equal(messages.map(m => m.content).join("\n").split("current_time_kst=").length - 1, 1);
});
