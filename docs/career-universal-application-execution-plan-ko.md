# Career Harper 범용 대리 지원 실행 계획

작성일: 2026-08-27  
상태: 구현 전 제품·기술 계획  
범위: Harper `/career`에서 사용자의 명시적 요청을 받아 외부 채용 기회에 실제 지원서를 제출하고, 제출 결과까지 관리하는 기능

> 이 문서는 배포된 기능을 설명하지 않는다. 현재 `/career`는 외부 채용 사이트에 지원서를 대신 제출하지 않으며, 이 문서는 그 기능을 넓은 범위에서 가능하게 만들기 위한 계획이다.

## 1. 결론

특정 ATS와의 개별 API 연동만으로 범용 대리 지원을 만들 수는 없지만, **지원 실행을 하나의 채널에 의존하지 않고 여러 실행 경로와 폴백을 조합하면 넓은 범위의 외부 채용 사이트에서 Harper가 실제 제출까지 책임지는 제품을 만들 수 있다.**

핵심 전제는 다음과 같다.

1. Greenhouse, Lever, Ashby 같은 공식 API는 범용성의 기반이 아니라, 지원 가능한 여러 실행 경로 중 가장 안정적인 하나다.
2. 범용성의 주력은 사람이 지원할 때 사용하는 것과 같은 웹 브라우저를 Harper가 조작하는 **범용 브라우저 실행 계층**이다.
3. 사이트 로그인, MFA, CAPTCHA, 이메일 인증처럼 사용자의 개입이 불가피한 순간에는 같은 실행 세션을 사용자에게 잠시 넘겼다가 Harper가 이어서 처리한다.
4. 브라우저 에이전트가 확신하지 못하는 경우 Harper 운영자가 같은 세션을 이어받는 human-in-the-loop 경로를 둔다.
5. API, 브라우저, 사용자 인계, 운영자 인계, 이메일/리퍼럴 경로를 하나의 실행 라우터 아래 묶는다.
6. 사이트 정책이나 기술적 제한 때문에 대리 제출이 허용되지 않는 채널은 억지로 우회하지 않고, 공식 제휴 또는 사용자 직접 제출 경로로 분기한다.

이 구조에서 “Harper가 대신 지원한다”는 의미는 모든 단계가 100% 무인이라는 뜻이 아니다. **지원 요청을 받은 뒤 대상 확인, 문서와 답변 준비, 폼 작성, 예외 처리, 제출, 영수증 확인, 파이프라인 기록까지 Harper가 주도하고, 사용자만 해결할 수 있는 단계에서만 최소한의 행동을 요청한다**는 뜻이다.

따라서 제품 목표는 다음처럼 정의한다.

> 사용자가 `/career`에서 특정 기회에 “지원해줘”라고 명시하면 Harper가 실행을 소유한다. 지원 가능한 경로를 스스로 선택하고, 필요한 답변과 문서를 준비하고, 외부 사이트에 제출한 뒤, 제출이 확인될 때까지 상태를 추적한다.

## 2. 범위와 성공 정의

### 2.1 포함 범위

- Harper가 추천한 외부 공고
- 사용자가 URL로 가져온 외부 공고
- 회사 공식 채용 페이지
- ATS가 호스팅하는 지원 폼
- 로그인된 채용 플랫폼의 지원 폼
- 이메일 지원, 리퍼럴 전달, 채용담당자 직접 전달
- PC 및 모바일 웹에서 시작된 요청
- 여러 페이지로 구성된 지원서
- 계정 생성, 이메일 인증, 로그인, MFA, CAPTCHA가 중간에 있는 흐름
- 이력서, 자기소개서, 포트폴리오 등 파일 업로드
- 제출 후 확인 페이지, 지원 ID, 확인 이메일을 통한 결과 검증
- 제출 이후 정정, 철회, 후속 연락이 가능한 경우의 관리

### 2.2 별도 제품 흐름으로 유지할 범위

- Harper 내부 역할의 후보자 수락과 회사 연결
- 회사가 Harper를 통해 후보자를 직접 검토하는 internal recommendation
- 채용 플랫폼의 네이티브 모바일 앱에서만 가능한 흐름
- 정부 보안 허가, 금융 적격성, 의료 면허 등 별도 신원 검증이 핵심인 지원

내부 역할은 외부 ATS 제출과 합치지 않는다. 회사 연결에 대한 현재 동의·검토 흐름을 유지하고, 회사가 자사 ATS 등록까지 요구할 때에만 연결 완료 후 외부 지원 실행을 추가한다.

### 2.3 성공의 세 가지 수준

지원 가능 범위를 평가할 때 아래 지표를 섞지 않는다.

| 지표 | 의미 |
| --- | --- |
| 실행 경로 보유율 | 요청된 공고에 API, 브라우저, 운영자, 이메일 등 하나 이상의 실행 경로가 있는 비율 |
| 무인 완료율 | 사용자나 운영자 개입 없이 제출 영수증까지 확인한 비율 |
| Harper 주도 완료율 | 중간에 사용자 인계가 있었더라도 Harper가 실행을 이어받아 제출 확인까지 끝낸 비율 |

초기부터 가장 중요하게 볼 지표는 무인 완료율이 아니라 **Harper 주도 완료율**이다. 무인 완료율은 반복되는 폼을 자동화하면서 점진적으로 높인다.

초기 목표는 다음과 같이 둔다. 분모에서 공고 종료, 중복 지원, 정책상 대리 실행 금지, 웹 지원 경로 자체가 없는 역할을 임의로 빼지 않고 각각 별도 실패·제외 사유로 공개한다.

| 단계 | 실행 경로 보유율 목표 | Harper 주도 제출 확인율 목표 | 사용자 blocking action 목표 |
| --- | ---: | ---: | ---: |
| Concierge 파일럿 | 90% 이상 | 80% 이상 | 지원 건당 중앙값 2회 이하 |
| 범용 브라우저 + 사용자 기기 실행 | 95% 이상 | 90% 이상 | 지원 건당 중앙값 1회 이하 |
| 안정화 이후 | 98% 이상 | 95% 이상 | 반복 지원은 대부분 0회 |

숫자는 Phase 0의 실제 공고 지형 측정 후 다시 확정하되, 특정 ATS만 지원해서 높은 성공률을 만드는 대신 long-tail 공고를 포함한 전체 요청 기준으로 측정한다.

## 3. 현재 상태와 필요한 변화

현재 `/career`의 외부 기회 흐름은 다음 수준이다.

- 외부 JD 링크를 열고 클릭을 기록한다.
- 사용자가 직접 지원한 뒤 `applied`로 상태를 바꿀 수 있다.
- Career LLM에는 외부 지원서를 준비하거나 제출하는 도구가 없다.
- `saved_stage = applied`는 외부 시스템의 제출 영수증이 아니라 사용자 파이프라인 상태다.
- 이력서·프로필·경력 정보는 있지만, 공고별 질문과 확인된 답변을 관리하는 지원서 원장은 없다.
- 제출에 사용된 정확한 이력서 버전과 답변 스냅샷을 고정하는 구조가 없다.

범용 대리 지원을 위해서는 기존 추천 기능 옆에 기능 하나를 더하는 것이 아니라 아래 네 개의 계층이 추가되어야 한다.

1. **Application Intelligence**: 어떤 답변과 문서로 지원할지 준비한다.
2. **Execution Router**: 어떤 실행 경로로 제출할지 결정한다.
3. **Application Executor**: API, 브라우저, 이메일, 운영자 경로로 실제 실행한다.
4. **Verification & Operations**: 제출 영수증을 확인하고 예외와 후속 상태를 관리한다.

## 4. 목표 사용자 경험

### 4.1 명시적 지원 요청은 실행 명령이다

사용자가 특정 기회를 가리키며 아래처럼 말하면 실제 지원 실행 요청으로 처리한다.

- “나 이 역할에 지원할래.”
- “여기 지원해줘.”
- “이 회사 지원 넣어줘.”
- “지난번에 추천한 두 번째 공고 지원 진행해.”

이 요청을 단순히 “지원서를 준비해도 된다”는 의미로 낮춰 해석하지 않는다.

대상 역할이 하나로 확정되고, 사용자가 미리 확인한 지원 프로필과 문서로 모든 필수 항목을 채울 수 있다면 Harper는 중복된 최종 확인 질문 없이 실행을 시작한다. 다음 경우에만 사용자에게 추가 행동을 요청한다.

- 어떤 역할인지 하나로 확정할 수 없다.
- 기존에 확인되지 않은 사실 또는 법적 진술이 필수다.
- 연봉, 비자, 근무 허가, 입사 가능일 등 오래되었거나 지원별로 달라질 수 있는 답변이 필요하다.
- 새로 생성되거나 실질적으로 수정된 이력서·자기소개서의 사용 승인이 필요하다.
- 지원 대상 회사나 데이터 수신처가 사용자가 인지한 대상과 다르다.
- 로그인, MFA, CAPTCHA, 이메일 인증을 사용자가 직접 완료해야 한다.
- 같은 회사·역할에 이미 지원한 기록이 있다.

### 4.2 정상 흐름

```text
사용자: “이 역할 지원해줘.”
  -> Harper가 역할과 최신 지원 URL 확인
  -> 지원 경로 선택
  -> 지원 폼과 필수 질문 확인
  -> 확인된 프로필, 답변, 문서로 지원서 구성
  -> 부족한 항목이 없으면 즉시 실행 시작
  -> API 또는 브라우저로 작성·제출
  -> 확인 페이지/지원 ID/확인 이메일 검증
  -> /career에 “지원 완료”와 제출 내역 기록
```

### 4.3 사용자 인계가 필요한 흐름

```text
Harper가 지원서 작성 중 CAPTCHA/MFA 발견
  -> 현재 입력 내용과 세션을 그대로 보존
  -> 사용자에게 해결해야 할 한 단계만 표시
  -> 사용자가 같은 세션에서 인증 완료
  -> Harper가 세션을 다시 이어받음
  -> 남은 작성, 제출, 영수증 확인 완료
```

사용자 인계는 “직접 지원하세요”라는 포기가 아니다. Harper가 실행을 잠시 멈추고 사용자가 해결해야 할 최소 단계만 요청한 뒤 같은 작업을 계속 소유한다.

### 4.4 여러 공고 지원

사용자가 여러 기회에 지원을 요청할 수는 있지만, 기본값은 기회별 고품질 지원이다.

- 각 역할마다 별도 지원서와 문서 버전을 만든다.
- 한 회사에 여러 역할을 동시에 지원할 때 중복 또는 불리한 인상을 경고한다.
- 사용자별 일일·주간 제출 한도를 둔다.
- 한 문장으로 무제한 대량 지원을 허용하지 않는다.
- 반복 지원 명령은 사용자가 설정한 standing application mandate 안에서만 실행한다.

## 5. 전체 실행 구조

### 5.1 구성 요소

```text
/career 대화 또는 기회 카드
          |
          v
Application Command Service
  - 대상 역할 확정
  - 지원 권한/mandate 확인
  - 중복 지원 확인
          |
          v
Application Preparation Service
  - 최신 공고/폼 수집
  - 답변 결정
  - 문서 버전 고정
  - 누락/민감 항목 판정
          |
          v
Execution Router
  1. Harper 내부 연결
  2. 공식 ATS/API
  3. 사용자 기기의 브라우저
  4. Harper 관리 브라우저
  5. 이메일/리퍼럴
  6. 운영자 인계
          |
          v
Submission Verifier
  - 확인 페이지
  - 외부 지원 ID
  - 확인 이메일
  - 중복·불확실 제출 방지
          |
          v
Career Pipeline / Activity Log / Follow-up
```

### 5.2 실행 라우터 원칙

라우터는 공고를 수집한 `source_provider`만 보고 결정하지 않는다. LinkedIn에서 발견한 공고가 실제로는 회사의 Workday 또는 Greenhouse로 이동할 수 있기 때문이다.

다음 정보를 실행 직전에 확인한다.

- 최종 canonical 지원 URL과 호스트
- 리다이렉트 이후 실제 지원 시스템
- 로그인 필요 여부
- 지원 폼이 iframe인지 외부 도메인인지
- 공식 API 연결 여부
- 사용자 기기에 해당 사이트의 활성 세션이 있는지
- 관리 브라우저에서 익명 또는 새 계정 지원이 가능한지
- 사이트별 자동화 정책
- 필수 파일과 질문
- 사용자 인계 가능 여부
- 현재 실행 경로의 최근 성공률과 장애 상태

라우팅 우선순위는 고정된 ATS 목록이 아니라 다음 원칙을 따른다.

1. 허가된 공식 API가 있고 최근 상태가 정상이라면 API를 사용한다.
2. 기존 사용자 로그인이나 로컬 인증이 필요하면 사용자 기기 브라우저를 사용한다.
3. 익명 지원 또는 Harper가 안전하게 관리할 수 있는 세션이라면 관리 브라우저를 사용한다.
4. 공식 이메일·리퍼럴 경로가 더 적절하면 해당 경로를 사용한다.
5. 자동 실행이 불확실하지만 사람이 정상적으로 완료할 수 있으면 운영자에게 넘긴다.
6. 정책상 허용되지 않거나 사용자만 직접 제출해야 하는 채널이면 사용자 실행 모드로 전환하고 Harper가 모든 준비·검증을 보조한다.

하나의 시도 중에도 경로를 바꿀 수 있다. API가 실패했다고 바로 전체 지원을 실패시키지 않고, 같은 지원서 revision과 idempotency key를 유지한 채 브라우저 또는 운영자 경로로 전환한다.

## 6. 실행 채널

### 6.1 공식 ATS·기업 API

공식 API는 가장 예측 가능하고 제출 영수증을 구조화해 받을 수 있는 경로다.

- Harper 고객사 또는 파트너 기업이 ATS 연결을 승인한다.
- 기업 워크스페이스별 credential과 권한을 격리한다.
- 직무별 질문 스키마를 API에서 읽는다.
- Harper의 normalized application을 ATS 형식으로 변환한다.
- 외부 application ID를 저장한다.
- API 장애나 커스텀 질문 미지원 시 다른 경로로 폴백한다.

공식 문서 기준으로 Greenhouse, Lever, Ashby에는 지원서 제출 기능이 있지만 일반 지원자에게 열린 범용 키가 아니라 기업 측 자격증명이 필요하다.

- Greenhouse Job Board API: https://docs.greenhouse.io/job-board.html
- Lever Postings API: https://github.com/lever/postings-api
- Ashby `applicationForm.submit`: https://developers.ashbyhq.com/reference/applicationformsubmit

공식 API는 파트너 기업에 대해서는 가장 먼저 사용하되, 전체 커버리지를 공식 연동 수에 종속시키지 않는다.

### 6.2 사용자 기기 브라우저 실행

사용자의 Chrome 또는 Harper와 연결된 브라우저 companion에서 Harper가 현재 탭을 조작하는 방식이다.

적합한 경우:

- 사용자가 이미 해당 사이트에 로그인되어 있다.
- 패스키, 보안 키, 로컬 세션이 필요하다.
- 채용 사이트가 서버 데이터센터 IP보다 실제 사용자 브라우저를 요구한다.
- 사용자에게 마지막 단계만 직접 수행하도록 요구하는 정책이 있다.

필요 기능:

- 사용자가 실행을 허용한 탭과 도메인에서만 동작
- 접근성 트리, DOM, 화면 시각 정보를 함께 사용
- 여러 페이지와 팝업을 하나의 실행으로 추적
- 로컬 파일 업로드를 위한 안전한 문서 전달
- CAPTCHA/MFA 발생 시 즉시 사용자 인계
- 제출 직전 폼과 준비된 application revision의 차이 재검증
- 제출 후 확인 화면 또는 지원 ID 수집

이 경로에서는 Harper 서버가 채용 사이트의 비밀번호를 알 필요가 없다.

### 6.3 Harper 관리 브라우저 실행

Harper가 격리된 원격 브라우저 세션을 생성해 지원하는 방식이다. 사용자가 `/career`를 닫아도 실행을 계속할 수 있고, 모바일에서 요청해도 PC용 지원 폼을 처리할 수 있다.

세션 원칙:

- 지원 건 또는 사용자·도메인별로 격리한다.
- 실행 종료 후 브라우저와 임시 파일을 폐기한다.
- 로그인 유지가 꼭 필요한 경우에만 도메인별 암호화 세션을 별도로 보관한다.
- 비밀번호를 모델 입력, 로그, 운영자 화면에 노출하지 않는다.
- MFA와 CAPTCHA는 우회하지 않고 secure takeover로 사용자에게 넘긴다.
- 운영자가 인계받더라도 비밀번호와 민감 토큰은 볼 수 없다.
- 문서 다운로드 URL은 짧은 수명과 1회 사용으로 제한한다.

관리 브라우저는 다음 세 가지 모드를 지원한다.

| 모드 | 사용 조건 |
| --- | --- |
| 익명 지원 | 계정 없이 지원 가능한 폼 |
| 신규 계정 지원 | 사용자 동의 하에 후보자 계정을 만들 수 있는 폼 |
| 연결된 세션 지원 | 사용자가 한 번 로그인·인증한 세션을 제한적으로 재사용하는 폼 |

후보자 계정을 새로 만들 때는 다음을 지킨다.

- 사용자의 실제 이메일을 기본으로 사용한다.
- 채용 연락이 Harper 전용 주소에만 갇히지 않도록 한다.
- 이메일 인증이 필요하면 사용자의 연결된 메일함에서 명시적으로 승인된 verification flow를 사용하거나 사용자에게 링크 클릭을 요청한다.
- 비밀번호를 Harper가 생성·보관해야 한다면 전용 credential vault에 암호화하고, 사용자에게 소유권 이전과 삭제 방법을 제공한다.
- 사용자가 이미 가진 계정이 감지되면 새 계정을 만들지 않는다.

### 6.4 범용 브라우저 에이전트

범용성은 ATS별 하드코딩만으로 만들지 않는다. 브라우저 실행기는 세 계층을 조합한다.

1. **사이트 recipe**: 반복되는 주요 ATS 흐름을 deterministic하게 처리한다.
2. **공통 폼 primitive**: 텍스트, textarea, select, radio, checkbox, 파일 업로드, 날짜, 자동완성, 주소 검색, multi-step navigation을 공통 처리한다.
3. **semantic/visual agent fallback**: 처음 보는 사이트에서 화면의 의미를 이해해 필드와 다음 행동을 찾는다.

실행기는 다음 루프를 사용한다.

```text
현재 화면 관찰
  -> 지원 폼인지, 로그인인지, 확인 화면인지 분류
  -> 입력 가능한 필드와 현재 값을 구조화
  -> normalized question과 답변 매핑
  -> 낮은 위험의 입력만 수행
  -> 페이지 변화 관찰
  -> schema drift 또는 새 질문 발견 시 application을 다시 준비
  -> 제출 조건이 충족될 때만 submit action 실행
```

에이전트가 버튼 문구만 보고 제출 여부를 판단하지 않도록 한다. 클릭 대상의 역할, 인접 설명, 네트워크 행동, 페이지 상태를 함께 확인한다.

### 6.5 운영자 인계

운영자 인계는 실패 처리의 마지막 단계가 아니라 초기 커버리지를 확보하는 정식 실행 채널이다.

적합한 경우:

- 처음 보는 사이트라 브라우저 에이전트의 확신이 낮다.
- 복잡한 커스텀 질문과 동적 UI가 있다.
- 접근성 트리와 DOM이 불완전하다.
- 제출 성공 여부를 사람이 해석해야 한다.
- 중요한 고적합 기회이며 자동 실패보다 사람이 처리하는 편이 낫다.

운영자 화면에는 다음만 제공한다.

- 역할과 회사
- 사용자가 승인했거나 확인한 application revision
- 필드별 답변과 근거
- 브라우저 세션
- 현재 막힌 단계
- 허용되는 행동과 금지되는 행동

운영자가 임의로 경력, 연봉, 근무 허가, 법적 진술을 만들어 넣을 수 없도록 한다. 답변이 없으면 사용자에게 질문하는 상태로 돌린다.

운영자 개입을 통해 얻은 정보 중 UI 구조와 성공 경로만 redacted recipe 개선에 사용한다. 사용자 답변과 문서는 학습 데이터로 보관하지 않는다.

### 6.6 이메일·리퍼럴·직접 전달

공고가 공식 이메일 지원을 안내하거나 Harper가 채용담당자와 직접 관계를 가진 경우에는 브라우저보다 해당 경로가 더 적절할 수 있다.

- 공식 수신 주소와 도메인을 확인한다.
- 지원 이메일 본문과 첨부 문서 revision을 고정한다.
- 발신 주체가 사용자 본인인지 Harper 대리인인지 명시한다.
- 전송 ID와 메일 서버 결과를 제출 영수증으로 기록한다.
- 반송되면 브라우저 지원 경로를 다시 탐색한다.
- 리퍼럴은 추천인의 동의를 별도로 기록한다.

### 6.7 사용자 직접 실행 모드

정책, 기술, 계정 소유 문제 때문에 Harper가 submit action을 수행할 수 없는 사이트도 있다. 이때도 지원 요청 전체를 포기하지 않는다.

- Harper가 정확한 문서와 답변을 준비한다.
- 지원 폼을 가능한 범위까지 채운다.
- 사용자가 제출 버튼만 누르도록 세션을 넘긴다.
- 제출 후 Harper가 확인 화면과 파이프라인을 기록한다.

LinkedIn은 비인가 자동화와 일부 브라우저 확장을 제한하고 Apply Connect도 승인된 ATS 파트너 중심이다. Indeed도 공식 파트너 범위 밖의 Indeed Apply 자동화에 제한을 둔다. 해당 플랫폼은 제휴 전까지 이 경로 또는 명시적으로 허용된 범위만 사용한다.

- LinkedIn User Agreement: https://www.linkedin.com/legal/user-agreement
- LinkedIn Apply Connect: https://learn.microsoft.com/en-us/linkedin/talent/apply-connect/create-configure-customer-application?view=li-lts-2026-03
- Indeed Apply terms: https://docs.indeed.com/legal-terms/indeed-apply

비공개 HTTP endpoint를 역공학하거나 CAPTCHA를 우회하는 경로는 실행 채널로 채택하지 않는다.

## 7. 지원서 준비 계층

범용 실행 전에 범용 지원서 모델이 필요하다. 사이트의 필드 이름은 달라도 의미는 대부분 반복된다.

### 7.1 Application Profile

사용자별로 지원에 재사용 가능한 확인된 정보를 관리한다.

- 법적 이름과 선호 이름
- 이메일과 전화번호
- 거주지와 지원 시 사용할 주소
- LinkedIn, GitHub, 포트폴리오 등 링크
- 경력, 학력, 자격, 언어
- 근무 가능 지역과 원격/이전 의사
- 입사 가능일과 notice period
- 근무 허가 국가
- 비자 및 sponsorship 필요 여부
- 보상 기대치와 답변 정책
- 추천인 및 referral 정보
- 자주 쓰는 서술형 답변
- 사용자가 원할 때만 저장하는 자발적 자기식별 답변

각 값에는 아래 메타데이터가 있어야 한다.

- source: 사용자 입력, 프로필, 이력서, 기존 지원서
- confirmed_at
- expires_at 또는 stale_after
- permitted_use: 모든 지원, 특정 국가, 특정 회사, 이번 지원만
- sensitivity
- 사용 전에 재확인이 필요한지

### 7.2 답변 우선순위

같은 질문에 여러 답이 있을 때 다음 순서로 결정한다.

1. 이번 지원에서 사용자가 직접 지정한 답변
2. 현재 유효한 application profile의 확인된 답변
3. 이번 지원에 고정된 이력서·프로필의 명시적 사실
4. Harper가 근거를 제시한 서술형 초안
5. 사용자 추가 질문

모델이 빈칸을 자연스럽게 채웠다는 이유로 사실 답변을 만들 수 없다.

### 7.3 질문 분류

| 분류 | 예시 | 처리 |
| --- | --- | --- |
| 안정적 사실 | 이름, 이메일, 경력, 학력 | 유효한 확인값 자동 사용 |
| 역할별 서술 | 지원 동기, 관련 성과 | 근거 기반으로 생성·기록 |
| 변동 가능 조건 | 연봉, 입사일, 이전 의사 | stale 여부에 따라 재확인 |
| 법적·적격성 | 근무 허가, 비자, 면허, 범죄 진술 | 추론 금지, 명시적 답변만 사용 |
| 자발적 자기식별 | 성별, 인종, 장애, 보훈 | 기본 미응답, 사용자 정책이 있을 때만 사용 |
| 동의·서명 | 개인정보 고지, 사실 확인, 전자서명 | 문구와 수신처가 바뀌면 새 승인 필요 |
| 사이트 운영 | 계정 비밀번호, CAPTCHA, MFA | 답변 모델 밖에서 안전하게 처리 |

### 7.4 문서 버전

제출되는 문서는 모두 immutable version으로 고정한다.

- `resume_version_id`
- cover letter version
- portfolio/file version
- 원본 파일 hash
- 생성 근거와 사용 대상 역할
- 사용자 승인 또는 standing mandate 적용 근거
- 실제 업로드된 filename과 content hash

“최신 이력서”라는 가변 포인터를 제출 기록에 저장하지 않는다. 나중에 사용자가 이력서를 수정하더라도 과거에 무엇이 제출되었는지 재현할 수 있어야 한다.

## 8. 권한과 명령 모델

### 8.1 One-time application mandate

특정 역할을 가리킨 명시적 “지원해줘”는 해당 역할에 대한 일회성 실행 mandate를 생성한다.

mandate에는 다음이 고정된다.

- 사용자와 역할
- 허용된 지원 대상 회사
- 기본 문서 세트 또는 문서 생성 정책
- 자동 사용 가능한 application profile 범위
- 제출 가능한 실행 채널
- 새 계정 생성 허용 여부
- 이메일/브라우저 세션 사용 허용 여부
- 운영자 개입 허용 여부
- 만료 시각
- 중복 지원 정책

### 8.2 Standing application mandate

반복 요청을 원하는 사용자는 별도 설정으로 standing mandate를 만들 수 있다.

예:

- 사용자가 명시적으로 좋아요 한 공고만
- 한국 또는 remote 역할만
- 보상 하한 이상만
- 비자 sponsorship이 명시된 역할만
- 하루 최대 2건
- 새 자기소개서가 필요 없고 확인된 답변만으로 완료되는 경우만
- LinkedIn·Indeed 제외
- 운영자 인계 허용 또는 금지

standing mandate 밖의 지원은 일회성 명시 요청을 받아야 한다.

### 8.3 Career LLM 도구 경계

Career LLM에 외부 사이트를 직접 조작하는 범용 도구를 주지 않는다. LLM은 명령을 구조화하고 상태를 설명하며, 실행은 deterministic application service와 worker가 수행한다.

제안 도구:

```text
request_application_execution
  input:
    recommendation_id | external_role_id | job_url
    user_instruction
  output:
    application_id
    status
    missing_requirements
    next_user_action

read_application_execution
  input:
    application_id
  output:
    current_status
    route
    completed_steps
    blocking_step
    receipt

provide_application_answer
  input:
    application_id
    question_id
    answer
    reuse_policy

cancel_application_execution
  input:
    application_id
    reason
```

`request_application_execution`은 지원 요청을 저장하고 enqueue할 뿐, LLM 요청 시간 안에 브라우저를 끝까지 조작하지 않는다. 장시간 실행은 worker가 수행하고 `/career`는 상태 이벤트를 구독한다.

## 9. 데이터 모델

기존 `talent_opportunity_recommendation.saved_stage`를 제출 실행 원장으로 사용하지 않는다. 추천 파이프라인과 외부 실행 사실을 분리한다.

### 9.1 `talent_applications`

지원 건의 source of truth다.

- `id`
- `talent_account_id`
- `recommendation_id` 또는 external target reference
- `company_name_snapshot`
- `role_title_snapshot`
- `job_url_snapshot`
- `job_description_hash`
- `mandate_id`
- `status`
- `selected_route`
- `approved_revision_id`
- `submitted_revision_id`
- `external_application_id`
- `submitted_at`
- `verified_at`
- `cancelled_at`
- `created_at`, `updated_at`

### 9.2 `talent_application_revisions`

지원서 한 버전 전체를 고정한다.

- target/form snapshot
- question schema
- question별 answer와 provenance
- 사용 문서 version과 hash
- cover letter와 서술형 답변
- 필수 항목 충족 여부
- 민감·법적 항목 존재 여부
- 생성·확인·승인 시각

제출 시작 뒤 폼에 새 필수 질문이 발견되면 기존 revision을 수정하지 않고 새 revision을 만든다.

### 9.3 `talent_application_attempts`

실행 시도를 기록한다.

- route와 executor version
- idempotency key
- 시작·종료 시각
- redacted step log
- browser session reference
- API status 또는 page result
- retry classification
- failure reason
- uncertainty reason

### 9.4 `talent_application_receipts`

제출 성공 증거를 저장한다.

- receipt type: external ID, confirmation page, email, API response
- external reference
- redacted confirmation text
- screenshot/file reference
- evidence hash
- confidence
- verified_by: system, user, ops, provider

### 9.5 `talent_application_mandates`

- one-time 또는 standing
- scope와 조건
- 허용 채널
- 문서/답변 사용 정책
- 운영자 개입 정책
- 제출 한도
- 생성 근거 message/action
- 만료·철회 상태

### 9.6 `talent_application_answer_vault`

재사용 가능한 확인 답변만 저장한다.

- normalized answer key
- value 또는 encrypted value reference
- locale/country scope
- sensitivity
- confirmed_at, stale_at
- reuse policy
- source

자발적 자기식별 정보는 별도 암호화 영역에 최소 기간만 보관하거나 기본적으로 저장하지 않는다.

### 9.7 `application_execution_recipes`

사이트별 구조와 실행 방법을 관리한다.

- domain/provider fingerprint
- supported flow version
- login/account requirements
- known page states
- field mappings
- success receipt rules
- policy classification
- recent success/error rate
- enabled/canary/disabled 상태

recipe에는 사용자 PII나 실제 답변을 저장하지 않는다.

## 10. 상태 모델

```text
intent_received
  -> target_resolving
  -> target_verified
  -> form_discovering
  -> preparing_revision
  -> needs_user_input | ready_to_execute
  -> queued
  -> executing
  -> user_takeover_required | ops_takeover_required
  -> executing
  -> submitted_unverified
  -> submitted_verified
```

종료·예외 상태:

- `cancelled_by_user`
- `posting_closed`
- `duplicate_detected`
- `policy_blocked`
- `failed_retryable`
- `failed_terminal`
- `submission_uncertain`
- `withdrawn`

`applied` 파이프라인 표시는 다음과 같이 구분한다.

- `user_reported`: 사용자가 직접 지원했다고 기록
- `harper_submitted_verified`: Harper 실행과 영수증 확인 완료
- `harper_submission_uncertain`: 제출 가능성은 있으나 성공 확인 불가

`submission_uncertain`은 절대로 자동으로 `applied`로 확정하거나 동일 폼을 재제출하지 않는다.

## 11. 중복 제출과 멱등성

외부 사이트는 동일한 idempotency key를 지원하지 않을 수 있으므로 Harper가 자체적으로 방어한다.

1. `(talent, normalized company, normalized role, canonical job URL)` 기준 기존 지원을 확인한다.
2. 이메일과 외부 application ID가 있으면 함께 대조한다.
3. submit action 직전에 application row를 lock하고 active attempt가 없는지 확인한다.
4. 한 attempt만 `submit_allowed` lease를 가진다.
5. timeout이나 네트워크 단절 뒤에는 먼저 확인 페이지, ATS 상태, 이메일을 검사한다.
6. 제출 성공 여부가 불확실하면 자동 재시도하지 않는다.
7. 사용자가 재지원하려면 기존 제출과 차이를 보여주고 명시적으로 override해야 한다.

폼 입력 단계는 재시도할 수 있지만 submit action은 별도 위험 단계로 취급한다.

## 12. 제출 성공 검증

페이지가 바뀌었다는 사실만으로 성공 처리하지 않는다. 증거 우선순위는 다음과 같다.

1. 공식 API가 반환한 application ID
2. 확인 페이지의 application/reference ID
3. 사용자 이메일로 도착한 공식 확인 메일
4. 명확한 confirmation page와 네트워크 응답의 조합
5. 운영자 또는 사용자의 확인

단일 `200 OK`, 버튼 클릭 완료, 폼이 사라짐, 일반적인 “Thank you” 문구만으로는 낮은 신뢰의 증거다. 충분한 증거가 없으면 `submitted_unverified` 또는 `submission_uncertain`으로 남기고 확인 작업을 예약한다.

## 13. 실패와 폴백

| 실패 | 처리 |
| --- | --- |
| 공고 종료 | 지원 중단, 종료 증거 기록, 대체 기회 제안 |
| 폼 변경 | 새 schema 수집, 새 revision 생성, 필요한 항목만 질문 |
| API 인증/제한 | 브라우저 경로로 전환 |
| 로그인 필요 | 사용자 기기 또는 secure takeover로 전환 |
| MFA/CAPTCHA | 같은 세션을 사용자에게 인계 |
| 세션 만료 | 입력을 보존하고 재로그인 후 재개 |
| 파일 업로드 실패 | 파일 규격 변환 또는 다른 승인된 문서 사용 |
| 답변 불일치 | 실행 중지, source와 충돌 내용을 사용자에게 표시 |
| submit timeout | 재제출 전에 영수증·이메일·기존 application 확인 |
| 사이트 정책 차단 | 사용자 직접 실행 또는 공식 제휴 경로로 전환 |
| 자동화 확신 부족 | 운영자에게 동일 세션 인계 |
| 운영자도 판단 불가 | 사용자에게 정확히 한 개의 blocking 질문 전달 |

지원 요청 자체는 여러 경로를 거칠 수 있지만, 모든 경로는 같은 application ID와 revision history를 사용한다.

## 14. 보안과 개인정보

### 14.1 기본 원칙

- 채용 사이트 비밀번호를 Career LLM이나 browser agent prompt에 전달하지 않는다.
- raw 쿠키, access token, MFA secret을 로그에 남기지 않는다.
- 브라우저 세션, 문서, 답변은 사용자와 지원 건별로 격리한다.
- 운영자 권한은 least privilege와 시간 제한을 적용한다.
- screenshot과 DOM snapshot에서 불필요한 PII를 redaction한다.
- 법적·민감 답변은 모델이 추론하거나 자동 수정할 수 없다.
- 제출된 정확한 문서와 답변은 감사 목적으로 재현 가능하게 보관하되, 보존 기간과 삭제 정책을 둔다.
- 사용자가 mandate와 연결된 세션을 즉시 철회·삭제할 수 있게 한다.

### 14.2 국외 전송과 직업소개 검토

해외 기업이나 해외 ATS로 지원서를 제출하면 개인정보의 국외 이전에 해당할 수 있으므로, 수신자·국가·목적·항목·보유 기간과 거부 방법을 제품 정책 및 동의에 반영한다.

- 개인정보보호위원회 국외 이전 안내: https://m.pipc.go.kr/np/default/page.do?mCode=D060040010

Harper가 사용자를 대리해 지원하고 수익을 받는 구조가 국내·국외 유료직업소개 규율에 어떻게 해당하는지는 출시 전에 법률 검토한다. 법률 검토 결과에 따라 국가별 제공 범위, 약관, 요금 구조, 운영자 역할을 조정한다.

- 직업안정법 제19조 관련 법령: https://law.go.kr/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1024682487

### 14.3 사이트 정책

기술적으로 브라우저 조작이 가능하다는 사실과 해당 사이트가 자동화를 허용한다는 사실은 다르다.

- 도메인별 policy registry를 운영한다.
- 허용, 사용자 직접 실행만 허용, 파트너만 허용, 금지, 검토 필요 상태로 나눈다.
- 정책이 바뀌면 recipe를 즉시 비활성화할 수 있어야 한다.
- 제휴가 필요한 플랫폼은 business development backlog로 관리한다.
- CAPTCHA 우회, 계정 대량 생성, rate limit 회피, 비공개 submit endpoint 역공학은 하지 않는다.

## 15. 운영 모델

### 15.1 Application Operations Console

운영팀은 다음 queue를 본다.

- 실행 대기
- 사용자 답변 대기
- 사용자 인증 대기
- 자동화 낮은 확신
- 운영자 인계
- 제출 검증 대기
- 제출 불확실
- 실패·재시도 검토
- 철회·정정 요청

각 queue에는 SLA와 escalation 기준을 둔다. 고적합 기회와 마감 임박 기회를 우선 처리한다.

### 15.2 운영자 행동 기록

- 세션 진입과 종료
- 확인한 화면
- 입력·수정한 필드
- 사용자에게 보낸 질문
- submit action 수행 여부
- 확인한 영수증
- 실패 또는 인계 이유

모든 행동을 application event에 기록한다. 운영자가 수정한 답변은 새 revision을 만들고 provenance를 `ops_entered_from_confirmed_source`로 남긴다.

### 15.3 커버리지 확장 루프

1. 자동화가 처음 보는 사이트를 generic agent가 시도한다.
2. 낮은 확신이면 운영자가 완료한다.
3. PII가 제거된 페이지 상태와 구조만 분석한다.
4. 반복되는 흐름은 recipe와 테스트 fixture로 승격한다.
5. canary traffic에서 성공률을 확인한다.
6. 안정화되면 운영자 없이 자동 실행한다.

이 루프를 통해 ATS별 대규모 선행 개발 없이 실제 사용자 요청에서 커버리지를 넓힐 수 있다.

## 16. 구현 단계

### Phase 0. 실제 지원 지형 측정과 운영 준비

목표: Harper 추천 공고 기준으로 범용 실행의 실제 난이도와 경로 분포를 파악한다.

작업:

- 활성 외부 추천의 최종 canonical apply URL과 도메인 집계
- 상위 도메인 및 long-tail 표본의 지원 흐름 분류
- 익명, 로그인, 계정 생성, 이메일 인증, MFA, CAPTCHA 비율 측정
- 질문 taxonomy와 파일 요구사항 수집
- 도메인별 자동화 정책 registry 초안
- 법무·개인정보 검토
- 운영자 console 및 접근 통제 설계
- 성공·실패·불확실의 영수증 기준 확정

산출물:

- 도메인/흐름 커버리지 맵
- route별 예상 사용 비중
- 출시 허용 국가와 플랫폼 목록
- Phase 1 파일럿 대상 공고 목록

### Phase 1. Application Execution Core와 concierge 파일럿

목표: 사이트별 자동화가 부족해도 Harper가 운영자 폴백을 통해 요청을 제출 완료할 수 있게 한다.

작업:

- application, revision, mandate, attempt, receipt 데이터 모델
- application profile과 answer vault
- 정확한 이력서·문서 versioning 연결
- `/career`의 `request_application_execution` 도구
- 비동기 실행 job과 상태 이벤트
- 운영자 console
- 수동 브라우저 세션 연결과 영수증 기록
- 중복 제출 방지와 uncertain 상태
- 사용자에게 blocking 질문을 보내고 재개하는 흐름

출시 범위:

- 소수의 초대 사용자
- 사용자가 명시적으로 요청한 고적합 공고
- 운영자 인계 허용 사용자
- 공식 API 또는 사람이 정상적으로 지원할 수 있는 웹 공고

이 단계에서 이미 제품은 “Harper가 대신 지원한다”를 제공할 수 있다. 자동화율은 낮을 수 있지만 실행 책임과 완료 경험을 먼저 검증한다.

### Phase 2. 범용 관리 브라우저와 secure takeover

목표: long-tail 사이트를 포함해 agent가 대부분의 폼을 작성하고, 사용자·운영자 개입을 줄인다.

작업:

- 격리된 원격 브라우저 worker
- DOM/accessibility/vision 통합 관찰
- 공통 폼 primitive
- multi-page state tracker
- 안전한 파일 업로드
- 로그인·MFA·CAPTCHA secure takeover
- 세션 재개와 만료 처리
- confirmation/receipt extractor
- generic agent confidence model
- low-confidence ops handoff

출시 방식:

- 제출하지 않는 shadow mode
- 운영자와 agent 결과 비교
- allowlisted 도메인 canary
- 성공률과 uncertain 비율 기준을 통과한 흐름부터 자동 submit 허용

### Phase 3. 사용자 기기 브라우저 실행

목표: 기존 로그인, 패스키, 로컬 인증 때문에 관리 브라우저가 어려운 사이트까지 지원한다.

작업:

- Chrome/Codex browser companion
- 현재 탭과 사용자가 승인한 도메인으로 권한 제한
- Harper application revision의 로컬 전달
- 로그인된 폼 자동 작성
- CAPTCHA/MFA 사용자 처리 후 자동 재개
- 제출 영수증을 `/career`로 전송
- 관리 브라우저와 로컬 브라우저 간 route 전환

플랫폼 정책상 자동 submit이 허용되지 않는 사이트에서는 form preparation과 사용자 submit까지만 수행한다.

### Phase 4. 반복 사이트 recipe와 공식 API

목표: 많이 사용하는 경로의 속도, 신뢰도, 단가를 개선한다.

작업:

- Greenhouse, Lever, Ashby 등 공식 파트너 연결
- Workday 등 주요 multi-page 흐름 recipe
- 국내 주요 채용 사이트와 회사 커스텀 페이지 recipe
- provider별 질문 normalization
- account/session lifecycle 최적화
- API 장애 시 browser fallback
- recipe health monitoring과 자동 kill switch

공식 API와 recipe는 범용 엔진을 대체하지 않고 반복 경로를 더 안정적으로 만든다.

### Phase 5. Standing mandate와 제한적 무인 지원

목표: 사용자가 정의한 범위 안에서 요청마다 새 명령을 하지 않아도 Harper가 지원 실행을 운영한다.

진입 조건:

- 지원 프로필의 필수 답변이 확인되어 있다.
- exact document versioning과 revision audit이 안정화되어 있다.
- 중복 제출 방지가 검증되었다.
- provider별 verified completion과 uncertain 지표가 기준을 충족한다.
- 정책·법무 검토가 완료된 국가와 플랫폼이다.
- 제출 한도, 알림, 일시 중지, 철회가 제공된다.

standing mandate는 추천 품질과 별개로 자동 확장하지 않는다. 사용자가 직접 범위와 한도를 설정해야 한다.

## 17. 구현 단위와 권장 소유 경계

### `/career` application layer

- 명시적 지원 의사 해석
- recommendation/role resolution
- mandate 생성
- missing-answer 대화
- 진행 상태와 결과 표시
- 취소·정정·철회 요청

### application orchestration worker

- 공고와 폼 discovery
- revision 생성
- execution routing
- retry·timeout·lease
- 사용자/운영자 인계
- 제출 검증과 후속 확인

### browser execution service

- 관리 브라우저 세션
- generic semantic browser agent
- provider recipe
- 파일 업로드
- session takeover
- screenshot/DOM redaction

### provider integration service

- ATS API credential
- provider schema adapter
- submit/verify/withdraw capability
- rate limit와 provider health

### operations application

- queue와 SLA
- 브라우저 takeover
- 답변 provenance 확인
- receipt 검증
- 장애와 policy kill switch

## 18. 테스트 전략

### 18.1 원칙

- 실제 제3자 기업 공고에 무단 테스트 지원서를 제출하지 않는다.
- ATS sandbox, Harper가 소유한 테스트 회사, 명시적으로 승인받은 파트너 공고를 사용한다.
- 가능하면 production이 아닌 Supabase와 provider sandbox를 사용한다.
- 외부 사이트 테스트는 submit 직전까지만 하는 shadow mode와 실제 제출 테스트를 구분한다.

회사 내부 역할 fixture가 포함되면 다음 계약을 반드시 지킨다.

- `company_roles.information.testOnly = true`
- 안정적인 `testFixture` 이름
- 필요한 경우 dedicated `information.testTalentIds`만 allowlist
- `talent_opportunity_fit` 및 talent-facing matching 경로 유입 금지
- production 사용 시 exact-ID 즉시 cleanup

### 18.2 필수 시나리오

- 계정 없는 단일 페이지 폼
- 계정 생성과 이메일 인증
- 기존 계정 로그인
- MFA와 CAPTCHA user takeover
- 여러 페이지와 autosave
- 커스텀 질문과 조건부 질문
- 이력서·자기소개서·포트폴리오 업로드
- 주소 자동완성과 날짜 입력
- 법적·자기식별 질문
- 지원서 준비 뒤 폼 schema 변경
- 제출 직전 공고 종료
- 동일 지원 버튼 이중 클릭
- submit timeout 뒤 실제로는 성공한 경우
- API 429/5xx 뒤 browser fallback
- confirmation page는 있지만 ID가 없는 경우
- 확인 이메일 지연 또는 반송
- 사용자 중간 취소
- 운영자 인계 후 재개
- 모바일 요청 후 관리 브라우저 실행
- locale, timezone, 통화, 전화번호 형식 차이

### 18.3 출시 게이트

도메인 또는 recipe별로 다음 기준을 충족하기 전 자동 submit을 허용하지 않는다.

- 허용된 policy 상태
- safe sandbox/partner end-to-end 성공
- 필수 질문 누락이 없음
- 잘못된 사실 생성이 없음
- submit double action이 없음
- 성공/실패/uncertain을 구분할 수 있음
- session과 PII redaction 검증
- kill switch 동작

## 19. 지표

### 핵심 결과

- 지원 요청 대비 Harper 주도 제출 확인율
- 요청부터 verified submission까지 걸린 시간
- 지원 요청 중 사용자에게 직접 지원을 포기하게 한 비율
- 사용자 blocking action 수와 소요 시간
- 운영자 개입률과 건당 처리 시간
- 지원 후 interview 전환율

### 신뢰와 안전

- 중복 제출 건수: 목표 0
- 사실과 다른 답변 제출 건수: 목표 0
- `submission_uncertain` 비율
- 제출 후 사용자 정정·철회 요청률
- 민감정보 오노출 또는 권한 위반 건수: 목표 0
- 사용자가 인지하지 못한 수신처로 전송된 건수: 목표 0

### 실행 품질

- route별 성공률
- 도메인별 recipe 성공률
- generic agent에서 운영자 인계로 전환된 비율
- MFA/CAPTCHA 사용자 인계 후 재개 성공률
- 영수증 자동 확인률
- API에서 브라우저, 브라우저에서 운영자로 전환 후 완료된 비율

제출 건수 자체를 north-star metric으로 사용하지 않는다. 고적합 공고에 대한 verified completion과 이후 interview 결과를 함께 본다.

## 20. 중단 조건과 kill switch

다음 상황에서는 해당 route 또는 domain의 신규 실행을 즉시 중단한다.

- 중복 제출 발생
- 사실과 다른 답변이 제출됨
- submit success와 failure를 안정적으로 구분하지 못함
- 사이트 정책 변경 또는 자동화 중단 요청
- credential/session 격리 실패
- PII가 로그나 다른 사용자 세션에 노출됨
- recipe 변경으로 필드 매핑 오류 급증
- provider가 rate limit 또는 차단 신호를 보냄

중단해도 이미 시작된 application은 안전한 checkpoint에서 멈추고, 사용자 또는 운영자에게 인계할 수 있어야 한다.

## 21. 하지 않을 것

- 특정 ATS 목록을 모두 연동한 뒤에야 출시하려는 접근
- Career LLM이 브라우저 submit 버튼을 직접 누르는 구조
- 사용자 확인 없이 법적·민감 답변 추론
- 성공 여부가 불확실한 제출의 자동 재시도
- 사용자의 비밀번호·MFA secret을 prompt나 일반 DB에 저장
- CAPTCHA 우회
- 비공개 submit endpoint 역공학
- 사이트 정책을 무시한 플랫폼 자동화
- 하나의 generic resume로 무제한 mass apply
- 운영자가 사용자 대신 사실을 만들어 입력
- `saved_stage = applied`만으로 제출 성공을 간주

## 22. 최종 제품 결정

1. `/career`의 명시적 “이 역할에 지원해줘”는 실제 실행 명령이다.
2. Harper는 ATS API가 있는 역할에만 대리 지원을 제한하지 않는다.
3. 범용 브라우저 실행과 운영자 폴백을 통해 long-tail 회사 채용 페이지까지 지원한다.
4. 사용자 인계가 있어도 지원 작업의 소유권은 Harper에 남는다.
5. 사용자 개입은 대상 모호성, 새로운 사실·법적 답변, 문서 변경, 로그인/MFA/CAPTCHA처럼 사용자만 해결할 수 있는 경우에만 요청한다.
6. 제출 완료는 클릭이 아니라 영수증 검증으로 판정한다.
7. 공식 API와 사이트 recipe는 커버리지의 전제조건이 아니라 속도·신뢰도·비용을 개선하는 최적화 경로다.
8. 초기에는 운영자 폴백으로 넓은 실행 범위를 먼저 확보하고, 반복되는 흐름을 순차적으로 자동화한다.
9. 정책상 대리 실행이 금지된 사이트는 공식 제휴 또는 사용자 직접 submit 경로로 처리한다.
10. 최종 목표는 “지원서를 만들어주는 Harper”가 아니라 **“지원 요청을 받아 실제 제출과 확인까지 끝내는 Harper”**다.

## 23. 관련 문서

- [Career 생성 이력서 버전 관리 구현 계획](./career-generated-resume-versioning-plan-ko.md): 실제 제출에 사용할 immutable resume version의 선행 계획
- [Harper High-end AI Career Agent 제품 제안](./high-end-ai-career-agent-product-plan-2026-07-02.md): `/career` 전체 제품 방향과 application packet, pipeline agent의 상위 맥락
