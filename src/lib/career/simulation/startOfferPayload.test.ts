import test from "node:test";
import assert from "node:assert/strict";
import {
  extractStartOfferPayload,
  startOfferVisibleLength,
  START_OFFER_MARKER,
} from "./startOfferPayload";
import {
  orderApplicationMessages,
} from "./presentation";

test("start payload is separate from prose and accepts only one known identifier", () => {
  const text =
    'Let us prepare.\n[[APPLICATION_START_OFFER]]{"roleId":"r1"}[[/APPLICATION_START_OFFER]]';
  assert.deepEqual(extractStartOfferPayload(text), {
    content: "Let us prepare.",
    request: { roleId: "r1" },
  });
  for (const data of [
    { roleId: "r1", companyLogoUrl: "https://untrusted" },
    { roleId: "r1", official_job_slug: "x" },
    {},
  ]) {
    assert.equal(
      extractStartOfferPayload(
        `${START_OFFER_MARKER}${JSON.stringify(data)}[[/APPLICATION_START_OFFER]]`
      ).request,
      undefined
    );
  }
  assert.deepEqual(
    extractStartOfferPayload(
      `${START_OFFER_MARKER}{"official_job_slug":"public-role"}[[/APPLICATION_START_OFFER]]`
    ).request,
    { official_job_slug: "public-role" }
  );
});
test("every stream prefix hides partial payload markers and bodies", () => {
  const body = `${START_OFFER_MARKER}{"roleId":"r1"}[[/APPLICATION_START_OFFER]]`;
  for (let i = 1; i <= body.length; i++) {
    const text = "Prose.\n" + body.slice(0, i);
    assert.equal(text.slice(0, startOfferVisibleLength(text)), "Prose.\n");
  }
});
test("reply-linked card order survives reversed delivery and timestamps", () => {
  const messages = [
    { id: 2, createdAt: "2026-01-01", applicationStartOffer: { replyId: 1 } },
    { id: 1, createdAt: "2026-01-02" },
    { id: 3, createdAt: "2026-01-03" },
  ];
  assert.deepEqual(
    orderApplicationMessages(messages).map((m) => m.id),
    [1, 2, 3]
  );
});
