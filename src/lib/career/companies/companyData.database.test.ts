import assert from "node:assert/strict";
import test from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { createCareerResourceFixture, careerFixtureUserA, careerFixtureUserB } from "../resources/databaseFixture";

type Ref = { kind: string; id: string; revision?: string };
type Datum = { dataRef: Ref; label: string; content: string; sourceRefs: Ref[]; sources: {url:string}[]; checkedAt: string };
type Write = Datum & { status: string; companyRef: Ref; current?: Datum };
type Label = { label: string; count: number; checkedAt: string };
type Company = { companyRef: Ref; requestedId: string; labels: Label[]; summary: Datum | null; items: Datum[]; total: number };

async function scalar<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
  return (await db.query<{ value: T }>(sql, params)).rows[0].value;
}

test("public material is saved on the company's own workspace, read by B and kept apart from its legacy fields", async (t) => {
  let companyId = "";
  const tenant = crypto.randomUUID();
  const privatePayload = { signupResearch: { note: "Private structured signup answer" } };
  const db = await createCareerResourceFixture(async (client) => {
    companyId = await scalar(client, "insert into company_db(name,website_url) values('Orbit','https://orbit.example') returning id::text as value");
    await client.query("insert into company_workspace(company_workspace_id,company_name,company_db_id,is_internal,external_roles_enabled) values ($1,'Orbit - hiring',$2,true,true)", [tenant,companyId]);
    await client.query("insert into company_data(company_workspace_id,total_funding_raised,estimated_average_salary,source_payload,searched_at) values ($1,'USD 4M','USD 85k',$2::jsonb,'2025-10-01')", [tenant,privatePayload]);
  });
  t.after(() => db.close());

  const capture = async (text: string) => {
    const result = await scalar<{documentId:number;observationId:string}>(db,
      "select career_capture_public_source_v1($1,$2,'Official announcement',$3,$3,$4::jsonb) as value",
      ["public:https://orbit.example/news","https://orbit.example/news",text,{scope:"public",contract:"fixture"}]);
    return {kind:"web_resource",id:String(result.documentId),revision:result.observationId};
  };
  const company = {kind:"company",id:companyId};
  const old = await capture("First official version");
  const fresh = await capture("Second official version");
  const write = (target: object, label: string, content: string, sources: Ref[], dataRef: Ref|null=null, key: string|null=null) =>
    scalar<Write>(db,"select career_write_company_datum_v1($1::jsonb,$2,$3,$4::jsonb,$5::jsonb,$6) value",
      [target,label,content,JSON.stringify(sources),dataRef,key]);
  const read = (labels:string[]|null, workspace = tenant) => scalar<Company[]>(db,
    "select career_read_company_datas_v2($1::uuid[],$2::text[],0,100) value",[[workspace],labels]);

  const key=crypto.randomUUID();
  const first=await write(company,"launch","Orbital propulsion", [old],null,key);
  assert.equal(first.status,"saved");
  // The directory company's existing workspace holds its research; no second workspace appears.
  assert.deepEqual(first.companyRef,{kind:"company_workspace",id:tenant});
  assert.equal(await scalar(db,"select count(*)::int value from company_workspace where company_db_id=$1",[companyId]),1);
  assert.deepEqual(first.sourceRefs,[{kind:"observation",id:old.revision}]);
  assert.equal(first.sources[0].url,"https://orbit.example/news");
  assert.equal((await write(company,"launch","Orbital propulsion",[old],null,key)).status,"unchanged");
  const correction=await write(company,"launch","Corrected propulsion", [old],first.dataRef);
  assert.equal(correction.dataRef.revision,"2");
  assert.equal((await write(company,"launch","Corrected propulsion",[old],first.dataRef)).status,"unchanged");
  assert.equal((await write(company,"launch","Stale copy",[old],first.dataRef)).status,"conflict");
  const releases=await Promise.all([write(company,"launch","Other announcement. 채널톡을 소개합니다.",[fresh]),write(company,"summary","Company overview",[fresh])]);
  assert.ok(releases.every(r=>r.status==="saved"));
  assert.equal((await write(company,"summary","Unreviewed replacement",[fresh])).status,"conflict");
  assert.equal((await scalar<{status:string}>(db,"select career_read_company_datum_v1($1::jsonb) value",[first.dataRef])).status,"version_unavailable");

  for(const user of [careerFixtureUserA,careerFixtureUserB]) {
    assert.equal(await scalar(db,"select career_resource_available_v1($1,$2::jsonb) value",[user,correction.dataRef]),true);
  }
  for (const kind of ["role","opportunity","posting","company","company_workspace","company_datum"]) {
    assert.equal(await scalar(db,"select career_resource_direct_available_v1($1,$2::jsonb) value",
      [careerFixtureUserB,{kind,id:"invalid-ref"}]),false);
    const result = await scalar<Array<{status:string}>>(db,"select career_read_public_company_targets_v1($1,$2::jsonb) value",
      [careerFixtureUserB,JSON.stringify([{kind,id:"invalid-ref"}])]);
    assert.equal(result[0].status,"unavailable");
  }
  for (const kind of ["company","company_workspace","company_datum"]) {
    const status = await scalar<string>(db,"select career_resolve_public_company_v1($1::jsonb)->>'status' value",[{kind,id:"invalid-ref"}]);
    assert.equal(status,"missing");
  }
  assert.equal(await scalar(db,"select career_read_company_datum_v1($1::jsonb)->>'status' value",
    [{kind:"company_datum",id:"invalid-ref"}]),"missing");

  const [full] = await read(["launch"]);
  assert.deepEqual(full.labels.map(label => [label.label,label.count]),[["launch",2],["summary",1]]);
  assert.ok(full.labels.every(label => label.checkedAt));
  assert.equal(full.summary?.content,"Company overview");
  assert.equal(full.total,2);
  assert.equal(full.requestedId,tenant);
  assert.equal((await read(null))[0].items.length,0);
  // Search names the company by its workspace, where its research lives.
  for (const query of ["propulsion", "orbit.example", "채널톡"])
    assert.deepEqual(await scalar(db,"select ref value from career_search_resources_v1($1,'companies',$2,0,10)",[careerFixtureUserB, query]),
      {kind:"company_workspace",id:tenant}, query);
  assert.equal((await db.query("select * from career_search_resources_v1($1,'companies','%_',0,10)",[careerFixtureUserB])).rows.length,0);

  // A customer workspace becomes readable by ref only through its shared research.
  await db.query("select career_lock_cache_sources_v1($1,$2::jsonb)", [careerFixtureUserB, correction.dataRef]);
  await db.query("select career_lock_cache_sources_v1($1,$2::jsonb)", [careerFixtureUserB, {kind:"company_workspace",id:tenant}]);
  const otherTenant = await scalar<string>(db,"insert into company_workspace(company_name,is_internal) values('Quiet customer',true) returning company_workspace_id value");
  assert.equal(await scalar(db,"select career_resource_direct_available_v1($1,$2::jsonb) value",[careerFixtureUserB,{kind:"company_workspace",id:otherTenant}]),false);
  assert.equal(await scalar(db,"select has_table_privilege('authenticated','company_datas','select') as value"),false);
  assert.equal(await scalar(db,"select has_function_privilege('anon','career_read_company_datum_v1(jsonb)','execute') as value"),false);
  // Legacy structured fields are untouched and never enter the shared material.
  assert.equal(await scalar(db,"select total_funding_raised value from company_data where company_workspace_id=$1",[tenant]),"USD 4M");
  assert.deepEqual(await scalar(db,"select source_payload value from company_data where company_workspace_id=$1",[tenant]),privatePayload);
  await db.query("update company_data set estimated_average_salary='USD 90k' where company_workspace_id=$1",[tenant]);
  assert.ok(!JSON.stringify(await read([])).includes("USD 90k"));
  assert.ok(!JSON.stringify(await read([])).includes("Private structured signup"));

  await db.query("update career_public_observations set observed_at=now()-interval '40 days' where id=$1",[old.revision]);
  await db.query("select career_retire_resource_cache_v1(now()-interval '31 days',1000)");
  assert.equal((await read(["launch"]))[0].items.length,2);
  await db.query("update career_public_observations set deleted_at=now() where id=$1",[old.revision]);
  assert.equal((await read(["launch"]))[0].total,1);
  assert.equal(await scalar(db,"select career_resource_available_v1($1,$2::jsonb) value",[careerFixtureUserB,correction.dataRef]),false);
  await assert.rejects(
    db.query("select career_lock_cache_sources_v1($1,$2::jsonb)", [careerFixtureUserB, correction.dataRef]),
    /Source unavailable/
  );
  assert.equal((await db.query("select * from career_search_resources_v1($1,'companies','propulsion',0,10)",[careerFixtureUserB])).rows.length,0);

  // Names and links resolve to the company that already holds research.
  await db.query("insert into company_db(name,website_url) values ('Orbit','https://second.example')");
  assert.equal((await write({name:"Orbit"},"news","Another public fact",[fresh])).companyRef.id,tenant);
  assert.equal((await write({name:"Orbit Inc.",officialWebsite:"https://orbit.example"},"news","Linked by its site",[fresh])).companyRef.id,tenant);
  await assert.rejects(write(company,"news","Bad version",[{...fresh,id:"10000"}]),/source version unavailable/);

  // A company Harper has never seen needs only its name; later writes reuse that workspace.
  const created=await write({name:"Newco"},"summary","Newco overview",[fresh]);
  assert.equal(created.status,"saved");
  assert.equal(created.companyRef.kind,"company_workspace");
  assert.equal((await write({name:"newco "},"news","Newco update",[fresh])).companyRef.id,created.companyRef.id);
  assert.equal((await read([],created.companyRef.id))[0].total,2);
  await db.query("insert into company_workspace(company_name,external_roles_enabled,is_internal) values('Newco',true,false)");
  assert.equal((await write({name:"Newco"},"news","Which one?",[fresh])).status,"ambiguous");

  // A directory-only company gets one workspace with its first entry.
  const directoryOnly = await scalar<string>(db,"insert into company_db(name) values ('Directory only') returning id::text value");
  const placed = await write({name:"Directory only",officialWebsite:"https://new-site.example"},"news","First public finding",[fresh]);
  assert.equal(placed.status,"saved");
  assert.equal(await scalar(db,"select count(*)::int value from company_db where name='Directory only'"),1);
  assert.equal(await scalar(db,"select company_db_id::text value from company_workspace where company_workspace_id=$1",[placed.companyRef.id]),directoryOnly);
  assert.equal((await write({kind:"company",id:directoryOnly},"news","Second finding",[fresh])).companyRef.id,placed.companyRef.id);

  await db.query("delete from documents where id=$1", [fresh.id]);
  assert.equal((await read([]))[0].summary,null);
  assert.equal((await read([]))[0].total,0);
  assert.equal(await scalar(db,"select career_resource_available_v1($1,$2::jsonb) value",[careerFixtureUserB,created.dataRef]),false);
  // Deleting a workspace removes its research rather than failing.
  await db.query("delete from company_workspace where company_workspace_id=$1",[placed.companyRef.id]);
});

test("a Role without any directory link or URL shares its employer's research through its own workspace", async (t) => {
  const db = await createCareerResourceFixture();
  t.after(() => db.close());
  const workspace = await scalar<string>(db,"insert into company_workspace(company_name,homepage_url,external_roles_enabled,is_internal) values('Unlisted Labs','https://unlisted.example',true,false) returning company_workspace_id value");
  const role = await scalar<string>(db,"insert into company_roles(company_workspace_id,name,source_type,source_provider,status,information) values($1,'Engineer','external','scrape','active','{}') returning role_id::text value",[workspace]);
  const source = await scalar<{documentId:number;observationId:string}>(db,
    "select career_capture_public_source_v1($1,$2,'Profile','Unlisted Labs raised a seed round.','h',$3::jsonb) value",
    ["public:https://news.example/unlisted","https://news.example/unlisted",{scope:"public",contract:"fixture"}]);
  const saved = await scalar<Write>(db,"select career_write_employer_datum_v1($1,$2::jsonb,'summary','Unlisted Labs overview.',$3::jsonb,null,$4) value",
    [careerFixtureUserA,{kind:"role",id:role},JSON.stringify([{kind:"observation",id:source.observationId}]),crypto.randomUUID()]);
  assert.equal(saved.status,"saved");
  assert.deepEqual(saved.companyRef,{kind:"company_workspace",id:workspace});
  const [resolved] = await scalar<Array<{status:string;companyRef:Ref}>>(db,"select career_read_public_company_targets_v1($1,$2::jsonb) value",
    [careerFixtureUserB,JSON.stringify([{kind:"role",id:role}])]);
  assert.deepEqual([resolved.status,resolved.companyRef.id],["found",workspace]);
  const [bundle] = await scalar<Company[]>(db,"select career_read_company_datas_v2($1::uuid[],null,0,10) value",[[workspace]]);
  assert.equal(bundle.summary?.content,"Unlisted Labs overview.");
  assert.equal(await scalar(db,"select count(*)::int value from company_workspace"),1);
  assert.equal(await scalar<string>(db,"select ref->>'id' value from career_search_resources_v1($1,'companies','Unlisted',0,10)",[careerFixtureUserB]),workspace);
  // A directory entry registered later joins the same workspace instead of starting a second one.
  const listed = await scalar<string>(db,"insert into company_db(name,website_url) values('Unlisted Labs Inc.','https://www.unlisted.example/') returning id::text value");
  const joined = await scalar<Write>(db,"select career_write_company_datum_v1($1::jsonb,'news','Joined the directory.',$2::jsonb,null,null) value",
    [{kind:"company",id:listed},JSON.stringify([{kind:"observation",id:source.observationId}])]);
  assert.equal(joined.companyRef.id,workspace);
  assert.equal(await scalar(db,"select company_db_id::text value from company_workspace where company_workspace_id=$1",[workspace]),listed);
  assert.equal(await scalar(db,"select count(*)::int value from company_workspace"),1);
});
