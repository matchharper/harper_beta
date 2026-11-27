import assert from "node:assert/strict";
import Module from "node:module";
import { before, test, type TestContext } from "node:test";
import { gtmMailLinkOrigin } from "@/lib/gtmPlays/shared";

// The actual function with the link store and posting reader replaced: no database or network.
const made: unknown[] = [];
let prepareSiteProfileLink: typeof import("./site.server").prepareSiteProfileLink;

before(async () => {
  const loader = Module as unknown as { _load: (name: string, parent: { filename?: string } | null, ...rest: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, parent, ...rest) {
    if (name === "server-only") return {};
    if (name === "@/lib/gtmPlays/jd.server") return { readJdFromUrl: async () => null };
    if (name === "./server" && parent?.filename?.endsWith("site.server.ts")) return {
      ShareLinkUnavailableError: class extends Error {},
      // Like the real store: the link is on gtmMailLinkOrigin(), its token in this server's database.
      createShareLink: async (args: unknown) => {
        made.push(args);
        return { url: `${gtmMailLinkOrigin()}/c/AAAAAAAAAAAAAAAAAAAAAA`, link: {}, created: true };
      },
    };
    return original.call(this, name, parent, ...rest);
  };
  try {
    ({ prepareSiteProfileLink } = await import("./site.server"));
  } finally {
    loader._load = original;
  }
});

function server(t: TestContext, env: Record<string, string | undefined>) {
  made.length = 0;
  for (const [key, value] of Object.entries({ VERCEL_ENV: undefined, GTM_MAIL_LINK_ORIGIN: undefined, ...env })) {
    const before = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (before === undefined) delete process.env[key];
      else process.env[key] = before;
    });
  }
}
const prepare = () => prepareSiteProfileLink({
  talentId: "00000000-0000-4000-8000-000000000001",
  operationId: "00000000-0000-4000-8000-000000000002",
  profileLink: { company_name: "Company A", posting_title: "Backend Engineer", posting_url: "https://example.com/jobs/1" },
});

test("the production server gives the browser the candidate summary link", async (t) => {
  server(t, { NODE_ENV: "production", VERCEL_ENV: "production" });
  const result = await prepare();
  assert.equal(made.length, 1);
  assert.match(result.instruction ?? "", /Candidate summary link \(the user approved adding it to this application\): https:\/\/matchharper\.com\/c\/AAAAAAAAAAAAAAAAAAAAAA/);
  assert.equal(result.note, "Candidate summary link given to the browser with its placement rules.");
});

test("another server makes no link, and says it is not the production server", async (t) => {
  for (const env of [
    { NODE_ENV: "development" },
    { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix-branch" },
    // Only an http loopback origin counts as a local test; any other value leaves links on the production address.
    { NODE_ENV: "development", GTM_MAIL_LINK_ORIGIN: "https://example.com" },
  ]) {
    await t.test(JSON.stringify(env), async (t) => {
      server(t, env);
      const result = await prepare();
      assert.equal(made.length, 0, "no link is made");
      assert.equal(result.instruction, null);
      assert.equal(result.note, "Candidate summary link not added: this is not the production server, so a company could not open a link made here.");
    });
  }
});

test("a local server whose links point back to itself still makes one, for testing", async (t) => {
  server(t, { NODE_ENV: "development", GTM_MAIL_LINK_ORIGIN: "http://127.0.0.1:3103" });
  const result = await prepare();
  assert.equal(made.length, 1);
  assert.match(result.instruction ?? "", /: http:\/\/127\.0\.0\.1:3103\/c\/AAAAAAAAAAAAAAAAAAAAAA/);
});
