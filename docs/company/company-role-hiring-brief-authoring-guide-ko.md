# Company Role Hiring Brief 작성 가이드

- 대상: internal Role의 `company_internal_roles.request`
- 적용 범위: 새 Role 작성, 기존 Role 수정, 직접 DB 작업, 프로필 calibration, scheduled refresh,
  코드·프롬프트 리뷰
- canonical source: 이 문서가 Hiring Brief의 공통 작성 계약이다. 작업별 runbook은 evidence 수집,
  권한, 실행 순서와 저장 방법을 추가할 수 있지만 이 작성 계약을 다시 정의하지 않는다.
- 저장 source of truth: `company_internal_roles.request`. `company_roles.request`는 현재 호환용 사본이며,
  직접 DB 작업에서 두 값을 함께 관리해야 하는 경우 최종값이 같은지 검증한다.

## 1. Hiring Brief의 목적

Hiring Brief는 후보자에게 보여 주는 JD가 아니다. 회사가 후보자의 현재 프로필을 보고 이 Role의
인터뷰에 시간을 쓸지를 evaluator LLM이 판단할 수 있도록 주는 private 기준이다.

Hiring Brief에는 다음 세 층을 구분해서 쓴다.

1. **Role eligibility**: 이 Role을 수행하기 위해 실제로 필요한 function, scope, seniority, domain,
   언어와 다른 hard requirement
2. **Company caliber**: Role을 수행할 수 있는 사람 중에서도 회사가 인터뷰하려는 수준을 구분하는
   학업·회사·팀·성과·책임 범위의 bar
3. **Team-specific bonuses**: 필수는 아니지만 이 팀과 Role에서 후보자의 우선순위를 실제로 높이는
   경험과 성과

JD에 이미 충분히 적힌 업무, `location`, `work_mode`, `employment_type`, 보상 등 구조화 field에
정확히 들어 있는 사실을 해석 없이 반복하지 않는다. 회사가 그 사실을 어떻게 판단하는지가 추가로
필요할 때만 Hiring Brief에 쓴다.

## 2. Evidence 우선순위

기준의 출처는 다음 순서로 신뢰한다.

1. 현재 Role에 관해 사용자가 직접 밝힌 필수 조건, 선호, 비선호와 그 이유
2. 사용자가 승인한 Hiring Brief와 Role/JD의 현재 사실
3. 사용자가 좋은 기준점으로 제시한 실제 인물과 그 인물을 좋게 본 이유
4. 검증된 professional profile에서 관찰되는 학교, 회사·팀, 역할 범위, progression, 성과
5. 같은 Role의 독립된 여러 positive/negative 사례와 이유 있는 회사 결정
6. 다른 Role, 유사 회사, 모델의 과거 reason과 일반적인 시장 관행

아래 단계의 evidence는 위 단계의 명시적 기준을 덮어쓰지 않는다. 다른 Role과 시장 관행은 질문이나
초안의 가설로만 사용하며 조용히 저장하지 않는다. 과거 evaluator `reason`은 후보자 evidence를 찾는
index이지 회사의 결정이나 정답이 아니다.

사용자가 학교, 회사, 프로그램 또는 특정 경험의 중요성을 명시했다면 이를 임의로 삭제하거나
추상적인 성향으로 치환하지 않는다. 반대로 실제 근거가 없는 정밀한 tier와 hard cutoff를 만들지 않는다.

## 3. 기준 한 문장의 필수 구성

Hiring Brief의 각 기준은 가능하면 다음 다섯 가지를 답해야 한다.

1. **판단축**: 무엇을 보는가
2. **강도**: hard requirement, 강한 가산점, 보통 가산점, 감점 중 무엇인가
3. **관측 evidence**: 후보자 프로필의 어떤 사실로 충족 여부를 판단하는가
4. **허용되는 대체 evidence**: 무엇을 같은 수준으로 인정하는가. 검증되지 않았다면 임의로 만들지 않는다.
5. **판정 효과**: 충족, 확인된 불충족, 정보 부족이 `roleFit` 또는 `companyFit`에 어떻게 반영되는가

작성 후 각 문장에 다음 질문을 적용한다.

> 이 기준 때문에 후보자를 통과·불충족·불확실로 판단한다면, reason에서 후보자의 어떤 이력·성과·
> 역할 범위를 근거로 설명할 수 있는가?

답할 수 없으면 저장할 기준이 아니다.

## 4. 모호한 표현을 쓰지 않는 방법

`높은 학습 속도`, `ownership`, `스타트업형`, `똑똑한 사람`, `좋은 회사`, `커뮤니케이션이 좋음`처럼
프로필에서 무엇을 확인해야 하는지 정해지지 않은 표현만 저장하지 않는다.

나쁜 예:

> 높은 학습 속도와 고객·제품·기술·운영을 넘나드는 ownership을 선호한다.

개선 방향:

- 학습 속도를 보려면 짧은 기간의 승진, 책임 범위 확대, 낯선 도메인에서 맡은 구체적 시스템과 결과,
  또는 높은 난도의 프로그램·성과처럼 프로필에서 확인할 anchor를 쓴다.
- ownership을 보려면 고객 discovery, 스펙 결정, 직접 구현, production 배포, adoption 또는 성과 측정 중
  실제로 어느 범위를 한 사람이 맡아야 하는지 쓴다.
- 커뮤니케이션을 보려면 고객 임원 대상 발표, 기술·비기술 이해관계자 사이의 trade-off 결정, 다국어
  업무 수행처럼 확인 가능한 상황과 책임을 쓴다.

구체화한다는 이유로 모든 후보자에게 동일한 숫자나 경력 연차를 발명하지 않는다. 숫자, 기간, 규모,
tier는 사용자 발화나 검증된 evidence가 있을 때만 쓴다.

## 5. 실제 팀원·참고 인물에서 기준을 도출하는 방법

참고 인물의 이력을 Hiring Brief에 복사하지 않는다. 각 material signal마다 다음을 분리한다.

1. **Observed anchor**: 검증된 학교·프로그램, 회사·팀, 역할, progression, 결과
2. **Matchable peer group**: exact biography보다 넓고 미래 후보 평가에 쓸 수 있을 만큼 좁은 범주
3. **Rule strength**: requirement, bonus, substitute, context 중 무엇인지

사용자가 왜 그 인물을 좋게 보는지 말한 이유가 가장 강한 evidence다. 이유가 없으면 프로필에서 가장
뚜렷한 professional signal만 작은 수의 가산점으로 해석하며, 새 hard requirement를 만들지 않는다.

- 한 명은 보통 2~4개의 비독점적 bonus를 뒷받침한다.
- 여러 명의 서로 다른 사례에서 반복되는 신호가 있어야 더 넓은 company bar나 대체 경로로 강화할 수 있다.
- 참고 인물의 이름, URL, 연대기, `팀원에게서 유추함` 같은 provenance는 Hiring Brief에 저장하지 않는다.
- 한 사람의 약점이나 비관련 경력은 사용자가 명시하지 않은 새 감점 기준이 아니다.

팀원 프로필을 보고 `높은 학습 속도` 같은 성향으로 압축해서도 안 되고, 팀원들의 전 직장 이름을 그대로
후보 회사 목록으로 만들어서도 안 된다. 학교·회사·역할·성과 신호를 각각 아래 규칙으로 처리한다.

## 6. 학교·프로그램 anchor 작성법

사용자가 학력 bar를 중요하게 보거나 참고 인물이 그 수준의 명시적 anchor라면 학교를 지우지 않는다.
구체적인 학교·프로그램명이 bar를 operational하게 만드는 데 필요하면 그대로 적는다.

학교 기준에는 다음을 함께 쓴다.

- 대표 학교·프로그램 또는 tier
- 그 anchor가 뜻하는 선별성, 전공 난도, 학업 성취 또는 기술 기초
- 학교 신호가 독립적으로 충분한지, role-direct evidence와 결합해야 하는지
- 목록 밖 배경을 동등하게 인정하는 조건이 실제로 확인됐는지
- 학교명만 있고 본인의 성취·역할 evidence가 없을 때의 판정 효과

나쁜 예:

> 명문대 출신을 선호한다.

나쁜 수정:

> 학교는 중요하지 않고 학습 속도가 빠른 사람을 선호한다.

올바른 형태:

> 회사가 확인한 `[학교·프로그램군]`은 강한 학업 가산점이다. 이 anchor는 `[선별성·전공 난도·
> 기술 기초]`를 뜻한다. `[독립 신호인지/role-direct evidence와 결합해야 하는지]`를 명시한다.
> 목록 밖 학교는 자동 감점하지 않으며, 동등 경로는 회사가 확인했거나 반복 evidence가 있을 때만 적는다.

구체적인 tier는 일반 명성 순위로 만들지 않는다. 회사의 직접 기준, 이유가 있는 calibration feedback,
또는 같은 Role의 충분한 반복 사례가 있을 때만 정한다.

## 7. 회사·팀 anchor 작성법

실제 팀원의 전 직장을 그대로 우대 회사 목록으로 복사하지 않는다. 먼저 그 경력이 무엇을 증명하는지
분리한다.

- 채용 선별성 자체가 중요한가
- 특정 function의 핵심 팀에서 일했는가
- production 책임과 고객 난도가 어느 수준이었는가
- 역할이 빠르게 확장되거나 핵심 시스템을 소유했는가
- 측정 가능한 결과나 실제 배포가 있었는가

그다음 같은 수준을 설명하는 matchable peer group을 쓴다. 대표 회사명이 그 수준을 명확하게 만드는 데
필요하고 evidence가 충분하면 여러 representative peer를 적을 수 있지만, exact employer 목록을
exhaustive whitelist로 만들지 않는다. 유명 회사의 비핵심 직무, 짧은 인턴·계약, 소속만 있는 경력과
핵심 팀의 지속적인 기여를 구분한다.

학교와 회사는 같은 `prestige`를 두 번 세지 않는다. 두 신호를 모두 쓰려면 각각 추가로 증명하는 바와
필요한 결합 조건이 달라야 한다.

## 8. Hard constraint, bonus와 negative

- Hard constraint는 사용자가 필수·제외라고 명시했거나, 현재 Role 수행에 필수임이 authoritative
  source에서 확인됐을 때만 만든다.
- 한 positive 사례는 `이 조합이면 통과할 수 있다`는 경로를 보여 줄 뿐, 그 속성이 없으면 탈락한다는
  필요조건을 만들지 않는다.
- 한 negative 사례는 사용자가 말한 거절 이유의 범위를 넘겨 일반화하지 않는다.
- 정보가 없는 것과 확인된 기준 미달을 구분한다. 프로필에 evidence가 없다는 이유만으로 unfit으로
  만들지 않는다.
- 여러 신호가 함께 있어야 하는지, 하나로 충분한지, 무엇이 무엇을 대체할 수 있는지를 근거가 있을 때
  명시한다.

## 9. Canonical 문서 구조

전체 rewrite는 정확히 다음 두 top-level heading을 사용한다.

```markdown
## Hard constraints
- Role 수행에 필요한 실제 hard requirement
- 회사가 직접 확인한 non-negotiable interview bar
- 확인된 불충족과 단순 evidence 부족의 경계

## Preferred criteria

### 회사 caliber bar
- Role-ready 후보보다 회사가 추가로 기대하는 수준
- 통과 가능한 evidence 조합과 필요한 독립 신호

### 강한 가산점
- 학교·프로그램, 회사·팀, progression, 역할 범위와 성과 anchor
- 각 anchor의 의미와 판정 효과

### 감점 또는 명시적 불충족
- 확인된 어떤 evidence가 왜 bar에 못 미치는지

### 검증된 동등 evidence
- 회사가 직접 확인했거나 반복 사례가 있을 때만 허용되는 대체 경로
```

필요 없는 subsection은 만들지 않는다. 특정 후보자 이름, ID, Profile A~E label, 과거 사건과 calibration
provenance는 넣지 않는다.

## 10. 길이와 순서

DB 저장 한도는 20,000자이지만 현재 Worker의 `companyRoleRequest` projection은 앞 2,000자만 전달한다.
이 제약이 바뀌기 전에는 가장 결정적인 hard requirement와 company bar를 앞부분에 둔다. 그렇다고
2,000자를 영구적인 제품 규칙으로 취급하거나 필요한 기준을 조용히 버리지 않는다.

긴 배경 설명보다 실제 판정을 바꾸는 기준을 먼저 쓴다. 같은 의미를 JD와 Hiring Brief에 반복하지 않는다.

## 11. 저장 전 체크리스트

- [ ] 사용자 또는 authoritative source가 각 기준의 강도와 범위를 뒷받침한다.
- [ ] 학교를 중요하게 본다는 evidence가 있는데 추상 표현으로 지우지 않았다.
- [ ] 팀원·참고 인물의 전 직장을 그대로 우대 회사 whitelist로 복사하지 않았다.
- [ ] 모든 기준이 미래 후보 프로필에서 확인할 observable evidence를 가진다.
- [ ] `높은 학습 속도`, `ownership`, `스타트업형` 같은 표현만 남지 않았다.
- [ ] Role eligibility, company caliber와 team-specific bonus가 구분된다.
- [ ] hard requirement는 명시적 근거가 있고 bonus를 hard cutoff로 올리지 않았다.
- [ ] 정보 부족과 확인된 불충족을 구분한다.
- [ ] full rewrite는 canonical top-level heading을 사용한다.
- [ ] 핵심 기준이 현재 Worker projection 뒤에 숨지 않았다.
- [ ] `company_internal_roles.request`와 필요한 호환 사본의 최종값을 검증했다.

