import assert from "node:assert/strict";
import test from "node:test";
import {
  GTM_DAILY_SEND_LIMIT_DEFAULT,
  gtmBatchOverLimit,
  gtmDailySendLimit,
  gtmSendLimitMessage,
  gtmSendLimitReached,
  gtmSendQuota,
  kstDayWindow,
} from "./sendLimit";

test("the day is Korea's: 00:00 KST is 15:00 UTC the day before", () => {
  // 2026-11-16 10:12 KST
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T01:12:00Z")), {
    start: "2026-11-15T15:00:00.000Z", end: "2026-11-16T15:00:00.000Z",
  });
  // 2026-11-16 23:59:59 KST is still the 16th
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T14:59:59.999Z")).start, "2026-11-15T15:00:00.000Z");
  // 2026-11-17 00:00 KST starts the next day
  assert.deepEqual(kstDayWindow(new Date("2026-11-16T15:00:00Z")), {
    start: "2026-11-16T15:00:00.000Z", end: "2026-11-17T15:00:00.000Z",
  });
  // Late evening UTC is already the next morning in Korea
  assert.equal(kstDayWindow(new Date("2026-12-31T20:00:00Z")).start, "2026-12-31T15:00:00.000Z");
});

test("the limit is 50 unless GTM_DAILY_SEND_LIMIT is a whole number", () => {
  assert.equal(gtmDailySendLimit({}), GTM_DAILY_SEND_LIMIT_DEFAULT);
  assert.equal(GTM_DAILY_SEND_LIMIT_DEFAULT, 50);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: " 120 " }), 120);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: "0" }), 0);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: "-5" }), 50);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: "12.5" }), 50);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: "many" }), 50);
  assert.equal(gtmDailySendLimit({ GTM_DAILY_SEND_LIMIT: "" }), 50);
});

test("at or over the limit no more mail goes today", () => {
  assert.equal(gtmSendLimitReached(49, 50), false);
  assert.equal(gtmSendLimitReached(50, 50), true);
  assert.equal(gtmSendLimitReached(51, 50), true);
  assert.equal(gtmSendLimitReached(0, 0), true);
  assert.equal(gtmSendLimitMessage(50), "오늘 보낼 수 있는 메일 수(50통)를 다 썼어요");
});

test("quota and a batch against what is left", () => {
  assert.deepEqual(gtmSendQuota(12, 50), { sentToday: 12, limit: 50, left: 38 });
  assert.deepEqual(gtmSendQuota(60, 50), { sentToday: 60, limit: 50, left: 0 });
  assert.deepEqual(gtmBatchOverLimit({ left: 38 }, 10), { willSend: 10, refused: 0 });
  assert.deepEqual(gtmBatchOverLimit({ left: 3 }, 10), { willSend: 3, refused: 7 });
  assert.deepEqual(gtmBatchOverLimit({ left: 0 }, 2), { willSend: 0, refused: 2 });
});
