import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { buildSalaryDecisionRequest } from "../ops/roleSalaryEstimation";
import {
  estimateSalaryBatch,
  saveSalaryBatch,
  fillExternalRoleSalaries,
  productionSalaryRequest,
  SALARY_FILL_JOINS,
  SALARY_FILL_SELECT,
  type SalaryFillRow,
} from "./salaryEstimation.server";
import fx from "./salaryFx.json";

test("KR/US/JP model currencies become annual KRW exactly once before persistence", async (t) => {
  const rows = ["KR", "US", "JP"].map((country, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, title: "Engineer", company: "Example", country,
    location: country, company_workspace_id: "company", source_hash: `source-${i}`,
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
  }));
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    assert.match(request.input, /Work country: JP/);
    assert.match(request.input, /express local annual base pay in USD using the supplied FX rates/);
    return new Response(JSON.stringify({ answers: request.questions.map((q: any) => ({
      name: q.name, type: "score", probabilities: q.levels.map((v: any, i: number) => ({
        value: i, label: v.label, probability: i === (q.name.endsWith("lower") ? 4 : 5) ? 1 : 0,
      })),
    })) }), { status: 200 });
  });
  const result = await estimateSalaryBatch(rows);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.values.map(({ min, max }) => [min, max]), [
    [65_000_000, 80_000_000],
    [Math.round(60_000 * fx.krwPerUnit.USD), Math.round(100_000 * fx.krwPerUnit.USD)],
    [Math.round(60_000 * fx.krwPerUnit.USD), Math.round(100_000 * fx.krwPerUnit.USD)],
  ]);
  let saved = 0;
  await saveSalaryBatch({ rpc: async (name: string, args: any) => {
    assert.equal(name, "save_external_role_salary_predictions");
    assert.deepEqual(args.p_rows, result.values);
    assert.deepEqual(args.p_rows.map((v: any) => v.sourceHash), ["source-0", "source-1", "source-2"]);
    saved += args.p_rows.length;
    return { data: [], error: null };
  } } as any, result.values);
  assert.equal(saved, 3);
});

test("a salary capture transport failure stays nonfatal; cancellation still propagates", async () => {
  const admin = { rpc: async () => { throw new Error("Synthetic read failure"); } } as any;
  const metrics = await fillExternalRoleSalaries(admin, ["role"]);
  assert.equal(metrics.failed, 1);
  assert.equal(metrics.calls, 0);
  await assert.rejects(fillExternalRoleSalaries(admin, ["role"], AbortSignal.abort()));
});

test("company average survives the database projection and actual Decisions request without exposing role pay", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table company_workspace(company_workspace_id uuid primary key, company_name text,
      company_description text, company_db_id integer);
    create table company_db(id integer primary key, short_description text, founded_year integer,
      employee_count_range jsonb);
    create table company_data(company_workspace_id uuid primary key, last_funding_stage text,
      total_funding_raised text);
    create table company_roles(role_id uuid primary key, company_workspace_id uuid, name text,
      country_code text, location_text text, salary_min numeric, salary_max numeric,
      salary_currency text, salary_period text, salary_is_predicted boolean, description text,
      description_summary text, type text);
    insert into company_workspace values('00000000-0000-4000-8000-000000000001', 'Example', 'Product company', null);
    insert into company_data values('00000000-0000-4000-8000-000000000001', 'Series B', '100억원');
    insert into company_roles values('00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001', 'Backend engineer', 'KR', 'Seoul',
      12345678, 98765432, 'KRW', 'year', false, 'Build APIs. 연봉 12345678–98765432원', null, 'full_time');
  `);
  await db.exec(await readFile(new URL(
    "../../../supabase/migrations/20261105061148_company_data_estimated_average_salary.sql",
    import.meta.url,
  ), "utf8"));
  const select = `select ${SALARY_FILL_SELECT} from company_roles cr ${SALARY_FILL_JOINS}`;
  const before = (await db.query<SalaryFillRow>(select)).rows;
  const missing = productionSalaryRequest(before);
  const missingInput = buildSalaryDecisionRequest(missing.roles, "mapping", missing.contract).input;
  assert.doesNotMatch(missingInput, /해당 회사 예상 평균 연봉/);

  const salary = "2025년 한국 전사 평균 연봉 약 8천만원, 상여 포함 여부 미확인; 출처 https://example.com/salary";
  await db.query("update company_data set estimated_average_salary=$1", [salary]);
  const rows = (await db.query<SalaryFillRow>(select)).rows;
  const { roles, contract } = productionSalaryRequest(rows);
  assert.equal(roles[0].company_context.estimated_average_salary, salary);
  assert.doesNotMatch(roles[0].jd, /12345678|98765432/);

  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-only-key";
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://api.openai.com/v1/decisions");
    const request = JSON.parse(String(init.body));
    assert.ok(request.input.includes(`해당 회사 예상 평균 연봉 (company-wide estimated average annual salary): ${salary}`));
    assert.match(request.input, /not this role's\noffer or hiring band/);
    assert.match(request.input, /누적 투자 유치액/);
    assert.doesNotMatch(request.input, /12345678|98765432|"company_context"/);
    return new Response(JSON.stringify({
      answers: ["lower", "upper"].map((endpoint, index) => ({
        name: `r0_${endpoint}`, type: "score",
        probabilities: contract.anchors.KRW.map((amount, level) => ({
          value: level, label: String(amount), probability: level === index + 4 ? 1 : 0,
        })),
      })), usage: { input_tokens: 1000 },
    }), { status: 200 });
  });
  const result = await estimateSalaryBatch(rows);
  assert.deepEqual(result.invalid, []);
  assert.equal(result.values[0].min, 65_000_000);
  assert.equal(result.values[0].max, 80_000_000);
});
