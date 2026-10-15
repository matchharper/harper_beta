import assert from "node:assert/strict";
import test from "node:test";
import { deliverCompanyUpdateSlackThread, renderCompanyUpdateCardText } from "./companyUpdate";

test("card renderer resolves known identifiers without rewriting surrounding prose", () => {
  assert.equal(renderCompanyUpdateCardText("**Alex**: [Alex](talent:abc-123) — API ownership. [Profile](https://example.invalid/123)",
    [{ id: "abc-123", profileUrl: "https://example.invalid/123" }]),
    "**Alex**: <https://example.invalid/123|Alex> — API ownership. <https://example.invalid/123|Profile>");
  assert.equal(renderCompanyUpdateCardText("[Unknown](talent:not-known)", []), "[Unknown](talent:not-known)");
});

test("the mention finishes before the model-authored welcome is sent into its thread", async () => {
  const sent: Array<{ text: string; threadTs?: string; idempotencyKey: string }> = [];
  const receipt = await deliverCompanyUpdateSlackThread({ channelId: "channel", eventKey: "event",
    mentionSlackUserId: "U123", text: "Welcome. [Calendar](https://example.invalid/calendar)",
  }, async message => {
    sent.push(message);
    await Promise.resolve();
    return { slackMessageTs: sent.length === 1 ? "100.1" : "100.2", threadId: "thread" };
  });
  assert.deepEqual(sent, [
    { text: "<@U123> 👋", idempotencyKey: "event:mention" },
    { text: "Welcome. <https://example.invalid/calendar|Calendar>", threadTs: "100.1", idempotencyKey: "event:welcome" },
  ]);
  assert.deepEqual(receipt, { slackMessageTs: "100.2", rootMessageTs: "100.1", threadId: "thread" });
});

test("a failed mention stops the thread; a failed thread does not produce a completed receipt", async () => {
  const notice = { channelId: "channel", eventKey: "event", mentionSlackUserId: "U123", text: "Welcome" };
  let sends = 0;
  await assert.rejects(deliverCompanyUpdateSlackThread(notice, async () => {
    sends++;
    throw Error("delivery failed");
  }));
  assert.equal(sends, 1);
  await assert.rejects(deliverCompanyUpdateSlackThread(notice, async () => {
    if (++sends === 3) throw Error("reply failed");
    return { slackMessageTs: "100.1", threadId: "thread" };
  }));
  assert.equal(sends, 3);
});
