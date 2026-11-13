import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const roleId = "e1657263-3369-48c9-8e1b-812834e79037";
const otherRoleId = "f58d6945-86ce-4292-bd09-e86e5ea4f775";
const ids = ["2ba95910-7a9d-4fcc-b3d0-53dbe7c3e4bb", "7360af12-402b-4175-b36c-8dbab2beeff8", "12b0131c-c3a3-4f96-b9bf-ca8d2b97d043"];

test("incident repair aligns the public JD and disconnects aggregate entries, preserving URLs and concurrent edits", async () => {
  const db = new PGlite();
  try {
    const migration = await readFile(new URL("../../../supabase/migrations/20261113062316_repair_incident_60_public_postings.sql", import.meta.url), "utf8");
    await db.exec(`
      create table company_workspace(company_workspace_id uuid primary key, company_name text, company_description text);
      create table company_roles(role_id uuid primary key, company_workspace_id uuid, name text, description text);
      create table company_internal_roles(role_id uuid primary key, is_anonymous boolean, request text);
      create table official_jobs(id uuid primary key, role_id uuid, updated_at timestamptz, slug text,
        company_name text, company_description_markdown text, role_title text, role_description_markdown text,
        short_description text, is_published boolean default true);
      insert into company_workspace values ('${roleId}', 'Synthetic Employer', 'Public company facts');
      insert into company_roles values ('${roleId}', '${roleId}', 'Engineer', 'Public engineering JD'),
        ('${otherRoleId}', '${roleId}', 'AI Engineer', 'Other JD');
      insert into company_internal_roles values ('${roleId}', false, 'PRIVATE BRIEF'), ('${otherRoleId}', false, 'PRIVATE BRIEF');
    `);
    // The migration also installs on databases without production incident rows.
    await db.exec(migration);
    for (const [index, id] of ids.entries())
      await db.query(`insert into official_jobs(id,role_id,updated_at,slug,company_name,role_title,role_description_markdown,short_description)
        values ($1,$2,$3,$4,'Several companies','ML specialist','Unsupported ML requirements','Old summary')`,
      [id, index === 0 ? otherRoleId : roleId, index === 2 ? "2026-11-11 04:17:07.094643+00" : "2026-11-11 02:49:22.031539+00", `existing-${index}`]);
    // A later operator edit aborts the complete one-time repair.
    await db.query("update official_jobs set updated_at = '2026-11-12' where id = $1", [ids[2]]);
    await assert.rejects(() => db.exec(migration), /incident_60_posting_changed/);
    assert.equal((await db.query<any>("select role_id from official_jobs where id=$1", [ids[0]])).rows[0].role_id, otherRoleId);
    await db.query("update official_jobs set updated_at = '2026-11-11 04:17:07.094643+00' where id=$1", [ids[2]]);
    await db.query("update company_internal_roles set is_anonymous=true where role_id=$1", [roleId]);
    await assert.rejects(() => db.exec(migration), /incident_60_public_role_unavailable/);
    await db.query("update company_internal_roles set is_anonymous=false where role_id=$1", [roleId]);
    await db.exec(migration);
    const rows = (await db.query<any>("select * from official_jobs order by slug")).rows;
    assert.deepEqual(rows.map(r => r.role_id), [null, null, roleId]);
    assert.deepEqual(rows.map(r => r.slug), ["existing-0", "existing-1", "existing-2"]);
    assert.ok(rows.every(r => r.is_published));
    assert.equal(rows[0].role_description_markdown, "Unsupported ML requirements");
    assert.equal(rows[2].role_title, "Engineer");
    assert.equal(rows[2].role_description_markdown, "Public engineering JD");
    assert.equal(rows[2].company_name, "Synthetic Employer");
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE BRIEF/);
  } finally { await db.close(); }
});
