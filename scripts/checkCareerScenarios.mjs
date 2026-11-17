import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const task = join(root, "docs/evaluation/career-agent-autonomy");
const scenarios = [
  { number: "01", name: "이력서만 제출한 사람의 첫 대화", runner: "v17", id: "resume_only" },
  { number: "02", name: "특정 공고를 보고 이력서를 낸 사람의 첫 대화", runner: "v17", id: "posting_then_resume" },
  { number: "03", name: "자료 없이 시작한 사람의 첫 대화", runner: "v23", id: "no_materials" },
  { number: "04", name: "빈 프로필에서 Gmail만 연결한 직후", runner: "v21", id: "gmail_connected_empty_profile" },
  { number: "07", name: "이력서만 보고 여러 회사에서 먼저 볼 팀 찾기", runner: "v22", id: "first_scheduled_backend_search" },
  { number: "10", name: "정식 공고 전 개발 리드의 첫 채용 글 발견", runner: "v19", id: "logistics_lead_post" },
  { number: "16", name: "새 음성 리드 공고가 있는 예약 실행", runner: "v18", id: "weekly_voice_review_a" },
  { number: "17", name: "새 소식이 없는 예약 실행", runner: "v18", id: "weekly_voice_review_b" },
  { number: "30", name: "두 오퍼의 조건을 비교하고 결정", runner: "v20", id: "compare_offers" },
  { number: "34", name: "새 대화에서 이전 0건 검색과 조사 이유 복원", runner: "db" },
  { number: "35", name: "기회 화면에서 고른 지원 준비 항목만 전달", runner: "ui" },
  { number: "36", name: "첫 지원에서 저장한 근거를 두 번째 대화에서 사용", runner: "v16", id: "fde_workshop_first" },
];
const scopes = {
  v17: "모델 · 고정 자료로 첫 응답",
  v23: "모델 · 자료 없는 가입의 첫 답변, 사용자 수고와 대화 평가",
  v18: "모델 · 예약 사건과 모의 발송, 실제 메일 배달 제외",
  v19: "모델 · 고정 시장에서 기회 선택과 출처 확인",
  v21: "모델 · 연결 사건, 모의 메일 읽기와 개인 기록",
  v22: "모델 · 회사명 없는 첫 예약, 여러 회사의 공고와 모의 발송",
  v20: "모델 · 합성 오퍼와 사용자 조건 비교",
  v16: "모델 · 개인 문서를 이어받는 두 대화",
  ui: "JSDOM · 선택 항목과 전달 대상 대화",
  db: "로컬 Supabase 필요 · 별도 선택 · 저장·조회·소유권",
};

function runNode(args, env = {}) {
  const child = spawnSync(process.execPath, args, {
    cwd: root, stdio: "inherit", env: { ...process.env, ...env },
  });
  if (child.error) throw child.error;
  if (child.signal) throw new Error(`실행 중단 (${child.signal})`);
  return child.status;
}

const serverEnv = {
  NODE_PATH: [join(root, "node_modules/next/dist/compiled"), process.env.NODE_PATH].filter(Boolean).join(delimiter),
  TSX_TSCONFIG_PATH: join(root, "scripts/tsconfig.json"),
};

function runModel(dataset, selected, index) {
  // The canonical runner owns the timestamp prefix. The unique label identifies
  // this invocation's output even when another reviewer is running the same cases.
  const label = `career-check-${dataset}-${randomUUID()}`;
  const status = runNode([
    "--conditions=react-server", "--import", "tsx", "scripts/evalCareerAgentAutonomy.ts",
    "--dataset", dataset, "--repeat", "1", "--only", selected.map(s => s.id).join(","),
    "--label", label, "--review",
  ], serverEnv);
  index.push(`평가 실행기 종료 코드 ${status}`, "");
  const runs = join(task, "runs");
  const dirName = existsSync(runs) && readdirSync(runs).find(name => name.endsWith(`-${label}`));
  if (!dirName) throw new Error(`실행 폴더를 생성하지 못했습니다 (exit ${status}).`);
  const dir = join(runs, dirName);
  console.log(`실행 기록  ${dir}`);
  const review = join(dir, "review.md");
  if (existsSync(review)) {
    console.log(`답변과 비교 기준  ${review}`);
    index.push(`[답변과 비교 기준](../${dirName}/review.md)`, "");
  } else {
    index.push(`[부분 실행 기록](../${dirName}/)`, "");
  }
  const resultsFile = join(dir, "results.json");
  const fixture = JSON.parse(readFileSync(join(task, `cases-${dataset}.json`), "utf8"));
  const results = existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, "utf8")) : [];
  const problems = [];
  if (!existsSync(resultsFile)) problems.push("results.json 미생성");
  for (const { number, id, name } of selected) {
    const first = fixture.cases.find(scenario => scenario.id === id);
    const turns = [id, first?.nextConversation?.id].filter(Boolean);
    const records = [];
    for (const [i, turn] of turns.entries()) {
      const file = `${turn}-1.json`;
      const caption = turns.length > 1 ? `${i + 1}번째 대화` : "실제 응답과 도구 기록";
      if (existsSync(join(dir, file))) records.push(`[${caption}](../${dirName}/${file})`);
      else problems.push(`${turn} 개별 기록 미생성`);
      const rows = results.filter(result => result.caseId === turn && result.iteration === 1);
      if (rows.length !== 1) problems.push(`${turn} 결과 ${rows.length}건 (예상 1건)`);
      for (const row of rows) if (row.error != null) problems.push(`${turn} 실행 오류 · ${row.error}`);
    }
    index.push(`- ${number} ${name} · ${records.join(" · ") || "기록 없음"}`);
  }
  if (status !== 0) problems.push(`평가 실행기 exit ${status}`);
  if (!existsSync(review)) problems.push("review.md 미생성");
  if (problems.length) throw new Error(problems.join("\n"));
}

function main(args) {
  const defaults = scenarios.filter(item => item.runner !== "db");
  if (args.length === 1 && args[0] === "--list") {
    console.log(`node scripts/checkCareerScenarios.mjs [${defaults.map(item => item.number).join(",")}]`);
    console.log(`지원하는 ${scenarios.length}개 중 인자 없이 기본 ${defaults.length}개를 한 번씩 실행합니다. 34는 로컬 스택에서 별도로 실행할 수 있습니다.`);
    for (const scenario of scenarios) console.log(`${scenario.number}  ${scenario.name}  (${scopes[scenario.runner]})`);
    return;
  }
  const numbers = args.flatMap(arg => arg.split(",")).map(value => value.trim().padStart(2, "0"));
  const unknown = numbers.filter(number => !scenarios.some(item => item.number === number));
  if (unknown.length) throw new Error(`지원하지 않는 번호 또는 옵션 '${unknown.join(", ")}'. --list에서 지원 번호를 확인하세요.`);
  const selected = numbers.length ? scenarios.filter(item => numbers.includes(item.number)) : defaults;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const batch = join(task, "runs", `${stamp}-scenario-batch-${randomUUID()}`);
  mkdirSync(batch, { recursive: true, mode: 0o700 });
  const review = join(batch, "review.md");
  const index = [
    "# Career 시나리오 실행 검토", "",
    `선택한 번호 · ${selected.map(item => item.number).join(", ")}`, "",
    "모델 사례는 답변과 도구 기록을 열어 사람이 판정합니다. 34·35번은 해당 DB 또는 화면 테스트의 종료 상태를 기록합니다.", "",
  ];
  const save = () => writeFileSync(review, index.join("\n") + "\n", { mode: 0o600 });
  save();
  console.log(`전체 검토  ${review}`);
  for (const runner of new Set(selected.map(item => item.runner))) {
    const group = selected.filter(item => item.runner === runner);
    const title = group.map(item => item.number).join(", ");
    console.log(`\n[${title}] ${scopes[runner]}`);
    index.push(`## ${title} · ${scopes[runner]}`, "");
    save();
    try {
      if (runner === "ui") {
        const status = runNode(["--import", "tsx", "--test", "src/components/career/history/OpportunityReviews.test.tsx"], {
          NEXT_PUBLIC_SUPABASE_URL: "https://evaluation.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic",
        });
        if (status !== 0) throw new Error(`화면 테스트 exit ${status}`);
        index.push(`${group[0].name} · 화면 테스트 통과 (exit ${status})`);
      } else if (runner === "db") {
        const status = runNode(["--conditions=react-server", "--import", "tsx", "scripts/localE2e/careerSearchContinuity.mts"], serverEnv);
        if (status !== 0) throw new Error(`로컬 DB 테스트 exit ${status}`);
        index.push(`${group[0].name} · 로컬 DB 테스트 통과 (exit ${status})`);
      } else {
        runModel(runner, group, index);
      }
    } catch (error) {
      console.error(`[${title}] ${error.message}`);
      index.push("", "실행 오류", "", ...error.message.split("\n").map(line => `- ${line}`));
      process.exitCode = 1;
    }
    index.push("");
    save();
  }
  console.log(`\n전체 검토  ${review}`);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
