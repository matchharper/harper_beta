import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Execute the migration's exact receipt-reuse block in a disposable PostgreSQL
// interpreter. No company/talent Role fixture or production client is created.
const migration=readFileSync('supabase/migrations/20261029090000_reuse_active_company_search.sql','utf8');
const receiptBlock=migration.slice(migration.indexOf('  perform pg_advisory_xact_lock'),
  migration.indexOf('  select cr.status'));
const block=migration.slice(migration.indexOf("  if not (command ? 'publication')"),
  migration.indexOf("  options:=command||jsonb_build_object('briefVersion'"));
const workspace='00000000-0000-4000-8000-000000000001';
const role='00000000-0000-4000-8000-000000000002';
const run='00000000-0000-4000-8000-000000000003';
const command={roleId:role,scope:'all',startStage:1,limit:5000,recommendCount:0};

test('concurrent-turn calls reuse only identical in-flight evaluation work',async()=>{
  const db=new PGlite();
  try {
    assert.ok(block.includes('select * into queued'));
    assert.ok(migration.indexOf('pg_advisory_xact_lock')<migration.indexOf(block));
    await db.exec(`create table company_first_search_runs(id uuid,company_workspace_id uuid,role_id uuid,
      contract_version text,status text,request_options jsonb,result jsonb default '{}',created_at timestamptz default now());
      create function isolated_receipt(p_company_workspace_id uuid,p_role_id uuid,command jsonb,version text,p_request_id text)
      returns jsonb language plpgsql as $$declare queued public.company_first_search_runs%rowtype;
      begin ${receiptBlock} ${block} return null; end$$;`);
    await db.query(`insert into company_first_search_runs(id,company_workspace_id,role_id,contract_version,status,request_options)
      values($1,$2,$3,'company_agentic_role_search_v1','running',$4)`,
      [run,workspace,role,JSON.stringify({...command,briefVersion:'brief',requestId:'first-call',sourceMessageId:1,reason:'First wording',recommendationTarget:10})]);
    let call=0;
    const lookup=async(input:Record<string,unknown>,version='brief',requestId=`call-${++call}`)=>(await db.query<{receipt:any}>(
      'select isolated_receipt($1,$2,$3,$4,$5) receipt',[workspace,role,JSON.stringify(input),version,requestId])).rows[0].receipt;
    const secondCommand={...command,sourceMessageId:2,reason:'Different wording',recommendationTarget:5};
    const reused=await lookup(secondCommand,'brief','second-call');
    assert.equal(reused.runId,run);assert.equal(reused.status,'already_running');assert.equal(reused.sourceMessageId,1);
    for(const input of [
      {...command,scope:'unassessed'}, {...command,startStage:2}, {...command,limit:100},
      {...command,talentIds:[role]}, {...command,publication:{kind:'add'}}, {...command,recommendCount:1},
    ]) assert.equal(await lookup(input),null);
    assert.equal(await lookup(command,'changed-brief'),null);
    await db.query("update company_first_search_runs set status='queued'");
    assert.equal((await lookup(command)).status,'already_queued');
    for(const status of ['succeeded','failed','interrupted']) {
      await db.query('update company_first_search_runs set status=$1',[status]);
      assert.equal(await lookup(command),null);
      const retry=await lookup(secondCommand,'changed-brief','second-call');
      assert.equal(retry.runId,run);assert.equal(retry.status,'already_completed');assert.equal(retry.runStatus,status);
      assert.equal(retry.briefVersion,'brief');assert.equal(retry.sourceMessageId,1);
    }
    await assert.rejects(lookup({...secondCommand,scope:'unassessed'},'brief','second-call'),/search_request_conflict/);
    assert.equal((await db.query<{count:number}>('select count(*)::int count from company_first_search_runs')).rows[0].count,1);
  } finally {await db.close();}
});
