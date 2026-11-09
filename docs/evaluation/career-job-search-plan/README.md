# Career job search plan model comparison

## 목적과 평가 단위

`recommend_job_postings` instant/legacy `plan`의 동일 prompt와 동일 입력에서 모델별 완료 latency와 검색 계획 품질을 비교한다. 평가 단위는 한 검색 요청 × 한 모델 × 한 반복이다. 검색 실행, shortlist, fit, 추천 저장과 전달은 제외한다.

## Frozen input과 gold

`cases-v1.json`은 개인정보 없는 synthetic 1건이다. 최근 요청과 기존 선호가 일부 다르고, 직무·지역·고용 형태·게시 기간·soft remote preference를 함께 포함한다. `gold-v1.json`은 실행 전에 고정한 의미 평가 rubric이며 특정 키워드 문구를 정답으로 강제하지 않는다. 입력/정답 변경은 새 버전으로 보존한다. `manifest-v1.json`에 provenance와 hash를 기록한다. Human gold는 없으며 정성 검토자는 Codex다.

## Prompt/input contract와 canonical runner

[`scripts/evalCareerJobSearchPlan.ts`](../../../scripts/evalCareerJobSearchPlan.ts)는 현재 production TypeScript 모듈을 메모리에서 transpile하고 private export만 노출한다. 실제 `buildSearchPlan`을 실행하되 completion만 capture하여 production message builder/설정/normalizer를 그대로 재사용한다. Prompt 복사나 product 파일 변경은 하지 않는다. Provider request도 production `buildChatCompletionRequestParts` 및 Responses adapter를 재사용한다.

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerJobSearchPlan.ts --dry-run
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCareerJobSearchPlan.ts
```

## 모델/run 조건

- GLM: OpenRouter `z-ai/glm-5.3-flash`, reasoning high, Z.AI 고정, data_collection deny.
- Luna: OpenAI `gpt-6-luna`, Responses API, reasoning low.
- Sol: OpenAI `gpt-6.1-sol`, Responses API, reasoning low.
- Production plan temperature 0.2와 JSON mode를 유지한다. Sampling 미지원 모델은 기존 adapter처럼 생략한다.
- 총 9회, 모델당 3회. Round별 순환 순서로 순차 호출한다. Warm-up 호출은 없다. SDK retry와 model/provider fallback을 끄며 실패도 1회로 기록한다.
- 호출 timeout 180초. 완료 latency는 요청부터 전체 응답 수신까지이고 TTFT가 아니다. Source revision/dirty diff, prompt/input hash, endpoint/model, 실제 request, token/cache usage를 보존한다.

## 지표와 release gate

완료 latency 3개, 평균/중앙값/범위, JSON 및 구조 계약 통과 수를 보고한다. Qualitative rubric은 현재 요청 우선 반영, 직무 title/FTS recall과 precision, explicit hard filter 보존, soft preference를 hard filter로 오해하지 않기, 근거 없는 조건 추가 여부다. 코드 검사는 필수 필드/타입/범위만 다루고 의미 검토는 원문을 읽는 Codex가 수행한다.

구조 오류, 명시 조건 누락/반전, soft remote를 필수로 바꾸는 오류는 critical로 별도 기록한다. 이 1건×3회는 모델 교체 release gate를 만족시키는 대표 세트가 아니며 제품 모델은 변경하지 않는다.

## Provenance, privacy와 한계

2026-10-13 사용자 요청으로 만든 합성 fixture다. 실제 후보자/회사/대화/DB를 캡처하지 않는다. API key는 `.env.local`에서 읽고 기록하지 않는다. Raw response와 exact prompt/request는 gitignored `runs/`에 owner-only로 저장한다. DB, usage log, 추천 저장, 메시지·이메일 전송은 실행하지 않는다. OpenAI는 production adapter의 store=false, OpenRouter는 data_collection=deny를 사용한다.

동일 입력 반복이므로 자동 prompt caching과 provider 부하가 latency에 영향을 준다. Provider/API와 reasoning 조건이 다르므로 순수 모델 계산 속도 비교가 아니다. 단일 한국어 synthetic 요청이며 실제 공고 retrieval precision/recall 또는 production 평균 품질은 측정하지 않는다. 실행 후 gold를 수정하지 않는다.
