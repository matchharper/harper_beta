# 선택적인 단계 · 연결/인터뷰 검증 (2026-09-28)

로컬 구현과 앞선 실행 검증, 후속 코드 검토 기록이다. 후속 사용자 요청으로 운영 DB migration을 적용했다.
웹·Worker 배포와 실제 후보자/팀원에게의 발송은 하지 않았다. 아래 실행 검증은 후속 코드 보완 이전 결과다.

## 변경과 계약

일반 연결 수락과 새 Intro의 후보자 수락은 `연결됨`을 기본 목적지로 쓴다. `/org`의 pipeline·Role board·후보자 상세,
company-side LLM의 연결/Intro/일정 계약, 공통 서버, Intro RPC와 Worker 전달 guard에서 custom stage 선행 조건을 제거했다.
기존 Intro에 저장된 custom 목적지와 회사가 명시적으로 선택한 목적지는 유지한다.

인터뷰 목적은 회사 대화의 주제·목표 또는 선택한 단계의 저장값을 사용하고, 없을 때만 질문한다.
기본 시간은 60분이며 명시한 시간이나 선택한 단계의 저장값을 우선한다. 새 요청은 원본 회사 메시지별로 구분하므로
같은 후보·단계에서도 후속 인터뷰를 만들 수 있다. 기존 안내는 일반 조회에서 읽은 정확한 일정 ID로 재사용한다.
같은 원본 메시지의 재시도는 기존 일정으로 돌아간다. 한 메시지에서 같은 후보의 복수 새 일정을 만드는 계약은 추가하지 않았다.

## 실제 모델 검증

Production loop·schema·serializer와 OpenRouter Gemini 3.8 Flash(medium, temperature 0.5)를 사용했다.
실제 DB executor와 외부 전송은 합성 도구로 대체했다. frozen v11 5대화/9발화 및 기존 v10 2대화/3발화다.
원문, tool trace, source snapshot/hash, provider usage는 각 ignored `runs/`에 owner-only로 저장했다.

| 실행 | 결과와 원문 판정 |
| --- | --- |
| `20260928-optional-stage-r1` | 최초 실패 보존. 수락 답변의 오래된 `진행 중` label, 불명확한 목적을 일반 직무 인터뷰로 추정, 기존 일정이 일반 연락 조회 adapter에 없는 문제 확인. 도구의 label과 목적 계약, 실제 조회의 일정 ID 및 합성 조회를 보완했다. |
| `20260928-optional-stage-r2` | 수락·Intro·별개 후속 인터뷰·목적 보완의 4대화/8발화는 필수 행동 충족. 기존 안내도 마지막 효과는 정확했지만 연락 도구에 미팅 ID를 전달하는 중간 실패가 있어 깨끗한 전체 통과로 세지 않는다. 합성 연락 상세 확장 위치 오류도 수정했다. |
| `20260928-optional-stage-existing-r3` | 정확한 기존 45분 일정을 재사용해 결과는 충족했지만 일반 contact lifecycle 호출 실패 후 복구. `contactId`와 미팅 ID의 도구 계약을 구분했다. |
| `20260928-optional-stage-existing-r4` | 기존 안내 변형 재검증: 정확한 ID + `move_candidate_stage(scheduleInterview=true, meetingDeliveryMode=immediate)` 사용. 새 일정 0, 목적/시간 재질문 0, 잘못된 tool 호출 0. |
| `20260928-optional-stage-regression` | 동결 v10 2대화/3발화의 기존 추천 이력·수락 후 연결 대기·추가 Intro 불필요 계약 유지. 상태 변경 도구 호출 없음. |

최종 관련 실행들을 합쳐 v11의 5개 변형 필수 행동과 v10의 3발화를 확인했다. 최초 실행 성공률이나 동일 소스의
전체 회귀 통과로 주장하지 않는다. 후속 인터뷰는 60분 첫 요청과 45분 새 요청이 서로 다른 schedule ID였으며,
목적 보완은 첫 turn에 변경 없이 질문하고 두 번째에 한 번만 생성했다. 단계 생성/선택 질문은 없었다.
전체 응답을 읽고 상태·동의·효과를 수동 검토했다. 추가 설정을 열거하는 답변 길이는 다소 길었지만
필수 재질문이나 단계 강제는 없었다. 모델 평균 성능이나 독립 팀원 blind review 결과는 아니다.

## 비모델 검증

- 관련 TypeScript/DOM 회귀 **120/120** 통과. 마지막 도구 계약 수정 후 관련 82개를 다시 통과했다.
- `scripts/testOptionalStageMeeting.ts`: 실제 서버 준비 함수와 RPC adapter를 hermetic HTTP fixture로 실행.
  단계 조회/생성 없이 목적·60분·후보자 전달 메모 저장, 45분 후속 요청, 목적/Calendar/권한 blocker,
  동일 메시지 key 재사용과 새 메시지 key 분리 확인. 모든 외부 요청은 mock이며 실 네트워크 호출 없음.
- `scripts/test_optional_connection_stage.py`: 일회성 로컬 PostgreSQL에 실제 migration/RPC와 실제 Worker guard 실행.
  NULL/기존 custom 목적지의 Intro·수락·재시도, 중복 candidate-first 방지, 다른 Role stage 거부,
  권한·공개 범위·testOnly allowlist·종료 Role 발송 취소 및 service-only 실행 권한 통과.
- `git diff --check` 통과. 전체 `tsc --noEmit`은 범위 밖 오류 때문에 실패: 생성된 `.next*`의 없어진 network page,
  private 수동 QA의 Supabase 타입, 별도 queue callback 타입, growth report 테스트의 unknown 타입.
  이번 변경 파일에는 보고된 타입 오류가 없다. 해당 오류를 이번 작업에서 수정하지 않았다.

재현:

```bash
OPENAI_API_KEY=synthetic NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=synthetic SUPABASE_SERVICE_ROLE_KEY=synthetic pnpm exec tsx --tsconfig scripts/tsconfig.json --test src/components/org/CompanyIntroDecisionDialogs.test.tsx src/lib/meetings/scheduleDraft.test.ts src/lib/org/agent/tools.test.ts src/lib/org/agent/toolExecution.test.ts src/lib/org/agent/promptFormat.test.ts src/lib/org/agent/contacts.test.ts
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/testOptionalStageMeeting.ts
# PostgreSQL server binaries + Worker Python dependencies needed; no configured DB credentials used.
python scripts/test_optional_connection_stage.py
```

## 남은 범위

실제 브라우저 렌더링, 회사 수락부터 소개 이메일 발송까지의 실전송 E2E, 실제 Calendar 왕복은 실행하지 않았다.
DB integration은 최소 fixture schema이며 운영의 모든 trigger/경합을 재현하지 않는다.
웹·Opportunity Worker 코드는 아직 미배포다. Notion에는 전체 기능이 운영 반영됐다고 기록하지 않았다.

## 운영 DB 적용 및 후속 코드 검토

사용자의 “운영 DB도 적용” 요청에 따라 Harper 운영 프로젝트의 기존 함수 정의를 먼저 읽었다.
검토한 migration과의 본문 차이가 단계 미지정 허용 조건 두 곳뿐임을 비교하고,
`optional_connection_process_stage`를 적용했다. 운영 이력 버전은 `20260928095255`이며 로컬 파일명도 맞췄다.
적용 후 두 함수의 본문 일치, SECURITY DEFINER/search_path 유지, service_role 전용 실행 권한 유지를 확인했다.
기존 후보자 행은 갱신하지 않았다. 수락 RPC에서도 NULL 목적지를 막는 별도 조건이 없음을 함수 정의로 확인했다.
운영 company 답변 예시의 단계·인터뷰 안내도 읽었으며, 커스텀 단계 선행 요구가 없어 수정하지 않았다.

후속 검토는 코드와 DB 정의 읽기로만 진행했다. 테스트·모델 평가·실제 후보자 흐름은 다시 실행하지 않았다.
아래 보완은 실행 검증을 거치지 않은 로컬 변경이며 앞선 120개 테스트/모델 결과로 검증됐다고 주장하지 않는다.

- 기존 초대 재사용 시 Calendar·가능 시간 검사를 건너뛰던 경로에 같은 선행 검사를 추가했다.
  설정이 부족하면 기존 일정은 유지하며, 이미 보낸 초대를 미발송으로 설명하지 않도록 기존 상태도 반환한다.
- 기존 초대의 목적·시간·제목·참석자 변경 입력을 조용히 무시하던 경로를 명시적 거부로 바꿨다.
  이 도구에서 기존 초대 수정은 후보자에게 보일 추가 안내와 발송 시각에 한정한다.
  같은 원본 메시지 재시도는 저장된 안내를 재사용하며, 내용 수정에는 명시적인 기존 일정 ID를 사용한다.
- Intro 정보 보완 결과의 `first_stage` 요구와 서비스 개요의 사전 단계 선택 표현을 제거했다.
- 직접 선택한 커스텀 목적지로 수락할 때 확인창도 그 실제 목적지를 표시하도록 고쳤다.
  일반 수락의 기본값은 계속 `연결됨`이다.

코드상 새 수락/Intro/인터뷰의 custom stage 강제는 남아 있지 않다. 명시된 custom 목적지의 유효성,
회사 권한, 후보자 동의·공개 범위, 요청 중복 방지는 계속 검사한다.
다만 DB 적용만으로 전체 운영 동작은 완성되지 않는다. 이전 Worker는 NULL 목적지 Intro를 전달 시 취소할 수 있고,
이전 웹 수락 코드는 NULL 목적지를 불완전한 연결 정보로 거부한다. 새 웹을 공개하기 전에 Worker 변경을 반영해야 한다.
기존에 명시적 목적지를 저장한 요청은 이번 DB 변경으로 바뀌지 않는다.
