import assert from "node:assert/strict";
import test from "node:test";
import { formatCompanyIntroContext, readCompanyIntroContext, type CompanyIntroContext } from "./companyIntro";

export const introContext: CompanyIntroContext = {
  intro: { id: "intro-1", role_id: "role-1", recommendation_id: "rec-1", requested_at: "2026-11-06T01:02:03Z", company_appeal: "배포 자동화 경험을 바탕으로 플랫폼의 설계부터 운영까지 맡아주실 수 있을 것 같아 만나고 싶습니다.", candidate_sent_at: null },
  role: { roleId: "role-1", name: "Platform Engineer", description: "서비스 배포 플랫폼을 설계하고 운영합니다.\n지원 자격: Kubernetes 운영 경험.\n함께 결정할 범위: 온콜 운영 방식.", companyName: "Cedar", companyDescription: "Cedar는 개발팀의 배포 업무를 줄이는 제품을 만듭니다.", location: "서울", workMode: "hybrid", compensation: "협의" },
  history: [{ id: "old-rec", created_at: "2026-09-02T01:02:03Z", opportunity_type: "internal_recommendation", feedback: "dislike", feedback_reason: "당시에는 온콜이 어려웠어요." }],
};

test("initial Career context contains the whole public JD, attributed appeal, prior response and actual saved recommendation", () => {
  const text = formatCompanyIntroContext({ ...introContext,
    role: { ...introContext.role, privateHiringBrief: "SECRET_BRIEF", selection_reason: "SECRET_SELECTION" } as any });
  assert.ok(text.includes(introContext.role.description));
  assert.ok(text.includes(introContext.role.companyDescription));
  assert.ok(text.includes(introContext.intro.company_appeal));
  assert.ok(text.includes(introContext.history[0].feedback_reason!));
  assert.match(text, /Saved recommendation: rec-1/);
  assert.match(text, /historyTab=new&id=role-1/);
  assert.match(text, /2026-11-06 10:02/);
  assert.doesNotMatch(text, /SECRET_|2026-11-06T|preFinalDelivery/);
});

test("context loading is bound to the request owner and delivery run and reads the public-role projection", async () => {
  const reads: any[] = [];
  const admin = {
    from(table: string) {
      const read = { table, filters: [] as any[] }; reads.push(read);
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { read.filters.push([key,value]); return query; },
        neq: (key: string, value: unknown) => { read.filters.push([`not ${key}`,value]); return query; },
        single: async () => ({data: introContext.intro,error:null}),
        order: async () => ({data:introContext.history,error:null}),
      }; return query;
    },
    async rpc(name: string, args: unknown) { reads.push({name,args}); return {data:introContext.role,error:null}; },
  } as any;
  const run = { id:"run-1",talent_id:"candidate-1",conversation_id:"conversation-1",status:"handed_off",trigger:"immediate_opportunity_requested",created_at:"2026-11-06T01:02:03Z",trigger_payload:{companyIntroCandidateId:"intro-1"} };
  assert.ok((await readCompanyIntroContext(admin,run)).includes("Cedar"));
  assert.deepEqual(reads[0].filters,[["id","intro-1"],["talent_id","candidate-1"],["delivery_run_id","run-1"]]);
  assert.deepEqual(reads.find(r=>r.name),{name:"read_career_internal_role_v1",args:{p_talent:"candidate-1",p_role:"role-1"}});
  assert.equal(await readCompanyIntroContext(admin,{...run,trigger_payload:{}}),"");
});
