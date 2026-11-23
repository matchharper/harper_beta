import assert from "node:assert/strict";
import test from "node:test";
import { claimGmailWaitOffer } from "./gmailWaitOfferClaim";

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
