import assert from "node:assert/strict";
import Module from "node:module";
import { before, test } from "node:test";
let server: typeof import("./server");
before(async()=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="unit-test";
  const mod=Module as any, original=mod._load;
  mod._load=function(name:string,...args:unknown[]){return name==="server-only"?{}:original.call(this,name,...args);};
  try { server=await import("./server"); } finally { mod._load=original; }
});
function fixture(bound=false, restored=false) {
  const calls:Array<{name:string,args:any}>=[];
  const admin={
    from(table:string) {
      const query={select(){return query;},eq(){return query;},
        async single(){return {data: table==="talent_messages"?{content:"네, 다시 관심 있습니다."}:{recommendation_id:"rec", response_disposition:restored?"positive":null},error:null};},
        async maybeSingle(){return query.single();}};
      return query;
    },
    async rpc(name:string,args:any):Promise<any> {
      calls.push({name,args});
      if(name==="ops_private_contact_for_message_v1") return {data:bound?"private-request":null,error:null};
      if(name==="ops_private_contact_for_recommendation_v1") return {data:"private-request",error:null};
      if(name==="record_ops_candidate_reply_v1") return {data:{status:"recorded",idempotent:false,restored:true},error:null};
      if(name==="create_company_talent_relay_v2") throw new Error("ordinary-transport-reached");
      throw new Error(`Unexpected operation: ${name}`);
    },
  };
  return {admin,calls};
}
test("general feedback adapter records the actual answer privately without a company relay",async()=>{
  const {admin,calls}=fixture();
  const result=await server.recordOpsCandidateDecision({admin,recommendationId:"rec",sourceMessageId:10,talentId:"talent",resume:true});
  assert.equal(result?.status,"recorded");
  assert.deepEqual(calls.at(-1),{name:"record_ops_candidate_reply_v1",args:{p_request_id:"private-request",p_talent_id:"talent",p_source_message_id:10,p_content:"네, 다시 관심 있습니다.",p_resume:true}});
  assert.equal(calls.some(c=>c.name==="create_company_talent_relay_v2"),false);
});
test("a separately authorized ordinary contact is not captured by an old private request, including attachments",async()=>{
  const {admin,calls}=fixture();
  await assert.rejects(server.createCompanyTalentRelay({admin,connectionId:"recommendation:rec",sourceMessageId:11,talentId:"talent",relayContent:"새 이력서를 전달해 주세요",documentId:"resume"}),/ordinary-transport-reached/);
  assert.equal(calls.some(c=>c.name==="ops_private_contact_for_recommendation_v1"),false);
  assert.equal(calls.at(-1)?.args.p_document_id,"resume");
});
test("a source bound to the private request cannot use the ordinary connection to transmit",async()=>{
  const {admin,calls}=fixture(true);
  await server.createCompanyTalentRelay({admin,connectionId:"recommendation:rec",sourceMessageId:10,talentId:"talent",relayContent:"관심 있습니다",resumeConfirmed:true});
  assert.equal(calls.at(-1)?.name,"record_ops_candidate_reply_v1");
  assert.equal(calls.some(c=>c.name==="create_company_talent_relay_v2"),false);
  await assert.rejects(server.createCompanyTalentRelay({admin,connectionId:"recommendation:other-rec",sourceMessageId:10,talentId:"talent",relayContent:"관심 있습니다"}),/scope_mismatch/);
});
test("private decision cannot proceed without candidate authored evidence",async()=>{
  const {admin}=fixture();
  await assert.rejects(server.recordOpsCandidateDecision({admin,recommendationId:"rec",sourceMessageId:NaN,talentId:"talent",resume:true}),/evidence_not_found/);
});

test("a new unscoped rejection after recovery uses the ordinary decision path",async()=>{
  const {admin,calls}=fixture(false,true);
  assert.equal(await server.recordOpsCandidateDecision({admin,recommendationId:"rec",sourceMessageId:12,talentId:"talent",resume:false}),null);
  assert.equal(calls.some(c=>c.name==="record_ops_candidate_reply_v1"),false);
});
