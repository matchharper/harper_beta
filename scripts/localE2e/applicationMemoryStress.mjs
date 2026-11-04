import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { root, privateDir, stackEnv, readJson, writeJson } from './env.mjs';

const version = Number(process.env.HARPER_APPLICATION_MEMORY_VERSION || '3');
if (![3, 4].includes(version)) throw Error('Expected v3 or v4 fixture');
const dir = path.join(privateDir, `application-memory-v${version}`);
const fixture = readJson(path.join(dir, 'fixture.json'));
const data = readJson(path.join(root, 'docs/evaluation/application-memory-reuse/retrieval-context-v3.json'));
const { env } = stackEnv();
const sql = postgres(env.DATABASE_URL, { max: 1 });
try {
  if (new URL(env.DATABASE_URL).hostname !== '127.0.0.1' || (await sql`select id from local_e2e.environment`)[0]?.id !== 'harper-local-e2e') throw Error('Local test DB required');
  if (!readJson(path.join(dir, 'receipt-a.json'))) throw Error('Complete the first real application before adding retrieval context');
  const previous = readJson(path.join(dir, 'retrieval-context-seed.json'));
  const before = previous?.before ?? await sql`select ref, content, source_refs from talent_contexts where talent_id=${fixture.userId} and deleted_at is null order by ref`;
  if (!before.length) throw Error('Preserve storage failure; do not seed target facts');
  const source = [{ type: 'local_e2e_retrieval_context', originId: fixture.fixture }];
  const entries = data.topics.flatMap(topic => data.entriesPerTopic.map(detail => `${topic}: ${detail}`));
  const applied = [];
  for (let offset = 0; offset < entries.length; offset += 12) {
    const changes = entries.slice(offset, offset + 12).map(content => ({ op: 'add', collection: 'memory', content, importance: 1, source_refs: source }));
    const [row] = await sql`select mutate_talent_contexts(p_talent_id => ${fixture.userId}::uuid, p_changes => ${sql.json(changes)}::jsonb, p_request_id => ${fixture.fixture + '-retrieval-' + offset}::text) as result`;
    applied.push(row.result);
  }
  Object.assign(process.env, env);
  const { refreshTalentContextEmbeddings } = await import('../../src/lib/talentOnboarding/talentContexts.ts');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const seeded = await sql`select id from talent_contexts where talent_id=${fixture.userId} and source_refs @> ${sql.json(source)}::jsonb and deleted_at is null`;
  for (let offset = 0; offset < seeded.length; offset += 20) {
    await refreshTalentContextEmbeddings({ admin, userId: fixture.userId, ids: seeded.slice(offset, offset + 20).map(row => Number(row.id)) });
  }
  const indexed = await sql`select count(*)::int as count from talent_contexts where talent_id=${fixture.userId} and source_refs @> ${sql.json(source)}::jsonb and embedding is not null`;
  writeJson(path.join(dir, 'retrieval-context-seed.json'), { before, entries, applied, indexed });
  if (indexed[0].count !== entries.length) throw Error('Retrieval background must have real embeddings');
  console.log(`Added ${entries.length} unrelated synthetic background rows; target facts untouched.`);
} finally {
  await sql.end();
}
