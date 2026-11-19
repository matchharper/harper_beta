import assert from "node:assert/strict";
import postgres from "postgres";
import { stackEnv } from "./env.mjs";

// Compare the storage read only. Access checks, provider calls and network latency
// are outside this measurement. Both layouts contain the same synthetic receipts.
const { env } = stackEnv();
assert.equal(new URL(env.DATABASE_URL).hostname, "127.0.0.1");
const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
try {
  const marker = await sql`select id from local_e2e.environment`;
  assert.deepEqual(marker.map(row => row.id), ["harper-local-e2e"]);
  const result = await sql.begin(async db => {
    await db`create temporary table bench_operations (like public.talent_external_operations including defaults) on commit drop`;
    await db`insert into bench_operations(id,user_id,kind,idempotency_key,status,request,result,created_at)
      select md5(i::text)::uuid, md5(('owner-' || (i%200))::text)::uuid,
        case when (i/200 + i%200)%5=0 then 'resource_search' else 'other_operation' end,
        i::text, 'completed',
        jsonb_build_object('searchReceipt', true, 'source', 'companies', 'purpose', 'Discover a team',
          'scope', jsonb_build_object('query', case when (i/200)%13=0 then 'community AI' else 'voice software' end)),
        jsonb_build_object('count',i%4), timestamptz '2026-11-16 00:00:00+00' - i * interval '1 minute'
      from generate_series(0,199999) as series(i)`;
    await db`create temporary table bench_history on commit drop as
      select id,user_id,status,request,result,created_at from bench_operations where kind='resource_search'`;
    await db`create index bench_operations_recent on bench_operations(user_id,created_at desc,id desc) where kind='resource_search'`;
    await db`create index bench_history_recent on bench_history(user_id,created_at desc,id desc)`;
    await db`analyze bench_operations`;
    await db`analyze bench_history`;
    const totals = (await db`select count(*)::int as operations,
      count(*) filter (where kind='resource_search')::int as receipts, count(distinct user_id)::int as owners
      from bench_operations`)[0];
    const metrics = [];
    for (const topic of ["", "community AI"]) {
      function select(layout, owner) {
        const source = layout === "mixed" ? db`bench_operations` : db`bench_history`;
        const kind = layout === "mixed" ? db`and kind='resource_search'` : db``;
        return db`with terms as (
            select distinct word from regexp_split_to_table(lower(trim(${topic}::text)),'[[:space:]]+') word
            where word<>''
          )
          select id, created_at, status, request-'sourceRefs'-'mailboxGeneration'-'execution_environment' as request, result
          from ${source}
          cross join lateral (
            select count(*) matched from terms
            where strpos(lower(concat_ws(' ',request->>'source',request->>'purpose',request->>'scope')),word)>0
          ) hits
          where user_id=md5(${'owner-' + owner})::uuid ${kind} and request->>'searchReceipt'='true'
            and (${topic}::text='' or hits.matched>0)
          order by case when ${topic}::text='' then 0 else hits.matched end desc, created_at desc,id desc limit 5`;
      }
      const durations = {mixed: [], dedicated: []};
      for (let pair = 0; pair < 110; pair++) {
        const owner = (pair*37)%200;
        const mixed = await select("mixed", owner);
        const dedicated = await select("dedicated", owner);
        assert.equal(mixed.length, 5);
        assert.deepEqual(mixed, dedicated);
        const order = pair%2 === 0 ? ["mixed", "dedicated"] : ["dedicated", "mixed"];
        for (const layout of order) {
          const [row] = await db`explain (analyze, timing off, format json) ${select(layout, owner)}`;
          if (pair >= 10) durations[layout].push(row["QUERY PLAN"][0]["Execution Time"]);
        }
      }
      for (const [layout, samples] of Object.entries(durations)) {
        samples.sort((a,b) => a-b);
        metrics.push({query: topic || "recent", layout, samples: samples.length, medianMs: (samples[49]+samples[50])/2, p95Ms: samples[94]});
      }
    }
    return {postgres: (await db`show server_version`)[0].server_version, ...totals, warmCache: true, metrics};
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
