import assert from "node:assert/strict";
import test from "node:test";
import { getOrgWorkspaceLocale } from "./workspaceLocale.server";

function fakeAdmin(args: {
  headquarters?: string | null;
  locale?: string | null;
  missingLocaleColumn?: boolean;
}) {
  const selects: string[] = [];
  const admin = {
    from(table: string) {
      return {
        select(columns: string) {
          selects.push(`${table}: ${columns}`);
          const result = () => {
            if (table === "company_db") {
              return { data: { location: args.headquarters ?? null }, error: null };
            }
            if (args.missingLocaleColumn && columns.includes("locale")) {
              return {
                data: null,
                error: {
                  code: "42703",
                  message: "column company_workspace.locale does not exist",
                },
              };
            }
            return {
              data: {
                company_db_id: 7,
                ...(args.missingLocaleColumn ? {} : { locale: args.locale ?? null }),
              },
              error: null,
            };
          };
          const query = {
            eq: () => query,
            maybeSingle: async () => result(),
            single: async () => result(),
          };
          return query;
        },
      };
    },
  };
  return { admin: admin as any, selects };
}

test("a language saved on the workspace wins over an overseas Headquarters", async () => {
  const { admin, selects } = fakeAdmin({
    headquarters: "Los Angeles, United States",
    locale: "ko",
  });
  assert.equal(await getOrgWorkspaceLocale("workspace-1", admin), "ko");
  assert.deepEqual(selects, ["company_workspace: company_db_id, locale"]);
});

test("an unset workspace language keeps the Headquarters rule", async () => {
  assert.equal(
    await getOrgWorkspaceLocale(
      "workspace-1",
      fakeAdmin({ headquarters: "Los Angeles, United States" }).admin
    ),
    "en"
  );
  assert.equal(
    await getOrgWorkspaceLocale(
      "workspace-1",
      fakeAdmin({ headquarters: "Seoul, South Korea", locale: "en" }).admin
    ),
    "en"
  );
});

test("before the locale column exists, the Headquarters rule still answers", async () => {
  const { admin, selects } = fakeAdmin({
    headquarters: "San Francisco, California, United States",
    missingLocaleColumn: true,
  });
  assert.equal(await getOrgWorkspaceLocale("workspace-1", admin), "en");
  assert.deepEqual(selects, [
    "company_workspace: company_db_id, locale",
    "company_workspace: company_db_id",
    "company_db: location",
  ]);
});
