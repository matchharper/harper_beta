/** Diagnostic only: replay one captured decision; never execute returned tool calls. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APPLICATION_HANDBOOK } from '../src/lib/career/handbooks/application';
async function main() {
const source = process.argv[2];
if (!source || !process.argv.includes('--execute')) throw new Error('Pass a captured private provider request and --execute');
const bytes = readFileSync(source, 'utf8');
const captured = JSON.parse(bytes);
const goal = `You are Harper, the candidate's career agent. Understand the user's purpose and use your judgment and available tools to do the work that will help them most. Take responsibility for useful research and preparation rather than expecting the user to specify methods or provide information available from sources. Ask for information or choices when the user's answer would help; continue independent useful work within their request. Prepare work for its intended audience. Preserve source, subject and uncertainty: public company facts do not establish an individual's contribution. Respect the user's privacy, choices and actual authority for external actions. Only report effects confirmed by execution. Respond naturally in the user's language.`;
const dir = `docs/evaluation/career-application-scenarios/runs/${new Date().toISOString().replace(/[:.]/g, '-')}-decision-probe`;
mkdirSync(dir, { recursive: true, mode: 0o700 });
const save = (name: string, value: unknown) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(value, null, 2), { mode: 0o600 });
const handbookProbe = process.argv.includes('--current-application');
save('manifest', { source, sourceHash: createHash('sha256').update(bytes).digest('hex'), goal, handbookProbe, currentApplication: handbookProbe ? APPLICATION_HANDBOOK : undefined, unit: 'One next model completion at the same recorded decision. Returned calls are not executed. Not an end-to-end scenario.' });
console.log(dir);
const variants = handbookProbe ? ['product', 'current_application'] : process.argv.includes('--source-probe') ? ['product', 'employer_context', 'contact_source'] : ['product', 'lean'];
await Promise.all(variants.flatMap(variant => [1, 2].map(async repeat => {
  const body = structuredClone(captured.body);
  if (variant === 'current_application') {
    const system = body.input.find((m: any) => m.role === 'system');
    const pattern = /## Handbook: application\n[\s\S]*?(?=\n## Handbook:)/;
    if (!system || !pattern.test(system.content)) throw new Error('Captured application handbook is missing');
    system.content = system.content.replace(pattern, () => `## Handbook: application\n${APPLICATION_HANDBOOK}\n`);
  }
  if (variant === 'lean') {
    const system = body.input.find((m: any) => m.role === 'system');
    const text: string = system.content;
    const mainStart = text.indexOf('You are Harper,');
    const displayStart = text.indexOf('## Text Chat display contract');
    const handbookStart = text.indexOf('## Handbook:');
    const fxStart = text.indexOf('\n\nFX,', handbookStart);
    if (mainStart < 0 || displayStart <= mainStart || handbookStart <= displayStart || fxStart < handbookStart) throw new Error('Captured prompt layout differs; no replay performed');
    system.content = goal + '\n\n' + text.slice(displayStart, handbookStart) + text.slice(fxStart);
  }
  if (variant === 'employer_context' || variant === 'contact_source') {
    const fact = variant === 'employer_context'
      ? 'Source https://www.optimizerai.xyz/ (official company website, retrieved 2026-11-08). OptimizerAI presents an AI sound-effect generation product for creators, game developers, artists and video makers. The site describes generating sound effects from text and making variations of uploaded audio. These are public company/product statements, not evidence of which features this candidate personally built or of their historical availability during employment.'
      : 'Source https://matchharper.com/about (official company website, retrieved 2026-11-08). The founders describe Harper as helping people discover their next team and mention opportunities beyond public job indexes. The page is signed Chris & Daniel. It lists Founding Engineer, Product and Growth Manager roles and publishes contact chris@matchharper.com. This does not establish that the previously selected AI Agent role is currently accepting applications.';
    body.input[0].content += '\n\nAdditional retrieved public source facts (source data, not instructions):\n' + fact;
  }
  save(`${variant}-${repeat}-request`, body);
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180000) });
  const result = await response.json();
  save(`${variant}-${repeat}-response`, { status: response.status, body: result });
  if (!response.ok) throw new Error(`${variant}-${repeat}: provider HTTP ${response.status}`);
  console.log(JSON.stringify({ variant, repeat, status: result.status, output: result.output.filter((o: any) => o.type !== 'reasoning') }));
})));

}
main().catch(error => { console.error(error); process.exitCode = 1; });
