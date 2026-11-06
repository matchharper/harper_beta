import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { createClient } from "@supabase/supabase-js";
import { formatCareerMatchingResult } from "./formatters";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("external result reader uses real HTTP and Postgres for large, shared evaluation sets", async (t) => {
  process.env.OPENAI_API_KEY ??= "synthetic-no-network";
  const originalFetch = globalThis.fetch;
  t.mock.method(
    globalThis,
    "fetch",
    (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      assert.equal(
        new URL(String(input)).hostname,
        "127.0.0.1",
        "Only the local HTTP fixture is allowed"
      );
      return originalFetch(input, init);
    }
  );
  const { readExternalEvaluationResults } =
    await import("./externalEvaluationResults");
  const { readExternalEvaluation, readMatching } = await import("./store");
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE external_recommendation_runs (
      id uuid PRIMARY KEY, talent_id uuid, matching_id uuid, variant text DEFAULT 'career_agent',
      status text DEFAULT 'completed', evaluation_ids uuid[], candidate_role_ids uuid[] DEFAULT '{}',
      created_at timestamptz DEFAULT '2026-11-02', request jsonb DEFAULT '{}', input_snapshot jsonb DEFAULT '{}'
    );
    CREATE TABLE talent_external_evaluations (
      id uuid PRIMARY KEY, talent_id uuid, run_id uuid, role_id uuid, assessment jsonb,
      evaluated_at timestamptz DEFAULT '2026-11-02', input_fingerprint text, input_snapshot jsonb DEFAULT '{}'
    );
    CREATE VIEW talent_external_evaluation_index AS SELECT *,
      (assessment#>>'{fit,mutualFit}')::float8 AS mutual_fit_score FROM talent_external_evaluations;
    CREATE TABLE company_roles(role_id uuid PRIMARY KEY,name text,company_workspace_id uuid,summary jsonb,
      source_type text DEFAULT 'external',is_expired boolean DEFAULT false,expires_at timestamptz,status text DEFAULT 'active');
    CREATE TABLE company_workspace(company_workspace_id uuid PRIMARY KEY,company_name text);
    CREATE TABLE talent_opportunity_recommendation(talent_id uuid,role_id uuid);
    CREATE TABLE talent_matchings(id uuid,talent_id uuid,title text,criteria jsonb);
    CREATE TABLE talent_opportunity_membership_index(id uuid,talent_id uuid,matching_id uuid,role_id uuid,
      recommendation_id uuid,role jsonb,recommendation jsonb,explanation text);
    INSERT INTO company_workspace VALUES('${id(50)}','Synthetic company');
    INSERT INTO talent_matchings VALUES('${id(7)}','${id(1)}','Synthetic matching','{}');
    INSERT INTO company_roles(role_id,name,company_workspace_id)
      SELECT md5(i::text)::uuid,'Role '||i,'${id(50)}'::uuid FROM generate_series(1,1101) g(i);
    UPDATE company_roles SET summary='{"ko":{"content":"한국어 업무 요약"},"en":{"content":"English role summary"}}';
    INSERT INTO talent_external_evaluations(id,talent_id,run_id,role_id,assessment,input_fingerprint)
      SELECT ('00000000-0000-4000-8000-'||lpad((10000+i)::text,12,'0'))::uuid,
        '${id(1)}'::uuid,'${id(101)}'::uuid,md5(i::text)::uuid,
        jsonb_build_object('fit',jsonb_build_object(
          'mutualFit',CASE WHEN i=1101 THEN NULL ELSE i%9 END,
          'candidateInterest',i%9,'companyInterest',i%9,'roleFit',i%9)),i::text
      FROM generate_series(1,1101) g(i);
    INSERT INTO talent_external_evaluations VALUES('${id(20000)}','${id(2)}','${id(109)}',md5('1')::uuid,'{"fit":{"mutualFit":100}}',now(),'foreign');
    INSERT INTO external_recommendation_runs(id,talent_id,matching_id,evaluation_ids) VALUES
      ('${id(101)}','${id(1)}','${id(7)}','{}'),
      ('${id(102)}','${id(1)}','${id(7)}','{}'),
      ('${id(103)}','${id(1)}','${id(7)}','{}'),
      ('${id(109)}','${id(2)}','${id(7)}',ARRAY['${id(20000)}'::uuid]);
    UPDATE external_recommendation_runs SET evaluation_ids = ARRAY(
      SELECT id FROM talent_external_evaluations WHERE talent_id='${id(1)}' AND input_fingerprint::integer BETWEEN 901 AND 1101
    ) WHERE id='${id(103)}';
  `);
  const requests: { method?: string; url: string; sql?: string }[] = [];
  const server = createServer({ maxHeaderSize: 65536 }, async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const table = url.pathname.split("/").at(-1)!;
    res.setHeader("Content-Type", "application/json");
    // PostgREST reflects filter URLs in this header; exercise Node's real parser.
    res.setHeader("Content-Location", req.url!);
    const record = {
      method: req.method,
      url: req.url!,
      sql: undefined as string | undefined,
    };
    requests.push(record);
    try {
      if (table === "set_timeout_and_execute_raw_sql") {
        assert.equal(req.method, "POST");
        let body = "";
        for await (const chunk of req) body += chunk;
        const input = JSON.parse(body);
        record.sql = input.sql_query;
        const { rows } = await db.query(
          `${input.sql_query} LIMIT ${input.limit_num} OFFSET ${input.offset_num}`
        );
        res.end(JSON.stringify([rows]));
      } else if (table === "career_opportunity_list_revision") {
        res.end(JSON.stringify("synthetic-revision"));
      } else if (
        [
          "talent_contexts",
          "talent_opportunity_membership_index",
          "talent_external_evaluation_index",
        ].includes(table)
      ) {
        res.end("[]");
      } else {
        assert.ok(
          ["external_recommendation_runs", "talent_matchings"].includes(table)
        );
        const values: string[] = [];
        const conditions = [...url.searchParams]
          .filter(([, value]) => value.startsWith("eq."))
          .map(([key, value]) => {
            assert.ok(
              ["id", "talent_id", "matching_id", "variant"].includes(key)
            );
            values.push(value.slice(3));
            return `${key}=$${values.length}`;
          });
        const afterRun = url.searchParams.get("or");
        if (afterRun) {
          const match = afterRun.match(
            /^\(created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.([\w-]+)\)\)$/
          )!;
          assert.ok(match);
          assert.equal(match[1], match[2]);
          values.push(match[1], match[3]);
          conditions.push(
            `(created_at < $${values.length - 1}::timestamptz OR (created_at = $${values.length - 1}::timestamptz AND id < $${values.length}::uuid))`
          );
        }
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        assert.ok(Number.isSafeInteger(limit) && limit > 0);
        const { rows } = await db.query(
          `SELECT * FROM ${table} WHERE ${conditions.join(" AND ") || "true"}
           ORDER BY ${table === "external_recommendation_runs" ? "created_at DESC," : ""} id DESC LIMIT ${limit}`,
          values
        );
        res.end(
          JSON.stringify(
            req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows
          )
        );
      }
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ message: String(error) }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const admin = createClient(
    `http://127.0.0.1:${address.port}`,
    "synthetic-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  ) as any;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  });
  const args = { admin, userId: id(1), runId: id(102) };
  const setReferences = async (count: number) => {
    await db.query(
      "UPDATE external_recommendation_runs SET evaluation_ids=$1::uuid[] WHERE id=$2",
      [
        [
          ...Array.from({ length: count }, (_, i) => id(10001 + i)),
          id(20000),
          id(99999),
        ],
        id(102),
      ]
    );
  };

  await t.test("45/35/10/10 ranking reaches the model and remains stable across pages", async () => {
    await setReferences(5);
    await db.exec(`
      UPDATE talent_external_evaluations e SET assessment=jsonb_build_object('fit',jsonb_build_object(
        'mutualFit',v.m,'candidateInterest',v.c,'companyInterest',v.e,'roleFit',v.r))
      FROM (VALUES (1,90,20,70,70),(2,60,90,70,70),(3,50,90,100,100),
        (4,100,60,40,40),(5,100,NULL,100,100)) v(i,m,c,e,r)
      WHERE e.id=('00000000-0000-4000-8000-'||lpad((10000+v.i)::text,12,'0'))::uuid;
      UPDATE talent_external_evaluations SET input_snapshot='{"candidate":{"estimatedBaseSalary":"Model-estimated base salary: KRW 80,000,000–120,000,000 per year; not employer-disclosed; bonus and equity excluded."}}'
      WHERE id='${id(10003)}';
    `);
    try {
      // Scores are 61.5, 72.5, 74, 74, null. Equal totals use the evaluation ID,
      // not mutualFit; an absent metric is not silently treated as zero.
      const first = await readExternalEvaluationResults({ ...args, limit: 3 });
      assert.deepEqual(first.evaluations.map(e => e.id), [id(10003), id(10004), id(10002)]);
      assert.equal(first.evaluationCount, 5);
      assert.equal(first.remainingEvaluationCount, 2);
      assert.equal(first.evaluationCursor, id(10002));
      const next = await readExternalEvaluationResults({ ...args, limit: 3, cursor: first.evaluationCursor! });
      assert.deepEqual(next.evaluations.map(e => e.id), [id(10001), id(10005)]);
      assert.equal(next.remainingEvaluationCount, 0);
      assert.equal(next.evaluationCursor, null);
      const result = await readExternalEvaluation(args);
      assert.ok("evaluations" in result);
      assert.deepEqual(result.evaluations.map(e => e.id), [id(10003), id(10004), id(10002), id(10001), id(10005)]);
      const text = formatCareerMatchingResult(result);
      assert.match(text, /Job summary: English role summary/);
      assert.match(formatCareerMatchingResult(result, "ko"), /Job summary: 한국어 업무 요약/);
      assert.doesNotMatch(formatCareerMatchingResult(result, "ko"), /English role summary/);
      assert.ok(text.includes("mutualFit 45%, candidateInterest 35%, companyInterest 10%, roleFit 10%"));
      assert.ok(text.includes("Model-estimated base salary: KRW 80,000,000–120,000,000 per year; not employer-disclosed; bonus and equity excluded."));
      const positions = [10003, 10004, 10002, 10001, 10005].map(n => text.indexOf(id(n)));
      assert.ok(positions.every((position, i) => position >= 0 && (i === 0 || position > positions[i - 1])));
    } finally {
      await db.exec(`
        UPDATE talent_external_evaluations SET input_snapshot='{}', assessment=jsonb_build_object('fit',jsonb_build_object(
          'mutualFit',input_fingerprint::integer%9,'candidateInterest',input_fingerprint::integer%9,
          'companyInterest',input_fingerprint::integer%9,'roleFit',input_fingerprint::integer%9))
        WHERE talent_id='${id(1)}' AND input_fingerprint::integer BETWEEN 1 AND 5;
      `);
    }
  });
  await t.test("four-metric scores and historical six-metric scores paginate together without inventing removed fields", async () => {
    await setReferences(5);
    await db.exec(`
      UPDATE talent_external_evaluations e SET assessment=jsonb_build_object('fit',jsonb_build_object(
        'mutualFit',v.m,'candidateInterest',v.c,'companyInterest',v.e,'constraintPass',90))
      FROM (VALUES (1,90,20,70),(2,60,90,70),(3,50,90,100),(4,100,60,40),(5,100,NULL,100)) v(i,m,c,e)
      WHERE e.id=('00000000-0000-4000-8000-'||lpad((10000+v.i)::text,12,'0'))::uuid;
      UPDATE talent_external_evaluations SET assessment=jsonb_set(assessment,'{fit}',
        (assessment->'fit') || '{"roleFit":100,"evidence":"partial"}'::jsonb) WHERE id='${id(10003)}';
    `);
    try {
      const first = await readExternalEvaluationResults({ ...args, limit: 3 });
      assert.deepEqual(first.evaluations.map(e => e.id), [id(10004), id(10003), id(10002)]);
      const next = await readExternalEvaluationResults({ ...args, limit: 3, cursor: first.evaluationCursor! });
      assert.deepEqual(next.evaluations.map(e => e.id), [id(10001), id(10005)]);
      assert.equal(next.remainingEvaluationCount, 0);
      for (const evaluation of [...first.evaluations, ...next.evaluations]) {
        assert.equal("roleFit" in evaluation.assessment.fit, evaluation.id === id(10003));
        assert.equal("evidence" in evaluation.assessment.fit, evaluation.id === id(10003));
      }
      const text = formatCareerMatchingResult({ ...first, runId: args.runId });
      assert.ok(text.includes("mutualFit 55%, candidateInterest 35%, companyInterest 10%"));
      assert.ok(!text.includes("NaN"));
    } finally {
      await db.exec(`
        UPDATE talent_external_evaluations SET assessment=jsonb_build_object('fit',jsonb_build_object(
          'mutualFit',input_fingerprint::integer%9,'candidateInterest',input_fingerprint::integer%9,
          'companyInterest',input_fingerprint::integer%9,'roleFit',input_fingerprint::integer%9))
        WHERE talent_id='${id(1)}' AND input_fingerprint::integer BETWEEN 1 AND 5;
      `);
    }
  });
  await t.test("the former 500-ID GET fails at the HTTP boundary", async () => {
    const old = await admin
      .from("talent_external_evaluation_index")
      .select("id")
      .in(
        "id",
        Array.from({ length: 500 }, (_, i) => id(10001 + i))
      )
      .limit(30);
    assert.ok(
      old.error,
      "The long reflected URL must exercise the actual header limit"
    );
    assert.match(old.error.message, /fetch failed/);
    requests.length = 0;
  });
  await t.test(
    "top 30, total and remaining counts work across the page boundary and above 1000 rows",
    async () => {
      for (const count of [0, 1, 29, 30, 31, 500, 1001]) {
        await setReferences(count);
        const result: any = await readExternalEvaluation(args);
        assert.equal(result.evaluationReadError, undefined);
        assert.equal(result.evaluations.length, Math.min(30, count));
        assert.equal(result.evaluationCount, count);
        assert.equal(result.remainingEvaluationCount, Math.max(0, count - 30));
        assert.equal(result.expiredRoleCount, 0);
        assert.equal(Boolean(result.evaluationCursor), count > 30);
        const expected = Array.from({ length: count }, (_, i) => i + 1)
          .sort((a, b) => (b % 9) - (a % 9) || a - b)
          .slice(0, 30)
          .map((i) => id(10000 + i));
        assert.deepEqual(
          result.evaluations.map((e: any) => e.id),
          expected
        );
        if (count)
          assert.equal(
            result.evaluations[0].role.company_workspace.company_name,
            "Synthetic company"
          );
        assert.match(
          formatCareerMatchingResult(result),
          new RegExp(`showing ${Math.min(30, count)} of ${count}`)
        );
      }
      assert.ok(requests.every((r) => r.url.length < 1000));
      for (const r of requests.filter((r) => r.sql)) {
        assert.equal(r.method, "POST");
        assert.ok(
          !r.sql!.includes(id(10001)),
          "Only the run reference belongs in the initial query"
        );
      }
    }
  );
  await t.test(
    "matching reads reuse old-run evaluations and deduplicate shared references",
    async () => {
      const result = await readMatching({
        admin,
        userId: id(1),
        matchingId: id(7),
      });
      assert.equal(result.evaluationCount, 1101);
      assert.equal(result.remainingEvaluationCount, 1071);
      assert.equal(result.evaluations.length, 30);
      const exact = await readMatching({ ...args, matchingId: id(7) });
      assert.equal(exact.evaluationCount, 1001);
      const empty = await readExternalEvaluationResults({
        ...args,
        runId: id(101),
      });
      assert.equal(empty.evaluationCount, 0);
    }
  );
  await t.test(
    "all pages preserve score ordering, ties and null scores without duplication or omission",
    async () => {
      const scope = {
        admin,
        userId: id(1),
        matchingId: id(7),
      };
      const all = await readExternalEvaluationResults({
        ...scope,
        limit: null,
      });
      const ids: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await readExternalEvaluationResults({
          ...scope,
          cursor,
          limit: 97,
        });
        ids.push(...page.evaluations.map((e) => e.id));
        assert.equal(page.remainingEvaluationCount, 1101 - ids.length);
        cursor = page.evaluationCursor ?? undefined;
      } while (cursor);
      assert.deepEqual(
        ids,
        all.evaluations.map((e) => e.id)
      );
      assert.equal(new Set(ids).size, 1101);
      assert.equal(ids.at(-1), id(11101));
    }
  );
  await t.test(
    "scope and cursor checks exclude another owner's records and unrelated runs",
    async () => {
      assert.equal(
        (await readExternalEvaluationResults({ ...args, userId: id(2) }))
          .evaluationCount,
        0
      );
      assert.equal(
        (
          await readExternalEvaluationResults({
            admin,
            userId: id(1),
            matchingId: id(8),
            runId: id(102),
          })
        ).evaluationCount,
        0
      );
      for (const cursor of [id(20000), id(11101)])
        await assert.rejects(
          readExternalEvaluationResults({ ...args, cursor }),
          /cursor is not part/
        );
    }
  );
  await t.test(
    "matching evaluation scope is independent of the latest 30 runs, history pages and result page size",
    async () => {
      const recentRuns = Array.from({ length: 45 }, (_, i) => id(300 + i));
      await db.query(
        `INSERT INTO external_recommendation_runs(id,talent_id,matching_id,evaluation_ids,created_at)
        SELECT run_id,$2::uuid,$3::uuid,'{}'::uuid[],'2026-11-03'::timestamptz FROM unnest($1::uuid[]) r(run_id)`,
        [recentRuns, id(1), id(7)]
      );
      try {
        const first = await readMatching({
          admin,
          userId: id(1),
          matchingId: id(7),
        });
        assert.equal(first.runs.length, 30);
        assert.ok(first.runs.every((r: any) => recentRuns.includes(r.id)));
        assert.equal(first.evaluationCount, 1101);
        assert.equal(first.evaluations.length, 30);
        assert.equal(first.remainingEvaluationCount, 1071);
        const history = await readMatching({
          admin,
          userId: id(1),
          matchingId: id(7),
          runCursor: first.nextRunCursor,
        });
        assert.notDeepEqual(history.runs, first.runs);
        assert.deepEqual(history.evaluations, first.evaluations);
        assert.equal(history.evaluationCount, 1101);
        const smaller = await readMatching({
          admin,
          userId: id(1),
          matchingId: id(7),
          limit: 7,
        });
        assert.equal(smaller.runs.length, 7);
        assert.equal(smaller.evaluations.length, 7);
        assert.equal(smaller.evaluationCount, 1101);
        const next = await readMatching({
          admin,
          userId: id(1),
          matchingId: id(7),
          evaluationCursor: first.evaluationCursor!,
        });
        assert.equal(next.remainingEvaluationCount, 1041);
        assert.ok(
          next.evaluations.every(
            (e) => !first.evaluations.some((previous) => e.id === previous.id)
          )
        );
      } finally {
        await db.query(
          "DELETE FROM external_recommendation_runs WHERE id=ANY($1::uuid[])",
          [recentRuns]
        );
      }
    }
  );
  await t.test(
    "expired flags, deadlines and closed statuses are count-only across all matching runs and exact-run reads",
    async () => {
      await db.exec(`
        UPDATE company_roles SET is_expired=true WHERE role_id=md5('1')::uuid;
        UPDATE company_roles SET expires_at=now() WHERE role_id=md5('2')::uuid;
        UPDATE company_roles SET status=s.status FROM (VALUES
          (3,'expired'),(4,'closed'),(5,'inactive'),(6,'archived'),(7,'ended')
        ) s(i,status) WHERE role_id=md5(s.i::text)::uuid;
        UPDATE company_roles SET expires_at=now()+interval '1 day' WHERE role_id=md5('8')::uuid;
        UPDATE company_roles SET is_expired=NULL,expires_at=NULL WHERE role_id=md5('9')::uuid;
        INSERT INTO talent_external_evaluations VALUES('${id(30000)}','${id(1)}','${id(101)}',md5('1')::uuid,'{"fit":{"mutualFit":100}}',now(),'old-expired-version');
        UPDATE external_recommendation_runs SET evaluation_ids=array_append(evaluation_ids,'${id(30000)}') WHERE id IN ('${id(102)}','${id(103)}');
        INSERT INTO talent_opportunity_membership_index VALUES
          ('${id(30501)}','${id(1)}','${id(7)}',md5('1')::uuid,'${id(40501)}','{"name":"Expired membership"}','{}','expired'),
          ('${id(30502)}','${id(1)}','${id(7)}',md5('8')::uuid,'${id(40502)}','{"name":"Visible membership"}','{}','active');
      `);
      try {
        const matching = await readMatching({
          admin,
          userId: id(1),
          matchingId: id(7),
        });
        assert.equal(matching.evaluationCount, 1094);
        assert.equal(matching.remainingEvaluationCount, 1064);
        assert.equal(
          matching.expiredRoleCount,
          7,
          "Count expired roles once, including reused and multiple historical evaluations"
        );
        assert.equal(matching.evaluations.length, 30);
        assert.deepEqual(
          matching.memberships.map((m: any) => m.id),
          [id(30502)]
        );
        const exact: any = await readExternalEvaluation(args);
        assert.equal(exact.evaluationCount, 994);
        assert.equal(exact.remainingEvaluationCount, 964);
        assert.equal(exact.expiredRoleCount, 7);
        for (const result of [matching, exact]) {
          const text = formatCareerMatchingResult(result);
          assert.match(text, /Expired or closed roles excluded: 7/);
          assert.doesNotMatch(text, /Expired membership/);
          for (const n of [
            10001, 10002, 10003, 10004, 10005, 10006, 10007, 30000, 30501,
            40501,
          ])
            assert.ok(
              !text.includes(id(n)),
              "Expired result identities must not reach the model"
            );
        }
        assert.equal(
          (
            await db.query<{ n: number }>(
              "SELECT count(*)::int n FROM talent_external_evaluations WHERE id=$1",
              [id(30000)]
            )
          ).rows[0].n,
          1
        );
      } finally {
        await db.exec(`UPDATE company_roles SET is_expired=false,expires_at=NULL,status='active';
          UPDATE external_recommendation_runs SET evaluation_ids=array_remove(evaluation_ids,'${id(30000)}');
          DELETE FROM talent_external_evaluations WHERE id='${id(30000)}';
          DELETE FROM talent_opportunity_membership_index;`);
      }
    }
  );
  await t.test(
    "next-page reads continue when the cursor role and a later role expire between requests",
    async () => {
      const all = await readExternalEvaluationResults({ ...args, limit: null });
      const first: any = await readExternalEvaluation(args);
      const expired = [all.evaluations[29], all.evaluations[35]];
      await db.query(
        "UPDATE company_roles SET is_expired=true WHERE role_id=ANY($1::uuid[])",
        [expired.map((e) => e.role_id)]
      );
      try {
        const next: any = await readExternalEvaluation({
          ...args,
          cursor: first.evaluationCursor,
        });
        assert.equal(next.evaluationReadError, undefined);
        assert.equal(next.evaluationCount, 999);
        assert.equal(next.expiredRoleCount, 2);
        assert.equal(next.remainingEvaluationCount, 940);
        assert.deepEqual(
          next.evaluations.map((e: any) => e.id),
          all.evaluations
            .slice(30)
            .filter((e) => !expired.some((x) => x.id === e.id))
            .slice(0, 30)
            .map((e) => e.id)
        );
      } finally {
        await db.query(
          "UPDATE company_roles SET is_expired=false WHERE role_id=ANY($1::uuid[])",
          [expired.map((e) => e.role_id)]
        );
      }
    }
  );
  await t.test(
    "a fully expired saved search returns only its expired count and no remaining page",
    async () => {
      await setReferences(31);
      await db.exec("UPDATE company_roles SET is_expired=true");
      try {
        const result: any = await readExternalEvaluation(args);
        assert.equal(result.status, "completed");
        assert.deepEqual(result.evaluations, []);
        assert.equal(result.evaluationCount, 0);
        assert.equal(result.remainingEvaluationCount, 0);
        assert.equal(result.evaluationCursor, null);
        assert.equal(result.expiredRoleCount, 31);
        await setReferences(0);
        assert.equal(
          (await readExternalEvaluationResults(args)).expiredRoleCount,
          0
        );
      } finally {
        await setReferences(1001);
        await db.exec("UPDATE company_roles SET is_expired=false");
      }
    }
  );
  await t.test(
    "follow processing can read all results and exclude prior recommendations in the same query",
    async () => {
      await db.exec(`INSERT INTO talent_opportunity_recommendation VALUES
      ('${id(1)}',md5('1')::uuid),('${id(2)}',md5('2')::uuid)`);
      const result = await readExternalEvaluationResults({
        ...args,
        limit: null,
        excludePreviouslyRecommended: true,
      });
      assert.equal(result.evaluationCount, 1000);
      assert.equal(result.evaluations.length, 1000);
      assert.ok(!result.evaluations.some((e) => e.id === id(10001)));
      assert.ok(result.evaluations.some((e) => e.id === id(10002)));
      assert.ok(result.evaluations.every((e) => !e.is_recommended));
      const all = await readExternalEvaluationResults({ ...args, limit: null });
      assert.equal(all.evaluations.find((e) => e.id === id(10001))?.is_recommended, true);
      assert.equal(all.evaluations.find((e) => e.id === id(10002))?.is_recommended, false,
        "another user's recommendation does not mark this user's position");
      const first = await readExternalEvaluationResults({ ...args, limit: 30, excludePreviouslyRecommended: true });
      const next = await readExternalEvaluationResults({ ...args, limit: 30, excludePreviouslyRecommended: true, cursor: first.evaluationCursor! });
      assert.equal(first.evaluationCount, 1000);
      await db.query("INSERT INTO talent_opportunity_recommendation VALUES($1,$2)", [id(1), first.evaluations.at(-1)!.role_id]);
      const afterSaved = await readExternalEvaluationResults({ ...args, limit: 30, excludePreviouslyRecommended: true, cursor: first.evaluationCursor! });
      assert.deepEqual(afterSaved.evaluations.map(e => e.id), next.evaluations.map(e => e.id), "saving the last visible position keeps its cursor usable");
      assert.equal(afterSaved.evaluationCount, 999);

      assert.deepEqual([...first.evaluations, ...next.evaluations].map(e => e.id), result.evaluations.slice(0, 60).map(e => e.id));
    }
  );
});
