import assert from "node:assert/strict";
import test from "node:test";
import { countRoleClosureRecipients } from "./roleClosurePreview";

const at = "2026-10-28T07:00:00Z";
const rec = (talent_id: string, extra = {}) => ({ talent_id, feedback: "like", saved_stage: "accepted", updated_at: at, ...extra });
const tag = (talent_id: string, tag: string) => ({ talent_id, tag, created_at: at, updated_at: at });
const event = (talent_id: string, metadata: unknown, created_at = at) => ({ talent_id, metadata, created_at, kind: "org_stage_change", text: "" });

test("closure preview counts people who accepted, including pending and connected, once", () => {
  assert.equal(countRoleClosureRecipients({
    recommendations: [rec("pending"), rec("connected"), rec("connected"),
      rec("saved", { feedback: null }), rec("positive", { feedback: "positive" }),
      rec("unanswered", { feedback: null, saved_stage: null }),
      rec("declined", { feedback: "dislike", saved_stage: null }),
      rec("closed", { saved_stage: "closed" })],
    tags: [tag("pending", "내부:연결대기"), tag("connected", "내부:연결됨")], events: [],
  }), 4);
  assert.equal(countRoleClosureRecipients({ recommendations: [], tags: [], events: [] }), 0);
});

test("closure preview preserves final-offer, candidate-stop and notification opt-out exclusions", () => {
  assert.equal(countRoleClosureRecipients({
    recommendations: [rec("offer"), rec("candidate"), rec("silent"), rec("company")],
    tags: [tag("offer", "내부:최종오퍼"), tag("candidate", "내부:프로세스중단"),
      tag("silent", "내부:아카이브"), tag("company", "내부:프로세스중단")],
    events: [event("candidate", { stage: "process_stopped", stopReason: "candidate" }),
      event("silent", { stage: "archived", notifyCandidateOnClosure: false }),
      event("company", { stage: "process_stopped", stopReason: "company" })],
  }), 1);
});

test("current tags precede older events; old stop and non-stage notes do not suppress a later closure", () => {
  assert.equal(countRoleClosureRecipients({
    recommendations: [rec("resumed"), rec("fallback", { processed_stage: "final_offer" }), rec("event-only")],
    tags: [tag("resumed", "내부:프로세스중단")],
    events: [event("resumed", { stage: "process_stopped", stopReason: "candidate" }, "2026-10-20T07:00:00Z"),
      { ...event("resumed", { stage: "final_offer" }), kind: "memo" },
      event("event-only", { stage: "final_offer" })],
  }), 1);
});
