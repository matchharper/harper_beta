# LLM evaluation registry

Reusable evaluations live in the task directories below. Each task README owns its objective, frozen data and review criteria, production input path, runner, model configuration, privacy boundary and limitations. Existing task folders remain independent; a run does not authorize deployment.

- [Career onboarding dialogue](career-onboarding-dialogue/README.md): original-model question selection and completion in text and live voice.
- [Career conversation versions](career-conversation-version/README.md): general text conversation styles.
- [Career agent autonomy](career-agent-autonomy/README.md): general Career agent behavior.

Keep source fixtures synthetic or de-identified. Save exact provider inputs, outputs and manifests in each task's ignored `runs/`, with owner-only permissions. Human review of the full conversation decides qualitative success; test keyword counts are not conversational quality gates. Do not mutate a frozen dataset for a new prompt run. All other registered tasks are discoverable by their directory README.

This index was absent in the existing checkout and HEAD and was added with the onboarding task on 2026-11-08.

- [Career application scenarios](career-application-scenarios/README.md): fixed account state, application actions and human review, registered in harper_eval.

- [Career onboarding continuation](career-onboarding-continuation/README.md): direct web continuation, entry opportunity and first search probes.

- [Career context completeness](career-context-coverage/README.md): compact list coverage and paired scheduled-run tool-use measurements.
