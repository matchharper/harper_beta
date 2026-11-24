/**
 * 국민연금 가입 사업장 Open API를 직접 조회한다. 응답은 받은 그대로 JSON으로 출력한다.
 *
 * harper_beta에서 실행한다. DATA_GO_KR_SERVICE_KEY는 .env.local에서 읽는다.
 *
 *   node --env-file=.env.local --import tsx scripts/nps/cli.ts search <사업장명> [--biz 123456] [--sido 11]
 *   node --env-file=.env.local --import tsx scripts/nps/cli.ts detail <seq>
 *   node --env-file=.env.local --import tsx scripts/nps/cli.ts history <사업장명> [--biz 123456] [--json]
 *
 * 항목 뜻과 해석할 때 주의할 점은 scripts/nps/README.md에 있다.
 */
import {
  readNpsWorkplaceDetail,
  readNpsWorkplaceHistory,
  searchNpsWorkplaces,
  NpsApiError,
} from "./client";

function flags(args: string[]) {
  const values: Record<string, string> = {}, rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) values[args[i].slice(2)] = args[++i] ?? "";
    else rest.push(args[i]);
  }
  return { values, rest };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const { values, rest } = flags(args);
  const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

  if (command === "search" && rest[0]) {
    return print(await searchNpsWorkplaces({
      name: rest.join(" "), bizRegPrefix: values.biz, sidoCode: values.sido, sigunguCode: values.sigungu,
      emdCode: values.emd, numOfRows: values.rows ? Number(values.rows) : undefined,
    }));
  }
  if (command === "detail" && rest[0]) return print(await readNpsWorkplaceDetail(rest[0]));
  if (command === "history" && rest[0]) {
    const rows = await readNpsWorkplaceHistory({ name: rest.join(" "), bizRegPrefix: values.biz, sidoCode: values.sido });
    if ("json" in values) return print(rows);
    // 사업장마다 달별 표. 값은 응답 그대로이고, 비어 있으면 '-'.
    const cell = (value: unknown) => value == null || value === "" ? "-" : String(value);
    for (const key of [...new Set(rows.map(row => `${row.name} | ${row.address}`))]) {
      console.log(`\n${key}`);
      console.log(["월", "가입자수", "신규취득", "상실", "당월고지금액"].join("\t"));
      for (const row of rows.filter(row => `${row.name} | ${row.address}` === key)) {
        console.log([row.month, cell(row.detail?.jnngpCnt), cell(row.flow?.nwAcqzrCnt), cell(row.flow?.lssJnngpCnt),
          cell(row.detail?.crrmmNtcAmt), ...row.errors].join("\t"));
      }
    }
    return;
  }
  console.error("Usage: search <name> [--biz 123456] | detail <seq> | history <name> [--biz 123456] [--json]");
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error instanceof NpsApiError ? { message: error.message, ...error.details } : error);
  process.exitCode = 1;
});
