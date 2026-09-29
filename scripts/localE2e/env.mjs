import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { assertLocalStack } from "./isolation.mjs";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const state = path.join(root, ".local/full-stack");
export const worker = path.resolve(root, "../harper_worker");
export const privateDir = path.join(state, "private");
export function readJson(file, fallback = null) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}
export const sourceEnv = {};
for (const file of [".env", ".env.local", ".vercel/.env.local-slack"]) {
  if (fs.existsSync(path.join(root, file))) Object.assign(sourceEnv, dotenv.parse(fs.readFileSync(path.join(root, file))));
}
export function dockerEnv() {
  return { ...process.env, DOCKER_CONFIG: path.join(state, "docker"), DOCKER_HOST: `unix://${process.env.HOME}/.colima/harper-e2e/docker.sock` };
}
export function stackEnv() {
  const supabase = JSON.parse(execFileSync(path.join(root, "node_modules/.bin/supabase"), ["status", "--workdir", state, "--output", "json"], { env: dockerEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  const configPath = path.join(privateDir, "config.json");
  let config = readJson(configPath);
  if (!config) {
    config = { secret: crypto.randomBytes(32).toString("hex"), webhook: crypto.randomBytes(32).toString("base64"), namespace: crypto.randomBytes(5).toString("hex"), mailbox: "khj605123@gmail.com", recipients: ["khj605123@gmail.com", "daniel@matchharper.com"], mailMode: "capture" };
    writeJson(configPath, config);
  }
  if (!config.slackStartedAt) {
    config.slackStartedAt = Date.now() / 1000;
    writeJson(configPath, config);
  }
  // Blank every inherited application setting so Next's .env loader cannot
  // restore a production credential. Only deliberate provider keys survive.
  const env = {};
  for (const key of Object.keys({ ...sourceEnv, ...process.env })) env[key] = "";
  for (const key of ["PATH", "HOME", "USER", "SHELL", "TMPDIR", "LANG", "TERM"]) if (process.env[key]) env[key] = process.env[key];
  for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "AI_GATEWAY_API_KEY", "RESEND_FROM_EMAIL", "EMAIL_REPLY_FROM_EMAIL", "SLACK_HARPER_LOCAL_APP_ID", "SLACK_HARPER_LOCAL_APP_TOKEN", "SLACK_HARPER_LOCAL_BOT_TOKEN"]) {
    env[key] = sourceEnv[key] || readJson(path.join(privateDir,"providers.json"),{})[key] || "";
  }
  Object.assign(env, {
    NODE_ENV: "development", HARPER_LOCAL_E2E: "1", HARPER_E2E_DIST_DIR: ".local/full-stack/next",
    DATABASE_URL: supabase.DB_URL, OPPORTUNITY_DATABASE_URL: supabase.DB_URL, CAREER_ROLE_SEARCH_DATABASE_URL: supabase.DB_URL,
    NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL, SUPABASE_URL: supabase.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY,
    APP_BASE_URL: "http://localhost:3200", NEXT_PUBLIC_APP_URL: "http://localhost:3200", NEXT_PUBLIC_SITE_URL: "http://localhost:3200", HARPER_LOCAL_APP_ORIGIN: "http://localhost:3200",
    HARPER_LOCAL_MAIL_URL: "http://127.0.0.1:3211", RESEND_API_KEY: `local-e2e-${config.secret}`,
    EMAIL_REPLY_TOKEN_SECRET: config.secret, COMPANY_TALENT_REQUEST_TOKEN_SECRET: config.secret,
    INTERNAL_WORKER_API_SECRET: config.secret, RESEND_WEBHOOK_SECRET: `whsec_${config.webhook}`,
    EMAIL_REPLY_DOMAIN: "reply.harper.local.invalid", SLACK_AGENT_WORKER_TARGET: "local-e2e",
    SLACK_HARPER_APP_ID: env.SLACK_HARPER_LOCAL_APP_ID,
    SLACK_HARPER_APP_APP_ID: env.SLACK_HARPER_LOCAL_APP_ID,
    SLACK_HARPER_APP_SIGNING_SECRET: config.secret, SLACK_HARPER_APP_TOKEN_ENCRYPTION_KEY: config.secret,
    HARPER_LOCAL_ONLY_CHANNEL_ID: sourceEnv.HARPER_SLACK_LOCAL_TEST_CHANNEL_ID || "C0BLRJ96GSJ",
    HARPER_LOCAL_SLACK_STARTED_AT: String(config.slackStartedAt),
    OPPORTUNITY_DB_POOL_MODE: "session", PYTHONUNBUFFERED: "1", PYTHONPATH: worker,
    EMAIL_WORKER_CONCURRENCY: "1", CONTACT_QUEUE_CONCURRENCY: "1", SLACK_AGENT_BATCH_SIZE: "1",
    EMAIL_REPLY_FROM_EMAIL: sourceEnv.EMAIL_REPLY_FROM_EMAIL || sourceEnv.RESEND_FROM_EMAIL || "Harper <hello@matchharper.com>",
  });
  assertLocalStack(env);
  return { env, config, supabase };
}
