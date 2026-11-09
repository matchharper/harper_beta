# 대화 기반 인터뷰 조율 — 로컬 구현

2026-11-08. 운영 배포·migration 적용·공용 계정 인증은 완료하지 않았다.

회사 요청의 관계 확인과 필요한 연결 수락은 기존 도구를 사용한다. 원본 company-side LLM이 `manage_meeting`으로 요청을 준비하고 `contact_talent`로 후보자 에이전트와 조율한다. 후보자 측은 기존 context와 사용자 대화로 판단하고 `contact_company`로 회신한다. 회사 에이전트가 원래 요청과 후속 회사 대화를 다시 읽어 위임 범위 안에서 같은 미팅을 확정한다. 시간 세 개, 재확인 질문, 응답 문구를 고정하지 않는다. 기존 가능 시간 설정과 명시적으로 요청한 시간 선택 페이지도 유지한다.

`prepare`는 발송하지 않는다. 기존 meeting aggregate의 source_refs에 실제 요청 메시지·요청자·대화·연결/동의 시점을 보존한다. 배경 회사 에이전트는 새 위임을 만들 수 없고, 저장된 요청만 이어간다. 시간·목적·기간의 합의 판단은 원본 LLM이 맡고, executor는 현재 권한·Role·후보자 동의·버전·실제 일정 충돌을 확인한다. 후보자 회신만으로 회사 권한을 새로 부여하지 않는다.

Calendar는 일정 담당자의 활성 개인 연결을 우선 사용한다. 미연결·인증 만료인 경우 설정된 Harper 계정을 사용한다. 공급자 장애나 소유권 불일치 때문에 공용 계정으로 바꾸지는 않는다. 최초 외부 쓰기 전에 계정을 고정하며 재시도·변경·취소는 같은 계정과 같은 Google 이벤트 ID를 사용한다. Google ETag와 DB의 실행 lease/버전으로 오래된 수정과 중복 초대를 방지한다. 공용 계정을 쓰면 회사 요청자도 참석자로 초대한다. 개인 Calendar가 없으면 개인의 다른 일정은 미확인 정보로 남는다.

## hello@matchharper.com 연결

이 주소가 Calendar 및 Meet 사용 권한을 가진 실제 Google 계정이어야 한다. 다른 계정의 발신 별칭이나 그룹 주소만으로는 독립된 주최자가 되지 않는다. 기존 Composio 프로젝트의 `COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID`를 사용해 이 계정을 OAuth 인증한 뒤 서버에 다음 값을 설정한다.

```dotenv
HARPER_GOOGLE_CALENDAR_EMAIL=hello@matchharper.com
HARPER_GOOGLE_CALENDAR_ACCOUNT_ID=ca_<authenticated_connection>
HARPER_GOOGLE_CALENDAR_USER_ID=<the_connection_owner_user_id>
```

Composio의 계정 ID, 소유 user ID, toolkit, auth config, 활성 상태를 확인하고 Google primary Calendar의 실제 ID가 지정 이메일인지도 검증한다. 환경변수만 넣는 것은 인증 완료가 아니다. 공용 계정이 없더라도 대화 조율과 합의 저장은 가능하며 실제 초대 실패는 별도로 반환된다. 설정 전에는 사용자에게 초대가 전달됐다고 알리지 않는다.

실사용 전에 해당 Workspace에서 Meet 생성과 외부 초대가 허용되는지, 초대받은 외부 참석자가 공용 계정 주최자의 수동 입장 승인 없이 들어올 수 있는지 확인해야 한다. 운영 적용 승인 후 migration `20261108140241_agent_meeting_coordination.sql`과 앱을 함께 반영한다. 실제 계정으로 회사·후보자 전용 테스트 주소에 한 건 생성 → 재시도 → 변경 → 취소를 확인한다.

공급자의 Meet 생성이 비동기이면 초대 제출과 Meet 생성 중 상태를 구분한다. 원본 에이전트는 `retry_delivery`로 조회를 이어가거나 기존 `manage_agent_schedule`로 후속 확인을 예약할 수 있다. 서버는 새로운 미팅을 생성해 실패를 숨기지 않는다. 참석자의 RSVP/실제 수신은 API 제출 결과와 별개다.

검증은 [평가 레지스트리](../evaluation/interview-coordination/README.md)와 `src/lib/meetings/coordinationStore.test.ts`, `calendarDelivery.test.ts`에 있다. 합성 대화 실행은 실제 Google 초대 발송 검증을 대체하지 않는다.
