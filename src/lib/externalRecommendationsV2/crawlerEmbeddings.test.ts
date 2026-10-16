import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { roleTitleNeighborsSql } from "./roleTitleSearchSql";

test("crawler vectors survive renames and search works without a title dictionary", async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(`CREATE EXTENSION vector;
      CREATE TABLE company_roles (
        role_id text, name text, title_embedding vector(1536), title_embedding_text text,
        source_type text DEFAULT 'external', source_provider text, is_expired boolean DEFAULT false,
        status text DEFAULT 'active', information jsonb DEFAULT '{}', expires_at timestamptz,
        description text, company_workspace_id uuid, location_text text, country_code text, type text[],
        salary_min numeric, salary_max numeric, salary_currency text, salary_period text,
        salary_range text, salary_is_predicted boolean DEFAULT false);
      CREATE FUNCTION noop_embedding_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN new; END$$;
      CREATE TRIGGER enqueue_external_role_title_embedding AFTER INSERT ON company_roles
        FOR EACH ROW EXECUTE FUNCTION noop_embedding_trigger();
      CREATE TRIGGER maintain_external_live_title_count AFTER INSERT ON company_roles
        FOR EACH ROW EXECUTE FUNCTION noop_embedding_trigger();`);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/20261016085955_crawler_owned_role_title_embeddings.sql",
          import.meta.url
        ),
        "utf8"
      )
    );
    await db.exec(`CREATE TRIGGER invalidate_external_role_derived_data BEFORE UPDATE ON company_roles
      FOR EACH ROW EXECUTE FUNCTION invalidate_external_role_derived_data();`);
    const v = JSON.stringify(
      Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0))
    );
    await db.query(
      `INSERT INTO company_roles(role_id,name,title_embedding,title_embedding_text)
      VALUES ('role','Old',$1,'Old')`,
      [v]
    );
    await db.query(
      `UPDATE company_roles SET name='New',title_embedding=$1,title_embedding_text='New'`,
      [v]
    );
    assert.deepEqual(
      (await db.query(roleTitleNeighborsSql(`'${v}'`))).rows.map(
        (r: any) => r.title
      ),
      ["New"]
    );
    const triggers = await db.query(
      `SELECT tgname FROM pg_trigger WHERE tgrelid='company_roles'::regclass AND NOT tgisinternal`
    );
    assert.deepEqual(
      triggers.rows.map((r: any) => r.tgname),
      ["invalidate_external_role_derived_data"]
    );
    await db.exec("UPDATE company_roles SET name='Unembedded'");
    assert.deepEqual(
      (
        await db.query(
          "SELECT title_embedding,title_embedding_text FROM company_roles"
        )
      ).rows,
      [{ title_embedding: null, title_embedding_text: null }]
    );
    assert.equal(
      (await db.query(roleTitleNeighborsSql(`'${v}'`))).rows.length,
      0
    );
  } finally {
    await db.close();
  }
});
