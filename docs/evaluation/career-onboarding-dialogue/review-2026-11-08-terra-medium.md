# Live backend change: GPT-6.1 Terra / medium — 2026-11-08

User-requested local setting change, not a deployment. `CAREER_LLM_CONFIG.live` now uses `gpt-6.1-terra` with reasoning effort `medium`. The audio model remains `gpt-live-1` (cedar). This shared configuration is consumed by the web and server-side Live session builder. Other model settings and prompts were not changed for this experiment.

The requested reasoning setting and Responses tool calling are supported by the [official Terra model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra), and the real Live requests below accepted the configuration.

## Reproducibility and comparison

Same frozen `live-prompt-cases-dialogue-v1.json` and canonical `scripts/evalCareerLiveOnboardingPrompt.ts` as the prior [Sol/xhigh review](review-2026-11-08.md). Synthetic Korean audio, real model endpoint, no production DB writes, recommendation actions or outbound calls.

Command prefix:
`CAREER_VOICE_EVAL_ROOT=docs/evaluation/career-onboarding-dialogue CAREER_VOICE_EVAL_VERSION=dialogue-v1 TSX_TSCONFIG_PATH=scripts/tsconfig.json node --env-file=.env.local --import tsx scripts/evalCareerLiveOnboardingPrompt.ts`

- `runs/live-prompt-2026-11-08T07-38-52.517Z`: `undecided_expectation resume_last_answer`.
- `runs/live-prompt-2026-11-08T07-39-02.639Z`: `priority_then_amount private_compensation early_stop`.

Manifests and exact provider payloads confirm Terra/medium with gpt-live-1. Compared the undecided-case input against the prior Sol/xhigh input: frontend instructions and tools are identical; backend instructions differ only in the runtime clock (16:30 versus 16:38). No frozen example or expectation was changed.

## Previously failing cases

Both previously failing cases had no extra question in this run and emitted `end_call(complete_onboarding=true)`.

- Undecided compensation: accepted deciding after seeing offers and closed. The interim phrase about organizing the next thing to check remains unnecessary, but it did not ask for another answer.
- Last language answer: acknowledged the English-work answer and closed without asking for an example.

Observed backend response durations (request to completion, excluding frontend audio/network playback):

| Case | Sol/xhigh: decision + closing | Terra/medium: decision + closing |
| --- | --- | --- |
| Undecided | 4,365 ms + 7,756 ms | 1,370 ms + 1,125 ms |
| Last language answer | 3,634 ms + 7,220 ms | 1,470 ms + 1,460 ms |

This small paired observation suggests a shorter wait may reduce the opportunity for unsolicited interim speech. It does not establish causality or a general reliability rate; both model and reasoning effort changed together.

## Complete five-case result

| Frozen case | Observed behavior | Result |
| --- | --- | --- |
| priority_then_amount | Asked for a meaningful salary threshold after priority-only information, then respected current-pay privacy and issued end_call(true) after the KRW 120M base answer. | Pass |
| undecided_expectation | Accepted an unset amount and issued end_call(true), without another question. | Pass |
| private_compensation | Asked about experience/strengths instead of finishing. The event log contains **zero session.delegation.created events** and no end_call: GPT-Live did not invoke the backend in this case. | Fail |
| resume_last_answer | Accepted the English-work answer and issued end_call(true), without requesting an example. | Pass |
| early_stop | Issued end_call(false), without completing unfinished onboarding. | Pass |

The run is **4/5 qualitative pass** under the same five-case expectations, compared with 3/5 in the prior selected Sol/xhigh run. Both previously failing cases passed, but private compensation newly failed; this is not evidence that changing the backend resolves all voice problems. Repeated acknowledgements and an unnecessary waiting phrase also remain. All sessions had no reported API errors. Only four emitted the expected end_call command. Results were reviewed from full transcripts and tool events, not from process exit status.

## Validation boundary

Changed-file lint and `git diff --check` passed. Full project type checking was attempted but failed in the independently edited `src/lib/career/researchHistory.test.ts` (lines 7 and 23: required `talentContextSection` and `structuredProfileText` omitted). No type errors were reported for this configuration change; those unrelated edits were preserved.

This is real-model, synthetic-audio testing with observed tool commands, not authenticated browser/physical microphone/production persistence E2E. The existing GPT-Live independence from backend reasoning remains; a successful small run cannot guarantee that interim speech never recurs.
