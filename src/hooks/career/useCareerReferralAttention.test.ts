import assert from "node:assert/strict";
import test from "node:test";
import {
  getCareerReferralAttentionStorageKey,
  hasSeenCareerReferral,
  markCareerReferralSeen,
} from "./useCareerReferralAttention";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("keeps referral attention until the user visits the referral tab", () => {
  const storage = new MemoryStorage();
  const userId = "attention-user-before-visit";

  assert.equal(hasSeenCareerReferral(userId, storage), false);

  markCareerReferralSeen(userId, storage);

  assert.equal(hasSeenCareerReferral(userId, storage), true);
  assert.equal(
    storage.getItem(getCareerReferralAttentionStorageKey(userId)),
    "1"
  );
});

test("stores referral attention separately for each account", () => {
  const storage = new MemoryStorage();
  const seenUserId = "attention-user-seen";
  const unseenUserId = "attention-user-unseen";

  markCareerReferralSeen(seenUserId, storage);

  assert.equal(hasSeenCareerReferral(seenUserId, storage), true);
  assert.equal(hasSeenCareerReferral(unseenUserId, storage), false);
});
