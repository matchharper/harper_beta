# Deployed Next server application experiment

## Objective and unit
Determine whether a deployed Next.js server can inspect public application forms and use Browserbase + Stagehand hybrid to submit a synthetic application with exact attachment bytes. One execution is one public JD inspection or one owned synthetic submission. This is a challenge fixture, not a representative submission-rate benchmark.

## Frozen v1 input / gold
Frozen before first model execution on 2026-10-22. `gold-v1.json` specifies the synthetic candidate and required outcomes. Public URLs in `manifest-v1.json` are live, mutable observations, not frozen accuracy gold. The three-step owned site includes a new tab, iframe, async location options, two documents with ticket/upload/commit requests, conditional sponsorship question, review, mandatory synthetic consent, optional newsletter.

## Canonical runner and contract
[`scripts/experiments/application-browser-lab`](../../../scripts/experiments/application-browser-lab) owns the isolated Next app. `lib/run.js` contains the actual prompt and generic tools; `lib/fixture.js` owns receiving and signed evidence. `invoke.mjs` only sends authenticated HTTP to the deployed Next server and stores raw responses. No local browser is launched. Document buffers are downloaded in the deployed server and sent over CDP. Browserbase hosts Chromium; the Stagehand SDK and orchestration run in Vercel Node.

Inputs: `mode=inspect`, case=adyen/slate/policyme, or `mode=submit` for owned fixture only. Authentication uses a separate lab secret. Synthetic submission browser egress is restricted to the fixture origin. Inspection provides no personal facts/files and prevents form writes. The model is not given fixture selectors or a scripted walkthrough. File attachment tools enumerate observed inputs and accept an authorized document ID.

## Configuration, metrics, release gate
Stagehand 3.7.3 hybrid (v4 removed built-in agent), Sonnet 5.5 direct Anthropic API, Browserbase SDK 2.22.0, Next 16.4.2, Vercel Node 24. Model sampling defaults; no experiment-level output token cap; max 45 steps, 270s agent timeout, 300s browser session. Proxy is an explicit run flag, off by default. Runs record source file hashes, deployment URL, provider usage/SDK metrics, wall time, session time and proxy bytes. API usage is converted using published prices, not represented as a reconciled invoice. Included/free credits and monthly subscription are separate.

Submission pass: independently verified receiver signature, exact required synthetic fields, both document SHA-256/size, required consent true, newsletter false. A model success statement alone does not pass. Inspection evidence must separate inferred feasibility from observed submission. No general release is authorized by this experiment.

## Provenance / privacy / limitations
All candidate data and documents are synthetic. No production DB access, role creation, candidate messages or real-company submissions. Public job page contents and synthetic browser traces are sent to Browserbase/Anthropic. Raw outputs and private deployment credentials are ignored and owner-only. Deployed site is a separate Vercel project without a Git link; current Harper product paths are unchanged.

Fixture schema is known to the experiment author, but no selector walkthrough is given to the model. Small sample cannot estimate success rate. There is no CAPTCHA/login simulation; those require separate evidence. Server verifies incoming bytes and signs a receipt; it does not retain attachment bytes in durable storage. A signed receipt proves receipt of the bytes, not durable document storage. Any legacy-driver comparison must distinguish an executor probe from a full production model/policy comparison.

## Historical failures v2 — real-site pre-submit test, 2026-10-23

User requested approximately five login-free real JDs where earlier methods failed, through the final submission boundary without submitting. `cases-historical-failures-v2.json` freezes the selected URLs and historical evidence before model execution. These are historical inspection/attachment failures, not five proven production submission failures: Science37 and SpaceX connection errors, Peregrine incomplete inventory, Xation checkpoint, Nuua initial invalid-control/report failures followed by a later partial result. Three ATS platforms are represented. No failed or closed current case may be silently replaced.

Canonical runtime: `lib/preflight.js`; selected cases and synthetic facts: `lib/preflight-cases.js`; structural egress guard: `lib/preflight-guard.js`; HTTP client: existing `invoke.mjs <deployed-origin> preflight <case>`. A new frozen safety rubric is in `gold-historical-failures-v2.json`. No independent completion gold exists. The earlier v1 inputs/results remain unchanged.

Configuration: same Sonnet 5.5/Stagehand 3.7.3, default model sampling, up to 55 steps, 450-second agent timeout and 600-second remote browser. Proxy is recorded explicitly per run, false unless requested. No provider or runtime retries are added. Measure total server wall time, raw provider usage including nested/final calls, Browserbase seconds/bytes, visible field values/validity, screenshots, file selection and upload HTTP response status. Success requires a manually reviewed final-ready form; model completion alone is insufficient. UI file selection or HTTP upload status does not prove an employer retained the file. Final submission is explicitly outside scope.

Safety and data: invented name/email/phone and synthetic documents only; no production DB, saved candidate facts or prior private E2E document. Agent must not submit, create accounts, request email/SMS, contact employers or make legal attestations of a real candidate. Native form submit is suppressed; websockets/beacons are disabled; applicant-data network writes are blocked. Only read methods, explicit GraphQL queries and structurally recognized file-only transfer/ticket requests within an attachment operation may proceed. Unknown writes fail closed. Some sites may need a denied request for a legitimate next step; record this as **test-harness restriction**, never as website inability. This guard is test-only and is not proposed as a production application executor.

Privacy boundary: synthetic upload bytes may reach third-party ATS storage before final submission, as authorized by the requested pre-submit experiment. All traces/screenshots are owner-only ignored runs. No real application should be created. Public content can change between the historical run and this run; this is a diagnostic challenge sample, not a controlled model superiority claim or success-rate estimate. Code and build preparation do not mean this mode is deployed or tested.

Executed results: [2026-10-23 report](report-2026-10-23.md). Two original cases reached the reviewed pre-submit boundary, one completed form entry/upload with email confirmation unverified, one remained incomplete, and one substituted a different job and is excluded from original-case success. The report preserves harness-fix retries, deployment versions, measured costs and the lost initial Science37 response. No production rollout or real-company submission occurred.

## Public pre-submit v4 — ten additional jobs, GPT-6 Luna

User requested ten more cases with `gpt-6-luna`. `cases-public-pre-submit-v4.json` freezes ten additional URLs across Greenhouse (3), Lever (2), Ashby (2), Ninehire (2), Greeting (1), excluding the earlier server-lab cases. This is a purposive public-form sample, not ten verified historical failures and not a paired comparison with Sonnet. Public pages remain mutable. A closed or login-gated case is reported, never replaced after model execution. `gold-public-pre-submit-v4.json` freezes the safety/evidence rubric; completion gold is null.

Canonical runner remains `invoke.mjs <origin> preflight <case> public-pre-submit-v4`, using the same deployed Next server, Browserbase, attachment tools and test submission guard. `lib/preflight-model.js` selects OpenAI Responses, exact model `gpt-6-luna`, medium reasoning, provider-default sampling/tier, store false and 128,000 output capacity. All agent and nested model calls use Luna. Fifty-five steps, 450-second agent and 600-second browser deadlines remain, with up to three concurrent cases and proxy off. Previous datasets and model configurations remain available. The new generic task instruction requires staying on the selected job and final field inspection.

Measure pre-submit completeness, attachment responses/UI, missing or invalid fields, authentication obstacles, guard restrictions, server elapsed time, Browserbase usage and raw provider token/cache usage. Manually inspect final evidence before calling a form ready. Final submission and employer-side acceptance remain untested. Distinguish a model failure from a harness or provider failure. No automatic per-case retry; any corrective rerun is recorded separately, including its cost. No production release gate is implied.

OpenAI pricing and account model availability were checked before execution. Direct provider fetch accounting preserves raw Responses usage because SDK summaries may omit cache-write fields. Transport smoke uses the same model configuration with a harmless function call and no browser; its cost is separate from job runs. All inputs are synthetic; public form content goes to OpenAI and Browserbase. Raw outputs and credentials remain owner-only in ignored files. No production DB or real-company submission. Manifest status records whether preparation, deployment and execution actually occurred.

The initial prepared v3 sample was superseded before job-agent execution: its DoorDash link redirected to an error list in the public HTTP precheck. V4 replaces only that URL with Affirm and preserves v3 files and provenance. The transport smoke passed with exact response model gpt-6-luna and a valid tool call; this does not count as a job completion.

Executed v4 results: [GPT-6-luna ten-job report](report-2026-10-23-luna.md). Ten distinct cases, fourteen attempts including harness corrections, three independently reviewed forms with required inputs/attachment complete, one additional form with missing photo in the synthetic document, and no real submission. Total metered usage estimate $1.179107; all 344 provider responses reported gpt-6-luna. Offline cost runner: `scripts/experiments/application-browser-lab/summarize-luna.mjs`. Ashby remains inconclusive because file storage and draft writes are harness-restricted. Production behavior is unchanged.

## Prepared configuration change — 2026-10-23

At the user's request, the preflight runner's `maxSteps` is now 100 in local source (previously 55). The 450-second agent timeout and 600-second browser deadline are unchanged. This change has not been deployed or executed. Historical manifests and results retain their original 55-step configuration; a future execution must record a new run with the changed source hash against the same frozen dataset.

## Product executor integration — 2026-10-23 (not deployed)

Canonical integration runner: `scripts/evalStagehandApplication.ts inspect|submit`, importing the production runtime and instructions. It uses the unchanged synthetic v1 candidate, documents and signed receiving fixture. Browserbase runs Chromium; the existing hosted server worker holds Stagehand and approval-blocked HTTP requests across separate Next invocations. GPT-6-luna medium, 100 steps, no 450-second agent cutoff; remote resources expire after 30 minutes including user wait. No model filesystem, shell or arbitrary network capability is supplied.

The caller auto-approves requests **only to the owned fixture origin**. It checks waiting/reconnection, duplicate approval idempotency, and server-signed receipt fields, both document hashes and filenames. Inspection is read-only. Approval/UI integration is separately exercised using the existing session tests; no production DB or actual candidate is used. Each execution writes a new private run manifest with source hashes and raw provider usage. Gate requires a verified synthetic receipt, preserved approval tests and inspected inventory; it does not establish success on all public ATS websites or deployed production readiness. All raw outputs stay in ignored owner-only `runs/`; no real applications, contacts or deployment are authorized by this evaluation.

The integration reuses the existing OpenAI-hosted compute (no agent task/model turn) and encrypted private result transport; it does not require Vercel Sandbox or a new Vercel token. Browserbase projects are discovered from the supplied API key when exactly one is accessible. If multiple projects exist, configure BROWSERBASE_PROJECT_ID. Test results remain pending until a live Browserbase session and signed receipt are obtained.

## Browser Use Cloud infrastructure experiment — 2026-10-23

Canonical runner: `scripts/evalStagehandApplication.ts inspect|submit browser-use`.
Example from the repository root: `node --env-file=scripts/experiments/application-browser-lab/.env.lab --env-file=.env.local --import tsx scripts/evalStagehandApplication.ts inspect browser-use` (replace `inspect` with `submit` for the owned fixture).
Requires `BROWSER_USE_API_KEY` and the existing executor/model credentials; no Browserbase key is used for this path. Browserbase remains the default for ordinary product calls. No UI or prompt change, deployment, or real employer submission is included.

The unchanged Stagehand 3.7.3 worker, GPT-6-luna medium, 100-step limit, attachment tool and exact-request approval gate run in the existing hosted server executor. Only browser creation, CDP connection and release switch to Browser Use Cloud API V4. Stagehand's `LOCAL` + `cdpUrl` setting attaches to remote Chromium; it never launches a local browser. Thirty-minute session timeout, proxy explicitly disabled (`proxyCountryCode: null`), CAPTCHA solving/recording disabled. This is infrastructure replacement, not the Browser Use hosted agent or an agent-model comparison.

Same synthetic-v1 input and gold-v1, same frozen bytes and signed receiver. Files/public page contents reach Browser Use and the existing OpenAI model/executor; encrypted result transport is unchanged. Record each run separately with provider/source hashes, elapsed time, raw model usage and result. Failure or timeout does not prove website incompatibility. Release the cloud browser explicitly and stop the executor in cleanup. A live receiver-verified pass is required before claiming end-to-end support; offline transport and approval tests alone do not establish it.

Executed: [Browser Use Cloud report](report-2026-10-23-browser-use.md). Inspection passed (7 initial fields), and one owned synthetic submission passed with both exact attachments. Existing hosted executor WebSocket egress needed an explicit CONNECT proxy agent; this is separate from Browser Use residential proxies, which were disabled. All five created browsers (including two failed startup attempts and a connection probe) were confirmed stopped. No product deployment or full web UI E2E was performed.

## Executor latency experiment — 2026-10-23 (not deployed)

Same canonical `scripts/evalStagehandApplication.ts submit browser-use`, unchanged synthetic-v1/gold-v1 and receiver checks. Compare to the preserved 532.091-second Browser Use run; each new attempt is recorded separately. The model/reasoning, 100-step ceiling, exact-request approval (including unknown upload writes), 10-second first approval reconnect check and duplicate resolution checks remain unchanged. A general observed-DOM field batch tool avoids nested locator model calls; approval value reads run across frames in parallel without repeatedly collecting full body text/options. Small authorized files are provisioned in the existing environment creation instead of separate command round trips; large files keep chunking. New runs record environment-ready time, installation/browser startup duration, model request duration, snapshot duration and tool names. No production deployment or real applications. Timing is a challenge-case observation, not a representative ATS latency/success estimate; provider startup variability is reported separately. No synthetic-site selectors or upload-endpoint allowlists are added to the runtime.

An experimental follow-up revision (withdrawn after its run did not reach a verified submission) observed the attachment's existing in-flight writes and waits for their completion/500 ms quiet before another agent step, without granting any extra network permission. Human approval waits do not consume the 30-second active-network settling budget; a stalled transfer returns control for inspection without automatic replay. This targets observed redundant wait/model calls and premature second uploads. The retained teardown improvement releases the billable browser concurrently with the worker stop command, so an unavailable worker does not defer browser release. Its separate run used the same synthetic-v1 fixture. This does not establish that the settling change caused the failure: the observed blocker was a click with no outgoing submission request. The retained execution path is the earlier receiver-verified batch-input revision, with independent concurrent cleanup. Full results: [latency report](report-2026-10-23-latency.md).

## Paired public-provider v5 — 2026-10-26

User-authorized comparison of the same ten actual JDs on Browserbase and Browser Use Cloud, requirements discovery followed by fill/upload through the final submission boundary. Frozen URLs are unchanged from v4 in `cases-public-provider-pair-v5.json`; new synthetic input additions and safety/evidence rubric are frozen in the run manifest and `gold-public-provider-pair-v5.json`. Canonical runner: `scripts/evalApplicationProviderPair.ts <group> <case> browserbase|browser-use`, reusing the current shared product worker/tools plus explicit test-only restrictions. All calls use GPT-6-luna medium, 100 steps total per case across both phases, default sampling, 128k output capacity, 30-minute browser lifetime, 27-minute caller deadline. No 450-second agent cutoff. Browser proxy and CAPTCHA solver are off on both; viewport 1280×960. Browserbase us-east-1; Browser Use service-selected region. Four jobs maximum in flight (two per provider) with the same case pair adjacent.

The caller runs locally but both Chromium and the actual AI/tool worker run remotely in existing hosted compute. No deployment is required or performed; this is not a full deployed Next UI E2E. The optional preSubmitTest option only restricts writes and collects evidence, never grants application submission permission. Existing test guard is reused; exact authorized file bytes are excluded from applicant-field scanning while file-only request authorization is still required. All application/draft writes, native submission, WebSockets and beacons are blocked. Some legitimate next steps may be harness-restricted and must not be called provider failures. Only synthetic facts/files reach third-party ATS upload storage. Historical tiny resume/portfolio bytes are unchanged; their Alex Example name differs from form fixture HarperQA TestOnly and the model is explicitly told which facts are authoritative. No production candidate/role/DB modifications or messages. Private encrypted result Storage transport is reused.

Each attempt records hashes, timing, raw provider/model usage, initial/revealed field inventory, final DOM values, file selection/upload responses and final screenshots. Manual review, not the model ready flag, determines success. Report requirements extraction, attachment verification and pre-submit readiness separately. Report all attempts/failures/costs and cleanup; no hidden reruns or replacement cases. Costs exclude hosted compute/Storage unless separately metered; Browserbase included hours/subscription are separate from marginal time estimates. Ten purposively selected live URLs and one attempt per provider are not a population success-rate or uptime estimate. Execution pending.

### Paired public-provider v6 — corrected test inputs

V5 discovery exposed missing synthetic English proficiency (MarqVision) and high-school name/year (Palantir), plus an unavailable Furiosa URL on both providers. V6 freezes those additional synthetic facts and replaces the unavailable URL with Sentry Senior Software Engineer, AI Platform from its live public Ashby listing. Both providers use the same revised case inputs and unchanged GPT-6-luna medium / 100-step model tools. See `cases-public-provider-pair-v6.json` and `gold-public-provider-pair-v6.json`. The runner remains `scripts/evalApplicationProviderPair.ts`; the private v6 group manifest selects the case file and overrides. Unchanged pairs are adopted from v5; all predecessor attempts remain recorded separately. This is an unblinded diagnostic correction, not an independent generalization benchmark. No real application or draft writes are permitted. Same evidence, scoring and privacy boundaries as v5; no deployment.

Test-only result transport now losslessly compresses large state payloads; after-run screenshots use bounded JPEG. The model's observations are unchanged. Initial Palantir transport failures and screenshot collection failures are retained as harness incidents, not attributed to a browser provider.

V7 additionally replaces the unavailable NICE Greeting URL with the current Shoplive Backend Engineer listing, frozen in `cases-public-provider-pair-v7.json` before both provider runs. Gold criteria remain unchanged in `gold-public-provider-pair-v7.json`. Other v5/v6 pairs are adopted without rerun. Closed-link attempts remain separately recorded and must not be reported as provider failures.

V8 retains v7 inputs and corrects the test-only Ashby upload destination allowlist after the observed S3 file transfer was incorrectly blocked. Only exact approved document bytes to the observed object-storage host are allowed; applicant fields, draft writes, unknown writes and final submission remain blocked. Four targeted authorization checks and the existing 21 checks pass. Both Ashby pairs rerun with unchanged model/100-step limit. Earlier censored attempts remain separate; unaffected pairs retain their earlier artifacts.

## Paired provider results — 2026-10-26

같은 실제 공고 10개 × 두 원격 브라우저, GPT-6-luna medium, 조작 한도 100회. 최종 제출 0건, 운영 배포 없음. 마감된 Furiosa/NICE는 양쪽 모두 동일한 Sentry/Shoplive 공고로 교체했다. 공통 Stagehand 에이전트를 그대로 사용한 브라우저 인프라 비교이며 Browser Use 자체 에이전트 비교가 아니다.

| 회사 | Browserbase 결과 · 시간 · 비용 | Browser Use Cloud 결과 · 시간 · 비용 |
|---|---|---|
| [Appnovation](https://job-boards.greenhouse.io/appnovation/jobs/8753683002) | 완료 · 6.30분 · $0.0454 | 완료 · 4.00분 · $0.0969 |
| [MarqVision](https://job-boards.greenhouse.io/marqvision/jobs/4808010008) | 완료 · 2.16분 · $0.0184 | 완료 · 4.55분 · $0.0557 |
| [Palantir](https://jobs.lever.co/palantir/c34b424e-caf2-455a-b104-ae1096ccca29/apply) | 모델 입력 길이 초과(74단계) · 12.41분 · $6.6207 | 모델 입력 길이 초과(47단계) · 6.45분 · $3.9520 |
| [360Learning](https://jobs.lever.co/360learning/66e3841f-f92b-42f5-a4d3-c4290010e2d5/apply) | 완료 · 2.65분 · $0.0399 | 완료 · 4.49분 · $0.1459 |
| [Sentry](https://jobs.ashbyhq.com/sentry/6eb8d5f2-977e-4ff4-bdbe-fccb8747b5d7) | 시험 차단 장치 때문에 판정 불가 · 2.60분 · $0.0761 | 시험 차단 장치 때문에 판정 불가 · 6.29분 · $0.1120 |
| [Wayve](https://jobs.ashbyhq.com/wayve/6b430c44-261b-4be8-883d-ad4799c37285) | 시험 차단 장치 때문에 판정 불가 · 2.95분 · $0.0647 | 시험 차단 장치 때문에 판정 불가 · 7.28분 · $0.1181 |
| [이그나이트](https://ignite.ninehire.site/job_posting/Et1jQfI2/apply) | 완료 · 1.89분 · $0.0137 | 사이트 보안 검사에서 접근 차단 · 1.79분 · $0.0046 |
| [브릴스](https://brils.ninehire.site/job_posting/fzwzH58h/apply) | 입력·첨부 완료, 시험 이력서에 필수 사진 없음 · 1.91분 · $0.0143 | 사이트 보안 검사에서 접근 차단 · 1.53분 · $0.0043 |
| [Shoplive](https://shoplive.career.greetinghr.com/en/o/174632/apply) | 입력·첨부 완료, 이메일 확인 필요 여부 미검증 · 2.22분 · $0.0189 | 전화 국가번호 잘못 선택, 이메일 확인 미검증 · 4.75분 · $0.0705 |
| [Affirm](https://job-boards.greenhouse.io/affirm/jobs/8005406003) | 비자 후원 질문에 잘못 답함 · 2.91분 · $0.0828 | 완료 · 3.25분 · $0.0596 |

| 지표 | Browserbase | Browser Use Cloud |
|---|---:|---:|
| 항목 조회 | 10/10 | 8/10 |
| 파일 전송 + 폼 내 첨부 확인 | 8/10 | 6/10 |
| 정확한 입력·첨부 후 제출 직전 완료 확인 | 4/10 | 4/10 |
| 평균 시간(실패 포함) | 3.80분 | 4.44분 |
| 평균 비용(실패 포함) | $0.6995 | $0.4620 |
| 10건 비용 합계 | $6.9951 | $4.6196 |
| 그중 모델 비용 | $6.9266 | $4.5975 |
| 그중 브라우저/통신 비용 | $0.0685 | $0.0222 |

Palantir 한 건 비용은 각각 $6.6207 / $3.9520이다. 긴 학교 선택 목록이 반복해서 모델 문맥에 들어가며 양쪽 모두 입력 길이 초과로 실패했다. 이 한 건을 제외한 나머지 9건 평균은 $0.0416 / $0.0742, 평균 시간 2.84분 / 4.22분이다. 위 전체 평균에는 이 실패를 포함했다. 이 수치는 성공한 지원 1건의 비용이 아니라 시도 1건당 관측 비용이다.

**한계와 판정:** Ashby 두 공고는 양쪽 모두 승인된 파일 바이트의 S3 전송(HTTP204)까지 성공했지만, 시험 장치가 파일을 폼에 연결하는 요청 및 자동저장을 막았다. 따라서 두 공고의 완료 여부는 판정 불가이며 업체 실패로 분류하지 않는다. Brils 사진 부족은 시험 파일의 한계다. Shoplive 이메일 확인의 필수 여부는 검증하지 않았고, Browser Use는 별도로 잘못된 전화 국가번호가 확인됐다. Affirm Browserbase의 비자 답변 오류는 모델 판단 오류이며 브라우저 서비스 자체의 결함이라는 증거는 없다. 단 10개의 한 차례 실행이므로 업체 전체 성공률을 일반화하지 않는다.

성공은 모델의 자체 보고 대신 최종 DOM 값, 업로드 응답 및 가능한 스크린샷을 검토해 판정했다. Sentry의 자체 성공 보고는 첨부 연결 오류 때문에 제외했고, 360Learning Browser Use의 숨겨진 CAPTCHA 텍스트는 화면에 활성 도전이 없어 사전 제출 실패로 보지 않았다. Appnovation은 초기 캡처 전송 한도로 스크린샷 없이 최종 DOM/업로드 응답으로 검증했다. 최종 제출 이후 발생할 검증·CAPTCHA·접수 성공은 시험하지 않았다.

**비용 범위:** 모델 응답의 원시 토큰/캐시 사용량 × [OpenAI 공개 요금](https://developers.openai.com/api/docs/models/gpt-6-luna), Browser Use의 실제 세션 browserCost+proxyCost, Browserbase 세션 시간 × [Developer 초과 요금 $0.12/시간](https://www.browserbase.com/pricing). [Browser Use 요금](https://browser-use.com/pricing). 브라우저 비용에는 종료 때까지의 세션 시간을 포함한다. 월 구독료·포함 시간 배분·별도 실행 서버 및 Storage 비용은 제외한다. 272K 초과 입력은 전 요청에 장문 요율을 적용했다. 위 표는 최종 비교 20건이며, 입력 보완·마감 공고 교체·시험 장치 수정 이전 실행은 별도로 보존하고 평균에서 제외했다.

재현: `scripts/evalApplicationProviderPair.ts <group> <case> browserbase|browser-use`; 최종 선택은 v5(Appnovation, 360Learning, Ignite, Brils, Affirm), v6(MarqVision, Palantir), v7(Shoplive), v8(Sentry, Wayve). 원본/수정 전 실행, frozen 입력·gold·manifest·소스 해시·원시 usage·검토 근거는 ignored `runs/provider-pair-20261026-v*/`에 보존한다. 집계는 v8의 `aggregate.py`와 `aggregate.json`. 최종 20건 및 앞선 시도 포함 34개의 생성 브라우저 모두 종료 확인. 승인된 쓰기는 파일 저장/파싱·읽기 쿼리·보안 설정 읽기에 한정됐고, 지원서 제출 요청은 허용하지 않았다.

시험 준비·수정 전 시도까지 포함한 34건의 관측 비용 하한은 $16.4806이다. 2건은 상태 전송 실패 등으로 모델 사용량이 보존되지 않아 전체 실청구 합계로 단정할 수 없다. 개별 시도와 비용은 private `all-attempt-costs.json`에 별도 기록했다.

## User-selected Gauss Labs Browserbase diagnostic — 2026-10-26

Frozen input `cases-public-gausslabs-v1.json`, rubric `gold-public-gausslabs-v1.json`; exact user-supplied Lever JD, unchanged synthetic candidate/documents from the paired runner, no production data. Canonical runner `scripts/evalApplicationProviderPair.ts gausslabs-browserbase-20261026-v1 gausslabs browserbase`; current local source hashes frozen in ignored owner-only run manifest. GPT-6-luna medium, 100 steps, same shared remote worker and Browserbase; local orchestration, no deployment. Requirements discovery + fill + attachment evidence through final submission boundary; final submission/draft writes blocked. Same metrics, privacy boundary, manual screenshot/DOM verification and no release gate as v8. This guarded runtime diagnostic does not itself test the product inspection converter or production approval flow; any such conclusion needs separate direct evidence. The prior review identified an unresolved field-ref converter incompatibility. Raw outputs, provider usage and cleanup evidence stay in ignored owner-only runs.

Separate read-only product-entry diagnostic for this frozen case: `scripts/evalPublicApplicationInspection.ts gausslabs-browserbase-20261026-v1 gausslabs`. Calls the unchanged `inspectApplicationForm` and observes runtime return values solely for private evidence/usage recording; uses the real product prompt, converter and 180-second inspection timeout. No files/applicant input, writes, or approval resolution. Record this separate session's cost/time rather than fold it into the guarded fill attempt. Success requires a nonempty inventory accepted by the actual product converter; it does not establish final submission support.

Executed result: guarded browser run reached the final unclicked submit button with all required fields and visible resume Success; file-only parseResume returned HTTP 200. 164.542 s including 42.046 s setup, 16/100 steps, estimated model + marginal Browserbase cost $0.0738614. Separate unchanged product inspection read 12 inputs but rejected every UUID:index ref under the numeric-only converter and returned unavailable/zero fields: 91.911 s, $0.007971225. Combined diagnostic spend $0.081832625, excluding monthly subscription, hosted executor and Storage. Both Browserbase sessions confirmed COMPLETED and executors stopped. Screenshot/DOM/network evidence reviewed; no final submit attempted, no product runtime edits or deployment. This establishes guarded form-fill readiness on this JD, not working Harper product integration or actual submission success.
