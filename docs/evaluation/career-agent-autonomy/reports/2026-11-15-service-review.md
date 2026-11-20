# 2026-11-15 Career 서비스 구현·검증

대상은 [16개 서비스 시나리오](../../../career-service-scenarios-and-verification-ko.md)다. 기존 공개 조사 재사용·개인 기회·문서·메일·work·schedule 구현을 유지하고, 실제 가입과 원본 agent 사이의 연결 및 관찰된 품질 문제를 수정했다. 운영 배포와 migration 적용은 하지 않았다.

## 실제 수정

- **자료 없는 시작:** UI/API의 이력서·LinkedIn 필수 조건을 제거했다. 기존 자료는 보존하며, 자료 처리 실패 시 텍스트로 설명하거나 연결을 나중으로 미루고 Career에 들어갈 수 있다. 한국어·영어 안내도 함께 수정했다.
- **원본 agent로 직접 연결:** 별도 kickoff 생성과 강제 5분 인터뷰 진입을 제거했다. 가입 transaction이 실제 제출 기록·정확한 공개 공고 유입·완료·기존 원본 agent admission을 함께 저장한다. 이미 진행 중인 legacy 인터뷰 API는 유지한다.
- **완료와 처리 중을 구별:** 파일 업로드만으로 가입 완료를 판단하지 않는다. 프로필 저장·admission 실패는 재시도 가능한 실패 상태로 기록한다. 완료된 요청은 재분석·덮어쓰기를 하지 않고, 진행 중인 요청은 기존 처리 상태를 돌려준다. 기존 처리 timestamp의 비교 갱신으로 동시에 들어온 요청의 분석 소유권을 구분한다.
- **정확한 첫 맥락:** `/jobs`에서 본 공개 원문의 본문·링크·갱신 시점을 첫 실행에 제공한다. 유효한 내부 Role 매핑은 별도로 검증한다. 이후 매 턴에 원문 전체와 온보딩 지침을 반복하지 않는다.
- **한정된 선호:** 모든 one-role exception을 Brief에 넣도록 하던 `write_talent_context`의 원본 문장을 제거했다. 기존 Brief/Memory 목적과 실제 맥락에 따라 저장하게 했다. 반대 규칙·예외 분류기·새 테이블은 추가하지 않았다.
- **초안의 독자와 언어:** 채팅 설명과 제출용 초안의 언어를 구별하도록 기존 main의 언어 문단을 다시 썼다. 외부 독자의 요청 또는 원래 채용 안내를 따르고, 사용자의 명시적인 언어 요청과 기존 문서 언어를 보존한다. 별도 심사·자동 번역·숨은 재작성은 없다.

새 SQL은 `supabase/migrations/20261115074531_career_entry_continuation.sql`이다. 새로운 workflow 테이블 없이 기존 conversation/messages/activity/admission을 사용한다. `security invoker`, 대화 소유권, service-role 실행 권한과 기존 admission 중복 방지를 유지한다. 실패 시 제출 기록과 유입 사건까지 함께 rollback한다.

## 입력과 출력의 관찰

총 42개 원본 Career turn을 시도했다. 40개는 최종 응답까지 완료했고 2개는 시간 초과로 종료됐다. 완료 횟수는 품질 합격률이 아니다. v12/v13은 같은 기반 가상 자료를 쓰는 개발 사례이며 독립 holdout이 아니다. 원본 모델·Decisions selector·production prompt/tool schema를 사용했고, retrieval과 저장 효과는 격리 fixture다. Gold는 모델에 전달하지 않았다.

| 실행 ID 뒤쪽 | 입력 | 결과와 해석 |
| --- | --- | --- |
| `07-49-57-410Z-service-review` | v12, 16개 | 16 응답 완료. entry receipt와 빈 documents의 불일치, 넓은 작업 금지 문구라는 fixture 문제를 발견했다. |
| `07-54-09-344Z-service-followup` | v13, 16개 | 실제와 같은 첫 guide, 정합적인 자료 및 격리 저장 허용. 16 응답 완료. 모든 최종 응답과 관련 저장/조회 결과를 검토했다. |
| `07-59-16-198Z-entry-source` | v14 entry | 공고 본문 누락을 수정한 입력. 이력서를 읽고 PostgreSQL/장애 대응과 공고를 연결했으며, 이미 보유한 공고를 다시 달라고 하지 않았다. |
| `08-05-12-138Z-scoped-context-fix` | v13 scoped rejection | 도구 설명 수정 후 이번 비교의 연봉 예외를 Memory에 한정했다. 장기 1.1억 원/출장 10% 미만 Brief는 유지했다. |
| `08-09-34-647Z-application-language-check` | v13 application | 근거·미확인은 정확했지만 영어 원문에 대한 초안을 한국어로 작성했다. 개선 필요 결과로 보존했다. |
| `08-11-41-735Z-audience-scope` | v13 두 사례 | 두 실행 모두 timeout. 정상 응답이나 조용한 완료로 계산하지 않았다. |
| `08-30-51-734Z-audience-scope-retry` | 같은 두 입력 | 실행은 완료됐으나 application 초안 언어 문제는 남았다. 첫 문구 수정으로 문제가 해결됐다고 판단하지 않았다. |
| `08-32-34-221Z-audience-deliverable` | v13 application | 원래 언어 문단을 독자/산출물 중심으로 정리한 뒤 영어 소개·장애 사례, 한국어 설명을 생성했다. |
| `08-33-27-945Z-audience-final-check` | 같은 application + parallel scope | 두 응답 완료. 두 사례 모두 영어 초안과 한국어 설명을 구분했고 회사별 보류/진행 범위를 유지했다. |

모든 ID의 앞부분은 `2026-11-15T`다. 전체 provider 입력·도구 호출·source snapshot·중간 메시지·저장 결과·최종 응답은 `docs/evaluation/career-agent-autonomy/runs/<ID>/`에 보존했다. 원본 로그는 owner-only ignored artifact이며 이 보고서는 그 로그의 성공 사례만 골라낸 점수표가 아니다. 첫 guide 수정의 실제 입력은 provider request에서도 확인했다. 후속 runner는 postOnboardingContext/guide/types도 source snapshot에 포함한다.

구체적인 관찰:

- 추천은 seed 투자 여부만 따르지 않았다. 한국 원격/직접 개발/기술 소유권/보상과 실제 업무를 연결해 CedarWorks를 제시하고, 이주·출장·전문성 불일치나 이번 분기 비채용인 대안은 구별했다. 실제 기회 화면 링크를 반환했다.
- 초기 정보가 없는 경우 존재하지 않는 경력을 만들지 않고 시작 질문을 했다. Gmail 연결은 필수가 되지 않았다.
- 현 직장에서의 성장에서는 실제 PostgreSQL/장애 대응 경험을 활용한 리더 제안을 작성했다. 경력 전환에서는 인수인계 양식과 주간 점검 개선을 설명하고 결과 수치를 지어내지 않았다.
- 바뀐 출장·고객 지원 비중은 답장이 왔다는 이유로 좋은 진전으로 취급하지 않았다. 기밀 소개문은 제공된 고객명/내부 수치를 넣지 않았다.
- 면접에서는 18건 인터뷰와 문의 45→28 사례를 활용하면서 비교 기간·다른 요인·본인 기여의 미확인을 드러냈다. 오퍼에서는 구두 승진, 고정 보상, 현 직장 대안과 답변 기한을 구별했다.

fixture의 한계도 남긴다. 일부 `read_agent_messages`/`follow_company` 등은 fixture에 adapter가 없어서 실패했고, 일부 읽기는 빈 목록이었다. 이는 production tool의 고장이 확인됐다는 뜻도, 실제 소개 후 회신·추적이 검증됐다는 뜻도 아니다. 해당 시나리오는 실제 실행 경계 테스트와 코드 확인을 함께 보되, 실계정 왕복 검증은 별도로 남긴다. 모델 언어 수정은 최종 3개 응답에서 확인했으며 모든 직군·언어에 대한 보장은 아니다.

## 실행 경계 검증

이번 변경과 직접 연결된 72개 테스트가 통과했다. 중간 main 문구 실험에서 기존 tone assertion 하나가 실패했고, 효과가 없던 tone 변경을 원복한 뒤 동일 suite를 다시 통과했다.

| 테스트 집합 | 개수 | 확인한 것 |
| --- | ---: | --- |
| onboarding HTTP, entry SQL, submissionRecovery, postOnboardingContext, onboardingContinuation, mainPrompts | 35 | 빈 자료/이전 자료 보존, 소유권·storage identity, 완료/처리 중 재시도, 실패 복구, receipt 정확성, 공개 유입과 atomic rollback, 첫 guide/본문의 한정된 제공 |
| resources/database, work/responsibilityDatabase, emailWriting/adapters, work/invocations | 30 | 실제 공용 원문 재사용과 개인 접근 차단, 정정·삭제·pause·revision, 원래 inbox로 후속 전달, Gmail 서명/식별자/generation/중복, 실행 claim과 이어받기 |
| schedules/preOnboarding | 7 | 최초 예약, 기존 완료 사용자 예약 보존, legacy pending/frozen 연락과 중복 방지, stopped/opt-out, 실제 기존 collector 진입 |

PGlite는 실제 migration SQL을 최소 schema fixture에 실행했다. 전체 production schema clone, 운영 데이터 규모의 성능 또는 실제 서비스 권한 구성을 검증한 것은 아니다. 운영 catalog의 읽기 전용 조회로 실제 테이블/컬럼/기존 admission 계약을 대조했다.

TypeScript 전체 타입 검사 통과. 이번 route/dev preview/context/prompt 변경의 ESLint 오류 0개. onboarding의 기존 사용자 이름 초기화 effect 경고 1개는 남아 있으며 숨기지 않았다. 변경 파일의 `git diff --check`도 통과했다.

## 실제 화면 확인

`/dev/career-entry`는 development-only preview다. 실제 onboarding 컴포넌트를 렌더링하고 계정과 HTTP transport만 브라우저 안에서 격리한다. production에서는 notFound이며 외부 쓰기를 하지 않는다. 최종 도착 화면은 receipt를 보여주는 harness이지 실제 Career agent의 전체 UI가 아니다.

- 1440px 영어 화면에서 자료 없음 → 요청 실패 → 입력 유지 → 재시도 완료 확인.
- 390px 한국어 및 360px 최소 폭에서 자료 선택 화면, 처리 실패, 텍스트 대체/자료 나중에 연결, 정확한 `/career?start=chat&source=official_jobs&...&job_slug=cedar-backend` 도착 확인.
- skip receipt의 `applyProfileSources:false`, 정상 빈 제출의 `true`/빈 links, 한국어·영어 locale, 정확한 slug 보존 확인. 강제 coffee-chat 완료 화면은 실제 경로에서 나오지 않는다.
- 390/360 폭에서 문서 가로 폭이 viewport와 같았다. 최종 스크린샷으로 설명·입력·버튼의 배치와 가독성을 검토했다. HMR로 초기화된 세션과 중간 animation screenshot은 최종 확인과 구분했다.
- 최종 360px 화면에서 이전 공유 단계로 돌아갔다가 선택을 유지해 재진입하고, 빈 LinkedIn 입력에서 Enter로 자료 없이 제출해 같은 slug와 한국어 locale로 완료하는 것도 확인했다.
- 입력의 label/help, disabled/processing 상태, hook의 조건부 실행 여부, in-flight 제출 방지, effect cleanup을 React 검토 스킬로 확인했다.

화면 근거는 ignored `runs/service-ui/`의 inventory와 `desktop-profile-en.png`, `mobile-profile-360.png`, `mobile-recovery-360.png`에 있다. 오류 알림의 사용자 문구와 성공 재시도는 실제 DOM에서 확인했으며 개발 콘솔의 실패 메시지를 사용자 알림으로 착각하지 않았다.

## 운영 적용과 남은 검증

이번 요청은 구현 승인이고 배포 승인은 아니다. 따라서 운영 migration, 웹/Worker 배포, OAuth 연결, 실제 발송/지원/초대, 운영 번역 DB 변경을 실행하지 않았다.

1. 기존 13개 resource 관련 migration 뒤에 이번 entry migration을 순서대로 적용해야 한다. 기존 `enqueue_career_onboarding_continuation`과 schema 의존성이 있다. 실제 운영 규모의 backfill/검색/retention 검증은 [기존 구현 기록](../../../career-agent-implementation-progress-ko.md)을 따른다.
2. 새 웹 코드는 entry migration과 함께 반영해야 한다. 오래된 DB에 새 route만 배포하면 RPC 부재로 가입 확정이 실패한다. 새 migration은 기존 RPC를 삭제하지 않아 구형 호출과 공존한다.
3. 이번 문구는 6개 key의 ko/en 12행만 배포 절차에서 동기화한다: `career.onboarding.submitted.without_materials`, `career.onboarding.continue_without_materials`, `career.onboarding.onboarding.17aqzmx`, `career.resume_recovery.title`, `career.resume_recovery.help`, `career.resume_recovery.placeholder`. 전체 사전을 밀어 넣지 않는다.
4. 실제 전용 계정으로 `/jobs` 가입→첫 응답→소개 승인→회사 응답, Gmail 연결·회신 수신, Calendar 권한·초대, webhook/queue/Worker scheduler를 확인해야 운영 end-to-end 완료라고 할 수 있다. 실제 대상에게 테스트 메시지를 보내지 않았다.
5. 좋은 실제 기회 발견율·응답/면접/오퍼 개선·장기 알림의 유용성은 별도 실사용 검증 대상이다. 공용 데이터 재사용은 구조와 SQL·가상 개인화로 검증했으며, 경쟁 방식보다 성과가 높다는 실험 결과로 과장하지 않는다.
