# Harper LLM evaluation registry

이 디렉터리는 Harper에서 반복 실행할 LLM 평가의 **발견 가능성, 정답 버전, 실행 조건, 결과 해석**을 한곳에서 관리하는 기준 위치다. 모델만 바꾸어 비교할 때는 고정 fixture와 gold를 그대로 재사용하고, 입력이나 정답을 바꿀 때만 dataset version을 올린다.

실행 코드는 실제 prompt와 후처리를 import해야 하므로 해당 runtime의 소유 repository에 둔다. 이곳에는 태스크별 계약과 재현 메타데이터를 두고 canonical runner를 링크한다. 같은 runner나 prompt를 문서 폴더에 복제하지 않는다.

## 현재 태스크

| 태스크 | 평가 대상 | 정답/fixture 상태 | canonical runner 또는 원문 | 상태 |
| --- | --- | --- | --- | --- |
| [company-onboarding-pitch](company-onboarding-pitch/README.md) | 온보딩 Pitch의 회사 매력·실제 저장·정정·응답과 latency | synthetic frozen v2 6발화, gold v2; v1 3발화 보존 | `scripts/evalCompanyOnboardingPitch.ts`, 격리 local Supabase + 실제 company-side LLM/수정 executor | Haiku 5.5 high, 회사 매력과 조건 보존 재검증; 결과는 task reports |
| [external-fit-qualitative](external-fit-qualitative/README.md) | External scorer의 rerank 이전 비교: 과거 DeepSeek/Jev와 현재 DeepSeek V4.1/GPT-6 Luna | 실제 3명·71쌍 pilot-v4, 2명·41쌍 pilot-v5, 추가 5명·137쌍 pilot-v6; review rubric v1, human gold pending | `harper_worker/llm_evals/external_fit_qualitative/eval.py`, `compare_deepseek_luna.py` 및 실행 노트북 | pilot-v6는 Luna 137/137, DeepSeek 132/137 출력; 5명 중 4명에서 Luna 선호라는 assistant 정성 평가, 독립 정확도 검증 아님 |
| [company-talent-contacts](company-talent-contacts/README.md) | 통합 양방향 연락·역할 선택·재진행·자발 연락과 회사 후속 실행 | frozen v2 5대화 + 별도 transport-v1 1왕복 | `scripts/evalUnifiedCompanyContacts.ts` + UTF8 격리 PostgreSQL; `scripts/evalCompanyContactTransport.ts` | 9/25 상태·권한·개인정보 5건 및 실제 메일 왕복 확인. 답변 의미 확장 때문에 전체 품질 NO-GO; 앱 미배포 |
| [creator-content-performance-conclusion](creator-content-performance-conclusion/README.md) | 크리에이터 콘텐츠의 플랫폼 반응·지급 예정액을 비교한 짧은 결론 | synthetic `gold-v1.json` 4건 | production prompt/normalizer를 재사용하는 `scripts/evalCreatorContentPerformanceConclusion.ts` | GLM live v1 구조 4/4·rating 4/4 통과 |
| [creator-outreach-reply-triage](creator-outreach-reply-triage/README.md) | 크리에이터 이메일 회신의 primary type·짧은 한국어 요약·명시 URL 추출 | synthetic `gold-v2.json` 8건; v1 계약 모순 1건 adjudication | production prompt/normalizer를 재사용하는 `scripts/evalCreatorOutreachReplyTriage.ts` | GLM live v2 유형 8/8·URL 8/8 통과 |
| [internal-fit-abc](internal-fit-abc/README.md) | 사람 × internal role의 A 직무 적합성, B 후보 만족 가능성, C 회사 인터뷰 가능성과 최종 추천 판단 | A/B/C `gold-v3.json` 13쌍; 최종 추천 `recommendation-gold-v1.json`은 positive 9·negative 4 | A/B/C runner와 production 1·2차를 재사용하는 fresh-decision recommendation runner | GLM high P/R 85.7%/66.7%, max 80.0%/44.4%; max는 3시간 45분·soft-positive 0/2이고 공통 hard-negative 오류가 남아 배포 부적합 |
| [internal-recommendation-binary](internal-recommendation-binary/README.md) | 한 Talent × 한 internal Role의 최종 추천 여부 | `gold-v4.json` 41쌍(추천 12·애매 10·비추천 19); pair별 exclusive `snapshotCutoffAt`, 전체 cutoff-safe fixture | production 1·2차 prompt/builder/normalizer와 recovery를 재사용하는 `harper_worker/llm_evals/internal_recommendation_binary/eval.py` | v4는 IRB006 제거·IRB011 Config FDE anchor 변경 후 미실행; 직전 v3 전체 GLM 5.3 Flash high는 판정 42/42, precision 88.9%, recall 61.5%, specificity 94.7% |
| [unified-talent-role-fit](unified-talent-role-fit/README.md) | 공통 1차 boolean·2차 fit/이유/missingInfo, 후보자 연락 준비 | 합성 fit v1 6쌍, contact-v1 2건; 실행 전 gold 고정 | `harper_worker/llm_evals/unified_talent_role_fit/eval.py`, `eval_contacts.py` | 2026-10-07 fit 6/6, 연락 준비 2/2와 Codex 원문 검토. 작은 challenge이며 운영 반응률 평가와 별개 |
| [recommendation-feedback-outcomes](recommendation-feedback-outcomes/README.md) | 실제 전달한 내부 추천 대비 긍정·부정·저장·무응답 비율과 새 정책 비교 | Gold 미동결. Read-only 원장 3,089행·최근 14일 경과 모집단 1,519행; 실제 전달/label/as-of 입력 정제 필요 | `harper_worker/llm_evals/recommendation_feedback_outcomes/eval.py`: inventory/capture/label/report | inventory 실행, source/episode/관찰 coverage 회귀 8개 통과. Gold·당시 입력 replay·온라인 실험 미실행 |
| [internal-external-fit-model-benchmark](internal-external-fit-model-benchmark/README.md) | 기존 internal prefilter와 external scorer의 모델 교체 | worker suite별 fixed fixture/manual gold | [worker model benchmark](../../../harper_worker/llm_evals/model_benchmark/README.md) | 사용 중 |
| [final-delivery-generation](final-delivery-generation/README.md) | 최종 추천 메일 및 질문 기록 | 완료 run의 local-only 입력 + synthetic contact-delivery-v2 5건 | worker `final_delivery_model_compare.py`, `eval_contact_delivery.py` | 10/7 실제 생성에서 질문 기록 schema 누락·회사 언어 추정·추천 부족 안내 오류 발견 및 보완, 상세 실행 기록은 task README |
| [company-candidate-introduction](company-candidate-introduction/README.md) | 회사용 후보자 소개·기준별 content와 최종 fit의 사실성·관련성 | 기존 3개 pair·6항목 rubric, 별도 합성 presentation-v1/v2/v3(10쌍·13개 기준) | [5회 개선 기록](../auto-intro-headhunter-message-five-iteration-evaluation-ko.md), beta/Worker presentation runner는 task README | 10/8 Worker GLM v3 최종 fit 10/10, 기준 fitness 포함 gate 9/10. 정성·gold 강도·언어 한계가 남아 출시 판정 아님 |
| [company-candidate-writing-playground](company-candidate-writing-playground/README.md) | 실제 Presentation → Slack writer의 고정 입력·모델·prompt 실험 | parent presentation-v5 UCIP003 기반 합성 playground-v1; live capture는 private, human gold 없음 | Worker `llm_evals/company_candidate_writing/playground.py` 로컬 웹 화면 | 운영 함수 재사용, read-only capture·고정 QA 전송·raw input/output 보존; 대표 품질/출시 gate 아님 |
| [company-side-conversational-qa](company-side-conversational-qa/README.md) | 회사 대화의 판단·연락·연속성·지연 로딩과 Role 작성 | v7 10묶음·34변형·49발화 + Role v2 5발화; 기존 v4 E2E 보존 | `scripts/evalCompanyAgentCapabilities.ts` (실제 모델·합성 도구), `scripts/evalUnifiedCompanyContacts.ts role-creation` | 9/25 전체 실행·구조 개선·targeted 재시험. Role 최초 작성 조건 강화 등으로 전체 NO-GO, 미배포 |
| [wonderful-internal-role-ranking](wonderful-internal-role-ranking/README.md) | Wonderful FDE/Field CTO retrieval·reranking·선택 | blind holdout 실행 계약 | [benchmark 매뉴얼](../wonderful-korea-fde-field-cto-benchmark-manual-ko.md) | 명시적 실행 요청 시에만 실행 |
| [internal-role-conversation-qa](internal-role-conversation-qa/README.md) | Career·email reply의 내부 역할 탐색·단계적 공개·대안·재검토·우선 검토·수락 경험 | Career 20-turn + email reply 10-case `cases-v3.json`; re-engagement 12-case `reengagement-cases-v1.json`; 실제 계정 매핑과 원문은 local-only | Career Chrome E2E + email inbound-job local replay; re-engagement read-only runner | v3 frozen; re-engagement v1은 2026-09-05 최종 12/12 통과 |
| [career-priority-review](career-priority-review/README.md) | 같은 포지션의 fit 없음·낮음·높음에서 우선 검토 등록 응답과 반복 초기화 | 합성 fit 3개 `cases-v1.json`; 승인된 계정·공개 Role snapshot은 private | `scripts/evalCareerPriorityReview.ts`, Career Dev controls; 실제 prompt/tool executor + 메모리 저장 sandbox | 응답 비교용; 실제 RPC 저장·Worker·회사 전달·Memory/Brief E2E는 제외 |
| [talent-behavior-context](talent-behavior-context/README.md) | Memory·Brief·행동 원천에서 Worker용 soft inference cache를 생성·증분 수정하는 품질 | 비식별 synthetic challenge `cases-v1.json` 7개와 review gold v1 | `harper_worker/llm_evals/talent_behavior_context/eval.py` | 2026-09-09 최종 prompt 2회 반복 14/14 구조 통과, 수동 critical review 통과 |
| [career-voice-onboarding](career-voice-onboarding/README.md) | Realtime / GPT Live 첫 온보딩 통화의 추천 준비·저장 정확성·기록 기반 비용 | production-derived pilot-v2 최근 30일 120명, 24시간 성숙 113명; rubric v1·최종 gold labels-v2 | `scripts/evalCareerVoiceOnboarding.ts` + Codex 직접 의미 검토 | Codex audit: 성숙 표본 Realtime 23/59, Live 13/54; 기록 부족 45명. 첫 session 관측 비용/성공 확인 1명당 $1.61/$1.42; 독립 human gold 미확정 |
| [career-capability-loading](career-capability-loading/README.md) | 도구/정책 지연 로딩, 기능 인식·제안·수락 후 실행, 이력서 동의, N턴·코칭·연락 연속성 | synthetic v3 18개·25턴 + v5 14개·33턴; 이상적 답변·장애 포함, 이전 버전 보존 | `scripts/evalCareerCapabilities.ts` | Sol 실제 56대화·110턴, 발견 문제 수정 후 사례별 최신 32종 통과; 39개 핵심 검사 통과, 운영 비용 gate 별도 |
| [career-coaching-dialogue](career-coaching-dialogue/README.md) | Career 코칭의 텍스트 lifecycle 경계와 active 통화·채팅 대화 품질 | 비식별 synthetic v1 통화 4개 + v4 lifecycle/negative 14개 + v5 active 채팅 3개 | `scripts/evalCareerCoachingDialogue.ts`, `scripts/evalCareerCoachingLifecycle.ts` | v1 통화 4/4, v4 lifecycle Terra high 3회 통과. v5 active chat GLM 5.3 Flash high 2회 human quality 0/3, NO-GO |
| [career-request-intro-reply](career-request-intro-reply/README.md) | 회사 Request Intro 수락 후 진행 질문에 대한 Career 최종 답변의 충분함·자연스러움 | test-only 상태에서 동결한 synthetic v1 1건, human qualitative rubric | `scripts/evalCareerRequestIntroPromptComparison.ts` | GLM 5.3 Flash high 동일 input의 post-tool prompt 4종 비교 생성, human review 대기 |
| [career-company-research](career-company-research/README.md) | 회사 조사·합류 판단·경로 의존성·역량 전이 가능성·다음 선택지·지연 | 회사명만 캡처한 기존 5개와 합성 challenge 2개 `cases-v2.json`, human-review `gold-v4.json` | `scripts/evalCareerCompanyResearch.ts` | schema v8 기본 검색 3개 + Terra high 자율 Exa tool loop·고정 필드 없는 Markdown; 전체 7건 gate는 미실행 |
| [resume-company-resolution](resume-company-resolution/README.md) | 이력서 경력 회사명 → 기존 `company_db`의 정확한 identity 연결 | 기존 pilot과 겹치지 않는 사용자 20명·125경력 `v2`; GLM 실행 전 확정한 blind manual gold 125개 | `scripts/evalResumeCompanyResolution.ts` | 모든 이름 매칭에 후보 최대 8개 + GLM 5.3 Flash high 선택/병렬 double-audit: 사후 real-company precision 100%·다른 회사 false link 0, recall 75.8%, $0.007212/20명; strict exact-ID는 중복 행 차이 4건으로 신규 blind 확인 전 NO-GO |
| [external-opportunity-value](external-opportunity-value/README.md) | External 공고의 role feasibility·candidate value·최종 slate 선택 | frozen `pilot-v1` 6×30, `selection-random-v1` 48×30; human gold pending | [worker external opportunity value runner](../../../harper_worker/llm_evals/external_opportunity_value/README.md) | hard candidateFit gate 폐기, role-feasible setwise architecture 선택; blind human review 대기 |
| [role-scoring-list-retrieval](role-scoring-list-retrieval/README.md) | fit 평가 목록의 초기 순위 품질·6회 누적 발견·검색 중복 | frozen v1/v2/v3 4,649명·13역할; 기존 긍정 gold 보존, v3 885쌍 silver | worker `llm_evals/role_scoring_list_retrieval/`의 `ranking_eval.py`, `ranking_followup.py`, `ranking_summary.py`, `broad_ranking.py` | 13역할 추가 확인: SQL/FTS/벡터 결합 22.9→38.1%; 사용자 승인 후 기본 결합 순위 로컬 구현·6역할 실행/18순서 parity 확인; 새 3역할 품질 혼재·첫 발견 gate 미통과·미배포 |
| [company-first-talent-selection](company-first-talent-selection/README.md) | 회사가 먼저 검토할 Talent의 retrieval·A/B/C scoring·회사 전체 rerank·company-safe 설명 | frozen guard-only `v1`; private positive `v2-pilot`은 gold 미동결 | [worker Company-first shadow runner](../../../harper_worker/llm_evals/company_first_talent_selection/README.md) | 한 positive Role shadow 완료; 3개 이상 회사·직군과 frozen v2 gold 필요 |
| [company-role-salary-estimation](company-role-salary-estimation/README.md) | 공개 연봉이 없는 `company_roles`의 연간 기본급 범위 추정 | `v4-korea` 한국 회사 20개·numeric gold 0건; `v3` 회사별 web-search holdout 50건 | [worker salary estimator](../../../harper_worker/llm_evals/company_role_salary_estimation/README.md) | v4 strict Deep: 20/20 구조, found 1·unknown 19, $0.012/건·중앙 8.34초; Auto found 1건은 출처 audit false positive, 정확도는 gold 부재로 미측정 |
| [company-side-background-result-writing](company-side-background-result-writing/README.md) | 회사가 부탁한 background 작업 완료 후 최근 대화를 이어 결과를 전달하는 한 번의 답변 | production-derived local-only 0명 case `v1`; qualitative rubric | `scripts/evalCompanyBackgroundResultWriting.ts` | focused prompt와 5-model 동일-input 비교 가능; blind review·case 확장 전 |

과거 일회성 결과와 노트북은 [worker legacy 안내](../../../harper_worker/llm_evals/legacy/README.md)에 보존한다. 재사용할 평가로 승격할 때만 이 레지스트리에 태스크 폴더와 계약을 추가한다.

## 태스크 폴더의 필수 내용

`docs/evaluation/<task>/README.md`에는 최소한 아래 내용을 기록한다.

1. 무엇을 바꾸려는지와 평가가 답할 수 없는 것
2. 평가 단위와 포함/제외 기준
3. frozen dataset·gold version, capture 시점, source revision과 변경 이력
4. 실제 prompt/input builder/output normalization을 재사용하는 canonical runner
5. model/provider/reasoning/temperature/tool 조건과 timeout 같은 실행 조건
6. metric, slice, critical failure와 배포 전 gate
7. raw data·PII·secret·외부 provider 전송 범위
8. 알려진 bias, leakage, 표본 크기와 일반화 한계

권장 파일 배치는 다음과 같다.

```text
docs/evaluation/<task>/
├── README.md                  # 사람이 읽는 평가 계약과 해석
├── gold-v<N>.json             # de-identified, review된 정답
├── manifest-v<N>.json         # provenance, hash, 분포, runner 상태
├── private/                   # raw production fixture; gitignored, chmod 0600
└── runs/                      # raw output·비용·지연; gitignored
```

공유 가능한 비식별 aggregate 보고서를 남겨야 하면 `reports/`에 저장할 수 있다. 보고서가 원문 prompt, 후보자/회사 식별자, 대화, 이력, 모델의 raw response를 포함하면 `runs/`에만 둔다.

## 버전과 실행 규칙

- `datasetVersion`은 입력 사례와 gold의 의미를 식별한다. 모델 이름이나 실행 날짜를 dataset version에 넣지 않는다.
- 새 모델/provider/reasoning 비교는 같은 dataset version에 새 run을 추가한다. 정답을 모델 출력에 맞춰 수정하지 않는다.
- 사례 추가·삭제, 입력 snapshot 교체, label 변경은 `v2`, `v3`처럼 새 dataset version으로 저장한다. 이전 버전은 회귀 비교를 위해 유지한다.
- label 수정에는 reviewer, 수정 이유, 시각을 남긴다. 모델 결과를 본 뒤 정답을 바꾸었다면 unblinded adjudication임을 표시한다.
- prompt 또는 코드가 달라진 run에는 source commit과 prompt fingerprint를 기록한다. dirty worktree라면 commit 대신 dirty 상태와 diff fingerprint를 명시한다.
- production 평균을 추정하는 representative sample과 희귀·치명 오류를 잡는 challenge set을 구분한다. 두 결과를 하나의 accuracy로 합쳐 해석하지 않는다.

각 run manifest에는 적어도 `task`, `datasetVersion`, `runId`, `createdAt`, `sourceRevision`, `promptFingerprint`, `model/provider`, `reasoning`, sampling 설정, timeout, fixture hash, metric summary, raw artifact path를 남긴다. API key나 원문 PII는 manifest에 넣지 않는다.

## 데이터 안전

- production capture는 read-only connection/transaction으로 실행하고 DB write, fit/recommendation 저장, 메시지·이메일 전송을 금지한다. Harper worker DB를 읽는 canonical runner는 `opp.utils.new_runtime.connect_read_only()`를 사용해야 한다. 일반 worker `connect()`나 transaction pool endpoint에서 session-level `SET default_transaction_read_only`를 실행하는 capture는 금지하며, canonical helper를 사용할 수 없으면 실행을 중단한다.
- `private/`와 `runs/`는 이 디렉터리의 `.gitignore`로 제외된다. private 파일은 owner-only(`0600`)로 둔다.
- 외부 provider에 production 원문을 보낼 때는 provider, endpoint, data collection 설정과 승인을 README/run에 기록한다.
- raw fixture가 이 로컬 머신에만 있으면 git clone만으로는 재현되지 않는다. 장기 보존이 필요할 때는 별도의 승인된 암호화 저장소를 사용하고 locator만 기록한다.
- synthetic/E2E role을 만드는 평가는 workspace `AGENTS.md`의 `testOnly` 및 `testFixture` 격리 계약을 그대로 따른다.

## 결과 해석 원칙

작은 고정 세트는 회귀와 모델 간 사례별 차이를 찾는 도구다. 표본이 대표 추출되지 않았다면 전체 production 성능 향상률로 말하지 않는다. 평균 점수만 보지 말고 hard-constraint 누락, 잘못된 질문/발송, lifecycle 중복, protected-trait 사용, JSON/coverage 실패 같은 critical violation을 별도로 0건 gate로 둔다.
