# Company candidate introduction evaluation

## 목적

회사 담당자에게 보여 주는 후보자 소개가 이력서 요약을 넘어서 희소한 차별점, role 관련 evidence, 중요한 caveat와 후보자 의향을 짧고 사실에 맞게 전달하는지 평가한다.

## Canonical assets

- 평가 설계, 조사, 고정 3개 pair, 6항목 rubric과 5회 iteration 결과: [회사용 후보자 소개 프롬프트 평가](../../auto-intro-headhunter-message-five-iteration-evaluation-ko.md)
- production prompt와 builder는 해당 문서에 기록된 `harper_beta` runtime 경로가 canonical하다.

## 고정과 변경

- 현재 고정 세트는 3개 pair이며 6개 rubric 항목을 각 0~5점으로 평가한다.
- 새 모델 비교는 같은 입력 snapshot과 rubric으로 별도 run을 남긴다.
- Prompt, briefing projection, 사례 또는 rubric을 바꾸면 새 version으로 기록한다. 이전 iteration의 점수를 새 기준으로 소급 수정하지 않는다.
- 평균 총점뿐 아니라 사실 충실성, 회사 성과의 개인 귀속, 미확인 사실의 단정, 상태/관심 오표현을 critical error로 별도 본다.

## 상태와 한계

현재 canonical 문서의 상태는 로컬 구현·평가 완료, 배포 전이다. 3개 사례는 문구 개선용 challenge set이지 전체 회사·직군·언어의 대표 표본이 아니다. 재사용 가능한 자동 runner와 비식별 gold를 만들면 이 폴더에 versioned manifest를 추가한다.


## Unified matching presentation-v1 (2026-10-07)

별도 합성 challenge `presentation-cases-v1.json`의 2쌍은 실행 전에 입력과 gold를 고정했다. 기존 실제 3쌍을 변경하거나 대체하지 않는다. 평가 단위는 선택 완료된 한 후보자 × 역할의 회사용 소개/criteria 보고서다. 캐시·실제 DB 저장·회사 발송은 이 평가에 포함하지 않는다.

Canonical runner: `scripts/evalUnifiedCandidatePresentation.ts`. 실행: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalUnifiedCandidatePresentation.ts`. 운영 `generateAutoIntroWorkspaceMessage`와 prompt/parser를 그대로 사용하고 DB usage logging을 끈다. DB 조회·저장·메일/Slack 발송 없이 합성 dossier를 전달한다. 로컬 기본은 GPT-5.6 Terra, fallback은 GPT-6 Luna이며 환경 설정으로 재정의할 수 있다. temperature 0.15, max output 12000, 최대12 tool loop/웹10회 계약을 유지한다. provider 지연·실패는 실행 trace에 남긴다. 내용상 웹 조사가 필요한 실제 대상은 없다.

구조 gate는 현재 criteria 정확한 coverage, 소개 필수, 미확인 관리 경험을 uncertain으로 구분, 빈 criteria 처리다. 원문 소개의 사실성·과장·한국어/영어 경험은 전체 응답을 별도로 읽어 판단한다. 원문/trace는 ignored `runs/`, 파일0600/디렉터리0700이며 manifest에 fixture/prompt/diff hash와 모델·지연·결과를 기록한다. 작은 합성 표본은 운영 추천 반응률·전체 문구 품질을 보증하지 않는다. 독립 human gold review는 아직 없다.

2026-10-07 동일 입력으로 4회 실행했다. 앞선 Luna 실행에서는 회사 설명으로 소개를 시작하거나, 전체 경력에 포함된 업무 기간을 별도 기간처럼 서술하는 결함이 있었다. 일반적인 후보자 중심 소개·기간 중첩 보존 계약을 개선했다. 마지막 Terra 실행은 2/2 구조 통과 및 Codex 원문 검토 통과다. [결과와 한계](reports/2026-10-07-unified-presentation.md)를 함께 읽는다. 이 결과만으로 기존 실제 3쌍이나 모든 직군의 회귀가 없다고 주장하지 않는다.

## Worker selection presentation — 2026-10-08

선정 이후 Python Worker의 `opp.matching.presentation.write_presentation`은 위 beta 소개 생성기와 별도 runtime이다. 실제 역할 preview는 [inspection 계약](../unified-talent-role-fit/README.md)의 `message` runner로 보존한다. 2026-10-08의 두 역할 preview에는 structured criteria가 없어 소개 실행 성공을 criteria 평가 검증으로 해석하지 않는다.

- Canonical synthetic runner: `harper_worker/llm_evals/unified_talent_role_fit/eval_presentations.py`. Worker에서 `venv/bin/python llm_evals/unified_talent_role_fit/eval_presentations.py`로 실행한다.
- 입력/gold: 기존 frozen `presentation-cases-v1.json`과 `expectedFitness`를 유지한다. Headline/experience는 실제 회사 공유용 profile formatter로 표현하고 역할 description/criteria는 그대로 전달한다. 원본에 없는 Hiring Brief·회사 Behavior·보상은 빈 값이다. 원래 beta의 후보자 수락 lifecycle gold는 이 선정 직후 Worker 단계의 평가 범위가 아니다.
- 모델/계약: 현재 `COMPANY_FIRST_SCORING_CALL` 설정과 실제 prompt/input formatter/parser/repair를 사용한다. 기본은 GLM 5.3 Flash high, temperature 0.3, max tokens 16384, GPT-6 Luna fallback이며 환경 override와 실제 모델·usage는 새 run manifest에 기록한다. DB 연결·캐시·저장·발송·웹 도구는 없다.
- 지표/gate: 현재 기준의 정확한 coverage, 소개 필수, 관리 경험 미확인의 uncertain 판정, 빈 criteria 배열을 확인한다. 사실 과장·기간 중첩·역할 관련성·언어는 원문 전체를 Codex가 별도 검토하며 문구/키워드 매칭으로 판정하지 않는다. 두 개발 사례 통과는 출시 gate나 실제 역할의 criteria 정확도를 보증하지 않는다.
- 재현/보안: 매번 새 ignored `runs/worker-presentation-*`에 입력·원문 응답·source/prompt/fixture/diff hash·실제 모델·비용·지연을 저장한다. 디렉터리 0700, 파일 0600이며 합성 입력만 공급자에 전송한다. Frozen gold는 수정하지 않는다.

실행 `worker-presentation-20261008T064404.448685Z`는 실제 GLM 5.3 Flash로 13.023초, 추정 API 비용 $0.00040574에 완료했다. 구조·기대 fitness는 2/2 통과했지만 Codex 원문 검토는 1/2 통과다. UCIP002의 총 6년 중 마지막 2년 업무를 소개에서 6년 개발자로 일한 뒤 2년처럼 표현해 기간 중첩을 순차 경력으로 오해하게 만들었다. 관리 경험 미확인은 uncertain, 빈 기준은 빈 배열로 보존했다. 이 실행은 정성 품질 통과나 출시 가능 판정이 아니다. 모델·production prompt·frozen gold는 변경하지 않았다.

### Content challenge presentation-v2

`presentation-cases-v2.json`은 v1 2쌍을 그대로 보존하고 합성 4쌍을 추가한 총 6쌍·11개 기준이다. 최초 v2 모델 호출 전에 입력·기대 fitness·정성 rubric을 동결하고 `manifest-presentation-v2.json`에 provenance와 hash를 기록했다. 플랫폼 전체 지표와 개인 성과, 참여와 주도, 언어 수준, 복합 기준의 일부 충족, 기간 중첩을 포함한다. 실제 후보자·회사 데이터는 없다.

같은 canonical runner에 `--dataset v2`를 지정한다. 모델/provider 설정과 production 함수는 유지하며 기존 prompt와 변경 prompt를 같은 frozen 세트의 별도 run으로 비교한다. 입력 coverage와 expectedFitness는 구조 gate이며, `content`의 설명력·객관성·정보 밀도·반복/불필요한 판단은 전체 원문을 Codex가 직접 검토한다. 길이는 관찰값이며 글자 수나 단어 패턴으로 정성 품질을 판정하지 않는다. 사실 과장·기간 오류·기준별 핵심 근거 누락이 있으면 해당 사례는 정성 불통과다. 두 prompt 모두 작은 개발 challenge이며 운영 정확도나 독립 평가를 뜻하지 않는다.

2026-10-08 로컬 prompt는 기준별 툴팁에 맞춰 후보자 행동·책임·결과를 우선하고, 필요한 범위·미확인 근거만 짧게 설명하도록 보완했다. 기존 필수 문장 수는 제거했다. Output schema·모델·privacy 경계는 유지하고, 비어 있는 역할 정보는 입력에서 생략한다. Prompt/input fingerprint가 달라져 기존 presentation cache는 새 결과로 간주되지 않는다.

| Run suffix | 구조·expectedFitness | 관찰 |
| --- | --- | --- |
| 065146.835636Z | 5/6 | 기존 prompt. B2B→B2C 소개 오류, Kubernetes 미기록을 bad, 포함 기간을 순차 기간처럼 표현 |
| 065226.168001Z | 5/6 | 첫 보완. 관리 경험 미기록을 bad, 보고되지 않은 분석/측정과 파생 배율을 content에 추가 |
| 065359.333407Z | 6/6 | 미확인/명시적 부족 구분과 기간 보존 개선. 평가 결론의 반복 설명이 남음 |
| 065521.143890Z | 6/6 | 툴팁 용도와 사실만으로 충분할 때 끝내는 계약 추가. content 압축 |
| 065725.360892Z | 6/6 | 최종 입력 정리 포함. 11개 기준 coverage, 62.68초, 추정 API 비용 $0.00189354 |

최종 run 원문에서 기간 중첩, 개인/플랫폼 성과 범위, 참여/주도, 미확인 경험의 uncertain 처리가 개선됐다. 언어가 같은 한국어 역할 3쌍의 7개 content는 기존 1,117자에서 796자로 약 29% 짧아졌다. 길이는 품질 판정 기준이 아니다. 일부 중복 설명, 평가 출처를 원문보다 강하게 표현한 단어, 영어 역할의 출력 언어 불일치는 남아 있다. 구조 6/6을 완전한 문구 품질이나 출시 gate 통과로 확대하지 않는다. 모델 원문과 사례별 Codex 검토는 ignored runs에 보존했으며 DB 저장·회사/후보자 발송·배포는 없다.

### Overall fit challenge presentation-v3

`presentation-cases-v3.json`과 `manifest-presentation-v3.json`은 최초 v3 호출 전에 동결했다. v1/v2를 덮어쓰지 않고 v2의 6개 입력에 최종 fit 기대값을 추가한 뒤 4개 경계 사례를 더했다. 총 10쌍·13개 기준이며, criteria가 없는 사례 4개를 포함한다. 평가 단위는 같은 선택 완료 후보자 × 역할이다.

입력 계약과 canonical runner는 위 Worker 계약과 같다. `venv/bin/python llm_evals/unified_talent_role_fit/eval_presentations.py --dataset v3`로 실행한다. 실제 production prompt/parser가 소개·기준별 평가와 함께 `finalFit` 하나를 반환한다. 값은 `excellent | good | borderline | uncertain | unfit`이며 기준이 있으면 중요도와 충족 범위를 종합하고, 없으면 Role/JD와 Hiring Brief의 주요 업무·책임·명시 조건을 사용한다. 기존 모델·fallback·sampling 조건은 유지한다. 개인 Brief/Behavior·fit reason은 입력하지 않는다.

Gate는 기준 coverage·기대 fitness·기대 finalFit과 전체 원문의 사실 충실성이다. 정보 부족은 uncertain, 확인된 인접/부분 경험과 비필수 범위 차이는 borderline, 확인된 필수 조건 충돌은 unfit으로 구분한다. 라벨 수를 평균내거나 문구 패턴으로 판정하지 않는다. 마지막 4개 사례는 excellent·uncertain·unfit·borderline 경계를 고정한다. 기존 입력에서 중요도가 불분명한 일부 기준은 인접한 라벨을 허용하며 이 비독립 Codex gold를 전체 운영 정확도로 해석하지 않는다.

Raw 입력·출력·usage는 ignored runs, 디렉터리0700/파일0600에 보존한다. 합성 입력만 같은 공급자에 전송하며 평가 중 DB 연결·저장·발송은 없다. 저장·캐시·nullable legacy·5개 허용값은 별도 targeted Python 테스트와 disposable local Postgres로 확인한다. 기존 저장 행을 소급 평가하지 않는다. UI 표시는 이번 범위에 포함하지 않는다.

실행 `worker-presentation-20261008T071358.442530Z`는 실제 GLM 5.3 Flash로 115.466초, 추정 API 비용 $0.00385457에 완료했다. 최종 fit 기대값은 10/10, 13개 기준 coverage는 모두 충족했으나 기준 fitness까지 합친 gate는 9/10이다. UCIP010의 기준이 인접 경험도 허용하는데 gold는 bad만 허용해 모델의 uncertain과 달랐다. Gold는 변경하지 않았고 독립 label 검토가 필요한 차이로 기록했다. 전체 원문 검토에서는 인터뷰→출시의 미확인 인과 연결, 기준에 필요 없는 성과 caveat, 반복·출력 언어 불일치도 관측했다. 최종 fit 기능의 검증을 전체 문구 품질이나 release gate 통과로 확대하지 않는다.

저장·캐시·private context·회사 노출 경로 테스트18개와 disposable local PostgreSQL 17 저장/허용값/legacy null 테스트1개가 통과했다. 사용자가 별도로 요청한 운영 DB의 `final_fit` 칼럼 추가는 `20261008071515_company_presentation_final_fit.sql`과 같은 내용으로 적용하고 실제 catalog·check constraint를 확인했다. 서비스 배포·기존 행 backfill·회사/후보자 발송은 없다. 이는 합성 모델 평가의 DB write가 아니라 요청된 additive schema 작업이며, Worker 코드가 배포됐다는 뜻은 아니다.

### TL;DR / Harper Note challenge presentation-v4

`presentation-cases-v4.json`과 `manifest-presentation-v4.json`은 최초 v4 호출 전에 동결했다. v3의 후보자/역할 근거·fit gold 10쌍·13개 기준을 유지하고, 기존 locale을 명시적 `outputLocale` 입력으로 추가했다. 관측된 UCIP010의 bad/uncertain gold 차이도 그대로 보존했다. 입력 계약이 바뀐 새 version이며 이전 파일은 변경하지 않는다.

같은 canonical Worker runner에 `--dataset v4`를 지정한다. 출력은 `tldr`(700자 이내), `harperNote`(320자 이내), `finalFit`, 현재 criteria의 평가다. 실제 production prompt는 오전9시 auto-intro cron의 `src/lib/ops/autoIntroToCompanyLlmPrompt.ts` TL;DR/Harper Note 계약을 Worker에서 재사용하는 `opp/company_first_search/writing_contract.py`를 적용한다. 희소한 역할 관련 사실·개인 책임·해석 가능한 규모를 TLDR에, 반복 없는 근거 기반 해석1–2개를 Note에 쓴다. 문장/단어 수는 prompt 계약이며 코드가 구두점·문구 패턴으로 내용 품질을 판정하거나 자르지 않는다. 운영 출력 언어는 같은 Headquarters 기반 locale helper를 재사용하고 평가에서는 frozen locale만 공급한다.

fit/coverage gate와 모델·privacy·재현·한계는 v3와 같다. 추가로 전체 TLDR/Note를 읽어 사실 선택, 해석의 근거, 중복, 미확인 동기/관심·직접 인터뷰 주장 여부, 회사 언어를 판단한다. 모델을 실제 호출하며 DB/cache/발송은 없다. 내부 rerank reason은 이 writer에 입력하지 않고, 두 텍스트의 원문 저장·캐시 복원·공개 projection은 별도 targeted 테스트로 확인한다. 작은 합성 세트의 통과를 전체 문구 품질이나 출시 gate 통과로 확대하지 않는다.

## Conversation-backed Harper Note: presentation-v5 (로컬 미배포)

[presentation-cases-v5.json](presentation-cases-v5.json), [manifest-presentation-v5.json](manifest-presentation-v5.json)을 첫 호출 전에 동결했다. v4 경력·fit gold를 유지하고 명시적인 합성 Search Brief를 추가했으며, 두 보상 비교 사례를 추가했다. 실제 writer의 입력은 전체 Brief를 포함하고 출력은 `criteriaEvaluations`, `tldr`, `finalFit`, `harper_note`다. Harper Note는 대화에서 확인된 다음 업무·책임·근무 조건·시점을 전달하며 연봉 수치·다른 회사 대화·민감한 사생활은 공개하지 않는다. 기준이 없거나 Brief가 비어 있어도 동일 writer를 실행한다. `harper_worker/llm_evals/unified_talent_role_fit/eval_presentations.py --dataset v5`가 canonical runner다. 모델 설정·source/input/prompt hash와 원문은 기존 owner-only ignored runs에 기록한다. 구조·기존 fit label·개인정보·사실성·선호 강도·빈 Note를 분리 검토하며 critical privacy/창작 오류 0이 gate다. 전체 source/label 변경 내역·지표·한계는 manifest에 기록했다. 독립 팀원 gold 검토와 대표 분포 평가는 미완료다.

2026-10-08 추가 로컬 모델 설정: writer는 `COMPANY_CANDIDATE_PRESENTATION_CALL`로 분리하고 GPT-6 Luna high / temperature 0.3 / 16384 tokens를 기본으로 사용한다. `COMPANY_CANDIDATE_PRESENTATION_MODEL`로 실험할 수 있다. 동일 v5에 GLM과 Luna를 실행한 원문·설정·비용은 각 새 run manifest에 보존한다. 비교 모델의 기존 call 이름은 당시 계약이며 이전 dataset/gold/manifest를 덮어쓰지 않는다. 새 계약의 구조 오류 수정도 동일 writer를 한 번 다시 호출한다. [실제 비교와 최종 원문 검토](reports/2026-10-08-brief-harper-note.md)는 최종 구조·label 12/12와 이전 run의 차이·표본 한계를 함께 기록한다. 실제 업무를 직함보다 우선하고, 명시된 업무 범위 부족과 미기재를 구분하도록 보완했다. Note의 notice interval은 확정 입사일로 바꾸지 않는다. 이 한 번의 통과를 운영 정확도나 반복 안정성으로 해석하지 않는다.
