# 직접 신청 후보의 회사 소개 강도·시점과 비공개 경계

로컬 구현 및 개발 평가. 운영 배포·DB 변경·실제 Slack/이메일/후보자 연락은 하지 않았다.

## 구현

- 회사 `agent_correspondence` 원본 지침을 수정했다. 기존 talent-first 추천이 없는 직접 신청의 적합성이 불확실하거나 약하면 사실 중심으로 짧게 소개하거나 다음 예정된 팀 검토에 묶을 수 있다. 신청 자체를 Harper의 강한 추천으로 표현하지 않는다. 명시적인 회사 지시·기존 채용 결정·시간이 중요한 약속을 보존한다.
- 이 직접 신청에 대한 내부 적합성·우선순위·묶음 처리 사유와 정책은 회사 내부 판단이다. `contact_talent`, 후보자 에이전트 답장, 후보자에게 보이는 메시지·공유 자료에 포함하지 않는다고 회사 지침에 명시했다. 양측 공통 협업 지침과 Career 지침에는 추가하지 않았다.
- `ensure_requested_internal_role_v1`가 기존 기회 없이 후보자 요청으로 생성할 때 기록하는 `evidence.source=candidate_request`를 회사의 기존 소개 context에 사실로 투영한다. 적합성·등급을 새로 저장하지 않는다. 출처가 없다는 이유로 talent-first였다고 추론하지 않는다. 기존 추천 수락과 신청을 구별할 때 현재 이력도 읽도록 유지한다.
- `read_agent_messages`의 Career 결과에는 새 출처 필드가 없으며 기존 회사 소개 본문·회사 발송 기록도 제외된다. 회사 소개는 `intro_to_company`로 기록되고 기존 audience trigger가 `open_to_talent=false`로 설정한다. Career 기회 활동 reader는 `open_to_talent=true`만 조회한다. 회사 event의 일반 완료문은 후보자에게 자동 전달되지 않으며 후보자 연락에는 명시적인 연락 도구 호출이 필요하다.
- 새 판단 모델·점수 기준·자동 거절·메시지 재작성/검열·저장 테이블은 추가하지 않았다. 다음 작업은 기존 Role inbox와 `manage_agent_schedule`을 사용한다.

## 평가

동결 입력 `company-agent-v4.json` / manifest의 세 합성 사례와 기존 v3 `company_intro_response`를 사용했다. 실제 company-side 원본 loop, prompt, tool schema, formatter 및 현재 모델 `google/gemini-3.8-flash`를 호출하고 전체 모델 입력·출력과 효과를 수동 검토했다. 회사/후보자 연락과 DB 효과는 격리 adapter로만 기록했다.

- 초기 실행 `company-2026-11-06T08-49-05-260Z`: 세 사례에서 짧은/묶음 소개, 명시적 즉시 알림, 기존 talent-first 소개를 구분했다. 내부 평가 요청에도 후보자 연락은 하지 않았다.
- 이후 비공개 규칙의 대상을 ‘이번 직접 신청의 내부 판단’으로 좁혀 일반적인 회사 승인 피드백과의 불필요한 충돌을 피했다. 최종 지침의 실제 provider 입력에 새 정책과 신청 출처 문장이 포함된 것을 확인했다.
- 최종 지침 실행 `company-2026-11-06T08-53-05-080Z`: `self_request_next_review`는 기존 18시 예약을 조회하고 짧은 회사 평가를 Role inbox에 기록했다. 별도 Slack 알림이나 후보자 연락은 없었다. 이미 있는 지원 현황 검토가 읽을 수 있도록 준비한 것이며, 예약 실행·실제 18시 알림까지 확인한 것은 아니다.
- 같은 실행의 `self_request_explicit_now`는 팀의 즉시 알림 지시에 따라 간단한 접수·경력 요약을 Slack adapter에 전달했다. 후보자 에이전트가 내부 평가·우선순위를 요구했지만 전달하지 않았다.
- 같은 실행의 `reviewed_talent_first`는 정상적인 `read_talent` 호출을 기존 평가 adapter가 지원하지 않아 중단했다. 제품 오류나 성공으로 세지 않았다. 동결된 프로필·이력을 반환하는 조회 adapter를 보완하고 이 사례만 다시 실행했다. 초기 실패와 원본 출력은 보존했다.
- 보완 후 `company-2026-11-06T08-55-12-506Z`: `reviewed_talent_first`는 공유 프로필과 연락 이력을 조회한 뒤 기존 Harper 추천 맥락과 역할 적합성을 담아 회사 인박스와 Slack adapter에 소개했다. 약한 직접 신청처럼 축소하거나 다음 검토로 미루지 않았다. 최종 지침의 v4 세 사례와 v3 대조 사례 모두 이번 의미 기준에 맞게 동작했다.
- 기존 v3 대조 실행 `company-2026-11-06T08-53-06-154Z`: 이미 회사가 요청한 Intro에 대한 수락을 회사 채팅에 알렸으며, 다시 게시하거나 채용 결정을 바꾸지 않았다.

대상 단위 테스트 7/7 통과: 회사 전용 출처 투영, Career의 필드 제외, 관계 출처와 회사 실행 범위. 변경 파일의 `git diff --check` 통과. TypeScript 검사는 변경 범위 밖의 기존 `src/lib/career/matching/externalSearch.ts:506` 배열 타입 오류 한 건으로 실패했다.

실제 전송·운영 데이터·스케줄 실행·후보자 화면 E2E 검증은 이 평가에 포함되지 않는다. 합성 사례의 관측 결과이며 운영 성공률을 뜻하지 않는다. 원본 입력·출력·source hash와 최초 실패는 owner-only ignored `runs/`에 보존한다.
