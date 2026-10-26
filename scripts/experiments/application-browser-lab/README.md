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
