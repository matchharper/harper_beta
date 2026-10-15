import test from "node:test";
import assert from "node:assert/strict";
import type { TalentDocumentRow } from "@/lib/talentOnboarding/models";
import { applicationAttachment, applicationAttachmentName, documentFingerprint } from "./resumeAttachment";
import { createSimulationSession, simulationSessionContext } from "./session";
import { createPreparation } from "./preparation";
import { buildPreparationPrompt } from "./preparationPrompt";
import { SIMULATION_TOOL_NAMES } from "./sessionTool";

const document = () => ({id: "generated", file_name: "Resume.pdf", revision: 2,
  origin_type: "harper_generated_resume", kind: "resume", is_deleted: false,
  storage_path: null, structured_content: {schema_version: 1, content: {
    language: "en", basics: {name: "Test Candidate"},
  }}} as unknown as TalentDocumentRow);
const render = async () => ({pdf: Buffer.from("test PDF"), text: "Test Candidate", pageCount: 1});
const download = async () => {throw new Error("Generated resumes must not use storage download");};

test("generated resume exports the selected revision and fingerprints actual attachment bytes", async () => {
  const doc = document();
  const result = await applicationAttachment({read: async () => doc, download, render});
  assert.equal(result.bytes.toString(), "test PDF");
  assert.equal(result.fingerprint, documentFingerprint(doc));
  assert.equal(result.contentHash.length, 64);
  assert.equal(doc.storage_path, null);
});

test("revoked ownership and revision changes during rendering block attachment", async () => {
  let current: TalentDocumentRow | null = document();
  await assert.rejects(applicationAttachment({read: async () => current, download,
    render: async () => {current = null; return render();}}), /not found/);
  current = document();
  await assert.rejects(applicationAttachment({read: async () => current, download,
    render: async () => {current!.revision = (current!.revision ?? 0) + 1; return render();}}), /changed/);
});

test("uploaded original is downloaded unchanged; no PDF fallback after render failure", async () => {
  const doc = {...document(), origin_type: "upload", storage_path: "private/original.pdf"};
  const result = await applicationAttachment({read: async () => doc, download: async path => {
    assert.equal(path, doc.storage_path); return Buffer.from("original");
  }});
  assert.equal(result.bytes.toString(), "original");
  await assert.rejects(applicationAttachment({read: async () => document(), download,
    render: async () => {throw new Error("renderer failed");}}), /renderer failed/);
});

test("mode advertises real resume capability and reopens source-specific writing", () => {
  const s = createSimulationSession({roleRef: "role:test", roleName: "Engineer", documentId: "resume", documentName: "Resume"});
  s.preparation = createPreparation();
  assert.ok(SIMULATION_TOOL_NAMES.includes("generate_resume"));
  assert.equal(simulationSessionContext(s, SIMULATION_TOOL_NAMES).selectedResume.directEditingAvailable, true);
  assert.equal(simulationSessionContext(s, []).selectedResume.directEditingAvailable, false);
  const prompt = buildPreparationPrompt(s, SIMULATION_TOOL_NAMES).map(b => b.text).join("\n");
  assert.ok(SIMULATION_TOOL_NAMES.includes("ready_for_role"));
  assert.doesNotMatch(prompt, /tools are not connected yet/);
});

test("real generated PDF survives question and approval waits before local form submission", {skip: process.env.RESUME_PDF_TEST !== "1"}, async () => {
  const {chromium} = await import("playwright-core");
  const artifact = await applicationAttachment({read: async () => document(), download});
  assert.equal(artifact.bytes.subarray(0,4).toString(), "%PDF");
  const browser = await chromium.launch({headless: true, executablePath: process.env.RESUME_CHROMIUM_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"});
  try {
    const page = await browser.newPage();
    await page.setContent(`<form><input type="file" name="resume" required><input name="answer" required><button>Submit</button></form><p id="receipt"></p>
      <script>document.querySelector('form').onsubmit=async e=>{e.preventDefault(); const f=e.target.resume.files[0];document.querySelector('#receipt').textContent='TEST-ACCEPTED '+f.name+' '+f.size+' '+e.target.answer.value;};</script>`);
    await page.locator('[name=resume]').setInputFiles({name: artifact.document.file_name, mimeType: "application/pdf", buffer: artifact.bytes});
    const s = createSimulationSession({roleRef: "role:fixture", roleName: "Fixture", documentId: "generated", documentName: "Resume"});
    s.preparation = createPreparation(); s.analysisStatus = "completed";
    s.activity = {version: 1, offerId: 1, outputs: {}, batches: []};
    const {askApplicationInput, finishApplicationAnswer} = await import("./applicationInput");
    const {mutateSimulationSession} = await import("./session");
    let state = askApplicationInput(s, {purpose: "Required answer", items: [{kind: "question", title: "Availability?"}]}, "required");
    state = finishApplicationAnswer(mutateSimulationSession(state, {action:"respond",actionId: state.actions[0].id,response:{decision:"answer",text:"Next month"}}, 1));
    assert.equal(state.activity!.batches[0].status, "submitted");
    await page.locator('[name=answer]').fill(state.activity!.batches[0].responses[state.actions[0].id].text!);
    assert.equal(await page.locator('[name=resume]').evaluate((el: HTMLInputElement) => el.files![0].size), artifact.bytes.length);
    assert.equal(await page.locator('#receipt').textContent(), "");
    state = askApplicationInput(state, {purpose:"Submit",items:[{kind:"choice",title:"Submit these files and answers?",options:[{id:"yes",label:"Submit"},{id:"no",label:"Cancel"}]}]}, "approval");
    const id = state.activity!.batches.at(-1)!.itemIds[0];
    state = finishApplicationAnswer(mutateSimulationSession(state, {action:"respond",actionId:id,response:{decision:"answer",optionId:"yes"}}, 2));
    assert.equal(state.activity!.batches.at(-1)!.responses[id].optionId, "yes");
    await page.getByRole('button', {name: 'Submit'}).click();
    assert.equal(await page.locator('#receipt').textContent(), `TEST-ACCEPTED Resume.pdf ${artifact.bytes.length} Next month`);
  } finally {await browser.close();}
});

test("simulation prompt early return still includes the shared resume authoring contract", async () => {
  const {buildCareerConversationPromptPlan} = await import("../prompts/conversationPlan");
  const {resolveCareerChatTools} = await import("../llmTools");
  const s = createSimulationSession({roleRef:"job:test",roleName:"Engineer",documentId:"d",documentName:"Resume"});
  s.preparation = createPreparation();
  const {toolNames} = resolveCareerChatTools({channel:"chat",isOnboardingDone:true,simulationActive:true,simulationPreparation:true});
  const plan = buildCareerConversationPromptPlan({channel:"chat",conversationMode:"simulation",simulationSession:s,toolNames,isOnboardingDone:true,profile:null,structuredProfileText:"",talentContextSection:""});
  const block = plan.promptBlocks.find(b => b.key === "tool_policy");
  assert.ok(block);
  assert.match(block.text, /read_document\(format=structured\)/);
  assert.match(block.text, /accepted suggestions and explicit editing instructions/);
  assert.doesNotMatch(block.text, /Call generate_resume/);
});

 test("public submission names use the person name while uploaded supporting files retain readable names", () => {
  assert.equal(applicationAttachmentName(document()), "Test_Candidate_resume.pdf");
  assert.equal(applicationAttachmentName({kind:"resume",file_name:"My CV.docx",origin_type:"upload"}), "My_CV.docx");
  assert.equal(applicationAttachmentName({file_name:"cover letter.pdf"}), "cover_letter.pdf");
  assert.equal(applicationAttachmentName({kind:"resume",file_name:"3a233b16-84a9-8178-bea9-7e6031178f00.pdf"}), "resume.pdf");
 });
