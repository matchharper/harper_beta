import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalStack } from "./isolation.mjs";

const valid = () => ({ HARPER_LOCAL_E2E:"1", NODE_ENV:"development", DATABASE_URL:"postgresql://postgres:postgres@127.0.0.1:55432/postgres", OPPORTUNITY_DATABASE_URL:"postgresql://postgres:postgres@127.0.0.1:55432/postgres", NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:55431", APP_BASE_URL:"http://localhost:3000", NEXT_PUBLIC_APP_URL:"http://localhost:3000", NEXT_PUBLIC_SITE_URL:"http://localhost:3000", HARPER_LOCAL_MAIL_URL:"http://127.0.0.1:3211", RESEND_API_KEY:"local-e2e-test", SLACK_AGENT_WORKER_TARGET:"local-e2e", SLACK_HARPER_APP_ID:"A_LOCAL", SLACK_HARPER_LOCAL_APP_ID:"A_LOCAL", HARPER_LOCAL_ONLY_CHANNEL_ID:"C_TEST" });
test("local launcher refuses remote DB, provider mail keys, cloud URLs and production Slack routing",()=>{
  assert.doesNotThrow(()=>assertLocalStack(valid()));
  for(const patch of [
    {DATABASE_URL:"postgresql://u:p@production.example/db"},
    {OPPORTUNITY_DATABASE_URL:"postgresql://u:p@production.example/db"},
    {OTHER_DATABASE_URL:"postgresql://u:p@production.example/db"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://project.supabase.co"},
    {APP_BASE_URL:"https://matchharper.com"},
    {NEXT_PUBLIC_SITE_URL:"https://matchharper.com"},
    {HARPER_LOCAL_MAIL_URL:"https://api.resend.com"},
    {RESEND_API_KEY:"re_live_key"},
    {SLACK_AGENT_WORKER_TARGET:"production"},
    {SLACK_HARPER_APP_ID:"A_PROD"},
    {HARPER_LOCAL_ONLY_CHANNEL_ID:""},
    {NODE_ENV:"production"},
  ])assert.throws(()=>assertLocalStack({...valid(),...patch}));
});
test("ordinary runtime configuration is unchanged when local mode is off",()=>assert.doesNotThrow(()=>assertLocalStack({DATABASE_URL:"postgresql://remote/db"})));
