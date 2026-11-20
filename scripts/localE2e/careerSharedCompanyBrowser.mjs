// Run through careerSharedCompanyStack.py --browser. Never connect application data to the base DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import postgres from 'postgres';
import { parse } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readJson, root, stackEnv, writeJson } from './env.mjs';
import { saveScreen } from '../evaluation/productionCareerBrowser.mjs';

const scenario = readJson(path.join(root, 'docs/evaluation/career-agent-autonomy/shared-company-browser-v1.json'));
const dbName = process.env.HARPER_COMPANY_E2E_DB;
assert.match(dbName, /^company_e2e_[a-f0-9]+$/);
const rest = new URL(process.env.HARPER_COMPANY_E2E_REST);
const { env } = stackEnv();
const localProviders = parse(fs.readFileSync(path.join(root, '.env.local')));
for (const key of ['EXA_API_KEY','EXA_SERVICE_API_KEY']) env[key] ||= localProviders[key] ?? '';
const authOrigin = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
const connection = new URL(env.DATABASE_URL);
for (const url of [rest, authOrigin, connection]) assert.equal(url.hostname, '127.0.0.1');
connection.pathname = '/' + dbName;
const sql = postgres(connection.href, { max: 3 });
const actorIds = [];
const admin = createClient(authOrigin.href, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const directory = path.join(root, 'docs/evaluation/career-agent-autonomy/runs', new Date().toISOString().replaceAll(':','-') + '-company-browser');
fs.mkdirSync(directory, { mode: 0o700, recursive: true });
console.log(directory);
const write = (name, data) => writeJson(path.join(directory, name + '.json'), data);

// GoTrue issues sessions on the local stack. Every application read/write goes to the empty clone.
const gateway = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const dbRequest = url.pathname.startsWith('/rest/v1/');
  if (!dbRequest && !url.pathname.startsWith('/auth/v1/')) { res.writeHead(404).end(); return; }
  const headers = { ...req.headers };
  delete headers.host;
  const upstream = dbRequest ? new URL(url.pathname.slice('/rest/v1'.length) + url.search, rest) : new URL(url.pathname + url.search, authOrigin);
  const forward = http.request(upstream, { method: req.method, headers }, (response) => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  forward.on('error', () => res.writeHead(502).end());
  req.pipe(forward);
});

async function localPort(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
const browserOrigins = new Set();
let app, browser;
async function submit(actor, origin) {
  const email = 'company-browser-' + randomUUID() + '@local.invalid';
  const password = randomBytes(32).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { localE2e: true, full_name: 'Harper ' + actor } });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  actorIds.push(userId);
  const client = createClient(authOrigin.href, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await client.auth.signInWithPassword({ email, password });
  if (auth.error) throw auth.error;
  const conversation = randomUUID();
  await sql.begin(async tx => {
    await tx`insert into talent_users(user_id,email,name,bio,resume_text) values(${userId},${email},${'Harper ' + actor},${actor === 'A' ? scenario.privateProfileA : ''},'기업용 소프트웨어 개발 경험이 있습니다.')`;
    await tx`insert into talent_setting(user_id,is_onboarding_done,profile_visibility,get_internal_recommendation,get_external_recommendation,status,preferred_locale) values(${userId},true,'dont_share',false,false,'active','ko')`;
    await tx`insert into talent_conversations(id,user_id,stage) values(${conversation},${userId},'completed')`;
  });
  const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const diagnostics = [];
  page.on('pageerror', e => diagnostics.push({ error: e.message }));
  page.on('response', async response => {
    const endpoint = new URL(response.url()).pathname;
    if (endpoint === '/api/talent/messages' || endpoint === '/api/talent/onboarding/status') {
      const body = await response.json().catch(() => null);
      diagnostics.push({ endpoint, status: response.status(), stage: body?.conversation?.stage ?? body?.conversationStage });
    }
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return browserOrigins.has(url.origin) || url.protocol === 'data:' ? route.continue() : route.abort();
  });
  await context.addInitScript(({ session, appOrigin }) => {
    if (location.origin === appOrigin && !localStorage.getItem('sb-127-auth-token')) localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
  }, { session: auth.data.session, appOrigin: origin });
  try {
    await page.goto(origin + '/career/chat', { timeout: 180000, waitUntil: 'domcontentloaded' });
    const composer = page.locator('#career-chat-composer:enabled');
    await composer.waitFor({ timeout: 150000 });
    await composer.fill(scenario[actor], { timeout: 60000 });
    const start = Date.now();
    const [chat] = await Promise.all([
      page.waitForResponse(r => new URL(r.url()).pathname === '/api/talent/chat' && r.request().method() === 'POST', { timeout: 450000 }),
      composer.press('Enter', { timeout: 60000 }),
    ]);
    const stream = await chat.text();
    write(actor + '-chat', { status: chat.status(), stream });
    assert.ok(chat.ok(), 'Career chat HTTP ' + chat.status());
    let persisted = [];
    for (let i = 0; i < 90; i++) {
      persisted = await sql`select id,role,message_type,content from talent_messages where user_id=${userId} order by id`;
      if (persisted.some(row => row.role === 'assistant' && row.content?.includes('채널'))) break;
      await delay(1000);
    }
    write(actor + '-messages', persisted);
    // Reload verifies that the answer a returning user sees was persisted.
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reply = page.locator('[data-career-message-role=assistant]').filter({hasText: '채널'}).last();
    await reply.waitFor({ timeout: 45000 });
    await page.locator('#career-chat-composer:enabled').waitFor({ timeout: 120000 });
    const rendered = await reply.innerText();
    const links = await reply.locator('a').evaluateAll(nodes => nodes.map(node => node.href));
    await saveScreen(page, directory, actor.toLowerCase() + '-reply');
    const bubble = path.join(directory, actor.toLowerCase() + '-answer.png');
    await reply.screenshot({ path: bubble });
    fs.chmodSync(bubble, 0o600);
    const logs = await sql`select type,meta_data from logs where user_id=${userId} order by created_at,id`;
    write(actor + '-logs', logs);
    const end = Date.now();
    const traces = fs.readdirSync(directory).filter(name => name.startsWith('provider-') && Number(name.split('-')[1]) >= start && Number(name.split('-')[1]) <= end);
    const inputs = traces.filter(name => name.endsWith('-request.json'));
    const tools = new Map();
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'function_call' && node.name) tools.set(node.call_id || node.id, { name: node.name, input: node.arguments });
      if (node.type === 'tool_use' && node.name) tools.set(node.id, { name: node.name, input: node.input });
      if (node.type === 'function' && node.function?.name && node.id) tools.set(node.id, { name: node.function.name, input: node.function.arguments });
      for (const child of Object.values(node)) visit(child);
    }
    for (const file of inputs) {
      const {request} = readJson(path.join(directory,file));
      visit(request?.input ?? request?.messages);
    }
    const answer = { actor, userId, conversation, rendered, links, calls: [...tools.values()], webRequests: traces.filter(name => name.endsWith('-web.json')), providerInputs: inputs.sort() };
    write(actor + '-observed', answer);
    return answer;
  } catch (error) {
    write(actor + '-failure', { error: String(error), diagnostics, url: page.url(), screen: await page.locator('body').innerText({ timeout: 3000 }).catch(() => null) });
    await page.screenshot({ path: path.join(directory, actor + '-failed.png'), timeout: 12000 }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

try {
  assert.equal((await sql`select current_database() as db`)[0].db, dbName);
  assert.equal(Number((await sql`select count(*) as n from company_datas`)[0].n), 0);
  assert.equal(Number((await sql`select count(*) as n from company_db`)[0].n), 0);
  const gatewayUrl = 'http://127.0.0.1:' + await localPort(gateway);
  const portProbe = http.createServer();
  const port = await localPort(portProbe);
  await new Promise(resolve => portProbe.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  browserOrigins.add(origin);
  browserOrigins.add(gatewayUrl);
  for (const key of ['DATABASE_URL', 'OPPORTUNITY_DATABASE_URL', 'CAREER_ROLE_SEARCH_DATABASE_URL']) env[key] = connection.href;
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL']) env[key] = gatewayUrl;
  for (const key of ['APP_BASE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SITE_URL','HARPER_LOCAL_APP_ORIGIN']) env[key] = origin;
  Object.assign(env, { HARPER_E2E_DIST_DIR: '.local/full-stack/next-company-reuse', HARPER_APPLICATION_MEMORY_TRACE_DIR: directory,
    HARPER_COMPANY_NETWORK_TRACE: '1', NODE_OPTIONS: '--import=' + path.join(root, 'scripts/localE2e/applicationMemoryTrace.mjs'),
    NEXT_TELEMETRY_DISABLED: '1' });
  assert.ok(env.EXA_API_KEY && env.OPENAI_API_KEY, 'Live research and chat provider credentials required');
  const log = fs.openSync(path.join(directory,'app.log'),'a',0o600);
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)], { env, cwd: root, stdio: ['ignore',log,log], detached: true });
  fs.closeSync(log);
  for (let i = 0; i < 120; i++) {
    try { const res = await fetch(origin + '/career/chat'); if (res.ok) break; } catch {}
    if (app.exitCode !== null || i === 119) throw Error('Next failed to start; see app.log');
    await delay(500);
  }
  browser = await chromium.launch({ headless: true });
  const a = await submit('A', origin);
  const rows = await sql`select coalesce(c.name,w.company_name) as name, d.*, career_company_datum_json_v1(d)->'sources' as sources from company_datas d join company_workspace w using(company_workspace_id) left join company_db c on c.id=w.company_db_id order by d.created_at`;
  write('shared-rows', rows);
  const b = await submit('B', origin);
  const bInputs = b.providerInputs.map(name => fs.readFileSync(path.join(directory,name),'utf8'));
  const used = rows.filter(row => bInputs.some(body => body.includes(row.id) && body.includes(row.content.split('\n').find(Boolean)?.slice(0,24) ?? row.id)));
  const details = { labels: rows.map(r=>r.label), rowsSeenByB: used.map(r=>r.id), a, b };
  write('review', details);
  assert.ok(a.providerInputs.length && b.providerInputs.length, 'Both actors require actual provider requests');
  assert.ok(a.webRequests.length && !a.calls.some(c=>c.name === 'search_companies'), 'A must research without searching workspace IDs');
  assert.ok(a.calls.some(c=>c.name === 'upsert_company') && rows.length && rows.every(r=>r.source_refs?.length), 'A must preserve sourced company research');
  assert.ok(used.length, 'B must receive a public research row created in A’s turn');
  assert.equal(b.webRequests.length, 0, 'B called the external web provider');
  assert.ok(!b.calls.some(c=>['open_url','web_search'].includes(c.name) || (c.name==='search_resources' && /"source"\s*:\s*"web"/.test(JSON.stringify(typeof c.input === 'string' ? JSON.parse(c.input) : c.input)))));
  assert.match(b.rendered, /110\s*억/);
  const articleId = href => {
    const url = new URL(href);
    return url.hostname === 'channel.io' ? url.pathname.match(/\/blog\/articles\/(?:[^/]*-)?([a-f0-9]{8})\/?$/i)?.[1] : undefined;
  };
  const cited = b.links.map(articleId).filter(Boolean);
  assert.ok(cited.includes('b44c2fff') && rows.some(row => row.sources.some(source => cited.includes(articleId(source.url)))),
    'B must link the official announcement backed by a stored observation');
  assert.ok(a.providerInputs.some(file => fs.readFileSync(path.join(directory,file),'utf8').includes(scenario.privateProfileA)),
    'A must actually receive the private profile fact before testing isolation');
  assert.ok(!JSON.stringify(rows).includes(scenario.privateProfileA) && !bInputs.some(body => body.includes(scenario.privateProfileA)) && !b.rendered.includes(scenario.privateProfileA));
  write('passed', { labels: details.labels, aTools: a.calls.map(c=>c.name), bTools: b.calls.map(c=>c.name), aExa: a.webRequests.length, bExa: b.webRequests.length });
  console.log('Browser verification passed');
} finally {
  await browser?.close();
  if (app?.pid && app.exitCode === null) { try { process.kill(-app.pid, 'SIGTERM'); } catch {} }
  for (const id of actorIds) {
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) console.error('Local test login cleanup failed',id,removed.error.message);
  }
  gateway.closeAllConnections();
  await new Promise(resolve => gateway.close(resolve));
  await sql.end();
}
