# Company-side agent 입력·기능 로딩·일반 연락 구현 평가

작업 시작 2026-09-24, 후속 검증 2026-09-25 KST. 로컬 개발 보고서이며 운영 상태 문서가 아니다.
검토자: Codex의 원문·도구 효과 정성 검토. **사용자의 gold 검토와 최종 품질 승인은 아직 없다.**

## 결론

브랜치 구현과 반복 평가 경로는 마련했다. **현재 release gate는 NO-GO**다.
입력 축소와 도구 선택 성공을 대화 품질 개선으로 간주하지 않는다. 자발적인 도움 제안,
간결한 판단, 초안 수정 실패 후의 정확한 안내를 더 검증해야 한다.
운영 migration, 실제 메일·Slack 왕복, 전용 Role 등록 전체 E2E는 실행하지 않았다.

## 구현 범위

- `main`의 기존 변경을 `bd5c847a`로 checkpoint한 뒤 `codex/company-agent-capabilities`에서 작업했다. main은 그대로 보존했다.
- 기본 조회 5개 + loader + 기능 개요를 제공하고, 선택한 기능의 상세 정책·schema를 다음 completion에 함께 추가한다. completion 시작 시점의 도구 목록으로 실행을 제한한다.
- 최근 발화는 native user/assistant로 전달하고 ID·revision·출처·잘림 정보는 별도 metadata에 보존한다. 이전 답변의 metadata가 실제 답변으로 따라 나오는 문제를 수정했다.
- 공통 행동, 문체, 기능 정책, schema, 결과 projection의 원본을 분리했다. 새 router LLM, intent 분류, 일반 답변 후처리 writer는 추가하지 않았다.
- 주 대화 모델은 OpenRouter Gemini 3.8 Flash, 0.5, medium이다. Gemini의 추론 포함 output budget을 최소 8192로 잡고 thought signature 및 같은 turn의 upstream provider를 보존한다. provider 오류를 정상 빈 응답으로 취급하지 않는다.
- 팔로업·이력서 요청·관심 확인은 모두 `contact_talent`의 내용이다. 명확한 위임은 `send`, 검토 요청은 기존 draft/revision 경로다. 별도 팔로업 기능은 없다.
- 이미 전달된 회사 제안의 답변 대기 중에도 연락할 수 있게 기존 연락 RPC와 일반 조회를 확장했다. 비공개 프로필/주소 공개, 수락, 단계 변경과는 분리했다. 실제 전달한 연락에 대한 후보자 회신도 같은 기존 relay로 이어진다.
- 수락 전 연락의 상세 조회에서도 비공개 주소·Career 원본 회신·비공개 문서 조회를 제한했다. 회사에 전달된 relay 내용은 계속 읽을 수 있다. 이는 문구 필터가 아니라 공유 권한에 따른 데이터 projection이다.
- 기존 이메일 writer를 유지하되 일반 연락에도 맞도록 계약을 정리했다. 긴 요청의 끝이 800자에서 잘리는 입력 손실을 수정했다.
- 로컬 회사 FAQ seed의 말투를 완화했다. 운영 `service_answer_examples` 행은 수정하지 않았다.

## 고정 입력과 증거 계층

[v6 gold](../gold-v6.md), [입력](../cases-v6.json), [manifest](../manifest-v6.json).
10개 시나리오, 14변형, 18회사 turn이다. 소수의 합성 challenge set이며 평균 production 정확도를 추정하지 않는다.
기대 행동을 코드의 시나리오 분기로 옮기지 않았다.

| 계층 | 실제 실행하는 부분 | 증명하지 못하는 부분 |
| --- | --- | --- |
| 단위 테스트 | production loop, loader, 입력, schema, serializer, provider 계약, 일부 실제 executor 경계 | 모델의 자연스러움, 전체 DB 동선 |
| 격리 SQL | 새 migration의 실제 함수, 전달 등록·대상·중복·회신 경계 | 운영 schema 전체 호환성, 실제 전송, 다중 process 동시성 |
| v6 `--copy=synthetic` | 실제 Gemini + production loop/prompt/schema/serializer | 이메일 본문 의미, 실제 DB·실행부 |
| v6 `--copy=real` | 위 계층 + 기존 production 이메일 작성·수정 LLM | 실제 DB·권한 조회·메일/Slack 수신 |
| 기존 v4 E2E | Slack ingress부터 허용된 실제 수신까지의 별도 절차 | 이번 브랜치에서는 재실행하지 않음 |

합성 adapter에 도구가 빠졌거나 잘못된 결과 필드가 있으면 harness 결함으로 기록한다.
그 이후 모델이 사실과 다른 완료 주장을 했는지도 별도로 기록한다. 오류 없이 종료했다는 이유만으로 pass를 부여하지 않는다.

## 반복 개선 이력

각 run은 ignored `runs/<run-id>`에 보존하며 덮어쓰지 않았다. 모델 원문은 이 tracked 보고서에 복제하지 않는다.

| Run | 관측·수정 및 해석 |
| --- | --- |
| `gemini-progressive-v5-r1` | high/4000에서 추론 예산 소진과 fixture history adapter 미지원 발견. 중단된 탐색 실행이며 완주 점수 없음 |
| `gemini-progressive-v5-r2` | provider 오류가 빈 정상 응답처럼 처리됨, assistant metadata 노출, 저장되지 않은 초안 문제. 성공 run으로 해석하지 않음 |
| `gemini-progressive-v5-r3` | provider 오류 처리·signature 보존·native 본문 분리 개선. 14변형 중 1개 timeout. Role 기준 serializer fixture와 시나리오 입력 모순 발견 |
| v5 → v6 | 새 Role 요청에 같은 기존 Role이 있던 입력, 관심 미확인인데 연결 대기였던 입력을 정정. 03의 남은 초안 의무 문장도 수정. 사후 수정임을 manifest에 기록했고 v5는 보존 |
| `gemini-progressive-v6-r1` | 14변형/18turn 완료, synthetic writer. 잡담에서 확인하지 않은 업무 현황 추가, 자발 제안 누락. 이메일 수정 의미는 이 계층으로 판정 불가 |
| `gemini-progressive-v6-r2` | 실제 이메일 writer 포함, 14변형/18turn 완료. 잡담 개선. 07의 누락된 `read_contact` adapter 이후 저장하지 않은 수정 문구를 표시하고 예전 revision을 선택하는 실패 발견. 08 제안 누락 지속 |
| `gemini-full-v6-proactive-r1` | 같은 시점의 모든 policy/schema를 넣은 08 비교군도 제안 누락. 한 사례이므로 전체 모드의 성능 차이를 일반화하지 않음 |
| `gemini-progressive-v6-r3` | 연락 상세 조회 adapter와 production 형식 reference metadata를 보완. 자발적 도움은 문체가 아닌 공통 행동 원본으로 통합. 기존 이메일 writer의 지원 사실 추측 금지·일반 메시지 계약을 보완한 후 재평가 |

07 r2에서 초안을 수정하지 않은 것은 단순 문체 문제가 아니다. 저장된 본문과 화면 문구가 달랐다.
이 run의 발송은 합성 effect이며 실제 후보자에게 전송되지는 않았다. 원인은 harness 조회 실패와 그 이후 모델의
잘못된 복구가 함께 있다. 조회 adapter 보완만으로 production의 모든 복구 상황이 해결됐다고 주장하지 않는다.

## v6 r2 원문 검토

| 시나리오 | 행동·상태 검토 | 남은 품질/검증 사항 |
| --- | --- | --- |
| 01 새 Role (Slack/web) | 올바른 전용 흐름 진입/안내, 일반 대화에서 저장 주장 없음 | Slack 안내 장황. 실제 전용 등록 완료는 미검증 |
| 02 오늘 / 이틀 전 연락 | 자동 발송 시각 조회. 오늘은 무발송 확인, 이틀 전은 일반 send | 후자의 답변에 이전 연락 시점이 빠져 이상적인 맥락 설명은 부족 |
| 03 느슨한 이름 / 동명이인 | 유일한 대상은 바로 이력서 요청, 동명이인은 무발송 확인 | 실제 이메일 문구·업로드 링크 의미는 확인했지만 실제 업로드/전송 미검증 |
| 04 잡담 | 도구·외부 효과 없이 자연스러운 짧은 답 | 직전 r1의 근거 없는 업무 현황 언급은 재현되지 않음; 안정성은 추가 표본 필요 |
| 05 판단 | Role·후보자 근거 조회, 확인 제안, 미승인 연락 없음 | 미확인 경력을 잠재적 약점처럼 표현하고 설명이 길어 정성 기준 미충족 |
| 06 두 명 비교 | 두 후보자와 Role을 읽고 기준에 맞게 우선순위 제시 | 판단을 반복하고 불필요한 맺음 질문을 붙임 |
| 07 수정 후 승인 | **실패**: 조회 adapter 오류 뒤 미저장 수정 문구 표시, 이전 revision 선택 | 초안 작성에 제공되지 않은 지원 사실도 추가. 실제 writer/수정 재평가 필요 |
| 07 철회 | 수정 revision 2 보존, 외부 전달 0 | 발송 예약 전 초안 보류. 초안이 남는 것 자체를 무단 발송으로 판정하지 않음 |
| 08 자발 제안 | 비공개 정보 공개·무단 연락 없음 | **실패**: 상태 설명/기다림에서 끝나 구체적인 도움을 제안하지 않음 |
| 09 복합 요청 | Role pause와 후보자 메모 모두 실행 | 외부 연락·후보자 거절로 확대하지 않음 |
| 10 회신 이벤트 | 중복 알림·새 연락 없이 silent completion | 첨부 지시 미실행. 실제 이벤트 전달 E2E는 별도 |

## 최신 v6 r3 재검토

14변형/18turn을 끝까지 실행했고 기록된 domain tool 오류와 최종 completion 오류는 없었다.
이는 **14/14 품질 통과를 뜻하지 않는다.**

- 07 승인: 실제 writer가 날짜 범위를 좁게 수정했고 revision 2를 저장했다. 이어진 짧은 승인에서 같은 revision 2의 본문을 선택했다. 철회 변형은 외부 전달 0이었다. r2의 실패는 이 재실행에서 재현되지 않았다.
- 02·03: 당일 중복 연락 보류, 이틀 전 연락 후 직접 send, 유일 대상 이력서 직접 요청, 동명이인 확인이 유지됐다. 다만 02의 이전 연락 시점 설명은 계속 생략됐고, 실제 연락 본문에 회사 의향을 강조하는 표현이 추가돼 의미 보존도 더 엄격히 검토해야 한다.
- 04: 확인하지 않은 채용 현황을 덧붙이지 않았다.
- 05·06: 근거와 비교는 유지됐지만 미확인을 잠재적 약점처럼 설명하거나 결론을 반복하는 문제가 남았다. Slack 형식에도 일관성 문제가 있었다.
- 08: **다시 실패**. 구체적인 확인 도움을 제안하지 않고 기존 제안의 회신 대기로 끝났다. catalog가 보인다는 사실만으로 자발성이 확보되지 않았다. 규칙/키워드 분기로 통과시키지 않았으며 gate를 그대로 남겼다.
- 09·10: 복합 작업 두 가지 수행 및 중복 없는 silent event 종료가 유지됐다.

이후 연락 상세 reader의 공유 경계, 그 단위 테스트, read schema의 공개 범위 설명,
직접 연락 실패 결과의 action 표기와 writer 공통 문장의 검토 전제 충돌을 보완했다.
이 보완은 아래 코드 테스트로 검증했으며 **r3의 실제 모델 입력과 최종 working tree가 완전히 같다고 주장하지 않는다.**
dirty source fingerprint는 실행 식별자이고 최종 소스의 완전한 snapshot은 아니다.

## 크기·지연·비용

`scripts/inspectCompanyAgentInput.ts`의 2026-09-25 측정:

| 첫 Slack completion 고정 입력 | Progressive | Full |
| --- | ---: | ---: |
| 노출 tool 수 | 6 (기본 5 + loader) | 25 |
| 상세 capability policy 수 | 0 | 9 (공유 정책 포함) |
| System + schema 문자 수 | 23,164 | 86,293 |

약 73.2%는 **고정 문자 수 감소**다. 회사 context, 모델 tokenizer, 추가 loader round trip,
입출력/cache 과금이 포함된 전체 비용 절감률이 아니다. 이후 기능을 로드하면 입력이 커진다.

| Run | 완료 단위/turn | 주 모델 completion | 주 모델 input/output tokens | provider 보고 주 모델 비용 | 단위 전체 소요 범위 |
| --- | --- | ---: | --- | ---: | --- |
| v6 r1 | 14 / 18 | 41 | 337,962 / 27,661 | $0.30435 | 4.95–79.89초 |
| v6 r2 | 14 / 18 | 43 | 362,686 / 27,792 | $0.33841 | 4.38–84.28초 |
| v6 r3 | 14 / 18 | 41 | 339,908 / 28,543 | $0.32669 | 4.30–77.84초 |
| full 08 r1 | 1 / 1 | 2 | 36,641 / 1,055 | $0.03144 | 12.33초 |

단위는 단일 turn 또는 3-turn 전체 대화다. r2의 시간에는 이메일 writer 시간이 포함되지만 비용에는 포함되지 않는다.
실패한 내부 retry와 writer의 전체 사용량이 완전하게 집계된 청구서가 아니다. provider 429와 가변 지연이 관측됐다.

## 코드·DB 검증

- 2026-09-25 명시한 11개 테스트 파일 재실행: **134 passed / 0 failed**.
  `capabilities/capabilities`, `capabilityLoop`, `input`, `modelConfig`, `tools`, `prompts`, `promptFormat`,
  `roleCreationPrompt`, `contactsPrivacy`, 연락 `copy`, `ongoingRelayMigrationContract`의 `.test.ts`.
  실제 연락 reader가 수락 전 주소/원본 회신 query를 건너뛰고 전달된 relay만 반환하는 것도 검사했다.
- `scripts/testCompanyContactDirectDelivery.mjs`: PGlite 격리 DB에서 실제 migration 적용 및 검사 통과.
  미전달/거절된 intro 차단, 즉시 전달의 원자적 등록, 재시도 중복 방지, 미해결 초안 덮어쓰기 차단,
  workspace/Role/test-only 경계, 실제 전달 전 회신 차단, 전달 후 회신 허용, source/document 경계, service-role 전용 실행 권한을 확인했다.
- `tsc --noEmit`: 이번 변경 파일의 오류는 없지만 전체 프로젝트는 기존 오류 때문에 실패한다.
  생성된 `.next*/validator.ts`의 삭제된 network page 참조, ignored private 검증 스크립트의 Supabase 타입,
  기존 `growthTalentGtmReport.test.ts`의 unknown/implicit-any가 남아 있다. 전체 build 성공으로 보고하지 않는다.
- 넓은 기존 회귀 실행에서 삭제된 과거 migration을 읽는 테스트 6개와 미변경 Role 완료문구 기대값 1개도 실패했다.
  이 작업과 무관한 기존 테스트를 통과시키기 위해 고치지는 않았다.
  추가로 실행한 `contactReadsMigrationContract.test.ts`도 삭제된 `20260908160000_org_agent_contact_reads.sql` 참조로 실행 전 실패했다.

## 운영 전 남은 gate와 편집 위치

1. v6 실제 모델 결과를 사용자와 검토하고, 최종 gold를 다음 버전으로 승인한다. 정답을 현재 출력에 맞춰 낮추지 않는다.
2. 미승인/오래된 본문 발송 0, 확인되지 않은 사실 추가 0, 필요한 업무 누락 0을 재현 가능하게 확인한다.
3. 자발 제안·판단의 자연스러움을 추가 사례에서도 확인한다. full/progressive의 대표성 있는 비교가 아직 필요하다.
4. 비운영 환경에서 migration, 실제 executor와 전용 Role 작성, 회사→후보자→회사 전달을 함께 검증한다.
5. 배포·운영 migration·운영 예시 변경은 별도 승인 후 수행한다. 이번에는 push/배포/운영 DB 변경/Notion sync를 하지 않았다.

- 사람이 보는 기대 답: [gold-v6.md](../gold-v6.md). 이미 실행했으므로 의미 변경은 v7로 복사하고 provenance/hash를 남긴다.
- prompt 변경 원칙: [engineering 정본](../../../company-side-agent-engineering-contract-ko.md).
- 답변 예시 UI: `/ops/answer-examples` → audience `company` → `Answer example`.
  로컬 원본은 `src/lib/org/serviceFaq.ts`의 `COMPANY_SERVICE_FAQ_ITEMS[].answer`이며 DB 예시는 별개다.
- 운영 migration 대기: `supabase/migrations/20260924142420_company_contact_direct_delivery.sql`.

원문·payload·tool effect는 owner-only ignored run 폴더에만 있다. API key나 실제 회사·후보자 데이터를 이 평가에 넣지 않았다.
