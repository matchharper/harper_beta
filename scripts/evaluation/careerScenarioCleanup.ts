import type { TalentAdminClient } from '@/lib/talentOnboarding/admin';
import { executeTalentTool } from '@/lib/talentOnboarding/tools';

/** Close only browser sessions created by these exact local scenario turns. */
export async function closeCareerScenarioBrowsers(admin: TalentAdminClient, userId: string, conversationId: string, sourceIds: number[]) {
  const { data, error } = await (admin.from as any)('talent_external_operations').select('*').eq('user_id', userId).eq('conversation_id', conversationId).eq('kind', 'browser_session').neq('status', 'closed');
  if (error) throw error;
  const receipts = [];
  for (const row of data ?? []) {
    const source = Number(row.request?.source_message_id);
    if (!sourceIds.includes(source) && !sourceIds.some(id => row.request?.reply_id === `message:${id}`)) continue;
    // A provider can mark its completed login-gated run `human` without anyone
    // taking control. Release that exact QA resource, never an explicit handoff.
    let unclaimedLogin = false;
    if (row.status === 'human' && !row.result?.control_source && !row.result?.requested_action && row.result?.last_execution_id) {
      const { data: run, error: runError } = await (admin.from as any)('talent_external_operations')
        .select('kind,status,parent_id').eq('id', row.result.last_execution_id).eq('user_id', userId).single();
      if (runError) throw runError;
      unclaimedLogin = run?.kind === 'browser_run' && run.status === 'completed' && run.parent_id === row.id;
    }
    if ((!['idle', 'ready'].includes(row.status) && !unclaimedLogin) || row.result?.control_source === 'user') throw new Error('Scenario browser is still active or under human control');
    const receipt = await executeTalentTool({ name: 'use_browser', input: { action: 'close', session_id: row.id }, context: { admin, userId, conversationId }, logging: false });
    if (receipt.session?.status !== 'closed') throw new Error('Scenario browser cleanup did not finish');
    receipts.push(receipt);
  }
  return receipts;
}
