import assert from "node:assert/strict";
import test from "node:test";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "test-anon-key";

const serverModule = import("./server");

function createCompanyDbLookupAdmin(responses: Array<Record<string, unknown>>) {
  let queryCount = 0;
  const admin = {
    from(table: string) {
      assert.equal(table, "company_db");
      const response = responses[queryCount++] ?? { data: [], error: null };
      const builder: Record<string, unknown> = {};
      for (const method of ["ilike", "in", "limit", "order", "select"]) {
        builder[method] = () => builder;
      }
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (error: unknown) => unknown
      ) => Promise.resolve(response).then(resolve, reject);
      return builder;
    },
  };
  return { admin, getQueryCount: () => queryCount };
}

test("propagates company_db branding lookup errors instead of detaching", async () => {
  const { resolveWorkspaceBrandingFromCompanyDb } = await serverModule;
  const fixture = createCompanyDbLookupAdmin([
    { data: null, error: { message: "company_db unavailable" } },
  ]);

  await assert.rejects(
    () =>
      resolveWorkspaceBrandingFromCompanyDb(
        fixture.admin as never,
        "https://www.linkedin.com/company/harper"
      ),
    /company_db unavailable/
  );
  assert.equal(fixture.getQueryCount(), 1);
});

test("uses a null target for an intentional empty LinkedIn value", async () => {
  const { resolveWorkspaceBrandingFromCompanyDb } = await serverModule;
  const fixture = createCompanyDbLookupAdmin([]);
  assert.deepEqual(
    await resolveWorkspaceBrandingFromCompanyDb(fixture.admin as never, null),
    { companyDbId: null, linkedinUrl: null, logoUrl: null }
  );
  assert.equal(fixture.getQueryCount(), 0);
});
