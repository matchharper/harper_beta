import assert from 'node:assert/strict';
import Module from 'node:module';
import test from 'node:test';
import { NextRequest } from 'next/server';

test('workspace language saves only for workspace managers and is returned for the picker', async t => {
  for (const [key, value] of Object.entries({NEXT_PUBLIC_SUPABASE_URL:'https://locale.invalid',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture', SUPABASE_SERVICE_ROLE_KEY:'fixture', OPENAI_API_KEY:'fixture'})) {
    const before = process.env[key]; process.env[key] = value;
    t.after(() => { if (before === undefined) delete process.env[key]; else process.env[key] = before; });
  }
  const mod = Module as any, load = mod._load;
  t.mock.method(mod, '_load', function(this: unknown, name: string, ...args: unknown[]) {
    if (name === 'server-only') return {};
    return load.call(this, name, ...args);
  });
  let authority = 'owner', scope = 'organization', failSave = false;
  const workspace = {company_workspace_id:'workspace', company_name:'Fixture', locale:null as string|null,
    company_db_id:null, is_reviewing:false, updated_at:'2026-10-27T00:00:00Z'};
  const writes: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo|URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://locale.invalid', 'No production requests');
    const json = (body: unknown, status=200) => new Response(JSON.stringify(body),
      {status, headers:{'Content-Type':'application/json'}});
    if (url.pathname === '/auth/v1/user') return json({id:'actor', email:'fixture@example.test',
      aud:'authenticated', app_metadata:{}, user_metadata:{}});
    if (url.pathname === '/rest/v1/company_user_workspace') return json(authority ? [{authority, access_scope:scope,
      team_id:scope === 'team' ? 'team' : null}] : []);
    if (url.pathname === '/rest/v1/company_workspace_teams') return json([{id:'team',name:'Fixture team'}]);
    if (url.pathname === '/rest/v1/company_data') return json(null);
    if (url.pathname === '/rest/v1/company_workspace') {
      assert.equal(url.searchParams.get('company_workspace_id'), 'eq.workspace');
      if (init?.method === 'PATCH') {
        if (failSave) return json({message:'Save unavailable'},500);
        const patch = JSON.parse(String(init.body));
        writes.push(patch); Object.assign(workspace,patch);
      } else if (url.searchParams.get('select')?.includes('company_name')) {
        assert.ok(url.searchParams.get('select')?.split(',').map(s=>s.trim()).includes('locale'));
      }
      return json(workspace);
    }
    assert.fail(`Unexpected request ${url.pathname}`);
  });
  t.mock.method(console, 'error', () => {});
  const { PATCH } = await import('./route');
  const save = (locale: unknown, authenticated=true) => PATCH(new NextRequest('https://harper.invalid/api/org/workspace', {
    method:'PATCH',headers:{...(authenticated ? {Authorization:'Bearer fixture'} : {}),'Content-Type':'application/json'},
    body:JSON.stringify({workspaceId:'workspace',locale}),
  }));
  assert.equal((await save('ko',false)).status,401);
  for (const [role,access] of [['viewer','organization'],['admin','team'],['','organization']]) {
    authority=role;scope=access;
    assert.equal((await save('ko')).status,403);
  }
  assert.deepEqual(writes,[]);
  for (const [role,locale] of [['owner','ko'],['admin','en']]) {
    authority=role;scope='organization';
    const response=await save(locale);
    assert.equal(response.status,200);
    assert.equal((await response.json()).workspace.locale,locale);
    const { getOrgWorkspaceLocale } = await import('@/lib/org/workspaceLocale.server');
    assert.equal(await getOrgWorkspaceLocale('workspace'),locale, 'Automatic messages read the saved workspace language');
  }
  assert.deepEqual(writes,[{locale:'ko'},{locale:'en'}]);
  assert.equal((await save('invalid')).status,400);
  failSave=true;
  assert.equal((await save('ko')).status,500);
  assert.equal(workspace.locale,'en');
});
