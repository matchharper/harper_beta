import 'server-only';
import { send } from '@vercel/queue';

export async function publishHiringBriefSummary(historyId: string) {
  if (process.env.HARPER_LOCAL_E2E==='1') return {messageId:historyId};
  return send('company-hiring-brief-summary-v1',{historyId},{retentionSeconds:86_400});
}

export async function publishHiringBriefSummaries(historyIds: string[]) {
  const results=await Promise.allSettled(historyIds.map(publishHiringBriefSummary));
  // A committed save remains successful. Durable pending rows are recovered by
  // the dispatcher if immediate queue publication fails.
  for (const result of results) if (result.status==='rejected') console.error('[hiring-brief-summary:publish]',result.reason);
}
