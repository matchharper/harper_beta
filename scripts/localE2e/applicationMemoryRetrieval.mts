// Focused live-model check: relevant facts exist in the real local DB but are
// deliberately omitted from the initial partial Memory context. No UI replay.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { root, privateDir, stackEnv, readJson, writeJson } from './env.mjs';

const runLabel = process.argv[2] ? `-${path.basename(process.argv[2])}` : '';
const dir = path.join(privateDir, 'application-memory-v4', `partial-context-check${runLabel}`);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const fixture = readJson(path.join(privateDir, 'application-memory-v4', 'fixture.json'));
const { env } = stackEnv();
Object.assign(process.env, env);
const sql = postgres(env.DATABASE_URL, { max: 1 });
try {
  if (new URL(env.DATABASE_URL).hostname !== '127.0.0.1' || (await sql`select id from local_e2e.environment`)[0]?.id !== 'harper-local-e2e') throw Error('Local test DB required');
  const { fetchAllTalentContexts, renderTalentContextPrompt } = await import('../../src/lib/talentOnboarding/talentContexts');
  const { resolveCareerChatTools } = await import('../../src/lib/career/llmTools');
  const { CareerCapabilityRuntime } = await import('../../src/lib/career/capabilities/runtime');
  const { runCareerChatAssistant } = await import('../../src/lib/career/llm');
  const { resolveCareerTextChatModel } = await import('../../src/lib/career/textChatModelConfig');
  const { executeTalentTool } = await import('../../src/lib/talentOnboarding/tools');
  const { withLlmProviderTrace } = await import('../../src/lib/llm/providerTrace');
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const rows = await fetchAllTalentContexts({ admin, userId: fixture.userId, collection: 'memory' });
  const background = rows.filter(row => row.source_refs.some(ref => ref.type === 'local_e2e_retrieval_context'));
  if (background.length !== 48) throw Error('Run after indexed retrieval background is ready');
  const [profile] = await sql`select name, email, phone_number from talent_users where user_id=${fixture.userId}`;
  const message = '지원서에 적을 제 생년월일, 휴대폰 번호, 병역 이행 여부, 보훈 대상 여부를 확인해 주세요.';
  const contextText = renderTalentContextPrompt({ allBriefs: [], briefs: [], memories: background.slice(0, 3), memorySelection: 'semantic', memoryTruncated: true });
  if (contextText.includes('1994-06-15')) throw Error('The initial context must omit the target facts');
  const selected = resolveCareerChatTools({ channel: 'chat', isOnboardingDone: true, responseLocale: 'ko', hasActiveGmailIntegration: false });
  const model = resolveCareerTextChatModel(undefined);
  const runtime = new CareerCapabilityRuntime({ mode: 'progressive', eligibleTools: selected.tools,
    promptArgs: () => ({ channel: 'chat', isOnboardingDone: true, profile: null,
      structuredProfileText: `Name: ${profile.name}\nEmail: ${profile.email}\nPhone: ${profile.phone_number}`,
      talentContextSection: contextText, gmailCapability: 'not_connected',
      currentPreferences: { preferredLocale: 'ko', talentSettingStatus: 'stopped', profileVisibility: 'private' },
      requestTime: new Date(), timeZone: 'Asia/Seoul' }) });
  const first = runtime.resolveStep(false), calls: any[] = [], intermediate: string[] = [], exchanges: any[] = [];
  const reads = new Set(['read_talent_context', 'read_profile', 'list_profiles', 'list_documents', 'read_document']);
  writeJson(path.join(dir, 'input.json'), { message, contextText, profile, omittedFacts: rows.filter(row => !background.some(item => item.id === row.id)), model,
    sourceHashes: Object.fromEntries(['src/lib/career/prompts/mainPrompt2.ts', 'src/lib/llm/toolDescriptions.ts', 'src/lib/talentOnboarding/talentContexts.ts'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) });
  let reply = '', error: string | undefined;
  try {
    reply = await withLlmProviderTrace(exchange => { exchanges.push(exchange); writeJson(path.join(dir, 'provider.json'), exchanges); }, () => runCareerChatAssistant({
      primaryModel: model.model, openAIResponsesReasoningEffort: model.openAIResponsesReasoningEffort, responseLocale: 'ko',
      messages: [{ role: 'user', content: message }], tools: first.tools, systemBlocks: first.systemBlocks, toolRuntime: runtime,
      stopAfterToolNames: selected.stopAfterToolNames, abortSignal: AbortSignal.timeout(180_000), usageLabel: 'eval/application-memory/partial-context',
      onAssistantMessage: text => { intermediate.push(text); },
      executeTool: async call => {
        const event: any = { name: call.name, input: call.input }; calls.push(event);
        if (!reads.has(call.name)) throw Error('Read-only evaluation: unexpected side effect');
        event.result = await executeTalentTool({ name: call.name, input: call.input, channel: 'chat', logging: false, context: { admin, userId: fixture.userId } });
        return event.result;
      }
    }));
  } catch (cause) { error = String(cause); }
  writeJson(path.join(dir, 'result.json'), { reply, intermediate, calls, error, runtime: runtime.completedRecord() });
  console.log(JSON.stringify({ reply, tools: calls.map(call => call.name), error }));
} finally { await sql.end(); }
