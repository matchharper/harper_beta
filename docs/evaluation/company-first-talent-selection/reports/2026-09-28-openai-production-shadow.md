# OpenAI production read-only pilot — 2026-09-28

사용자가 지정한 한국 FDE 역할 하나에 canonical `opp.company_first_search.shadow.run_role_shadow`와 production scorer/reranker/writer를 실행했다. 회사·후보자 식별자와 원문은 ignored run 폴더에만 보존한다. 독립 팀원 gold가 없는 `v2-pilot`이며 배포 gate 통과나 대표 표본 정확도를 의미하지 않는다.

## 실행 결과

- 서로 다른 후보 117명의 유효한 scoring 결과를 확보했다.
- 초기 기본 검색: 100명 조회 → 79명 평가 시도 → 74명 성공·5명 실패 → rerank 10명 → 선정 6명. 실패 5명은 별도 재시도에서 모두 복구됐다.
- 수정 SQL: 100명 조회 → 83명 eligible. Frozen packet 45개·score 41건을 재사용하고 42건을 scoring했다. 38명 성공·4명 실패 후 보완한 계약으로 4명 모두 복구했다.
- 최종 83명 중 구조적 하한을 통과한 8명을 rerank에 넣었다. 역할별 상한 12명은 유지했다. 같은 입력을 두 번 실행해 5명/6명이 선정됐으며 5명은 공통이었다. Live guard 제외는 0명이었다.
- 과거 동일 역할의 서류탈락을 이유로 후보자가 거절한 경계 사례가 첫 실행에서는 보류, 두 번째에서는 회사 재검토 확인 대상으로 선택됐다. 판단의 일관성이 완전히 확보됐다고 보고하지 않는다.
- 마지막 회사 문안에는 기존 면접·서류탈락 이력과 재접촉·재검토 확인이 포함됐다. 첫 실행의 일부 문안에서는 기존 면접 이력이 전달되지 않았다. 언급을 강제하는 규칙은 추가하지 않았으며 정보 전달 일관성에는 개선 여지가 있다.

## 모델·재현·비용

Planner/scorer/Behavior는 OpenAI GPT 5.6 Luna, reranker는 GPT 5.6 Terra xhigh, writer는 Terra high다. 직접 OpenAI endpoint만 사용했고 다른 provider fallback은 비활성화했다. 계정의 기존 데이터 보존 설정은 변경하지 않았다.

Canonical runtime은 Worker에 두고, private wrapper는 모델/provider 제한, 100명 budget, 캡처한 모델 SQL 재생, 동일 run의 frozen packet/score 재사용만 담당한다. 운영 DB의 score cache를 변경하지 않았다. 초기 실행·수정 SQL 실행·복구·재실행을 별도 artifact로 보존했으며 기존 frozen dataset과 gold를 수정하지 않았다.

기록된 토큰 비용은 **$0.70587515**다. 초기 실패 5+4건은 당시 scorer가 실패 호출 usage를 버렸으므로 실제 청구 총액의 완전한 집계가 아니다. 해당 누락은 수정했지만 과거 usage를 소급 복구하지는 못했다. 중단한 중복 검색의 비용도 로그에서 합산했다.

Private manifest에는 provider/endpoint, 모델별 설정, dirty revision/source hashes, source snapshot, 입력·출력 hash, 실제 stage input, token usage, 재사용 범위, 중단과 재시도 이력을 남겼다. 로컬 private 데이터 없이는 clone만으로 완전히 재현되지 않는다.

## 발견한 문제와 수정

1. 전역 SQL alias map이 안쪽·바깥쪽의 동일 별칭을 혼동하던 문제를 SQL scope별 검증으로 수정했다. 민감 컬럼·미허용 테이블과 relation이 projection하지 않은 컬럼은 계속 차단한다.
2. 안전한 `concat_ws` 및 projection의 실제 UUID 컬럼을 이용한 정렬 tie-break를 허용했다.
3. Planner에 `talent_extras.content`가 JSON임을 명시했다. 모델의 execution-time repair로 cast를 보완한 SQL을 운영 DB에서 검증했고 최종 검색은 fallback 없이 100명을 조회했다.
4. `companyFit=null`을 실제 관찰해 회사 기준 목록 유무와 세 fit 필드의 필수 enum 계약을 구분했다. 의미 판단이나 상태를 deterministic 값으로 덮어쓰지 않았다. 이전 오류 사례의 v6 반복 시험 2/2는 첫 호출에서 통과했고, 이후 실패 4건의 v6 재시도도 모두 통과했다.
5. Scorer가 실패의 오류·usage를 누락하던 부분과 shadow가 실패율 중단 전에 checkpoint를 남기지 않던 부분을 수정했다.
6. 이메일 수락 단위 테스트의 Slack mock 누락을 수정했다. 이후 검증에서는 외부 네트워크 호출 0건을 확인했다.

Worker targeted test 230개, 웹·회사 에이전트 test 74개 통과. 격리 PostgreSQL의 30일 경계, LIMIT 이전 eligibility, 중복 row 처리, Intro supersession, acceptance handoff, 멱등성·권한 및 두 동시 요청 순서의 경합 테스트도 통과했다.

## 한계

Read-only pilot이므로 recommendation/ready 생성, 후보자 메시지·이메일, Slack 발송, 브라우저 왕복 E2E는 수행하지 않았다. 운영 코드나 모델 설정을 배포·변경하지 않았다. 운영 기본 scorer provider의 품질을 이번 OpenAI 결과로 대체해 주장하지 않는다.

대량 scoring은 기존 v5 계약으로 실행됐고 v6는 실패 사례 재시도와 별도 반복 시험으로 검증했다. 비용을 줄이기 위해 117명을 새 prompt로 모두 다시 평가하지 않았다. 최초 실패 5건의 정확한 원인은 이전 오류 로깅 누락으로 확정할 수 없으며, 재시도에서 관찰된 null 오류가 최초 모든 실패의 원인이었다고 단정하지 않는다.

회사 재검토 가치에 대한 경계 판단과 이력 전달의 변동은 그대로 기록했다. 30일 재사용·상태 전환의 격리 DB 검증을 실제 운영 발송 검증으로 해석하지 않는다.
