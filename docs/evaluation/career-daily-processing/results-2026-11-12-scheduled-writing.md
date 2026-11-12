# 정기 확인·예약 변경 검증 (로컬, 미배포)

일일 처리, 정기 기회 확인, 사용자 일회성/반복 예약은 `isScheduledCareerRun`으로 구분한다. 이 경로는 같은 `career_main`에 실행 목적과 이메일 지침을 더한다. 일반 채팅, 온보딩, 음성, 즉시 회사 연락의 prompt 선택은 바꾸지 않았다.

## 변경

- 내부·외부 공고 설명은 Worker `opp/agentic/prompts.py`의 기존 final-delivery 지침에서 목적과 실제 실행 계약을 옮겼다. 고정 형식, 문장 수, 추천 개수 제한은 옮기지 않았다. 실제 공고 조회 결과에 따라 같은 Career LLM에 handbook을 제공하며 기존 `load_handbook`으로도 읽을 수 있다.
- `talent_selection`의 collector 생성 요약은 회사 측 agent라는 구현 용어 대신 Harper에서 시작한 추천이라는 사실을 제공한다. 사용자/회사 원문은 이 처리 대상이 아니다.
- 메일이 실제 `sent`이면 다음 provider 호출 없이 종료한다. 지연 발송도 해당 고객·실행의 실제 발송 기록으로 완료한다. `queued`, 실패, 변경된 상황은 성공으로 취급하지 않는다.
- 정기 실행의 matching 도구 결과는 추천 식별자 대신 실제 저장된 공고의 `roleId`를 보여준다. 사용자 URL은 모델 결과에 새로 만들지 않는다. 회사 연결 실행의 `contact_company.recommendationId`와 DB 내부 참조는 그 실행 계약에 필요하므로 유지했다.
- 이메일을 저장하기 전에 공고 ID와 고객의 추천 연결을 확인한다. 없거나 조회에 실패하면 링크만 없애고 발송을 계속한다. HTML, 텍스트 메일과 Career 이력이 같은 정리된 본문을 사용한다. 공개 `/jobs/:slug`, 지원서 등 다른 종류의 링크는 별도 reader의 URL이므로 이 검사 대상이 아니다. 이미 저장된 재시도 메일은 기존 멱등성 계약대로 동일한 본문을 쓴다.

## 확인

아래 변경 경로 테스트 86개가 통과했다. 실제 메일 제공자는 모킹했고 운영 DB·고객에게 쓰거나 발송하지 않았다.

```sh
node --require ./scripts/lib/serverOnlyTestPreload.cjs --import tsx --test \
  src/lib/career/background/emailRoleLinks.test.ts \
  src/lib/career/background/scheduledRuntime.test.ts \
  src/lib/career/background/provider.test.ts \
  src/lib/career/background/delivery.test.ts \
  src/lib/career/agentTurnRuntime.test.ts \
  src/lib/career/matching/store.test.ts \
  src/lib/career/prompts/promptCaching.test.ts
```

주요 확인: 실제 소유 공고만 링크 유지, 다른 고객·없는 공고·조회 오류에서 발송 성공, reference/autolink와 escape 형태 처리, 공개 링크 보존, Career 이력 본문 일치, 저장 결과의 실제 공고 ID 반환, OpenAI/Anthropic 발송 직후 종료, 지연 발송 완료 시 provider 미호출, 기존 중복 발송·소유권 처리 유지.

`tsc --noEmit --incremental false`는 이번에 변경하지 않은 `src/lib/career/companyJobs.server.ts:167,173`의 기존 nullable-string 오류 2건으로 실패했다. 이번 변경 파일의 타입 오류는 보고되지 않았다. 전체 타입 검사 통과로 보고하지 않는다.

실제 모델 평가는 `scheduled-writing-v3`, production 기본 `claude-haiku-5-5` 설정으로 실행했다. 최종 원본은 ignored `runs/2026-11-12T05-27-55-536Z/`에 owner-only로 보관한다. 세 사례의 전체 입력, 도구 호출과 메일을 직접 읽었다.

| 사례 | 결과 |
| --- | --- |
| 내부 공고 일일 제안 | 회사/업무와 후보자 경험의 연결을 설명하고, 수락 시 기본 프로필·공개 이력서로 소개한다는 실제 다음 단계를 안내했다. |
| 외부 공고 반복 예약 | 후보자 경험과의 관련성, 직접 지원 경로, 지원 준비 도움을 구분했다. |
| 내부·외부 혼합 일회성 예약 | 공고별 연결/직접 지원 경로를 구분하고 실제 roleId를 링크 대상으로 사용했다. |

각 사례는 provider 3회 호출 후 발송 도구의 성공으로 끝났다. 마지막 응답은 발송 도구 호출이었고, 발송 이후 설명을 만드는 provider 호출은 없었다. 내부 사례에는 내부 handbook, 혼합 사례에는 둘 다 들어갔다. 외부 사례는 모델이 handbook 도구로 내부 가이드까지 추가로 읽었다. 자동 공급은 조회된 sourceType에 따른 것이며, 수동 가이드 선택은 모델의 판단으로 남아 있다.

문체는 여전히 다소 설명이 길거나 미실행 사항을 언급하는 경향이 있다. 고정 문구나 별도 심사 모델로 출력을 재작성하지 않았다. 세 synthetic 사례는 전체 고객에서의 품질 보증이나 실제 발송 E2E를 대신하지 않는다. v1/v2 fixture 수정 이유와 이전 결과는 README 및 각 원본 run에 보존했다. 과거 발송된 57개 링크를 수정하거나 운영 QA 수치를 재검증한 것은 아니다.

## 후속 수정: 불필요한 미실행 설명과 추천 비중

사용자 요청으로 내부 가이드의 `Explain prior sharing or its absence`, 외부 가이드의 준비·제출 상태 설명, 정기 실행 가이드의 `reflect what actually completed`, outbound 이메일 지침의 중복된 완료·권한 설명을 제거했다. 그 문구를 상쇄하는 금지 문장은 추가하지 않았다. 원본 Career agent와 도구의 동의·실행 계약은 유지한다.

추천 작성 지침에는 두 가지를 반영했다. 함께 제안할 때는 Harper 연결 기회를 앞세우고 더 강조한다. 직접 지원 공고는 짧게 링크로 소개해도 충분하며, 해당 후보자에게 특히 매력적인 구체적 이유가 있을 때 자세히 설명할지 모델이 판단한다. 분량 제한, 고정 문장, 코드상의 문체 검사·재작성은 없다. 추천 handbook 버전은 `2026-11-12-v2`, proactive handbook은 `2026-11-12-v4`다.

- 이전 입력 그대로의 대조 실행: `runs/2026-11-12T05-36-44-545Z/`, `scheduled-writing-v3` 3건. 코드에서 작성 지침을 제거했어도, 합성 입력에 반복된 미승인·미실행 주의가 남은 내부/혼합 사례에서는 미실행 설명이 다시 나왔다. 특정 작성 지침 하나만 제거하면 항상 사라진다는 증거로 사용하지 않는다.
- 정리된 합성 입력과 판단 대비 사례: `runs/2026-11-12T05-37-21-134Z/`, `scheduled-writing-v4` 4건. 기존 합성 입력의 중복 주의 문구를 제거했으며 새 동의는 부여하지 않았다. 전체 메일을 직접 읽었고, 네 사례에서 불필요한 미실행 보고는 없었다. 혼합 추천은 Harper 연결을 먼저 더 자세히 다뤘고, 플랫폼 리더십이 명시된 외부 공고는 자세히 설명했다. 일반 외부 공고도 문단으로 설명한 경우가 있어, 매번 한 줄로 작성된다고 보장하지 않는다.

실제 provider 입력에서도 삭제 대상 문구가 빠진 것을 확인했다. 관련 scheduled runtime/provider/prompt caching 테스트 21개가 통과했다. 모델 원문과 실행 기록은 각 ignored run에 보관한다. 실제 고객 발송·운영 DB 변경·배포는 하지 않았다.
