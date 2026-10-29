import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
import { OrgHttpError } from "@/lib/org/httpError";
import type { RoleStartSession } from "./session";

let answer!: typeof import("./service").answerRoleStartQuestion;
let begin!: typeof import("./service").beginRoleStartDraft;
let current: RoleStartSession;
let savedInput: Parameters<typeof import("./session").saveRoleStartSession>[0] | undefined;
let allowed = true;
let collide = false;
let writes = 0;
const background: Array<() => Promise<void>> = [];

before(async () => {
  const loader = Module as unknown as { _load: (name: string, parent?: { filename?: string }, ...rest: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function(name, parent, ...rest) {
    if (name === "server-only") return {};
    if (parent?.filename?.endsWith("/roleStart/service.ts")) {
      if (["./brief", "./questions", "./chatAnswers"].includes(name)) return original.call(this, name, parent, ...rest);
      if (name === "next/server") return { after: (run: () => Promise<void>) => background.push(run) };
      if (name === "@/lib/org/server") return { OrgHttpError };
      if (name === "./access") return { readRoleStartAccess: async () => { if (!allowed) throw new OrgHttpError(403, "Forbidden"); } };
      if (name === "./references") return { roomForAnotherQuestion: (count: number) => count < 5 };
      if (name === "./session") return {
        onBriefSaved: () => {},
        isRoleStartEnded: (phase: string) => ["failed", "superseded"].includes(phase),
        loadRoleStartSession: async () => structuredClone(current),
        saveRoleStartSession: async (input: NonNullable<typeof savedInput>) => {
          writes++; savedInput = input;
          if (collide) { collide = false; current.revision++; return null; }
          current = { ...current, ...input.patch, revision: current.revision + 1 } as RoleStartSession;
          return current;
        },
        saveRoleStartBrief: () => assert.fail("a draft answer must not save a published Brief version"),
      };
      // Any synchronous use of the full loader, LLM or old chat writer fails the test.
      return new Proxy({}, { get: (_target, property) => {
        if (property === "__esModule") return true;
        return () => assert.fail(`unexpected response-path dependency: ${name}.${String(property)}`);
      } });
    }
    return original.call(this, name, parent, ...rest);
  };
  try { ({ answerRoleStartQuestion: answer, beginRoleStartDraft: begin } = await import("./service")); }
  finally { loader._load = original; }
});

function reset(hasNext = true) {
  const question = { id: "q1", question: "경험?", why: "", chips: [], status: "pending" as const, overlap: null, askedAt: "" };
  current = { roleId: "r", workspaceId: "w", phase: "questions", revision: 1, refinedAnswers: 0,
    brief: { summary: "", hardConditions: [], criteria: [], keywords: [] },
    questions: { history: [], candidates: hasNext ? [{ ...question, id: "q2" }] : [], probes: [], stopped: false },
    pendingQuestion: question,
  } as unknown as RoleStartSession;
  background.length = 0; writes = 0; savedInput = undefined;
}

const input = { roleId: "r", workspaceId: "w", user: { id: "u" } as never, questionId: "q1", text: "스타트업 경험 중요" };

test("prepared next question returns after the atomic save, before context, LLM or Slack work", async () => {
  reset();
  const result = await answer(input);
  assert.equal(result.pendingQuestion?.id, "q2");
  assert.equal(writes, 1);
  assert.equal(savedInput?.chat?.answer?.content, input.text);
  assert.equal(result.questions.history[0].answer?.text, input.text);
  assert.equal(background.length, 2, "timing and refinement run after the durable answer");
});

test("concurrent background revision retries the answer, while duplicate and unauthorized answers cannot save", async () => {
  reset(); collide = true;
  assert.equal((await answer(input)).pendingQuestion?.id, "q2");
  assert.equal(writes, 2);
  await assert.rejects(answer(input), { status: 409 });
  assert.equal(writes, 2);
  reset(); allowed = false;
  await assert.rejects(answer(input), { status: 403 });
  assert.equal(writes, 0);
  allowed = true;
});

test("an empty prepared queue still needs background question generation", async () => {
  reset(false);
  const result = await answer(input);
  assert.equal(result.phase, "questions");
  assert.equal(result.pendingQuestion, null);
  assert.equal(background.length, 2);
});

test("a skip is settled in the save, but cannot jump over an earlier free-text refinement", async () => {
  reset();
  assert.equal((await answer({ ...input, text: null, skip: true })).refinedAnswers, 1);
  reset();
  current.questions.history.push({ ...current.pendingQuestion!, id: "earlier", status: "answered",
    answer: { chipId: null, text: "아직 반영 중인 답변", applied: null } });
  assert.equal((await answer({ ...input, text: null, skip: true })).refinedAnswers, 0);
});

test("resuming an existing flow returns its session without loading full creation context or drafting again", async () => {
  reset(); current.phase = "review";
  const result = await begin(input);
  assert.equal(result.session?.phase, "review");
  assert.equal((await result.completion)?.phase, "review");
  assert.equal(writes, 0);
  assert.equal(background.length, 0);
  allowed = false;
  await assert.rejects(begin(input), { status: 403 });
  allowed = true;
});
