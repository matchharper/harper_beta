# LLM evaluation registry

Reusable evaluations live in the task directories below. Each task README owns its objective, frozen data and review criteria, production input path, runner, model configuration, privacy boundary and limitations. Existing task folders remain independent; a run does not authorize deployment.

- [Career onboarding dialogue](career-onboarding-dialogue/README.md): original-model question selection and completion in text and live voice.
- [Career conversation versions](career-conversation-version/README.md): general text conversation styles.
- [Career agent autonomy](career-agent-autonomy/README.md): general Career agent behavior.

Keep source fixtures synthetic or de-identified. Save exact provider inputs, outputs and manifests in each task's ignored `runs/`, with owner-only permissions. Human review of the full conversation decides qualitative success; test keyword counts are not conversational quality gates. Do not mutate a frozen dataset for a new prompt run. All other registered tasks are discoverable by their directory README.

This index was absent in the existing checkout and HEAD and was added with the onboarding task on 2026-11-08.

- [Career application scenarios](career-application-scenarios/README.md): fixed account state, application actions and human review, registered in harper_eval.

- [Career onboarding continuation](career-onboarding-continuation/README.md): direct web continuation, entry opportunity and first search probes.

## 2026-11-09 되살린 평가

2026-11-02 커밋 463d83cb에서 아래 폴더가 지워졌다. 같은 커밋이 넣은 `docs/agent-guidance/evaluations.md`는 평가를 이 폴더에 등록하라고 하므로, 그 직전 내용(463d83cb^)으로 되살렸다. 그 뒤 새로 만들어진 13개 폴더는 지금 내용을 그대로 두었다. 공개 레포라 `internal-recommendation-binary`의 후보 실명만 사례 번호로 바꿨다(해당 README 변경 기록 참고). 각 폴더의 README가 목적·입력·runner·한계를 가진다.

- [agents-hosted-resume-upload](agents-hosted-resume-upload/README.md)
- [application-browser-server](application-browser-server/README.md)
- [application-form-inspection](application-form-inspection/README.md)
- [application-simulation-legacy](application-simulation-legacy/README.md)
- [application-suggestions](application-suggestions/README.md)
- [career-capability-loading](career-capability-loading/README.md)
- [career-coaching-dialogue](career-coaching-dialogue/README.md)
- [career-company-research](career-company-research/README.md)
- [career-job-link-import](career-job-link-import/README.md)
- [career-job-search-plan](career-job-search-plan/README.md)
- [career-priority-review](career-priority-review/README.md)
- [career-request-intro-reply](career-request-intro-reply/README.md)
- [career-voice-onboarding](career-voice-onboarding/README.md)
- [company-agentic-role-search](company-agentic-role-search/README.md)
- [company-candidate-introduction](company-candidate-introduction/README.md)
- [company-candidate-writing-playground](company-candidate-writing-playground/README.md)
- [company-email-connection](company-email-connection/README.md)
- [company-first-talent-selection](company-first-talent-selection/README.md)
- [company-onboarding-pitch](company-onboarding-pitch/README.md)
- [company-role-salary-estimation](company-role-salary-estimation/README.md)
- [company-side-background-result-writing](company-side-background-result-writing/README.md)
- [company-side-conversational-qa](company-side-conversational-qa/README.md)
- [company-talent-contacts](company-talent-contacts/README.md)
- [creator-content-performance-conclusion](creator-content-performance-conclusion/README.md)
- [creator-outreach-reply-triage](creator-outreach-reply-triage/README.md)
- [email-channel-reply](email-channel-reply/README.md)
- [external-decisions-summary-ranking](external-decisions-summary-ranking/README.md)
- [external-fit-playground](external-fit-playground/README.md)
- [external-fit-qualitative](external-fit-qualitative/README.md)
- [external-opportunity-value](external-opportunity-value/README.md)
- [external-recommendation-online](external-recommendation-online/README.md)
- [external-recommendations-v2](external-recommendations-v2/README.md)
- [external-role-salary-retrieval](external-role-salary-retrieval/README.md)
- [external-v2-weight-replay](external-v2-weight-replay/README.md)
- [final-delivery-generation](final-delivery-generation/README.md)
- [internal-external-fit-model-benchmark](internal-external-fit-model-benchmark/README.md)
- [internal-fit-abc](internal-fit-abc/README.md)
- [internal-recommendation-binary](internal-recommendation-binary/README.md)
- [internal-role-conversation-qa](internal-role-conversation-qa/README.md)
- [interview-checkin-email](interview-checkin-email/README.md)
- [recommendation-feedback-outcomes](recommendation-feedback-outcomes/README.md)
- [resume-company-resolution](resume-company-resolution/README.md)
- [role-criteria-writing](role-criteria-writing/README.md)
- [role-scoring-list-retrieval](role-scoring-list-retrieval/README.md)
- [role-start-discovery](role-start-discovery/README.md)
- [slack-reply-routing](slack-reply-routing/README.md)
- [talent-behavior-context](talent-behavior-context/README.md)
- [unified-talent-role-fit](unified-talent-role-fit/README.md)
- [wonderful-internal-role-ranking](wonderful-internal-role-ranking/README.md)
