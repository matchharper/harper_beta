// Manual first-company signup against the existing isolated DB/Auth/Mailpit.
// No pre-created Auth user, invitation, membership, Role, or worker is needed.
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { root, state, stackEnv, sourceEnv, readJson, writeJson } from "./env.mjs";
import { assertLocalStack } from "./isolation.mjs";

const command = process.argv[2] || "up";
const directory = path.join(state, "private/company-signup");
const processFile = path.join(directory, "process.json");
const next = path.join(root, "node_modules/next/dist/bin/next");
const app = "http://localhost:3000";
const mailbox = "http://127.0.0.1:55434";
const previous = readJson(processFile);

function processIdentity(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "lstart=,command="], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}
function running() {
  return Boolean(previous?.identity && processIdentity(previous.pid) === previous.identity);
}
async function portInUse() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port: 3000 });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

if (command === "stop") {
  if (running()) process.kill(-previous.pid, "SIGTERM");
  console.log("가입 테스트 앱을 종료했습니다. 로컬 DB와 메일은 보존됩니다.");
} else if (command === "status") {
  console.log(JSON.stringify({ running: running(), app: `${app}/company`, mailbox }, null, 2));
} else if (command === "up") {
  if (!running() && await portInUse()) {
    throw Error("3000 포트를 사용하는 개발 서버를 먼저 종료해 주세요. 기존 서버를 자동 종료하지 않습니다.");
  }
  const { env } = stackEnv();
  // Keep external mail, billing and Slack credentials blank. Company research
  // may use public websites; a missing provider leaves manual entry available.
  env.EXA_API_KEY = sourceEnv.EXA_API_KEY || "";
  env.HARPER_E2E_DIST_DIR = ".local/company-signup/next";
  assertLocalStack(env);
  const python = path.join(state, "venv/bin/python");
  execFileSync(python, [path.join(root, "scripts/localE2e/database.py"), "check"], { env, stdio: "inherit" });
  execFileSync(python, ["-c", `import os, psycopg
with psycopg.connect(os.environ['DATABASE_URL']) as c:
    row=c.execute("select to_regprocedure('workspace_signup_begin_v1(uuid,text,boolean)'), to_regprocedure('workspace_signup_update_v1(uuid,uuid,text,jsonb)')").fetchone()
    assert all(row), 'Local signup schema is missing; inspect the exact required migration.'
`], { env, stdio: "inherit" });
  const mailHealth = await fetch(`${mailbox}/api/v1/info`, { signal: AbortSignal.timeout(5000) });
  if (!mailHealth.ok) throw Error("로컬 인증 메일함을 실행해 주세요.");

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(path.join(state, "tsconfig.json"))) {
    fs.writeFileSync(path.join(state, "tsconfig.json"), JSON.stringify({
      extends: "../../tsconfig.json",
      include: ["../../next-env.d.ts", "../../src/**/*.ts", "../../src/**/*.tsx", "../company-signup/next/types/**/*.ts", "../company-signup/next/dev/types/**/*.ts"],
      exclude: ["../../node_modules"],
    }, null, 2));
  }
  let processRecord = previous;
  if (!running()) {
    const fd = fs.openSync(path.join(directory, "app.log"), "a", 0o600);
    const child = spawn(process.execPath, [next, "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
      cwd: root, env, detached: true, stdio: ["ignore", fd, fd],
    });
    child.unref();
    fs.closeSync(fd);
    processRecord = { pid: child.pid, identity: processIdentity(child.pid) };
    if (!processRecord.identity) throw Error("가입 테스트 앱을 시작하지 못했습니다. app.log를 확인해 주세요.");
    writeJson(processFile, processRecord);
  }
  const domain = `harper-signup-${Date.now()}-${randomBytes(2).toString("hex")}.com`;
  const email = `founder@${domain}`;
  writeJson(path.join(directory, "current.json"), {
    email, domain, app: `${app}/company`, mailbox, createdAt: new Date().toISOString(),
  });
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (processIdentity(processRecord.pid) !== processRecord.identity) throw Error("가입 테스트 앱이 종료됐습니다. app.log를 확인해 주세요.");
    try {
      const response = await fetch(`${app}/org?lang=ko`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for the development server to compile. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("앱 준비 시간이 초과됐습니다. app.log를 확인해 주세요.");
  console.log(`\n회사 첫 가입 테스트 준비 완료\n시작: ${app}/company\n새 회사 이메일: ${email}\n인증 메일함: ${mailbox}\n\n시크릿 창에서 시작 → 무료로 시작하기 → 위 이메일 입력 → 로컬 메일함의 인증 링크 → Workspace 만들기.\n회사 정보는 직접 입력하고 Free를 선택하세요. Google·유료 결제·Slack 연결은 이 모드에서 설정하지 않습니다.\n다시 처음부터: 로그아웃 후 이 명령을 다시 실행하면 새 회사 도메인이 준비됩니다.\n종료: pnpm local:company-signup stop`);
} else {
  throw Error("Usage: pnpm local:company-signup [up|status|stop]");
}
