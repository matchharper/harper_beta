import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSimulationSession,
  mutateSimulationSession,
  endSimulationSession,
} from "./session";
import { createPreparation } from "./preparation";
import {
  askApplicationInput,
  finishApplicationAnswer,
  applicationQuestionItems,
} from "./applicationInput";
function fixture() {
  const s = createSimulationSession({
    roleName: "Research Engineer",
    roleRef: "job:research",
    documentId: "cv",
    documentName: "Resume",
  });
  s.analysisStatus = "completed";
  s.preparation = createPreparation();
  s.activity = { version: 1, offerId: 1, outputs: {}, batches: [] };
  return s;
}
test("questions yield a pending batch; free text is not acceptance; completion does not start a draft", () => {
  let s = askApplicationInput(
    fixture(),
    {
      purpose: "Identify relevant experiments",
      introduction: "A detail will help ground the draft.",
      items: [
        { kind: "question", title: "Which experiments did you own?" },
        {
          kind: "choice",
          title: "Which document will you prepare?",
          options: [
            { id: "self", label: "I'll edit the file" },
            { id: "draft", label: "Help draft the wording" },
          ],
        },
      ],
    },
    "ask-1"
  );
  assert.equal(applicationQuestionItems(s).length, 2);
  assert.throws(() =>
    askApplicationInput(
      s,
      {
        purpose: "Another",
        introduction: "More",
        items: [{ kind: "question", title: "Why?" }],
      },
      "ask-2"
    )
  );
  assert.deepEqual(
    askApplicationInput(
      s,
      {
        purpose: "Ignored retry",
        introduction: "More",
        items: [{ kind: "question", title: "Why?" }],
      },
      "ask-1"
    ),
    s
  );
  const [a, b] = applicationQuestionItems(s);
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: a.id,
        response: {
          decision: "answer",
          text: "I owned evaluation, not training.",
        },
      },
      10
    )
  );
  assert.equal(s.preparation?.currentItemId, b.id);
  assert.equal(s.activity?.batches[0].status, "waiting");
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      { action: "respond", actionId: b.id, response: { decision: "skip" } },
      11
    )
  );
  assert.equal(s.activity?.batches[0].status, "submitted");
  assert.equal(s.preparation?.generation.status, "idle");
  assert.equal(s.preparation?.showInputs, false);
  assert.equal(s.preparation?.responses[a.id].decision, "answer");
  assert.equal(applicationQuestionItems(s).length, 0);
});
test("replacement retains unchanged answers; ending disables questions and retains facts", () => {
  let s = askApplicationInput(
    fixture(),
    {
      purpose: "Facts",
      introduction: "Please clarify.",
      items: [
        { kind: "question", title: "What impact?" },
        { kind: "material", title: "Portfolio" },
      ],
    },
    "one"
  );
  const [a, b] = applicationQuestionItems(s);
  s = finishApplicationAnswer(
    mutateSimulationSession(
      s,
      {
        action: "respond",
        actionId: a.id,
        response: { decision: "answer", text: "Reduced latency by 30%." },
      },
      20
    )
  );
  s = askApplicationInput(
    s,
    {
      purpose: "Focus",
      introduction: "One remaining detail.",
      replace: true,
      items: [{ actionId: a.id }, { actionId: b.id }],
    },
    "replace"
  );
  assert.equal(s.activity?.batches[0].status, "cancelled");
  assert.equal(s.preparation?.responses[a.id].text, "Reduced latency by 30%.");
  assert.equal(s.preparation?.currentItemId, b.id);
  s = endSimulationSession(s, "user");
  assert.equal(applicationQuestionItems(s).length, 0);
  assert.equal(s.activity?.batches[1].status, "cancelled");
  assert.equal(s.preparation?.responses[a.id].text, "Reduced latency by 30%.");
});

test("an additional supported edit has its own input ID and preserves experience-specific previews",()=>{
 const s=askApplicationInput(fixture(),{purpose:"Review the confirmed change",introduction:"Please review this example.",items:[{kind:"change",title:"Clarify evaluation ownership",target:"Two research experiences",reason:"The role requires evaluation design.",edits:[{target:"Orion",originalText:"Worked on evaluation",suggestedText:"Designed the evaluation suite"},{target:"Vega",originalText:"",suggestedText:"Maintained the benchmark dataset"}]}]},"edit");
 const item=applicationQuestionItems(s)[0];
 assert.match(item.id,/^Q-/);
 assert.equal(item.edits?.length,2);
 assert.equal(item.needsConfirmation,false);
 const answered=finishApplicationAnswer(mutateSimulationSession(s,{action:"respond",actionId:item.id,response:{decision:"ignore"}},1));
 assert.equal(answered.preparation?.responses[item.id].decision,"ignore");
 assert.equal(answered.preparation?.generation.status,"idle");
});

test("question history preserves question and option snapshots across subsequent edits", () => {
  const state = askApplicationInput(fixture(), {
    purpose: "Choose a route", introduction: "Choose how to prepare your application.",
    items: [{kind: "choice", title: "Which route?", options: [{id: "a", label: "Edit myself"}, {id: "b", label: "Get help"}]}],
  }, "snapshot");
  const batch = state.activity!.batches[0];
  state.actions[0].title = "A different question";
  state.actions[0].options![0].label = "Changed label";
  assert.equal(batch.items![0].title, "Which route?");
  assert.equal(batch.items![0].options![0].label, "Edit myself");
  assert.equal(batch.introduction, "Choose how to prepare your application.");
});
