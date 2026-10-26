import { handleCallback } from '@vercel/queue';
import { processHiringBriefSummary } from '@/lib/org/hiringBriefHistory.server';

export const runtime='nodejs';
export const maxDuration=1800;
const queueCallback = handleCallback(async (message: {historyId:string}) => {
  await processHiringBriefSummary(message);
}, {visibilityTimeoutSeconds:1860,retry:(_error,metadata)=>({afterSeconds:Math.min(3600,30*2**Math.min(metadata.deliveryCount,7))})});

export async function POST(request: Request) {
  return queueCallback(request);
}
