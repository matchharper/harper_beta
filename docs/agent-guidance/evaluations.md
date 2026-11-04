# LLM 평가 레지스트리 계약

LLM 평가·모델 benchmark를 생성·수정·실행·비교할 때 적용한다. 문서 경로는 workspace 기준이다.

## LLM evaluation registry

- Before creating, changing, running, or comparing an LLM evaluation or model benchmark, read `harper_beta/docs/evaluation/README.md` and the relevant task folder's `README.md`.
- Keep every reusable LLM evaluation registered under `harper_beta/docs/evaluation/<task>/`. Each task folder must document the objective, evaluation unit, frozen input and gold version, prompt/input contract, canonical runner, metrics and release gate, model/run configuration, data provenance, privacy boundary, and known limitations.
- Keep the de-identified gold set and reproducibility manifest in the task folder. Raw production candidate/company data, model raw outputs, secrets, and other private artifacts belong only in that task's ignored `private/` or `runs/` directory and must never be committed. Use read-only production access for capture and set private files to owner-only permissions.
- Do not overwrite a frozen dataset or gold labels to compare a new model. A model, provider, reasoning, or prompt experiment creates a new run against the same dataset version; changed examples, inputs, or labels create a new version with provenance and label-review history.
- Keep executable runners canonical in the repository that owns the runtime path and link to them from the evaluation task README instead of copying implementation code into the registry.
- Evaluation examples define expected behavior and regression coverage; do not translate them into scenario-specific runtime branches or state machines. Production test fixtures must also follow the test-only isolation rules below.
