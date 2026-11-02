/** Explicit cutover operation. The default only previews eligible exact targets.
 * Supply credentials through the existing environment, never through arguments.
 */
import { getTalentSupabaseAdmin } from '../src/lib/talentOnboarding/admin';
async function main() {
  const apply = process.argv.includes('--apply');
  const { data, error } = await (getTalentSupabaseAdmin() as any).rpc('transition_career_agent_schedules', { p_dry_run: !apply });
  if (error) throw new Error(error.message);
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
