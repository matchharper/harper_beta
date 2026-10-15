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

test("final file confirmation preserves the exact offered document fingerprint", () => {
  let s = askApplicationInput(fixture(), {purpose: "Final resume", items: [{kind: "material", documentPurpose: "final_resume", title: "Use this file?", documentId: "new-resume", documentName: "Role.pdf", documentFingerprint: "revision-2"}]}, "file-v2");
  const id = s.activity!.batches[0].itemIds[0];
  s = finishApplicationAnswer(mutateSimulationSession(s, {action: "respond", actionId: id, response: {decision: "document", documentId: "new-resume"}}, 5));
  assert.equal(s.preparation!.finalDocumentId, "new-resume");
  assert.equal(s.preparation!.finalDocumentFingerprint, "revision-2");
  assert.equal(s.documentId, "cv");
});

test("writing a new version preserves analysis and history, cancels stale file questions and requires reconfirmation", async () => {
  const {recordApplicationResume, assertApplicationResumeWrite} = await import('./resumeWorkflow');
  let s = askApplicationInput(fixture(), {purpose:"File",items:[{kind:"material",title:"Use this file?",documentPurpose:"final_resume",documentId:"cv",documentFingerprint:"old"}]}, "old-file");
  s.preparation!.finalDocumentId = "cv";
  s.preparation!.finalDocumentFingerprint = "old";
  s = recordApplicationResume(s, {documentId:"new-resume",revision:2,fileName:"Role.pdf"});
  assert.equal(s.documentId, "cv");
  assert.equal(s.preparation!.workingResume!.documentId, "new-resume");
  assert.equal(s.preparation!.finalDocumentId, null);
  assert.equal(s.preparation!.finalDocumentFingerprint, null);
  assert.equal(s.activity!.batches[0].status, "cancelled");
  assert.equal(s.activity!.batches[0].items![0].documentId, "cv");
  assert.doesNotThrow(() => assertApplicationResumeWrite(s));
  s.browser = {id:"run",status:"waiting",startedAt:s.startedAt,updatedAt:s.startedAt,documentId:"cv",documentHash:"old",url:"https://example.com",purpose:"Apply"};
  assert.throws(() => assertApplicationResumeWrite(s), /Stop the current application browser/);
});

test("review text is versioned with the question and submission retains that exact version", () => {
  let s = createSimulationSession({roleRef:"job:test",roleName:"Role",documentId:"cv",documentName:"CV"});
  s.analysisStatus="completed";s.preparation=createPreparation();s.activity={version:1,offerId:1,outputs:{},batches:[]};
  const input={purpose:"motivation",reviewMarkdown:"## Motivation\n\nExact proposed answer.",items:[{kind:"choice",title:"Use this answer?",options:[{id:"use",label:"Use"},{id:"revise",label:"Revise"}]}]};
  s=askApplicationInput(s,input,"r1");
  const batch=s.activity!.batches[0];
  s.preparation!.responses[batch.itemIds[0]]={decision:"answer",optionId:"revise",text:"Revise"};
  s=finishApplicationAnswer(s);
  assert.equal(s.activity!.batches[0].responses[batch.itemIds[0]].reviewId,batch.review!.id);
  assert.equal(s.activity!.batches[0].review!.markdown,input.reviewMarkdown);
  s=askApplicationInput(s,{...input,reviewMarkdown:"Revised answer."},"r2");
  assert.equal(s.activity!.batches[1].review!.version,2);
  assert.notEqual(s.activity!.batches[1].review!.id,batch.review!.id);
  assert.deepEqual(s.activity!.batches[1].responses,{});
  assert.equal(s.activity!.batches[0].review!.markdown,input.reviewMarkdown);
});

test("application method and exact document persist independently of final submission approval", () => {
  for (const method of ["harper", "manual"] as const) {
    let s=askApplicationInput(fixture(),{purpose:"Choose how to apply",items:[{kind:"material",title:"How to apply?",documentPurpose:"final_resume",documentId:"cv",documentFingerprint:"revision-2"}]},`method-${method}`);
    const id=applicationQuestionItems(s)[0].id;
    s.preparation!.responses[id]={decision:"document",documentId:"cv",applicationMethod:method};
    s=finishApplicationAnswer(s);
    assert.equal(s.preparation!.applicationMethod,method);
    assert.equal(s.preparation!.finalDocumentId,"cv");
    assert.equal(s.activity!.batches[0].responses[id].applicationMethod,method);
    assert.equal(s.browser,undefined);
  }
});

test("an explicit question kind replaces a material presentation without rewriting history", () => {
  const initial = askApplicationInput(fixture(), {purpose: "writing", items: [{kind: "material", title: "Motivation", description: "Prepare a letter"}]}, "material");
  const original = initial.activity!.batches[0].items![0];
  const next = askApplicationInput(initial, {purpose: "notes", replace: true, items: [{actionId: original.id, kind: "question", title: "What draws you to this work?"}]}, "notes");
  const question = applicationQuestionItems(next)[0];
  assert.equal(question.inputKind, "question");
  assert.deepEqual(question.options, []);
  assert.notEqual(question.id, original.id);
  assert.equal(next.activity!.batches[0].items![0].inputKind, "material");
  assert.equal(next.activity!.batches[0].status, "cancelled");
  assert.equal(initial.activity!.batches[0].status, "waiting");
});
