# Company-side 데이터 기반 Role Request 갱신 기준

- 상위 작업 지도: [Company-side Codex 작업 지도](./codex-work.md)
- 48시간 실행 런북: [최근 활동 기반 Hiring Brief 48시간 갱신](./company-role-request-refresh-48h-ko.md)
- 대상: internal Role의 `company_internal_roles.request`
- 기준 repository: `harper_beta`, 실제 evaluator는 `harper_worker`
- 작성일: 2026-09-07
- 상태: scheduled 운영 계약. 이 문서 자체는 scheduler·queue·DB write 구현 또는 배포 완료를
  뜻하지 않는다.
- 실행 시점: 새로운 company-side 결정·사유·calibration feedback이 생긴 뒤 또는 정기 검토 시.
  예약 실행 자체는 변경 사유가 아니며 유효한 새 기준이 없으면 no-op으로 끝낸다.
- 관련 문서:
  - [Company Context Run 목적과 구현 계약](../company/company-context-run-overview-ko.md)
  - [Company Context Run Codex 런북](../company/company-context-run-codex-runbook-ko.md)
  - [Company Role Profile Calibration 런북](../company/company-role-profile-calibration-codex-runbook-ko.md)

## 1. 목적

이 작업은 회사가 실제로 본 후보자에게 남긴 결정과 메모를 바탕으로 Role의 `request`를 더
정확한 판단 입력으로 갱신한다.

여기서 최적화하려는 결과는 다음 하나다.

> 후보자의 현재 프로필을 본 회사가 이 Role의 인터뷰에 시간을 쓸 의향이 있어 Harper가
> `연결대기`로 진행해도 되는 사람을 더 정확히 식별한다.

인터뷰 이후의 합격, 최종 오퍼, 입사 또는 장기 성과를 예측하는 작업이 아니다. 그 결과에는
면접 중 새로 발견된 정보, 면접 수행, 다른 지원자, headcount, 보상 협상과 시점처럼 현재
프로필과 `request`만으로 알 수 없는 변수가 크게 작용한다. 이를 request의 정답으로 사용하면
좋은 연결 후보를 사후 결과 때문에 배제하게 되고 추천 기준 자체가 왜곡된다.

## 2. `request`가 무엇인지

`company_internal_roles.request`는 회사가 원하는 후보의 기준을 evaluator LLM에 전달하는
private 판단 입력이다. 실제 internal fit evaluator에는 `companyRoleRequest`로 제공된다.

Evaluator는 후보자와 Role마다 다음을 분리해서 판단한다.

- `roleFit`: 후보자가 Role의 핵심 업무와 hard requirement를 수행할 수 있는가
- `candidateFit`: 후보자에게 이 기회가 받아들일 만하고 만족스러울 가능성이 있는가
- `companyFit`: 회사가 밝힌 hiring bar에 비춰 이 후보자를 인터뷰하고 싶어 할 가능성이 있는가

`request`의 직무 요건은 `roleFit`에, 회사만의 선별 기준과 caliber bar는 주로
`companyFit`에 영향을 준다. 세 판단은 최종 `label`, `score`, `recommend`와 후보자별
`talent_opportunity_fit.reason`에 반영된다.

### 2.1 `request`에 쓰는 것

- JD만으로 충분히 드러나지 않는 실제 hard requirement
- 회사가 프로필 검토 시 중요하게 보는 caliber와 우선순위
- 강한 가산점과 명시적인 부정 기준
- 기준을 만족한다고 볼 수 있는 후보자 프로필상의 객관적 evidence
- 서로 다른 evidence를 동등하게 인정할 수 있는지와, 실제로 검증된 경우 그 조건
- 여러 신호가 함께 있어야 하는지, 한 신호만으로도 충분한지에 대한 조합 기준

모든 문장은 **이 회사·이 Role에서만 추가로 필요한 판단**이어야 한다. 공통 evaluator가 이미
책임지는 판정 방식이나 Role card의 구조화 field로 전달되는 사실은 request의 역할이 아니다.

### 2.2 `request`에 쓰지 않는 것

- 후보자에게 보낼 설명이나 설득 문구
- Harper 운영자가 수행할 연락·안내·후속 조치
- 인터뷰 질문, 인터뷰 운영법과 인터뷰 이후 합격 예측
- 모든 회사에 적용되는 evaluator 공통 정책, label 의미와 evidence 해석 규칙
- `location`, `work_mode`, `employment_type`, JD 등 다른 입력 field에 이미 정확히 들어 있는 사실의
  불필요한 반복
- 특정 후보자 사건의 일지, 이름, 점수와 stage 목록
- 근거가 약한 상관관계나 아직 검증되지 않은 추측
- 이미 JD에 충분히 있고 별도 해석이 필요 없는 긴 업무 설명의 반복

예를 들어 다음 문장은 request에 적합하지 않다.

> 실제 근무 형태와 서울 근무 조건을 정확히 안내한 뒤 의사를 확인한다.

이 문장은 LLM의 후보 판단 기준이 아니라 사람의 커뮤니케이션 절차다. 실제 조건이 이미 Role
card에 있다면 request에 다시 쓰지 않는다. JD만으로 알 수 없는 회사 고유의 수행 수준이
필요하다면 다음처럼 관측 가능한 기준과 판정 의미를 쓴다.

> 고객 임원과 실시간으로 요구사항과 기술적 trade-off를 논의할 수 있는 업무 수준의 영어가
> 필요하다. 프로필에 업무 사용 근거가 전혀 없고 이 사실 하나만 확인되면 되는 경우에는
> roleFit을 확정하지 않는다.

## 3. 실제 입력·출력 계약이 request 작성에 주는 제약

### 3.1 현재 Worker projection은 2,000자에서 잘린다

DB write 계약상 `role_request`의 저장 한도는 20,000자다. 2,000자는 request 자체의 제품
정책이나 모델 한도가 아니라, 현재 `harper_worker`가 Role card를 만들 때
`companyRoleRequest`의 앞부분만 전달하도록 하드코딩한 projection 값이다. 이 숫자에 대한
별도의 evaluation 근거도 현재 문서화되어 있지 않다.

따라서 request 작성 원칙을 2,000자로 정의하거나, 필요한 기준을 버려가며 이 숫자에 억지로
맞추지 않는다. 먼저 필요한 판단 계약을 완전하게 작성한다. 다만 Worker가 수정되기 전 실제
적용본을 만들 때는 현재 evaluator가 뒤 문장을 보지 못한다는 사실을 명시하고 다음 중 하나를
선택한다.

- 중요한 기준이 2,000자 안에 자연스럽게 들어가면 그 범위에서 간결하게 작성한다.
- 더 긴 기준이 필요하면 projection 상향·제거와 prompt token budget을 evaluation한 뒤 함께
  변경한다.
- 당장 Worker를 바꾸지 못하면 가장 결정적인 hard requirement와 company bar를 앞 2,000자에
  두되, 이를 request의 영구적인 길이 계약으로 기록하지 않는다.

어느 경우에도 같은 의미를 JD와 request에 반복하거나, 2,000자 이후까지 전달된다고 가정해서
핵심 기준을 뒤에 숨기지 않는다.

### 3.2 `reason`은 후보자별 판단 결과다

Production evaluator는 각 `[talent × role]`에 대해 1~4개의 짧은 문장으로 결정적 근거,
불일치 또는 불확실성을 작성하고 이를 `talent_opportunity_fit.reason`에 저장한다. 일반 Worker
경로에서는 최대 2,400자로 정규화하며, Company Context Run write 계약은 1~3,000자를
허용한다.

따라서 request의 각 문장은 다음 질문에 답할 수 있어야 한다.

> 이 기준이 적용되면 `reason`은 후보자의 어떤 이력·성과·역할 범위를 근거로 통과 또는
> 불충족을 설명할 것인가?

`강한 학업 성취`, `좋은 회사`, `스타트업형`, `똑똑한 사람`처럼 candidate evidence와 판정
경계가 불분명한 표현은 LLM이 일관되게 적용하기 어렵다. 이러한 문구가 필요하다면 뒤에서
정의하는 구체적인 anchor와 의미를 함께 쓴다. 다른 evidence도 같은 수준으로 인정하려면 회사의
직접 확인이나 독립된 반복 사례가 있어야 한다.

### 3.3 Request는 자동 점수표로 분해되지 않는다

`request`는 free-form text이며 application code가 학교명, 회사명이나 문장을 keyword rule로
분해해 점수를 더하지 않는다. LLM이 전체 후보자 evidence와 함께 의미를 판단한다. 따라서
`A군 +10점`, `B군 +5점`처럼 근거 없는 산술식을 쓰기보다 우선순위, 결합 조건, 검증된 동등
evidence와 fit 경계를 자연어로 분명히 쓴다.

별도의 `company_internal_roles.criteria`가 있으면 evaluator가
`company_criteria_evaluations`를 만들 수 있지만, request의 모든 문장이 자동으로 개별 criterion
row가 되지는 않는다. `reason`도 모든 기준의 체크리스트가 아니라 결정적인 1~4문장만 저장한다.
그러므로 중요한 기준을 긴 배경 문장 속에 숨기거나 “나중에 reason에서 알아서 설명할 것”이라고
가정하지 않는다.

### 3.4 과거 `reason`은 정답이 아니다

기존 `talent_opportunity_fit.reason`은 당시 프로필과 당시 request를 읽은 LLM의 판단이다.
회사 본인이 남긴 사유나 실제 stage 결과가 아니다.

과거 reason은 다음 용도로만 쓴다.

- 당시 evaluator가 후보자의 어떤 evidence를 봤는지 빠르게 찾는 index
- 현재 request가 너무 추상적이거나 잘못 해석됐는지 진단하는 자료
- 같은 기준을 후보자마다 일관되게 적용했는지 확인하는 보조 자료

Reason의 표현을 그대로 새 request로 되먹이지 않는다. 그러면 기존 모델의 추측이 회사 행동으로
오인되어 반복 강화된다. 반드시 후보자 원문과 company-side outcome·memo를 다시 확인한다.
Request가 바뀐 뒤 과거 reason은 이전 기준의 결과이므로 현재 판정처럼 읽지 않는다.

`human_label`이나 `human_reason`이 있으면 model `label`·`reason`과 분리해 읽는다. 이는 human
override이지만 자동으로 회사 발화가 되는 것은 아니다. Reviewer와 source가 회사 결정인지,
Harper 운영 판단인지 확인한 뒤 해당 evidence tier로 사용하며, model reason보다 높은 우선순위를
주더라도 원래 의미의 범위를 넘겨 일반화하지 않는다.

### 3.5 `companyFit`의 불확실성은 `hold`가 아니다

현재 evaluator에서 `hold`는 `roleFit`에만 있다. 후보자가 답할 수 있는 결정적 사실 하나가
비어 있고, 그 답 하나로 역할 수행 가능성이 `fit` 또는 `unfit`으로 바뀔 때만 사용한다.

회사의 caliber bar를 통과하는지 애매한 경우 `companyFit`은 `ambiguous`다. 회사가 좋아할지를
후보자에게 질문하거나 `hold`로 미루지 않는다. 따라서 request에 `학교가 약하면 hold`,
`회사 bar가 불확실하면 확인`처럼 쓰면 실제 evaluator 계약과 맞지 않는다.

Company bar의 결과를 나누고 싶다면 기준 자체에 다음 경계를 써야 한다.

- **fit**: 어떤 profile evidence 조합이 bar를 적극적으로 충족하는가
- **ambiguous**: 핵심 evidence가 누락됐거나 간접적이어서 통과·실패를 확정할 수 없는가
- **unfit**: 완전한 정보 부족이 아니라, 확인된 역할 범위·성과·진행 수준이 명시적 bar보다
  낮다는 evidence가 있는가

“유명하지 않다”, “목록에 없다”, “프로필이 짧다”는 그 자체로 명시적 bar 미달이 아니다.
반대로 회사가 실제로 요구한 최소 scope가 있고 후보자의 확인된 scope가 그보다 낮다면
`companyFit=unfit`의 근거가 될 수 있다.

### 3.6 기존 request는 검토 대상이지 상위 authority가 아니다

Full rewrite를 시작할 때 기존 request를 그대로 바탕 문장으로 삼지 않는다. 먼저 다음 네 층을
분리한다.

| 층 | 책임 | request와의 관계 |
| --- | --- | --- |
| Runtime evaluator contract | 입력 field의 의미, label·hold 경계, 공통 location·authorization·evidence 정책 | request가 복제하거나 모순되면 안 됨 |
| Role/JD와 구조화 field | 업무, 근무지·형태, 고용 형태, 보상, 공개 자격요건 | 회사 고유 해석이 없으면 request에서 반복하지 않음 |
| 현재 request | 현재 저장된 private company criteria | 출처와 현재성을 문장별로 다시 확인할 대상 |
| Company-side evidence | 회사 발화, 검증된 stage·memo와 calibration | request 변경 제안의 근거 |

기존 request에 있다는 사실만으로 `retain`하지 않는다. 각 문장이 어느 층에 속하는지, 이
회사·Role에 특화되어 있는지, 현재 runtime과 JD에 모순되지 않는지를 먼저 판정한다. 특히 다음은
outcome 분석 전에 걸러낸다.

- 공통 evaluator가 이미 소유하는 정책을 Role request에 옮겨 적은 문장
- 다른 구조화 field와 중복되거나 충돌하는 문장
- 과거 실험·운영 편의를 위해 들어갔지만 현재 근거를 찾을 수 없는 문장
- 회사 기준처럼 보이지만 실제로는 이전 모델의 판단이나 Harper의 추측에서 생성된 문장

충돌이 발견되면 새 draft에서 어느 한쪽을 임의로 선택하지 않는다. Runtime bug인지, Role data가
잘못됐는지, request가 stale한지를 source로 판단해 각각 별도 수정 대상으로 분리한다. 이 구분을
하지 않은 `기존 문구 유지`는 최소 변경이 아니라 검증 누락이다.

## 4. request 보정을 위한 정답 정의

후보자마다 추천부터 현재 상태까지 전체 timeline을 복원한 뒤 아래처럼 분류한다. 현재 tag만
보면 과거에 `연결대기`를 거쳤는지 놓칠 수 있으므로, 항상 **한 번이라도 도달한 최고 stage**와
그 시점을 함께 본다.

### 4.1 긍정

다음 중 하나가 확인되면 request 보정의 긍정 사례다.

- 검증된 Harper 또는 회사 결정으로 `내부:연결대기`에 도달함
- 회사 actor가 이 후보자를 연결하거나 인터뷰하겠다는 명시적 수락을 남김
- `연결대기` 이후 initial, technical, custom interview stage나 final stage로 진행함

`연결대기`는 이 작업의 목표가 이미 달성된 시점이다. 이후 stage로 더 갔다고 더 높은 가중치를
주지 않으며, 이후에 떨어지거나 아카이브됐다고 긍정을 취소하지 않는다.

```text
추천 → 후보자 수락 → 연결대기 → 인터뷰 → 아카이브
                     ^
                     request 보정에서는 여기서 이미 positive
```

이 원칙 때문에 다음 추론은 금지한다.

> 학력과 회사가 좋았지만 인터뷰에서 탈락했으므로 학력·회사 기준은 효과가 없었다.

이 사례에서 확인된 것은 회사가 프로필을 보고 인터뷰할 가치가 있다고 판단했다는 사실이다.
인터뷰 탈락 사유가 별도의 Role requirement 정정으로 회사에 의해 명시되지 않은 한, request에
부정 evidence로 반영하지 않는다.

여기서 `positive`는 **과거 outcome의 분류**이지, 새 request가 반드시 같은 후보를 다시
`companyFit=fit`으로 만들어야 한다는 gold label이 아니다. Role scope나 회사 기준이 이후
달라졌을 수 있고, 오래된 사례는 현재 bar의 예외일 수도 있다. 새 request가 과거 positive를
다르게 판단하면 그 이유와 source를 검토해야 하지만, 한 사례를 통과시키기 위해 현재 기준을
완화하거나 별도 대체 경로를 만들지는 않는다. Historical label은 그대로 positive로 보존하고,
현재 기준에서의 예상 판정은 별도 field로 기록한다.

### 4.2 부정

`연결대기` 전에 회사 actor, 회사 결정을 집행한 Harper operator 또는 genuine company-side
pipeline에서 거절·아카이브·중단된 것이 검증되면 **negative outcome**이다. Legacy row에
actor ID가 없어도 실제 company pipeline의 부정 stage이며 test·system default·candidate-side
종료가 아니라고 확인되면 포함한다. 사유가 없어도 “이 프로필을 보고 인터뷰로 진행하지
않았다”는 결과 자체는 알 수 있다. 다만 사유의 유무에 따라 사용할 수 있는 범위가 달라진다.

| pre-pending 결과 | outcome label | request 보정에 쓸 수 있는 범위 |
| --- | --- | --- |
| 회사 결정으로 확인된 거절 + 명시적 사유 | `negative` | 사유를 후보자 원문과 대조해 hard/plus/minus criterion 후보로 사용 |
| 회사 결정으로 확인된 거절 + 사유 없음 | `negative` | 제안한 새 기준의 반례·분리력 검증에 사용. 특정 탈락 이유를 발명하지 않음 |
| Genuine company pipeline의 pre-pending 거절·archive, legacy라 actor 없음 | `negative` | Outcome으로 사용하되 특정 탈락 이유를 발명하지 않음 |
| archive tag의 provenance·의미가 불명 | `unknown` | 종료 건수로만 기록. company negative로 세지 않음 |
| 운영·후보자 사유로 종료 | `unknown` | company request 보정에서 제외 |

즉 **outcome label을 붙이는 것**과 **왜 거절했는지 criterion을 만드는 것**은 별개다.
사유 없는 회사 거절을 unknown으로 버리지도 않고, 그 후보의 학교·회사·경력 중 마음에 드는
속성을 임의의 거절 이유로 고르지도 않는다.

강한 예:

- 회사가 `org_stage_change`와 함께 “고객 배포 ownership이 없음”이라고 거절 사유를 남김
- 회사가 후보자 메모에 요구 seniority나 핵심 function의 명시적 불일치를 남김
- 같은 Role에서 같은 이유의 pre-pending 거절이 반복되고 반대 사례도 확인됨

이때도 거절 사건을 그대로 request에 쓰지 않고 미래 후보에게 적용 가능한 기준으로 일반화한다.
사유 없는 negative가 여러 건에서 같은 profile 경계를 보이더라도 우선 soft hypothesis로 두고,
positive 반례·노출 편향·기존 retrieval 기준을 함께 검토한 뒤에만 soft plus/minus로 승격한다.
Hard requirement는 회사의 직접 설명이나 이에 준하는 명확한 근거가 필요하다.

### 4.3 자주 잘못 해석하는 데이터

다음은 source와 stage에 따라 의미가 달라지므로 한 종류의 label로 뭉개지 않는다.

| 관측 데이터 | 올바른 의미 |
| --- | --- |
| 후보자의 `like`, `positive`, 연결 요청 | 후보자 측 관심. 회사가 만나고 싶다는 증거가 아님 |
| genuine company pipeline인지 불명확한 pre-pending 아카이브 | 종료 사실만 앎. 회사 판단인지 운영 사유인지 모름 |
| 회사-side임이 검증된 이유 없는 pre-pending 거절·아카이브 | negative outcome이지만 구체적 거절 이유는 모름 |
| pending 이후 아카이브·인터뷰 탈락 | 이미 긍정. 이후 결과는 request의 negative로 사용하지 않음 |
| 무응답, 일정 실패, 연락 불가 | 운영 outcome. 회사의 프로필 bar와 분리 |
| 후보자가 다른 기회를 선택함 | candidate-side outcome. companyFit 기준과 분리 |
| LLM의 기존 `reason`만 존재함 | 모델 판단일 뿐 company-side ground truth가 아님 |
| test·QA·E2E fixture와 자동 생성 stage | 학습·보정 대상에서 제외 |

아카이브를 분석할 때는 `누가`, `언제`, `어느 stage에서`, `어떤 이유로` 종료했는지가 모두
확인되어야 한다. 하나라도 없으면 request 기준을 새로 만들지 않는다.

## 5. 회사-side source 우선순위

동일 Role의 직접적이고 최근이며 이유가 있는 evidence를 가장 강하게 본다.

1. 최신의 명시적인 회사 발화와 Role 기준 수정
2. 동일 Role의 `talent_progress.kind='org_stage_change'`, `metadata.org=true`와 사유
3. 동일 Role의 `talent_progress.kind='org_note'`, `metadata.org=true`
4. 검증된 `연결대기` 또는 그 이후 stage 도달
5. Genuine company-side로 검증된 pre-pending 거절·archive·중단 outcome
6. 작성자와 문맥이 확인된 Harper 운영 메모
7. sibling Role에서 반복되며 현재 Role에도 전이 가능하다고 설명할 수 있는 회사 기준
8. Actor나 의미가 불명확한 이유 없는 stage·archive와 기존 LLM reason은 보조 evidence

`talent_opportunity_recommendation.feedback`과 `candidate_requested_connection`은 후보자 측
자료다. candidateFit이나 연결 가능성에는 유용하지만 회사 request의 정답으로 사용하지 않는다.

Sibling Role의 evidence는 회사 공통 기준일 때만 전이한다. 예를 들어 “고객 앞에서 기술과
비즈니스를 함께 설명하는 사람을 선호한다”는 FDE와 Field CTO 사이에 전이될 수 있지만,
Robotics Role의 ROS 경험을 일반 Software Role로 옮기면 안 된다.

## 6. 한 후보의 timeline을 복원하는 방법

Recommendation, progress와 tag를 fan-out join해 행을 곱집계하지 않는다. 각 source를 따로
조회하고 `(role_id, talent_id, recommendation_id, source_id)`로 합친다.

후보자별 최소 record는 다음과 같다.

```json
{
  "roleId": "uuid",
  "talentId": "uuid",
  "testOnly": false,
  "candidateResponse": "like|dislike|none",
  "highestVerifiedStage": "recommended|pending|interview|final|none",
  "everReachedPending": true,
  "firstPendingAt": "timestamp or null",
  "latestStage": "archive",
  "companyDecisionBeforePending": "accept|reject|none|unknown",
  "decisionSide": "company|harper_for_company|company_pipeline_legacy|candidate|operations|system|unknown",
  "companyDecisionVerified": true,
  "companyReasonPresent": false,
  "companyReasonSourceIds": ["row id"],
  "calibrationLabel": "positive|negative|unknown",
  "labelReason": "왜 이 label인지 한 문장"
}
```

분류 순서는 다음과 같다.

1. test, QA, E2E, seed와 synthetic event를 제외한다.
2. 후보자 측 반응과 회사·Harper 측 결정을 분리한다.
3. 모든 stage event를 시간순으로 정렬한다.
4. `everReachedPending`을 먼저 확정한다.
5. `true`이면 이후 결과와 무관하게 `positive`로 둔다.
6. `false`이면 pre-pending 거절이 회사, 회사를 대신한 Harper 또는 genuine company-side
   pipeline의 결정인지 확인한다.
7. 검증된 company-side 거절이면 actor ID와 사유 유무에 관계없이 `negative`로 두되, 사유가
   없으면 criterion derivation을 제한한다.
8. Pipeline provenance가 불명확하거나 운영·후보자 사유이면 `unknown`으로 둔다.

### 6.1 결정 당시의 후보자 evidence를 우선한다

회사 결정 이후 후보자의 프로필이 바뀔 수 있다. 현재 프로필만 보고 과거 outcome의 이유를
해석하면 나중에 추가된 회사, 학력, 프로젝트나 성과를 당시 회사가 본 것처럼 오인한다.

우선순위는 다음과 같다.

1. Recommendation 또는 company review 시점에 저장된 profile snapshot
2. 당시 `talent_opportunity_fit` 입력 fingerprint와 재현 가능한 source version
3. decision 이전에 생성된 resume, experience, education와 memo timestamp
4. 현재 프로필에서 decision 이후 변경분을 명확히 제외한 projection
5. 어느 것도 복원할 수 없으면 현재 프로필을 참고하되 `profileAtDecisionUnknown=true`로 기록

당시 profile을 복원하지 못한 사례는 학교·회사 tier나 hard requirement를 만드는 단독 근거로
사용하지 않는다. 명시적인 company reason이 있다면 그 reason 자체는 사용할 수 있지만, 현재
프로필의 다른 속성으로 이유를 확장하지 않는다.

### 6.2 결정 당시의 request와 JD도 구분한다

과거 outcome은 당시 회사가 보던 request와 Role scope 아래에서 발생했다. 현재 request가 이미
여러 차례 바뀌었다면 서로 다른 기준의 결정을 하나의 표본처럼 합치지 않는다.

별도 request history table이 없으므로 이전 run artifact, update event, company message, audit log와
Git에서 복원 가능한 버전을 최대한 찾는다. 복원할 수 없으면 `requestHistoryCoverage=latest_only`
또는 `partial`로 표시하고 해당 사례의 criterion confidence를 낮춘다. 최신의 명시적 기준이
과거 outcome과 충돌하면 최신 기준을 우선하며, 과거 사례를 이용해 다시 되돌리지 않는다.

## 7. 사례에서 request 기준을 도출하는 방법

### 7.1 긍정 사례는 “필요조건”이 아니라 “통과 가능한 경로”를 보여 준다

과거 추천 pool은 이전 request와 retrieval을 통과해 회사에 보여진 사람만 포함한다. 따라서
긍정 사례의 공통점이 회사가 반드시 요구하는 필요조건이라고 단정할 수 없다.

예를 들어 positive 두 명이 같은 학교라고 해도 다음 가능성을 먼저 검토한다.

- 기존 retrieval이 그 학교 출신을 많이 노출했는가
- 학교 외에 실제 공통된 업무 ownership이나 성과가 있었는가
- 다른 학교 출신 positive가 없었던 것이 거절 때문인지 미노출 때문인지
- 회사가 학교를 직접 이유로 언급했는가

긍정 사례는 “이 evidence 조합이면 회사가 만나려 했다”는 충분조건 후보를 제공한다. 이를
“이 속성이 없으면 회사가 만나지 않는다”는 필요조건으로 바꾸려면 명시적 회사 기준 또는
설명 있는 반대 사례가 추가로 필요하다.

### 7.2 부정 사례는 거절 이유의 범위를 넘지 않는다

회사 메모가 “senior지만 최근 5년간 hands-on 개발 근거가 약함”이라면 request에는 최근
builder evidence의 중요성을 추가할 수 있다. 이를 “senior는 싫어함”, “대기업 출신은
안 됨”으로 넓히지 않는다.

사유 없는 negative도 버리지는 않는다. 새 request 초안이 모든 사유 없는 negative를 높은
companyFit으로 올린다면 초안의 분리력이 약하다는 신호다. 다만 어느 속성이 원인인지는 모르므로
그 사례 하나만 보고 새 hard criterion을 추가하지 않는다. Positive와 negative의 profile을
조합 단위로 비교하고, 명시적 메모나 calibration feedback으로 가장 설명력 있는 가설을 확인한다.

### 7.3 단일 속성보다 evidence 조합을 본다

회사 결정은 대개 학교, 회사, 역할, seniority, ownership과 성과가 합쳐진 결과다. 속성별
positive 비율만 따로 계산해 가장 높은 값을 request로 옮기면 상호작용과 노출 편향을 놓친다.

예를 들어 같은 학교 출신 두 명 중 한 명은 FDE ownership과 제품 출시가 있고 다른 한 명은
직무가 다를 수 있다. 이때 학교가 아니라 `학업 anchor + role-direct ownership` 조합이 실제
통과 경로일 수 있다. 다음 순서로 비교한다.

1. Positive마다 통과를 설명할 수 있는 독립 evidence 조합을 2~4개로 요약한다.
2. Negative에서 같은 조합이 있었는지 확인한다.
3. 같은 단일 속성을 공유하지만 outcome이 다른 경계 사례를 우선 읽는다.
4. 차이를 설명하는 역할 범위·본인 기여·성과·최근성·언어 같은 조건을 찾는다.
5. 여러 설명이 가능하면 하나를 정답으로 고르지 말고 calibration 대상으로 남긴다.

### 7.4 단일 사례로 기준의 범위나 강도를 바꾸지 않는다

하나의 outcome은 특정 시점의 `[후보자 전체 profile × Role × 당시 request]` 조합에 대한
결정이다. 그 사례를 구성하는 개별 feature 중 무엇이 결정에 기여했는지까지 자동으로 알려 주지
않는다. 따라서 단일 positive나 negative만으로 특정 feature를 새 통과 경로, 대체 evidence,
가산점, 감점 또는 배제 기준으로 승격하지 않는다. 기존 기준을 완화·강화하거나 적용 범위를
넓히고 좁히는 데도 단일 사례를 사용하지 않는다.

사례에서 feature 수준의 기준을 도출하려면 다음을 구분해 확인한다.

1. 결정권자가 그 feature를 이유로 직접 언급했는가
2. 비교 가능한 Role·request 아래의 독립된 여러 사례에서 같은 방향이 반복되는가
3. 같은 feature를 가졌지만 outcome이 다른 반대 사례가 있는가
4. 기존 retrieval과 노출 과정이 해당 feature를 과대표집했는가
5. 사례 시점의 profile·Role·request가 현재와 충분히 같은가

명시적인 회사 발화가 있으면 사례 수가 하나여도 그 발화의 정확한 범위 안에서는 기준 후보가
될 수 있다. 다만 한 후보에 대한 설명을 사람의 범주 전체나 다른 Role로 확장하지 않는다.
이유가 없는 단일 사례는 다음 용도로만 사용한다.

- 초안이 그 사례의 **전체 evidence 조합**을 어떻게 판단하는지 보는 regression case
- 지나치게 절대적인 기존 규칙이 실제 관측과 충돌한다는 counterexample
- 다음 profile calibration에서 확인할 질문

이유가 없는 단일 사례로 새로운 허용·배제 범주를 만들거나, feature 간 동등성을 선언하거나,
전체 company bar를 낮추거나 높이지 않는다. 오래된 사례는 현재와 Role scope, request 또는
회사의 hiring 단계가 달라졌을 가능성이 크므로 transferability를 더 낮게 본다. 이 원칙은
positive와 negative에 대칭적으로 적용한다.

### 7.5 기준 하나마다 다섯 가지를 쓴다

새 request 문장은 가능하면 다음 다섯 부분을 포함한다.

1. **판단축**: 무엇을 보는가
2. **강도**: hard requirement, 강한 가산점, 보통 가산점, 감점 중 무엇인가
3. **관측 evidence**: 프로필의 어떤 사실로 충족을 판단하는가
4. **검증된 동등 evidence**: 실제 근거가 있을 때만 무엇을 같은 bar로 인정하는가. 없으면
   `정의되지 않음`으로 두는가
5. **판정 효과**: 충족·불충족·정보 부족일 때 `companyFit`이 어떻게 달라지는가

나쁜 예:

> 강한 학업 성취를 선호한다.

개선 예:

> 학업 배경은 강한 가산점이다. 회사가 직접 확인한 최상위 anchor 학교·프로그램은 A군
> `[학교 5개]`, 다음 anchor는 B군 `[학교 6개]`로 둔다. 이는 whitelist가 아니라 학업
> 선별성과 기술 기초의 기대 수준을 설명하는 예시다. A군은 독립적인 caliber 신호 하나로
> 인정하지만 role-direct ownership 근거가 함께
> 있어야 한다. B군은 보조 가산점이며 role-direct evidence 부족을 대신하지 않는다. 목록에 없는
> 학교라는 이유만으로 A군·B군과 동등하다고 간주하거나 자동 감점하지 않는다. 회사가 직접
> 동등성을 확인했거나 충분한 반복 evidence가 있을 때만 별도 경로를 정의한다. 학교명만 있고
> 후보자 본인의 성취·역할 evidence가 없으면 단독 통과 근거로 쓰지 않는다.

여기서 `[학교 5개]`, `[학교 6개]`는 일반적인 명성 순위로 채우지 않는다. 다음 중 하나가
있을 때만 구체적인 이름과 tier를 쓴다.

- 회사가 현재 Role에 대해 학교와 tier를 직접 명시함
- 충분한 동일 Role 사례와 이유 있는 회사 결정이 반복되어 순서를 구분할 근거가 있음
- calibration profile에 대한 회사의 Good/Bad 설명이 학업 bar를 직접 구체화함

반면 소수의 positive가 서로 다른 학교에 분포되어 있다면 정밀한 5+6 tier를 만들 근거가 없다.
그 경우에는 학교보다 실제로 반복된 역할·성과 조합을 먼저 명시하고, 학교는 강한 보조 신호로
둔다. **구체성이 중요하다는 이유로 존재하지 않는 정밀도를 만들어서는 안 된다.**

중요한 것은 위 예시의 A군·B군 이름이 아니라 **각 tier가 판정에 미치는 효과**다. `최상위`,
`좋은 학교`라는 형용사만 붙이면 LLM은 이 신호가 단독으로 충분한지, 다른 근거와 결합해야
하는지 알 수 없다. 최소 독립 신호 수나 결합 규칙도 실제 company evidence가 있을 때 명시한다.
근거 없이 모든 Role에 `강한 신호 두 개` 같은 공통 공식을 적용하지 않는다.

### 7.6 학교·회사는 이름, 의미와 효과를 함께 쓴다

현재 production evaluator는 명시된 학교나 회사를 intended level을 설명하는 anchor로 읽되,
exhaustive whitelist로 읽지 않는다. 또한 이름·title·prestige만으로 능력이나 회사 관심을
추론하지 않도록 되어 있다.

따라서 구체적인 학교·회사명이 실제 기준이라면 숨기지 말고 적되, 이름만 나열하지 않는다.

```text
[학업 anchor]
- 최강 가산점 예시: <학교·프로그램 목록>
- 다음 가산점 예시: <학교·프로그램 목록>
- 이 anchor가 뜻하는 것: 선별성, 전공 난도, 학업 성취와 기술 기초
- 판정 효과: 각 tier가 독립 신호로 인정되는지, 무엇과 결합해야 하는지
- 검증된 동등 evidence: <회사 확인 또는 반복 근거가 있는 경우만 기재; 없으면 정의하지 않음>

[회사·팀 anchor]
- 강한 가산점 예시: <회사 및 관련 기술 조직 목록>
- 이 anchor가 뜻하는 것: 높은 hiring bar 자체가 아니라 후보자가 맡은 scope, progression,
  production 책임, 고객 또는 조직이 맡긴 신뢰
- 필요한 결합 evidence: 실제 본인 기여, end-to-end ownership, 측정 가능한 결과
- 판정 효과: 소속만 있을 때와 scope·성과까지 확인될 때의 차이
- 검증된 동등 evidence: <회사 확인 또는 반복 근거가 있는 경우만 기재; 없으면 정의하지 않음>
```

학교와 회사가 같은 `prestige`를 두 번 가산하지 않도록 한다. 둘을 모두 볼 때는 각 신호가
추가로 증명하는 바가 달라야 한다.

회사가 실제로 특정 학교·회사 집합만 허용하는 exhaustive membership rule을 요구하더라도,
현재 evaluator 계약에서는 request에 목록을 적는 것만으로 그 동작을 보장할 수 없다. 현재
prompt가 named school·employer를 whitelist가 아닌 level anchor로 해석하기 때문이다. 이런
요구가 정말 hard policy라면 request 보정으로 끝내지 말고 evaluator prompt·evaluation 계약을
별도로 변경·검증해야 한다.

### 7.7 국적·성별과 인접 정보

현재 evaluator는 이름, 국적과 demographic proxy로 능력이나 회사의 관심을 추론하지 않고
보호 특성을 사용하지 않는다. 따라서 성별은 request 기준으로 작동하지 않으며, 국적도 일반적인
caliber 가산·감점으로 쓰지 않는다.

대신 Role에 실제로 필요한 사실을 직접 쓴다.

- 협업에 필요한 언어와 요구 수준
- 현재 근무지와 근무 방식
- target country 근무 의향
- work authorization 또는 명시적으로 필요한 시민권·clearance
- 해당 지역에서 실제로 일하거나 공부한 evidence

이름이나 사진으로 국적·언어를 추정하지 않는다. 특정 시민권이 법적 hard requirement인
경우에만 그 정확한 요건을 쓰고, 이를 실력이나 품질 점수와 섞지 않는다.

### 7.8 Criterion evidence card

“특정 속성의 positive 수가 많다”는 한 줄 집계 대신, request에 넣을 criterion마다 아래 card를
만든다. 이 card는 owner-only run artifact이며 request 본문에 복사하지 않는다.

```json
{
  "criterion": "customer-facing production ownership",
  "proposedStrength": "hard|strong_plus|plus|minus",
  "positiveSupport": ["source ids"],
  "negativeSupport": ["source ids"],
  "counterexamples": ["source ids"],
  "exposureCoverage": "이 속성을 가진 profile이 회사에 얼마나 제시됐는지",
  "decisionTimeProfileCoverage": "complete|partial|current_only",
  "requestHistoryCoverage": "complete|partial|latest_only",
  "possibleConfounders": ["school", "employer", "seniority", "retrieval bias"],
  "candidateEvidence": "미래 profile에서 무엇을 확인하는지",
  "equivalentEvidence": {
    "status": "verified|not_defined",
    "items": ["검증된 경우만 기재"]
  },
  "fitnessEffect": "충족·불충족·누락 시 companyFit 효과",
  "conclusion": "add|clarify|retain|weaken|remove|calibrate_more"
}
```

같은 후보의 중복 event는 support 수를 늘리지 않는다. Count보다 source quality, 결정 주체,
동일 Role 여부, profile/request version coverage와 counterexample을 우선한다. 학교·회사처럼
기존 retrieval이 이미 강하게 선별한 속성은 노출 denominator가 없으면 positive 비율을 회사의
일반 선호도로 해석하지 않는다.

## 8. Request로 승격할 evidence gate

모든 관측을 request에 넣지 않는다. 기준의 강도에 따라 필요한 근거도 다르다.

### 8.1 Hard requirement 또는 명시적 불충족 기준

다음 중 하나가 필요하다.

- 회사가 최신 발화나 메모로 기준을 직접 명시했다.
- 동일 Role의 설명 있는 pre-pending 결정에서 같은 기준이 반복됐다.
- positive 사례의 통과 경로와 설명 있는 negative 사례의 경계가 함께 확인됐고, Role 성공에
  필수적인 이유도 현재 JD·request와 일치한다.
- profile calibration에서 회사가 Good/Bad의 이유로 기준을 명시했다.
- 기존 request의 기준을 회사가 최근 명시적으로 정정했다.

### 8.2 가산점·감점 기준

직접적인 회사 설명이 가장 좋지만, 반복된 outcome pattern도 사용할 수 있다. 이때 다음을 모두
확인한다.

- 동일 Role의 verified positive와 verified pre-pending negative를 비교했다.
- 기존 retrieval이 특정 배경만 보여 준 결과가 아닌지 확인했다.
- 단일 학교·회사·title이 아니라 다른 evidence와의 조합 및 counterexample을 검토했다.
- 결과가 바뀐 후보가 있어도 post-pending 인터뷰 결과는 사용하지 않았다.
- 패턴과 충돌하는 사례를 숨기지 않고 criterion의 범위·강도·confidence에 반영했다.

사유 없는 negative가 반복 pattern을 지지하면 soft plus/minus의 근거가 될 수 있지만, 어떤
속성이 실제 원인이라고 단정하지 않는다. 다음 scheduled run에서 반례가 쌓이거나 회사의 직접
설명이 나오면 유지·강화·삭제한다.

### 8.3 Context에만 남길 것

Stage만 있고 이유가 없는 단일 positive는 “이 프로필 조합은 통과했다”는 사례로는 쓸 수
있지만 그 안의 특정 속성을 독립된 기준으로 승격하기에는 부족하다. Provenance와 의미가
불명확한 archive도 새 기준을 만들 수 없다. Company-side임이 검증된 이유 없는 negative는
outcome에는 포함하되, 독립 criterion으로 설명할 수 없으면 context 또는 calibration 가설로만
남긴다. `company_behavior_contexts`에는 다른 고신호 evidence와 결합해 실제 다음 판단을 바꾸는
경우에만 넣고, 그렇지 않으면 run artifact의 검토 가설로만 보존한다.

근거는 있지만 아직 durable criterion인지 불확실하면 `company_behavior_contexts`에 제한과
불확실성을 남기고 request는 유지한다. `request`에는 현재 회사가 앞으로도 적용하기를 원하는
명시적이고 비교적 안정적인 판단 기준만 둔다. 변경할 내용이 없다는 결론도 정상 결과다.

같은 criterion을 request와 behavior context에 중복해 넣어 두지 않는다. Request로 승격되어
적용된 문장은 다음 Company Context Run에서 context의 중복 문장을 제거하거나, request에 없는
예외·변화·불확실성만 남긴다. 그렇지 않으면 같은 기준이 LLM 입력에서 두 번 강조되어 실제보다
강한 bar처럼 작동할 수 있다.

### 8.4 최소 변경은 문장별 재검증 뒤에 적용한다

기존 request는 현재 저장값이라는 이유만으로 모두 옳다고 가정하지 않는다. 동시에 source를
확인하지 못했다는 이유만으로 회사의 기존 기준을 함부로 삭제하지도 않는다. 먼저 기존 request를
독립된 판단 문장으로 나누고 각 문장에 다음 상태를 붙인다.

| 상태 | 조건 | 처리 |
| --- | --- | --- |
| `validated_current` | 최근 회사 발화·승인과 일치하고 runtime/JD와 충돌하지 않음 | `retain` 또는 의미 보존 `clarify` |
| `unverified_origin` | 회사 고유 기준으로 보이고 충돌은 없지만 최초 source를 복원하지 못함 | incremental update에서는 보존하고 검증 필요 표시; full rewrite에서는 포함·삭제를 임의 결정하지 않고 확인 전까지 block |
| `runtime_owned` | 공통 evaluator가 이미 책임지는 정책·label 규칙 | request에서 제거하고 runtime 계약을 참조 |
| `role_field_owned` | JD나 구조화 Role field에 이미 정확히 존재 | 회사 고유의 더 엄격한 해석이 없으면 중복 제거 |
| `conflict` | runtime, Role field 또는 최신 회사 발화와 모순 | 자동 retain 금지; authoritative source를 확인할 때까지 적용 보류 |
| `stale_or_inferred` | 과거 정책·모델 판단·운영 추측에서 왔거나 현재 적용 근거가 없음 | request에서 제외하거나 `calibrate_more` |

그 뒤에만 변경 action을 정한다.

- `retain`: `validated_current`이고 이번 evidence가 의미를 바꾸지 않음
- `clarify`: 같은 기준을 유지하면서 candidate evidence와 판정 경계만 분명하게 함
- `add`: 현재 request에 없고 Section 8의 evidence gate를 통과한 회사·Role 고유 기준
- `weaken` 또는 `strengthen`: 근거가 강도 변경을 직접 뒷받침함
- `remove`: request 소유가 아니거나 철회·충돌·stale이 확인됨
- `calibrate_more`: 방향은 가능하지만 현재 근거로 범위와 강도를 확정할 수 없음

`기존 request에 있었음`, `예전 실행에서도 사용했음`, `문장을 지우면 결과가 달라질 수 있음`은
그 자체로 retain 근거가 아니다. 최소 변경은 **검증된 의미를 불필요하게 다시 쓰지 않는다**는
뜻이지, 검증하지 않은 문장을 영구 승계한다는 뜻이 아니다.

## 9. Request 문서 구조

현재 company-side `update_data`의 rewrite 계약은 `## Hard constraints`와
`## Preferred criteria` 두 heading을 요구한다. 기존 request가 자유 형식이어도 새 전체값을
rewrite할 때는 이 canonical heading을 사용한다. 모든 하위 항목을 채울 필요는 없으며 2,000자
안에서 중요한 것만 남기는 것을 request 자체의 규칙으로 삼지 않는다. 현재 Worker projection에
맞춘 적용본이 필요하면 핵심 기준을 앞에 두고, 손실 없이 줄일 수 없는 내용은 projection 변경과
함께 다룬다.

```markdown
## Hard constraints
- `[roleFit]` 핵심 function, depth, 언어·근무 조건 등 실제 수행 hard requirement
- `[companyFit]` 회사가 직접 확인한 non-negotiable interview bar가 있으면 그 기준과 evidence
- 확인된 불충족과 단순 evidence 부족을 구분하는 경계

## Preferred criteria

### 회사 caliber bar
- 회사가 일반적인 role-ready 후보보다 추가로 기대하는 수준
- 통과 가능한 evidence 조합과 필요한 독립 신호 수

### 강한 가산점
- 구체적인 학교·프로그램, 회사·팀, progression, ownership, 성과 anchor
- 각 anchor가 의미하는 것과 검증된 동등 evidence의 유무·조건

### 감점 또는 명시적 불충족
- 어떤 profile evidence가 왜 회사 bar를 통과하지 못하는지
- evidence 부족인 ambiguous와 확인된 bar 미달인 unfit을 구분

### 검증된 동등 evidence
- 회사가 직접 확인했거나 독립된 반복 사례로 검증된 경우에만, 서로 다른 evidence가 같은 bar를
  충족하는 조건
```

Request에는 `A가 Good`, `후보 3이 archive` 같은 과거 사건을 쓰지 않는다. 미래 후보에게
적용할 수 있는 현재형 기준으로 일반화한다.

## 10. Draft 전에 기존 문장과 새 문장을 같은 방식으로 감사한다

기존 request 검토와 outcome 기반 새 기준 도출을 별도 단계로 실행한다. 기존 문장을 복사한 뒤
새 내용을 덧붙이는 방식으로 시작하면, 출처가 다른 정책과 기준이 한 문단에 섞여도 발견하기
어렵다.

### 10.1 Existing-clause audit

기존 request를 하나의 판단만 담은 clause로 나누고 아래 항목을 기록한다.

```json
{
  "clause": "현재 request의 한 판단 문장",
  "owner": "runtime|role_field|company_request|unknown",
  "source": "직접 발화·승인·event·artifact ID 또는 unknown",
  "scope": "company|role|role_family|global",
  "currentness": "current|possibly_stale|unknown",
  "runtimeRelation": "compatible|duplicate|conflict|unknown",
  "action": "retain|clarify|remove|resolve_conflict|calibrate_more"
}
```

`owner=unknown`이나 `runtimeRelation=unknown`을 조용히 `retain`으로 바꾸지 않는다. Incremental
update에서 당장 삭제할 근거도 없다면 저장값은 건드리지 않되 proposal의 미검증 항목으로
분리한다. Full rewrite에서는 검증되지 않은 기존 문장을 새 표현으로 재생산하거나 조용히
삭제하지 않고, source 복원 또는 권한 있는 owner의 확인 전까지 해당 rewrite를 block한다.

### 10.2 Proposed-clause audit

새로 넣을 각 clause도 같은 단위로 검토한다. 최소한 다음이 있어야 한다.

- 이 회사·Role에 필요한 이유
- 근거 source와 시점
- hard, plus, minus 중 의도한 강도
- 미래 후보 profile에서 확인할 evidence
- 충족, 불충족, 정보 부족의 판정 차이
- 적용 범위와 다른 Role로 전이 가능한지 여부
- 단일 사례, selection bias와 반대 evidence 검토 결과

기존 문장은 provenance 없이 통과시키고 새 문장에만 엄격한 evidence gate를 적용해서는 안 된다.
두 종류 모두 동일한 ownership·충돌·현재성 검사를 통과해야 최종 draft에 들어간다.

### 10.3 변경 대상을 분리한다

감사 결과는 하나의 request rewrite로 모두 해결하지 않고 다음 queue로 나눈다.

1. `request change`: 회사·Role 고유의 private 판단 기준
2. `runtime issue`: evaluator의 공통 판정·입력·label 계약 문제
3. `role data issue`: JD, location, work mode, compensation 등 source field 오류
4. `context hypothesis`: 아직 durable request criterion으로 승격할 수 없는 관찰
5. `no-op`: 현재 request의 의미를 바꿀 충분한 근거가 없음

서로 다른 owner의 문제를 request 문장 하나로 덮어쓰지 않는다. 특히 runtime과 request가
충돌하면 prompt 내 우선순위에 결과를 맡기지 말고, authoritative layer를 먼저 정정한 뒤
request draft를 다시 만든다.

## 11. Scheduled 실행 절차

### 11.1 시작 전

1. repository의 `AGENTS.md`, 이 문서와 관련 Company Context 문서를 읽는다.
2. 실제 production evaluator prompt, input builder와 Role card projection을 읽어 현재 runtime
   contract를 확인한다. 설계 문서만으로 대신하지 않는다.
3. Role이 internal, non-test, 실행 가능한 상태인지 확인한다.
4. 현재 JD와 구조화 Role field, `company_internal_roles.request`, optional criteria와 Role
   context를 각각 읽는다.
5. 현재 request를 clause로 나누어 Section 10.1의 ownership·source·scope·currentness·runtime
   relation을 먼저 기록한다.
6. 현재 request 원문과 content hash를 snapshot한다.
7. 이전 성공 실행 이후의 신규 evidence뿐 아니라, 이전에 positive였던 후보의 뒤늦은 archive처럼
   label을 잘못 뒤집을 수 있는 전체 timeline도 확인한다.

### 11.2 수집과 분류

1. 동일 Role의 recommendation, progress, tag, company note를 각각 pagination 누락 없이 읽는다.
2. 회사 actor, Harper operator, 후보자와 system event를 구분한다.
3. test·QA·E2E evidence를 제거한다.
4. 후보자별 timeline과 최고 stage를 복원한다.
5. Section 4의 계약으로 `positive | negative | unknown`을 부여한다.
6. 결정 당시 profile, request와 JD version을 가능한 범위에서 복원하고 coverage를 기록한다.
7. 당시 request 아래에서 생성된 `talent_opportunity_fit.reason`과 당시 후보자 evidence를 함께
   읽어 evaluator의 기존 해석을 진단한다.

### 11.3 기준 도출과 draft

1. Existing-clause audit에서 `retain|clarify`가 확인된 문장만 baseline으로 둔다. `conflict`,
   `runtime_owned`, `role_field_owned`, `stale_or_inferred`는 request 본문과 별도 queue로 분리한다.
2. Positive에서 회사가 수용한 전체 evidence 조합을 찾되, 개별 feature의 인과효과로 분해하지
   않는다.
3. Pre-pending negative 전체로 분리력을 검토하고, 설명 있는 negative에서 실제 경계를 찾는다.
4. 노출 편향, profile·request version, 작은 표본, sibling Role 전이와 반대 evidence를 검토한다.
5. 각 새 criterion에 판단축, 강도, 관측 evidence, 검증된 동등 evidence와 판정 효과를 쓴다.
6. 최종 draft의 **모든 clause**에 existing 또는 proposed audit record가 있는지 확인한다. 단지
   기존 request에서 복사했다는 이유로 source 없는 문장을 허용하지 않는다.
7. 현재 request와 새 draft의 문장별 diff, source ID와 별도 issue queue를 owner-only run
   artifact에 남긴다.
8. 필요한 판단 계약을 완전하게 작성하고, 현재 2,000자 Worker projection 안에서 손실 없이
   전달되는지 확인한다. 손실이 있으면 기준을 임의로 버리지 말고 projection 변경을 별도
   evaluation 대상으로 올린다.

### 11.4 쓰기 전 검증

과거 사례를 label 복제용 정답지가 아니라 regression 사례로 사용해 다음을 확인한다.

- 과거 positive의 historical label을 그대로 보존하면서도, 새 request가 이를 반드시 다시
  통과시켜야 하는 gold로 사용하지 않았는가
- 과거 positive의 예상 판정이 바뀌면 최신 회사 기준·Role scope·당시 profile coverage 중 어떤
  근거로 달라졌는지 설명 가능한가
- 명시적 pre-pending negative의 결정적 경계를 새 request가 설명하는가
- 사유 없는 verified negative를 모두 positive로 예측하는 무력한 기준은 아닌가
- Named anchor를 실제 계약보다 좁은 exact-name whitelist로 바꾸거나, 검증되지 않은 동등성을
  임의로 추가하지 않았는가
- 추상 문구마다 실제 candidate evidence와 예상 reason 문장이 존재하는가
- evidence 부족은 ambiguous, 확인된 bar 미달은 unfit으로 구분되는가
- 인터뷰 결과, candidate-side 반응과 운영 archive가 company bar에 섞이지 않았는가
- 회사 결정 이후 생긴 profile 정보가 과거 outcome의 원인처럼 사용되지 않았는가
- 현재 Worker projection에서 잘리는 기준이 있는가. 있다면 2,000자에 억지로 맞추는 대신
  projection 변경 또는 적용 보류가 필요한가

새 request가 기존 positive를 배제한다고 곧바로 실패로 판정하지 않는다. 반대로 그 사례를 다시
통과시키기 위해 request에 예외를 추가하지도 않는다. 최신 기준의 실제 변화인지, 당시와 현재
input 차이인지, 또는 잘못된 일반화인지 source를 다시 확인한다.

#### 실제 evaluator shadow check

Request가 company bar나 통과 경로를 실질적으로 바꾸면 문장만 읽고 끝내지 말고, 가능한 경우
현재 production prompt·input builder·normalizer를 그대로 사용한 read-only shadow evaluation으로
해석을 확인한다.

- Model 입력에는 회사 outcome label, 이후 stage와 인터뷰 결과를 넣지 않는다.
- Known positive, verified pre-pending negative와 현재 criterion의 실제 경계 사례를 포함한다.
  동등 evidence를 정의했다면 그 근거 사례도 포함한다.
- Positive를 무조건 과거 label로 복제시키는 것이 아니라 새 request가 어떤 evidence로
  `companyFit`과 reason을 만드는지 본다.
- Negative에 사유가 없으면 특정 `unfit` reason을 gold로 발명하지 않는다. 다만 초안이 모든
  negative를 높은 fit으로 만드는지 확인한다.
- `companyFit`뿐 아니라 `roleFit`이 회사 caliber 기준 때문에 잘못 낮아지지 않는지 확인한다.
- 결과를 production `talent_opportunity_fit`에 쓰거나 candidate에게 발송하지 않는다.

이 검증을 반복 가능한 LLM evaluation으로 운영할 경우
[`docs/evaluation/README.md`](../evaluation/README.md)와
[`internal-fit-abc`](../evaluation/internal-fit-abc/README.md)의 dataset version, frozen gold,
production runner 재사용과 privacy 계약을 따른다. 기존 frozen dataset이나 gold를 새 request
결과에 맞춰 덮어쓰지 않는다.

### 11.5 쓰기와 종료

1. 쓰기 직전에 current request와 Role source를 다시 읽어 snapshot 이후 변경이 없는지 확인한다.
2. 바뀌었으면 오래된 draft를 덮어쓰지 않고 source를 다시 수집한다.
3. Company가 현재 대화나 profile calibration에서 직접 기준을 말해 이미 그 변경을 명시적으로
   요청한 경우에는 해당 authorized flow의 canonical request update를 사용한다.
4. 과거 outcome에서 새 기준을 **추론**한 scheduled run은 old/new diff와 근거를 proposal로
   만든다. 현재 `role_request`가 confirmation-required field이므로 회사 또는 권한 있는 owner의
   명시적 confirmation 없이 자동 적용하지 않는다.
5. 승인된 변경만 canonical company data update 경로로 적용한다. Raw SQL로 request를 직접
   바꾸지 않고, exact `roleId`, expected current request와 canonical heading을 포함한 최종값을
   전달한다.
6. Expected value conflict가 나면 merge하거나 재시도해 덮어쓰지 말고 최신 request부터 다시
   평가한다.
7. 저장 후 원문, 길이, content hash와 Role ID를 다시 읽어 확인한다.
8. 기존 `talent_opportunity_fit`이 자동으로 새 request로 재평가됐다고 가정하지 않는다. 필요한
   refresh는 현재 matching·recovery·reevaluation 계약에 따라 별도로 수행한다.
9. 승격한 criterion이 `company_behavior_contexts`에 중복돼 있으면 다음 Company Context Run에서
   request에 없는 nuance만 남도록 정리할 대상을 기록한다.

## 12. 실행 산출물과 개인정보 경계

Repository에 raw production 후보자 데이터나 회사의 private 메모를 commit하지 않는다. 실행별
상세 자료는 ignored owner-only `runs/` 또는 `private/`에 두고 다음만 남긴다.

- Role ID와 source coverage
- old/new request hash와 길이
- positive, negative, unknown count
- 제외한 test/synthetic count
- decision-time profile·request history coverage와 복원 한계
- criterion별 source ID, confidence와 반대 evidence
- existing/proposed clause audit와 owner별 issue queue
- old/new diff
- no-op, proposal, confirmed update 중 하나의 결론
- confirmation source 또는 아직 승인되지 않은 상태
- write·재조회 verification

Committed 문서나 task 보고에는 후보자 이름, 원문 이력서, private 메모 전문과 개인 연락처를
남기지 않는다.

## 13. 완료 체크리스트

- [ ] `request`를 LLM의 판단 입력으로 작성했고 운영·연락 지시를 넣지 않았다.
- [ ] 실제 production evaluator와 input builder를 읽고 request가 담당하지 않는 공통 정책을
      분리했다.
- [ ] 기존 request의 모든 문장을 owner·source·scope·currentness·runtime relation 기준으로
      재검증했다.
- [ ] 기존 request에 있었다는 사실만으로 문장을 자동 retain하지 않았다.
- [ ] Runtime/JD와 중복·충돌하는 문장을 request로 해결하지 않고 해당 owner의 issue로 분리했다.
- [ ] 목표를 인터뷰 합격이 아니라 `연결대기`로 진행할 profile 식별로 고정했다.
- [ ] 한 번이라도 `연결대기`에 간 후보는 이후 결과와 무관하게 positive로 유지했다.
- [ ] Historical positive를 새 request가 반드시 다시 통과시켜야 하는 gold label로 사용하지 않았다.
- [ ] 단일 사례의 개별 feature를 일반적인 허용·배제 기준이나 대체 경로로 승격하지 않았다.
- [ ] 이유 없는 단일 사례는 전체 evidence 조합의 regression·counterexample·calibration
      용도로만 사용했고, 공통 bar의 범위나 강도를 바꾸지 않았다.
- [ ] 후보자 반응과 company-side 결정을 분리했다.
- [ ] 이유 없는 archive로 negative criterion을 만들지 않았다.
- [ ] Genuine company-side로 확인된 이유 없는 pre-pending 거절·archive는 negative outcome으로
      보존했다.
- [ ] test·QA·E2E evidence를 제외했다.
- [ ] 기존 fit reason을 회사 ground truth로 사용하지 않았다.
- [ ] 가능한 범위에서 결정 당시 profile과 request/JD를 사용했다.
- [ ] 최종 draft의 모든 기존·신규 clause에 source, candidate evidence, 강도와 판정 효과가 있다.
- [ ] 동등 evidence는 실제로 검증된 경우에만 적었고, 개별 사례에서 임의로 만들지 않았다.
- [ ] companyFit의 ambiguous와 unfit을 구분했고 company bar에 hold를 사용하지 않았다.
- [ ] 학교·회사 anchor를 필요하면 구체적으로 썼고 whitelist나 이름 단독 판정으로 만들지 않았다.
- [ ] 데이터가 뒷받침하지 않는 정밀한 tier를 발명하지 않았다.
- [ ] 최종 request가 현재 Worker projection에서 어떻게 전달되는지 확인했고, 필요한 내용이
      잘리면 이를 숨기지 않고 projection 변경 또는 적용 보류로 처리했다.
- [ ] 전체 rewrite라면 `## Hard constraints`와 `## Preferred criteria` heading을 유지했다.
- [ ] Material한 기준 변경이면 outcome leakage 없는 actual-evaluator shadow check를 수행하거나,
      수행하지 못한 이유를 artifact에 남겼다.
- [ ] Outcome에서 추론한 변경을 confirmation 없이 자동 적용하지 않았다.
- [ ] 동시 변경을 덮어쓰지 않았고 저장 결과를 재조회했다.
- [ ] raw production 자료를 repository에 남기지 않았다.
