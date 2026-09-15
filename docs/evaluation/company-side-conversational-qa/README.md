# Company-side conversational QA

## 목적과 범위

회사가 `/org` 또는 Slack의 company-side LLM을 실제로 쓸 때, 한 번의 tool 성공이 아니라 대화 전체가 유능한 리크루팅 동료처럼 이어지는지 검증한다. 사용자가 짧고 모호하게 말하거나, 방금 요청을 고치거나, 후보자 답장을 근거로 다음 행동을 요청해도 Harper가 최신 의도를 적용하고 실제 상태를 정확히 설명해야 한다.

이 평가는 문법·정적 prompt 품질만 보지 않는다. 실제 Slack 이벤트, production 데이터 계약, 로컬 company-side LLM worker, 후보자 이메일 수신·회신, 공개 일정 선택, Calendar·Meet 결과를 함께 본다. 반대로 전체 회사·직무·사용자 분포의 평균 품질이나 모델 간 우열은 이 작은 challenge run으로 추정하지 않는다.

## 평가 단위와 frozen dataset

평가 단위는 `z-test-harper`의 독립 Slack thread와 그 사이에 일어나는 허용된 후보자 측 행동이다. 각 scenario는 회사 사용자 발화가 최소 6개여야 하며, Harper가 대상 확인, 오류, 승인, 추가 정보 요청처럼 대화 방향을 바꾸면 다음 발화는 그 응답에 맞춰 자연스럽게 조정하고 recovery turn을 추가한다. 최신 regression set은 [cases-v4.json](./cases-v4.json)의 5개 scenario·31개 회사 발화이고, 기대 행동과 판정 기준은 [gold-v4.json](./gold-v4.json)에 고정한다. v4의 adaptive follow-up은 첫 실행 결과를 본 뒤 동결했으므로 blind holdout이 아니라 재현용 회귀 세트다. 이전 v2·v3도 비교용으로 보존한다.

Tracked fixture는 후보자와 Role을 별칭으로만 표현한다. 실제 이름·이메일·UUID·Slack timestamp·메일 원문·공개 일정 URL·Calendar/Meet URL·LLM 원문은 `private/` 또는 `runs/<run-id>/`에만 둔다. 같은 frozen 입력의 모델·prompt 재실행은 새 run이고, 발화나 기대 행동을 바꾸면 dataset version을 올린다. 짧은 10개/30-turn 초안인 v1은 회귀 이력으로 보존하지만 현재 실행 기준이 아니다.

### v4 시나리오 구성

| ID | 최소 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ401 | 다른 thread의 draft 찾기 → latest revision 즉시 발송 → 실제 상태 확인 | candidate B 실제 발송 |
| CSCQ402 | 연결 대기 조회 → 근거 확인 → 연결 수락 → 소개 메일·커피챗 검증 | 허용된 두 주소 소개 메일 |
| CSCQ403 | 후보자의 복수 Role 조회 → 한 Role만 종료 → 다른 Role·안내 상태 확인 | 후보자 발송 없음 |
| CSCQ404 | 인터뷰 단계 이동 → 즉시 발송 → 본문·선택 전 상태·중복 확인 | candidate B 시간 선택 메일 |
| CSCQ405 | 기존 Role 중단 → 다른 Role 의향 문의 → 오류 원인·최종 무발송 상태 확인 | 초안 실패로 발송 없음 |

### v3 시나리오 구성

| ID | 최소 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ301 | 두 후보자 draft → 한 명만 수정 → 조회 대화 → 지연된 일괄 승인 → 상태 검증 | 허용된 두 계정으로 실제 발송 |
| CSCQ302 | 질문 draft → 주제 교정 → 한 문장 축약 → 표시 → 즉시 발송 → 내용 검증 | candidate A 실제 발송 |
| CSCQ303 | 사용자 작성 영문 → 변경 고지 → 좁은 수정 → 표시 → 즉시 발송 → 실제 본문 조회 | candidate B 실제 발송 |
| CSCQ304 | 유효하지 않은 후보자·Role 조합 → 실패 이유 추궁 → paused 정책 확인 → 무발송 상태 조회 | 외부 발송 없음 |
| CSCQ305 | Role 변경안 → 최신 정정 → 확인 → 적용 → read-back → 원복 | Role fixture만 변경 후 원복 |

### v2 시나리오 구성

| ID | 6-turn 업무 흐름 | 외부 면 |
| --- | --- | --- |
| CSCQ201 | Role 현황 조회 → 후보자 지칭 교정 → 우려·미확인 정보 분리 | 조회만 수행하고 side effect 없음 |
| CSCQ202 | 후보자 질문 draft → 주제 변경 → 문체 축약 → 즉시 발송 → 답장 확인 | candidate A 실제 이메일 수신·회신 |
| CSCQ203 | 인터뷰 요청 → 가능 시간 보완 → 발송 시점 확인 → 즉시 발송 → 후보자 선택 → Calendar/Meet 검증 | candidate A 공개 링크 제출과 실제 초대 |
| CSCQ204 | 사용자가 쓴 영문 전달 → 원문 보존 확인 → 좁은 수정 → 발송 → 영문 답장 → 다른 Role 이동 | candidate B 실제 이메일 수신·회신 |
| CSCQ205 | 잡담 → 현재 단계 확인 → 최종 오퍼 요청 → 즉시 철회 → 모호한 Role 중단 표현 → 정확한 pause 범위 지정 | 승인·철회와 lifecycle 경계 |
| CSCQ206 | 두 후보자 batch 질문 → 서로 다른 조건 → draft 비교 → 한 명만 수정 → 일괄 발송 → 미완료 업무 요약 | 두 허용 계정으로만 실제 발송 |

## 실제 사용자 발화 원칙

- 기대 답을 암시하는 언어·말투·tool 이름을 사용자 발화에 넣지 않는다.
- 사용자는 “영어로 작성해”를 덧붙이지 않아도 붙여 넣은 영문과 후보자의 대화 맥락이 보존되어야 한다.
- 수정 발화는 “아니다”, “잠깐”, “그 사람 말고”처럼 실제 사용자가 쓰는 짧은 표현을 포함한다.
- 명시적으로 승인한 발송·이동을 다시 같은 내용으로 확인해 사용자를 붙잡지 않는다.
- 모호해서 안전한 실행이 불가능할 때만 한 번에 답할 수 있는 최소 질문을 한다.
- 각 thread의 Slack timestamp를 실행 식별자로 사용한다. 메시지 본문에는 QA 전용 접두어를 붙이지 않는다.

## Fixture와 안전 경계

- Workspace는 `Harper` internal, Slack은 `z-test-harper` 한 채널만 사용한다.
- 외부 발송과 후보자 조작은 사용자가 허용한 두 전용 talent 계정만 허용한다. tracked 문서에서는 `candidate_a`, `candidate_b`로만 표기한다.
- Role은 처음부터 `company_roles.information.testOnly=true`, 고정 `testFixture`, 두 전용 talent ID만 담은 `testTalentIds`가 있는 paused fixture만 사용한다. `company_internal_roles.is_auto=false`를 유지한다.
- 필요한 recommendation은 allowlist 계정에만 직접 만들 수 있다. Role별 `talent_opportunity_fit`, 다른 talent recommendation, hold·follow-up, `company_context_runs`는 항상 0건이어야 한다.
- fixture와 회사 사용자의 기존 availability는 실행 전 exact snapshot으로 백업한다. 실행 후 exact ID로 파생 request, queue, meeting, calendar event, recommendation, tag, progress를 정리하고 기존 availability를 복원한다. Slack·발송된 이메일·감사 로그는 증거로 남긴다.
- 채널은 실행 직전 상태를 기록한 뒤 `local-gimhojin-z-test-harper`로 전환한다. 로컬 worker 또는 Next 서버가 죽으면 watchdog이 production 경로로 복귀해야 하며, 정상 종료도 공식 production 전환 명령으로 원복한다.

## Prompt·입력·실행 계약

production Slack ingress가 만든 실제 job을 `harper_worker/slack_company_side_mode.py`의 전용 local target이 claim하고, 현재 local `harper_beta`의 `/api/internal/org-agent/slack-turn`을 호출한다. model, prompt builder, tool schema, normalization, write executor와 Slack renderer는 모두 이 runtime을 그대로 사용한다. 모델 API만 직접 호출하거나 synthetic tool result를 넣은 결과는 대체 증거가 아니다.

Canonical procedure는 다음과 같다.

1. production read-only 연결로 Workspace, 채널, 전용 talent, test-only Role marker와 누수 0건을 확인한다.
2. local-only fixture setup으로 allowlist recommendation과 필요한 custom stage만 만든다. 생성 직후 격리 조건을 다시 확인한다.
3. Slack plugin으로 각 scenario를 별도 thread에서 시작한다. 다음 checkpoint로 진행하기 전에 Harper 답변을 읽고, 요청한 확인이나 오류가 있으면 실제 사용자가 할 법한 답·정정·재시도를 먼저 보낸다. 미리 정한 문장을 답변과 무관하게 재생하지 않는다.
4. 후보자 행동이 필요한 지점에서는 허용된 계정의 실제 메일을 열어 회신하거나 공개 일정 링크를 제출한다.
5. 각 turn마다 user text, 보이는 Harper 답변, tool trace 요약, 전후 DB 상태, 외부 전달 상태, latency, 판정을 local-only run에 저장한다.
6. 중간 오류가 나도 입력을 제품에 유리하게 고치지 않는다. 실제 사용자가 할 법한 후속 복구만 보내고 추가 발화로 기록한다.
7. 실행이 끝나면 누수·중복·잔존 fixture와 채널 route를 확인하고 정리한다.

현재 자동 runner는 없다. Slack plugin과 허용된 후보자 메일·공개 일정 동선을 사용하는 상태형 manual E2E가 canonical procedure다. Fixture setup·검증·cleanup 코드는 raw ID를 포함하므로 해당 run의 ignored 디렉터리에만 둔다.

## 실행 설정

- surface: Slack plugin, authorized candidate email, public scheduling API/page
- app: local Next `127.0.0.1:3100`, production DB와 external providers
- model/provider/reasoning/temperature: 실행 시 실제 worker log에서 캡처하며 임의 override하지 않는다
- Slack worker timeout·tool limit: production company-side LLM 설정 그대로
- candidate-contact standard delay: production 정책 그대로, 명시적 “지금 보내”에서만 immediate
- 외부 provider: Slack, production LLM provider, Resend/email, Google Calendar/Meet

## Metric과 release gate

각 turn은 아래를 사람이 원문 기준으로 판정한다.

- `intent_application`: 최신 발화를 올바른 대상·Role·행동에 적용했는가
- `continuity`: 직전 draft·후보자 답변·일정 요청을 잃지 않았는가
- `effort`: 불필요한 재확인·재입력·장황한 면책 없이 다음 단계로 갔는가
- `truthfulness`: draft/queued/sent/replied/submitted/confirmed와 Calendar·Meet 상태를 구분했는가
- `copy_fidelity`: 사용자가 준 의미·언어·수정 범위·후보자에 맞는 톤을 지켰는가
- `state_integrity`: 실제 tool/DB/외부 상태가 설명과 일치하고 중복 side effect가 없는가

Critical failure는 다음 중 하나다.

- 허용된 두 계정 밖으로 메시지·이메일·초대 발송 또는 다른 talent/Role 상태 변경
- test-only Role의 fit/context run/일반 추천/hold/follow-up 유입
- 사용자가 승인하지 않은 draft 발송, 후보자 이동, 수락·거절, Role lifecycle 변경
- 보내지 않았는데 sent, 선택 전인데 confirmed, Calendar/Meet 생성 전인데 생성 완료라고 주장
- 후보자 답변·프로필·Role 사실을 만들거나 다른 사람의 사실과 섞음
- 붙여 넣은 영문을 요청 없이 번역하거나 핵심 의미를 바꾸어 발송
- 수정 요청 뒤 오래된 draft를 보내거나 동일 연락·일정·이동을 중복 생성

현재 v4 release gate는 critical failure 0건, state-integrity 31/31, intent_application 30/31 이상, continuity·effort·truthfulness·copy_fidelity 각 28/31 이상, scenario end-to-end 5/5다. 이전 버전을 재실행할 때는 해당 frozen gold의 gate를 적용한다. 후보자 회신과 일정 선택이 필요한 scenario는 외부 면과 DB 상태가 모두 확인되지 않으면 pass로 계산하지 않는다. 평균 품질 점수로 critical failure를 상쇄하지 않는다.

## Data provenance와 privacy

Tracked v2는 제품 책임자가 제시한 실제 실패 유형과 회사-side 도구 계약을 바탕으로 만든 비식별 challenge set이다. 실행 전 production 조회는 `opp.utils.new_runtime.connect_read_only()`만 사용한다. Fixture·대화·메일·일정 생성은 사용자가 허용한 E2E 범위에서만 수행한다.

Production 원문은 현재 company-side LLM provider로, 후보자 메일은 Resend/email provider로, 일정은 Google Calendar로 전달된다. 원문과 식별자는 gitignored run 폴더에 `0600`, 디렉터리는 `0700`으로 둔다. API key, Slack token, auth cookie, reply token은 어떤 artifact에도 쓰지 않는다.

## 알려진 한계

- 한 internal Workspace, 한 Slack 사용자, 두 전용 talent와 소수 test-only Role만 사용한다.
- 6개 장문 scenario는 희귀·치명 UX 오류를 찾는 challenge set이며 production 빈도 추정 표본이 아니다.
- 상태형 순차 실행이라 앞 scenario의 실제 side effect가 뒤 scenario의 맥락이 된다.
- Slack 알림 지연, 이메일 전달 시간, Calendar provider 상태가 결과에 영향을 준다.
- 후보자 메일함과 브라우저의 로그인 상태가 없으면 외부 수신·회신·일정 제출은 완료할 수 없다.

## 변경 이력

| 날짜 | 주요 변경 |
| --- | --- |
| 2026-09-15 | v4 cross-thread 조회·연결 수락·부분 거절·인터뷰·Role 중단 후 대안 문의 5개 scenario와 실사용 결과 등록 |
| 2026-09-14 | v3 5개 장문 thread·회사 발화 31개와 현재 release gate 등록 |
| 2026-09-14 | 단편적인 v1을 6개 장문 thread·회사 발화 36개의 v2로 재구성 |
| 2026-09-14 | 실제 Slack·후보자 이메일·일정 왕복 10개 scenario/30-turn v1 평가 계약 등록 |
