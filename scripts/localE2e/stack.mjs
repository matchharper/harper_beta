import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { root, state, worker, privateDir, sourceEnv, readJson, writeJson, dockerEnv, stackEnv } from "./env.mjs";
import crypto from "node:crypto";

const command = process.argv[2] || "status";
const pidFile = path.join(privateDir, "processes.json");
const processes = readJson(pidFile, {});
function alive(proc) {
  if (!proc?.pid) return false;
  try {
    process.kill(proc.pid, 0);
    const cmd = execFileSync("ps", ["-p", String(proc.pid), "-o", "command="], { encoding: "utf8" });
    return cmd.includes(proc.identity);
  } catch { return false; }
}
function start(name, bin, args, env, cwd = root) {
  if (alive(processes[name])) return;
  const log = path.join(privateDir, `${name}.log`);
  const fd = fs.openSync(log, "a", 0o600);
  const child = spawn(bin, args, { cwd, env, detached: true, stdio: ["ignore", fd, fd] });
  child.unref(); fs.closeSync(fd);
  processes[name] = { pid: child.pid, identity: args.find(x => /\.py$|\.mjs$|next\/dist/.test(x)) || bin, log };
  writeJson(pidFile, processes);
}
async function health(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(2500) })).status; } catch { return "unavailable"; }
}
if (command === "up") {
  fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(state, "docker"), { recursive: true });
  fs.writeFileSync(path.join(state, "docker/config.json"), "{}");
  fs.mkdirSync(path.join(state, "supabase"), { recursive: true });
  fs.copyFileSync(path.join(root, "scripts/localE2e/supabase.toml"), path.join(state, "supabase/config.toml"));
  const colima = path.join(state, "runtime/bin/colima");
  const runtimeEnv = { ...process.env, PATH: `${path.join(state, "runtime/bin")}:${process.env.PATH}` };
  try { execFileSync(colima, ["status", "harper-e2e"], { env: runtimeEnv, stdio: "ignore" }); }
  catch { execFileSync(colima, ["start", "harper-e2e", "--arch", "aarch64", "--vm-type", "vz", "--cpu", "4", "--memory", "6", "--disk", "30", "--activate=false"], { env: runtimeEnv, stdio: "inherit" }); }
  execFileSync(path.join(root, "node_modules/.bin/supabase"), ["start", "--workdir", state, "--exclude", "imgproxy,logflare,vector,edge-runtime"], { env: dockerEnv(), stdio: ["ignore", "ignore", "inherit"] });
  const { env } = stackEnv();
  for (const key of ["OPENAI_API_KEY","OPENROUTER_API_KEY","ANTHROPIC_API_KEY"]) {
    if (!env[key]) throw Error(`${key} is required by the current local worker models; configure .env.local or private/providers.json`);
  }
  fs.writeFileSync(path.join(state,"tsconfig.json"),JSON.stringify({extends:"../../tsconfig.json",include:["../../next-env.d.ts","../../src/**/*.ts","../../src/**/*.tsx","next/types/**/*.ts","next/dev/types/**/*.ts"],exclude:["../../node_modules"]},null,2));
  const python = path.join(state, "venv/bin/python");
  execFileSync(python, [path.join(root, "scripts/localE2e/database.py"), "check"], { env, stdio: "inherit" });
  start("mail", process.execPath, [path.join(root, "scripts/localE2e/mail.mjs")], env);
  start("app", process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3200"], env);
  start("opportunity", python, [path.join(worker, "opportunity_worker.py"), "poll", "--disable-scheduler"], env, worker);
  start("email", python, [path.join(worker, "email_reply_worker.py")], env, worker);
  start("slack", python, [path.join(worker, "slack_agent_worker.py"), "poll", "--target", "local-e2e"], env, worker);
  start("web-queue", process.execPath, [path.join(root, "scripts/localE2e/webQueue.mjs")], env);
  start("socket", process.execPath, [path.join(root, "scripts/slackLocalSocketBridge.mjs")], env);
  console.log("Local processes started. Run pnpm local:e2e status; logs are in .local/full-stack/private.");
} else if (command === "down") {
  // Stop producers first, then let consumers finish their current work.
  // Never terminate the DB or escalate to SIGKILL while a consumer is running.
  for (const name of ["socket", "opportunity", "email", "slack", "web-queue"]) if (alive(processes[name])) process.kill(processes[name].pid, "SIGTERM");
  const busy = ["opportunity", "email", "slack", "web-queue"].filter(name => alive(processes[name]));
  if (busy.length) console.log(`Draining ${busy.join(", ")}; keep app/mail/DB running. Run down again after they exit.`);
  else {
    for (const name of ["app", "mail"]) if (alive(processes[name])) process.kill(-processes[name].pid, "SIGTERM");
    console.log("Local application stopped. DB is retained; no production fallback or routing change.");
  }
} else if (command === "status" || command === "doctor") {
  const result = Object.fromEntries(Object.entries(processes).map(([key,p]) => [key, alive(p) ? "running" : "stopped"]));
  console.log(JSON.stringify({ processes: result, app: await health("http://127.0.0.1:3200"), mail: await health("http://127.0.0.1:3211/health"), database: "127.0.0.1:55432", productionFallback: false }, null, 2));
  if (command === "doctor") {
    const { env } = stackEnv();
    execFileSync(path.join(state, "venv/bin/python"), [path.join(root, "scripts/localE2e/database.py"), "check"], { env, stdio: "inherit" });
  }
} else if (command === "migrate") {
  if(!process.argv[3])throw Error("migrate requires an exact migration filename");
  const {env}=stackEnv();
  execFileSync(path.join(state,"venv/bin/python"),[path.join(root,"scripts/localE2e/database.py"),"migrate",process.argv[3]],{env,stdio:"inherit"});
} else if (command === "new-round") {
  execFileSync(process.execPath,[path.join(root,"scripts/localE2e/stack.mjs"),"down"],{stdio:"inherit"});
  const until=Date.now()+30000;
  while(["socket","opportunity","email","slack","web-queue"].some(name=>alive(processes[name]))&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,1000));
  if(["socket","opportunity","email","slack","web-queue"].some(name=>alive(processes[name])))throw Error("Workers are still draining; no data reset. Retry new-round after they finish.");
  execFileSync(process.execPath,[path.join(root,"scripts/localE2e/stack.mjs"),"down"],{stdio:"inherit"});
  const stoppedUntil=Date.now()+10000;
  while(["app","mail"].some(name=>alive(processes[name]))&&Date.now()<stoppedUntil)await new Promise(resolve=>setTimeout(resolve,500));
  if(["app","mail"].some(name=>alive(processes[name])))throw Error("App/mail are still stopping; no data reset.");
  const {env}=stackEnv();
  execFileSync(path.join(state,"venv/bin/python"),[path.join(root,"scripts/localE2e/reset.py")],{env,stdio:"inherit"});
  const f=readJson(path.join(privateDir,"fixture.json"));if(!f)throw Error("Run seed first");
  writeJson(path.join(privateDir,`round-${f.roleId}.json`),f);
  for(const key of ["roleId","introId","selectionRunId","stageId"])f[key]=crypto.randomUUID();
  f.roleName=`[Local E2E] Backend ${new Date().toISOString().slice(0,16)}`;
  writeJson(path.join(privateDir,"fixture.json"),f);
  execFileSync(process.execPath,[path.join(root,"scripts/localE2e/seed.mjs")],{stdio:"inherit"});
  execFileSync(process.execPath,[path.join(root,"scripts/localE2e/stack.mjs"),"up"],{stdio:"inherit"});
} else if (command === "gmail-connect") {
  const previous=readJson(path.join(privateDir,"gmail.json"));
  const owner=previous?.owner||`harper-local-e2e-${crypto.randomUUID()}`;
  const r=await fetch("https://backend.composio.dev/api/v3.1/connected_accounts/link",{method:"POST",headers:{"x-api-key":sourceEnv.COMPOSIO_API_KEY,"content-type":"application/json"},body:JSON.stringify({auth_config_id:sourceEnv.COMPOSIO_GMAIL_AUTH_CONFIG_ID,user_id:owner,callback_url:"http://127.0.0.1:3211"})});
  const d=await r.json();if(!r.ok)throw Error(`Gmail connect failed (${r.status})`);
  writeJson(path.join(privateDir,"gmail.json"),{owner,accountId:d.connected_account_id,authorizeUrl:d.redirect_url});
  console.log(`Connect khj605123@gmail.com: ${d.redirect_url}\nThen: pnpm local:e2e mail-mode gmail`);
} else if (command === "mail-mode") {
  const mode = process.argv[3];
  if (!["capture", "gmail"].includes(mode)) throw Error("mail-mode requires capture or gmail");
  const { config } = stackEnv();
  if(mode==="gmail"){
    const c=readJson(path.join(privateDir,"gmail.json"));if(!c)throw Error("Run gmail-connect first");
    const r=await fetch(`https://backend.composio.dev/api/v3.1/connected_accounts/${c.accountId}`,{headers:{"x-api-key":sourceEnv.COMPOSIO_API_KEY}});
    const d=await r.json();if(!r.ok||d.status!=="ACTIVE")throw Error(`Gmail is ${d.status}; run gmail-connect and authenticate first`);
  }
  config.mailMode = mode;
  writeJson(path.join(privateDir, "config.json"), config);
  console.log(`Mail mode: ${mode}. Only the two configured test recipients are allowed.`);
} else throw Error("Usage: pnpm local:e2e up|down|status|doctor|new-round|gmail-connect|mail-mode capture|gmail|migrate <filename>");
