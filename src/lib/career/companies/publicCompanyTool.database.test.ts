import assert from "node:assert/strict";
import test from "node:test";
import { resourcePgliteTransport } from "../../../../scripts/evaluation/resourcePgliteTransport";
import { formatToolResultText } from "@/lib/llm/promptText";
import {
  createCareerResourceFixture,
  careerFixtureUserA,
  careerFixtureUserB,
} from "../resources/databaseFixture";
import { record, rows } from "../resources/types";
import { CAREER_COMPANY_TOOLS } from "./tools";

test("company tool pins historical public sources, writes independently and protects the private employer relation", async () => {
  const db = await createCareerResourceFixture();
  try {
    const admin = resourcePgliteTransport(db);
    const execute = async (
      input: Record<string, unknown>,
      userId = careerFixtureUserA
    ) =>
      record(
        await CAREER_COMPANY_TOOLS.upsert_company.execute!(input, {
          admin,
          userId,
          resumeRequestId: "current-reply",
        })
      );
    const capture = async (body: string) =>
      (
        await db.query<{
          value: { documentId: number; observationId: string };
        }>(
          "select career_capture_public_source_v1($1,$2,'Public announcement',$3,$3,$4::jsonb) value",
          [
            "public:https://paper.example/announcement",
            "https://paper.example/announcement",
            body,
            { scope: "public", provider: "exa_search" },
          ]
        )
      ).rows[0].value;
    const old = await capture("The company opened an office.");
    const latest = await capture("The office has moved.");
    assert.notEqual(old.observationId, latest.observationId);
    const oldSource = {
      kind: "web_resource",
      id: String(old.documentId),
      revision: old.observationId,
    };
    const posting = (
      await db.query<{ id: string }>(
        "insert into official_jobs(id,is_published,company_name,company_website_url) values(gen_random_uuid(),true,'Orbit','https://orbit.example') returning id"
      )
    ).rows[0];
    const target = { kind: "posting", id: posting.id };
    const valid = {
      target,
      label: "offices",
      content: "The company opened an office.",
      sourceRefs: [oldSource],
    };

    const batch = await execute({
      entries: [
        valid,
        { ...valid, sourceRefs: [{ kind: "document", id: "private" }] },
      ],
      _uiStatusMessage: "공개 출처를 정리하고 있습니다.",
    });
    const [saved, invalid] = rows(batch.results);
    assert.equal(batch.ok, false);
    assert.equal(saved.status, "saved", formatToolResultText(batch));
    assert.equal(invalid.status, "failed");
    assert.deepEqual(saved.sourceRefs, [
      { kind: "observation", id: old.observationId },
    ]);
    const output = formatToolResultText(batch);
    assert.ok(
      output.includes(`company_datum:${record(saved.dataRef).id} revision 1`)
    );
    assert.ok(output.includes(`observation:${old.observationId}`));
    assert.ok(output.includes("https://paper.example/announcement"));
    assert.ok(!output.includes(latest.observationId));
    assert.equal((await execute(valid)).status, "unchanged");

    // The posting's company had no record: its research has a new workspace,
    // and the receipt names the labels now saved for it.
    assert.equal(record(saved.companyRef).kind, "company_workspace");
    assert.ok(output.includes("Labels saved for this company: offices (1)"));
    // Directory facts are registered and corrected separately, with their own revision.
    const registered = await execute({
      fields: { name: "Orbit", website_url: "https://orbit.example" },
      sourceRefs: [oldSource],
    });
    const directory = await execute({
      companyId: record(registered.companyRef).id,
      expectedRevision: Number(record(registered.companyRef).revision),
      fields: { location: "Seoul" },
      sourceRefs: [oldSource],
    });
    assert.deepEqual(record(directory.company).sourceRefs, saved.sourceRefs);
    assert.ok(formatToolResultText(directory).includes(old.observationId));
    await assert.rejects(
      execute({
        fields: {
          name: "Unverified",
          website_url: "https://unverified.example",
        },
        sourceRefs: [{ ...oldSource, id: "99999" }],
      }),
      /source version unavailable/i
    );

    const corrected = await execute({
      ...valid,
      dataRef: saved.dataRef,
      content: "The office has moved.",
      sourceRefs: [{ kind: "observation", id: latest.observationId }],
    });
    assert.equal(record(corrected.dataRef).revision, "2");
    const conflict = await execute({ ...valid, dataRef: saved.dataRef });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.status, "conflict");
    const conflictOutput = formatToolResultText(conflict);
    assert.ok(
      conflictOutput.includes(
        `company_datum:${record(corrected.dataRef).id} revision 2`
      )
    );
    assert.ok(conflictOutput.includes("The office has moved."));
    assert.ok(conflictOutput.includes(`observation:${latest.observationId}`));

    const opportunity = (
      await db.query<{ id: string }>(
        "insert into career_opportunities(talent_id,primary_ref,title) values($1,$2,'Private opportunity') returning id",
        [careerFixtureUserA, target]
      )
    ).rows[0];
    const fromOpportunity = {
      ...valid,
      target: { kind: "opportunity", id: opportunity.id },
      content: "Additional public detail.",
    };
    const inaccessible = await execute(fromOpportunity, careerFixtureUserB);
    assert.equal(inaccessible.status, "unavailable");
    assert.ok(
      !inaccessible.companyRef &&
        !formatToolResultText(inaccessible).includes("Orbit")
    );
    assert.equal((await execute(fromOpportunity)).status, "saved");
    await db.query("update official_jobs set is_published=false where id=$1", [
      posting.id,
    ]);
    assert.equal((await execute(fromOpportunity)).status, "unavailable");
    // A running app can still use the original directory writer before the new RPC is installed.
    await db.exec("drop function career_write_company_directory_fields_v1(bigint,bigint,jsonb,jsonb)");
    const legacy = await execute({
      fields: { name: "Original directory", website_url: "https://original.example" },
      sourceRefs: [oldSource],
    });
    assert.deepEqual(record(legacy.company).sourceRefs, [{kind:"observation",id:old.observationId}]);
    await assert.rejects(execute({
      fields: { name: "Wrong original", website_url: "https://wrong.example" },
      sourceRefs: [{...oldSource,id:"99999"}],
    }), /source version unavailable/i);
  } finally {
    await db.close();
  }
});
