import test from "node:test";
import assert from "node:assert/strict";
import { runSimulationWorkflow, type SimulationInput } from "./workflow";
import {
  SIMULATION_STEPS,
  parseApplicationSimulation,
  type ApplicationSimulation,
} from "./types";
import {
  toTalentMessageResponse,
  type TalentMessageRow,
} from "@/lib/talentOnboarding/models";

const initial = (): ApplicationSimulation => ({
  version: 1,
  status: "running",
  roleName: "Example role",
  documentName: "resume.pdf",
  updatedAt: new Date().toISOString(),
  steps: SIMULATION_STEPS.map((key) => ({ key, status: "pending" })),
});
const input: SimulationInput = {
  role: "Public JD",
  candidate: "Candidate profile",
  resume: "Resume evidence",
  language: "Korean",
};
const result = (key: string) =>
  JSON.stringify({
    summary: `${key} conclusion`,
    report: `${key} evidence report`,
  });

test("runs separate prompts in order, freezes role rubric without candidate leakage, publishes intermediate results", async () => {
  const calls: Array<{ key: string; system: string; input: string }> = [];
  const updates: ApplicationSimulation[] = [];
  const original = initial();
  const final = await runSimulationWorkflow({
    state: original,
    input,
    complete: async (args) => {
      calls.push(args);
      return result(args.key);
    },
    publish: async (state) => {
      updates.push(state);
    },
  });
  assert.deepEqual(
    calls.map((c) => c.key),
    [...SIMULATION_STEPS]
  );
  assert.equal(new Set(calls.map((c) => c.system)).size, 3);
  assert.deepEqual(JSON.parse(calls[0].input), {
    role: input.role,
    language: input.language,
  });
  assert.deepEqual(
    JSON.parse(calls[1].input).rubric,
    JSON.parse(result("role"))
  );
  assert.deepEqual(
    JSON.parse(calls[2].input).comparison,
    JSON.parse(result("comparison"))
  );
  assert.equal(JSON.parse(calls[2].input).resume, input.resume);
  assert.equal(updates.length, 6);
  assert.equal(updates[1].steps[0].status, "completed");
  assert.equal(updates[1].steps[1].status, "pending");
  assert.equal(updates[3].steps[1].result?.summary, "comparison conclusion");
  assert.equal(final.status, "completed");
  assert.equal(original.steps[0].status, "pending");
});

test("malformed output stops downstream calls and preserves completed stages", async () => {
  const keys: string[] = [];
  const final = await runSimulationWorkflow({
    state: initial(),
    input,
    complete: async ({ key }) => {
      keys.push(key);
      return key === "role" ? result(key) : '{"summary":"missing report"}';
    },
    publish: async () => {},
  });
  assert.deepEqual(keys, ["role", "comparison"]);
  assert.equal(final.status, "failed");
  assert.equal(final.steps[0].result?.report, "role evidence report");
  assert.equal(final.steps[1].status, "failed");
  assert.equal(final.steps[2].status, "pending");
});

test("disconnect cancellation preserves the last completed result", async () => {
  const controller = new AbortController();
  const final = await runSimulationWorkflow({
    state: initial(),
    input,
    signal: controller.signal,
    complete: async ({ key }) => {
      if (key === "comparison") controller.abort();
      return result(key);
    },
    publish: async () => {},
  });
  assert.equal(final.status, "cancelled");
  assert.equal(final.steps[0].status, "completed");
  assert.equal(final.steps[1].status, "cancelled");
  assert.equal(final.steps[1].result, undefined);
});

test("timeout is a failure rather than a user cancellation", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("Timed out", "TimeoutError"));
  const final = await runSimulationWorkflow({
    state: initial(),
    input,
    signal: controller.signal,
    complete: async () => {
      throw new Error("must not call");
    },
    publish: async () => {},
  });
  assert.equal(final.status, "failed");
});

test("saved message serialization restores stage reports and raw JSON", () => {
  const state = initial();
  state.steps[0] = {
    key: "role",
    status: "completed",
    result: JSON.parse(result("role")),
  };
  const serialized = toTalentMessageResponse({
    id: 42,
    role: "assistant",
    message_type: "application_simulation",
    content: "Simulate",
    payload: state,
    created_at: new Date().toISOString(),
  } as unknown as TalentMessageRow);
  assert.deepEqual(serialized.simulation, state);
  assert.equal(parseApplicationSimulation({ ...state, steps: [] }), undefined);
  assert.equal(
    parseApplicationSimulation({
      ...state,
      steps: [{ key: "role", status: "completed" }, ...state.steps.slice(1)],
    }),
    undefined
  );
});

test("profile snapshot keeps career evidence and omits account metadata", async () => {
  const { simulationProfileSnapshot } = await import("./profileSnapshot");
  const profile = {
    talentUser: {
      user_id: "private-id",
      email: "private@example.com",
      phone_number: "private-phone",
      profile_picture: "private-photo",
      headline: "Nurse",
      bio: "Emergency care",
      location: "Seoul",
      name: "Name",
    },
    talentExperiences: [],
    talentEducations: [],
    talentExtras: [
      {
        id: "private-extra-id",
        title: "Certification",
        description: "Credential evidence",
        date: null,
        memo: null,
      },
    ],
  };
  const snapshot = simulationProfileSnapshot(profile);
  assert.match(snapshot, /Emergency care/);
  assert.match(snapshot, /Credential evidence/);
  assert.doesNotMatch(snapshot, /private|visibility|blocked/);
});

test("a stage timeout is recorded distinctly while completed stages survive", async () => {
  const final = await runSimulationWorkflow({
    state: initial(),
    input,
    complete: async ({ key }) => {
      if (key === "review")
        throw new DOMException("Deadline exceeded", "TimeoutError");
      return result(key);
    },
    publish: async () => {},
  });
  assert.equal(final.status, "failed");
  assert.equal(final.steps[1].status, "completed");
  assert.equal(final.steps[2].failureReason, "timeout");
});
