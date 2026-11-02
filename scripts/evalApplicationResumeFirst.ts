import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
config({path: ".env.local", quiet: true});
async function main() {
  const { runCareerChatAssistant } = await import("../src/lib/career/llm");
  const { CLAUDE_HAIKU_MODEL } = await import("../src/lib/llm/modelConfig");
  const { resolveCareerChatTools } = await import("../src/lib/career/llmTools");
  const { buildCareerConversationPromptPlan } = await import("../src/lib/career/prompts/conversationPlan");
  const { createSimulationSession } = await import("../src/lib/career/simulation/session");
  const { createPreparation } = await import("../src/lib/career/simulation/preparation");
  const { suggestionAction } = await import("../src/lib/career/simulation/suggestionSchema");
  const { readyForRole } = await import("../src/lib/career/simulation/readyForRole");
  const { saveApplication } = await import("../src/lib/career/simulation/saveApplication");
  const { recordResumeDelivery } = await import("../src/lib/career/simulation/applicationFollowUp");
  const { readTalentDocumentForTool } = await import("../src/lib/talentOnboarding/documentTool");
  const { applicationPreparationEvalStore } = await import("./lib/applicationPreparationEvalStore");
  const { formatToolResultText } = await import("../src/lib/llm/promptText");
  const task = "docs/evaluation/application-resume-first";
  const fixture = JSON.parse(readFileSync(`${task}/cases-v1.json`, "utf8"));
  const dir = `${task}/runs/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  mkdirSync(dir, {recursive:true, mode:0o700});
  const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value,null,2), {mode:0o600});
  const source = { id:"22222222-2222-4222-8222-222222222222", talent_id:"11111111-1111-4111-8111-111111111111", kind:"resume", file_name:"이서준.pdf", extracted_text:`이서준\nseojun@example.test\n${fixture.candidate.experience}`, revision:1, origin_type:"upload", is_deleted:false };
  const initial = createSimulationSession({roleRef:"job:resume-first-eval", roleName:fixture.role, documentId:source.id, documentName:source.file_name});
  initial.locale="ko"; initial.analysisStatus="completed"; initial.preparation=createPreparation();
  initial.activity={version:1,channel:"web",batches:[],outputs:{}};
  const accepted=suggestionAction({kind:"change",title:"담당 범위 명확히 하기",reason:"확인된 업무",edits:[{target:"경력", originalText:fixture.candidate.experience,suggestedText:fixture.candidate.accepted}]},"change");
  accepted.status="completed"; initial.actions=[accepted];
  initial.preparation.responses.change={decision:"accept"}; initial.preparation.inputRevision=1;
  initial.applicationInspection={status:"completed",runId:"public"};
  initial.applicationUrl="https://example.test/jobs/api";
  initial.applicationForm={status:"read",url:initial.applicationUrl,checkedAt:initial.startedAt,limitations:[],submission:{status:"supported"},fields:fixture.fields.map((label:string,index:number)=>({label,type:index===3?"file":index===2?"textarea":"text",required:true,options:[],instructions:"",fileTypes:index===3?["pdf"]:[],maxLength:null}))};
  const db=applicationPreparationEvalStore({messageId:10,state:initial},source as never);
  const selection=resolveCareerChatTools({simulationActive:true,simulationPreparation:true,channel:"chat",isOnboardingDone:true,responseLocale:"ko",hasActiveGmailIntegration:false});
  const plan=()=>buildCareerConversationPromptPlan({channel:"chat",isOnboardingDone:true,currentPreferences:{preferredLocale:"ko"},conversationMode:"simulation",simulationSession:db.record.state,profile:null,structuredProfileText:`이서준, seojun@example.test. 확인된 업무: ${fixture.candidate.accepted} 회사 공고는 개발자가 안정적으로 사용할 API의 설계·운영을 강조합니다.`,talentContextSection:"",toolNames:selection.toolNames});
  const fetchOriginal=globalThis.fetch;
  const signal=AbortSignal.timeout(240000);
  let requestCount=0;
  globalThis.fetch=(async(input:any,init:any)=>{
    const url=new URL(typeof input==="string"?input:(input.url??input.href));
    assert.equal(url.hostname,"api.anthropic.com","Only the configured provider is allowed");
    if(typeof init?.body==="string") { const outgoing=JSON.parse(init.body); assert.equal(outgoing.model,CLAUDE_HAIKU_MODEL);save(`provider-${++requestCount}`,outgoing); }
    return fetchOriginal(input,{...init,signal:AbortSignal.any([signal,...(init?.signal?[init.signal]:[])])});
  }) as typeof fetch;
  const transcript:any[]=[{role:"user",content:"보여준 수정안을 적용해줘. 이력서부터 준비해서 주고, 그 다음 지원 내용을 작성해줘."}];
  const turns:any[]=[];
  for(let index=0;index<2;index++) {
    const blocks=plan().promptBlocks;
    const calls:any[]=[];
    const reply=await runCareerChatAssistant({primaryModel:CLAUDE_HAIKU_MODEL,responseLocale:"ko",systemBlocks:blocks,messages:transcript,tools:selection.tools,stopAfterToolNames:selection.stopAfterToolNames,usageLabel:"eval/resume-first",executeTool:async({name,input})=>{
      const {_uiStatusMessage,...clean}=input;
      calls.push({name,input:clean});
      let result:any;
      if(name==="read_document") result=await readTalentDocumentForTool({...db.store,input:clean});
      else if(name==="ready_for_role") {const saved=await readyForRole(db.store,db.record,clean,index+1,`turn-${index}-${calls.length}`);db.setRecord(saved.record);result=saved.result;}
      else if(name==="save_application") {assert.equal(index,1,"Application writing must follow resume delivery");const saved=await saveApplication(db.store,db.record,clean,`application-${calls.length}`);db.setRecord(saved.record);result=saved.result;}
      else throw new Error(`Fixture has no additional capability: ${name}`);
      calls.at(-1).result=result;
      const updated=plan().promptBlocks;
      for(const block of blocks){const next=updated.find(b=>b.key===block.key);if(next)block.text=next.text;}
      return {...result,modelOutput:result.modelOutput??formatToolResultText(result)};
    }});
    turns.push({reply,calls,state:db.record.state}); save("turns",turns);
    assert.deepEqual(db.docs.get(source.id)?.extracted_text,source.extracted_text);
    assert.equal(db.record.state.browser,undefined);
    assert.ok(!calls.some(c=>c.name==="request_application_information"||c.name==="apply_for_role"));
    if(index===0){assert.ok(db.record.state.preparation?.finalDocumentId);assert.equal(db.record.state.applicationReview,undefined);db.setRecord({...db.record,state:recordResumeDelivery(db.record.state,20,"follow-up")});transcript.push({role:"assistant",content:reply},{role:"user",content:"이력서 전달이 완료되었습니다. 이제 확인된 지원 페이지 결과에 따라 필요한 답변과 첨부를 준비해서 저장하고 안내하세요. 추가 제출 승인은 없습니다."});}
    else {const review=db.record.state.applicationReview!;assert.ok(review?.fields[2].value);assert.equal(review.fields[3].documentId,db.record.state.preparation?.finalDocumentId);}
  }
  const paths=["src/lib/career/simulation/preparationPrompt.ts","src/lib/career/simulation/applicationWritingContract.ts","src/lib/career/simulation/readyForRole.ts","src/lib/career/simulation/saveApplication.ts",`${task}/cases-v1.json`];
  save("manifest",{dataset:fixture.version,model:CLAUDE_HAIKU_MODEL,providerRequestCount:requestCount,files:Object.fromEntries(paths.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")]))});
  console.log(JSON.stringify({dir,structuralChecks:"passed",turns:turns.map(t=>({reply:t.reply,tools:t.calls.map((c:any)=>c.name)}))},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
