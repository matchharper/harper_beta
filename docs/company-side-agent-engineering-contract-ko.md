# Company-side agent 변경 정본

문서 기준: 2026-09-27. **개발 계약이며 운영 배포 완료를 뜻하지 않는다.**

2026-09-25 [자체 리뷰와 보완](company-side-agent-self-review-2026-09-25-ko.md): 연락 재시도·공유 경계와 입력 출처를 보강했다.
그 자체 리뷰 당시에는 시나리오 평가 전이었다. 이후 사용자 승인으로 실행한 평가와 구조 개선은
[최신 계약·실행 보고서](evaluation/company-side-conversational-qa/reports/2026-09-25-contract-v8.md)에 구분한다.
앱은 미배포이며 이번 평가를 위해 운영 migration이나 테스트 Role을 추가하지 않는다.

## 목적과 변경 절차

Harper는 회사의 채용 파트너다. 대화를 이해하고, 근거를 확인하고, 권한 안에서 일을 이어간다.
기능이 늘 때마다 system prompt 끝에 새 예외를 붙이지 않는다. 변경 전에 이 문서와 해당 제품 계약을 읽는다.

1. 부족한 것이 문체인지, 사실 context인지, 도구 계약인지, 실제 외부 능력인지 먼저 구분한다.
2. 아래 책임표에서 **한 원본**을 고친다. 같은 규칙을 tool description·결과·system에 복제하지 않는다.
3. 기존 일반 조회와 도구로 새 상황도 처리되는지 확인한다. 사례별 intent/router/상태/테이블은 추가하지 않는다.
4. 동결된 대화 평가를 다시 실행하고 실제 전체 답변과 호출·효과를 검토한다. 단어·어미 매칭으로 품질을 판정하지 않는다.
5. 새 입력/정답은 새 dataset version, 코드·prompt·model 수정은 같은 dataset의 새 run으로 기록한다.

## 책임표

| 원본 | 소유하는 계약 | 넣지 않을 것 |
| --- | --- | --- |
| `src/lib/org/agent/uxWritingPrompt.ts` | 해요체 중심의 편안한 비즈니스 채팅, 비례하는 설명 | 승인 절차, 고정 성공 문장 |
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

요청된 기본 모델은 OpenRouter `google/gemini-3.8-flash`, temperature `0.5`다.
조용히 다른 모델로 바꿔 평가를 통과시키지 않는다. 상세 분석을 수행하는 별도 기존 업무 모델과 사용자와
대화하는 주 모델은 구분해 기록한다. 주 대화 모델은 calibration 뒤에도 임의 전환하지 않는다.

한국어는 해요체 중심. `네~`, `넵`, `ㅎㅎ`도 문맥에 맞으면 자연스럽게 쓸 수 있다. 모든 답에 웃음·감탄을
붙이라는 뜻이 아니다. 친근함 때문에 없는 관심도·발송·약속을 만들지 않는다. 사용자 예시는 사실/승인 계약이 아니다.

Role 작성은 하나의 간결한 discovery 계약을 사용한다. 반복된 진행 예문·설정 설명을 추가하지 않는다.
등록 완료도 별도 장문 템플릿이 아니라 동일 voice/outcome 계약을 사용하며, 역할 활성화와 Slack 전달 결과만 제공한다.
활성화를 worker 실행·후보 발견 증거로 확대하지 않는다. 채용 자격 문구는 source clause로 보존한다.
새 Role의 기본 작성물은 Description과 Brief다. 선택적인 구조화 Criteria는 회사가 별도 평가표나
기준 저장을 요청했을 때 작성한다. 기존 Criteria의 무단 삭제도 하지 않는다. 자동 생성 문서 수를 늘려
같은 사실의 독립적 해석과 조건 강화를 유도하지 않는다.

후보자에게 연락 완료를 알리는 답변도 현재 요청과 실제 도구 결과가 우선이다. 전달할 문장에 담긴
사정을 별도의 커리어 상담 요청으로 분류하지 않는다. 상담은 도움을 구할 때 제공하며,
회사의 예상 반응이나 도구가 확보하지 않은 미래 전달 약속으로 완료 답변을 늘리지 않는다.
원본은 `career/prompts/rawPrompts.ts`의 일반 대화 지침이다. 온보딩의 별도 질문 진행은 유지한다.

## 답변 예시 편집

`/ops/answer-examples` → audience **company** → 해당 항목 → **Answer example** → Save.
원본 저장소는 `service_answer_examples.answer_example_text`다. Career 예시는 이번 수정 대상이 아니다.
로컬 seed 원본은 `src/lib/org/serviceFaq.ts`의 `COMPANY_SERVICE_FAQ_ITEMS[].answer`다.
`scripts/seedCompanyServiceAnswerExamples.ts`가 이를 참조한다. 로컬 seed에는 어조 수정 외에 새 연락 계약에
맞춘 설명 변경도 있으므로, 운영 DB와 동일한 내용이라고 간주하지 않는다.
2026-09-27 사용자의 명시적 운영 DB 수정 요청으로 company 예시 23개 중 14개의 말투를 반영했다.
기존 운영 답변의 내용을 기준으로 `네~`, `넵`, `ㅎㅎ`와 자연스러운 해요체를 적용했으며,
로컬 seed의 기능·정책 설명 변경까지 일괄 이관하지 않았다. 나머지 company 9개와 career 11개는 그대로다.
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
