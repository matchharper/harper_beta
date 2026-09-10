# 특정 Internal Role 추천 후보 직접 탐색·평가 기준

- 문서 기준: 2026-09-08
- 상태: 로컬 Codex가 특정 Role의 후보 목록을 직접 만드는 실행 계약
- 기본 실행 결과: 추천·발송 없이 `talent_opportunity_fit`에 바로 옮길 수 있는 검토 결과
- 평가 단위: `talent_id × 실제 role_id` 한 쌍
- 기본 retrieval 상한: 150명의 unique 실제 사람

## 0. 먼저 확인할 정본과 적용 순서

이 문서는 2026-09-08 현재 여러 경로에 흩어져 있는 운영 규칙을 Role-first 직접 검토 작업으로
조합한 실행 계약이다. 실행 시점에 코드가 바뀌었을 수 있으므로 아래 파일을 다시 읽고, 충돌하면
**실제 배포된 현재 코드와 DB 계약**을 우선한다.

| 성격 | source | 이 문서에서 가져오는 내용 |
| --- | --- | --- |
| 현재 운영 정본 | `../../../harper_worker/opp/utils/internal_fit.py` | A/B/C, 위치 관례, hold, score·label projection, one-company-one-recommend, 저장 normalization |
| 현재 Talent context 정본 | `../../../harper_worker/opp/agentic/user_context.py`, `../../../harper_worker/opp/agentic/talent_context.py`, `../../../harper_worker/utils/talent_location.py` | profile·Brief·Memory 구성, location 우선순위, 현재 interaction 제외 |
| Career Memory 설계 계약 | `../talent-unified-memory-implementation-plan-ko.md` | Brief와 Memory의 의미·source 경계. 실제 구현 여부는 위 runtime 코드로 확인 |
| 현재 Role context 정본 | `../../../harper_worker/opp/utils/new_role_cards.py`, `../../../harper_worker/opp/utils/new_role_search.py` | Role card, `sourceRoleId`, `countryCode`, 회사·Role 정보의 구분 |
| 현재 안전·lifecycle 정본 | `../../../harper_worker/opp/utils/internal_role_safety.py`, `../../../harper_worker/opp/utils/internal_stage_context.py`, `../test-internal-role-isolation-ko.md` | test-only 차단과 authoritative same-company stage |
| 현재 DB 계약 | `../../src/types/database.types.ts`, `../../supabase/migrations/20260901122000_internal_role_candidate_visibility.sql` | 저장 column, candidate-visible, pending reconsideration 조건 |
| Regression 근거 | `../../../harper_worker/tests/test_internal_fit.py`, `../../../harper_worker/tests/test_internal_fit_same_company_asof_replay.py` | 전 Role coverage, 위치 관례, 현재 회사, same-company history, one-recommend가 유지되는지 확인 |
| Role-first 실행 참고 | `../../scripts/company_role_recurring_matching.py` | 150명 회수, 전체 packet, identity dedupe, source fingerprint, transaction·human override 보호 |
| 과거 운영·복구 감사 참고 | `../../scripts/internal-company-role-talent-matching-manual-ko.md`, `../company/company-role-fit-recovery-audit-overview-ko.md`, `../company/company-role-fit-recovery-audit-codex-runbook-ko.md` | 직접 전수 검토에서 반복된 실패와 위치 evidence의 엄격한 판독 방식 |

다음 파일은 이름이 비슷해도 이 작업의 현재 정본이 아니다.

- `../../../harper_worker/opp/utils/internal_fit_prompt_candidate.py`는 다음 prompt 평가를 위한
  candidate/evaluation 파일이며 현재 production internal-fit 경로에서 import하지 않는다. 이 파일의
  더 엄격하거나 다른 label 규칙을 현재 A/B/C 계약에 몰래 섞지 않는다.
- `company_role_recurring_matching.py`와 과거 수동·복구 문서의 holistic label이나 옛 2축 판단은
  현재 A/B/C보다 우선하지 않는다. 대신 전수 읽기, 원문 packet, fingerprint, transaction 같은
  검토·저장 안전장치를 가져온다.
- 과거 특정 회사·직무용 preparer, SQL, keyword와 quota는 사례 자료다. 새 Role에 그대로 복사하지
  않고 Role의 실제 핵심 업무에 맞춰 retrieval을 새로 설계한다.

현재 Worker의 1차 prefilter는 한 talent에게 같은 회사의 여러 Role을 볼 때 `pass=true`를 최대 6개로
제한한다. 이 제한은 **Role 하나에서 이미 고정한 150명 중 일부만 보는 근거가 아니다.** 이 문서에서는
고정된 talent pool 전원을 full direct review한다.

## 1. 이 문서를 언제 쓰는가

사용자가 다음과 같이 특정 internal Role을 정하고 추천 제안을 보낼 사람을 찾아 달라고 하면 이
문서를 처음부터 끝까지 따른다.

```text
이 internal Role에 추천 제안을 보낼 만한 talent 목록을 만들어 봐.
role_id=<company_roles.role_id>
```

이 문서는 정기 Worker가 한 talent에게 여러 Role을 평가하는 일반 경로와 반대 방향의 작업을
정의한다. **Role 하나에서 출발해 최대 150명의 서로 다른 talent를 넓게 찾고, 현재 대화의 Codex가
그 전원의 실제 데이터를 텍스트로 읽어 A/B/C와 `recommend`를 직접 판단한다.** 검색 SQL이나 기존
fit 점수만으로 사람을 고르지 않는다.

좋은 결과는 추천 수를 채우는 것이 아니다. 아래가 모두 성립하는 사람만 최종 목록에 들어간다.

1. Role의 핵심 일을 실제로 수행할 수 있다.
2. Talent가 이 기회를 진지하게 검토할 가능성이 있다.
3. 회사가 이 talent를 인터뷰할 구체적 이유가 있다.
4. 같은 회사의 다른 Role까지 보았을 때 지금 먼저 제안할 한 Role이 이 Role이다.

적합한 사람이 없으면 0명이 정상 결과다.

## 2. 과거 실행에서 반복해서 확인된 원칙

이 계약은 과거 SBVA, Wonderful, 초기 스타트업의 운영·마케팅·세일즈 Role 등에서 후보를 직접
찾았을 때 반복해서 확인된 다음 원칙을 현재 internal-fit A/B/C 계약에 맞춰 정리한 것이다.

- 처음에는 Role별 SQL로 **최대 약 150명의 unique talent**를 넓게 회수한다.
- 150명은 quota가 아니다. 무관한 사람을 넣어 150명을 채우지 않는다.
- 검색 keyword와 retrieval score는 놓치지 않기 위한 index일 뿐, fit 판정이 아니다.
- 상위 몇 명만 보고 끝내지 않는다. 이번 run의 retrieval pool로 확정한 사람은 전부 텍스트화하고
  한 명씩 직접 읽는다.
- Role과 직접 같은 title만 찾지 않는다. 실제로 같은 결과를 만든 adjacent function과 전이 가능한
  경험도 회수한다.
- 반대로 여러 경력에 흩어진 일반 단어가 우연히 합쳐진 것만으로 관련 경력처럼 만들지 않는다.
  핵심 function, ownership, 결과가 같은 경력이나 프로젝트 안에서 연결되는지 확인한다.
- 프로필만 보지 않는다. Search Brief, Memory, 추천 반응, 회사별 진행 결과와 필요한 대화 원문을
  함께 본다.
- 회사가 좋아할 사람과 talent가 좋아할 기회를 별도로 판단한다. 한쪽의 강점으로 다른 쪽의
  충돌을 상쇄하지 않는다.
- 같은 사람의 중복 계정이 retrieval slot을 두 번 차지하지 않게 한다.
- 최신 사용, 빠른 응답, 다른 회사의 진행은 보조 근거다. 핵심 Role fit을 대신하지 않는다.
- 회사가 준 최신 조건과 오래된 공개 공고가 다르면 섞지 않는다. 충돌을 `unknown`으로 남기고
  source와 시각을 구분한다.
- 다른 Role이 더 좋다는 이유로 현재 Role의 A/B/C를 낮추지 않는다. 그 비교는 마지막
  `recommend`에서만 사용한다.

### 2.1 과거 “먼저 150명” 실행에서 얻은 구체적 교훈

과거 direct-review 실행에서는 첫 query가 정확히 150명을 만들었지만, 서로 다른 경력에 흩어진
일반 단어를 한 candidate의 관련 경험처럼 합산한 false positive가 발견됐다. Query를 “같은
experience 안에서 핵심 function과 evidence가 연결될 것”으로 교정하자 실제 관련 pool이 72명으로
줄었다. 이때 수를 다시 150명으로 채우지 않았고, duplicate identity를 제거한 뒤 72명 전원의
텍스트 packet을 현재 Codex가 읽었다.

여기서 고정할 교훈은 숫자가 아니라 절차다.

- 첫 결과가 150명이라는 사실은 query 품질의 증거가 아니다.
- 상위 sample을 읽어 false positive 구조를 찾은 뒤 전체 query를 고친다.
- 교정 후 150명 미만이면 그대로 확정한다. 관련성 기준을 낮춰 padding하지 않는다.
- 5~10명 단위 검토는 checkpoint일 뿐 중단 조건이 아니다.
- 추천자가 충분히 나왔어도 fixed pool의 마지막 사람까지 같은 rubric으로 읽는다.

## 3. 실행 범위와 권한

### 3.1 기본 모드

사용자가 목록 작성만 요청하면 `report_only`다.

- production DB는 read-only로 조회한다.
- private run artifact에는 저장 가능한 결과를 남길 수 있다.
- `talent_opportunity_fit`, recommendation, delivery, progress, tag는 변경하지 않는다.
- 후보자나 회사에 메시지를 보내지 않는다.

사용자가 같은 요청에서 `talent_opportunity_fit에 저장`, `fit까지 반영`처럼 명시하면
`commit_fit`으로 실행할 수 있다. 이 경우에도 recommendation row 생성과 연락은 하지 않는다.

`추천 제안 보낼 사람 목록`이라는 표현은 **보낼 대상의 목록을 만들라는 뜻**이지 실제 발송
권한이 아니다. 실제 추천 생성·이메일·채팅 발송은 사용자가 그 실행에서 명시해야 하며 이 문서의
기본 범위 밖이다.

### 3.2 입력

필수 입력은 `role_id` 하나다. 사용자가 원하는 최종 인원 상한을 말했다면 `max_recommendations`로
기록한다. 숫자를 말하지 않았으면 기준을 통과한 사람을 억지로 줄이거나 늘리지 않는다. 요약 화면에는
상위 후보를 보여 주되 private artifact에는 전체 결과를 남긴다.

이번 요청에만 적용할 Role 설명이나 추가 조건이 있으면 `additional_instruction`으로 source에
그대로 보존한다. 이 값은 privacy, 보호 특성, test-only 격리, 명시적 opt-out을 무효화할 수 없다.

## 4. 판단 source의 우선순위

충돌할 때 다음 순서로 해석한다.

1. 안전·법적·동의·privacy와 test-only 격리
2. 이번 실행에서 사용자가 명시한 Role 관련 지시
3. `company_internal_roles.request`와 `criteria`
4. `company_roles`의 현재 JD, 위치, 근무 방식, 고용 형태, seniority, 보상
5. `company_workspace`의 회사 설명, pitch, request
6. 같은 Role과 같은 회사에서 나온 실제 추천·수락·거절·진행·메모
7. 공식 회사·채용 자료
8. Role title이나 업계 관행에서의 조심스러운 추정

현재 원문보다 과거 실행 메모나 기존 fit reason을 우선하지 않는다. 이전 판단은 참고 evidence이며
이번 판단의 정답이 아니다.

Candidate 안에서 source가 충돌하면 다음처럼 해석한다.

- 최신의 명시적 직접 진술과 Role-specific 답변이 오래된 추정보다 우선한다.
- Search Brief는 현재 탐색 기준, Memory는 지속 맥락이다. 둘이 충돌하면 날짜·명시성·대화 의미를
  읽어 판단하며 keyword나 importance 숫자로 자동 승자를 정하지 않는다.
- Resume와 structured experience가 다르면 source 시각과 더 구체적인 원문을 확인한다. 회사 전체의
  성과를 candidate 개인 성과로 바꾸지 않는다.
- 반복된 실제 like/dislike/수락/거절 이유는 선호 evidence가 될 수 있지만 한 번의 무응답이나 delivery
  실패는 선호가 아니다.
- 기존 model label·score·reason은 이전 판단 기록이다. 이번 원문 검토를 대신하지 않는다.

## 5. Phase 0: Role과 회사 snapshot 고정

먼저 다음을 확인한다.

- `role_id`가 존재하고 `source_type='internal'`이다.
- `information.testOnly=true`가 아니며 보조 test fixture 표식에도 걸리지 않는다.
- `status='active'`, `is_expired=false`이고 `expires_at`이 지나지 않았다.
- `company_internal_roles`와 `company_workspace`가 정확히 연결된다.
- JD, request, criteria, location, work mode, employment type, seniority, compensation을 읽을 수 있다.
- 현재 company behavior/context가 있으면 source hash와 함께 읽고, Role request와 충돌하는지 구분한다.

inactive, ended, deleted, expired Role이면 추천 후보 목록을 확정하거나 fit을 저장하지 않는다. Paused
Role을 사용자가 정확히 지목해 분석을 원하면 read-only 참고 목록은 만들 수 있지만
`recommend=true` 저장 후보로 확정하지 않는다.

Role, request, criteria, company context 원문의 content hash와 `updated_at`을 시작 시점에 기록한다.
저장 직전에 다시 확인해 평가 도중 source가 바뀌었으면 영향을 받은 후보를 새 기준으로 다시 읽는다.

`information.testOnly=true`가 canonical test 표식이다. 여기에 더해 현재 safety helper가 막는 과거
`test_only`, `isTest`, test provider/job ID, 명백한 fixture 이름도 fail-closed로 확인한다.
`information.testTalentIds`는 회사 측 E2E의 전용 fixture recommendation만 허용할 뿐, 이 direct-fit
실행에 test Role이나 실제 talent를 넣을 권한이 아니다.

### 5.1 실제 Role ID, Role family와 target 국가

평가와 저장 단위는 언제나 사용자가 지정한 **실제 `company_roles.role_id`**다.

- `information.sourceRoleId`가 유효한 UUID로 명시된 경우에만 공통 JD를 가진 authoritative family로
  묶을 수 있다. 제목이 비슷하다는 이유로 Role을 합치지 않는다.
- Family의 shared JD는 한 번 읽어도 되지만 각 variant의 `roleId`, `location`, `countryCode`,
  `workMode`, `employmentType`, seniority, compensation, request와 criteria를 보존한다.
- Variant field가 shared source와 충돌하면 그 실제 variant의 값이 우선한다.
- `sourceRoleId`나 임의 `roleGroupId`에 fit을 저장하지 않는다. 실제 variant `roleId`별로 평가한다.
- Target 국가는 먼저 `company_roles.information.countryCode`와 Role의 `location_text`에서 확정한다.
  둘이 충돌하거나 국가를 식별할 수 없으면 임의로 회사 본사 국가를 넣지 말고 `unknown`으로 둔다.
- `company_db.location`과 회사 workspace의 location은 회사 배경 정보다. Role target 국가나 후보가
  실제 근무한 국가를 대신하지 않는다.

`searchRank`, FTS 점수, `company_workspace.test_score` 같은 company score는 retrieval·동점 정렬용이다.
A/B/C나 reason의 evidence로 쓰지 않는다.

### 5.2 Pending capacity와 실행 가능 상태

`company_internal_roles.max_pending_talents`와 최신 `내부:연결대기` talent 수를 preflight에서 읽는다.

- `commit_fit`에서는 현재 pending 수가 한도 이상이면 현재 운영 실행기와 같이 새 search와 fit write를
  시작하지 않는다. 사용자가 정확한 범위와 예외를 새로 승인하지 않았다면 `capacity_blocked`로 끝낸다.
- `report_only`에서 사용자가 분석 preview를 명시했다면 읽기 전용 검토는 계속할 수 있다. 이때 결과는
  `proposal_ready=false`, `capacityBlocked=true`로 보고하며 곧바로 보낼 목록이라고 표현하지 않는다.
- Pending은 회사의 수락이나 거절이 아니다. 단지 현재 파이프라인 수용량 guard다.

### 5.3 Role consideration 작성

검색 전에 한 페이지 이내의 Role consideration을 만든다. 기존 request를 기계적으로 복사하지 말고
다음을 구분한다.

- 핵심 업무: 이 사람이 실제로 만들어야 할 결과
- hard requirement: 명시적 충돌이면 Role을 수행할 수 없는 조건
- company interview bar: 수행 가능성과 별개로 회사가 인터뷰할 수준이라고 볼 근거
- candidate-facing facts: talent가 수락 여부를 판단할 위치, 근무 방식, 보상, 회사 단계, scope
- plus signal: 있으면 더 좋지만 없다고 탈락시키지 않을 근거
- unknown: source가 없거나 서로 충돌해 확인되지 않은 내용
- 같은 회사 history 중 이 Role에도 실제로 전이되는 기준

Company criteria는 C 판단의 중요한 source지만 단순 평균표가 아니다. 일부 criterion이
`uncertain`이어도 전체 회사 인터뷰 근거가 강할 수 있고, 모든 criterion이 좋아 보여도 A나 B의
충돌을 덮을 수 없다.

## 6. Phase 1: 최대 150명의 unique talent 회수

### 6.1 150명의 의미

기본 retrieval 목표는 **최대 150명의 서로 다른 실제 사람**이다.

- 관련 후보가 43명이면 43명에서 멈춘다.
- 150명 limit에 닿으면 다음 후보가 더 있을 수 있음을 manifest에 남긴다.
- 150명을 얻으려고 hard requirement를 풀거나 무관한 function을 추가하지 않는다.
- 최종 추천 인원이나 `max_recommendations`에 도달해도 retrieval pool 평가를 조기 종료하지 않는다.

같은 이메일 identity, 동일 LinkedIn URL, 명백히 같은 이력과 profile을 가진 중복 계정은 하나의
사람으로 묶는다. 원 이메일은 보고서에 노출하지 않고 hash나 canonical account ID로만 중복 근거를
남긴다. 같은 identity의 어느 계정에라도 privacy 차단이나 동일 Role 추천 이력이 있으면 다른 계정으로
우회하지 않는다.

Pool을 확정한 시점을 manifest에 기록한다. 5~10명 batch는 context 관리용 checkpoint일 뿐 별도
sampling이 아니다. 이미 확정한 150명 중 “상위 N명만”, “score 80 이상만”, “첫 batch에서 추천자가
나올 때까지만” 보는 실행은 금지한다. 중간 결과는 `partial`일 뿐 완료 결과가 아니다.

### 6.2 포함 lane

Role에 따라 SQL은 달라져야 하지만 최소 다음 lane을 검토한다.

1. 핵심 function과 결과를 직접 수행한 사람
2. 인접 function에서 같은 underlying work와 end-to-end ownership을 수행한 사람
3. Role의 산업·고객·회사 단계·지역 환경에서 강한 전이 근거가 있는 사람
4. 기존 미평가자 또는 마지막 평가 뒤 matching-relevant profile/Brief/Memory가 달라진 사람
5. 기존 non-fit 중 현재 A/B/C 기준으로 false negative일 가능성이 있고 직접 재검토되지 않은 사람
6. 이미 current `fit`이지만 아직 같은 Role을 제안받지 않은 사람

6번을 빼면 이미 검증된 좋은 후보를 목록에서 놓칠 수 있다. 반대로 동일 Role의 실제 추천이 이미
존재하면 새 제안 대상에서는 제외하고 현재 lifecycle만 보고한다.

### 6.3 hard exclusion

다음은 retrieval 전에 제외한다.

- 삭제된 talent
- `profile_visibility='dont_share'`
- `get_internal_recommendation=false` 또는 그와 동등한 internal recommendation 명시적 opt-out
- 현재 회사를 blocked company로 지정한 talent
- 동일 Role의 실제 추천·열린 연결·terminal 진행 이력이 있어 새 제안이 중복되는 talent
- 활성화된 test-only 격리 규칙에 의해 제외되는 account

Role hard requirement 충돌은 privacy·중복 같은 retrieval hard exclusion과 다르다. 직무 관련성 때문에
pool에 들어온 사람이라면 직접 packet을 읽고 A=`unfit`으로 남겨야 하며, SQL keyword 하나로 미리
제외해서는 안 된다. 그래야 fixed pool 전수 검토와 false-negative audit이 성립한다.

`talent_setting.status='stopped'`는 외부 정기 추천 상태이지 privacy opt-out이 아니다. 이것만으로
internal opportunity에서 제외하지 않는다. `is_onboarding_done=false`도 선택한 internal Role의 의미상
fit을 자동으로 낮추는 근거가 아니다. 다만 실제 추천·전달 경로가 onboarding 완료를 요구한다면
그것은 fit과 분리된 후속 실행 guard로 보고한다. 최근 로그인하지 않았다는 이유만으로도 제외하지
않는다.

### 6.4 SQL 작성과 교정

SQL은 현재 Codex가 Role consideration을 읽고 직접 작성한다. 정규식·keyword는 retrieval recall과
우선순위에만 사용하며 최종 A/B/C 판단을 대신하지 않는다.

Candidate location이 비어 있거나 target과 다르게 보인다는 이유만으로 discovery SQL에서 먼저 버리지
않는다. Remote·relocation 가능성, signup fallback, 학교·실제 근무 위치, 최신 Brief를 packet에서 함께
읽어야 하기 때문이다. 최신 명시적 hard conflict는 retrieval 순위를 낮추는 데 참고할 수 있지만,
fixed pool에 이미 들어온 뒤에는 제외하지 않고 직접 읽어 A/B/C 결과를 남긴다.

1. Role별 직무·인접 경험·환경 신호로 첫 SQL을 작성한다.
2. 상위 10~20명의 실제 경력 텍스트를 읽어 query가 무엇을 잘못 잡는지 확인한다.
3. 일반 단어가 서로 다른 경력에서 합산되거나 핵심 직무가 아닌 사람이 상단을 차지하면 SQL을
   수정한다.
4. 수정한 rubric은 전체 pool에 동일하게 적용하고, 빠진 150번째 다음 사람까지 다시 채운다.
5. 최종 SQL, revision, row count, 중복 수, cutoff score와 lane별 수를 manifest에 남긴다.

가입일과 최근 활동은 동점 정렬 또는 낮은 비중의 delivery 가능성 신호로만 쓸 수 있다. 직무 적합성
점수처럼 사용하지 않는다.

Production을 조회하는 discovery SQL은 read-only transaction에서 한 개의 `SELECT` 또는
`WITH ... SELECT`로 실행하고, 명시적 `LIMIT`과 `talent_id`까지 포함한 안정적인 최종 `ORDER BY`를
둔다. Experience·education join으로 한 talent가 행 증폭되지 않게 먼저 집계한다. 조회 쿼리에
DDL·DML을 섞지 않는다.

### 6.5 Retrieval 결과 고정과 fingerprint

각 후보에는 검색 순서와 이유를 남기되 평가 packet에서는 검색용 파생값을 semantic evidence와
분리한다.

- `retrievalRank`, `retrievalScore`, keyword hit, lane은 “왜 읽게 되었는지”를 설명하는 audit 값이다.
- Candidate matching fingerprint에는 profile, resume, experience, education, Brief, Memory, 관련
  preference·행동과 same-company history처럼 판단을 바꾸는 내용을 포함한다.
- 단순 login 시각, 파일명, 연락처 hash, 조회 시각처럼 fit 의미가 없는 값은 fingerprint 변화의
  원인으로 삼지 않는다.
- Role fingerprint와 candidate fingerprint를 저장 직전에 다시 계산한다. 달라졌으면 해당 pair를
  다시 읽거나 run을 중단한다. 예전 평가를 그대로 복사해 changed candidate를 skip하지 않는다.

## 7. Phase 2: 전원의 데이터를 Worker 형태로 텍스트화

최종 retrieval pool에 들어온 **모든 사람**에게 독립적인 evidence packet을 만든다. 후보 이름,
headline, retrieval score 몇 줄만 보여 주고 판단하지 않는다.

### 7.1 기본 packet

현재 Worker의 canonical builder를 기본 골격으로 쓰고, Role-first audit에 필요한 원문과 위치 evidence를
추가한다. 현재 canonical `profile_full`은 experience 20개, education 12개, extra 12개를 담고, Brief는
최대 40행·8,000자, Memory는 우선순위 상위 12개·6,000자 안에서 고른다. 이 bounded context에서
Role과 관련된 오래된 경력이 잘렸거나 내용이 모호하면 DB 원행과 resume를 추가로 연다. “Worker형”은
필드 이름만 흉내 낸 축약 프로필이 아니라 Worker가 판단할 때 보는 실제 텍스트 수준을 뜻한다.

```json
{
  "user_context": {
    "profile": {
      "identity": {
        "headline": "...",
        "location": "...",
        "bio": "..."
      },
      "experiences": [],
      "educations": [],
      "extras": []
    },
    "search_brief": [],
    "relevant_memories": [],
    "matching_preferences": {}
  },
  "candidate_context": {
    "company": {},
    "roles": [],
    "location_evidence": {
      "targetRole": {
        "countryCode": "KR",
        "locationText": "Seoul, South Korea",
        "workMode": "onsite"
      },
      "candidateCurrent": {
        "value": "Seoul, South Korea",
        "source": "talent_users.location",
        "countryCode": "KR"
      },
      "sameCountryEducation": [],
      "sameCountryEmployment": [],
      "explicitContraryEvidence": [],
      "conclusion": "inferred_local_work_authorization"
    }
  },
  "audit_context": {
    "resumeText": "...",
    "sourceAvailability": {},
    "sourceRows": {},
    "retrieval": {
      "lane": "direct_function",
      "rank": 1,
      "score": 0
    }
  },
  "run_context": {
    "same_company_history": "...",
    "reevaluation_evidence": []
  }
}
```

`user_context.profile`에는 실제 경력·학력·프로젝트의 회사, Role, 기간, 설명, memo를 포함하고,
resume 원문은 private `audit_context.resumeText`로 함께 읽는다. Search Brief는 현재 기회 탐색 기준,
Memory는 이를 해석할 때 필요한 지속 맥락이다. Brief의
모든 active row를 읽고, Memory는 현재 Worker와 같은 중요도·최신성 범위에서 고르되 Role 판단에
필요한 durable fact가 잘린 정황이 있으면 원문을 추가 조회한다. Legacy context만 있는 account라면
conversation summary, insight와 추천 반응을 읽어 같은 의미의 evidence를 누락하지 않는다.

현재 Worker처럼 진행 중인 `current_interaction`은 internal-fit evidence에서 제외한다. 다만 talent가
hold 질문에 답해 durable evidence로 저장됐거나 `run_context.reevaluation_evidence`로 명시된 새 정보는
가장 최신 근거로 사용한다.

### 7.2 Canonical projection에서 빠지는 위치 원문 보강

현재 `user_context.py`의 experience projection은 회사명·Role·기간·description·memo는 담지만
`talent_experiences.company_location`을 담지 않는다. 그러나 DB에는 이 column이 있다. 또한
`talent_educations`에는 별도의 학교 location column이 없다. 따라서 이 direct-review packet은
다음을 명시적으로 보강해야 한다.

| 사실 | 사용할 source | 판독 규칙 |
| --- | --- | --- |
| Candidate 현재 위치 | `talent_users.location` 우선, 없으면 `current_location` 등 signup fallback | `resolve_talent_location`과 같은 우선순위. 최신 값의 원 field도 기록 |
| 실제 회사 근무 위치 | `talent_experiences.company_location` 우선, 같은 experience의 description·resume 보조 | 회사 본사 위치나 회사명만으로 대신하지 않음 |
| 학교 위치 | school·description·memo·resume에서 소재 국가가 명확한 경우 | 별도 location column이 없으므로 불명확하면 unknown |
| Role target 국가 | variant의 `information.countryCode`와 `location_text` | 회사 HQ를 Role 국가로 대체하지 않음 |

위치 문자열의 국가는 직접 읽어 정규화하되 원문과 source row ID를 함께 보존한다. 학교명 자체가
명백히 특정 국가의 캠퍼스를 가리키는 경우는 사용할 수 있지만, 동일 이름의 해외 캠퍼스나 온라인
과정처럼 애매하면 사용하지 않는다. 회사 이름이 어느 나라 회사인지는 candidate가 그 나라에서
근무했다는 증거가 아니다.

`location_evidence.conclusion`의 허용값은 다음과 같다.

```text
explicitly_confirmed
inferred_local_work_authorization
not_inferred
explicitly_conflicted
not_applicable
```

이 구조는 audit용 evidence bundle이다. 새 DB column을 요구하지 않으며 fit row에는 decisive 내용만
reason과 metadata로 축약한다.

### 7.3 추가로 반드시 붙일 history

Role 하나를 기준으로 사람을 역검색할 때도 다음 정보를 별도로 수집한다.

- 동일 Role의 기존 fit, reason, human override와 평가 시각
- 동일 Role 추천·feedback·progress·tag·delivery
- 같은 회사 다른 internal Role의 최신 추천, talent 반응과 authoritative process stage
- 다른 회사 internal Role의 실제 진행 결과 중 이번 판단에 관련된 것
- profile/Brief/Memory만으로 충돌이나 최신성을 판단할 수 없을 때의 관련 raw message
- 운영자가 출처와 함께 확인한 professional fact

후보자 `like`, `dislike`, `candidate_requested_connection`은 후보자 행동이다. 회사의 수락·거절로
해석하지 않는다. 반대로 회사 actor가 남긴 진행·거절을 talent 선호로 바꾸지 않는다.

동일 회사 lifecycle의 최신 stage/tag가 authoritative하다. 최소한 `내부:추천`, `내부:수락`,
`내부:연결대기`, `내부:연결됨`, `내부:보류`, `내부:최종오퍼`, `내부:아카이브`,
`내부:프로세스중단`, `내부:거절`과 custom stage를 구분한다. `내부:수락`은 talent가 제안을
수락했다는 뜻이지 회사가 talent를 수락했다는 뜻이 아니다. 답이 없는 추천을 임의로 수락·거절로
바꾸지 않는다. Role 종료·archive·process stop·talent decline 등 terminal state를 legacy summary의
“pending/accepted” 문구로 다시 활성화하지 않는다.

### 7.4 텍스트화 검증

각 packet에는 source row ID와 관측 시각을 audit metadata로 남기되, 회사-facing reason에는 이를
노출하지 않는다. 배열을 잘라서 중요한 최신 정보가 사라졌으면 원문을 추가로 읽는다. 요약과 원문이
충돌하면 원문과 최신 명시 진술을 우선한다.

Raw profile, 대화, 이메일, 전화번호, private request와 전체 packet은 git에 저장하지 않는다.
ignored `private/` 또는 `runs/` 아래 owner-only 파일로만 두고 실행이 끝나면 보존 필요성을 판단한다.

Packet마다 최소 다음 검증을 통과한다.

- profile과 resume가 있으면 둘 다 읽을 수 있고, experience·education의 source ID가 추적된다.
- target Role full JD, request, criteria, variant location과 근무 조건이 들어 있다.
- Brief·Memory가 해당 run의 동일한 fingerprint snapshot에서 왔다.
- retrieval용 score·keyword hit는 별도 audit block에만 있고 A/B/C evidence처럼 보이지 않는다.
- 위치 판단에 쓴 현재 위치·학교 위치·실제 근무 위치와 반대 evidence가 원문까지 연결된다.
- history는 최신 authoritative stage를 포함하며 talent 행동과 company 행동을 구분한다.
- `behavior_context_version`은 호환 metadata로 남길 수 있지만, 현재 production internal-fit은 이것만으로
  fit을 자동 invalidate하지 않는다. 실제 matching-relevant 내용 또는 fingerprint 변화를 확인한다.

## 8. Phase 3: 현재 Codex가 전원을 한 명씩 직접 읽기

이 단계는 외부 LLM API, Worker model, 다른 Codex task, sub-agent, plugin에 위임하지 않는다. SQL과
deterministic script는 읽기·정렬·중복 제거·형식 검증에만 사용한다. A/B/C, `recommend`, reason은
현재 사용자의 요청을 받은 Codex가 직접 판단한다.

- packet을 5~10명씩 나눠 읽는 것은 가능하지만 모든 packet을 실제로 연다.
- 한 batch마다 candidate ID, 읽은 source 범위, A/B/C, score, reason과 완료 여부를 checkpoint한다.
- 먼저 좋은 사람이 충분히 나와도 남은 pool을 건너뛰지 않는다.
- packet이 비었거나 parsing이 깨졌으면 그 candidate를 낮은 점수로 넘기지 말고 source를 복구한다.
- 평가 중 Role rubric이나 prompt를 바꾸면 앞서 본 사람도 같은 version으로 다시 평가한다.
- 다른 후보보다 약하다는 이유로 개인의 A/B/C를 낮추지 않는다. 모든 후보의 절대 판단이 끝난 뒤에만
  최종 목록의 순서를 비교한다.

한 사람마다 다음 순서로 읽고 private checkpoint에 근거를 남긴다.

1. Resume와 전체 구조화 경력에서 같은 experience 안의 function, ownership, scope, 결과를 확인한다.
2. 학력·프로젝트·자격은 Role에 실제로 필요한 부분과 위치 evidence만 확인한다.
3. 최신 Brief·Memory와 명시적 preference로 B의 찬성·반대 근거를 분리한다.
4. 같은 Role·같은 회사 history와 human override, 최신 stage를 읽는다.
5. Section 9.4의 현재 위치 + 학교/실제 근무 국가 규칙을 별도 체크한다.
6. A, B, C를 독립적으로 고정한 뒤 score와 projected label을 만든다.
7. 같은 회사 sibling을 비교해 마지막에만 `recommend`를 정한다.

Checkpoint의 최소 machine-readable 형태는 다음과 같다. `evidenceRead`는 DB 저장 필드가 아니라
전수 검토를 증명하는 private artifact다.

```json
{
  "talentId": "uuid",
  "candidateFingerprint": "sha256",
  "evidenceRead": {
    "profile": true,
    "resume": true,
    "experiences": true,
    "educations": true,
    "brief": true,
    "memories": true,
    "location": true,
    "sameCompanyHistory": true,
    "roleSource": true
  },
  "reviewStatus": "complete",
  "evaluations": []
}
```

Source 자체가 존재하지 않으면 boolean을 거짓으로 두고 실패시키는 대신
`sourceAvailability.resume="absent"`처럼 구분한다. 존재하는 source를 열지 않은 것과 source가 없는
것을 같은 것으로 처리하지 않는다.

완료 조건은 `retrieved_count = packet_count = directly_reviewed_count = evaluation_count`다. 하나라도
다르면 `incomplete_direct_review`이며 저장 가능한 완료 결과로 보고하지 않는다. Context 한계나 실행
중단으로 checkpoint까지만 만들었으면 다음 실행이 동일 fingerprint를 확인한 뒤 이어 읽을 수 있지만,
마지막 사람까지 끝나기 전에는 `completed`, “추천 목록 완성”, `commit_fit`으로 전환하지 않는다.

## 9. A/B/C 판단

각 후보에 대해 다음 세 질문을 **독립적으로** 판단한다. 같은 사실이 실제로 여러 질문에 답할 때는
여러 축에서 쓸 수 있지만, 원하는 결론을 만들려고 한 축의 강점을 다른 축으로 옮기지 않는다.

### 9.1 A — `roleFit`: 이 일을 실제로 할 수 있는가

질문은 “이 talent가 Role의 핵심 function과 명시적 hard requirement를 객관적으로 수행할 수
있는가?”다.

| 값 | 의미 |
| --- | --- |
| `fit` | 핵심 업무와 hard requirement를 계속 검토할 만큼 직접적인 근거가 있음 |
| `hold` | 다른 조건은 준비됐고 talent가 답할 수 있는 결정적 사실 딱 하나만 없음 |
| `ambiguous` | 가능성은 있으나 여러 핵심 영역의 근거가 간접적·혼합·부족함 |
| `unfit` | 명시적 hard conflict 또는 핵심 function 자체가 분명히 다름 |

Exact keyword보다 underlying work를 본다. 인접 언어·framework·tool이라도 end-to-end 책임과 전이
가능성이 확인되면 exact 이름이 다르다는 이유만으로 hold로 만들지 않는다. 반대로 title, 유명 회사,
도구 사용만 있고 후보자 자신의 ownership과 결과가 없으면 A를 높이지 않는다.

### 9.2 B — `candidateFit`: talent가 받아들일 만한가

질문은 “이 talent의 지속적인 선호와 행동을 보면 이 기회가 받아들일 만하고 만족스러울
가능성이 있는가?”다.

| 값 | 의미 |
| --- | --- |
| `fit` | 최신 명시 선호 또는 강한 최근 행동이 기회와 맞고 중요한 충돌이 없음 |
| `middle` | 관심 가능성은 있으나 혼합되어 있거나 중요한 candidate-facing 정보가 부족함 |
| `unfit` | 명시적 지속 선호, hard constraint, Role/회사 행동과 명확히 충돌함 |

모든 talent가 지금 새 일을 탐색 중이라고 가정한다. 현재 재직, 최근 입사, notice period, 일시적인
availability, search intensity, off-market·pause 진술만으로 B를 낮추지 않는다. 다만 Role 종류,
scope, seniority, 위치·근무 방식, 고용 형태, 보상, 회사·산업 선호와 실제 수락·거절 이유는 본다.

일을 할 능력이 있다는 사실은 그 일을 원한다는 근거가 아니다. 반대로 proposal에서 바로 확인할 수
있는 회사 단계, B2B/B2C, hands-on 정도 같은 선호 하나가 단순히 언급되지 않았다는 이유만으로
강한 양면 fit을 hold로 돌리지 않는다.

이 회사가 talent의 현재 회사, 본인이 창업했거나 현재 운영하는 회사라면 명시적인 사내 이동 또는
새 Role 의향이 없는 한 B=`unfit`이다.

### 9.3 C — `companyFit`: 회사가 인터뷰하고 싶어 할까

질문은 “회사가 준 Role criteria, hiring bar와 지속적인 회사 evidence를 기준으로 이 talent를
인터뷰할 구체적인 이유가 있는가?”다.

| 값 | 의미 |
| --- | --- |
| `fit` | 후보자 자신의 근거가 회사의 알려진 인터뷰 bar를 명확히 넘음 |
| `ambiguous` | 인터뷰 가능성은 있으나 회사 기준에 대한 근거가 간접적·혼합·불완전함 |
| `unfit` | 명시적이고 지속적인 회사 기준에 확인된 부족이나 충돌이 있음 |

A와 C는 다르다. 객관적으로 일을 할 수 있어도 회사의 특별히 높은 bar를 못 넘을 수 있고, 회사가
선호하는 배경이 있어도 Role hard requirement를 충족하지 못할 수 있다.

학교·회사 이름과 현 팀 예시는 caliber를 이해하기 위한 anchor이지 whitelist가 아니다. 후보자 본인의
책임, 성과, progression, demonstrated trust가 동급이면 다른 배경도 인정한다. Brand association
자체를 후보자의 성과로 귀속하지 않는다. 회사 bar 정보가 없다는 이유만으로 C=`unfit`을 주지 않는다.

### 9.4 결측, 위치와 work authorization

결측은 실패가 아니다. 명시적 충돌과 확인되지 않은 사실을 구분한다. 아래는 현재 production prompt의
location convention과 과거 Recovery Audit에서 사용한 source 판독 계약을 합친 **필수 규칙**이다.

> **현지 근로권 간주 규칙:** ① target Role 국가, ② candidate의 현재 profile location 국가가 같고,
> 동시에 ③ candidate가 다닌 학교의 소재 국가 **또는** candidate가 실제로 근무한 회사 experience의
> `company_location` 국가 중 하나 이상이 그 국가와 같으면, 반대 evidence가 없는 한 해당 국가의
> 통상적인 현지 근로 가능성(`ordinary work eligibility`)이 있는 것으로 간주한다.

즉 “현재 위치만 같은 국가”는 이 문서의 직접 검토에서 충분하지 않다. 아래 두 식 중 하나가 참이어야
한다.

```text
role_target_country
  = candidate_current_location_country
  = education_school_location_country

또는

role_target_country
  = candidate_current_location_country
  = experience_actual_company_location_country
```

여기서 `experience_actual_company_location_country`는 **그 candidate가 그 experience에서 실제 근무한
위치**다. 채용 회사의 본사 위치, 과거 회사의 설립 국가, 회사명, 글로벌 office 보유 사실은 대신할 수
없다. 학교도 실제 campus 소재 국가가 명확해야 한다.

| Evidence 상태 | 판단 |
| --- | --- |
| 현재 위치=target 국가 + 학교 위치=target 국가 | `inferred_local_work_authorization`; 근로권 미확인 때문에 hold/unfit 금지 |
| 현재 위치=target 국가 + 실제 근무 위치=target 국가 | 동일하게 간주 |
| 세 국가가 모두 같음 | 위 규칙을 더 강하게 충족하지만 별도 우대점수는 아님 |
| 현재 위치만 같고 학교·실제 근무 위치가 불명확 | 간주하지 않음 |
| 학교나 실제 근무 위치만 같고 현재 위치가 다른 국가 | 간주하지 않음; relocation과 근로권을 별도 확인 |
| 회사 HQ만 target 국가이거나 `Remote/APAC/Global`만 표기 | 간주하지 않음 |
| 현재 위치와 현지 이력이 맞지만 sponsorship 필요·permit 만료·근무 불가가 명시됨 | 최신 명시 반대 evidence가 우선 |
| Role이 정확한 citizenship·clearance·visa class·license를 요구 | 통상 근로권 간주로 대체하지 않고 exact evidence 필요 |

적용 순서는 고정한다.

1. 실제 variant의 `countryCode`와 `location_text`로 target 국가를 확정한다.
2. Candidate 현재 위치를 `location` 우선, 없으면 `current_location` 등 signup fallback 순으로 읽고
   target 국가와 같은지 확인한다.
3. 모든 education과 experience를 읽어 학교 소재 국가 또는 실제 `company_location` 국가가 target과
   같은 evidence를 찾는다.
4. 원문에서 국가가 명확할 때만 `inferred_local_work_authorization`으로 기록한다.
5. sponsorship 필요, permit 만료, 해당 국가 근무 불가처럼 더 최신이고 직접적인 반대 진술을 다시
   확인한다. 있으면 `explicitly_conflicted`가 우선한다.
6. Role의 exact legal requirement가 있는지 마지막으로 확인한다.

학교명·도시·회사 위치에서 국가가 유일하게 식별되는 경우는 사용할 수 있다. 그러나 이름, 외모,
민족, 추정 국적, 일반 언어 사용은 근로권 evidence가 아니다. `Remote`, 여러 국가를 묶은 region,
여행·출장·교환 방문·단기 체류는 현지 학교 또는 실제 근무 이력으로 계산하지 않는다.

이 convention이 충족되면 현재 production 계약대로 **ordinary local-language ability, 일반적 location
feasibility, ordinary work eligibility**를 충족한 것으로 본다. 다만 이것은 다음을 자동 충족시키지
않는다.

- Role이 별도로 요구한 제2언어·업무 언어의 숙련도
- 특정 도시로의 relocation 의향이나 장거리 통근 가능성
- 고객사·office onsite 빈도 수용 여부
- employment type, compensation, start timing
- exact citizenship, security clearance, visa class, regulated license

현재 위치가 target 도시이고 위 same-country 학교/실제 근무 evidence도 있으면, 반대 evidence가 없는
한 기본 onsite feasibility에는 positive evidence로 쓸 수 있다. 그러나 remote 선호나 명시적인 onsite
거절이 있으면 B에서 별도로 반영한다.

축에는 다음처럼 반영한다.

- Work authorization이나 location이 Role의 hard requirement라면 A에서 확인한다. 위 convention이
  성립하면 “visa 종류 미기재”만으로 A=`hold`를 주지 않는다.
- Work mode·onsite·relocation이 talent 선호와 맞는지는 B에서 별도로 본다.
- 회사가 exact local license·clearance를 interview bar로 명시했다면 A와 C 중 실제 의미에 맞게
  반영하되 같은 결측을 중복 처벌하지 않는다.
- Convention이 성립하지 않고 work authorization이 유일한 decision-critical candidate fact라면
  A=`hold`와 `topic=work_authorization`을 쓸 수 있다. 여러 핵심 gap이 함께 있으면 `ambiguous`다.

### 9.5 `hold`의 정확한 사용

`reevaluationCriteria`는 A=`hold`이고 B와 C가 `unfit`이 아닐 때만 하나 만든다.

- talent가 직접 답할 수 있는 사실이어야 한다.
- 답을 받으면 A가 `fit` 또는 `unfit`으로 실제 결정되어야 한다.
- 회사가 talent를 좋아할지, talent가 업계를 대체로 좋아할지를 묻지 않는다.
- 회사나 Role의 누락 정보는 talent에게 묻지 않는다.
- 여러 중요한 불확실성이 남으면 hold가 아니라 `ambiguous`다.
- 질문은 숨은 회사명, Role, private request, 점수를 노출하지 않는 자연스러운 완전한 질문이다.

허용 topic은 다음과 같다.

```text
location
work_authorization
employment_type
availability_or_timing
compensation_requirement
required_language
required_qualification
license_or_clearance
other_candidate_fact
```

## 10. 같은 회사 history와 한 회사 한 `recommend`

A/B/C를 확정한 뒤 `recommend`를 별도로 판단한다.

### 10.1 기본 guard

`recommend=true`가 가능한 조합은 다음뿐이다.

```text
roleFit = fit
candidateFit = fit | middle
companyFit = fit | ambiguous
```

- A/B/C가 모두 `fit`이면 더 강한 sibling Role이나 같은 회사 lifecycle 문제가 없는 한 기본값은
  `recommend=true`다.
- B=`middle`이어도 tradeoff가 작고 upside가 커서 진지한 검토 가치가 있으면 추천할 수 있다.
- C=`ambiguous`가 단순한 exact evidence 부족이고 affirmative mismatch가 없으면 추천할 수 있다.
- B=`middle`과 C=`ambiguous`가 동시에 있으면 예외적으로 설득력 있는 경우에만 추천한다.
- `recommend`를 true로 만들기 위해 이미 판단한 A/B/C를 바꾸지 않는다.

### 10.2 같은 회사에서는 현재 제안할 Role 하나만

각 talent마다 target Role의 A/B/C를 먼저 독립적으로 끝낸다. 그 다음 같은
`company_workspace_id`의 active, non-test internal Role에 대해 다음을 읽는다.

- 기존 `talent_opportunity_fit`의 A/B/C, score, `recommend`, human override
- 실제 추천 이력과 talent feedback
- authoritative current process stage
- materially different한 sibling Role의 JD와 request

모든 active·non-test sibling의 compact index를 먼저 읽고, 실제 경쟁 가능성이 있는 Role만 full card를
연다. Sibling fit의 fingerprint가 현재 source·candidate와 같으면 기존 A/B/C를 evidence로 쓸 수 있다.
정보가 오래됐거나 target과 가까운 경쟁 Role인데 현재 fit을 알 수 없으면 그 Role도 같은 prompt에서
평가한다. 사용자가 target Role을 지목했다는 사실은 target의 `recommend=true`를 미리 보장하지 않는다.

**이번에 새로 저장할 아직 미전달인 actionable Role 중 `recommend=true`는 talent×company마다 최대
하나다.** 두 개 이상이 독립 guard를 통과하면 정확히 한 개의 best first proposal만 true로 고르고,
나머지는 false다. 어느 Role도 능동 제안할 가치가 없으면 0개다. 두 개 이상이면 write 전에
실패시키고 비교를 다시 한다.

더 강한 sibling이 있으면 target Role의 A/B/C와 `label`은 그대로 두고 target의
`recommend=false`만 선택한다. 한 Role의 거절을 회사 전체 거절로 전이하지 않는다. 반대로 talent의
명시적 회사 전체 거절이나 회사의 candidate-level terminal rejection처럼 Role을 넘어 실제로
이어지는 evidence는 B 또는 C에 반영할 수 있다.

이미 실제 전달된 과거 Role의 `recommend=true`는 당시 결정을 보존할 수 있다. “한 회사 하나”의
현재 invariant는 **새로 능동 제안 가능한 미전달 Role 집합**에 적용한다. 과거 전달 row를 새 target
Role과 함께 다시 발송하지 않는다.

특정 workspace의 별도 priority 상수나 company score는 후보 노출 순서를 바꿀 수 있을 뿐 A/B/C나
one-recommend 의미를 바꾸지 않는다.

## 11. `label`과 score projection

A/B/C와 `recommend`를 먼저 결정한 뒤 기존 downstream 호환 `label`을 다음 순서로 만든다.

| 조건 | 저장 `label` | score 범위 |
| --- | --- | ---: |
| A=`unfit` 또는 C=`unfit` | `unfit` | 0~39 |
| 위가 아니고 B=`unfit` | `dissatisfied` | 40~59 |
| 위가 아니고 A=`hold` | `hold` | 60~79 |
| 위가 아니고 A=`ambiguous` | `ambiguous` | 60~79 |
| `recommend=true` 또는 B=`fit`이고 C=`fit` | `fit` | 80~100 |
| 그 밖의 viable soft case | `ambiguous` | 60~79 |

Score는 label 안에서 후보의 근거 강도와 우선순위를 나타낸다. Score로 label을 먼저 정하거나 후보 수에
맞춰 곡선을 만들지 않는다. 같은 회사 sibling에 실제 차이가 있으면 의미 없는 동점을 피한다.

`reason`은 1~5개의 짧은 문장으로 다음만 담는다.

- 회사가 인터뷰할 가장 구체적인 후보자 자신의 근거
- talent가 검토할 가능성을 보여 주는 선호·행동 또는 핵심 tradeoff
- 최종 판단을 가른 hard blocker나 같은 회사 sibling 선택

JD 전체, A/B/C 정의, private company policy, 내부 table명·row ID를 반복하지 않는다.

### 11.1 저장 후 downstream 의미까지 확인

`label=fit`만 candidate-visible인 것은 아니다. 현재 DB 함수의 의미를 그대로 확인한다.

- B=`unfit`이면 언제나 candidate-visible이 아니다.
- `human_label`이 있으면 그것이 `fit`일 때만 visible이다.
- Human label이 없으면 legacy `label=fit`, `recommend=true`, 또는 A=`fit`이면서 C=`fit`인 row가
  candidate-visible이다.

따라서 `recommend=false`는 “지금 먼저 능동 제안하지 않는다”는 뜻이지 항상 후보에게 존재할 수 없는
Role이라는 뜻은 아니다. 반대로 candidate-visible이라고 곧바로 발송 가능한 것도 아니다.

새로운 candidate 답변이 `reevaluation_criteria.new_information`에 들어왔고
`reevaluation_checked_at`이 null이면 다음 row는 pending reconsideration이다.

- human override가 없음
- B가 `unfit`이 아님
- `label=hold`, 또는 A=`fit`·B=`middle`·C=`fit`

Pending reconsideration row는 새 정보를 직접 읽고 재평가하기 전까지 recommendable selection에서
제외한다. 이번 run이 그 새 정보를 평가했다면 `reevaluation_checked_at`을 평가 시각으로 갱신하고,
criteria를 새 결론에 맞게 정리한다.

## 12. 평가 결과와 DB 저장 형태

### 12.1 Codex 평가 결과

Run artifact는 최소 다음 top-level 구조를 가진다. `candidates`는 전수 검토 증거와 사람이 읽을
결과이고, `fitRows`는 DB로 바로 넘길 normalized row다. 두 배열은 같은 평가에서 파생되어야 하며 서로
독립적으로 다시 판단하지 않는다.

```json
{
  "schemaVersion": 1,
  "runId": "uuid",
  "status": "completed",
  "executionMode": "report_only",
  "evaluationDocumentVersion": "2026-09-08",
  "evaluator": "current_codex_direct_review",
  "roleSnapshot": {
    "roleId": "uuid",
    "companyWorkspaceId": "uuid",
    "sourceFingerprint": "sha256",
    "roleMatchingFingerprint": "sha256",
    "observedAt": "UTC timestamp"
  },
  "counts": {
    "retrieved": 0,
    "packetized": 0,
    "directlyReviewed": 0,
    "evaluatedTalents": 0,
    "evaluatedPairs": 0,
    "recommendTrue": 0,
    "writtenRows": 0,
    "recommendationsCreated": 0,
    "messagesSent": 0
  },
  "capacityGate": {
    "currentPendingCount": 0,
    "maxPendingTalents": null,
    "searchAllowed": true
  },
  "candidates": [],
  "fitRows": [],
  "validation": {
    "directReviewComplete": true,
    "oneRecommendPerCompany": true,
    "sourceUnchangedBeforeWrite": true,
    "humanOverridesUnchanged": true
  }
}
```

`status=completed`는 전수 검토와 모든 validation이 끝났을 때만 가능하다. 저장을 하지 않은
`report_only`에서도 `fitRows`를 완성하되 `writtenRows=0`을 기록한다.

각 talent는 다음 형태로 `candidates`에 출력한다. 한 회사의 sibling Role을 함께 평가했다면
`evaluations`에 각각 하나씩 넣는다.

```json
{
  "talentId": "00000000-0000-0000-0000-000000000000",
  "evaluations": [
    {
      "roleId": "00000000-0000-0000-0000-000000000000",
      "score": 88,
      "roleFit": "fit",
      "candidateFit": "middle",
      "companyFit": "fit",
      "recommend": true,
      "reason": "후보자 자신의 직접적인 업무·성과 근거와 candidate-facing tradeoff를 짧게 설명한다.",
      "locationConclusion": "inferred_local_work_authorization",
      "reevaluationCriteria": null,
      "companyCriteriaEvaluations": [
        {
          "name": "회사에서 제공한 criterion 이름을 그대로 사용",
          "fitness": "good",
          "content": "이 criterion에 직접 답하는 후보자의 구체 근거"
        }
      ]
    }
  ]
}
```

`companyCriteriaEvaluations`는 company criteria가 실제로 있고 C=`fit`일 때만 모든 criterion을 입력
순서대로 한 번씩 평가한다. `fitness`는 `bad|uncertain|good|excellent`이다. 그 밖에는 `null`이다.
`locationConclusion`은 audit·metadata용이며 별도 DB column은 아니다.

### 12.2 `talent_opportunity_fit` row mapping

위 결과는 다음 row로 바로 변환할 수 있어야 한다.

```json
{
  "talent_id": "talentId",
  "opportunity_id": "roleId",
  "kind": "codex",
  "score": 88,
  "label": "fit",
  "role_fit": "fit",
  "candidate_fit": "middle",
  "company_fit": "fit",
  "reason": "평가 결과의 reason",
  "recommend": true,
  "reevaluation_criteria": null,
  "company_criteria_evaluations": [
    {
      "name": "회사에서 제공한 criterion 이름을 그대로 사용",
      "fitness": "good",
      "content": "이 criterion에 직접 답하는 후보자의 구체 근거"
    }
  ],
  "company_side_evaluation_metadata": {
    "schemaVersion": 1,
    "workflow": "internal_role_talent_direct_review",
    "runId": "uuid",
    "evaluatorVersion": "current_codex_direct_review",
    "evaluationDocumentVersion": "2026-09-08",
    "sourceFingerprint": "sha256",
    "roleMatchingFingerprint": "sha256",
    "candidateFingerprint": "sha256",
    "locationConclusion": "inferred_local_work_authorization",
    "evaluatedAt": "UTC timestamp"
  },
  "last_evaluated_at": "database now",
  "reevaluation_checked_at": "database now"
}
```

`label`은 section 11의 projection으로 만든다. `kind`는 이 수동 Codex direct-review 결과임을 나타내는
`codex`다. `company_side_evaluation_metadata`에는 raw resume·메시지·private criteria를 넣지 않고
run과 source를 재현하는 identifier·fingerprint만 넣는다. `behavior_context_version`을 실제로 읽은
경로라면 호환 metadata로 함께 저장할 수 있지만, 그 숫자만으로 fit stale 여부를 판단하지 않는다.

`fitRows`에는 이번에 **완료 평가한 모든 target pair**를 넣는다. 추천자만 남기거나 non-fit row를
버리지 않는다. Sibling을 full evaluation까지 수행해 갱신 대상으로 확정했다면 별도 pair row를 넣되,
단순 비교를 위해 기존 sibling fit을 읽기만 한 경우에는 그 sibling row를 다시 저장하지 않는다.

### 12.3 Upsert 안전 규칙

저장은 `(talent_id, opportunity_id)` conflict upsert로 수행한다. Artifact는 모든 target pair를 가지며,
`commit_fit`은 그 normalized `fitRows`를 동일 transaction 안에서 저장한다. 단, 아래 preflight에서
제외되거나 source drift가 난 row를 조용히 빼고 “완료”라고 하지 않는다.

- `human_label`, `human_reason`, `human_reviewed_by`, `human_reviewed_at`은 읽고 보존하며 수정하지 않는다.
- Human column을 INSERT/UPDATE assignment에 넣지 않는다. Before/after 값을 다시 읽어 byte-equivalent로
  같은지 검증한다.
- Effective human override가 fit을 금지하면 model `recommend=true`를 저장하거나 실제 actionable
  상태로 취급하지 않는다. Artifact에는 새 model 판단과 effective human 결과를 구분해 기록한다.
- target Role이 test-only인지 DB guard와 app guard로 다시 확인한다.
- Role이 여전히 active·internal·미만료인지, talent가 여전히 sharing 허용 상태인지, blocked company나
  동일 Role recommendation이 새로 생기지 않았는지 transaction 안에서 다시 확인한다.
- `recommend=true`가 guard 조합을 통과하는지 검증한다.
- 같은 talent×company의 미전달 actionable `recommend=true`가 최대 하나인지 검증하고 sibling의 오래된
  미전달 recommend는 같은 transaction에서 false로 내린다.
- 이미 전달된 sibling recommendation은 지우거나 다시 만들지 않는다.
- 저장 직전 Role/request/criteria와 candidate fingerprint가 평가 snapshot과 같은지 확인한다.
- `kind='codex'`, A/B/C, projected label, score, reason, recommend, reevaluation, company criteria,
  direct-review metadata를 함께 쓴다.
- `history`에 production의 `prefilter`나 `second_stage`를 실행한 것처럼 가짜 entry를 만들지 않는다.
  별도 direct-review history 계약이 없다면 기존 `history`를 보존하고 run 정보는
  `company_side_evaluation_metadata`에 둔다.
- `behavior_context_version`을 함께 보존해야 하는 기존 저장 경로라면 당시 값을 기록할 수 있다. 그러나
  이 숫자만으로 현재 internal fit을 invalidate하거나 자동 재평가하지 않는다.
- 모든 row를 한 transaction으로 저장하고 검증 실패 시 일부만 남기지 않는다. Commit 뒤 실제 저장
  row를 재조회해 artifact와 pair별로 대조한다.

`report_only`에서는 위 SQL을 실행하지 않는다. 결과 JSON에 database timestamp placeholder가 있어도
실제 저장됐다고 표현하지 않는다. `commit_fit`도 recommendation, progress, tag, delivery, chat, email을
생성하지 않는다.

## 13. 저장 전 machine validation

정성 판단을 deterministic rule로 다시 쓰지 않는다. 코드는 다음 구조·안전 계약만 검증한다.

- retrieved, packet, direct-review, evaluation의 talent ID 집합이 동일하다.
- 중복 identity를 합친 뒤 unique talent 수가 150 이하이고, cutoff 뒤를 임의로 건너뛰지 않았다.
- 각 talent×Role pair가 정확히 한 번 나온다.
- 입력에 없던 talentId나 roleId가 없다.
- 모든 actual variant가 실제 `roleId`이고 `sourceRoleId`나 임의 group ID가 저장 대상이 아니다.
- A/B/C 값과 score·label 범위가 허용값이다.
- section 11의 label projection과 실제 label이 같다.
- `recommend`는 boolean이고 section 10 guard를 통과한다.
- 한 talent×company의 새 actionable `recommend=true`가 최대 하나다.
- `locationConclusion`은 허용값이고, 근로권 간주를 선택한 packet에는 target·현재 위치 source와 학교
  또는 실제 `company_location` source ID가 비어 있지 않다. 국가가 정말 같은지와 반대 evidence의
  의미는 현재 Codex가 원문을 다시 읽어 확인한다.
- hold만 유효한 `reevaluationCriteria` 하나를 가진다.
- C=`fit`이고 company criteria가 있을 때 criterion coverage가 완전하다.
- reason이 비어 있지 않다.
- test-only, privacy, blocked company, duplicate recommendation 대상이 없다.
- Pending capacity와 pending reconsideration guard를 통과한다.
- human override before/after가 같다.
- source snapshot이 평가 시작 때와 같다.
- `candidates`의 평가와 `fitRows`가 pair별로 동일하며 commit 후 저장 row와도 동일하다.
- `report_only`에서는 written/recommendation/delivery/message count가 모두 0이다.

위 검증은 LLM reason의 말투, keyword, 문장 형태를 정규식으로 고치는 용도가 아니다. 정성 품질 문제는
evidence packet, prompt와 직접 재검토로 해결한다.

### 13.1 Private run artifact와 재개

권장 위치는 gitignored인 다음 경로다.

```text
output/internal_role_talent_direct_review/runs/<run_id>/
  manifest.json
  role-snapshot.json
  retrieval.sql
  retrieval-index.json
  packets/<talent_id>.md
  checkpoints/<talent_id>.json
  result.json
  writeback.json
```

Raw production 데이터가 들어 있는 디렉터리와 파일은 owner-only permission으로 둔다. 장기 문서나
git에는 이름·resume·대화·회사 private request·원문 packet·raw model output을 넣지 않는다.

Run이 중단되면 `manifest.status=partial`과 정확한 완료 ID를 남길 수 있다. 재개할 때 Role snapshot,
candidate fingerprint, evaluation document version이 모두 같을 때만 완료 checkpoint를 재사용한다.
하나라도 달라졌으면 영향을 받은 후보를 다시 읽는다. 부분 artifact를 최종 추천 목록이나 writeback
source로 사용하지 않는다.

## 14. 최종 비교와 보고

전원의 독립 판단이 끝난 뒤 `recommend=true` 후보만 비교해 최종 순서를 정한다. 사용자가
`max_recommendations`를 줬다면 그것은 반드시 채울 수가 아니라 넘지 않을 상한이다. 경계 후보를
넣기 위해 A/B/C나 score를 바꾸지 않는다.

최종 보고에는 다음을 포함한다.

- Role과 회사, 사용한 source snapshot 시각
- retrieval query revision과 `retrieved / packet / directly reviewed / evaluated` 수
- target 국가와 위치 evidence 결론별 수, 근로권 간주에 사용한 source 종류
- A/B/C와 projected label 분포
- 추천 후보의 이름·profile 링크, A/B/C, score, 핵심 reason
- `recommend=false`인 strong sibling 또는 경계 후보의 핵심 이유
- hold 후보와 확인할 질문
- 기존 동일 Role 추천, privacy, blocked company, 중복 identity 등 제외 수
- 같은 회사 one-recommend 검증 결과
- Pending capacity와 pending reconsideration 상태
- `report_only`인지, 실제 fit upsert row 수가 몇 개인지
- recommendation·메시지·발송이 0건인지
- 남은 uncertainty와 실패 항목

0명을 추천해도 전원을 읽고 판단했다면 완료다. 반대로 좋은 후보 몇 명만 찾고 나머지 packet을 읽지
않았다면 미완료다.

## 15. 자주 생긴 오류와 방지 기준

### 15.1 공개 공고의 오래된 조건을 현재 조건으로 단정

사용자가 준 최신 공고와 별도 공개 페이지의 보상·고용 형태가 다르면 최신 Role source에 없는 값을
hard filter로 쓰지 않는다. `현재 확인되지 않음`으로 남기고 두 source를 분리한다.

### 15.2 일반 단어 합산으로 무관한 후보가 상위에 옴

`communication`, `content`, `partnership`, `AI`, `product` 같은 단어가 서로 다른 경력에 한 번씩
있다는 이유만으로 핵심 경험을 만들지 않는다. 같은 경험·프로젝트에서 function, ownership, output이
이어지는지 실제 본문을 읽는다.

### 15.3 학교·회사 brand를 후보자 성과로 사용

유명 조직에 있었다는 사실은 환경 맥락이다. 어떤 문제를 맡고 무엇을 바꿨는지 확인되지 않으면 A나
C의 직접 근거가 아니다. 회사 성장과 후보자 개인 기여를 분리한다.

### 15.4 결측을 탈락 또는 합격으로 처리

정보가 없다는 사실을 `unfit`으로 바꾸지 않고, 부정 신호가 없다는 사실을 `fit`으로 바꾸지도 않는다.
딱 하나의 candidate-answerable blocker면 hold, 여러 핵심 gap이면 ambiguous를 사용한다.

### 15.5 같은 회사의 여러 Role을 동시에 추천

각 Role의 fit은 유지하되 지금 먼저 제안할 한 Role만 `recommend=true`로 둔다. 이 판단을 생략한 채
target Role만 보고 저장하지 않는다.

### 15.6 150명 중 일부만 직접 검토

Retrieval count를 작업량 목표로 보고 전원 packet을 만든다. 150명이 과하면 시작 전에 retrieval 상한을
사용자와 다르게 합의해야 한다. 이미 150명을 확정한 뒤 임의로 10명만 읽고 나머지를 완료 처리하지
않는다.

### 15.7 현재 위치만으로 근로권을 확정

현재 profile location만 target 국가라고 바로 근로권을 추정하지 않는다. 같은 국가의 학교 소재 또는
실제 `talent_experiences.company_location`을 하나 이상 확인한다. 반대로 이 결합 evidence가 있는데
단순히 visa 종류가 비었다는 이유로 hold를 주지도 않는다.

### 15.8 회사의 국가와 candidate의 실제 근무 국가를 혼동

`company_db.location`, 회사 본사, 회사명은 Role target 국가나 candidate 근무지가 아니다. 같은
experience의 `company_location`, description 또는 resume가 candidate의 실제 근무 위치를 말하는지
확인한다.

### 15.9 평가 전용 prompt를 production 계약으로 오인

`internal_fit_prompt_candidate.py`의 실험 규칙을 현재 정본처럼 가져오지 않는다. 실행 시작 때 production
import path와 `internal_fit.py`의 현재 prompt·normalization을 다시 확인한다.

### 15.10 현재 재직·최근 입사를 새 일 비선호로 사용

현재 production B는 모두가 active search 중이라고 가정한다. 재직, 최근 입사, notice, off-market,
temporary pause만으로 B를 낮추지 않는다. 단, target이 현재 회사·본인이 세운 회사·현재 직접 만들고
있는 회사라면 명시적 internal transfer/new-role 의향이 없을 때 B=`unfit`이다.

### 15.11 Same-company stage의 actor를 뒤바꿈

Talent의 `내부:수락`을 회사의 수락으로 바꾸거나, 미응답을 거절로 만들거나, 회사 process stop을
talent의 선호로 만들지 않는다. 최신 authoritative stage와 actor·reason을 함께 읽는다.

### 15.12 `recommend=false`를 `unfit`으로 바꿈

더 좋은 sibling이 있어 target의 `recommend=false`가 되었더라도 이미 확정한 A/B/C와 label을 낮추지
않는다. `recommend`는 proactive first proposal 선택이고 fit 축 자체가 아니다.

## 16. 실행용 짧은 명령

다음 요청은 이 문서 전체를 실행하라는 뜻으로 사용한다.

```text
`docs/scheduled/internal-role-talent-direct-review-ko.md`대로 실행해.
role_id=<uuid>
execution_mode=report_only

Role 기준으로 최대 150명의 unique talent를 회수하고, 확정한 pool 전원의 Worker형 evidence packet을
현재 Codex가 직접 하나씩 읽어 A/B/C와 recommend를 판단해. 같은 회사의 새 actionable recommend는
talent마다 하나만 남겨. 최종 결과는 talent_opportunity_fit에 바로 upsert 가능한 JSON으로도 남겨.
실제 recommendation 생성이나 발송은 하지 마.
```

저장까지 원할 때만 `execution_mode=commit_fit`으로 바꾸고 `talent_opportunity_fit에 upsert해`를
명시한다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-08 | 과거 직접 후보 탐색 방식과 현재 internal-fit A/B/C·한 회사 한 recommend·DB row 계약을 통합 |
