import test from "node:test";
import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import {MessagesProvider} from "@/i18n/useMessage";
import {ApplicationQuestionHistoryRow} from "./ApplicationQuestionHistoryRow";
import {askApplicationInput} from "@/lib/career/simulation/applicationInput";
import {createSimulationSession} from "@/lib/career/simulation/session";
import {createPreparation} from "@/lib/career/simulation/preparation";
import {applicationQuestionMessages} from "@/lib/career/simulation/questionHistory";

test("waiting becomes a collapsed response record with stable identity", () => {
  let state = createSimulationSession({roleName:"Engineer",roleRef:"job:test", documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";
  state.preparation=createPreparation();
  state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"Prepare", introduction:"Please share a detail.",items:[{kind:"question",title:"What did you build?"},{kind:"material",title:"Portfolio?"}]},"test");
  const before=applicationQuestionMessages(state)[0];
  const render=()=>renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationQuestionHistoryRow batch={applicationQuestionMessages(state)[0].applicationQuestions}/></MessagesProvider>);
  assert.match(render(), /Waiting for your answers/);
  assert.doesNotMatch(render(), /<details/);
  const batch=state.activity!.batches[0];
  batch.status="submitted";
  batch.responses={[batch.itemIds[0]]:{decision:"answer",text:"An evaluation pipeline"},[batch.itemIds[1]]:{decision:"skip"}};
  const html=render();
  assert.equal(applicationQuestionMessages(state)[0].id,before.id);
  assert.match(html,/Reviewed 2 suggestions/);
  assert.match(html,/An evaluation pipeline/);
  assert.match(html,/Skipped/);
  assert.match(html,/aria-expanded="false"/);
  assert.match(html,/inert=""/);
  assert.doesNotMatch(html,/<details/);
  batch.status="cancelled";
  assert.match(render(),/Cancelled questions/);
});

test("stored question anchors hydrate in place without repeating their introduction", async () => {
  const {toTalentMessageResponse} = await import("@/lib/talentOnboarding/models");
  const {toUiMessage} = await import("@/hooks/career/careerHelpers");
  let state = createSimulationSession({roleName:"Engineer",roleRef:"job:test",documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";
  state.preparation=createPreparation();
  state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"Prepare",introduction:"Please share a detail.",items:[{kind:"question",title:"What did you build?"}]},"persisted");
  const batch=state.activity!.batches[0];
  batch.introMessageId=731;
  const stored=toUiMessage(toTalentMessageResponse({id:731,user_id:"u",conversation_id:"c",role:"assistant",message_type:"application_activity",content:batch.introduction!,payload:{activityId:state.sessionId,view:"questions",batchId:batch.id},created_at:batch.createdAt}));
  assert.equal(stored.content,"", "unhydrated references must not render as chat text");
  assert.equal(stored.applicationActivity?.view,"questions");
  const projected=applicationQuestionMessages(state)[0];
  assert.equal(projected.id,stored.id);
  const messages=new Map([[String(stored.id),stored]]);
  messages.set(String(projected.id),projected);
  assert.equal(messages.size,1,"refresh and live projection replace the persisted anchor");
  const html=renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationQuestionHistoryRow batch={projected.applicationQuestions}/></MessagesProvider>);
  assert.equal(html.split("Please share a detail.").length-1,1);
  assert.equal(html.split("Waiting for your answers").length-1,1);
  batch.status="submitted";
  assert.equal(applicationQuestionMessages(state)[0].id,731);
});

test("resume review question retains the shared document card before the waiting record", async () => {
  const {RouterContext} = await import('next/dist/shared/lib/router-context.shared-runtime');
  const {formatCareerDocumentLink} = await import('@/lib/career/documentLinks');
  const router = {push: async () => true} as unknown as import('next/router').NextRouter;
  let state = createSimulationSession({roleName:'Engineer',roleRef:'job:test',documentId:'cv',documentName:'CV'});
  state.analysisStatus='completed'; state.preparation=createPreparation();
  state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:'Review resume',introduction:'Open the resume to review it.\n\n'+formatCareerDocumentLink({id:'11111111-1111-4111-8111-111111111111',title:'Role resume.pdf'}),items:[{kind:'material',documentPurpose:'final_resume',documentId:'11111111-1111-4111-8111-111111111111',title:'Apply with this file?'}]},'review');
  const html=renderToStaticMarkup(<RouterContext.Provider value={router}><MessagesProvider locale="en"><ApplicationQuestionHistoryRow batch={applicationQuestionMessages(state)[0].applicationQuestions}/></MessagesProvider></RouterContext.Provider>);
  assert.match(html,/Role resume.pdf/);
  assert.match(html,/Open the resume to review it/);
  assert.doesNotMatch(html,/documentId:/);
  assert.ok(html.indexOf('Role resume.pdf') < html.indexOf('Waiting for your answers'));
});

test("long review is rendered as Markdown in chat before the question record",()=>{
  let state=createSimulationSession({roleName:"Role",roleRef:"job:test",documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";state.preparation=createPreparation();state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"review",reviewMarkdown:"## Motivation\n\nA **reviewed** paragraph.\n\n- First point\n- Second point\n\n| Company | Role |\n| --- | --- |\n| Example | Engineer |",items:[{kind:"choice",title:"Use this?",options:[{id:"use",label:"Use"},{id:"revise",label:"Revise"}]}]},"review");
  const html=renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationQuestionHistoryRow batch={state.activity!.batches[0]}/></MessagesProvider>);
  assert.match(html,/<h2[^>]*>Motivation<\/h2>/);
  assert.match(html,/<strong[^>]*>reviewed<\/strong>/);
  assert.match(html,/overflow-x-auto/);
  assert.match(html,/<td[^>]*class="[^"]*px-/);
  assert.match(html,/list-disc/);
  assert.ok(html.indexOf("Motivation")<html.indexOf("Waiting for your answers"));
});

test("answered history shows the user's accepted inline edit instead of the original suggestion",()=>{
  let state=createSimulationSession({roleName:"Role",roleRef:"job:test",documentId:"cv",documentName:"CV"});
  state.analysisStatus="completed";
  state.preparation=createPreparation();
  state.activity={version:1,offerId:1,outputs:{},batches:[]};
  state=askApplicationInput(state,{purpose:"suggestions",items:[{kind:"change",title:"Clarify API work?",edits:[{target:"Experience",originalText:"Built APIs",suggestedText:"Original suggestion"}]}]},"inline");
  const batch=state.activity!.batches[0];
  batch.status="submitted";
  batch.responses[batch.itemIds[0]]={decision:"accept",edits:[{target:"Experience",originalText:"Built APIs",suggestedText:"The user's exact revised wording"}]};
  const html=renderToStaticMarkup(<MessagesProvider locale="en"><ApplicationQuestionHistoryRow batch={batch}/></MessagesProvider>);
  assert.match(html,/The user&#x27;s exact revised wording/);
  assert.doesNotMatch(html,/Original suggestion/);
});
