# Career conversation quality

2026-11-16. The user rejected a previous “implemented and verified” claim: recommendations were weak and the conversation read like an internal execution receipt. This task evaluates the actual recommendation and the whole conversation, not tool success or the presence of safeguards.

## Six first conversations from Notion

[Reference conversations](ideal-dialogues-v9.md) follow a payments engineer, a Toronto finance manager, a designer, an applicant without documents, a junior engineer in Busan, and an AI engineer with a Friday offer deadline. The original page uses hypothetical private histories. [Notion reference](https://app.notion.com/p/Career-6-41a7277d26df80a4be8ee3665eee583e). The market contains fourteen pages read by the production Career page reader on November 16, plus the verified internal role mappings for Toronto and NARWHAL. The Coupang salary comparison returned HTTP 403 on a direct request. The production reader also returned no source text on retry.

Run the six together or select their case IDs with `--only`. Each has one opening and the following candidate messages. Connecting Gmail also triggers the ordinary connection event in the first case. Across all six, that produces 31 model turns. Each turn sees the assistant’s actual responses so far and retains private documents, Brief and Memory edits. References to a particular previous ideal answer are expressed as the candidate’s own preference. The reference replies are kept out of every model request. Employers appear in the market and the exact Toronto entry posting. No candidate message tells Harper to select vooy, Canonical, or Fieldguide.

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --task career-conversation-quality --dataset v10 --validate-only
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --task career-conversation-quality --dataset v10 --repeat 1 --review
```

`--first-turn-only` records just the openings. The run manifest, requests, responses, tool receipts and source snapshots stay under the run directory. Public search uses a shared frozen index, the mailbox holds the scenario’s messages, and contact and application delivery use isolated executors. Scores cover the model's decisions on those inputs. Production screen rendering, employer delivery, polling and market-wide recall require separate evidence. The six cases use a frozen local adapter for storage and effects around real provider calls. Their model receives the production guide, profile formatter, Gmail capability and entry-event renderer. The adapter preserves the candidate’s actual generated chat, owned documents and saved context, but does not replay every message timestamp, production account record or worker dispatch. The company-role search here operates on the two verified internal roles. The search index and mailbox contain only the sources named in this dataset.

To replay uncommitted product code recorded in a previous run against the current evaluation adapter, run `node scripts/evaluation/prepareCareerSourceReplay.mjs <run-directory>`. Use the printed directory’s `tsconfig.json` with `tsx --tsconfig` and pass its `overlays.json` to the runner with `--source-overlays`. Per-run `sources.json` and actual provider requests show which version was measured.

See the [v10 comparison and complete transcripts](reports/2026-11-16-notion-first-six-v10.md) for source availability, evaluation limits, and each decision. On this workstation, original page captures and service-role lookups stay under ignored, owner-only `private/first-six/`; full model requests, responses and source snapshots stay under `runs/`. The public fixture contains public hiring information, synthetic people, synthetic Gmail threads, and verified public role IDs.

The [v11 Busan profile pair](cases-v11.json) compares the full output of the same actual profile extraction under two normalizers. The public market and three user replies are unchanged. Use `--dataset v11 --repeat 1 --review` for four turns per condition. The [comparison](reports/2026-11-16-notion-first-six-v10.md) records what the year-only education row changed in the actual reply.

The [v12 progress comparison](cases-v12.json) replays the Gmail-connected event followed by five candidate replies, plus a request to approach the Toronto team. Keep server-event intermediate generations in private traces; only visible messages enter the next chat turn. Foreground tool-hop messages and tool status logs are recorded separately. Use `--dataset v12 --repeat 1 --review`.

### Comparing work across turns

[The same six conversations with a stored search history](cases-v13.json) reuse v10’s people, user messages and market. Two public sources already had a saved body in the production reader capture. A web search can now put new metadata into the controlled public index. A later source read can store its body. Each person starts with the same two sources and keeps their own receipts, preferences and saved postings. A shared corpus between two different people is outside this six-person comparison.

The runner uses the production search-receipt functions against isolated PostgreSQL. It reads one latest search into the assistant’s context, can retrieve an older operation and its source references, and can reopen previously returned public sources. Read time and cache coverage are visible through the normal page formatter. The web provider is frozen. Its lexical search cannot measure live market recall, Exa charges, or provider latency. For a paid model call the runner records the actual provider response, product-estimated price and wall time. Handbook leases and the previous tool execution carry through normal foreground turns.

Run `--dataset v13 --validate-only` for the source and storage checks, then `--dataset v13 --repeat 2 --review` with the normal command above. The [November 17 comparison](reports/2026-11-17-six-dialogue-efficiency.md) identifies the exact runs behind each number.

## Frozen reference conversations

Use [v7 complete reference conversations](ideal-dialogues-v7.md) for the current 19 cases and [the review](reports/2026-11-16-conversation-quality-review.md) for decisions, scores, live comparisons and failures. [Both actual responses per case](reports/2026-11-16-actual-replies.md) are readable without opening private traces. v7 combines the sixteen original cases, three transfer cases and the full prior product turn for the short follow-up. Historical freezes and their results remain available.

`cases-v1.json` contains twelve foreground and four scheduled turns in a controlled market with competing plausible employers. `gold-v1.json` and [ideal-dialogues-v1.md](ideal-dialogues-v1.md) contain complete reference responses, prior context, and the reasoning behind the expected quality. The manifest is frozen before generation. Gold never enters the model input. Wording, employer count, formatting and tool sequence are not exact-match requirements. A stronger defensible answer is welcome.

The public market and people are synthetic. Sources distinguish similar attractive alternatives, a famous but unsuitable role, salary/ownership/learning tradeoffs, and an older saved opening whose official page has since closed. Ordinary user requests contain no repeated simulation or non-contact disclaimers. External effects are isolated in the executor instead. Scheduled turns use the production background renderer, runtime and configured model, with synthetic send receipts and no real delivery.

## Runner and actual input

Reuse the canonical runner:

```sh
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --task career-conversation-quality --dataset v7 --validate-only
NODE_PATH=./node_modules/next/dist/compiled NODE_OPTIONS=--conditions=react-server pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerAgentAutonomy.ts --task career-conversation-quality --dataset v7 --repeat 2 --label comparison
```

The production capability selector, schemas, prompt builders, tool projections and original-model loop run. Public retrieval and effects use `careerAutonomyFixture.ts` / `careerResourceFixture.ts`; all companies in this small collection are retrievable, so this layer tests comparative judgment, not market recall. Provider network only; no email, company contact, application or production write. Model defaults come from the product; changing a model is a separate reported experiment. Each turn has the existing 360-second observation deadline. Two independent turns at most run concurrently. Preserve failed/partial runs; no hidden quality retries.

Actual provider inputs, full responses, intermediate text, tool facts and state are saved under ignored owner-only `runs/` alongside source snapshots and hashes. Read-only production evidence belongs in owner-only `private/`, never fixtures or committed reports. No production personal context is sent to evaluation models.

Use `--only ownership_move,technical_depth` for a targeted comparison. Supply `--model <supported product model ID>` for an explicitly labeled model experiment. An invalid ID fails before generation. A changed fixture, actual previously generated history or a different model gets its own provenance in the report.

## Human review and retention gate

Read every complete response with the user conversation, reference response and source evidence. Manually rate applicable dimensions 0–4: 0 contradicts the goal or facts; 1 is mostly generic/unusable; 2 is useful but needs material rewriting or different choices; 3 is ready to give a user, with only minor improvements; 4 matches or improves on the reference in substance and conversation. These scores are developer review, not a model, runtime gate or keyword test.

- **Choice:** what would improve this person's career, compared with the strongest available alternatives and staying? Distinguish attractive employer from attainable, worthwhile work.
- **Judgment and evidence:** explain the decisive relative reasons; resolve available facts; give uncertainty its actual consequence rather than a generic disclaimer.
- **Ownership of help:** complete useful research/preparation; ask for information only the person must supply; do not hand back checks Harper can perform.
- **Conversation:** respond to the latest message, naturally and at the useful depth. No mechanical receipt, unrelated process recap or ritual next question. A needed non-action answer stays, e.g. “Have you already sent my resume?”
- **Continuity:** use prior preferences and corrections accurately; differentiate a due obligation, a new useful opportunity and no news.

A completion is not a quality pass. No dimension below 3 may be averaged away as a pass for that scenario. A known bad recommendation, false external outcome or missing material constraint is a failure regardless of fluent prose. Keep changes only when the source defect is identified and same-input comparisons improve; rerun changed-path cases and new transfer examples before handoff. Review remaining weaknesses and fix them within scope rather than ending at “not globally optimal.”

## Complementary real-market validation

Controlled alternatives cannot establish discovery quality. Live authenticated local product turns with actual public web sources must separately check an independent, prewritten reference comparison, source truth, market alternatives and the rendered result. Reuse `scripts/localE2e/opportunityDiscovery.mjs`; version new inputs without overwriting previous fixtures. Multi-turn follow-up must use actual prior model output. No production email or applications. Scope and live-source variation are reported with results, not used to excuse observed poor output.

## Required final evidence

Publish the full reference conversations, before/after judgments with concrete output excerpts, input causes and code changes, actual model configuration, UI checks, failed attempts, and local versus deployed state. Do not present a test count as conversation quality.
