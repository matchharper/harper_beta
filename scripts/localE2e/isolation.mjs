// Shared by the launcher and Next config. No production default is accepted here.
export function assertLocalStack(env = process.env) {
  if (env.HARPER_LOCAL_E2E !== "1") return;
  const endpoints = {
    DATABASE_URL: ["postgres:", "postgresql:"],
    OPPORTUNITY_DATABASE_URL: ["postgres:", "postgresql:"],
    NEXT_PUBLIC_SUPABASE_URL: ["http:"],
    APP_BASE_URL: ["http:"],
    NEXT_PUBLIC_APP_URL: ["http:"],
    NEXT_PUBLIC_SITE_URL: ["http:"],
    HARPER_LOCAL_MAIL_URL: ["http:"],
  };
  for (const [key, protocols] of Object.entries(endpoints)) {
    const url = new URL(env[key] || "missing:");
    if (!protocols.includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error(`Local E2E refuses non-loopback or missing ${key}`);
    }
  }
  for (const [key, value] of Object.entries(env)) {
    if (value && /(?:DATABASE_URL|SUPABASE_URL)$/.test(key)) {
      if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) {
        throw new Error(`Local E2E refuses remote ${key}`);
      }
    }
  }
  if (env.NODE_ENV === "production" || !env.RESEND_API_KEY?.startsWith("local-e2e-") || env.SLACK_AGENT_WORKER_TARGET !== "local-e2e") {
    throw new Error("Local E2E requires development mode, local mail credentials and local worker target");
  }
  if (!env.HARPER_LOCAL_ONLY_CHANNEL_ID || !env.SLACK_HARPER_LOCAL_APP_ID || env.SLACK_HARPER_APP_ID !== env.SLACK_HARPER_LOCAL_APP_ID) {
    throw new Error("Local E2E requires the dedicated local Slack app and a single test channel");
  }
}
