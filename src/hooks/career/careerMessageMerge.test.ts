import assert from "node:assert/strict";
import test from "node:test";
import { createCareerMessageMerger } from "./careerMessageMerge";
import type { CareerMessage } from "@/components/career/types";

const message = (
  id: string,
  extra: Partial<CareerMessage> = {},
): CareerMessage => ({
  id,
  role: "assistant",
  messageType: "chat",
  content: id,
  createdAt: "2026-10-30T00:00:00Z",
  ...extra,
});

test("live activity text survives an older history snapshot without marking an empty chat bubble as typing", () => {
  const merge = createCareerMessageMerger();
  const saved = message("1", { messageType: "career_turn_activity", content: "", workReplyId: "reply", workPending: true, workEvents: [] });
  const live = message("live:reply", { ...saved, id: "live:reply", typing: false,
    workEvents: [{ id: "message:0", kind: "message", text: "Hello there" }] });
  const merged = merge([saved], [live]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].typing, false);
  assert.equal(merged[0].workEvents?.[0].text, "Hello there");
  assert.equal(merge([{ ...saved, workPending: false }], [live])[0].workPending, false);
});

test("a final reply hydrated after disconnect replaces live text even without its older activity row", () => {
  const merge = createCareerMessageMerger();
  const live = message("live:reply", { messageType: "career_turn_activity", workReplyId: "reply", workPending: true, typing: true });
  const final = message("42", { content: "Hello!", workReplyId: "reply", workPending: false });
  assert.deepEqual(merge([final], [live]), [final]);
  const stopped = message("43", { messageType: "career_turn_activity", workReplyId: "reply", workPending: false });
  assert.deepEqual(merge([stopped], [live]), [stopped]);
});

test("an early stopped optimistic request reconciles to its saved identity", () => {
  const merge = createCareerMessageMerger();
  const saved = message("42", { role: "user", content: "Original request", clientRequestId: "client-request", turnStopped: true });
  const optimistic = message("temp-user-1", { role: "user", content: "Original request", clientRequestId: "client-request", turnStopped: true });
  assert.deepEqual(merge([saved], [optimistic]), [saved]);
});

test("local replies keep their insertion anchors even when history arrives in another order", () => {
  const merge = createCareerMessageMerger();
  const history = [message("a"), message("b"), message("c")];
  Object.freeze(history);
  history.forEach(Object.freeze);
  assert.deepEqual(
    merge(history, [
      message("b"),
      message("d"),
      message("e"),
      message("c"),
      message("f"),
    ]).map((m) => m.id),
    ["a", "b", "d", "e", "c", "f"],
  );
  assert.deepEqual(
    merge(history, [
      message("c"),
      message("x"),
      message("a"),
      message("y"),
    ]).map((m) => m.id),
    ["a", "y", "b", "c", "x"],
  );
  assert.deepEqual(
    merge([], [message("x"), message("y")]).map((m) => m.id),
    ["x", "y"],
  );
});

test("hydrated history wins unless a local stream, logs or newer simulation is still needed", () => {
  const merge = createCareerMessageMerger();
  const persisted = message("a", {
    content: "Hydrated",
    opportunityMentions: [{ roleId: "role-1", label: "Role 1" }],
  });
  assert.equal(
    merge([persisted], [message("a", { content: "Stale" })])[0],
    persisted,
  );
  for (const extra of [
    { typing: true },
    { thinkingLogs: ["Search complete"] },
  ]) {
    const local = message("a", { content: "Local", ...extra });
    const merged = merge([persisted], [local])[0];
    assert.equal(merged.content, "Local");
    assert.equal(merged.opportunityMentions, persisted.opportunityMentions);
  }
  const simulation = (updatedAt: string) =>
    ({ updatedAt }) as NonNullable<CareerMessage["simulation"]>;
  const earlier = message("a", {
    simulation: simulation("2026-10-29T00:00:00Z"),
  });
  const later = message("a", {
    simulation: simulation("2026-10-30T00:00:00Z"),
  });
  assert.equal(merge([later], [earlier])[0], later);
  assert.equal(merge([earlier], [later])[0].simulation, later.simulation);
});

test("unchanged source pairs retain identity and edits from either source take effect", () => {
  const merge = createCareerMessageMerger();
  const persisted = message("a", {
    opportunityMentions: [{ roleId: "role-1", label: "Role 1" }],
  });
  const local = message("a", { content: "Local", thinkingLogs: ["Complete"] });
  const first = merge([persisted], [local])[0];
  assert.equal(merge([persisted], [local, message("b")])[0], first);
  const editedLocal = { ...local, content: "Edited" };
  const edited = merge([persisted], [editedLocal])[0];
  assert.notEqual(edited, first);
  assert.equal(edited.content, "Edited");
  const updatedHistory = {
    ...persisted,
    opportunityMentions: [{ roleId: "role-2", label: "Role 2" }],
  };
  assert.equal(
    merge([updatedHistory], [editedLocal])[0].opportunityMentions,
    updatedHistory.opportunityMentions,
  );
  const history = [updatedHistory];
  assert.equal(merge(history, []), history);
  assert.notEqual(
    merge([persisted], [local])[0],
    first,
    "clearing local state must release the previous merge cache",
  );
});

test("doubling overlapping history and local messages keeps identifier work linear", () => {
  const countReads = (length: number) => {
    let reads = 0;
    const messages = Array.from({ length }, (_, index) => ({
      ...message(String(index)),
      get id() {
        reads++;
        return String(index);
      },
    }));
    createCareerMessageMerger()(messages, messages);
    return reads;
  };
  const small = countReads(500);
  const large = countReads(1000);
  assert.ok(small > 0);
  assert.ok(
    large <= small * 3,
    `identifier reads grew from ${small} to ${large}`,
  );
});
