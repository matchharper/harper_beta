/** Read actual multi-version history through the production reader in a local UI clone. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

async function main() {
  process.umask(0o077);
  const root = path.resolve(__dirname, '..');
  const runs = path.join(root, 'docs/evaluation/company-agentic-role-search/runs');
  const id = process.argv.find(arg => arg.startsWith('--run='))?.slice(6);
  if (!id || !/^[-a-zA-Z0-9_.]+$/.test(id)) throw Error('Existing local browser run required');
  const directory = path.join(runs, id);
  const read = (file: string) => JSON.parse(readFileSync(path.join(directory, file), 'utf8'));
  const metadata = read('sandbox.json'), identity = read('browser-auth.json');
  if (!metadata.database.startsWith('harper_agentic_') || new URL(metadata.url).hostname !== '127.0.0.1') throw Error('Local evaluation clone required');
  const target = path.join(directory, 'history-reader-audit.json');
  if (existsSync(target)) throw Error('Preserve existing history audit');
  process.env.NEXT_PUBLIC_SUPABASE_URL = metadata.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-evaluation-only';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-evaluation-only';
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if (url.hostname !== '127.0.0.1' || url.origin !== new URL(metadata.url).origin) throw Error('Non-local read blocked');
    return realFetch(input, init);
  }) as typeof fetch;
  const { createClient } = await import('@supabase/supabase-js');
  const { readCompanyRoleSearch, formatCompanyRoleSearch } = await import('../src/lib/companyFirstSearch/agenticSearch');
  const admin: any = createClient(metadata.url, 'local-evaluation-only', {auth: {persistSession: false, autoRefreshToken: false}});
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await admin.from('company_role_candidate_evaluations').select('id,talent_id,brief_version,stage,run_id')
      .eq('role_id', identity.roleId).order('id').range(offset, offset + 999);
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 1000) break;
  }
  const candidates = [...new Set(rows.map(row => row.talent_id))].sort();
  const talentId = candidates.find(id => {
    const own = rows.filter(row => row.talent_id === id);
    return new Set(own.map(row => row.brief_version)).size > 1 && own.some(row => row.stage === 3);
  });
  if (!talentId) throw Error('Actual multi-version candidate with presentation is unavailable');
  const base = {admin, user: identity.user, workspaceId: identity.workspaceId};
  const pages = [];
  let offset: number | null = 0;
  do {
    const input = {roleId: identity.roleId, view: 'evaluations', briefVersion: 'all', talentIds: [talentId], limit: 2, offset};
    const result = await readCompanyRoleSearch({...base, input});
    pages.push({input, result, formatted: formatCompanyRoleSearch(result)});
    offset = result.nextOffset;
  } while (offset !== null);
  const observed = pages.flatMap(page => page.result.items);
  const expected = rows.filter(row => row.talent_id === talentId);
  const actualIds = observed.map(row => row.id).sort(), expectedIds = expected.map(row => row.id).sort();
  const versions = [...new Set(expected.map(row => row.brief_version))].sort();
  const filtered = [];
  for (const briefVersion of versions) {
    const input = {roleId: identity.roleId, view: 'evaluations', briefVersion, talentIds: [talentId], limit: expected.length};
    filtered.push({input, result: await readCompanyRoleSearch({...base, input})});
  }
  const result = {reviewedAt: new Date().toISOString(), modelCalls: 0, writes: 0,
    runnerHash: createHash('sha256').update(readFileSync(__filename)).digest('hex'),
    source: 'Actual completed case data; production reader and formatter; local exact-identity auth transport',
    talentId, versions, expectedRows: expected.length, returnedRows: observed.length,
    completeIdsMatch: JSON.stringify(actualIds) === JSON.stringify(expectedIds),
    filteredVersionsMatch: filtered.every(page => page.result.items.every(row => row.brief_version === page.input.briefVersion)),
    pages, filtered};
  writeFileSync(target, JSON.stringify(result, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({output: target, versions: versions.length, expectedRows: expected.length, returnedRows: observed.length, completeIdsMatch: result.completeIdsMatch, filteredVersionsMatch: result.filteredVersionsMatch}));
}

main().catch(error => {console.error(error); process.exitCode = 1;});
