import type { TalentMessageRow } from "@/lib/talentOnboarding/server";
import { config } from 'dotenv';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { assertScenarioInputsOwned } from './evaluation/careerScenarioIsolation';
config({ path: '.env.local', quiet: true });
const opt = (name: string, fallback: string) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
async function main() {
  const { readCareerScenarioRegistry, resetCareerScenario, performCareerScenarioApplyAction } = await import('@/lib/career/devCareerScenarios.server');
  const registryFile = path.resolve(opt('--registry', '../harper_eval/scenarios/career/v1/cases.json'));
  const registry = await readCareerScenarioRegistry(registryFile);
  const only = opt('--only', '').split(',').filter(Boolean);
  const cases = registry.cases.filter(c => !only.length || only.includes(c.id));
  if (!cases.length || only.some(id => !registry.cases.some(c => c.id === id))) throw new Error('Unknown scenario');
  if (!process.argv.includes('--execute')) { console.log(JSON.stringify({ version: registry.version, sha256: registry.sha256, cases }, null, 2)); return; }
  const repeat = Number(opt('--repeat', '2'));
  const guidance = opt('--guidance', 'product');
  if (!['product', 'lean'].includes(guidance)) throw new Error('Unknown guidance experiment');
  const leanGoal = `You are Harper, the candidate's career agent. Understand the user's purpose and use your judgment and available tools to do the work that will help them most. Take responsibility for useful research and preparation rather than expecting the user to specify methods or provide information available from sources. Ask for information or choices when the user's answer would help; continue independent useful work within their request. Prepare work for its intended audience. Preserve source, subject and uncertainty: public company facts do not establish an individual's contribution. Respect the user's privacy, choices and actual authority for external actions. Only report effects confirmed by execution. Respond naturally in the user's language.`;

  if (!Number.isInteger(repeat) || repeat < 1) throw new Error('Invalid repetition count');
  if (process.argv.includes('--resume-source') && (cases.length !== 1 || repeat !== 1)) throw new Error('Resume exactly one scenario turn at a time');
  const { APPLICATION_CHECKPOINT_USER_ID: userId, APPLICATION_CHECKPOINT_EMAIL: email } = await import('@/lib/career/devApplicationCheckpoint');
  const { getTalentSupabaseAdmin } = await import('@/lib/talentOnboarding/admin');
  const { getCareerDevSqlClient } = await import('@/lib/career/devSql');
  const { closeCareerScenarioBrowsers } = await import('./evaluation/careerScenarioCleanup');
  const { runCareerChatTurn } = await import('@/lib/career/chatTurn');
  const { appendCareerOpportunityMentionMetadata } = await import('@/lib/career/opportunityMentionText');
  const { resolveCareerTextChatModel } = await import('@/lib/career/textChatModelConfig');
  const { isCareerReplyContinuation } = await import('@/lib/career/capabilities/runtime');
  const { careerCheckpointIsReady } = await import('@/lib/career/agentContinuation');
  const admin = getTalentSupabaseAdmin(), db = getCareerDevSqlClient();
  const identity = await admin.auth.admin.getUserById(userId);
  if (identity.error || identity.data.user?.email?.toLowerCase() !== email) throw new Error('Wrong test account');
  const model = resolveCareerTextChatModel(undefined);
  const label = opt('--label', 'run');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(label)) throw new Error('Run label must be a filename component');
  const dir = `docs/evaluation/career-application-scenarios/runs/${new Date().toISOString().replace(/[:.]/g, '-')}-${label}`;
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const save = (file: string, value: unknown) => writeFileSync(`${dir}/${file}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
  const originalFetch = globalThis.fetch, originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  let scope = '', request = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const record = url.hostname === 'api.openai.com' || url.hostname === 'api.anthropic.com';
    const id = record ? ++request : 0;
    if (record) save(`provider-${id}-request`, { scope, path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    const response = await originalFetch(input, init);
    if (record) save(`provider-${id}-response`, { scope, status: response.status, body: await response.clone().text() });
    return response;
  };
  for (const level of ['log', 'info', 'warn', 'error'] as const) console[level] = (...values: unknown[]) => appendFileSync(`${dir}/runtime.log`, JSON.stringify({ scope, level, values }) + '\n', { mode: 0o600 });
  const sourceDiff = execFileSync('git', ['diff', '--', 'src', 'scripts'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  save('manifest', { guidance, leanGoal: guidance === 'lean' ? leanGoal : undefined, registryVersion: registry.version, registryHash: registry.sha256, checkpoint: registry.checkpoint, model, repeat, sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDiff, runnerHash: sha(readFileSync('scripts/evalCareerScenarios.ts', 'utf8')), boundary: 'Actual account, live research and private preparation; no send/submit/schedule/delegate.' });
  const sourcePaths = [...new Set([
    ...execFileSync('git', ['diff', '--name-only', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', 'src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    'src/lib/career/researchHistory.ts', 'src/lib/career/devCareerScenarios.server.ts', 'src/lib/career/devApplicationCheckpoint.server.ts', 'scripts/evalCareerScenarios.ts', 'scripts/evaluation/careerScenarioCleanup.ts', 'src/lib/career/matching/opportunityStages.ts',
  ])];
  save('registry', registry);
  save('sources', Object.fromEntries(sourcePaths.map(file => [file, existsSync(file)
    ? { sha256: sha(readFileSync(file, 'utf8')), content: readFileSync(file, 'utf8') }
    : { deleted: true }])));
  originalConsole.log(`Run directory: ${dir}`);
  const results: any[] = [];
  const ownedSourceIds = new Set<number>();
  let initialUserCursor = 0;
  const assertExclusiveTestInput = async () => {
    const { data, error } = await admin.from('talent_messages').select('id')
      .eq('user_id', userId).eq('role', 'user').gt('id', initialUserCursor);
    if (error) throw error;
    assertScenarioInputsOwned(data ?? [], ownedSourceIds);
  };
  const snapshot = async () => {
    const tables: Record<string, unknown> = {};
    for (const [table, owner] of Object.entries({ talent_messages: 'user_id', talent_documents: 'talent_id', talent_opportunity_recommendation: 'talent_id', talent_company_follow: 'talent_id', career_action_items: 'user_id', talent_external_operations: 'user_id', talent_agent_runtime: 'user_id' })) {
      tables[table] = await db.unsafe(`select to_jsonb(t) data from public.${table} t where ${owner}=$1::uuid`, [userId]);
    }
    return tables;
  };
  try {
    const before = await snapshot();
    save('before-all', before);
    initialUserCursor = Math.max(0, ...(before.talent_messages as { data: TalentMessageRow }[])
      .filter(row => row.data.role === 'user').map(row => Number(row.data.id)));
    for (let iteration = 1; iteration <= repeat; iteration++) for (const scenario of cases) {
      scope = `${scenario.id}-${iteration}`;
      const started = Date.now();
      await assertExclusiveTestInput();
      if (!process.argv.includes("--resume-source")) await resetCareerScenario(scenario, registry.checkpoint);
      save(`${scope}-baseline`, await snapshot());
      if (!process.argv.includes('--resume-source') && scenario.action.kind === 'apply') {
        save(`${scope}-ui-action`, await performCareerScenarioApplyAction(admin, scenario));
        save(`${scope}-after-action`, await snapshot());
      }
      const { data: conversations, error: conversationError } = await admin.from('talent_conversations').select('id').eq('user_id', userId);
      if (conversationError || conversations?.length !== 1) throw new Error('Expected one frozen conversation');
      const conversationId = conversations[0].id;
      const calls: any[] = [], turns: unknown[] = [], errors: string[] = [], sourceIds: number[] = [];
      if (scenario.action.kind === 'apply' && scenario.setup.kind === 'account') throw new Error('Apply requires a selected role');
      const firstMessage = scenario.action.kind === 'chat' || scenario.setup.kind === 'account' ? scenario.action.message
        : appendCareerOpportunityMentionMetadata(scenario.action.message, [{ roleId: scenario.setup.roleId, label: scenario.action.label }]);
      const messages = [firstMessage, ...(scenario.followup ? [scenario.followup.message] : [])];
      for (const content of messages) {
        await assertExclusiveTestInput();
        const resumeSource = process.argv.includes('--resume-source') && content === messages[0] ? Number(opt('--resume-source', '')) : null;
        const inserted = resumeSource
          ? await admin.from('talent_messages').select('*').eq('id', resumeSource).eq('user_id', userId).eq('conversation_id', conversationId).eq('role', 'user').single()
          : await admin.from('talent_messages').insert({ user_id: userId, conversation_id: conversationId, role: 'user', message_type: 'chat', content, payload: { careerTextChatModel: model.model } }).select('*').single();
        if (inserted.error || !inserted.data) throw new Error('Could not read or insert scenario action');
        if (resumeSource && inserted.data.content !== content) throw new Error('Resume source does not match the selected frozen action');
        const sourceMessage = inserted.data as TalentMessageRow;
        sourceIds.push(sourceMessage.id);
        ownedSourceIds.add(Number(sourceMessage.id));
        const signal = AbortSignal.timeout(15 * 60_000);
        let done = false;
        while (!done) {
          try {
            await assertExclusiveTestInput();
            const result = await runCareerChatTurn({ admin, userId, conversationId, textChatModel: model.model, timeZone: 'Asia/Seoul', abortSignal: signal,
              // Use the same host budget as the web path. Keep the saved transcript
              // here instead of holding an eight-minute claim through a long browser run.
              deadlineAt: Date.now() + 200_000,
              scheduleAfter: task => { void task().catch(error => console.warn('after-task', String(error))); },
              adapter: { sourceMessage, artifactsVisible: true, beforeAssistantFinalization: assertExclusiveTestInput, adaptPromptBlocks: blocks => {
                  const adapted = guidance === 'product' ? blocks : blocks
                    .filter(block => block.key !== 'visible_actions_guide' && !block.key?.startsWith('handbook:'))
                    .map(block => block.key === 'career_main' ? { ...block, text: leanGoal } : block);
                  appendFileSync(`${dir}/prompt-blocks.jsonl`, JSON.stringify({ scope, guidance, original: blocks.map(b => ({ key: b.key, chars: b.text.length })), adapted: adapted.map(b => ({ key: b.key, chars: b.text.length })) }) + '\n', { mode: 0o600 });
                  return adapted;
                }, adaptTools: selection => selection,
                executeTool: async ({ name, input, executeDefault }) => {
                  await assertExclusiveTestInput();
                  const call: any = { name, input, startedAt: new Date().toISOString() }; calls.push(call);
                  // Enforce the test's authority at the executor boundary, not by adding gold to the prompt.
                  const blocked = ['write_email', 'contact_company', 'deliver_career_email', 'contact_user', 'upsert_schedule', 'manage_work', 'apply_to_internal_role'].includes(name)
                    || (name === 'use_browser' && (input.mode === 'execute' || input.action === 'handoff'));
                  try {
                    if (blocked) call.result = { ok: false, status: 'test_boundary', modelOutput: 'This test permits private preparation only. External submission, delivery, scheduling and delegation are unavailable; preserve reviewable preparation.' };
                    else call.result = await executeDefault();
                    return call.result;
                  } catch (error) {
                    call.error = String(error);
                    throw error;
                  } finally { save(`${scope}-calls`, calls); }
                },
                persistAssistant: async ({ content, agentTurn }) => {
                  await assertExclusiveTestInput();
                  const saved = await admin.from('talent_messages').insert({ user_id: userId, conversation_id: conversationId, role: 'assistant', message_type: 'chat', content, payload: agentTurn ? { agentTurn } : {} }).select('*').single();
                  if (saved.error || !saved.data) throw new Error('Could not save scenario response'); return saved.data as TalentMessageRow;
                },
              },
            });
            turns.push(result); done = true;
          } catch (error) {
            // tsx can load CJS/ESM copies of the runtime; retain the explicit control
            // exception's checkpoint even when its prototype comes from the other copy.
            const checkpoint = isCareerReplyContinuation(error) ? error.checkpoint
              : error && typeof error === 'object' && 'name' in error && error.name === 'CareerReplyContinuation' && 'checkpoint' in error ? error.checkpoint as import('@/lib/career/capabilities/runtime').CareerReplyCheckpoint : null;
            if (!checkpoint) { errors.push(String(error)); done = true; break; }
            save(`${scope}-checkpoint`, checkpoint);
            let observationFailures = 0;
            while (true) {
              signal.throwIfAborted();
              await assertExclusiveTestInput();
              try {
                if (await careerCheckpointIsReady(admin, userId, checkpoint)) break;
                observationFailures = 0;
              } catch (observationError) {
                // Retry only observation of the same dispatched work; never reissue it.
                appendFileSync(`${dir}/observation-errors.jsonl`, JSON.stringify({ scope, at: new Date().toISOString(), error: String(observationError), waitFor: checkpoint.waitFor }) + '\n', { mode: 0o600 });
                if (++observationFailures >= 3) throw observationError;
              }
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        if (errors.length) break;
      }
      save(`${scope}-after`, await snapshot());
      save(`${scope}-browser-cleanup`, await closeCareerScenarioBrowsers(admin, userId, conversationId, sourceIds));
      const result = { id: scenario.id, iteration, elapsedMs: Date.now() - started, calls, turns, errors };
      results.push(result); save(`${scope}-result`, result);
      originalConsole.log(JSON.stringify({ id: scenario.id, iteration, elapsedMs: result.elapsedMs, tools: calls.map(c => c.name), errors }));
      writeFileSync(`${dir}/${scope}-review.md`, `# ${scenario.title}\n\nStatus: unreviewed\n\n${scenario.review.map(text => `- [ ] ${text}\n  Evidence / result:`).join('\n\n')}\n${scenario.followup ? `\n- [ ] ${scenario.followup.review}\n  Evidence / result:\n` : ''}`, { mode: 0o600 });
    }
  } catch (error) {
    save('fatal-error', { scope, at: new Date().toISOString(), error: String(error) });
    throw error;
  } finally {
    globalThis.fetch = originalFetch; Object.assign(console, originalConsole); save('results', results);
    const usage = readdirSync(dir).filter(file => /^provider-\d+-response\.json$/.test(file)).map(file => {
      const receipt = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
      let response: any = null;
      try { response = JSON.parse(receipt.body); } catch { /* Raw transport remains available for review. */ }
      const tokens = response?.usage;
      return { file, scope: receipt.scope, status: receipt.status, model: response?.model,
        inputTokens: tokens?.input_tokens ?? tokens?.prompt_tokens ?? null,
        cachedInputTokens: tokens?.input_tokens_details?.cached_tokens ?? tokens?.prompt_tokens_details?.cached_tokens ?? null,
        outputTokens: tokens?.output_tokens ?? tokens?.completion_tokens ?? null,
        reasoningTokens: tokens?.output_tokens_details?.reasoning_tokens ?? tokens?.completion_tokens_details?.reasoning_tokens ?? null };
    });
    save('usage', { calls: usage, inputTokens: usage.reduce((sum, call) => sum + (call.inputTokens ?? 0), 0), outputTokens: usage.reduce((sum, call) => sum + (call.outputTokens ?? 0), 0), cost: 'Not calculated; raw provider usage retained.' });
    await db.end();
  }
  if (results.some(result => result.errors.length)) process.exitCode = 1;
  console.log(`Finished execution; manual review required: ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
