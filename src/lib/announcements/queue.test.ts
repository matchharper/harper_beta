import assert from "node:assert/strict";
import test from "node:test";
import { createAnnouncementQueue, type AnnouncementReceipts } from "./queue";

const announcements = [4, 2, 1, 3, 5].map((day) => ({
  id: `notice-${day}`,
  publishedAt: `2026-01-0${day}T00:00:00Z`,
}));

function memoryReceipts() {
  const byUser = new Map<string, Set<string>>();
  const receipts: AnnouncementReceipts = {
    async listSeen(userId) {
      return new Set(byUser.get(userId));
    },
    async claim(userId, id) {
      const seen = byUser.get(userId) ?? new Set<string>();
      if (seen.has(id)) return false;
      seen.add(id);
      byUser.set(userId, seen);
      return true;
    },
  };
  return receipts;
}

test("oldest first, only displayed items are consumed, maximum three per visit", async () => {
  const receipts = memoryReceipts();
  const options = {
    announcements,
    receipts,
    userId: "one",
    shownThisVisit: new Set<string>(),
  };
  const queue = await createAnnouncementQueue(options);
  assert.deepEqual([...(await receipts.listSeen("one"))], []);
  assert.equal((await queue.next())?.id, "notice-1");
  assert.deepEqual([...(await receipts.listSeen("one"))], ["notice-1"]);
  assert.equal((await queue.next())?.id, "notice-2");
  assert.equal((await queue.next())?.id, "notice-3");
  assert.equal(await queue.next(), null);
  const remounted = await createAnnouncementQueue(options);
  assert.equal(await remounted.next(), null);
  const nextVisit = await createAnnouncementQueue({
    ...options,
    shownThisVisit: new Set(),
  });
  assert.equal((await nextVisit.next())?.id, "notice-4");
});

test("account receipts survive visits and remain independent between users", async () => {
  const receipts = memoryReceipts();
  await receipts.claim("one", "notice-1");
  const one = await createAnnouncementQueue({
    announcements,
    receipts,
    userId: "one",
    shownThisVisit: new Set(),
  });
  const two = await createAnnouncementQueue({
    announcements,
    receipts,
    userId: "two",
    shownThisVisit: new Set(),
  });
  assert.equal((await one.next())?.id, "notice-2");
  assert.equal((await two.next())?.id, "notice-1");
});

test("future notices are excluded and another device's new receipt is skipped", async () => {
  const receipts = memoryReceipts();
  const queue = await createAnnouncementQueue({
    announcements,
    receipts,
    userId: "one",
    shownThisVisit: new Set(),
    now: Date.parse("2026-01-02T12:00:00Z"),
  });
  await receipts.claim("one", "notice-1");
  assert.equal((await queue.next())?.id, "notice-2");
  assert.equal(await queue.next(), null);
});

test("simultaneous close requests consume just one notice", async () => {
  const receipts = memoryReceipts();
  const queue = await createAnnouncementQueue({
    announcements,
    receipts,
    userId: "one",
    shownThisVisit: new Set(),
  });
  const [first, duplicate] = await Promise.all([queue.next(), queue.next()]);
  assert.equal(first?.id, "notice-1");
  assert.equal(duplicate?.id, "notice-1");
  assert.deepEqual([...(await receipts.listSeen("one"))], ["notice-1"]);
});

test("a failed receipt write does not report a displayed notice or consume the allowance", async () => {
  const shownThisVisit = new Set<string>();
  const receipts: AnnouncementReceipts = {
    async listSeen() {
      return new Set();
    },
    async claim() {
      throw new Error("offline");
    },
  };
  const queue = await createAnnouncementQueue({
    announcements,
    receipts,
    userId: "one",
    shownThisVisit,
  });
  await assert.rejects(queue.next(), /offline/);
  assert.equal(shownThisVisit.size, 0);
});
