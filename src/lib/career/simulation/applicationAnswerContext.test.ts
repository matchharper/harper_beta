import test from "node:test";
import assert from "node:assert/strict";
import { applicationAnswerContext } from "./applicationAnswerContext";
import type { SimulationSession } from "./session";

test("browser receives exact reviewed text and the meaning of a selected option", () => {
  const batch = { purpose: "motivation", status: "submitted", items: [{
    id: "q1", title: "Use this answer?", proposal: "My exact reviewed answer.",
    options: [{ id: "a", label: "Request changes" }, { id: "b", label: "Use this answer" }],
  }], responses: { q1: { decision: "answer", optionId: "a" } } };
  const session = { activity: { batches: [batch, { ...batch, status: "cancelled" }] } } as unknown as SimulationSession;
  const context = applicationAnswerContext(session);
  assert.equal(context.length, 1);
  assert.equal(context[0].questions[0].contentShown, "My exact reviewed answer.");
  assert.equal(context[0].questions[0].selectedOption?.label, "Request changes");
  batch.items[0].proposal = "Different text";
  assert.equal(context[0].questions[0].contentShown, "My exact reviewed answer.");
});

test("main context includes each response once and preserves corrections outside the snapshot", async () => {
  const {simulationSessionContext,createSimulationSession}=await import("./session");
  const {createPreparation}=await import("./preparation");
  const {askApplicationInput,finishApplicationAnswer}=await import("./applicationInput");
  let state=createSimulationSession({roleRef:"job:example",roleName:"Role",documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";state.preparation=createPreparation();state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"Scope",items:[{kind:"question",title:"What did you build?"}]},"q");
  const id=state.activity!.batches[0].itemIds[0];
  state.preparation!.responses[id]={decision:"answer",text:"UNIQUE_CONFIRMED_BACKEND_DETAIL"};state=finishApplicationAnswer(state);
  const original=JSON.stringify(state);
  let context=simulationSessionContext(state);
  assert.equal(JSON.stringify(context).split("UNIQUE_CONFIRMED_BACKEND_DETAIL").length-1,1);
  assert.equal(context.questionBatches[0].questions[0].question,"What did you build?");
  assert.equal(JSON.stringify(state),original);
  state.preparation!.responses[id]={decision:"answer",text:"Corrected scope"};
  context=simulationSessionContext(state);
  assert.equal(context.preparation!.responses[id].text,"Corrected scope");
  assert.equal(context.questionBatches[0].questions[0].response?.text,"UNIQUE_CONFIRMED_BACKEND_DETAIL");
});
