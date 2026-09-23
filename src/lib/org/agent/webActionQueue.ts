import "server-only";

import { send } from "@vercel/queue";

export const COMPANY_AGENT_WEB_ACTION_QUEUE_TOPIC =
  "company-agent-web-action-v1";
export const COMPANY_AGENT_WEB_ACTION_QUEUE_RETENTION_SECONDS = 86_400;

export type CompanyAgentWebActionQueueMessage = {
  jobId: string;
  kind: "web_action_job";
  version: 1;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export function parseCompanyAgentWebActionQueueMessage(
  value: unknown
): CompanyAgentWebActionQueueMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const jobId = clean(message.jobId);
  if (message.version !== 1 || message.kind !== "web_action_job" || !jobId) {
    return null;
  }
  return { jobId, kind: "web_action_job", version: 1 };
}

export async function publishCompanyAgentWebActionJob(jobIdValue: string) {
  const jobId = clean(jobIdValue);
  if (!jobId) throw new Error("Company agent web-action job id is required");
  return send(
    COMPANY_AGENT_WEB_ACTION_QUEUE_TOPIC,
    { jobId, kind: "web_action_job", version: 1 },
    {
      idempotencyKey: `company-agent-web-action:${jobId}`,
      retentionSeconds: COMPANY_AGENT_WEB_ACTION_QUEUE_RETENTION_SECONDS,
    }
  );
}
