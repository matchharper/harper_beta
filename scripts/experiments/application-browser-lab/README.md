# Isolated deployed application lab

Canonical evaluation contract: [application-browser-server](../../../docs/evaluation/application-browser-server/README.md).

Owned Vercel project: `harper-apply-browser-lab-20261022` (`prj_6kxbmw9gYT3tYN7UZCE34fqDrsIT`). Never link this folder to `harper-beta`. It has no Git deployment link. Public fixture: https://harper-apply-browser-lab-20261022.vercel.app.

This directory is a separate Next app; it is not imported by the Harper product. Browser orchestration executes inside `/api/run` on Vercel Node 24 in iad1. Chromium executes in Browserbase us-east-1. No local browser is used. The three external cases are read-only; submission egress is limited to the owned fixture origin. The receiver reads attachment bytes and signs their hashes, but does not durably store bytes.

Required server environment: `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `ANTHROPIC_API_KEY`, separate random `LAB_SECRET`. Local `.env.lab` contains only the lab invocation secret and project ID, mode 0600, ignored. Never print credentials. No production database credentials are needed.

Run against an already deployed instance:

```sh
node invoke.mjs https://harper-apply-browser-lab-20261022.vercel.app inspect slate
node invoke.mjs https://harper-apply-browser-lab-20261022.vercel.app inspect adyen
node invoke.mjs https://harper-apply-browser-lab-20261022.vercel.app inspect policyme
node invoke.mjs https://harper-apply-browser-lab-20261022.vercel.app submit
node invoke.mjs https://harper-apply-browser-lab-20261022.vercel.app legacy
```

`invoke.mjs` is only an HTTP client. It records results in the registry's ignored `runs/` with 0600 permissions. Actual browser/model work and document downloads happen on the deployed server.

`lib/legacy-driver.json` is generated verbatim from the current canonical `controlledBrowserDriver` export, with its source SHA-256. `lib/legacy.js` changes only the browser launch adapter to use remote CDP and runs deterministic test gestures with approval of owned-site requests. It grants a direct form URL and therefore bypasses the new-tab/iframe challenge. This tests the existing executor's upload capability, not the full production planner, eligibility gate or end-user journey. Regenerate the exported string from the canonical module when intentionally testing another source version; do not hand-edit it.

Next file tracing must include Playwright's runtime data, including `browsers.json`. This is needed even though Chromium is remote. Stagehand 3.7.3 is pinned for its built-in hybrid agent; v4 has a different agent integration surface.

Do not deploy this or any Harper component again without authorization for that deployment. The 2026-10-22 request authorized this isolated experiment only.

## Simple application form (deployed 2026-11-05)

`/simple` is a single-page Harper Founding Engineer, AI Agent test application:
name, email, and one resume upload, followed by an inline receipt. It requires no
run token or predetermined applicant/file. The receiver reads the file bytes and
returns their size and SHA-256; it does not persist the applicant or attachment,
or send anything to an employer. The 4 MiB file limit leaves multipart overhead
below Vercel's [4.5 MB request limit](https://vercel.com/docs/functions/limitations#request-body-size).

Check with `node --test simpleFixture.test.mjs`. Preview with
`node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3036`.
Published at https://harper-apply-browser-lab-20261022.vercel.app/simple in
production deployment `dpl_CtBbTp3yQTYVgu68e91ss43gLTEV`. Source manifest SHA-256:
`2d89915d7ff79674ae054c29d7858b6b1aa38c4622204bc98f526f1fe94c7a69`.
The public page returned 200 and a synthetic PDF submission returned 201 with
its exact byte count and SHA-256 verified. This was an HTTP submission check;
browser file upload was not verified because the Chrome extension lacked file
URL access. The fixture role `c351ca7c-b561-4c68-ab04-6b2d3212efa9` links to
this page. This release only changes the isolated lab; the Harper product was
not deployed. The Notion deployment-documentation check found no corresponding
team-facing product behavior change, so no Notion pages were modified.
