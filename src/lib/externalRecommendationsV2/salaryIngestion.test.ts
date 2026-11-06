import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  productionSalaryRequest,
  SALARY_ESTIMATION_VERSION,
} from "./salaryEstimation.server";
import fx from "./salaryFx.json";
import prompts from "../ops/roleSalaryEstimation.prompts.json";

const root = new URL("../../../../data_sc/", import.meta.url);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const marker = "_salary_prediction_source_hash";
const source = (alias: string) =>
  `jsonb_build_array(${["name", "description", "company_workspace_id", "location_text", "country_code", "type"].map((k) => `${alias}.${k}`).join(",")})`;
const salary = {
  salary_min: 80_207_593,
  salary_max: 133_679_321,
  salary_currency: "KRW",
  salary_period: "year",
  salary_range: null,
  salary_is_predicted: true,
};
const role = (n: number, extra = {}) => ({
  role_id: id(n),
  company_workspace_id: id(900),
  name: "Engineer",
  description: "Build APIs. Unicode 日本語 한국어 and O'Reilly's systems.",
  location_text: "Tokyo",
  country_code: "JP",
  type: ["full_time"],
  source_type: "external",
  status: "active",
  is_expired: false,
  information: {},
  ...extra,
});

test("collector contract matches production anchors, local-market prompt and FX", async () => {
  const exported = JSON.parse(
    await readFile(
      new URL("jobpostings/salary_estimation_contract.json", root),
      "utf8"
    )
  );
  assert.equal(exported.version, SALARY_ESTIMATION_VERSION);
  assert.equal(exported.model, prompts.model);
  assert.deepEqual(exported.fx, fx);
  for (const country of ["US", "JP"]) {
    const current = productionSalaryRequest([
      {
        id: "x",
        title: "",
        company: "",
        location: null,
        country,
        salary_min: null,
        salary_max: null,
        salary_currency: null,
        salary_period: null,
      },
    ]);
    assert.deepEqual(
      exported.contracts[country === "US" ? "us" : "global"],
      current.contract
    );
  }
});

test("actual collector capture and trigger preserve annual KRW estimates without exposing stale or published pay", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table company_roles(role_id uuid primary key,company_workspace_id uuid,name text,description text,
      location_text text,country_code text,type text[],source_type text,status text,is_expired boolean,
      salary_min numeric,salary_max numeric,salary_currency text,salary_period text,salary_range text,
      salary_is_predicted boolean not null default false,information jsonb,title_embedding text,title_embedding_text text);
    create table company_workspace(company_workspace_id uuid primary key,company_name text,company_description text,company_db_id integer);
    create table company_db(id integer primary key,short_description text,founded_year integer,employee_count_range jsonb);
    create table company_data(company_workspace_id uuid primary key,last_funding_stage text,total_funding_raised text,estimated_average_salary text);
    insert into company_workspace values('${id(900)}','Example','Shared evidence',null);
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../../supabase/migrations/20261105190128_salary_predictions_during_ingestion.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  const insert = async (row: object) =>
    db.query(
      "insert into company_roles select * from jsonb_populate_record(null::company_roles,$1::jsonb)",
      [JSON.stringify({ salary_is_predicted: false, ...row })]
    );
  const update = async (row: any) => {
    const keys = Object.keys(row).filter((k) => k !== "role_id");
    return db.query(
      `update company_roles r set ${keys.map((k) => `${k}=p.${k}`).join(",")}
      from jsonb_populate_record(null::company_roles,$1::jsonb) p where r.role_id=p.role_id`,
      [JSON.stringify(row)]
    );
  };
  await insert(role(2));
  await insert(
    role(3, {
      salary_min: 5000,
      salary_max: 8000,
      salary_currency: "SGD",
      salary_period: "month",
    })
  );
  await insert(role(4, salary));
  await insert(role(5, salary));
  const patches = [
    role(1),
    { role_id: id(2) },
    { role_id: id(3) },
    { role_id: id(4), salary_min: null, salary_max: null, salary_range: null },
    { role_id: id(5), description: "Own a larger team and infrastructure." },
    role(6, { information: { testOnly: true } }),
    role(7, { status: "ended" }),
  ];
  const sql = execFileSync(
    "python3.11",
    [
      "-c",
      "import json,sys; from jobpostings.salary_estimation import capture_sql; print(capture_sql(json.load(sys.stdin)))",
    ],
    { cwd: root, input: JSON.stringify(patches), encoding: "utf8" }
  );
  const captured = (await db.query<{ roles: any[]; companies: any }>(sql))
    .rows[0];
  assert.deepEqual(
    captured.roles.map((r) => r.id),
    [id(1), id(2), id(5)]
  );
  assert.equal(Object.keys(captured.companies).length, 1);
  assert.equal(
    captured.roles[0].description,
    null,
    "reuse the incoming JD instead of returning it again"
  );
  assert.match(captured.roles[1].description, /Unicode/);

  for (const r of captured.roles) {
    const patch = patches[r.position - 1];
    const predicted = {
      ...patch,
      ...salary,
      information: { [marker]: r.source_hash },
    };
    if (r.id === id(1)) await insert(predicted);
    else await update(predicted);
  }
  let saved = (
    await db.query<any>("select * from company_roles order by role_id")
  ).rows;
  for (const row of saved.filter((r) => r.role_id !== id(3))) {
    assert.equal(row.salary_is_predicted, true);
    assert.equal(row.salary_currency, "KRW");
    assert.equal(row.salary_period, "year");
    assert.equal(row.salary_range, null);
    assert.equal(row.information?.[marker], undefined);
  }
  assert.equal(saved.find((r) => r.role_id === id(3)).salary_currency, "SGD");
  // An unchanged recrawl's empty source salary retains the cached prediction.
  await update({
    role_id: id(4),
    salary_min: null,
    salary_max: null,
    salary_range: null,
  });
  assert.equal(
    (
      await db.query<any>(
        "select salary_min from company_roles where role_id=$1",
        [id(4)]
      )
    ).rows[0].salary_min,
    String(salary.salary_min)
  );

  // A changed role with the same numeric estimate must still be flagged as predicted.
  const changed = role(5, { description: "New responsibility", ...salary });
  const hash = (
    await db.query<any>(
      `select md5(${source("r")}::text) as hash from jsonb_populate_record(null::company_roles,$1::jsonb) r`,
      [JSON.stringify(changed)]
    )
  ).rows[0].hash;
  await update({ ...changed, information: { [marker]: hash } });
  assert.equal(
    (
      await db.query<any>(
        "select salary_is_predicted from company_roles where role_id=$1",
        [id(5)]
      )
    ).rows[0].salary_is_predicted,
    true
  );
  // A stale source hash cannot attach the old estimate to different duties.
  await update({
    role_id: id(5),
    description: "Concurrent source revision",
    ...salary,
    information: { [marker]: hash },
  });
  const stale = (
    await db.query<any>("select * from company_roles where role_id=$1", [id(5)])
  ).rows[0];
  assert.equal(stale.salary_min, null);
  assert.equal(stale.salary_is_predicted, false);
  assert.equal(stale.information?.[marker], undefined);
  // A salary disclosed while estimation was in flight always wins.
  await update({
    role_id: id(2),
    salary_min: 90000,
    salary_max: 110000,
    salary_currency: "USD",
    salary_period: "year",
    salary_is_predicted: false,
  });
  await update({
    role_id: id(2),
    ...salary,
    information: { [marker]: captured.roles[1].source_hash },
  });
  saved = (
    await db.query<any>("select * from company_roles where role_id=$1", [id(2)])
  ).rows;
  assert.equal(saved[0].salary_currency, "USD");
  assert.equal(saved[0].salary_is_predicted, false);
  // A public disclosure equal to the old estimate is still genuine public pay.
  await update({
    role_id: id(4),
    ...salary,
    salary_range: "Published annual KRW range",
    salary_is_predicted: false,
  });
  assert.equal(
    (
      await db.query<any>(
        "select salary_min from company_roles where role_id=$1",
        [id(4)]
      )
    ).rows[0].salary_min,
    String(salary.salary_min)
  );
  // Partial salary-only touches do not copy or overwrite concurrent metadata.
  await update({
    role_id: id(1),
    information: { newest: "concurrent source metadata" },
  });
  await update({
    role_id: id(1),
    ...salary,
    information: {
      [marker]: captured.roles[0].source_hash,
      _salary_prediction_merge_information: true,
    },
  });
  assert.deepEqual(
    (
      await db.query<any>(
        "select information from company_roles where role_id=$1",
        [id(1)]
      )
    ).rows[0].information,
    { newest: "concurrent source metadata" }
  );
});
