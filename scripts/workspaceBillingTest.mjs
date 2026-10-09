// Runs billing against the existing isolated local stack and Stripe TEST only.
// No matching workers, external mail, production DB, or live Stripe fallback.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { root, stackEnv, readJson } from "./localE2e/env.mjs";

const dir = path.join(root, ".local/billing-test/private");
const stripeEnv = dotenv.parse(fs.readFileSync(path.join(dir, "stripe.env")));
if (!/^(sk|rk)_test_/.test(stripeEnv.STRIPE_SECRET_KEY || ""))
  throw Error("Stripe test credentials are required");
const { env } = stackEnv();
for (const key of Object.keys(env)) {
  if (/OPENAI|ANTHROPIC|OPENROUTER|GEMINI|GOOGLE.*KEY|AI_GATEWAY/.test(key))
    env[key] = "";
}
Object.assign(env, stripeEnv, {
  HARPER_E2E_DIST_DIR: ".local/billing-test/next",
  STRIPE_AUTOMATIC_TAX: "false",
});
for (const key of [
  "APP_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "HARPER_LOCAL_APP_ORIGIN",
])
  env[key] = "http://localhost:3100";
execFileSync(
  path.join(root, ".local/full-stack/venv/bin/python"),
  ["scripts/localE2e/database.py", "check"],
  { cwd: root, env, stdio: "ignore" }
);
const fixture = readJson(path.join(dir, "fixture.json"));
if (!fixture) throw Error("Prepare the dedicated local billing fixture first");
const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: fixture.email,
  options: {
    redirectTo: `http://localhost:3000/auths/callback?next=${encodeURIComponent(`/org/billing?orgId=${fixture.workspaceId}`)}`,
  },
});
if (error) throw error;
const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
  type: "magiclink",
  token_hash: data.properties.hashed_token,
});
if (verifyError || !verified.session)
  throw verifyError || Error("Local test login failed");
const fragment = new URLSearchParams({
  access_token: verified.session.access_token,
  refresh_token: verified.session.refresh_token,
  token_type: "bearer",
  expires_in: String(verified.session.expires_in),
});
fs.writeFileSync(
  path.join(dir, "login-url.txt"),
  `http://localhost:3100/auths/callback?next=${encodeURIComponent(`/org/billing?orgId=${fixture.workspaceId}`)}#${fragment}`,
  { mode: 0o600 }
);
console.log(
  "Fresh local test login saved to .local/billing-test/private/login-url.txt"
);
if (process.argv[2] === "login") process.exit(0);

try {
  await fetch("http://localhost:3100", { signal: AbortSignal.timeout(1000) });
  throw Error(
    "Port 3100 is already serving an app; stop it before starting billing tests"
  );
} catch (error) {
  if (error.message?.includes("already serving")) throw error;
}
const cliEnv = { ...process.env, STRIPE_API_KEY: stripeEnv.STRIPE_SECRET_KEY };
env.STRIPE_WEBHOOK_SECRET = execFileSync(
  "stripe",
  ["listen", "--print-secret", "--latest", "--skip-update"],
  { env: cliEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
).trim();
if (!/^whsec_\w+$/.test(env.STRIPE_WEBHOOK_SECRET))
  throw Error("Could not obtain local webhook signing secret");
fs.writeFileSync(
  path.join(dir, "runtime.env"),
  Object.entries(env)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
    .join(""),
  { mode: 0o600 }
);
const log = fs.openSync(path.join(dir, "stripe-listener.log"), "a", 0o600);
const listener = spawn(
  "stripe",
  [
    "listen",
    "--latest",
    "--skip-update",
    "--events",
    "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,invoice.payment_action_required,invoice.finalization_failed",
    "--forward-to",
    "http://localhost:3100/api/billing/webhook",
  ],
  { env: cliEnv, stdio: ["ignore", log, log] }
);
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  { cwd: root, env, stdio: "inherit" }
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  listener.kill("SIGTERM");
  app.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
listener.on("exit", stop);
app.on("exit", stop);
console.log(
  "Stripe TEST billing is starting at http://localhost:3100/org/billing"
);
