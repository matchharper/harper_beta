import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  annualSalaryKrw,
  salarySatisfaction,
  salarySatisfactionSql,
  salaryRank,
} from "./salary";
import {
  roleCard,
  fullJdPromptCandidate,
} from "../talentOnboarding/jobPostingRecommendations";
import { publishedCompensation } from "../companyRoles/publishedCompensation";
import { buildFullJdCandidateBatchText } from "../talentOnboarding/jobPostingFullJdScoring";

test("salary utility saturates at target, integrates both bounds and treats missing pay as unknown", () => {
  assert.equal(salarySatisfaction(30e6, 30e6, 100e6), 0.09);
  assert.equal(salarySatisfaction(100e6, 200e6, 100e6), 1);
  assert.equal(salarySatisfaction(null, null, 100e6), 0.5);
  assert.equal(salarySatisfaction(110e6, null, 100e6), 1);
  assert.equal(salarySatisfaction(null, 110e6, 100e6), 0.5);
  assert.ok(Math.abs(salarySatisfaction(null, 30e6, 100e6) - 0.045) < 1e-10);
  assert.equal(salarySatisfaction(60e6, null, 100e6), 0.5);
  assert.ok(
    Math.abs(salarySatisfaction(50e6, 150e6, 100e6) - 0.7916666666666667) <
      1e-10
  );
  assert.equal(salaryRank(0.01, 0.5), 0.01);
  assert.ok(salaryRank(0.01, 1) > salaryRank(0.01, 0.5));
  assert.ok(salaryRank(0.01, 0.5) > salaryRank(0.01, 0.09));
});
test("SQL and application salary utility agree for annual/monthly, partial, unknown and invalid records", async () => {
  const db = new PGlite();
  try {
    const utility = await readFile(
      new URL(
        "../../../supabase/migrations/20261014230152_external_salary_partial_bounds.sql",
        import.meta.url
      ),
      "utf8"
    );
    await db.exec(utility.slice(0, utility.indexOf("revoke all")));
    await db.exec(
      "create table company_roles(salary_min numeric,salary_max numeric,salary_currency text,salary_period text)"
    );
    for (const row of [
      {
        salary_min: 30e6,
        salary_max: 50e6,
        salary_currency: "KRW",
        salary_period: "year",
      },
      {
        salary_min: 70000,
        salary_max: 150000,
        salary_currency: "USD",
        salary_period: "annual",
      },
      {
        salary_min: 6e6,
        salary_max: null,
        salary_currency: "KRW",
        salary_period: "month",
      },
      {
        salary_min: null,
        salary_max: 90e6,
        salary_currency: "KRW",
        salary_period: "year",
      },
      {
        salary_min: null,
        salary_max: null,
        salary_currency: "KRW",
        salary_period: "year",
      },
      {
        salary_min: 10,
        salary_max: 20,
        salary_currency: "USD",
        salary_period: "hour",
      },
      {
        salary_min: 60e6,
        salary_max: 30e6,
        salary_currency: "KRW",
        salary_period: "year",
      },
    ]) {
      await db.exec("delete from company_roles");
      await db.query("insert into company_roles values($1,$2,$3,$4)", [
        row.salary_min,
        row.salary_max,
        row.salary_currency,
        row.salary_period,
      ]);
      const value = await db.query<{ value: string }>(
        `select ${salarySatisfactionSql(100e6)} as value from company_roles cr`
      );
      const normalized = annualSalaryKrw(row);
      assert.ok(
        Math.abs(
          Number(value.rows[0].value) -
            salarySatisfaction(normalized.min, normalized.max, 100e6)
        ) < 1e-8
      );
    }
  } finally {
    await db.close();
  }
});
test("predicted salaries cannot reach the role card, raw role projection or any full-JD LLM input", () => {
  const row = {
    role_id: "00000000-0000-4000-8000-000000000001",
    company_workspace_id: "c",
    role_name: "Backend",
    description: "Build infrastructure.",
    salary_min: 12345678,
    salary_max: 98765432,
    salary_currency: "KRW",
    salary_period: "year",
    salary_range: "12345678–98765432 KRW",
    salary_is_predicted: true,
  };
  const card = roleCard(row);
  assert.equal(card.salaryRange, null);
  assert.equal(card.row.salary_min, null);
  assert.equal(publishedCompensation(row).salary_range, null);
  const text = buildFullJdCandidateBatchText([
    fullJdPromptCandidate(card, "en"),
  ]);
  assert.ok(!text.includes("12345678") && !text.includes("98765432"));
  assert.equal(
    roleCard({ ...row, salary_is_predicted: false }).salaryRange,
    "12345678–98765432 KRW"
  );
});
