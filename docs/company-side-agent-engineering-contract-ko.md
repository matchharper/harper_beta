# Company-side agent 변경 정본

문서 기준: 2026-09-27. **개발 계약이며 운영 배포 완료를 뜻하지 않는다.**

2026-09-25 [자체 리뷰와 보완](company-side-agent-self-review-2026-09-25-ko.md): 연락 재시도·공유 경계와 입력 출처를 보강했다.
그 자체 리뷰 당시에는 시나리오 평가 전이었다. 이후 사용자 승인으로 실행한 평가와 구조 개선은
[최신 계약·실행 보고서](evaluation/company-side-conversational-qa/reports/2026-09-25-contract-v8.md)에 구분한다.
앱은 미배포이며 이번 평가를 위해 운영 migration이나 테스트 Role을 추가하지 않는다.

## 2026-10-25 로컬 변경: Slack의 새 Role 등록

기존 company-side LLM이 받은 업무·JD·조건으로 초안을 만들 수 있는지 판단한다. 충분하면 `start_role_creation`의 `draft`에 확인된 공개 업무·자격과 비공개 Hiring Brief, 근무·고용·보상 정보를 구분해 작성한다. 정보가 부족하면 핵심만 묻고, 미정 조건을 채워 넣지 않는다. 글자 수·키워드·조건 개수로 정보 충분성을 분류하지 않는다.

서버는 Role 초안과 선택한 Slack 원문·파일을 저장하고 웹 채용 시작 session을 만든 뒤 `/org/role?orgId=...&roleId=...`를 반환한다. 원본 회사 LLM이 짧은 설명과 이 링크를 안내하며, 이후 기준 정리와 등록은 웹 온보딩에서 이어간다. 별도 Slack 등록 스레드나 고정 성공 문장은 만들지 않는다. 초안 생성은 활성화·정기 매칭 접수가 아니다. 같은 요청의 재시도는 초안을 재사용하고 이후 웹에서 수정한 내용을 덮어쓰지 않는다.

웹·Worker·migration은 미배포다. 새 Role 활성화 후 첫 정기 실행 계약은 [정기 추천 구현 문서](company/company-scheduled-agentic-role-search-implementation-ko.md), 합성 원본 LLM 검증은 [v38](evaluation/company-side-conversational-qa/gold-v38.md)을 따른다.

## 목적과 변경 절차

Harper는 회사의 채용 파트너다. 대화를 이해하고, 근거를 확인하고, 권한 안에서 일을 이어간다.

Organization Team은 선택적 Role 접근 그룹이다. 현재 팀원의 권한·팀·접근 범위를 일반 및 Role 작성 입력에 제공하되, 허용 Role의 목록·참고 자료·연락·이력은 서버 조회 단계부터 제한한다. 일반 대화는 접근 가능한 팀 조합별로 분리하고 실행 전에 현재 접근 권한을 다시 확인한다. 복수 팀에 배정된 팀원은 배정된 팀들의 Role에 접근한다. Owner가 팀과 배정을 관리하며 Slots·Intro·결제는 Organization 범위다. 구체적인 로컬 구현/운영 배포 경계는 [Team 접근 계약](company/organization-team-role-access-ko.md)을 따른다.
기능이 늘 때마다 system prompt 끝에 새 예외를 붙이지 않는다. 변경 전에 이 문서와 해당 제품 계약을 읽는다.

1. 부족한 것이 문체인지, 사실 context인지, 도구 계약인지, 실제 외부 능력인지 먼저 구분한다.
2. 아래 책임표에서 **한 원본**을 고친다. 같은 규칙을 tool description·결과·system에 복제하지 않는다.
3. 기존 일반 조회와 도구로 새 상황도 처리되는지 확인한다. 사례별 intent/router/상태/테이블은 추가하지 않는다.
4. 동결된 대화 평가를 다시 실행하고 실제 전체 답변과 호출·효과를 검토한다. 단어·어미 매칭으로 품질을 판정하지 않는다.
5. 새 입력/정답은 새 dataset version, 코드·prompt·model 수정은 같은 dataset의 새 run으로 기록한다.

## 책임표

| 원본 | 소유하는 계약 | 넣지 않을 것 |
| --- | --- | --- |
| `src/lib/org/agent/uxWritingPrompt.ts` | 팀원별 저장 언어 또는 설정이 없는 Slack 대화 언어에 맞는 문체와 UI 용어, 비례하는 설명 | 승인 절차, 고정 성공 문장 |
| `prompts.ts` / `input.ts` | 공통 목적·안전, surface, 출처, native 대화 조립 | 미로드 기능의 상세 정책 |
| `capabilities/registry.ts` | 기능 개요·tool·공유 policy 연결 | 시나리오별 분기, 사용자 데이터 |
| `capabilities/policies.ts` | 기능별 업무 절차 | 문체 지시 반복 |
| `tools.ts` | 인자 schema, 효과, 필수 전제 | 결과 답변 템플릿 |
| `promptFormat.ts` | 실제 결과·참조·불완전함의 작은 projection | 상투적 CTA, 복제된 말투 지시 |
| `companyTalentRequests/relayContract.ts` | 양방향 연락과 이메일 writer의 승인된 의미·조건·강도 보존 | 미래 실행 약속·새 채용 판단 |
| `companyTalentRequests/directMessage.ts` | 직접 발송의 최종 본문·제목·요약 및 서명된 URL slot 계약 | 숨은 재작성 모델, 키워드에 의한 품질 판정 |
| `roleTextEdits.ts` / `update_role_draft` | 문서의 정확한 부분 수정과 실제 저장본 반환 | 원문 의미의 코드 판정, 전체 문서 자동 동기화 |
| 기존 executor/RPC | 권한·동의·revision·idempotency·공유 범위 | 정성 판단과 문장 교정 |
| `service_answer_examples` | 사람이 편집하는 서비스 답변 예시 | 현재 후보자 사실·행동 승인 |

Hiring Brief는 [작성 정본](company/company-role-hiring-brief-authoring-guide-ko.md), 문체는
[UX writing 정본](company-side-ux-writing-guide-ko.md)을 따른다. 상세 구조의 배경은
[입력·지연 로딩 계획](company-side-agent-input-and-capability-refactor-plan-ko.md)을 참고한다.

## 입력과 지연 로딩

2026-10-21 로컬 개인정보 경계: 연결 대기(`pending_connection`), 먼저 제안 가능한 후보(`company_intro`),
Intro 응답 대기(`intro_requested`)의 후보자 이메일 주소는 company-side LLM 입력에서 제외한다.
프로필 열람 여부는 이 주소 공개의 근거가 아니다. 도구 결과는 형식화·길이 제한 전에 주소를 제거하고,
일반 대화·연락 원문·이전 답변·회사 사건·오류 진단은 모델 전송 직전에 현재 조직의 후보자 단계와
등록 주소를 대조해 제외한다. 같은 후보자가 여러 Role에 있으면 제한 대상 Role의 주소가 다른 Role을
통해 유입되지 않게 한다. 판단에는 기존 단계 계산을 재사용하고, 확인 조회가 실패하거나 불완전하면
모델에 보내지 않는다. 실제 발송 주소와 저장된 원문은 수정하지 않으며, 연결된 후보자·회사 팀원 주소는
이 제한만으로 제거하지 않는다. [검증과 한계](evaluation/company-side-conversational-qa/reports/2026-10-21-candidate-email-privacy.md).
운영 배포 완료를 뜻하지 않는다.

기본 조회 5개와 핵심 연락 3개(`list_contacts`, `read_contact`, `contact_talent`), loader 및 짧은 기능 개요는 항상 보인다.
연락의 schema와 policy도 기본 포함한다. 초안 작성·수정·승인·회신 확인은 부가 기능이 아니라 회사 agent의 핵심 업무다.
모든 write를 숨기면 모델이 도구 없이 초안을 수정했다고 말하는 회귀가 관측돼 이 경계를 조정했다.
역할 편집·검색·일정 등 무거운 기능은 모델이 `load_capabilities`를 호출하면 다음 completion에
그 기능의 **상세 정책과 실제 schema를 함께** 추가한다. 로딩은 새 사용자 승인이 아니다.
같은 응답에서 로더와 미노출 도구를 호출해도 미노출 도구는 실행하지 않는다. 권한 검사는 기존 실행부가 유지한다.
한 turn 안에서는 추가만 한다. 다음 turn에는 기본 집합과 **직전 실제 Harper 답변의 toolResults**에 해당하는 기능만
노출한다. 사용자/후보자 문구에서 도구 이름을 추측하지 않고 전체 과거 기능을 누적하지 않는다.
가용성은 실행 승인이 아니며 최신 수정·철회와 권한은 별도로 판단한다. `full` 모드는 같은 새 core에 전체 기능을 제공하는
호환 모드이며 이전 지침이나 허술한 권한 검사로 돌아가는 옵션이 아니다.

2026-10-15 로컬 선제 점검은 실행별 `capabilityMode`와 `backgroundOrigin=scheduled_review`를 공통 loop에 연결한다. silent 허용 자체를 제품 사건의 증거로 사용하지 않는다. 기존 5분 dispatcher가 활성 Slack 채널이 연결된 모든 Workspace를 자동 조회하고 Owner·채널 공유 권한을 확인한 뒤 채널별로 평일 17–19시 KST에 하루 한 번 enqueue하며, 최근 30분 회사 대화가 있으면 미룬다. 새 회사 발화·당일 실행 기한은 미확정 작업을 중단한다. 같은 company-side LLM을 Sol/high와 전체 도구로 실행하고, 역할 대화·실제 전달 이력으로 반복 여부를 판단한다. `job_posting_promote`는 기존 홍보 허용 안에서 한정된 공고 운영에 유입 수요를 기록한다. `send_company_message`는 회사 메시지·역할별 스레드·답글을 원자적으로 확정하고 기존 Slack 경로가 영수증으로 복구한다. 무의미한 연락은 침묵한다. 시장 근거 조회는 설계만이며, 운영 DB·발송·배포는 미반영이다. [구현 계획](company/company-side-proactive-recruiting-implementation-plan-ko.md)과 [완료 기록](evaluation/company-side-conversational-qa/reports/2026-10-15-proactive-completion.md)을 따른다.

선제 점검 시간은 로컬 후속 구현에서 `COMPANY_PROACTIVE_REVIEW_SCHEDULE` 환경변수로 분리했다. `daysOfWeek`, `startTimeKst`, `windowMinutes`를 받으며 기본값은 평일 17–19시 KST다. 기존 5분 dispatcher·최근 발화 연기·중복 방지는 유지한다. 별도 대상 환경변수는 사용하지 않고 활성 Slack 채널에서 대상을 조회한다. 자정에 걸친 창의 날짜는 시작한 KST 날짜이며 이미 접수한 작업은 기존 마감을 유지한다. 실행 프로세스에 환경변수가 반영되어야 적용된다. 운영 설정 변경·배포는 하지 않았다. 구체적인 설정은 위 구현 계획의 외부 설정 절을 따른다.

실제 최근 회사 발화와 Harper 답변은 native user/assistant로 전달한다. 참고 자료·외부 연락은 회사 명령이 아니다.
과거의 실제 회사 위임은 최신 수정·철회 및 기존 승인 계약을 확인해 이어간다. 원문 ID, exact preview,
draft revision, 첨부파일 출처, 현재 시간과 불완전함을 보존한다.
초안의 본문을 서버가 표시한다는 이유로 모델의 도구 결과에서 본문을 제거하지 않는다. 단일·일괄 초안 모두
실제 저장본을 모델이 읽을 수 있어야 요청과의 차이를 알아차리고 일반 수정 도구를 사용할 수 있다.
Role의 최초 작성과 후속 편집은 구분한다. 후속 수정은 영향받는 필드/문구만 변경하고 저장본을 확인한다.
일반 작성은 공통 source 계약, 전문 인물 calibration은 그 계약과 확장 지침을 함께 사용한다.

## 모델과 목소리

### 연락의 단일 계약

팔로업·이력서 요청·관심 확인·정보 전달은 모두 `contact_talent`의 메시지 내용이다.
별도 팔로업 도구·intent 분류·시나리오 상태를 만들지 않는다. 발송 권한과 `send`/`create_draft` 선택은
대화 전체의 의미, 관계, 연락 목적과 중요도를 보고 LLM이 판단한다.
가벼운 답변이나 일상적인 팔로업은 가능하면 `send`를 쓰고, 해당 후보자에게 처음 연락하거나 어조·포지셔닝·설득처럼
회사의 인상이 중요한 순간에는 `create_draft`를 쓴다. `create_draft`는 중요한 순간에 회사가 전달 전 한 번 내용을
검토하는 단계이지 모든 연락의 기본 추가 승인이 아니다. 초안 수정·승인은 기존 exact revision 계약을 쓴다.
단순 고민/평가/제안 동의를 실행 승인으로 추측하지 않는다.
이미 발송한 회사 제안의 응답 대기 중에도 메시지를 전달할 수 있지만, 관심 확인·공유 동의·채용 단계는 바뀌지 않는다.
후보자 상세뿐 아니라 연락 상세 reader도 수락 전 비공개 주소·Career 원문·비공개 문서를 노출하지 않는다.
회사에 전달하도록 허락된 내용은 기존 relay timeline에서 읽는다.
연락과 회신 사이에는 서로 다른 방향의 FK가 있으므로 PostgREST의 자동 관계 추론에 의존하지 않는다.
목록·상세·대화 이력은 `contacts.ts`의 공통 조회에서, 권한 확인 후 회사 범위로 읽은 연락 ID들에
속한 회신을 배치 조회한다. 회사가 답장한 이전 회신을 새 연락의 후보자 회신으로 취급하지 않는다.
목록에는 본문을 읽지 않고, 상세도 기존 공유 경계를 지킨다. 이 경계는 실제 DB read smoke와
조회 회귀 테스트로 확인하며 합성 도구를 쓰는 모델 평가만으로 검증됐다고 보지 않는다.
같은 원본 메시지·Role·후보자의 재시도는 저장된 연락 결과를 먼저 돌려준다. queued/failed 연락을 draft로 재표시하지 않는다.
후보자 수락이나 종료 상태만으로 회사 공유를 추정하지 않는다. 기존 전달·회사 공유의 durable 사실을 검증한다.
아직 전달하지 않은 먼저 제안 후보의 최초 접근은 기존 의사 확인 계약을 유지한다.
즉시 발송은 기존 전달 경로에 즉시 접수한다는 뜻이며 메일 수신·열람·답변은 확인 없이 주장하지 않는다.

직접 발송의 `messageContent`는 회사와 대화한 원본 LLM이 쓰는 **실제 수신자용 최종 본문**이다.
`messageSubject`는 실제 제목, `requestContext`는 내부 연락 주제다. 다른 LLM이 이를 다시 해석해
발송 문구를 만들지 않는다. 원문 모델이 올바르게 작성해도 보조 writer가 임시 문구로 덮어쓴 실제 평가 실패를 제거한 경계다.
`read_talent`는 확인된 수신자 언어를 함께 제공한다. 이력서 링크가 필요하면 모델이 선택한
`{{resume_upload_url}}` slot에 서버가 이 연락의 서명된 URL만 대입한다. 별도 이력서 intent 분류는 없다.
`relayId` 답장에는 이 slot을 쓰지 않는다. URL·길이·필수 필드 검증은 구조 계약이며 본문 의미를 재작성하지 않는다.
사용자가 요청한 검토용 draft/revision은 기존 writer와 exact preview를 유지한다. 이 경로의 보조 writer 품질은 별도 평가 대상이다.

### 대화 모델

2026-10-15 로컬 Slack 답장 참여 판단은 OpenRouter `typesafe/jev-1.13`의 native Decisions API를 사용한다. 최근 대화와 단일 Choice 질문으로 `respond|ignore`를 반환하며 답장 본문은 기존 company-side LLM이 작성한다. 최신 발화의 수신자·진행 중인 요청을 문맥으로 판단하고 일정 키워드 우회는 두지 않는다. 직접 멘션·Role 작성·진행 중 후보자 workflow의 기존 우회는 유지한다. 오류 시 응답 경로로 진행하되 다른 판단 모델을 호출하지 않으며, 최신 메시지로 취소된 요청은 그대로 취소한다. 호출 비용·시간은 공통 usage 기록에 남긴다. [고정 입력 검증](evaluation/slack-reply-routing/README.md)은 로컬 검증이며 운영 배포 완료를 뜻하지 않는다.

요청된 기본 모델은 OpenRouter `google/gemini-3.8-flash`, temperature `0.5`다.
조용히 다른 모델로 바꿔 평가를 통과시키지 않는다. 상세 분석을 수행하는 별도 기존 업무 모델과 사용자와
대화하는 주 모델은 구분해 기록한다. 주 대화 모델은 calibration 뒤에도 임의 전환하지 않는다.

2026-10-09 온보딩 Pitch 입력 화면은 사용자가 요청한 OpenRouter
`anthropic/claude-haiku-5.5`, reasoning `high`를 명시적으로 사용한다. 일반 웹 채팅과 Slack의
기본 모델은 유지한다. 별도 extractor 없이 같은 company-side LLM과 공통 read/update executor를
사용하며, 이 입력 화면에서 필요한 `company_details`와 `company_role_edit`를 첫 completion부터
제공한다. 초기 정보/기능 제공은 trusted caller의 선택일 뿐 실행 권한을 추가하지 않는다.
Haiku의 sampling 옵션은 API 계약에 따라 생략하고 다른 모델로 조용히 fallback하지 않는다.
검증 계약과 결과는 [온보딩 Pitch 평가](evaluation/company-onboarding-pitch/README.md)에 기록한다.

온보딩 Pitch 입력은 후보자에게 회사를 어필할 강점과 근거다. `onboardingPrompt.ts`가 이 입력의 목적과 수정 범위를 제공하며, 같은 일반 read/update 도구로 기존 Pitch에 반영한다. 이 제출의 수정 범위는 Pitch이며 다른 회사 필드나 Role을 자동으로 채우는 요청으로 확대하지 않는다. 제품·성과·문화·혜택의 실제 조건을 보존하는지와 완료 답변을 [v2 평가](evaluation/company-onboarding-pitch/gold-v2.md)에서 실제 저장본과 함께 확인한다.

한국어는 해요체 중심. `네~`, `넵`, `ㅎㅎ`도 문맥에 맞으면 자연스럽게 쓸 수 있다. 모든 답에 웃음·감탄을
붙이라는 뜻이 아니다. 친근함 때문에 없는 관심도·발송·약속을 만들지 않는다. 사용자 예시는 사실/승인 계약이 아니다.
웹의 응답 언어는 `/org`에서 선택한 `ko` 또는 `en`을 현재 요청으로 전달한다. 영어에서는 자연스러운
간결한 채용 파트너의 문체를 쓰고, UI를 직접 가리킬 때만 해당 언어의 실제 label을 쓴다. `/org`는
감지하거나 수동 선택한 언어를 팀원의 `company_users.locale`에 저장한다. Slack은 인증된 팀원과
연결된 같은 값을 읽고, 값이 아직 없을 때 현재 회사 대화의 언어를 따른다. 명시적인 회사 사용자 언어 요청은 기본
언어보다 우선한다. 답변 언어는 후보자 연락과 저장할 Role 문서의 언어를 자동으로 결정하지 않는다.

알림 채널·담당자의 선택과 동의는 회사와 대화하는 원본 company-side LLM이 전체 대화에서 판단한다. 서버는 발화의 정규식·키워드 재판정을 하지 않고 현재 권한, 조직 소속과 정확한 대상 ID를 검증한다. 별도 classifier나 숨은 LLM은 추가하지 않는다.

2026-10-15 로컬 변경: 일반 회사 대화도 `read_role`의 `notification` 조회로 실제 설정과 가능한 대상·현재 팀원/채널을 읽고, 기존 `set_role_notification` 저장 능력으로 채용 상태와 독립적으로 설정한다. 같은 대화의 복수 Role 설정·채용 시작 제안에 대한 동의는 원본 LLM이 해석하며, 승인된 활성화는 기존 `change_role_status` 완료 검사를 따른다. Role 작성 입력에도 실제 현재 Slack 채널을 전달한다. 팀원 온보딩 첫인사는 접근 가능한 draft의 확인된 설정 사실만 받아 유용한 제안을 판단하고, 가입 사건 자체로 설정·채용을 실행하지 않는다. 새 테이블·동의 classifier·시나리오 router는 없다. v27 및 member-welcome-v2 검증은 로컬·합성이며 운영 배포 완료를 뜻하지 않는다.

2026-10-25 로컬 웹 Setup: `/org/new` 첫 입력과 역할 정보 편집은 `ROLE_SETUP_SYSTEM_PROMPT` 하나로 공개 역할 정보와 JD를 작성·저장한다. 회사 자료·같은 회사 공고·웹 참고 자료로 내용을 구체화하며, 공개 필드 저장과 자료 조회 네 도구만 제공한다. Brief·질문·보상 확인·Align은 후속 채용 시작 화면에서 처리한다. 알림과 담당자는 Finalize의 기존 설정/기본값을 사용한다. `descriptionSourceResearch` 기록과 역할 작성 loop의 호출·출력 토큰 상한은 제거했다. provider의 모델/context 한도와 요청 취소 처리는 유지한다. 검증 범위는 evaluation registry의 `role-setup-v1`이며 로컬 미배포다.

별도 웹 Setup을 사용하지 않는 기존 Role 작성 경로는 간결한 discovery 계약을 사용한다. 반복된 진행 예문·설정 설명을 추가하지 않는다.
등록 완료도 별도 장문 템플릿이 아니라 동일 voice/outcome 계약을 사용하며, 역할 활성화와 Slack 전달 결과만 제공한다.
활성화를 worker 실행·후보 발견 증거로 확대하지 않는다. 채용 자격 문구는 source clause로 보존한다.
새 Role은 LLM이 등록 확인 전에 Description, Brief와 Criteria를 작성·저장하도록 지침을 따른다.
Criteria의 제목·근거·독립적 비교 의미는 공통 작성 정본을 따른다. 원본 company-side LLM이 알려진
사실로 먼저 작성·저장해 알리고 대화를 이어가며, 기준 선택 질문이나 별도 Criteria 승인 단계는 필수가 아니다.
Criteria 선작성은 LLM의 책임이며 DB·코드의 유무·개수 완료 조건은 두지 않는다.
초안 편집 중 빈 목록과 기존 등록 Role의 편집은 허용하며, 기존 Criteria의 무단 삭제는 하지 않는다.
이 2026-10-15 변경은 로컬 구현이며 배포 완료를 뜻하지 않는다.

후보자에게 연락 완료를 알리는 답변도 현재 요청과 실제 도구 결과가 우선이다. 전달할 문장에 담긴
사정을 별도의 커리어 상담 요청으로 분류하지 않는다. 상담은 도움을 구할 때 제공하며,
회사의 예상 반응이나 도구가 확보하지 않은 미래 전달 약속으로 완료 답변을 늘리지 않는다.
원본은 `career/prompts/rawPrompts.ts`의 일반 대화 지침이다. 온보딩의 별도 질문 진행은 유지한다.

## 답변 예시 편집

`/ops/answer-examples` → audience **company** → 해당 항목 → **Answer example** → Save.
원본 저장소는 `service_answer_examples.answer_example_text`다. Career 예시는 이번 수정 대상이 아니다.
한국어 정본은 `src/lib/org/serviceFaq.ts`의 `COMPANY_SERVICE_FAQ_ITEMS`이며,
`src/i18n/org/ko.ts`와 `en.ts`가 문서 FAQ의 두 언어를 제공한다.
`scripts/seedCompanyServiceAnswerExamples.ts`는 한국어·영어 질문과 답변을 각각 검색 자료로 등록한다.
한국어 seed key는 유지하고 영어는 `:en`을 덧붙이므로 반복 실행해도 같은 항목을 갱신한다.
운영 DB 적용은 별도 작업이며 사용자의 명시적 수정 요청이 있을 때만 `--apply`를 실행한다.

2026-10-10 사용자의 답변 자료 전체 갱신 요청으로 기존 23개를 검토·갱신하고 16개를 추가했다.
39개 Q&A를 한국어·영어로 등록해 company 자료는 78행이며, 문서는 검색용 가격 별칭 두 개를 뺀
37개 Q&A를 주제별로 보여준다. 기존 company 행의 ID와 career 11행은 보존했다.
등록 후 실제 검색 경로로 두 언어의 새 질문을 확인한다. 이후 운영자가 직접 편집할 수 있으므로
다음 seed 적용 전에는 항상 현재 DB를 먼저 읽고 차이를 확인한다.

이전 2026-09-27 갱신은 company 23개 중 14개의 말투만 반영한 작업이었다.
답변과 수정자·수정 시각 외의 질문, embedding, 태그, 활성화 설정, 메모는 보존했다.
원본/저장 후 비교와 3개 예시의 실제 검색 RPC 반환을 확인했다. 이 확인은 LLM 말투 평가나 앱 배포가 아니다.
복구용 원본과 개별 수정안은 ignored `.local/company-answer-tone-20260927/`에 0600으로 보관한다.
DB 예시는 Git branch와 독립적이다. 운영 변경에는 별도 명시적 승인이 필요하며, 전체 seed의 `--apply`로
기존 수동 수정이나 다른 기능 설명을 덮어쓰지 않는다.

## 평가와 수용 기준

[10묶음·37변형의 사전 정답](evaluation/company-side-conversational-qa/gold-v8.md)과
[평가 장치 계약](evaluation/company-side-conversational-qa/evaluation-contract-v1.md)을 먼저 읽는다.
이 문서는 이상적인 문장과 행동의 의미를 보여 주며 exact-match 정답지가 아니다.
[실행·구조 개선과 남은 gate](evaluation/company-side-conversational-qa/reports/2026-09-25-contract-v8.md)도 함께 확인한다.
도구 선택/대화 품질 평가와 실제 DB/외부 전달 검증을 분리해 기록한다. 합성 도구 결과를 받은 모델의
답변이 좋았다는 사실만으로 실제 발송·저장·권한 검증이 됐다고 말하지 않는다.

필수 기준: 잘못된 대상·미승인 발송·비공개 정보 노출·중복 실행 0, 필요한 업무 누락 0,
맥락을 놓친 재질문 및 미확인 완료 주장 0. 문체·제안·판단은 사람이 전체 대화를 보고 평가한다.
실패는 원문을 보존하고 prompt/context/tool 계약을 고친 뒤 같은 frozen 입력으로 재실행한다.
배포에는 별도 사용자 승인이 필요하다.

## 검증과 재현 도구

- `scripts/evalCompanyAgentCapabilities.ts --dataset=v8 --copy=real --run=<새 ID>`: 실제 Gemini + production 대화 loop, 합성 DB/도구. 직접 발송은 원본 모델의 최종 문구, 검토용 draft는 실제 기존 writer를 쓴다. 별도 evaluator LLM은 없다. `--case=CSCQ806,CSCQ807`처럼 범위를 줄여 재현할 수 있다.
  통신 오류·미완료·빈 실행은 nonzero exit이며, exit 0은 실행 완료만 뜻한다. 의미·말투 통과는 별도 수동 검토다.
- `--mode=full`: 같은 모델·입력·공통 지침에 전체 schema/policy를 제공하는 비교군. 예전 모델/예전 prompt와의 비교가 아니다.
- `scripts/inspectCompanyAgentInput.ts`: 네트워크 없이 첫 호출의 기능 목록·고정 문자 수를 확인한다. 토큰 비용/성능 지표는 아니다.
- `scripts/exportOrgAgentPromptSnapshot.ts --mode=progressive --capabilities=candidate_contact`: 실제 현재 DB를 read-only로 재구성한다. historical replay가 아니며 원래 턴의 검색 예시·이미지 payload까지 완전히 복원하지 않는다. 출력은 private `.local/`에만 둔다.
- `scripts/testCompanyContactDirectDelivery.mjs`: 운영 자격증명 없이 격리 PostgreSQL에서 연락 권한·원자성·서로 다른 연락의 공존·같은 원본 재시도 멱등성·후보자 회신을 검사한다. transport E2E가 아니다.
- `scripts/evalUnifiedCompanyContacts.ts`: UTF8 격리 PostgreSQL에서 실제 executor/RPC와 양방향 회신 5건, 별도 `role-creation` 전체 작성 흐름을 검증한다. 외부 메일/Slack은 로컬 capture다.
- `scripts/evalCompanyContactTransport.ts`: 명시적으로 허용된 기존 추천·계정의 실제 메일 왕복만 검증한다. 로컬 발신 코드와 배포된 수신 처리 코드의 증거 경계를 분리한다.

Gemini는 reasoning `medium`, 최소 output budget 8192(추론 포함)이다. OpenRouter가 HTTP 성공 안에 반환하는 provider error도 오류로 처리한다.
한 turn의 thought signature와 tool call을 보존하고, 첫 응답의 Google upstream에 후속 completion을 고정한다.
근거: [Google thought signatures](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures),
[OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).
가용성 실패를 정상 답변이나 잘못된 대상 확인 질문으로 평가하지 않는다.

### 오류·제보 전달

`report_issue`는 회사 사용자가 요청한 오류·불일치·의견을 기존 Harper 내부 문의 Slack 채널에 전달하는 기본 도구다. 원본 LLM이 요청 여부와 필요한 요약을 판단하고, 서버는 workspace 접근 권한을 검사해 현재 대화·발화·작성자 참조를 붙인다. 전체 대화나 숨은 후보자 프로필·개인 사유를 복사하지 않는다. Slack 성공 응답만 전달 완료의 근거이며 응답 유실은 미확인으로 반환한다. 같은 발화는 안정된 전송 식별자를 사용하고 자동 재시도하지 않는다. 별도 지원 티켓·조사 착수·회신 기한을 만들지는 않는다.


## 2026-10-13: 제품 사건의 회사 안내 (로컬·미배포)

새 Harper 회사 안내는 `companyUpdate.server.ts`의 `enqueueCompanyUpdate`에 사건 목적과 회사 공유 가능 사실만 전달한다. 원본 company-side turn이 기존 대화·권한·일반 도구로 메시지를 작성한다. 결과가 빈 경우 성공 문구를 만들지 않고 실패·재시도로 남긴다. 채용 시작·채널 진입 같은 명시적 시스템 알림과 승인된 원문 전달은 예외다.

2026-10-15 로컬 구현: 팀원 온보딩의 환영 안내는 같은 `enqueueCompanyUpdate`의 명시적 Slack 전달 대상 옵션을 사용한다. 완료 요청 안에서 채널의 팀원 멘션으로 실제 스레드를 만든 뒤, 기존 company_update 사건 실행 경로와 company-side 도구 loop가 목적·사실·실제 대화를 읽어 안내한다. 일반 대화처럼 기능을 필요할 때 로딩하며, 평범한 답변은 환영 스레드에 보내고 send_company_message를 선택하면 여러 메시지·스레드를 기존 batch 전달 경로로 보낸다. 별도 환영 큐를 만들지 않고 기존 사건 job의 숨은 anchor와 재시도를 재사용한다. 가입은 회사 입사가 아니라 Harper Workspace 진입이다. 저장된 Calendar 연결과 일정 조율 준비 완료를 구분하며, 링크와 채널에서 공유 가능한 Role 이름·상태만 제공한다. 이 짧은 동기 안내는 기존 Slack 대화·발송 기록을 사용하고 별도 welcome queue·table·의미 판정 상태를 만들지 않는다. 아직 운영 배포를 뜻하지 않는다.

`composeCompanyUpdate`는 동일 company-side 모델·system prompt·event contract를 사용하는 기존 카드 작성 adapter로 보존한다. 아래 정기 회사 선추천·연결 대기 소개 경로에서는 호출하지 않는다. 이 adapter는 최근 회사 대화와 검증된 카드 사실만 읽어 작성하고 별도 action은 실행하지 않는다. 카드 renderer용 ID/링크/coverage만 코드가 처리하며 prose를 다시 쓰지 않는다. 발송은 기존 outbox의 책임이다. 다른 업무 LLM에 회사용 문구를 작성하게 하거나 업무별 문체 prompt를 복제하지 않는다.

설정 변경은 역할별 거절과 다르다. 기존 회사 추천·프로필·Intro의 조회를 유지하고 공유 가능한 변경/결정 이력을 read tool에 제공한다. 전체 연락 중단 뒤 남은 내부 제안의 처리 의도는 후보자와 대화 중인 원본 LLM이 확인한다. 자동 종료와 별도 동의 classifier는 두지 않는다.

## 2026-10-15: 정기 후보 소개 작성 예외 (로컬·미배포)

정기 회사 선추천·연결 대기 소개는 운영 기준의 Worker 작성 모델과 두 전용 프롬프트를 유지해 완성된 소개를 먼저 전달한다. 공통 company-side LLM은 소개 뒤에만 `messageAlreadyDelivered=true` 이벤트를 받아 필요한 후속 행동이나 발언을 판단한다. 소개 본문을 정형 TL;DR/Note 조립이나 공통 작성기 호출로 대체하지 않는다. 가입일은 소개 작성 전용 조회에서 날짜만 제공하고, 최근 여부와 자연스러운 언급은 이 작성 LLM이 판단한다. [검증 기록](evaluation/company-candidate-writing-playground/reports/2026-10-15-signup-date.md).

## 2026-10-15: 공통 사건 실행과 원문 보존 (로컬·미배포)

새 소식을 설명할 때는 `enqueueCompanyUpdate`를 사용한다. 이미 전달된 결과를 바탕으로 추가 행동만 판단할 때는 `messageAlreadyDelivered=true`를 넘긴다. 기존 agent가 실제 회사 대화·일반 도구로 판단하고, 미전달 필수 알림에 빈 응답/오류가 있으면 가짜 성공문구 없이 재시도한다. 전달된 결과 뒤에는 유용한 구체적 제안·승인된 작업이 없으면 침묵한다. 사실과 목적은 회사의 새로운 실행 승인이 아니다.

후보자 연락은 같은 도구 호출에서 공통 processor를 실행해 첫 전달을 준비한다. 승인 원문과 첨부 링크는 코드가 그대로 보존하며 agent는 유용한 설명과 후속 작업만 덧붙인다. 예전 전달 연락은 유지한다. 상태 변경과 사건은 DB, 작성본·전달 재시도는 기존 회사 큐가 책임진다. 실패 때 raw-copy 우회나 성공문구 덮어쓰기를 하지 않는다.

새 소식의 대상은 정확한 식별자로 전달하고, 처리 시 현재 권한·공유 경계를 확인한다. event 대화는 같은 conversation의 공유 가능한 Web/Slack 문맥을 짧게 읽으며, 원래 Slack 연락의 후속 답변은 그 스레드 기록에 남긴다. 새로운 판단 저장 테이블·enum·DB 제약을 만들지 않는다. 정기 두 후보 소개의 원본 작성/전송은 유지하고 이후 선택적 호출만 추가한다. 역할별 요약 테이블은 추가 호출하지 않으며 첫 팀원 안내는 구현 대상에서 제외한다.

[검증과 운영 적용 전 남은 작업](evaluation/company-side-conversational-qa/reports/2026-10-15-company-events.md).

후속 로컬 점검: 공유 Role 대화는 실제 팀 소속을 바꾸지 않고 read 범위를 수신 팀으로 제한한다. 비공개 General에서 시작한 사건은 관련 Role 문맥을 읽고 같은 작성본을 원래 대화와 Role 기록에 보존한다. 채널별 실제 전송 응답을 기존 메시지에 저장해 성공 채널을 재발송하지 않으며, native Slack 동기화본은 정확한 응답 근거에 한해 UI 중복만 제외한다. 실행 전·전달 직전 현재 권한을 확인하고, 만료된 큐 lease는 같은 job/작성본으로 복구한다. 새 판단 테이블·제약은 없다. [점검·검증 기록](evaluation/company-side-conversational-qa/reports/2026-10-15-company-events-review.md).


## 2026-10-15: 자동 예시 프로필 calibration 종료

채용 시작 뒤 예시 프로필을 자동 생성·전달하는 경로와 준비된 프로필 피드백 도구·prompt·context,
전달 12시간 뒤의 검색 hook을 제거했다. 사용자가 직접 제공하는 실제 참고 인물 해석은 별도
기능으로 유지한다. 운영 DB 제거와 listener 등록 해제는 반영됐고, 웹 reader·UI·tool 제거는
로컬 코드이며 배포 전이다. 이전 웹의 조회를 위한 빈 읽기 전용 호환 뷰는 새 웹 배포 확인 뒤
삭제한다. 구체적인 반영 경계는 [작업 지도](scheduled/codex-work.md)에 기록한다.
## 2026-10-15 수동 인재상 조사 미리보기

`roleSearchResearch.server.ts`는 기존 company-side loop·일반 조회·웹 도구로 조사 결과와 Brief·회사 설명의 초안을 반환하는 수동 진입점이다. 제품 route·queue·Role 활성화에는 연결하지 않는다. `allowedToolNames`는 trusted caller가 도구 노출과 실행을 줄이는 공통 경계이며 capability 로딩으로 넓힐 수 없다. 일반 대화에서 생략하면 기존 도구 제공이 그대로 유지된다. 공개 웹 cache는 세션 메모리에만 보존하고 실제 Brief 수정·후보 연락·회사 발송은 제공하지 않는다.

공통 authoring prompt를 재사용하며 새 업무 목적은 `roleSearchResearch.ts`에 둔다. 모델의 결과는 하나의 Markdown 초안으로 유지하고 인재상 점수·판단 상태·별도 저장 테이블을 만들지 않는다. [수동 평가 계약](evaluation/company-side-conversational-qa/README.md#수동-인재상-조사-미리보기-research-preview-v1-2026-10-15)은 내부 근거의 frozen adapter와 실제 공개 웹을 구분한다. 로컬 구현·미배포이며 실제 회사 데이터 조회·권한·전달 전체 E2E를 뜻하지 않는다.

후속 수동 작성 계약은 조사 근거, 기존 조건을 보존한 Brief 블록과 구분된 탐색 제안, 회사의 부모 메시지·설명 답글 초안을 제공한다. 문서 구분을 파싱하는 새 executor는 없다. 현재 모델의 조사 해석·메시지 품질은 [후속 평가](evaluation/company-side-conversational-qa/reports/2026-10-15-role-search-research-refinement.md)에서 gate 미통과로 기록했으며, 일반 Role authoring·저장 권한과 회사 메시지 발송 경로를 변경하지 않았다.

이후 사용자 정정으로 공통 authoring 계약에서 일반 자격 편집과 위임받은 조사·calibration을 구분했다. 후자는 관련 전문 경력에서 회사·팀·학업 배경의 수준, 가산 강도와 실제 우선순위 효과를 직접 도출해 Brief에 제안한다. 단순 탐색 경로로 약화하지 않으며 회사 확정 기준·Harper의 soft bonus를 구분한다. 독립적인 탈락 기준·저장 권한은 추가하지 않는다. 책임 원본은 `hiringBriefAuthoringPrompt.ts`와 Hiring Brief 정본이며, 수동 업무 지시는 결과물 범위를 지정한다. [research-preview-v2](evaluation/company-side-conversational-qa/research-preview-gold-v2.md)에서 미리 주어진 우대가 없는 다른 직무와 근거 부족 경계를 함께 확인한다.

후속 사용자 요청으로 이 조사 진입점만 `gpt-6.1-sol` / reasoning `medium`으로 고정했다. 공통 loop의 trusted caller별 reasoning override를 사용하며, 일반 회사 대화의 Gemini 기본값과 다른 Sol 호출의 high 기본값은 유지한다. 조사 도구·Brief/설명 초안 작성은 같은 Sol 세션에서 수행한다. 품질 계약도 전이 가능한 경험 수준을 먼저 쓰고 회사·팀·학교를 예시로 설명하도록 보완했다. 특정 출신의 추가 가산과 일반 caliber를 구분하며, 일부 프로필을 전체 팀원 대다수라고 일반화하지 않는다. 새 [v3 의미 기준](evaluation/company-side-conversational-qa/research-preview-gold-v3.md)은 사용자가 v2의 좁은 peer group을 정정한 기록이며 기존 결과를 덮어쓰지 않는다.


2026-10-15 로컬 Hiring Brief 편집: `role_request`는 공통 변경 도구에서 별도 승인 대기 없이 저장한다.
수정 요청·동의·정정이 무엇을 가리키는지는 원본 company-side LLM이 전체 대화로 판단하며,
직전 질문에 대한 응답만 유효하다는 지침은 두지 않는다. 기존 대기 Brief도 현재 저장본을 읽어
일반 변경 입력으로 처리한다. 권한·대상·원문 부분 수정·동시 수정 검사는 유지한다.
Memory와 후보자 연결·채용 등록 등 다른 작업의 승인 계약은 이 변경 범위가 아니다. 미배포다.

## 2026-10-15 회사 이메일 답장 (로컬·미배포)

회사용 Reply-To로 확인된 팀원 답장은 기존 `runOrgAgentChat`과 회사 일반 대화·도구를 사용한다.
`prompts.ts`의 email surface만 비동기 이메일 표현을 담당하며 웹·Slack 원본 문구는 유지한다.
인용 메일은 참고, 현재 발신 본문은 사용자 발화로 구분한다. 전달 대상과 대화 권한은 서버가 검증하고,
원본 발송·수신·답변·provider 영수증은 기존 alias/message/job 저장소에 보존한다.
별도 company-email writer, 분류 모델, 대화 판단 상태는 추가하지 않는다.
[처리 범위·활성화 조건](email-vercel-runtime-ko.md#company-유저-이메일-답장-2026-10-15-로컬-구현-미배포),
[검증·한계](evaluation/company-side-conversational-qa/reports/2026-10-15-company-email.md)를 따른다.

### 2026-10-15 Slack 연결 안내 이메일 prototype

로컬 `companyUpdateEmail.ts`는 공통 company-update 사실 입력과 company-side system/completion을 재사용해 발송 없는 제목·본문 미리보기를 만든다. 수신자별 월수금 점검, 48시간/72시간 간격, 누적 최대 3회이며 후보가 없어도 안내할 수 있다. Workspace별로 횟수를 새로 시작하지 않는다. 실제 집계·스케줄러·durable 발송 연결은 아직 없다.

`email_preferences` 기능은 일반 대화에서는 한 줄 catalog와 지연 로딩, 이메일 답장에서는 첫 completion부터 schema와 정책을 제공한다. 기존 executor가 인증된 본인의 수신 설정만 변경하며 Slack·채용 상태는 변경하지 않는다. 설정 저장용 migration은 로컬 파일만 작성했고 적용하지 않았다. [동결 입력·실행 계약](evaluation/company-email-connection/README.md)을 따른다. 운영 발송·배포 완료를 뜻하지 않는다.

### 2026-10-15 Intro 수락 뒤 연결 결과 안내 (로컬·미배포)

후보자 수락 이력과 내부 알림은 즉시 남기고, 회사용 사건은 기존 Intro의 연결 완료 전이에서 생성한다. 이전 제안의 대상·역할·시점, 실제 연결 결과와 소개 이메일 영수증 사실을 같은 company-side LLM에 제공한다. 사건 목적에 미팅·채용 면책이나 고정 답변을 넣지 않는다. 회사가 직접 결정한 시스템 알림은 후보자가 회사 Intro를 수락한 경로에서는 제외한다. 웹과 새 trigger migration은 함께 반영해야 하며 기존 사건 재발송은 별도 판단이다. [검증과 적용 경계](evaluation/company-side-conversational-qa/reports/2026-10-15-intro-connection-notice.md).


2026-10-16 후속 로컬 구현은 `enqueueCompanyUpdate`의 이메일 분기와 수신자별 outbox, 월수금 10–18시 KST dispatcher, 저장된 연결 설정·후보 집계 조회, 발송 직전 권한/수신 거부/현황 재검사, 고정 payload 재시도 및 영수증 기록을 연결했다. 여러 Workspace가 있는 수신자는 전역 횟수·간격을 공유하지만 답장 맥락 격리를 위해 회차당 한 Workspace를 순환 안내한다. 로컬 PostgreSQL 및 가상 transport로 검사했으며 운영 DB 적용·배포·실제 발송은 하지 않았다. 상세 검증과 적용 전제는 위 company-email-connection 평가 계약을 따른다.

## 2026-10-16 명시적 수동 서치 준비의 저장·회사 전달 (로컬·미배포)

`enqueueCompanyUpdate`의 researchKickoff 요청은 기존 회사 작업 큐와 같은 company-side loop에 조사·대상 Brief 보완·새 Slack 스레드 설명을 맡긴다. 일반 read/web 도구와 대상 Brief 수정·회사 메시지 확정만 허용하며, 모델은 Sol/medium, completion 최대40,000토큰이다. 확정된 메시지 batch와 실제 전달 영수증을 재사용해 부분 실패를 복구한 뒤 기존 검색에 한 번 접수한다. 접수 영수증은 기존 job JSON에 원자적으로 기록하며 새 판단 테이블을 만들지 않는다. 결과 작성에는 같은 run/Role에서 이미 전달한 설명을 제공한다. 채용 시작·정기 자동 호출과 기존 후보 카드 작성 경로는 그대로다. [구현·전달 계약](company/role-search-kickoff-implementation-plan-ko.md), [격리 평가](evaluation/company-side-conversational-qa/README.md#수동-조사-저장전달-research-delivery-v1-2026-10-16).
