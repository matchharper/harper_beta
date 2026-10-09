# 통합 매칭: 요구사항 대조와 현재 구현 상태

기준: 2026-10-08 로컬 checkout. **문서 전체 구현 완료 또는 배포 가능 판정이 아니다.** Notion [구조 개선](https://app.notion.com/p/3ec7277d26df8087bbf5cd0b3fe4fb39)의 2026-10-07T06:23:36.804Z 본문, 이후 대화에서 확정한 수정, [상세 구현 계획](../unified-talent-role-matching-implementation-plan-ko.md)을 실제 실행 코드와 대조했다.

최초 대조는 운영 배포·DB 변경·실제 발송 없이 수행했다. 2026-10-08 우선 검토 오류 수정에서 관련 DB 의존성 10건과 역할 기반 우선 검토·V2 추천 표시·등급 판정 보정 3건을 운영 DB에 적용했다. 웹·Worker 코드는 배포하지 않았다. 아래의 ‘반영’은 로컬 코드 상태이며 운영 전체 흐름이 같다는 뜻이 아니다. 운영 DB 검증은 변경을 전부 rollback하는 등록·철회·추천 표시 확인으로 수행했고 실제 후보자/회사 발송은 하지 않았다.

2026-10-08 Free/Paid·월수금·scoring 전 방향별 제외 보완은 **로컬만 반영**했다. 새 migration `20261008043437_role_matching_route_eligibility.sql`은 운영 미적용이다. 격리 Postgres 검증은 운영 데이터·실제 LLM·발송 없이 수행한다. 이 검증은 이전 통합 작업 전체의 release gate를 대체하지 않는다. 이번 실행 권한 변경과 관련된 회귀 검증 320개 및 subtest 4개가 통과했다. 그중 27개는 disposable localhost Postgres에서 실제 migration·billing 함수·공개 범위·이력·alias 충돌을 검사했다. 실행: Worker checkout에서 `HARPER_RUN_LOCAL_POSTGRES_TESTS=1 HARPER_TEST_POSTGRES_BIN=<Postgres bin> python -m pytest tests/test_role_matching_postgres.py tests/test_role_matching_eligibility.py tests/test_unified_matching.py tests/test_company_first_search.py tests/test_opp_delivery_format_outbox.py tests/test_internal_role_safety.py tests/test_matching_inspection.py tests/test_matching_volume.py tests/test_post_calibration_company_matching.py tests/test_company_matching_local.py`. 추가 확인에서 기존 `test_opp_worker_prefilter.py::OpportunityWorkerSchedulerTest::test_scheduler_checks_actual_internal_work_before_marking_due`는 앞선 통합 변경의 scheduler SQL과 과거 문자열 assertion 불일치로 실패했다(54개 통과). 이번 작업에서 `opp/worker.py`와 그 테스트는 수정하지 않았다.

## 1. 제품 흐름별 대조

| 요구 | 실제 실행 경로 | 판정·남은 경계 |
| --- | --- | --- |
| talent/company 평가 하나로 통합 | Worker `opp/matching/fit.py`, `inputs.py`, `service.py`; 양쪽 adapter | 반영. canonical `talent_opportunity_fit`에 같은 평가 저장 |
| 1차 boolean + 이유, 명확한 hard/강한 부적합 제거 | `evaluate_pairs` stage1, GLM5.3Flash | 반영. 미확인/전환 희망만으로 탈락시키지 않는 합성 평가 포함 |
| 2차 세 축 5단계, candidate/company 이유 | 같은 evaluator stage2, Sonnet5.5 | 반영. `roleFit/candidateFit/companyFit`, 두 reason, nullable `missingInfo`; 숫자 면접 확률로 위장하지 않음 |
| 직함만 맞으면 추천하는 오류 방지 | 공통 fit·role rerank·talent rerank의 scope/보상/수준/경력 근거 계약 | 합성 수준 불일치 사례 확인. 운영 모집단 품질은 미측정 |
| fit에서 recommend/re-eval/criteria/회사당 하나 제거 | V2 parser·upsert, 구버전 필드는 신규 결과에서 비움 | 반영. 옛 v1 코드/실험 파일이 남아 있다는 사실과 production V2 사용을 구분 |
| Profile + 전체 Brief + 같은 Behavior 입력 | 공통 loader, reducer, 연락 준비 | 반영. 연락 준비에 Brief만 있던 누락도 수정. 경력/학력 projection은 기존 길이 상한 유지 |
| 양 방향 30일 cache, source/model/prompt 변경 시 무효화 | `service.py`, migration 126000 | 반영. source 재확인 후 저장. 운영 다중 process contention 미검증 |
| 만료분이 새 후보를 모두 밀어내지 않음 | `merge_stored_matching_pool` | 새 검색이 있으면 fresh budget 중 절반 이하를 만료분에 배정. 유효 cache·명시 요청 별도 |
| 이전 fit 이유를 새 fit의 정답으로 주지 않음 | 공통 PairInput | 반영. 이전 평가 history는 보존하되 공통 evaluator 입력에 넣지 않음 |
| Paid·tailored·legacy·scale 월수금09 기본 검색 | role scheduler + slot entitlement + `eligibility.py` | 로컬 반영. Free talent-first 없음. 시스템 전체 scheduler 운영 switch는 별도 |
| 회사 자동 추천 ON + 설정 요일·시간 추가 slot | 같은 scheduler, role/slot dedupe | 로컬 반영. Free 회사 방향만, Paid도 월수금 외에는 회사 방향만. 같은 시각 병합 |
| 역할 최초 활성화 한 번 | migration 121000 + 20261008043437 trigger | 로컬 반영. Brief 준비 후 첫 허용 slot, tailored 포함. Free 자동 추천 OFF면 등록 없음 |
| 온보딩 직후 평가·선택·추천 | `current_state.py`, `internal_fit.py`, `matching/talent.py` | 반영. 최종 화면/발송 전 구간 전체 E2E는 미실행 |
| 개발자이지만 PM 희망인 사람 검색 | query planner에 Brief 검색 경로, 저장 pair 병합 | 반영. 실제 DB 모집단에서 전환 희망자 recall 측정은 미실행 |
| 회사에 이미 제안한 후보도 talent 경로 검토 | route별 eligibility, candidate/company/both 선택 | 반영. 저장 단계에 남아 있던 ready 중복 차단도 이번에 수정 |
| 후보자 일반 연락 72시간·최대3·회사당 하나 | cadence + `contact_selection.py` + 최종 writer | 반영. 실제 회사 Intro는 기존 즉시 전달 경로 유지 |
| 같은 재료로 매번 재추첨 금지 | role/talent/contact selection fingerprint | 반영. 같은 no-action 재사용. 새 요청 identity와 철회도 반영 |
| 질문은 역할별 할 일로 만들지 않음 | `clarification.py` → 기존 contact orchestration/final writer | 반영. missingInfo를 연락 가치 판단 자료로만 사용 |
| missingInfo 50개/오래된 연락 10개 이상 | 32개씩 묶음 검토, 과거 질문10개씩 추가 검토 | 실제 모델 2개 challenge 통과. 운영 장기 이력의 비용/지연 부하 평가는 미실행 |
| 한 나라씩 반복 질문·경험 심문 금지 | 연락 준비 및 최종 writer의 일반 판단 계약 | 합성 연락 준비에서 묶음/중복/예외 범위 확인. 최종 이메일 표현까지의 모델 E2E는 별도 |
| 질문 실제 발송 후에만 기록 | sealed outbox + migration 130000 sent trigger | 격리 DB 검증. failed→sent, 재시도 중 중복 방지 |
| 답변은 원본 LLM이 일반 Brief/Memory 도구 사용 | Career/email/voice context, 일반 read/write | 코드 연결 반영. 오래된 질문 답변→정확한 예외 저장→새 추천까지 통합 모델 평가 미완료 |
| 정보 변경 뒤 matching refresh | Brief/Profile 변경 trigger, 기존 discovery queue | 반영. 120초 debounce/최대5분, Memory만 수정하면 queue 생성하지 않음 |
| Career 기본 질문 context가 폭증하지 않음 | 실제 연락 최근5 index, 일반 reader의 검색·pagination·정확한 ref | 반영. 질문 11개 DB 조회/검색 확인. 모든 원문을 매 턴 주입하지 않음 |
| 오래된 정보에 대한 check-in | worker 90일 anchor·30일 재검토, Brief/통화 완료 anchor | 반영. 별도 ‘이직 적극도’ enum은 추가하지 않음. 기존 활동/수신 정책 적용 |
| 우선 검토: 온보딩 미완료 | Career/email tool guard | 반영. 소개에 필요한 정보 준비를 설명하고 요청/공유 성공으로 표시하지 않음 |
| 우선 검토: fit없음/현재fit/추천 선택 | 요청 저장 → 서버의 선정 기록·perfect 등급 판정 또는 다음 role search의 오래된 요청 최대50명 | 2026-10-08 수정. 즉시 추천은 기존 candidate_first/both 또는 role/company 모두 perfect. fit 만료와 대화 모델의 추가 자격 판단 제거. 명백한 부적합은 계속 차단 |
| 낮은 fit의 별도 회사 검토 최대3 | role runner의 priority pool, 현재 requestId 재확인 | 반영. 일반 quota와 분리하되 회사 backlog/공유 경계를 넘지 않음 |
| tailored의 명시 요청 | 자동 주기 제외 + 허용된 role search에서 요청 pool 병합 | 2026-10-08 로컬 수정. 등록만으로 별도 exact-role run을 만들지 않음. 역할 검색 자체의 실행 계기는 기존 운영 계약을 따름 |
| 할 일 하단 요청·진행·철회 | `priorityReviewProgress.ts`, 기존 pending-actions API, `CareerTasksPanel` | 요청·실제 요청별 review·지연·역할 종료 표시와 취소 반영. 역할 검색이 실행 중이라는 이유만으로 50명 밖의 요청까지 검토 중으로 표시하지 않음 |
| 철회 후 새 추천이 뒤늦게 저장되지 않음 | exact request review 종료 + 저장 직전 current selection 검사 | 반영. 독립적으로 선택된 일반 추천과 이미 전달한 사실은 보존 |
| 이전에 명시한 회사 전달 동의 재사용 | 현행 priority tool에는 요청만 저장 | **미구현.** 높은 fit가 된 뒤 동일 범위의 전달 요청을 기존 수락 근거로 재사용하지 않음 |
| keep/저장, 새 기회→저장 탭 | feedback=keep, 웹/모바일/common feedback API | 반영. 수락/거절/회사 공유가 아니며 decision follow-up에서 제외 |
| keep 이후 오래된 수락·Intro 응답 | updated_at CAS RPC, email/chat 경로 | 격리 DB/API helper 검증. 실제 브라우저·음성 시나리오 미검증 |
| 추천 메일에서 저장을 가볍게 알림 | 최종 internal recommendation writer 계약 | 반영. 저장을 관심/공유 동의로 설명하거나 더 많은 추천 보상으로 약속하지 않음 |
| 회사에 후보자 추천 여부 공개 | company board/detail/LLM의 승인된 전달 fact projection | 반영. 카드/실제 메일 발송 구분, keep·거절·사적 질문 원문 미노출. 새 projection 모델 E2E 추가 필요 |
| criteria + 소개를 선택 뒤만 생성 | Python presentation writer; 후보자 먼저 수락 후 TS auto-intro writer | 양쪽 연결 반영. 회사 소개문을 fit.reason에 덮어쓰던 경로 제거 |
| 기준이 바뀐 예전 평가 노출 방지 | code-stamped criterionDefinition + current reader 비교 | 반영. **이미 공개된 대상의 보고서 자동 재생성은 미구현** |
| 실제 반응률 평가 | outcome runner inventory/capture/label/report | 구현 및 read-only inventory 실행. gold 동결·당시 입력 replay·온라인 비교 미실행 |
| 자동 dislike | 기존 3차 후속 연락 후2개월 | 유지. keep 제외, 자동 사건 출처 분리. 14일은 평가 관찰 기간 |

## 2. 계획과 구현이 아직 다른 항목

아래는 테스트가 부족하다는 뜻만이 아니라 **실제로 코드 경로가 다르거나 없는 항목**이다. 완료라고 표시하면 안 된다.

| 중요도 | 계획 | 현재 코드와 필요한 후속 작업 |
| --- | --- | --- |
| 높음 | 같은 역할의 유효한 기존 전달 동의 재사용 | priority register는 요청만 저장. 원문·역할 조건 revision·철회와 기존 acceptance 경로를 연결해야 함. 요청 자체를 동의로 바꾸면 안 됨 |
| 높음 | 회사 소개 writer 일부 실패는 해당 pair만 재시도 | `write_presentations`의 executor.map 예외가 run 전체로 전파됨. 특히 both의 후보자 경로까지 막을 수 있음. 기존 run/review의 실제 미완료 side effect를 기준으로 재개 경로 필요 |
| 높음 | criteria 변경 시 현재 회사 노출 대상 report만 갱신 | 새 선택 때 writer fingerprint는 갱신되지만 이미 ready인 대상은 다시 선택되지 않을 수 있음. stale reader 차단은 추가했으나 재생성 trigger/실행기 없음 |
| 중간 | Harper 대행의 명시 운영 방식 | workspace 제외 ID 설정을 계속 사용. 후보자 수락 후 로컬 agent가 소개를 준비·전달한다. 팀원 검토 queue는 사용자 결정으로 요구사항에서 제거했으며 미구현 기능으로 세지 않는다. 제외 ID를 운영 방식으로 바꾸는 작업은 별도다 |
| 중간 | 모델 호출 중 DB transaction을 잡지 않는 fit lease | 현재는 별도 connection의 advisory transaction lock을 유지해 중복 방지/전역5 batch 제어. 문서의 lease token·만료·우선 처리 구조가 아님. pooler/장시간 호출·프로세스 장애 부하 검증 필요 |
| 중간 | 후보자/회사 경로별 독립 pending/closed, 동일 pair 선택 supersede | 현재 review의 recommendation/closed는 주로 후보자 경로, 회사는 기존 Intro/outbox로 추적. 계획의 완전한 독립 재개 계약과 정확히 일치하지 않음 |
| 중간 | 일반 pool을 기다리지 않는 온보딩 우선 admission | 같은 전역 slot 경쟁이며 명시적 우선 queue가 없음. 5개 slot의 고정 동시성은 있어도 온보딩 우선순위를 보장하지 않음 |
| 중간 | 최근5 run: 역할명·회사 공개 가능한 이유·안정적 cursor | 현재는 counts/status/roleIds + offset pagination. private 이유를 노출하지 않지만 공개 가능한 설명과 동시 삽입에 안정적인 cursor는 미완료 |
| 중간 | 신규 실행별 role row와 단계별 비용/수량 | scheduled/activation은 role row, 명시 회사 검색은 기존 다중-role 회사 row 가능. fresh/cache 합계는 있으나 모든 단계별 수량·both 별도 수량·후일 전달 집계는 계획만큼 상세하지 않음 |
| 중간 | 회사에 제안됨·이전 동의 확인중·종료내역을 모두 보여주는 요청 UI | 현재 자동 프로필 검토 상태와 철회까지. 회사 상세 진행·완료 접기·중복 숨김 전체 브라우저 검증 필요 |

## 3. Notion과 이후 결정의 차이

Notion에는 검토 중 아이디어와 뒤에 수정된 내용이 함께 있다. 다음은 ‘전부 그대로 구현’이라고 표현하면 안 되는 차이다.

| Notion 표현 | 적용한 계약/차이 |
| --- | --- |
| 80%/60% 면접 통과 확률 | 실제 확률이 아닌 기준 차이의 비유. 세 축 grade+이유로 서로 다른 rerank가 판단 |
| 실제 Intro도 후보자 주기에 포함 | 같은 본문 뒤쪽과 대화의 최종 계약은 실제 회사 Intro 즉시 전달. 일반 추천의72시간과 분리 |
| 낮은 fit면 회사에 전달했다고 말함 | 일반 우선 요청은 최대3 선정 전 전달 완료가 아님. 실제 승인된 후보자→회사 연락 도구는 같은 호출에서 즉시 전달하는 기존 계약 유지 |
| internal-only 질문2개 이상, 월1회 최대5개 | 사용자 확인에 따라 internal-only는 묶은 유용한 질문2개 이상일 때만 연락 판단, 실제 질문 발송 후30일 간격, 최종 writer 최대5개로 반영. 역할 수가 아닌 질문 묶음 수를 사용 |
| freshness90일, 이후 월1회 | 기존 check-in의 Brief/통화 anchor와90/30일 판단으로 연결. 수신/활동 상태를 반영하며 새 적극도 분류기는 만들지 않음 |
| 역할별 reevaluation 작업 | 공통 fit의 missingInfo와 실제 연락 이력으로 대체. 질문 ‘답변됨’ boolean을 별도 classifier가 갱신하지 않음 |

## 4. 이번 대조에서 수정한 실행 결함

- 공통 fit 변경 후 Profile 편집이 cache만 무효화하고 refresh를 등록하지 않던 누락을 수정했다. Brief→Memory 이동도 오래된 Brief 판단을 남기지 않는다.
- 큰 기존 fit pool에서 만료 평가가 fresh 예산을 독점하지 않도록 분배했다. 후보 pool reducer/연락 준비에 전체 Brief·프로필·Behavior를 유지했다.
- 선택된 후보자 소개를 공통 fit.reason에 덮어쓰던 경로를 제거하고, 실제 소개 progress에 회사 보고서를 저장했다. 회사 공개 writer에 사적 Brief·profile memo를 넣지 않도록 줄였다.
- 실제 소개 모델의 회사 설명 중심 첫 문장과 중첩 경력 기간의 과장을 발견해 prompt를 보완하고 고정 사례로 재실행했다.
- tailored 명시 요청의 exact pair 처리, 모델 오류의 retry 경계, 요청 철회 후 미전달 선택 종료, 저장 직전 stale 검사와 Tasks 취소를 연결했다.
- 양쪽 제안을 허용했는데 Python 저장 단계가 회사 ready를 일괄 중복으로 보던 구조건을 수정했다.
- 현재 criterion 이름이 같아도 설명이 바뀌면 예전 평가를 현재 기준으로 표시하지 않도록 했다.
- outcome capture의 transaction isolation 설정 순서를 수정해 읽기 전용 inventory 실행을 확인했다. 이메일 직접 거절과 자동 만료의 출처도 분리했다.

## 5. 검증 증거와 실패를 함께 기록

| 검증 | 결과 | 확인하지 못한 범위 |
| --- | --- | --- |
| Worker 관련9개 suite | **441 passed +4 subtests**, legacy 문구 assertion1개 실패 | 실패는 v1 prompt의 `"active 상태"` literal 기대. HEAD에도 해당 literal이 없어 현재 작업의 회귀와 구분. 전부 통과라고 표현하지 않음 |
| TS 회사 report/소개·priority·legacy 질문 | **31/31** | 렌더링/브라우저·실제 로그인 세션은 아님 |
| migration11개 PGlite | 전부 실행 및 keep/CAS/source refresh/철회/질문 실제발송/회사 공개 경계 검증 | 운영 전체 schema·기존 trigger 조합/다중 process와는 다름 |
| 실제 fit 모델 | frozen6/6;2차3쌍;$0.02669912/29.8초 | 모집단 성능·반응률·독립 gold 아님 |
| 실제 연락 준비 모델 | 50개 정보/과거11질문, 역할 한정 예외:2/2;$0.00212126/47.14초 | 최종 문구·답변 저장·음성 전체 flow 아님 |
| 실제 후보자 회사 소개 | 마지막 Terra run2/2 및 전체 원문 Codex 검토 | 앞선 Luna run의 기간 오류를 기록. 기존 실제3쌍 전체 재검증 아님 |
| 실제 회사 대화 | frozen v8,7변형8턴 실행/원문 검토 | 새 전달 projection·검색 이력 context 전용 challenge 없음 |
| 전체 TypeScript | 실패: generated Next validator, ignored 과거 eval scripts, 별개 UI2곳 | 이번 수정한 matching/Tasks/report 파일의 오류는 출력되지 않음. 전체 build 성공으로 표시하지 않음 |
| 전체 Career 번역 검사 | 기존 원문 불일치4개/누락1개로 실패 | 이번 추가 priority review키는 한·영 직접 작성/검사에 오류 없음. DB 번역 sync 미실행 |
| diff whitespace | 양쪽 repository `git diff --check` 통과 | release 검증이나 배포를 의미하지 않음 |

평가의 개별 근거: [fit/연락 준비](../evaluation/unified-talent-role-fit/reports/2026-10-07-local-challenge.md), [회사 소개](../evaluation/company-candidate-introduction/reports/2026-10-07-unified-presentation.md), [회사 대화](../evaluation/company-side-conversational-qa/reports/2026-10-07-unified-matching.md), [반응률 평가 계획/runner](../evaluation/recommendation-feedback-outcomes/README.md).

## 6. 평가·출시에서 아직 입증되지 않은 것

읽기 전용 inventory의 내부 추천 원장은3,089행이고14일 성숙 전체는2,464행이다. 최근 분석 후보군은1,519행/1,060후보자/34역할/10workspace지만, 이 행 수가 곧 검증된 실제 전달 episode 분모는 아니다. 해당 snapshot1,519건의 user_brief는 모두 비어 있어 당시 전체 입력으로 정책을 재실행할 수 있다고 가정하면 안 된다. 현재 feedback 값478/138도 명시 출처·실제 전달·중복 정제 전이므로 긍정/부정률로 보고하지 않았다.

Gold·episode identity·관측 coverage를 검토한 뒤 label을 동결해야 한다. 새 정책이 더 좋은 반응을 냈다는 결론, 온라인 실험, 운영 migration 적용, production scheduler/worker 전환, 브라우저·음성 전체 흐름은 아직 검증/실행되지 않았다.

이 문서는 누락 목록을 줄여 보이기 위해 목표를 완료로 바꾸지 않는다. 2절 구현 차이와 5·6절 검증 경계가 닫히기 전에는 ‘빠진 것 없이 완벽하게 구현’ 또는 ‘배포 준비 완료’라고 보고하지 않는다.

## 7. 2026-10-07 후속 사용자 결정

Internal-only의 proactive 질문은 의미가 같은 조건을 묶은 뒤 2개 이상일 때만 검토하고 실제 질문 발송 간격은 최소30일, 한 메일의 질문은 최대5개다. 개수를 채우려고 질문을 나누지 않는다. 후보자의 일반 수락 후 Harper 팀원이 검토하는 단계는 없다. 잠시 후 로컬 agent가 소개를 준비·전달하며, 공개 FAQ·회사 화면·Slack·프롬프트의 팀원 최종 확인 설명을 제거했다. 이는 로컬 변경이며 배포 사실을 뜻하지 않는다.

후속 변경 검증: 관련 Python 240개와 7 subtests, scheduler 대상 검사1개, Slack helper5개 통과. 숫자 경계(묶음1개/2개, 월간 미도래, 최종 질문5개/6개)를 확인했다. 회사 대화 v10은 실행3/3·의미2/3이며 별도 회사 Intro 상태 설명 오류를 평가 보고서에 기록했다. 이번 변경은 실제 브라우저·음성·회사 전달 검증이 아니다.

추가 TS 검증은 전체 통과가 아니다. 기존 priority guidance의 문구 assertion2개가 실패했고 해당 구현 파일은 이번에 수정하지 않았다. PriorityReviewTool 테스트는 존재하지 않는 과거 migration 파일을 읽어 시작하지 못했다. ReviewExecution은 로컬 dummy Supabase 설정으로 다시 실행한 뒤1/4 통과, 나머지3개는 기존 fake DB가 통합 view(`talent_role_fit_with_selection_v1`, `talent_effective_opportunity_recommendations_v1`)를 지원하지 않아 실패했다. 이 기존 fixture/문구 검증을 이번 안내 수정에 맞춰 임의로 통과 처리하지 않았다.


## 2026-10-07 추가 실제 모델 검사

공통 fit v1 6쌍과 회사 안내 v10 3턴을 재실행했다. 최종 메일의 합성 5건도 V2 production prompt,
호출, 후처리로 실행하면서 질문 기록용 optional schema/Anthropic 허용 field의 누락을 발견해 수정했다.
메일에 질문을 써도 발송 이력용 ref가 빠지는 문제였으며 질문 action에서 해당 필드 누락 시 발송에
사용하지 않도록 검증했다. 실제 질문 수·국가 묶음과 저장/수락 의미는 원문 검토했다.
회사 안내의 두 수락 경로 혼동, 후보자의 대화 언어를 회사 업무 언어로 추정하는 문제,
external 1개 선택을 무조건 탐색 부족으로 말하던 지침도 보완했다.

정확한 재현 계약과 실패·재시험 결과는 `docs/evaluation/final-delivery-generation/README.md`,
`docs/evaluation/company-side-conversational-qa/reports/2026-10-07-unified-matching.md`,
`docs/evaluation/unified-talent-role-fit/README.md`에 기록한다. 운영 발송/DB 변경/배포는 하지 않았다.
앞의 미구현·미검증 항목 전체를 완료로 바꾸는 결과는 아니다.


### 프롬프트 변경 범위 구분

| 범위 | 이 통합 매칭 작업에서 수정한 내용 |
| --- | --- |
| External 검색·fit·rerank prompt | 검색·적합성·순위 기준은 수정하지 않았다. 현재 checkout의 external scorer 모델·cache key 교체는 이번 문구/질문 수정 이전부터 있던 별도 변경이다. |
| V2 final mail 공통 | 후보자 선호를 회사 사실로 간주하지 않도록 근거 출처를 명확히 했다. 기존 문체·메일 구성 계약은 유지했다. |
| External 최종 안내 | 한 개 이하라는 이유만으로 항상 추천 부족을 말하던 기존 지침을 실제 요청/선택 수에 따른 안내로 수정했다. |
| Internal 추천·후속 연락 | 저장 선택지, 수락 후 소개의 의미, 팀원 승인 전제 제거, 실제 근거에 기반한 이점 설명을 반영했다. |
| 질문 연락 | 2개 이상 묶음·internal-only 30일·최대 5개와 실제 질문 ref 기록. V2 schema, provider schema, JSON repair 및 발송 전 구조 검증까지 연결했다. |
| Career·email reply·회사 안내 | 팀원 검토 안내를 제거하고, 실제 과거 질문 조회/응답 반영 및 수락 경로의 상태 차이를 반영했다. |
| Legacy/shared mail prompt | `opp/utils/new_prompts.py`의 내부 인계/사람 확인 전제를 제거했다. External 평가 기준을 변경한 것은 아니다. |

회사의 요금제 등 같은 파일에 섞여 있는 별도 작업의 변경은 이번 매칭 수정의 일부로 간주하지 않는다.

## 2026-10-07 모델 입력을 읽기 쉬운 텍스트로 분리

통합 매칭에서 추가한 LLM 호출은 저장용 구조체와 별도의 입력 표현을 사용한다.
`harper_worker/opp/matching/text.py`가 단계별 자료를 구성하고
`opp/utils/llm_input_text.py`가 제목·항목별 목록·여러 줄 본문·날짜를 표현한다.
모델 출력과 DB 저장은 기존 구조화 계약을 유지한다.

| 호출 | 모델이 읽는 입력 |
| --- | --- |
| 공통 1차·2차 fit | 후보자별 Profile·전체 Brief·Behavior, 역할별 회사/채용 근거, 정확한 pairRef 목록. 같은 후보자·역할의 본문은 배치 안에서 한 번만 제공한다. |
| 온보딩·refresh 선정 | 후보자 context, 역할별 fit/이유, 직접 우선 검토 요청 역할 목록 |
| 회사 검색 계획·SQL 수정 | 회사·역할·최근 실행·검색 schema·오류를 구분한 기존 문서 본문 |
| 회사 후보 압축·최종 rerank | 후보자와 역할별 근거, 명시 요청, 가능한 경로를 항목별 표시 |
| 후보자 연락 선정 | 이미 선택된 기회와 최근 추천·응답을 구분한 문서 |
| 질문 준비 | 후보자 context, 부족 정보, 실제 과거 질문을 기존 bounded batch 단위로 표현 |
| 회사용 소개·criteria 작성 | 회사 공유용 Profile과 회사·역할 사실, criterionRef별 기준. 비공개 Brief·후보자 Behavior·내부 판단 이유는 넣지 않는다. |
| 회사 Slack 작성 | 공개 가능한 소개·역할·상태를 구분한 문서 |

Company-first의 과거 scorer 호환 경로도 같은 텍스트 전송 계약을 사용한다.
`JsonLlmClient`는 문자열 본문을 그대로 provider user message에 넣는다. 문서를 다시
`{"document": "..."}`로 감싸지 않으며 구조 복구 재시도도 같은 텍스트를 재사용한다.
기존 mapping 입력을 쓰는 다른 호출과 Anthropic의 기존 profile cache block은 유지한다.

시간대가 있는 timestamp는 분 단위 KST로 표시한다. 날짜만 있는 값과 연/월까지만 알려진
경력 날짜는 원래 정밀도를 유지한다. 시간대나 종료일을 모르면 현재 재직·UTC라고 추정하지 않는다.
목록·Brief·여러 줄 근거는 이 변환 과정에서 요약하거나 자르지 않는다. 입력 표현 version을
fit·선정·질문 준비·소개 cache fingerprint에 포함하되 기준 날짜가 바뀌었다는 이유만으로
캐시를 무효화하지 않는다.

관련 입력/전송/매칭 검사 97개 통과. 추가 기존 worker 회귀 검사는 370개와 3 subtests 통과,
`NewHarperConfigContractTest.test_prompts_explain_shortlist_and_recommendation_fields` 1개 실패다.
해당 검사는 이번에 수정하지 않은 legacy final prompt에 `"active 상태"`라는 정확한 문자열을
요구한다. 이 실패를 통과시키려고 prompt나 관련 테스트를 변경하지 않았다.
실제 모델 결과는 `docs/evaluation/unified-talent-role-fit/README.md`에 기록한다.
이 변경은 로컬 구현이며 DB 변경·메시지 발송·배포를 하지 않았다.
