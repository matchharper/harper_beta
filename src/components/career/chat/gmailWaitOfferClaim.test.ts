import assert from "node:assert/strict";
import test from "node:test";
import { claimGmailWaitOffer, decideGmailWaitOffer } from "./gmailWaitOfferClaim";

const HOUR = 60 * 60 * 1000;

function withStorage(run: (store: Map<string, string>) => void, broken = false) {
  const store = new Map<string, string>();
  const previous = (globalThis as any).window;
  (globalThis as any).window = { localStorage: {
    getItem: (key: string) => { if (broken) throw new Error("blocked"); return store.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (broken) throw new Error("blocked"); store.set(key, value); },
  } };
  try { run(store); } finally { (globalThis as any).window = previous; }
}

test("one running application per 24 hours gets the offer, and that reply keeps it", () => {
  withStorage(() => {
    const now = Date.parse("2026-11-20T08:00:00Z");
    // A finished reply in history never starts the offer.
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "old", active: false, now }), false);
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "a", active: true, now }), true);
    // Same reply after the Google round trip or a reload, even once finished.
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "a", active: false, now: now + HOUR }), true);
    // Another application the same day gets nothing.
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "b", active: true, now: now + 23 * HOUR }), false);
    // A different account on the same device counts separately.
    assert.equal(claimGmailWaitOffer({ userId: "v", replyId: "c", active: true, now: now + HOUR }), true);
    // After 24 hours the next running application gets it, and the old reply lets it go.
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "d", active: true, now: now + 25 * HOUR }), true);
    assert.equal(claimGmailWaitOffer({ userId: "u", replyId: "a", active: false, now: now + 25 * HOUR }), false);
  });
});

test("blocked storage still limits the offer within the open tab", () => {
  withStorage(() => {
    const now = Date.parse("2026-11-20T08:00:00Z");
    assert.equal(claimGmailWaitOffer({ userId: "blocked", replyId: "a", active: true, now }), true);
    assert.equal(claimGmailWaitOffer({ userId: "blocked", replyId: "b", active: true, now: now + HOUR }), false);
    assert.equal(claimGmailWaitOffer({ userId: "blocked", replyId: "a", active: false, now: now + HOUR }), true);
  }, true);
});

test("a new offer is recorded once for the Gmail card test, never again for the reply that owns it", () => {
  withStorage(() => {
    const now = Date.parse("2026-11-24T08:00:00Z");
    const decide = (replyId: string, active: boolean, at: number, writeConnected = false) =>
      decideGmailWaitOffer({ userId: "u", replyId, active, now: at, writeConnected });
    // Someone who can already send through Gmail is not offered or recorded.
    assert.deepEqual(decide("a", true, now, true), { show: false, record: false });
    assert.deepEqual(decide("a", true, now), { show: true, record: true });
    // The effect running again, a reload, or a finished reply keeps the card without a second record.
    assert.deepEqual(decide("a", true, now), { show: true, record: false });
    assert.deepEqual(decide("a", false, now + HOUR), { show: true, record: false });
    // Connecting through the card keeps it (showing 연결됨) and records nothing.
    assert.deepEqual(decide("a", false, now + HOUR, true), { show: true, record: false });
    // Another application the same day is neither shown nor recorded.
    assert.deepEqual(decide("b", true, now + 2 * HOUR), { show: false, record: false });
    assert.deepEqual(decide("c", true, now + 25 * HOUR), { show: true, record: true });
  });
});
