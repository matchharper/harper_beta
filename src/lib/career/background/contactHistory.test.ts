import assert from "node:assert/strict";
import test from "node:test";
import { hasDeliveredCareerContact } from "./contactHistory";
function fixture(tables: Record<string, any[]>, failure = false) {
  return { from(table: string) {
    let rows = tables[table] ?? [];
    const q: any = {
      select: () => q,
      eq: (key: string, value: unknown) => { rows=rows.filter(r=>r[key]===value); return q; },
      not: (key: string) => { rows=rows.filter(r=>r.payload?.[key.split('->>')[1]] != null); return q; },
      contains: (key: string, value: any) => { rows=rows.filter(r=>Object.entries(value).every(([k,v])=>r[key]?.[k]===v)); return q; },
      order: () => { rows.sort((a,b)=>Number(b.id)-Number(a.id)); return q; },
      limit: () => q,
      maybeSingle: async () => ({data:rows[0]??null,error:failure ? Error('read failed'):null}),
    }; return q;
  }} as any;
}
test("email continuation requires a confirmed Career delivery to this owner and alias", async () => {
  const row={id:'mail',talent_id:'owner',direction:'outbound',status:'sent',mail_type:'career_agent',metadata:{replyTo:'thread@example.test'}};
  for(const patch of [{talent_id:'other'},{direction:'inbound'},{status:'queued'},{mail_type:'onboarding'},{metadata:{replyTo:'other@example.test'}}])
    assert.equal(await hasDeliveredCareerContact({admin:fixture({career_email_messages:[{...row,...patch}]}),userId:'owner',replyAlias:'thread@example.test'}),false);
  assert.equal(await hasDeliveredCareerContact({admin:fixture({career_email_messages:[row]}),userId:'owner',replyAlias:'thread@example.test'}),true);
});
test("web continuation is scoped to the owned conversation and actual delivered message", async () => {
  const row={id:1,user_id:'owner',conversation_id:'conversation',role:'assistant',message_type:'mail',payload:{discoveryRunId:'run'}};
  const args={userId:'owner',conversationId:'conversation'};
  assert.equal(await hasDeliveredCareerContact({...args,admin:fixture({talent_messages:[row]})}),true);
  for (const patch of [{user_id:'other'},{conversation_id:'other'},{role:'user'},{payload:{}}])
    assert.equal(await hasDeliveredCareerContact({...args,admin:fixture({talent_messages:[{...row,...patch}]})}),false);
  assert.equal(await hasDeliveredCareerContact({...args,admin:fixture({talent_messages:[row,
    {...row,id:2,role:'user',message_type:'profile_submit',payload:{}}]})}),false);
  await assert.rejects(hasDeliveredCareerContact({...args,admin:fixture({},true)}),/read failed/);
});
