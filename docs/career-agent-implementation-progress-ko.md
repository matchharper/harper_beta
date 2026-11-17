# Career 최종안 구현 결과

2026-11-16. 추천·대화의 실제 산출물은 [이상적인 대화 19개](evaluation/career-conversation-quality/ideal-dialogues-v7.md)와 [응답 비교](evaluation/career-conversation-quality/reports/2026-11-16-conversation-quality-review.md)에 정리했다. 3000번 화면의 기회·비교 목록 오류를 고치면서 리소스 관련 11개 migration 정의를 운영 DB에 선반영했다. [적용한 DB 범위](agent-guidance/rollout-history.md)를 기준으로 후속 배포를 준비한다. 아래 11월 15일까지의 미적용 기록은 당시 상태다.

2026-11-15 후속: [16개 서비스 시나리오](career-service-scenarios-and-verification-ko.md)를 문서화하고 실제 가입 연결을 수정했다. 자료 생략·처리 실패 복구·중복 요청, 공개 유입 원문의 첫 실행 제공, 범위가 한정된 선호 저장과 초안 언어를 보완했다. 이번 확인은 변경 경계 72개 테스트, 모델 42회 시도 중 40회 최종 응답, 격리된 실제 onboarding UI다. [세부 검증과 남은 운영 적용](evaluation/career-agent-autonomy/reports/2026-11-15-service-review.md)을 참조한다. 기존 공개 조사·메일·Calendar·지속 책임 구현은 유지했다. 운영 배포·migration은 미실행이다.

기준: [최종 구현 설계](career-agent-final-implementation-plan-ko.md). 작업 시작 2026-11-13, 로컬 검증 2026-11-14. 기존 `harper_beta/`·`harper_worker/` checkout에서 구현했다. 운영 migration, 배포, 실제 메일/일정 생성, commit/push는 실행하지 않았다. 기존 AGENTS.md 변경과 설계 문서는 보존했다.

## 구현한 흐름

원본 Career LLM이 사용자 목적·선택·개인화 이유를 결정한다. 새 코드는 공개 근거를 한 번 수집해 여러 사용자가 찾을 수 있게 하고, 개인 자료·판단·기회·위임은 소유자별로 유지한다. 공고가 없는 회사도 기회가 될 수 있으며, 기존 Role 추천·지원·소개 기록과 연결할 수 있다.

| 설계 범위 | 구현 지점 | 현재 결과 |
| --- | --- | --- |
| 공용 원문·검색·회사 및 공고 등록 | `resources/{capture,search,read,indexing,companySources}.ts`, `webSearch.ts`, `openUrlTool.ts`, `saveJobPosting.ts`, `companies/` | 공개 원문 provenance와 immutable observation, 날짜/domain/category 검색 입력, 본문·사실 검색, 기존 Role retrieval 재사용. 공개 등록은 개인 추천이나 회사 계정을 만들지 않는다. |
| 개인별 조사·평가·집합 | `resources/{research,evaluate,operations,sets,tools}.ts` | 실제 Decisions adapter, 명시적 질문, 공통 context snapshot, 입력별 child cache, 부분 실패/재개, immutable set revision과 전체 선택/제외. |
| 원본 agent 입력 | `llmTools.ts`, `generalTools.ts`, capability registry/runtime, main/post-onboarding guide, `handbooks/methods/` | 새 도구가 실제 chat/background allowlist에 노출된다. 기회 발굴·조건 비교·접근·후속 방법은 목적과 도구 계약으로 제공하며 고정 답안이나 별도 판단 모델을 두지 않는다. |
| 일반 기회·선택적 비교 화면 | `opportunities/`, `resources/views.ts`, `career-resources/route.ts`, `CareerResourcePanel.tsx` | JD 없는 기회, 저장/숨김/복원, 근거와 자료, agent가 작성한 실행 요청, 500개 collection paging·전체선택·제외, 사용자 순서 변경과 CAS. |
| 기존 추천 연속성 | `career_wrap_legacy_opportunity_v1`, `career_merge_opportunities_v1`, matching/store·tools·formatters | 기존 추천은 lazy wrapper로 읽고 canonical 추천에 연결한다. 일반 기회에 기존 wrapper를 명시적으로 병합하면 원래 기회 ID·관련 Role·증거를 유지하고 alias로 이전 링크를 받는다. 개인 지원/소개 상태는 기존 recommendation writer가 소유한다. |
| 위임과 대화 간 책임 | `work/`, `externalOperations/effects.ts`, responsibility migration | current/independent 작업, 원래 inbox로 정정 전달, 책임/효과 식별자와 CAS, 중단 및 재시도 경계를 연결한다. |
| Gmail 실제 답장·수신·복구 | `emailWriting/{tool,message,thread,context,sync,webhook}.ts`, Composio/Gmail integration | 실제 thread adapter, 최신 thread 재확인, 정확한 sent-message/RFC receipt, 서명 webhook, generation/lease/cursor, 책임별 중복 방지, 활성 책임의 15분 복구 조회. 불명확한 발송을 재발송하지 않는다. |
| Calendar | `calendar/`, Career OAuth API/hook/settings, Calendar handlers | Gmail과 별도 연결, busy/event 읽기, create/update/cancel, stable event ID·If-Match·초대 옵션·정확한 effect receipt 재조회. |
| 공용 발견→위임한 사용자 | `resources/discovery.ts`, discovery/index migrations, background context | active discovery schedule의 private index와 공개 변경을 연결한다. 기존 공용 자산도 lexical/exact/semantic backfill로 대상이 되며 pause/revision/삭제를 재확인한다. 의뢰 없는 사용자에게 실행을 만들지 않는다. |
| Queue·보존·삭제·사용량 | `resources/{queue,retention,providerUsage}.ts`, maintenance route, 13개 migrations | DB outbox/lease 기반 재개, source/header backfill, 30일 이상 unreferenced cache의 제한된 정리, 개인 원본의 파생 사본 제거, 부모·자식 및 실제 provider call 비용 귀속. |
| 웹 밖 consumer | `harper_worker/opp/found_items_expiry.py` | 공개 등록 공고를 기존 만료 확인 대상으로 포함한다. |

## 마지막 점검에서 수정한 경계

- 도구를 등록했지만 실제 post-onboarding allowlist가 빠져 모델이 사용할 수 없던 연결을 수정했다. Calendar의 기본 도구 allowlist도 확인했다.
- 동일 원문의 최신 재수집 시각과 불변 observation의 최초 관측 시각을 구분했다. Exa의 `source=crawled` 결과만 새로운 원문 fetch의 근거로 사용하며, 단순 요청 시각이나 cached fallback을 새 원문 확인 시각으로 바꾸지 않는다.
- 회사와 공개 source의 연결은 최신 관측본에도 이어진다. 사용되지 않는 과거 관측본을 정리해도 현재 회사 검색에서 그 source가 사라지지 않는다.
- 공개 source가 철회되면 그 source로 실제 작성된 회사 필드와 공개 공고 사본을 제거한다. 독립적으로 얻은 디렉터리 사실·개인 진행 기록은 보존한다. 이전 회사 revision을 가진 worker가 삭제된 본문을 cache에 복구하지 못하게 했다.
- 문서·Memory뿐 아니라 profile/message 원본 hard delete의 파생 cache도 제거한다. 계정 soft delete는 기존 이력 보존 정책을 유지하고 private index와 새 실행을 차단한다.
- 사용자 순서 변경은 서버 transaction과 revision으로 처리한다. agent의 후속 내용 갱신이 사용자가 정한 순서를 덮지 않는다.
- 일반 기회가 있는데 legacy 목록이 비었다는 이유로 전체 빈 화면을 표시하지 않도록 연결했다. 원문 URL은 실제 링크로 연다.
- 별도 저장 없이 진행을 맡긴 기회도 내 기회에 유지한다. alias를 통해 맡긴 작업과 완료 이력까지 연결하고 원래 대화를 열 수 있다. 회사 기회에 나중에 Role이 연결돼도 기존 지원 내역 링크가 유지된다.
- Gmail 재연결 시 이전 trigger 정리 상태를 보존하고, accepted-send receipt 보강 실패는 정확한 message ID로 복구한다. Calendar 응답을 잃은 경우에도 정확한 event/effect를 읽어 확인한다.

## 검증한 것

1. 변경 경로의 Node 테스트 114개 통과: 공개 수집/공고/회사 snapshot, 실제 도구 노출, work 책임, Gmail thread/서명/receipt, Calendar 서비스와 handler 및 실행 경계.
2. PGlite/pgvector SQL·실제 resource processor 테스트 22개 통과(21개 하위 사례와 상위 suite). 사용자 간 공용 재사용·개인 접근 차단, 500개 정확한 paging/제외, immutable revision, 공개 회사 본문 검색, disabled directory 보존, Role 연결/alias, lease와 stale completion, 51개 기존 자산 backfill, 삭제·retention·순서·계정 종료·공개 provenance 철회, 일부 실패 후 성공 child 재사용과 usage 귀속을 확인했다.
3. Worker 만료 테스트 2개 통과. 전체 제품 테스트를 무작정 재실행하지 않고 변경 경로를 확인했다.
4. `pnpm exec tsc --noEmit --incremental false`와 새 화면·resource/Calendar/Gmail 경로의 ESLint 통과. 새 React 화면은 hook 순서·사용자별 query key·mutation 처리·접근성·반응형·실행 요청 보존을 점검했다.
5. 실제 원본 모델의 v10 가상 A/B 사례를 실행했다. 같은 공개 근거에서 개인에게 다른 기회를 제시·저장하고, 중요한 조건과 미확인 기대를 구분했다. 도구 노출 문제와 fixture 오류가 있었던 앞선 실행도 보존했다. [평가 기록](evaluation/career-agent-autonomy/README.md).
6. 실제 OpenAI Decisions API에서 predicate/choice/score 세 형식 통과. 실제 Exa 검색에서 날짜·domain 조건과 12개 결과 요청, 12개 공개 본문의 격리 capture를 확인했다. provider-reported Exa 비용은 USD 0.009였으며, 운영 DB에는 기록하지 않았다.
7. 실제 브라우저에서 데스크톱/390px 모바일을 확인했다. 500개 전체 선택, 페이지를 넘어선 2개 제외와 이동 후 498개 선택 유지, stale revision/재시도 요청 ID 유지, 저장·숨김·복원, 순서 변경, 빈 목록/삭제된 자료, 키보드 저장, 원문 링크를 확인했다. 브라우저는 격리 transport를 사용했고 SQL 검증과는 별개다.
8. 이번 resource/Calendar 정적 번역 키 33개의 원문 일치와 영어 존재를 확인했고 동적 사실 라벨도 작성했다. 전체 `translation:check-career`는 기존 preview 문구 누락·다른 화면 원문 불일치 등 202개 항목으로 실패한다. 이 작업에서 해당 전역 실패를 해결했다고 주장하지 않는다. 운영 번역 DB sync는 하지 않았다.

로컬 테스트 로그는 `/tmp/harper-career-boundaries-final.log`, `/tmp/harper-resource-work-final.log`, `/tmp/harper-career-tsc-final.log`에 있다. 모델 요청/출력, provider probe와 화면 캡처는 평가 폴더의 ignored·owner-only `runs/`에 보존했다.

## 2026-11-14 프롬프트·디자인 후속 개선

일반 기회·비교 도구가 실제 화면 경로를 반환하고 원본 채팅 지침이 이를 연결하도록 수정했다. 검토용 외부 초안의 언어 기준, narrative 섹션 제목 보존, 제목이 보이는 근거, 모바일 collection·Markdown 표, 저장함의 본문 링크와 저장 응답도 보완했다.

새로운 현실적 요청 네 가지를 고정해 원본 모델로 수정 전후 총 8회 실행했다. 수정 경로 테스트 52개와 타입·lint 검사, 실제 생성 결과의 데스크톱/모바일 렌더 및 선택·충돌·복구 동작을 확인했다. [상세 결과와 한계](evaluation/career-agent-autonomy/reports/2026-11-14-prompt-and-experience-review.md)를 참고한다. 아래 운영 적용 전 확인 항목은 그대로 남아 있다.

## 운영 적용 전 남은 확인

코드는 로컬에 있다. 아래는 배포 승인 후 수행할 운영 적용·실측이며 현재 완료한 것으로 표시하지 않는다.

- `20261113105340`부터 `20261113182800`까지 새 migration 13개를 현재 전체 schema의 격리 환경에 적용하고, 기존 운영 데이터 규모에서 backfill/검색/retention 시간을 확인한다. 현재 검증은 실제 migration SQL을 사용하는 최소 fixture DB와 운영 catalog의 읽기 전용 대조다. 운영 DB에 migration을 적용하지 않았다.
- 웹 배포와 Worker 변경을 함께 반영한다. 새 Queue topic `career-resource-jobs-v1`의 callback과 `CRON_SECRET`을 사용하는 retention cron 설정이 포함돼 있다. 기존 Worker scheduler는 코드상 기본 60초마다 `/api/internal/career-agent`의 `collect_due`를 호출하며 새 복구 scan은 여기에 연결했다. 운영 scheduler 생존 여부·환경 설정과 지연은 별도 실측 대상이다.
- Composio에 `/api/webhooks/composio/career-gmail` endpoint와 `COMPOSIO_CAREER_WEBHOOK_SECRET`을 설정하고 Gmail 읽기/답장 권한, trigger의 실제 push/polling mode·fallback·수신 지연을 확인한다. 새 계정 generation의 즉시 catch-up과 15분 복구 코드는 구현했다. 실제 계정 연결/발송/답장은 실행하지 않았다.
- Career Google Calendar OAuth는 `COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID`를 사용한다. 실제 테스트 계정으로 연결·조회·생성·변경·취소를 확인해야 한다. 코드/fixture 테스트로 상대 초대 수신까지 확인했다고 주장하지 않는다.
- 이번 한국어·영어 키만 운영 번역 DB에 동기화한다. 다른 화면의 기존 번역 실패는 별도 범위로 관리한다.
- 관련 공용 자산이 적은 경우/축적된 경우/범용 검색 agent를 같은 사용자·시장·시점·예산에서 비교하는 live 발굴 실험은 아직 하지 않았다. 현재 증거는 재사용·격리·실행 동작과 가상 사례의 개인화 판단이다. 더 좋은 실제 기회 발견율, 답장/면접/오퍼 개선 또는 5분 이내 전달 SLA가 검증됐다는 뜻은 아니다.
