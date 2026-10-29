# Public application-form preparation inspection

## Objective and evaluation unit

Verify the product's public form reader using the shared OpenAI-hosted executor and `gpt-6.1-sol`, reasoning `low`. One unit is a fresh inspection of one frozen synthetic page or a captured public JD, including browser setup and the model tool loop. The current output is the complete visible application input inventory; the downstream analysis chooses preparation items. This is not application submission, resume writing, or a general ATS compatibility benchmark.

## Frozen inputs and gold

`cases-v1.json` selects plain, linked iframe and login-blocked routes of `fixtures/server-v1.cjs`. Historical `gold-v1.json` preserves the original preparation-selection contract. Current `gold-inventory-v2.json` preserves the same source fixtures but expects the full visible inventory after the user's expanded retrieval requirement; `manifest-inventory-v2.json` records the contract change without rewriting older input/gold. These pages contain invented employer text and empty controls only; no candidate facts or files. The loopback HTTPS fixture lives solely inside OpenAI. Only the test launcher permits loopback networking; it preserves the product's read-only guard.

## Canonical runner and input/output contract

`scripts/evalApplicationFormInspection.ts` imports `inspectApplicationForm`, its production prompt/tool contract, the shared runtime and encrypted result store. The server owns navigation/DOM reads. The model has `environment:none`, no shell/file/input/attachment/approval capability, and selects current observed field refs. Exact labels, instructions and native attributes are copied from DOM facts by the server; unknown attributes remain unknown. Fields are not classified using runtime keywords. Ashby's existing public read has offline regression coverage and requires no model on success.

Run from `harper_beta`: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalApplicationFormInspection.ts --case plain` (or `iframe`, `login`). Defaults to the current inventory-v2 gold; `--dataset v1` reproduces the historical gate and is expected to reject the intentional full-inventory expansion. Credentials are loaded privately from `.env.local`. Earlier Luna runs and their limitations remain unchanged. Historical aggregate evidence and limitations: [2026-10-12 local verification](reports/2026-10-12-luna-read-only-ko.md).

## Configuration, metrics and release gate

Model: product default `gpt-6.1-sol`; reasoning `low`; no sampling override. Work deadline: 180 seconds including environment setup, with bounded separate cleanup. Record actual session/turn usage where available; unavailable usage is not a zero-dollar bill. Hosted environment charges are separate from token estimates.

Current gate for plain and iframe: all visible application gold fields selected, including basic details; hidden fields excluded; exact native required-state/file-type/max-length retained; source URL observed; conditional/access limits preserved. The v1 historical gate instead excluded basic fields. Login case must be unavailable with no preparation fields. Every synthetic case must produce no fixture write/mutation evidence, use zero executor model turns and remove all provider sessions/environments (404 verification). Exact label comparison here validates frozen fixture identifiers, not a production classifier or qualitative-output rewrite.

2026-10-13 Sol low local regression: inventory-v2 plain/iframe/login all passed against unchanged frozen inputs/gold, in 147.731/78.850/79.823 seconds including cleanup. Each had zero observed fixture writes, zero executor model turns and independently verified 404 cleanup. API usage counters were unavailable. Canonical raw runs are `runs/2026-10-13T04-06-40-686Z-plain/`, `runs/2026-10-13T04-07-44-025Z-iframe/` and `runs/2026-10-13T04-07-44-025Z-login/`. These synthetic results are separate from historical Luna real-JD observations. This default change is local and not deployed.

## Provenance, privacy and limitations

Runs record source revision, dirty-source and prompt hashes, fixture/gold version, provider/configuration, elapsed time, result and cleanup under gitignored owner-only `runs/`. Raw model outputs and artifacts stay there. API/admin keys are never logged or provided to the executor. The existing private Storage bucket is used only for encrypted temporary results under isolated random prefixes, which are cleared; no candidate/Role/document/message rows, settings, migrations, push or deployment.

Small synthetic cases establish plumbing and regression coverage, not production accuracy across all sites. Native DOM required-state can be unknown even when a website enforces validation elsewhere. Hidden/answer-dependent questions, login, CAPTCHA and custom controls may remain unverified. Model quality failures must be addressed through prompt/context/tool contract, never fixture-specific runtime branches. Changed fixtures or gold create a new version.

## Live JD challenge set: live-v2

The user requested testing actual JDs, especially a company page whose Apply link opens a Lever form. `cases-live-v2.json` freezes three public source URLs (Lever redirect, Ashby, Greenhouse). `gold-live-v2.json` freezes the independently observed application destination, minimum visible input inventory and named question coverage before product-model execution. These extend the experience to a complete visible input/question inventory; the older synthetic v1 preparation-selection contract remains frozen. WorkOS is a navigation/read smoke case until its full independent inventory is captured; it has no completeness gate yet. Channel's 26 controls count each checkbox option separately. Greenhouse's lower bound includes basic fields, written answers and custom comboboxes; hidden mirror controls are not user-facing questions.

Canonical live runner: `scripts/evalLiveApplicationForms.ts --case <id>` through `pnpm exec tsx --tsconfig scripts/tsconfig.json`. It imports the actual inspector/runtime/prompt without fixture injection, captures snapshots and matching model actions, verifies destination and full-inventory coverage, and records cleanup. Public pages may change after the frozen date, so live completeness findings are as-of observations, not a static replay or overall production accuracy estimate. Source captures and raw outputs stay in owner-only ignored `private/reference-live-v2/` and `runs/`. No personal data, documents, answers, uploads, login, consent, employer submissions, production rows, settings, migrations, push or deployment are used. Anonymous site bootstrap queries may use POST; command evidence establishes read-only model capabilities, not an assertion of zero HTTP POSTs. Actual HTTP egress evidence is recorded only when instrumentation is available.

`live-v3` retains the same URLs and adds the independently rendered WorkOS inventory (11 application questions, excluding the resume-autofill helper input and hidden mirrors). Gold review is explicitly unblinded after live-v2 results; `manifest-live-v3.json` records provenance and hashes, and v2 remains unchanged. The live runner defaults to v3; use `--dataset live-v2` to reproduce the earlier gate. Full-inventory inspection is now the product contract, and the existing downstream analysis chooses substantive preparation items. Source parsing preserves accessible labels, nearby DOM text for unbound inputs, checkbox-group context, native constraints and custom combobox types. No role/company-specific runtime branches are used.

[Live results and limits](reports/2026-10-12-live-jds-ko.md): all three live destinations/inventories verified, 51 regression tests passed. Inventory-v2 synthetic plain case passed through the real API; inventory-v2 iframe/login have not been rerun. Historical v1 results remain in their original report. Whole-project TypeScript currently has an unrelated UI error recorded in the report.

## Standalone native hosted-browser notebook

The local canonical playground is [`output/jupyter-notebook/agents_api_application_inputs.ipynb`](../../../output/jupyter-notebook/agents_api_application_inputs.ipynb). It is one self-contained notebook, separate from the production inspector and its regression runners. `APPLICATION_URLS` and `MODELS` define a sequential URL × model sweep, with a fresh `openai_hosted` desktop and native `computer_use` tool per unit. It calls the Agents REST API directly, so it does not depend on an Agents SDK release. `RUN_LIVE=False` is the default; the initial URL is an empty Ashby public demo form. No Harper service, DB, application or recommendation state is changed.

Input contract: one http(s) URL, an exact API model ID, optional shared reasoning effort, origin approval policy, optional dedicated sign-in handoff, and a 600-second work limit. The current `input-list-v2` output contract is schema-constrained JSON containing only the actual application URL, applicant input entries (`label`, nullable `required`) and a short coverage note. The model describes what information to prepare in concise Korean. It reads the current form's labels in one pass, preferring a combined page/DOM read where available. It must not open choice menus, enumerate options, search autocomplete, inspect attachment/manual-entry alternatives, add repeated sections or revisit the page/bottom/submit button for confirmation. Autofill helpers and CAPTCHA branding are excluded from the applicant list by model judgment, not runtime filtering. Code validates only the machine schema; it does not classify or rewrite qualitative content. Agent instructions prohibit applicant answers, uploads, consent selection, account creation and application submission. This instruction boundary is weaker than the production reader's restricted executor: OpenAI's hosted browser does not provide an application-level interceptor for each click. An input-gated later step remains uninspected rather than being unlocked with invented answers. Historical detailed inventories remain in their original run artifacts; their broader output contract is not the notebook's current default.

These runs use `datasetVersion=ad-hoc-live`, `goldVersion=null`. Existing frozen fixtures/gold remain unchanged. The configured URL list is frozen only within a given sequential batch; external page content is not frozen. Recorded field counts, work status, elapsed time, usage when available and deletion verification are diagnostic metrics, not accuracy scores or a release gate. Model quality comparisons require a separately reviewed frozen input/gold version; this notebook cannot establish model ranking or product readiness. Source URLs, exact model/reasoning configuration, provider-default sampling, prompt/input/schema fingerprints, source revision and dirty-diff fingerprint are recorded per run. The request records the actual prompts and message idempotency key for reproducibility. User approval time, HTTP timeouts and cleanup can extend the nominal work limit.

`input-list-v2` additionally records elapsed event times for completed browser operations and session/turn/cleanup timestamps. Total elapsed time still includes session creation, work, transport and resource cleanup. These observations do not individually measure model inference or page-loading time. Changing this prompt/output contract creates a new run against an existing frozen URL sample; it does not overwrite past input snapshots or outputs. Coverage review checks that the shorter output still represents the previously observed applicant information and that option-expansion/reconfirmation is absent from the reviewed trace. This is a manual smoke gate with mutable pages and no independent full gold, not a production latency guarantee.

Optional `usage_wait_seconds` performs read-only turn/trace accounting capture after the root turn finishes. Its default is zero; the new random batch used twenty seconds. `elapsed_seconds` includes this observation, while `inspection_elapsed_seconds` excludes only `timings.usage_capture_seconds`; both include setup, work, transport and cleanup. This observer does not resend a task or interact with the browser. Usage is best effort, can arrive late, and is not a final bill. The usage fields do not expose separate cache-write counts. A transport exception can prevent accounting capture altogether; missing usage must never be priced as zero.

Raw requests, JSON outputs and manifests live in ignored `runs/hosted-browser-notebook/`, with directories `0700` and files `0600`. API keys and sign-in values are not logged; dedicated authentication responses are not saved. Screenshots stay in memory and may be shown in notebook output, so clear outputs before sharing. Default runs use no candidate facts or files. Enabling sign-in explicitly sends the user's credentials through OpenAI's dedicated browser authentication event to the displayed destination; it does not place them in agent messages. A notebook moved outside the checkout uses its current directory's `runs/`, which must remain private and uncommitted. Session deletion is followed by GET 404 verification; uncertain session creation is never automatically retried. CAPTCHA, authentication methods unsupported by the hosted browser, conditional/unseen questions and mutable public pages limit coverage.

2026-10-12 local validation: dry notebook executed top-to-bottom; isolated transport checks covered root/subagent completion, multiline SSE, invalid JSON contract, failed/truncated work, unsupported actions, cancelled authentication and unverified deletion. A fresh native `gpt-6.1-sol` public Ashby demo inspection completed in 186.02 seconds and returned schema-valid inventories for both demo forms (8 distinct form controls), with GET 404 cleanup verification. This is a plumbing smoke result with no independent completeness gold. A preceding model run failed with provider `server_overloaded`; its remaining session was subsequently deleted and GET 404 verified. No automatic model retries were added.

### Random external JD capture: native-random-v1

At the user's explicit request on 2026-10-12, five unique `company_roles.external_jd_url` values were sampled from live external rows (not expired/ended/closed/inactive/archived, no elapsed expiry, no `testOnly` marker). A cryptographic random seed ordered unique URLs by `md5(url || seed)` without provider or ATS stratification. Capture used the Worker's canonical `connect_read_only()` and verified `transaction_read_only=on`. Only public source URLs were supplied to the OpenAI Agents endpoint; no candidate data, private company descriptions, files or credentials were supplied. Standard configured OpenAI project data policy was unchanged. The seed, query, exact row/URL snapshot and public source observations are owner-only in ignored `private/native-random-v1/`; [manifest-native-random-v1.json](manifest-native-random-v1.json) records de-identified provenance. Existing datasets/gold remain unchanged; no independent full gold was created.

The canonical notebook function ran with `gpt-6.1-sol`, provider-default reasoning/sampling, 600 seconds per case, no sign-in, and at most three concurrent inspections. Four source URLs reached application forms and returned schema-valid inventories, with the agent reporting the final submit control. One source URL displayed a closed-job notice despite the DB's active marker. Raw returned-control counts across the five cases were 20, 0, 19, 35 and 20; manual review distinguishes applicant inputs from three reCAPTCHA notices and one resume-autofill helper, giving 19, 0, 18, 34 and 19 applicant inputs. Required-state counts on the four forms were 17, 12, 30 and 10. These are observed counts, not accuracy or production coverage rates.

One legitimate custom-careers redirect was initially denied by the narrow origin allowlist. Its exact destination was confirmed through an independent HTTP redirect read and that same case was manually rerun with the added origin; all six attempts are preserved, and all six sessions verified GET 404 cleanup. The successful final screenshots were reviewed. One public form-definition read independently matched all 19 applicant questions and 10 required-state flags; this review was unblinded after the model output. A school-search list was only partially enumerated, search-dependent city options and answer-dependent hidden questions remain unverified, and one stored company label differed from the actual application-page brand. No production row, expired-state marker, recommendation, message, application or deployment was changed. Full raw outputs, screenshots, final JSON and a readable HTML report are in ignored `runs/native-random-v1-20261012T131002Z/`, with the corrected-origin run in `runs/native-random-v1-20261012T131310Z/`.

### Input-list-v2 single-case rerun

The user then requested only what the applicant must enter, with no choice-menu expansion or repeated confirmation. The notebook prompt/output contract was narrowed generally, without a company-specific branch. A single fresh run reused `native-random-v1` case `random-jd-01`, the exact JD URL, `gpt-6.1-sol`, provider-default reasoning and the same 600-second limit. It received no baseline fields or answers in model context. Result: 65.44 seconds total versus the prior detailed run's 417.59 seconds; four completed browser operations versus nineteen. One operation reads the applicant labels, with no option-enumeration or submit-reconfirmation activity named in the saved trace. Manual semantic review found all nineteen previously observed applicant information items represented by concise Korean labels; seventeen had a directly observed required flag, while the two document fields remain unknown in the quick-read contract. No option-list or detailed-audit keys exist in the new output schema. Do not turn the single run's 84.3% elapsed reduction into a general latency guarantee.

The new event timing record shows session creation at 1.760 seconds, the first completed browser operation at 36.865 seconds, label-read completion at 50.468 seconds, root-turn completion at 62.331 seconds and 2.812 seconds of cleanup. It does not split first-operation time into environment preparation, inference and execution. No screenshot bytes were returned for this run, so review used the resulting labels and recorded activity rather than screenshot proof of individual UI actions. The session verified GET 404 deletion. Dry notebook execution and the shorter result display passed. Raw result, request and reproducibility metadata are in ignored `runs/stripe-input-list-v2-20261012T134412Z/` and its linked provider-run folder; [manifest-input-list-v2-stripe.json](manifest-input-list-v2-stripe.json) is the de-identified run locator. Earlier data and output files remain unchanged.

### Input-list-v2 new random batch: native-random-v2

On the user's local date 2026-10-13, five other unique active external URLs were captured with the same read-only eligibility and seeded random ordering as v1, excluding every URL in the previous sample. `private/native-random-v2/` preserves the frozen row/URL snapshot, seed, query and redirect observations. No provider stratification or sample replacement was performed. The notebook's input-list-v2 instructions and output schema remained unchanged; only optional accounting observation was added. Each URL had one fresh `gpt-6.1-sol` attempt, default reasoning/sampling, a 600-second work limit, maximum three concurrent cases, no sign-in, exact-origin approval and no automatic model retry.

Inspection times in case order were 316.89, 129.62, 70.46, 80.27 and 175.56 seconds. These include setup and cleanup but exclude the separate accounting observer. The mean was 154.56 seconds, median 129.62 seconds; the concurrent batch took 323.71 seconds including accounting capture. Completed browser-operation counts were 4, 4, 4, 8 and 2. These counts include connection operations and do not prove that choice menus were never opened; saved activity titles alone do not reveal individual arguments.

Manual, unblinded review found one complete visible checklist (19 information items), one incomplete checklist (1 returned versus 17 independently visible applicant information items), one authentication gate (4 account-creation inputs only, with the later application inaccessible), and two connection failures with no inventory. The complete and incomplete checklist cases were independently opened in a separate read-only browser; controls and grouped questions were compared semantically without opening dropdowns or supplying answers. The two connection-failure URLs also opened public application controls in that separate browser, so these failures do not establish that the jobs were closed or inaccessible. The transport records contain `ConnectionError`, with no root completion event or usage; operation timing is consistent with the configured 120-second stream read timeout, but the exception detail was not retained and the specific network/provider cause is unproven. API completion and JSON schema validity are not completeness gates.

Three attempts supplied best-effort token usage through the root turn resource and trace. At the [official pricing](https://developers.openai.com/api/docs/pricing) checked on 2026-10-13, short-context standard input/cached-input/output rates yield partial token estimates of USD 0.109345, 0.098277 and 0.119836 (sum 0.327458). These exclude cache writes, container charges and the two failed attempts' unknown tokens; per-call context-tier detail was unavailable, so short-context pricing is an explicit assumption. Aggregate multi-call input tokens must not be used as one call's context length. OpenAI-hosted environments use standard container rates; the documented medium default is 4 GB, which was also observed in the three returned session resources. The 20-minute-session reference is USD 0.12 each, or USD 0.60 for five fresh environments. Eligible minute billing with a five-minute minimum may change this reference; billing eligibility was not exposed. The batch's exact total charge cannot be established from these artifacts.

All five sessions verified GET 404 cleanup. No applicant answers, uploads, account creation, consent or submission were performed. Raw requests, outputs, accounting traces, reviewed labels, cost assumptions and readable HTML are owner-only in `runs/input-list-v2-random-v2-20261012T151525Z/`; [manifest-input-list-v2-random-v2.json](manifest-input-list-v2-random-v2.json) is the de-identified locator. No full frozen gold or release gate was created. This sample contradicts a general claim that the single Stripe result established reliable retrieval; completeness and transport reliability remain unresolved.

### Korean-market additional sample: native-korea-v1

At the user's request on 2026-10-13, five other active external URLs were sampled from `source_provider=zighang`, using the same seeded unique-URL selection and verified read-only connection, excluding both earlier samples. This is a random sample within that Korean-market source, not all Korean external roles or an ATS-stratified sample. Four rows explicitly locate the role in South Korea; the remaining row has an unspecified location and the Korean company's Korean application page was manually verified. The complete frozen production-row capture, exact query/seed and redirects remain owner-only in `private/native-korea-v1/`. Gold remains null; existing datasets are unchanged.

The thin batch launcher [`scripts/runAgentsApplicationInputBatch.py`](../../../scripts/runAgentsApplicationInputBatch.py) imports the canonical notebook's cells, instructions and schema. Example: `output/jupyter-notebook/.venv/bin/python scripts/runAgentsApplicationInputBatch.py --sample docs/evaluation/application-form-inspection/private/native-korea-v1/sample.json`. Configuration remained `gpt-6.1-sol`, default reasoning/sampling, 600 seconds, maximum three concurrent cases, no sign-in, twenty-second optional accounting observation, no task retries and unknown-origin denial. Inspection times in case order were 78.98, 166.89, 81.51, 70.31 and 209.25 seconds, excluding additional accounting capture; the concurrent batch took 313.58 seconds including that capture. Browser-operation counts were 6, 6, 6, 4 and 6.

Unblinded manual review found two visible-form checklists representing the observed applicant information (12 and 8 preparation items), a login redirect, a stopped-application notice, and an unresolved path for an older source posting absent from the current list. The eight-item checklist groups portfolio file and URL under one preparation item; the page has nine distinct input controls, so eight must not be called an exact control count. The login origin was denied by the runner, and an independent browser visit confirmed the actual sign-in page. The unresolved posting is not asserted closed merely because the current list lacks it. Each source and both reached forms were reviewed in a separate read-only browser without opening choice lists or supplying answers.

All five attempts supplied best-effort usage. At the official short-context standard rates checked on 2026-10-13, partial token estimates in case order are USD 0.115090, 0.113034, 0.109247, 0.105496 and 0.129077; sum USD 0.571944. Cache writes and container charges are excluded; per-generation context tier remains unknown. The five medium environments' 20-minute-session reference is USD 0.60; eligible minute billing may differ. Every session and environment independently returned 404 after deletion. These results establish observed access/coverage limits, not model accuracy or a general latency guarantee.

The user separately authorized attaching the existing Storage E2E PDF to the reached real application forms. That is a different capability test with different tooling, recorded under [agents-hosted-resume-upload](../agents-hosted-resume-upload/README.md), `storage-live-v1`. No PDF or applicant data entered these five inspection runs. Raw inspections, manual assessments, usage calculations and the combined readable report are in `runs/input-list-v2-native-korea-v1-20261012T153221Z/`; [manifest-input-list-v2-native-korea-v1.json](manifest-input-list-v2-native-korea-v1.json) is the de-identified locator.

### Low-effort comparison on the existing Korean sample

The user requested fresh native hosted-browser inspections of existing `native-korea-v1` cases 04 and 05 with `gpt-6.1-sol` and `gpt-6-luna`, both explicitly using `reasoning.effort=low`. The canonical launcher now accepts repeated `--case`, `--reasoning` and `--gold` options and records the selected subset and exact effort without changing the notebook prompt, schema or frozen source URLs. Batch IDs include a random suffix so simultaneous model runs cannot overwrite each other. Each model runs its two cases sequentially; the two models can run concurrently, for at most two active inspections overall. Sampling and service tier remain provider defaults; the work limit remains 600 seconds, accounting observation 20 seconds, and task retries zero. This comparison reads input requirements only; the previous PDF-attachment authorization is not exercised by these inspection runs.

[gold-native-korea-visible-v1.json](gold-native-korea-visible-v1.json) freezes the de-identified, previously independently rendered visible information lists before either new model run. Historical label review was unblinded after the earlier default-effort output; it is not an independent human gold. [manifest-native-korea-low-comparison-v1.json](manifest-native-korea-low-comparison-v1.json) preserves sample/gold hashes, configurations and provenance. Gold and previous outputs never enter the agent context. Manual review checks semantic coverage, allows equivalent Korean wording and grouped portfolio file/URL, and records omissions rather than rewriting model output. Required-state accuracy and hidden/conditional questions are outside this comparison gate. Public pages remain mutable; only two cases and one attempt per model establish observed differences, not a general model ranking or production latency guarantee. Raw responses, usage, timing, review and any source snapshots remain owner-only under ignored `runs/` or `private/`.

2026-10-13 results: Sol low completed the two cases in 62.46 and 58.52 seconds; Luna low in 56.77 and 73.47 seconds, excluding post-work accounting. Sol represented all expected information in both cases. Luna omitted the distinct link input and returned a null application URL in case 04; case 05 covered all nine information items. Sol's eight-item case-05 output groups the portfolio file and URL, so eight is not the UI control count. First complete model-request spans were Sol 30.211/27.763 seconds and Luna 24.882/24.572 seconds; these are not TTFT or pure reasoning time. Sol used 5/6 browser operations, Luna 3/10. Operation titles and OTLP traces do not reveal detailed command arguments, so no strict zero-expansion or zero-reconfirmation assertion is made.

Observed mean inspection times were 60.49 seconds for Sol and 65.12 seconds for Luna. Best-effort usage under assumed Standard short-context rates gives partial model-token totals USD 0.223607 and 0.013417 respectively, excluding cache writes and hosted-container charges. All four sessions and environments independently verified 404 deletion. The independently rendered current forms retained the historical reference information. Actual request files verified `reasoning.effort=low` for every unit. Raw results, costs, timing analysis, manual assessment and readable HTML are in ignored `runs/low-model-comparison-v1-20261013T022030Z/`, with canonical batch runs linked from `comparison.json`. One attempt on two sites does not establish general superiority or the causal effect of lowering effort.

### Fresh random external sample: native-random-v3

The user requested five new random external JDs, explicitly excluding `is_expired=true`, with Sol low and independent page review. [`scripts/captureAgentsApplicationInputSample.py`](../../../scripts/captureAgentsApplicationInputSample.py) uses the Worker's canonical verified read-only helper, seeded unique-URL ordering, `is_expired IS DISTINCT FROM TRUE`, no elapsed expiry, no closed/inactive/test-only role, and exclusion of all earlier samples. There is no country/provider stratification or sample replacement. Full production rows, seed and query are owner-only in ignored `private/native-random-v3/`.

[gold-native-random-v3-visible-v1.json](gold-native-random-v3-visible-v1.json) freezes a separate browser's visible information and access-limit review before this model run. Two URLs expose ten and sixteen applicant information items; one redirects away from the original expired posting, and two require authentication before application details. The stale live destination remains in the sample despite the DB's false expiry flag. [manifest-native-random-v3.json](manifest-native-random-v3.json) records hashes, provenance and configuration. Run the canonical batch launcher with this sample, `--model gpt-6.1-sol --reasoning low --gold docs/evaluation/application-form-inspection/gold-native-random-v3-visible-v1.json --concurrency 3 --usage-wait-seconds 20`. Each unit has one fresh native OpenAI-hosted browser, the unchanged input-list-v2 prompt, 600 seconds, provider-default sampling/service tier, no task retries, sign-in, applicant values, documents or real-company submission. Gold never enters model context. Manual semantic coverage and access-limit comparisons are diagnostic gates, not keyword classifiers, independent human accuracy or hidden/conditional-question coverage. Raw results and cost/timing evidence belong only in ignored owner-only runs.

Observed results on 2026-10-13: 55.54/53.78/69.17/57.30/62.64 seconds, mean 59.69 seconds, excluding post-work accounting. The two public forms represented all ten/sixteen reference items. Two application paths remained authentication-gated. For the remaining URL, the managed browser reported login while the independent browser redirected to an expired-posting search; this access-reason difference is retained rather than classified as identical. No sample was replaced. Partial Standard short-context model-token estimate is USD 0.524922, excluding cache writes and hosted environment. All five sessions/environments verified 404 deletion. Exact requests verified low effort. Raw inventories, independent manual comparisons, timing/cost evidence and the combined submission-test report remain in ignored `runs/input-list-v2-native-random-v3-20261013T023702Z-116d324d/`. Separate owned full-submission tests are recorded in [agents-hosted-resume-upload](../agents-hosted-resume-upload/README.md); no real employer received a submission.

### Main-document-first browser reads (2026-10-13, local)

The shared executor now reads the main document by default. The frame index contains only observed frame identifiers, URLs and names; it does not read iframe bodies. The planner may opt into a relevant frame with the existing `inspect` action's `frameRef`. Subsequent snapshots refresh the main document and explicitly selected, still-attached frames. Each document is read in one renderer call, bounded to four seconds; failed scopes appear in `readErrors` while successful scopes remain available. Navigation waits for document commit, not all child-frame load events. Dynamic page content may require another model-directed inspection. No ATS/domain classifier or automatic frame traversal was added.

Read-only actions no longer capture submission approval fields. The submission executor captures values from the main document and explicitly selected frames, fails closed on a capture error, and retains selected documents across same-document URL changes. Existing exact-request approval, immutable body/form hashes, egress protections and read-only input/submission guards remain enforced. Offline browser regressions cover an indefinitely loading auxiliary iframe, explicitly selected embedded controls, an isolated frame read failure, stale frame refs, and embedded input/submission after a main-document history change, alongside existing denied/forged/replayed approval tests.

The frozen `inventory-v2` iframe case passed through the actual hosted executor and Sol low planner in 117.665 seconds, with all three expected controls, zero fixture writes, zero executor model turns, and independently verified session/environment 404 cleanup (`runs/2026-10-13T08-19-59-259Z-iframe/`). Inputs and gold were unchanged. This is a focused regression, not a claim about arbitrary embedded sites.

Real-page diagnostics also exposed an independent output-contract problem: a planner could return document-mode buttons as input refs, receive an unhelpful schema error, repeat the same invalid refs and finish without a usable report. The report tool now explicitly restricts `fieldRefs` to current input/textarea/select elements and instructs the model to preserve visible requirements without input refs in `limitations`; the original page text is retained for preparation. Structural validation identifies every invalid ref and the available valid refs so the original planner can correct its report. This does not infer required-state from wording, silently discard model-selected refs, or fabricate file controls. Hidden file inputs, custom non-native controls and conditional questions remain inspection limitations.

After the report-contract change, the same frozen iframe case passed again in 110.093 seconds with all expected fields, zero fixture writes/executor model turns and verified 404 cleanup (`runs/2026-10-13T08-28-06-136Z-iframe/`). The reported public-JD diagnostic then returned a validated `partial` result with public access marked supported: seven exposed native inputs plus the visible resume/additional-document requirements and verification limits preserved in source text/limitations. It issued no `frameRef` command, entered no candidate data, and did not upload, verify email, accept consent or submit. The observed result took 137.383 seconds including setup and cleanup. Two earlier attempts reached the form but ended without a usable report; the second trace proved repeated invalid button refs. These failures remain recorded rather than counted as successes. Manifest, commands, result, manual review and independent planner-session/environment 404 checks are under ignored `runs/selective-read-nuua-20261013/`, with links to the original private diagnostic traces. This diagnostic has no independent frozen completeness gold; a fresh local UI comparison was unavailable because the computer-use service did not respond. Native required attributes disagree with some visible required marks on this page; both observations remain available rather than being heuristically reconciled.

## Ops current-path inspection diagnostics (2026-10-28, local)

`/ops/debugging/application-form` accepts one public job/application URL and calls
`POST /api/internal/debug/application-form` behind the existing internal-user
boundary. Its canonical orchestration is `src/lib/ops/applicationFormInspection.server.ts`
→ `inspectApplicationForm`, without test runtime/provider injection. The current
normal path is Stagehand 3.7.3 + Browserbase with `gpt-6-luna`, medium reasoning,
180-second work budget and separate cleanup. The earlier Sol/OpenAI and Ashby
fast-read descriptions above refer to historical/injected paths and frozen runs.
The Ops tab adds observation callbacks; it does not select a different prompt,
model, timeout or form reader, and does not create application activities.

This is a diagnostic playground, not an accuracy benchmark. A unit is one fresh
URL inspection. There is no frozen gold or completeness score for arbitrary live
URLs; existing cases/gold remain unchanged. Logs stream setup state, navigation,
page console/errors, blocked requests, observed snapshots, completed tool calls
and results, model request/receipt timing, inventory and cleanup. Provider-internal
reasoning and raw authorization headers are not captured. Tool events become
available at step completion; setup dependency installation is observed as phases,
not a continuous shell transcript. Observations are not model input or execution
policy. The browser retains the production read-only boundaries, with no applicant
facts, files, sign-in or submission. Temporary encrypted result transport uses the
existing random Storage prefix and cleanup. With official-link resolution OFF, no production business rows are written; the opt-in DB write is described below.

Result UI shows all returned field attributes, source text, access conclusion and
limitations. Run times include setup and cleanup. Per-request token receipts are
counted once and priced with the shared repository pricing helper; missing prices,
missing usage and started-but-unreturned requests remain unknown/partial. Browserbase
and hosted-compute charges are excluded, not represented as zero. Results/logs live
in the open browser tab and can be downloaded; refresh/navigation does not create a
persisted run history. Raw diagnostic artifacts belong only in ignored owner-only
`runs/`, with source/prompt fingerprints and configuration captured before execution.

Verification: focused tests cover incremental UTF-8 stream decoding, interrupted
streams, cached-token accounting, receipt deduplication, incomplete costs, production
read-only runtime selection, observation failure isolation and cleanup. Local UI
uses synthetic auth/stream fixtures with external requests intercepted; this does
not bypass the actual API, whose unauthenticated request separately returns 401.
2026-10-28 live smoke observations: Fieldguide's supplied URL returned a missing-job
page (0 fields, 105.356s, observed token estimate $0.00436874); Onehouse returned 15
fields (110.090s, observed token estimate $0.00638780). These estimates cover received
usage only; model work in flight at termination and infrastructure are not included.
Manifests/results are in `runs/ops-debug-20261028/` and
`runs/ops-debug-onehouse-20261028/`. No completeness/accuracy claim or deployment.


### Optional official-JD resolution (2026-10-28, local, default OFF)

The same Ops tab accepts a pasted URL with **Exa로 공식 JD 링크 찾기** either
OFF or ON. OFF reads that URL directly; ON resolves its official job link first.
An existing external `company_roles` row can also be selected. Canonical runner:
`src/lib/ops/applicationLinkResolution.server.ts` (`runResolvedInspectionDebug`).
This is an Ops-only experiment; normal Apply With Harper is unchanged.

For a pasted URL with resolution ON, one exact external-role URL match supplies
the company/role context and enables the conditional URL write. No match or
multiple matches run without DB writes or new rows. Exa Contents reads the source
page into a factual plain-text summary, which joins the page title and URL in
the query/selection context. Unreadable content is recorded as missing evidence,
not a fabricated company/title. Source retrieval events, duration and returned
cost are included in the same live run; Contents costs are shown separately from
search costs. Editing a selected role's URL clears its association so another
job's URL cannot be written to the previously selected role.

Each round uses `gpt-6-luna`/medium Responses structured output to generate one
broad company + role query, Exa auto search requesting 10 results with highlights,
then structured selection of a returned candidate ID and a short reason. Company,
role, prior failures and search results enter the model as dedicated text
projections. Raw rows/JSON, timestamps, applicant data and hidden reasoning are
not supplied. ATS names in the prompt are examples, not a domain allowlist.
The model selects a matching direct company/ATS job URL; generic careers lists
are insufficient because the unchanged browser reader receives only a URL.
An originally stored URL is eligible until it has actually been tried.

Before each browser inspection, the chosen URL is saved to
`company_roles.external_jd_url` for the exact selected external role, conditional
on the previously read URL so concurrent changes are not overwritten. The
inspector's `unavailable` conclusion permits one further Exa search and one new
browser inspection. A `read` or `partial` result ends the loop without judging
its prose or field count. No eligible candidate permits the same one remaining
search without starting a browser or writing a URL. Already tried entry/final
URLs cannot be selected again. Provider/DB errors stop and remain visible in
logs; no hidden search retries. After both attempts fail, the last saved URL
remains. No migration or new persistence table.
The selected JD URL is retained; the browser's final application URL is shown
separately in each full result.

Logs include provider-visible query/selection inputs, structured outputs, Exa
candidates, selection reason, DB write receipt and all existing browser events.
Each attempt's complete form result and timing are retained in the downloadable
run. Costs aggregate model receipts across both rounds and browsers, counting
pending requests independently, plus Exa's returned `costDollars.total`.
Missing receipts stay unknown; Browserbase/hosted compute remain excluded.
The streaming route has an 800s platform allowance and a 750s request deadline;
each browser keeps its existing 180s work deadline and cleanup. There is no
production activity/session creation, resume rewrite, applicant input or submit.

Focused synthetic tests cover first success, partial result, retry success,
double failure, no candidate, DB conflict, cancellation, cost aggregation,
provider-visible text/schema and the exact external-role conditional write.
Pasted-URL fixtures cover zero, one and multiple exact DB matches, no writes for
unlinked/ambiguous sources, and incremental Contents billing. Local browser
fixtures verified URL entry with both toggle states, retained input on toggling,
saved-role selection and clearing that association on URL edits. The shared dev
server's unrelated missing `PreviewHistoryPanel` module caused a global error
overlay; only that overlay was hidden in the isolated fixture browser, without
changing the other page. The real unauthenticated POST still returns 401.
Live smoke manifests and outputs are in ignored owner-only
`runs/ops-exa-20261028*/`; these are ad-hoc diagnostics with no frozen gold or
accuracy claim. Initial search surfaced a confusion between a stored URL and
an already tried URL; that run is preserved and the prompt now names the
actual browser-attempt boundary explicitly. Real DB access during verification
is read-only; any full-pipeline smoke uses an explicitly recorded in-memory
save fixture. Deployment and production DB writes are not part of verification.

Completed live smoke (`runs/ops-exa-20261028-v3/`): fixed Onehouse external role
`75f3ce38-b6d4-5d81-aa03-62cc260e61d7` → 25 Exa candidates → the exact Lever
application URL → `read`, 22 returned controls in 93.389s including cleanup.
Five observed LLM requests cost an estimated $0.00574126; Exa reported $0.022.
Infrastructure is excluded. Returned controls include hidden CAPTCHA controls;
22 is the inspector's inventory count, not a reviewed count of applicant
questions or proof of completeness. DB writes in this run were in-memory
fixtures. Provider-visible text inputs were retained and reviewed. Synthetic
browser testing also verified the real Next page's default-OFF toggle, role
selection/request payload, running logs, candidate/results display and download
availability with API responses intercepted. GET/POST without auth both return
401. Targeted tests pass; repository-wide typecheck remains blocked by unrelated
existing errors including the empty generated database types file.

### Questions-only Ops tab (2026-10-28, local)

The default `질문만 가져오기` tab accepts only a URL. Its internal-authenticated
`POST /api/internal/debug/application-form/questions` calls
`src/lib/ops/applicationQuestions.server.ts`, reusing the read-only Browserbase
runtime with `inspectionMode=questions`. Browserbase SDK 2.22.0 creates/releases
Sessions; Stagehand 3.7.3 runs its hybrid agent locally in the existing hosted
executor (`disableAPI: true`), using `gpt-6-luna`/medium. It does not use
`stagehand.extract()`. Work is limited to 180 seconds plus cleanup.

The original model reads a dedicated text projection of observed inputs/page
text and reports original-language question labels, grouping choice controls
under their question instead of returning answer options. The shared contract
and projection live in `applicationStagehand/inspectionText.mjs`. Status concerns
question retrieval, independently of whether submission would be possible.
Unseen answer-dependent/authenticated steps remain partial/unavailable; a passive
CAPTCHA alone does not invalidate readable questions. No semantic output filter,
rewriter, applicant data, sign-in, consent, submission, business-row write or
new persistence is added. Raw snapshots remain available to the executor.

Both tabs lead with retrieved/partial/unavailable (and distinguish an empty
inventory). The original inspector retains field details and downloadable logs;
logs/costs are collapsed below the result. Tab switching preserves both results.
Focused tests cover the new report boundary, failure cleanup, unknown/empty
outcomes and model-facing text, alongside the existing six stream/runtime tests.
The real questions endpoint rejects unauthenticated requests with HTTP 401.
UI checks use intercepted synthetic sessions/responses, with external writes
blocked; those checks do not establish authenticated API end-to-end coverage.

Ad-hoc live diagnostics are preserved in owner-only ignored
`runs/questions-20261028/` and `runs/questions-20261028-r2/`, each with source/prompt
hashes, raw result and observed text. They reuse the previously captured Onehouse
public URL with no frozen completeness gold. The first run returned 14 questions
but incorrectly treated a passive CAPTCHA as incomplete and wrote its limitation
in Russian. After clarifying the output language and retrieval-status contract,
the second run returned the same 14 questions, `read`, no limitations, in 84.821s
including cleanup. The visible source supports those question labels, and the
Yes/No options are not separate output entries. This is one live-page smoke,
not a general completeness/accuracy score. Neither run entered applicant data
or submitted an application. This change has not been deployed.

### Managed Agents comparison selector (2026-10-28, local)

`/ops/debugging/application-form` now retains the existing flow as option 1 and
adds Browserbase Agents (option 2) and Browser Use Agents (option 3) for questions
only. Switching providers keeps the latest result per provider in page memory.
The original full inspector, role lookup/save and stream route remain option 1.

Canonical adapter: `src/lib/ops/applicationQuestionsAgents.server.ts`; UI endpoint:
`POST /api/internal/debug/application-form/questions`. The internal-authenticated
endpoint accepts `provider` (default `current`) and a Browser Use model (default
`gpt-6-luna`). Provider credentials remain server-side in `BROWSERBASE_API_KEY`
and `BROWSER_USE_API_KEY`. No candidate facts, files, sign-in or application
submission are requested; the only source input is the public HTTPS URL.
The managed task and output schema are exported from the canonical adapter.
Managed providers own their internal tool loop: their tool-result projection
cannot be verified or changed by this integration. The existing local executor's
text-projection contract remains unchanged.

API contracts checked against official docs:
- Browserbase: POST `/v1/agents/runs` with `task`/`resultSchema`, poll uppercase
  run status, read structured `result.output`. No model override or per-run cost is
  exposed. A stop request is asynchronous and must be followed to a terminal state.
  https://docs.browserbase.com/reference/api/stop-a-run
- Browser Use: V4 POST `/api/v4/runs` with `task`/`model`/`outputSchema`, poll
  `/runs/{id}/status`, then read `output` from `/runs/{id}` (not narrative `result`).
  No thinking override is sent; `gpt-6-luna` currently defaults to high, unlike
  the existing option 1's medium. Run cost includes model/search only; session
  `/cost` additionally includes browser/proxy and may lag by 90 seconds. This
  is metered spend before credits, not a final bill. The fresh session's distinct
  browser IDs are listed and stopped after the run to avoid idle browser cost.
  https://docs.browser-use.com/cloud/agent/quickstart
  https://docs.browser-use.com/cloud/openapi/v4.json

No automatic paid creation retry or semantic output gate is added. Requests have
180 seconds plus bounded independent cancellation/cleanup; errors preserve known
run IDs and cleanup warnings. Unknown model/cost values are not shown as zero.
Focused tests cover each API's actual payload/result boundary, partial output,
abort after dispatch, asynchronous remote stop, browser cleanup, costs and key
redaction. These are integration contract tests, not model-quality scores.

Live smoke protocol: the user-provided CMES public job URL
`https://cmesairobotics.career.greetinghr.com/ko/o/233105`, one new run per managed
provider via the authenticated local Ops UI. No frozen gold or completeness score
is asserted; this is ad-hoc API/UI verification, not a reusable benchmark.
Diagnostic evidence belongs in owner-only ignored `runs/managed-agents-20261028/`.
No deployment is included.

Observed smoke result: both managed runs completed with nine question labels.
The first Browserbase response revealed the structured payload is nested at
`result.output`; the adapter and fixture were corrected, then verified against
the same completed run through real GET requests without creating another run.
Browser Use completed via the authenticated Ops UI in 39.1 seconds, with
`gpt-6-luna`/high, 77,881 input and 2,665 output tokens. Its browser was confirmed
`stopped`. The UI retained the result across provider switches. Existing option 1
still exposes both questions-only and full inspection tabs.

Browser Use initially reported $0.001241 for the session; a later authenticated
cost-only refresh reported $0.033451 ($0.000908 model, $0 search, $0.000333 browser,
$0.032210 proxy). The difference is delayed metering, not another run. The UI
provides a cost-refresh button through an internal-authenticated GET on the same
route, validating the session ID and returning only cost fields. This snapshot
is not a final invoice or a price/quality benchmark. Browserbase per-run cost
remains unavailable rather than inferred from workspace totals.

Validation: 13 focused tests pass, changed-file ESLint passes, unauthenticated
POST is HTTP 401. TypeScript reports no errors in the changed paths; whole-project
checking remains blocked by existing errors including the empty
`src/types/database.types.ts`. No broader test suite or deployment was performed.

### Typed-question preview (2026-10-28, local follow-up)

The questions-only output now uses question objects instead of label strings:
`label`, free-text `type`, nullable `required`, observed `options` and `fileTypes`,
nullable `multiple`, and source `instructions`. All three options share this
contract and `questionFieldInstructions`. Types are not constrained to a closed
schema enum; unsupported or unknown types remain readable with a disabled
preview control. Required state and choices are never inferred by a code heuristic.
The local executor adds observed multi-value/file support to its text projection;
its existing read-only interaction guards remain unchanged.

`ApplicationQuestionFields` uses shared Input, Textarea, Radio, Checkbox and Select
components, including multi-select and file-or-URL alternatives. The preview is
local and has no submit/upload/save handler; no applicant input is included in
subsequent agent calls. This is inspection, not an application workflow.
The original full-inspection tab remains unchanged.

Verification scope: structural provider/runtime tests, render coverage for input
families and unknown types, then one public CMES job smoke per managed API using
the revised prompt/schema. This is not a new quality benchmark or frozen gold.
Evidence goes in ignored owner-only `runs/typed-questions-20261028/`; no existing
captures or gold labels are overwritten. No deployment is included.

Typed-field smoke outcome: Browserbase returned ten typed questions in 44.4s;
Browser Use returned ten in 133.3s. Both exposed file-or-URL controls and standalone
checkboxes with required/optional states. Browser Use returned native `text` for
email/phone while Browserbase returned `email`/`tel`; the renderer preserves each
provider's reported type and does not infer or rewrite it from labels. This smoke
does not establish that all type/required metadata is ground truth. Empty file
restrictions remain empty. Browser Use's original policy/help text is retained
behind an expandable input-instructions control.

The authenticated local UI rendered the Browser Use response; switching a resume
control from file to URL created a URL input, and a synthetic name could be typed
and cleared locally. No file was chosen or uploaded and no application submitted.
Focused API/runtime/render tests (14) and existing form tests (3) passed; changed
TS/TSX lint and worker JS syntax checks passed. Whole-project TypeScript still has
existing unrelated errors and no errors in the changed paths. Screenshots, raw
provider results and source hashes are saved only in the ignored run directory.

### Shared Exa toggle restored (2026-10-28, local)

The official-link toggle and optional stored-role picker now sit above all three
execution options. The URL and selected role are shared across providers and the
original full-inspection tab. Off means direct inspection with no source lookup,
Exa request or URL save. On routes questions-only runs through the existing
`runResolvedInspectionDebug` workflow using `applicationQuestionsDebug.server.ts`
as an adapter: exact source association/content lookup, Exa search/selection,
existing conditional URL save, then the selected questions provider. The existing
one-retry policy is reused rather than copied. The full inspector is unchanged.

Question results show the input URL, selected official URL/search reasoning,
linked role's stored URL, separate resolver/Exa usage, and run IDs/cost scope for
multiple attempts. The route keeps internal authentication and extends its
execution deadline to the existing resolver route's 800-second envelope; each
managed agent retains its own 180-second limit and cleanup. There is no new model
prompt, write path, database migration or deployment.

Verification used synthetic source/role/provider dependencies: the seven adapter
tests cover all three providers with the toggle on/off, selected-URL forwarding,
save-before-inspection, unavailable retries, cost provenance and no-candidate
behavior. The thirteen existing resolver tests also pass. Tests use fixture-only
OpenAI/Supabase environment values to initialize clients, with network/provider
calls mocked; they do not update a live role or incur new agent runs. Local UI
checks confirmed one common toggle, visibility for all options/tabs, and URL/toggle
state preservation. Changed-file lint passes; whole-project TypeScript continues
to report pre-existing errors, with none in changed paths.

### Single Exa search (2026-10-29, local)

Supersedes the retry policy above: the shared resolver performs one Exa search
per run, for all three question providers and the full inspector. No candidate
or an unavailable inspection ends the run without a second search or agent run.
Query instructions require the exact company name and full role title from the
supplied facts/source evidence, retaining specialization and seniority instead
of broadening to a role family. Source-page contents lookup, when needed to
identify a pasted URL, remains separate from the single search.

Nineteen focused mocked tests pass, covering success, partial/unavailable results,
no candidate, all three providers and toggle-off bypass. The provider-request
test checks the full title in model context and exact query forwarding to Exa.
Changed-file lint passes. No paid provider run, live role write or deployment.

### Career managed-agent adoption (2026-10-29, local)

Career preparation now defaults to the same Browser Use V4 managed transport as
Ops option 3, extended with the actual form URL, maxLength, source text and
separate submission-access evidence. It preserves typed field inventory for the
existing saved application UI. The initial official-link resolver still performs
one Exa search; an explicit refresh reads the saved URL directly. New submission
attempts use Browser Use Agents too, with no Exa discovery in that execution.
See the approval, file transfer, continuation and verification limits in
[application-browser-server](../application-browser-server/README.md#career-browser-use-agents-migration--2026-10-29-local-not-deployed).
The managed HTTP fixture verifies original types/limits and actual form URL
survive the adapter. No paid run or real application was submitted in this change.
