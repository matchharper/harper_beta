# Career onboarding dialogue

## Objective and unit
Verify that Harper asks useful follow-ups to incomplete criteria, reuses actual answers and saved facts, respects uncertainty/refusal, and completes onboarding without repeated questions or approval rituals. One unit is a multi-turn synthetic conversation; live tests also include reconnect context and early-stop cases.

## Frozen input and gold
`cases-v1.json` and `live-prompt-cases-dialogue-v1.json` contain hand-authored synthetic personas/history and qualitative expectations. No production identifiers or copied personal history are included. Version v1 was frozen before the first run on 2026-11-08; changed fixtures require a new version. The product issue motivates the abstract-vs-specific compensation case but no real user data is used.

## Input contract and canonical runners
Text: `scripts/evalCareerOnboardingDialogue.ts`, using production `buildCareerConversationPromptPlan` and `runCareerChatAssistant`, with real model calls and no production tools/DB. Run `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerOnboardingDialogue.ts`. An isolated simulated user answers from a frozen persona; its messages are captured and must be reviewed for fidelity. `--model=` selects a supported Career text model; this does not change production settings.

Voice: existing `scripts/evalCareerLiveOnboardingPrompt.ts` with `CAREER_VOICE_EVAL_ROOT=docs/evaluation/career-onboarding-dialogue CAREER_VOICE_EVAL_VERSION=dialogue-v1`. Run with Node env loading and scripts tsconfig. It uses production live frontend/backend builders, `gpt-live-1`, and the configured delegation model/reasoning. Synthetic Korean audio is macOS Yuna converted by ffmpeg to PCM16/24kHz. Multiple utterances are sent in one session after the prior answer and backend handoff have settled. The existing reasoning backend uses the shared onboarding purpose and actual evidence to choose follow-ups/completion. The audio model delegates substantive onboarding turns and speaks its handoff; there is no separate semantic reviewer. The frontend starts without replayed input history, matching production `buildCareerLiveSessionConfig`; actual profile, saved facts and conversation are rendered into the reasoning backend context; the audio interface does not receive a second interview brief. Tool commands are observed and `end_call` receives the production scheduled-action text result, allowing a final spoken handoff; no production completion or recommendation is executed.

## Metrics and acceptance
Read full outputs for faithful fact reuse, a useful compensation follow-up after mere priority, no repeat of supplied or explicitly withheld facts, no forced optional question, no extra approval, and completion at the point of sufficient understanding. Observe the actual text marker or voice end_call arguments. Distinguish early stop from successful onboarding. Any unsupported fact, missed essential follow-up, repeated answered question or completion stall fails the case. Review is manual; no semantic keyword/length/turn-count gate exists in production. Evaluation session limits bound test cost only.

## Artifacts, privacy and limitations
Runners save frozen fixture hash, source hashes/configuration, exact provider inputs, outputs, audio/events in ignored owner-only `runs/` and `private/`. Network is limited to model endpoints; fixtures do not access production data. These are real model/dialogue/audio tests with simulated transport actions, not authenticated browser, physical microphone/speaker, production DB or deployment E2E. Targeted route/hook tests separately check completion-save ordering and failure handling. Small-sample success does not guarantee every conversation.

## Latest local model selection

On 2026-11-08 the user requested `gpt-6.1-terra` / `medium` for the Live backend. The setting is implemented locally; gpt-live-1 remains the audio model. See the [Terra/medium comparison](review-2026-11-08-terra-medium.md) for the five-case results and the remaining frontend-delegation failure. The [earlier review](review-2026-11-08.md) records the prior Sol/xhigh baseline and implementation work. Neither run authorizes deployment.
