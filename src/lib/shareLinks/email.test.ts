import assert from "node:assert/strict";
import Module from "node:module";
import { before, test, type TestContext } from "node:test";
import { gtmMailLinkOrigin } from "@/lib/gtmPlays/shared";

// The actual function with the link store and posting reader replaced: no database or network.
const made: unknown[] = [];
let appendEmailProfileLink: typeof import("./email.server").appendEmailProfileLink;

before(async () => {
  const loader = Module as unknown as { _load: (name: string, parent: { filename?: string } | null, ...rest: unknown[]) => unknown };
  const original = loader._load;
  loader._load = function (name, parent, ...rest) {
    if (name === "server-only") return {};
    if (name === "@/lib/gtmPlays/jd.server") return { readJdFromUrl: async () => null };
    if (name === "./server" && parent?.filename?.endsWith("email.server.ts")) return {
      ShareLinkUnavailableError: class extends Error {},
      // Like the real store: the link is on gtmMailLinkOrigin(), its token in this server's database.
      createShareLink: async (args: unknown) => {
        made.push(args);
        return { url: `${gtmMailLinkOrigin()}/c/AAAAAAAAAAAAAAAAAAAAAA`, link: { snapshot: { wants: [] }, language: "en" }, created: true };
      },
    };
    return original.call(this, name, parent, ...rest);
  };
  try {
    ({ appendEmailProfileLink } = await import("./email.server"));
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
const body = "Hello,\n\nI'd like to apply for the Backend Engineer role.\n\nBest regards,\nCandidate";
const append = () => appendEmailProfileLink({
  talentId: "00000000-0000-4000-8000-000000000001",
  to: ["recruiting@company-a.example"],
  body,
  isHtml: false,
  profileLink: { company_name: "Company A", posting_title: "Backend Engineer", posting_url: "https://example.com/jobs/1" },
});

test("the production server adds the candidate summary link under the signature", async (t) => {
  server(t, { NODE_ENV: "production", VERCEL_ENV: "production" });
  const result = await append();
  assert.equal(made.length, 1);
  assert.ok(result.body.startsWith(body));
  assert.match(result.body, /Summary and Q&A: https:\/\/matchharper\.com\/c\/AAAAAAAAAAAAAAAAAAAAAA$/);
  assert.equal(result.note, "Candidate summary link added as a P.S. under the signature.");
});

test("another server sends the approved body without a link, and says it is not the production server", async (t) => {
  for (const env of [
    { NODE_ENV: "development" },
    { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix-branch" },
    // Only an http loopback origin counts as a local test; any other value leaves links on the production address.
    { NODE_ENV: "development", GTM_MAIL_LINK_ORIGIN: "https://example.com" },
  ]) {
    await t.test(JSON.stringify(env), async (t) => {
      server(t, env);
      assert.deepEqual(await append(), {
        body, isHtml: false,
        note: "Candidate summary link not added: this is not the production server, so a company could not open a link made here.",
      });
      assert.equal(made.length, 0, "no link is made");
    });
  }
});

test("a local server whose links point back to itself still adds one, for testing", async (t) => {
  server(t, { NODE_ENV: "development", GTM_MAIL_LINK_ORIGIN: "http://localhost:3000" });
  const result = await append();
  assert.equal(made.length, 1);
  assert.match(result.body, /Summary and Q&A: http:\/\/localhost:3000\/c\/AAAAAAAAAAAAAAAAAAAAAA$/);
});
