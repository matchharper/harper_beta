## Free 추천·연결 및 3 Intro: v39 (2026-10-27)

목적은 슬롯 없는 Role의 추천·연결 권한과 월 3 공용 Intro를 원본 회사 LLM이 정확히 설명하는지 확인하는 것이다. [동결 입력](cases-v39.json) · [의미 기준](gold-v39.md) · [재현 manifest](manifest-v39.json). 실행 단위·runner·모델·privacy·gate·한계는 manifest를 따른다. [실행 및 의미 검토 결과](REPORT-FREE-ACCESS-V39.md): 3/3 통과. 과거 v37의 10 Intro 기대값은 이력으로 보존한다. 새 run의 실제 provider 입력과 전체 답변을 읽어 검토하며 운영 효과는 차단한다.

## 웹 Setup 공개 JD 작성: role-setup-v1 (2026-10-25)

목적은 첫 `/org/new` 입력의 공개 JD 작성·저장·결과 설명과 후속 공개 정보 편집이다. [입력](role-setup-v1.json), [gold](role-setup-gold-v1.md), [manifest](role-setup-manifest-v1.json)는 실제 호출 전에 동결한 합성 2건이며 기존 Role/알림 입력을 바꾸지 않는다.

Canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/evalRoleNotificationConsent.ts <fresh-run-id> role-setup-v1 RS01,RS02 role_setup`. 실제 Setup 시스템/context builder와 view별 도구 schema를 재사용하고 조회·저장은 in-memory adapter로 처리한다. `google/gemini-3.8-flash`, low, 기존 temperature를 사용하며 출력 토큰·도구 호출 횟수 상한을 지정하지 않는다. provider 요청 timeout은 120초다. 입력/gold/source/prompt hash와 전체 provider 응답·저장 결과는 ignored owner-only runs에 둔다. provider 외 네트워크·DB·발송은 차단한다.

Gate는 2/2 저장 효과와 전체 JD·답변·tool trace 의미 검토, 근거 없는 필수 자격·허위 완료·미승인 효과 0이다. 공개 문서 완성도와 원본 요구 수준·출처 활용을 판단하며 문구/단어 일치로 채점하지 않는다. 소규모 작성자 challenge로 실제 검색 품질·DB·UI·운영 평균·독립 검토는 포함하지 않는다. 기존 frozen RC04를 별도 run으로 재실행하여 공개 필드 부분 수정 호환도 확인한다.

[최종 결과·실패 기록·검증 한계](reports/2026-10-25-role-setup-simplified.md): 최종 새 역할 2/2와 기존 수정 1/1 의미 검토. 로컬 미배포.

## Slack 새 Role → 웹 채용 시작: v38 (2026-10-25)

[동결 입력](cases-v38.json) · [gold](gold-v38.md) · [manifest](manifest-v38.json) · [실행 결과와 한계](reports/2026-10-25-slack-role-web.md). 합성 4대화/5발화로 상세 JD의 근거 기반 초안 저장·직접 웹 링크, 간단한 의사의 핵심 질문, 영어·이전 대화 보존을 확인한다. 최초 실행 전에 입력/gold를 동결했으며 기존 v6 배경만 재사용한다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v38 --model=gpt-6.1-sol --run=<fresh>`. 현재 회사 기본 Sol/high의 원본 loop·prompt·schema, 합성 tool adapter를 사용한다. Gate는 전체 답변/저장 필드의 의미 4/4와 미승인 효과·허위 사실·공개 JD의 비공개 정보 포함 0이다. 최종 r2가 통과했으며 r1의 추가 기준 작성 시도와 adapter 한계를 별도 보존했다.

모든 입력은 합성, provider 외 네트워크는 차단한다. Gold는 모델에 넣지 않는다. 설정·source/input/prompt hash·provider 원문·tool 효과는 ignored owner-only runs에 둔다. 작은 작성자 challenge로 독립 팀원 검토·운영 분포·실제 DB/Slack/Worker/브라우저 E2E를 증명하지 않는다. 웹·Worker·migration은 로컬 미배포다.

## Free 프로필·월 10 Intro 복원과 활성 Role 1개: v37 (2026-10-22)

[최종 검증·실패 기록·적용 범위](reports/2026-10-22-free-plan-restoration.md): 실제 모델 r2 의미 3/3, 미승인 효과 0. 로컬 PostgreSQL 동시 활성화·Intro 차감·슬롯 만료, 변경 경로 검사와 한국어/영어 화면을 확인했다. 기존 범위 밖 타입 오류 1개는 남아 있다. 후속 승인으로 운영 DB migration `20261022081230`을 적용하고 10 Intro·활성 한도 1 및 이력 보존을 확인했다. 웹·Worker는 미배포다.

[동결 입력](cases-v37.json) · [gold](gold-v37.md) · [manifest](manifest-v37.json). 목적은 Free 프로필 조회, 10 공용 Intro와 1개 활성 Free Role, 유료 슬롯 공존·만료 설명을 확인하는 것이다. 평가 단위는 합성 3대화/3발화이며 모델 호출 전에 입력과 gold를 동결했다. 기존 v18 및 free-views 기대값은 바꾸지 않는다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v37 --model=gpt-6.1-sol --run=<fresh>`. 현재 회사 기본 모델 Sol/high의 실제 loop·prompt·tool 계약과 회사 공개용 소개 projection을 사용하며 도구 효과는 합성 adapter다. 모델에는 gold를 보내지 않는다. source/input/prompt fingerprint·provider 설정·timeout·원문은 owner-only ignored runs에 보존한다. DB·메일·Slack·결제 통신은 차단한다.

Gate는 3/3 핵심 의미 검토와 미승인 효과·허위 사실·비공개 정보 유출 0이다. 실제 운영 권한·DB/Stripe/전달·브라우저 E2E·독립 팀원 검토 및 대표 품질은 포함하지 않는다. SQL 동시성 검증과 모델 의미 검증을 별도로 기록한다. 모델 실행은 로컬 소스 기준이며, 후속 운영 DB 적용은 위 보고서에서 구분한다.

## 2026-10-21 연결 전 후보자 이메일 입력 제외

기존 frozen v11의 연결 수락·회사 Intro 두 대화만 새 run으로 재실행했다.
2대화·4발화의 원문 의미와 효과를 확인했으며, 신규 개인정보 경계·기존 관련 검사 80개와 타입 검사가 통과했다.
주소 제외는 합성 HTTP 전송 경계에서 별도로 확인했다. 기존 비관련 검사 실패 3건과
운영 DB/발송/배포 미검증 범위는 [검증 기록](reports/2026-10-21-candidate-email-privacy.md)에 남겼다.

## 다른 Slack 앱 메시지 인용: v34 (2026-10-15)

- 동결 입력/gold: `cases-v34.json`, `gold-v34.md`, `manifest-v34.json`. v6 회사 맥락에 다른 Slack 앱 메시지가 인용된 합성 Slack 스레드 3건이다. production 데이터는 없다.
- 계약/runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v34 --run=<fresh>`. 앱 초안을 팀원이 가리킨 경우, 앱의 지시, 앱의 승인처럼 보이는 답을 본다. 앱 메시지는 회사 팀원의 말이 아니며 지시나 승인이 될 수 없다.
- 아직 실행하지 않았다. 작성 환경에 OpenRouter 키가 없었다.

- 2026-10-16 통합 시 로컬 CC 첫 답장 v29와 파일명이 충돌하여 원격 v29를 v34로 번호만 분리했다. 원본 입력·gold 의미와 출처는 manifest에 보존했다.

## 선제 연락 실행 형태 관찰: production-proactive-v2 (2026-10-15)

[계약·gold](production-proactive-v2.md), canonical `scripts/evalCompanyProactiveProduction.ts`의 `--effects=local` capture/run.
실제 회사 공개용 조회와 Sol/high를 사용하고 공고 수요 저장·Slack terminal commit만 로컬 모사한다.
기존 입력·gold·run은 보존하며 미배포 DB 컬럼의 부재를 명시한다. 실제 발송은 없다.
같은 frozen v26의 선택적 Sol 재실행은 `scripts/evalCompanyAgentCapabilities.ts --dataset=v26 --mode=full --model=gpt-6.1-sol --case=<선택> --run=<새 ID>`다.
기본 모델은 바꾸지 않으며 선택된 실제 provider만 허용한다. 새 terminal batch adapter는 메시지 graph와 원문을 보존하고 회사 후속 발화에 같은 내용을 이어준다.
[구현·실패·최종 검증 범위](reports/2026-10-15-proactive-completion.md)를 참고한다.
후속 [첫 연락의 배려·맥락 조정](reports/2026-10-15-proactive-warm-opening.md)은 같은 v26의 두 사례·세 턴 선택 재실행이며, 운영 첫 연락 전체의 품질 검증과 구분한다.
[대화 이력 조회 효율 점검과 외부 공고 설명](reports/2026-10-15-history-read-audit.md)은 기존 trace·reader의 페이지 중복 재현과 P03 선택 재실행을 기록한다. 도구 구조는 점검만 했으며 문구 prompt만 수정했다.

## 실제 internal Workspace 선제 점검: production-proactive-v1 (2026-10-15)

[사전 관찰·gold 계약](production-proactive-v1.md). 사용자 지정 세 곳과 최근 실제 회사 발화·활성 채용이 있는 두 곳, 총 5개 Workspace를 읽기 전용으로 관찰한다. 원본 company-side loop와 전체 schema/policy, 실제 회사 공개용 reader를 사용하며 모델은 요청된 `gpt-6.1-sol`, reasoning `high`, OpenAI Responses다. 운영 기본 모델은 바꾸지 않는다.

[실제 읽기 오류·관찰 결과·비용과 한계](reports/2026-10-15-proactive-production-sol.md): 탐색 설정을 false로 제공한 기본 reader를 수정했고 관련 검사 46/46. 전체 r5에서 수용 4곳·실행 계정 수신자 문제 1곳, 해당 prompt 보완 후 P04 선택 재검증 1/1 수용. 서로 다른 소스의 결과를 최종 소스 전체 5/5 gate로 합산하지 않는다. 원본 출력과 상세 사용자 보고서는 ignored owner-only runs에만 보존했다. DB 변경·외부 발송·배포 없음.

Canonical runner는 `scripts/evalCompanyProactiveProduction.ts capture --run=<new> --workspaces=<exact IDs>`와 같은 run의 `run --run=<id>`다. 최초 입력·source·gold hash를 호출 전에 고정하고 추가 live read는 요청별 응답·시각을 보존한다. 동시점 transaction snapshot이나 blind 비교 benchmark가 아니다. 운영 원문·ID·raw 출력·사용자용 상세 보고서는 ignored `runs/`에만 0700/0600으로 저장한다. 연락·쓰기·job·외부 전달은 차단하며 성공을 흉내 내지 않는다. Tool 선택과 미실행 효과를 구분한다. 비용은 관찰된 usage와 공식 Standard 단가로 추정한다.

코드·prompt를 바꿔 같은 최초 입력으로 재실행할 때는 `fork --run=<new> --from=<previous>`를 사용한다. 기존 입력과 결과를 덮어쓰지 않고 source/provenance를 분리한다. 공개 웹 read의 incidental cache write는 run 내부에만 보존하고 운영 documents를 바꾸지 않는다. 읽기 전용 연결 준비는 실제 승인·연결 효과와 구분한다.

단위별 전체 원문·도구 결과를 직접 읽어 사실성, 유용한 다음 행동, 권한/효과, 반복/침묵, 자연스러움과 Slack 가독성을 판정한다. Gate는 5/5 필수 의미와 중대한 허위 효과·정보 노출·미승인 효과 0. 작은 비독립 운영 관찰이며 실제 Slack·Calendar·배송·scheduler·promotion·독립 팀원 검토·운영 평균은 미검증이다. 실행 완료는 품질 통과가 아니다.

## 선택적 정기 점검의 판단·도구·후속 대화: v25 (2026-10-15)

[오류 수정·모델 출력 검토와 남은 gate](reports/2026-10-15-proactive-review.md): 관련 코드 검사 60/60. v26 전체 9대화·13턴 실행, 원문 의미·효과 검토 7/9. 후보 연락에 회사의 미표현 평가를 덧붙인 문제를 보완한 뒤 해당 2턴 선택 재검증은 1/1 통과했다. 승인 뒤 실행·다음 점검의 침묵 등은 개선됐으나 시장 제안과 침묵·말투 편차 때문에 전체 gate는 미통과다. 실제 scheduler·홍보·Slack 다중 메시지를 구현하거나 배포하지 않았다.

[입력](cases-v25.json) · [gold](gold-v25.md) · [manifest](manifest-v25.json). 합성 9대화·13턴은 후보 우선 검토, 기존 위임 실행, 반복 점검의 침묵, 제안 후 실제 회사 승인, 최신 취소, market 근거 부족, 연락 응답 유실, 진행 중 검색과 별도 업무, 외부 미팅 상태 확인을 다룬다. 실행 전 동결했으며 운영 회사·후보 원문은 없다.

Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v25 --mode=full --run=<new>`다. 실제 company-side 모델·prompt/input·전체 schema/policy·일반 tool loop에 선택적 review 입력을 사용한다. 조회/쓰기 효과는 합성 adapter, DB·Slack·메일·Calendar는 차단한다. 정기 scheduler·공고 수요 consumer·임의 Slack batch는 아직 구현되지 않았으며 이 평가가 그 실행을 검증하지 않는다.

Gate는 9/9 필수 의미·효과와 중대한 미승인 효과·정보 노출·허위 완료·허위 시장 수치 0이다. 모델/provider/reasoning/temperature·timeout·source/input/prompt hash와 raw 출력은 ignored owner-only runs에 보존한다. 실행 완료와 전체 원문 의미 검토를 분리하고, 작은 작성자 challenge·독립 팀원 검토 부재·운영 분포와 실제 외부 전달 미검증을 한계로 둔다. 결과는 실행 뒤 별도 reports에 기록한다.

v26 [입력](cases-v26.json)·[gold](gold-v26.md)·[manifest](manifest-v26.json)는 같은 9대화·13턴 중 시장 입력의 원본 통계 정의만 정정한 후속 버전이다. 최신 평가 coverage와 적합·소개 자격·관심·실제 소개를 구분하고, 미기록 종료 사유와 canonical stage를 명시한다. v25 r5를 본 뒤의 unblinded 입력 정정이며 gold 완화가 아니다. 기존 v25는 보존했다. Canonical runner의 `--dataset=v26`를 사용하고 나머지 모델·gate·개인정보·재현 계약은 동일하다. 입력·합성 Role 조회 adapter 문제와 실제 모델 품질 문제를 보고서에서 분리한다.

## 채용 완성 전 Criteria 선작성: role-criteria-v1 (2026-10-15)

사용자 정정에 따라 Criteria 유무·개수의 코드 완료 조건은 제거하고 선작성·안내의 LLM 지침만 유지했다. 아래 초기 검증의 최소 1개 검사 내용은 이전 로컬 구현 기록이다. 같은 frozen 입력으로 prompt-only 동작을 다시 검증하며, evaluation의 작성 기대값은 운영 완료 제약이 아니다.

[실행 결과·중간 실패·한계](reports/2026-10-15-role-criteria.md): 코드 제약 제거 후 같은 입력 4/4의 선작성·안내를 검토했다. 초기 r1~r3와 기존 알림 고정 입력의 전체/선택 회귀는 이전 구현 기록으로 구분한다. 로컬·미배포이며 기존 주변 계약 검사 실패를 보존했다.

[입력](role-criteria-v1.json) · [gold](role-criteria-gold-v1.md) · [manifest](role-criteria-manifest-v1.json). 신규 Role 3직무와 기존 등록 Role의 부분 수정 1건을 합성한 고정 4개 단위를 사용한다. 목표는 독립적인 후보 비교 요소의 직접적인 제목·근거, 등록 전 필수 저장, 별도 기준 선택·승인 없이 알리고 대화를 이어가는 흐름이다. 기존 Role/notification 동결 입력은 보존한다.

Canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/evalRoleNotificationConsent.ts <new-run-id> role-criteria-v1`. 기존 runner를 dataset 선택과 공통 Role 편집 adapter로 확장했으며, 기본 `notification-consent-v1` 실행 명령은 유지한다. 실제 Role prompt/input builder·tool schema·criteria parser·문서 부분 수정·완료 검사와 현재 기본 모델/OpenRouter/reasoning/temperature를 재사용한다. 도구 효과는 in-memory이며 전용 production Role loop·DB executor·Slack/메일 통신은 제외한다.

Gate는 4/4 구조·저장 효과와 전체 정의/답변 원문 의미 검토, 새 hard bar·criteria 승인 병목·미승인 활성화·외부 효과 0이다. 모든 입력은 합성이고, 모델 provider 이외의 네트워크는 차단한다. Gold를 모델에 주입하지 않는다. input/gold/source/prompt hash·설정·provider 원문·tool 효과를 ignored runs의 0700/0600 파일로 보존한다. 소규모 작성자 challenge이며 독립 팀원 검토·전체 discovery E2E·매칭 품질·운영 분포는 미검증이다. 실행 완료는 의미 검토 통과가 아니다. 로컬 구현이며 미배포다.

2026-10-24 역할 정보 입력 화면: 같은 runner의 다섯 번째 인자로 `role_details`를 지정하면 실제 역할 정보 편집 지침과 동일한 도구 범위로 실행한다. 예: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/evalRoleNotificationConsent.ts <new-run-id> role-criteria-v1 RC04 role_details`. 기존 동결 입력·gold는 그대로 유지한다. [RC04 확인 결과와 한계](reports/2026-10-24-role-details-editor.md).

2026-10-25 첫 웹 Setup 모델 확인: 다섯 번째 인자 `role_setup`은 실제 Setup prompt·도구 범위와 `google/gemini-3.8-flash` / low를 사용한다. 같은 frozen RC04는 공개 역할 필드 수정·도구 호출의 작은 호환 확인이며, 새 역할의 자료 조사·Description 품질이나 종단 지연 평가가 아니다. provider 외 네트워크 차단·합성 저장·기존 gold·owner-only run 계약을 유지한다. [확인 결과](reports/2026-10-25-role-setup-preparation.md).

## 회사 사건·소개 후 선택적 후속 행동: v24 (2026-10-15)

후속 전체 점검의 전달·권한·공유 대화·중단 복구 보완과 134개 웹/46개 Worker 테스트, 새 frozen 재실행은 [점검 기록](reports/2026-10-15-company-events-review.md)에 남겼다. 로컬·미배포다.

최종 v24 r4 의미 5/5, v22 r3 의미 3/3 및 관련 단위 테스트 83/83이다. 초기 provider timeout·후속 제안 누락·잘못된 대상 alias와 타입 검사 한계는 [검증 기록](reports/2026-10-15-company-events.md)에 보존했다. 로컬·미배포다.

[입력](cases-v24.json) · [gold](gold-v24.md) · [manifest](manifest-v24.json). 합성 5건은 이미 전달한 소개 후 침묵·구체적 제안·사전 승인 작업, 첫 전달을 준비하는 후보자의 조건부 답변, 아직 연결 중인 수락을 검증한다. 기존 소개 writer·본문은 변경 대상이 아니다. 평가 단위는 고정 대화 이력에 이어지는 한 event turn이며, 현재 공통 company-side loop·prompt·tool contract와 event/contact prompt를 재사용한다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v24 --run=<new>`. 현재 기본 모델/provider/reasoning/temperature·120초 turn 제한·source/input hash를 owner-only run manifest에 남긴다. 도구 효과와 조회는 합성 adapter이며 DB·Slack·메일 통신을 차단한다. 운영 원문·식별자·비밀 정보는 입력에 없다. Gate는 5/5 원문 의미 검토와 중대한 미승인 효과·허위 완료·사유 추정 0이다. raw는 ignored runs의 0700/0600. 소규모 작성자 challenge이며 독립 팀원 검토·운영 정확도·실제 전달 E2E는 포함하지 않는다. 원문 보존·동의·배송 재시도는 실제 코드/SQL의 별도 격리 검증이다.

## 공통 Tool 오류 전달 (2026-10-14)

공통 오류 직렬화와 채널별 연결, 기존 frozen v20의 재실행 결과 및 미통과 한계는
[검증 기록](reports/2026-10-14-tool-errors.md)에 정리했다. 로컬 구현이며 미배포다.
공통 실행 계층과 모든 로컬 tool 경로 연결의 후속 검증은 [구현·비교 기록](../../tool-execution-error-transport-verification-ko.md)에 정리했다. 새 v20 r1/r2/r3는 전달 확인, 의미 검토 2/3으로 응답 유실 판단 gate가 남았다.

## v23: 기존 추천 발송함의 공통 회사 메시지 작성 (2026-10-13)

[입력](cases-v23.json) · [gold](gold-v23.md) · [manifest](manifest-v23.json). Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyUpdateComposition.ts <new-run-id>`. 공통 event prompt와 실제 company-side 생성기·모델·카드 parser를 사용한다. DB read 대신 frozen 회사 대화/공유 가능 사실을 주며 실제 발송은 차단한다. 단위는 ready/수락한 합성 후보 2건; gate 2/2 의미·카드 coverage/링크 검토. 모델 설정·source hash·provider raw는 run에 보존한다. raw는 ignored 0700/0600, 운영 data 없음. queue/Slack/auth E2E와 큰 chunk/독립 팀원 검토는 미포함.

## 회사 공통 이벤트와 기존 추천 보존: v22 (2026-10-13)

[입력](cases-v22.json) · [gold](gold-v22.md) · [manifest](manifest-v22.json). 합성 3건의 거절·미팅 일부 실패·연락 설정 변경을 회사 대화의 다음 응답으로 전달한다. Canonical runner는 `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v22 --run=<new>`다. 기존 원본 company-side loop·prompt·공통 event prompt와 현 기본 모델/OpenRouter 설정을 사용하며 도구/DB는 격리 adapter다. 모델/provider/reasoning/temperature·시간 제한·source/input hash는 run manifest에 기록한다. Gate는 3/3 수동 의미 검토, 미승인 효과·허위 완료·개인 사유 추정 0. 새 role이나 runtime 분기를 사례별로 만들지 않는다. 데이터는 합성이며 운영 원문을 복사하지 않았다. DB·Slack·메일 통신 차단, raw runs는 ignored 0700/0600. 소규모 challenge·작성자 검토이며 실제 queue/권한/Slack E2E와 독립 팀원 검토는 미포함. 실제 DB 상태 경계는 `scripts/testPresentedCandidateLifecycle.mjs`의 PGlite 검증과 별도다.

## Harper 팀원에게 제보: v21 (2026-10-13)

[입력](cases-v21.json) · [사전 정답](gold-v21.md) · [manifest](manifest-v21.json). 회사의 명시적 오류·제보 요청을 전달하고 성공/미확인을 사실대로 설명하는지 평가한다. 합성 4대화·4발화, 웹/Slack 성공·응답 유실·초안만 요청을 포함한다. 정성 판단은 원본 company-side LLM이 맡고 schema는 summary만 받는다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v21 --run=<new>`. 실제 prompt·model loop·제보 helper를 사용하고 transport만 합성 adapter로 교체한다. 현재 기본 모델/OpenRouter/reasoning/temperature와 source·input hash는 run manifest에 남긴다. Gate는 4/4 수동 의미 검토, 예상 전달 효과 일치, 허위 성공·미승인 전송·정보 노출 0. 기존 입력과 gold는 덮어쓰지 않는다. 원문은 ignored runs의 0700/0600 파일; DB·메일·Slack 통신 차단, 합성 자료만 provider 전송. 실제 Slack·인증 E2E와 독립 팀원 검토, 운영 평균은 범위 밖이다.

[검증 결과·한계](reports/2026-10-13-support-tool.md): 최종 r4 4/4 의미 검토, 테스트 87/87 및 타입 검사 통과. 미배포.

## 알림 설정의 문맥상 동의: notification-consent-v1 (2026-10-13)

2026-10-15 오류 복구 보강 뒤 같은 frozen 입력을 `20261015-error-recovery-notification-r1`로 재실행했다. 정확한 대상/무효과와 Codex 원문 의미 검토 6/6이다. 실패 뒤 실제 저장된 알림 설정을 읽어 반환하는 경계와 사용 가능한 채널·팀원 검증은 별도 단위 테스트로 확인했다. 원문·manifest·`review.json`은 ignored runs에 보존하며, 실제 DB/Slack 전달이나 전체 Role 등록 E2E를 증명하지 않는다. 로컬·미배포다.

[입력](notification-consent-v1.json) · [gold](notification-consent-gold-v1.md) · [manifest](notification-consent-manifest-v1.json). 회사와 대화하는 원본 LLM이 승인·정정·보류를 판단하는지 확인한다. 단위는 고정 이력이 있는 합성 1-turn 대화 6건이다. Canonical runner는 `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalRoleNotificationConsent.ts <new-run-id>`이며 실제 Role prompt/input builder·tool schema·기본 모델 설정을 재사용한다. 도구 효과만 in-memory다. 별도 classifier는 없다.

Gate는 정확한 대상/무효과 6/6, 미승인 변경·활성화·허위 완료·반복 동의 요구 0이며 전체 원문을 직접 검토한다. 모델/provider/reasoning/temperature, frozen hash와 source/prompt fingerprint를 run에 기록한다. 합성 자료만 OpenRouter에 보내고 DB·메일·Slack 통신을 차단한다. 원문은 ignored runs의 0700/0600 파일이다. 실제 저장/RPC/전달과 전체 Role 등록 E2E, 독립 팀원 검토는 미검증이다. 기존 Role v3 입력은 보존한다. [검증 결과·한계](reports/2026-10-13-notification-consent.md): 6/6 의미 검토, 미배포.

## 검색 접수 권한 거절: v20 (2026-10-13)

[입력](cases-v20.json) · [사전 정답](gold-v20.md) · [manifest](manifest-v20.json)은 합성 3대화·3발화다. 웹·Slack의 확정된 팀원 등록 거절과 웹의 응답 유실을 구분한다. 기존 권한 검사와 frozen 입력은 유지한다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v20 --run=<new>`. 실제 company-side 모델·loop·검색 executor·결과 formatter를 재사용하고, DB read/RPC만 합성 adapter로 대체한다. 모델/provider/reasoning/temperature·timeout·source/prompt/input fingerprint는 run manifest에 기록한다. Gold는 모델에 주입하지 않는다.

Gate는 3/3 원문 의미 검토, 검색·연락 효과 0, 허위 성공·권한 우회·내부 진단 노출 0이다. production 식별자·원문을 사용하지 않으며 모델 provider 이외의 DB·Slack·메일 통신을 차단한다. 원문은 ignored `runs/`의 0700/0600 파일로 보존한다. 소규모 challenge와 구현자 검토이며 실제 DB 권한·검색 처리·transport E2E·독립 팀원 검토는 제외한다. 결과는 [검증 보고서](reports/2026-10-13-search-rejection.md)에 기록한다.

## Team의 Role 접근 범위: v19 (2026-10-12)

[입력](cases-v19.json) · [gold](gold-v19.md) · [manifest](manifest-v19.json)은 첫 호출 전에 동결한 합성 3대화·3발화다. 팀원의 현재 팀·허용 Role 안내, 이름을 알고 있는 다른 팀 Role의 조회 제한, Owner의 전체 접근을 검증한다. 팀은 선택적이며 Slots·Intro·결제는 Organization에서 관리한다.

Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v19 --run=<new>`다. 실제 company-side loop·prompt·도구 계약과 현재 모델/provider/reasoning을 사용하고 run마다 소스·설정·입력 hash를 보존한다. 접근 정보와 Role 목록은 입력 사실이며 모델이 권한을 정하지 않는다. 기존 frozen 버전은 변경하지 않는다.

Metric/gate는 대화별 필수 의미 3/3, 중대한 권한·정보 노출·허위 사실·미승인 효과 0이다. 원문을 사람이 읽어 판정하며 문자열 일치는 의미 검토를 대신하지 않는다. 입력·Role·팀원은 합성이고 DB·Slack·메일 호출을 차단한다. 원문은 ignored `runs/`에 owner-only로 보존한다. 소규모 기능 challenge와 작성자 검토이며 운영 분포·독립 팀원 검토·실제 Slack 전달은 미검증이다. 서버/DB/UI 검증과 [실행 결과](reports/2026-10-12-team-role-access.md)를 구분한다.

## Free 무제한 Role·독립 공용 Intro: v18 (2026-10-08)

2026-10-12 Intro 명칭 변경과 전체 점검: 같은 frozen v18을 보존해 새 run으로 검증했다. 최종 전체 r8은 6대화·8발화의 한국어·영어 명칭 목표 6/6이며, 미확인 회사 플랜 추정은 없었다. 두 부족 경로의 별도 notice·무효과와 관련 테스트 51개, 실제 요금제 화면도 확인했다. 한국어 가격 답변의 조건부 Slots/Billing 확인 경로 누락 때문에 전체 frozen gold는 5/6이며 전체 품질 gate 통과를 주장하지 않는다. [중간 실패·변경 범위와 검증 한계](reports/2026-10-12-intro-terminology.md).

2026-10-10 서비스 안내 보완: 같은 v18의 가격·공용 크레딧 4대화와 보완 후 공용 크레딧 2대화를 선택 실행했다.
결제 메뉴의 제공 범위와 슬롯 없는 회사 Intro 연결을 확인했다. 최초 오류, 영어 가격 링크 누락과
전체 gate 미검증 범위는 [검증 기록](reports/2026-10-10-service-guidance.md)에 남겼다.

[입력](cases-v18.json) · [gold](gold-v18.md) · [manifest](manifest-v18.json)은 기존 v16을 보존하고 새 정책을 호출 전에 동결한 합성 6대화·8발화다. 목적은 Free Role 무제한, 공용 월 10개와 Slot 월 50개의 공존, 차감 우선순위·유료 기능 경계·만료 시 유지·실패 정직성 확인이다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v18 --run=<new>`. 현재 company-side 모델·provider·reasoning과 실제 prompt/tool contract를 사용하고 매 실행의 설정·입력 hash·소스 fingerprint를 기록한다. 평가 단위는 대화 전체이며 gate는 6/6 의미 검토, 중대한 정책/권한/허위 완료 오류 0, 두 크레딧 부족 경로의 무효과·별도 notice다. 수치 검증만으로 의미 통과를 대신하지 않는다.

모든 입력은 합성이고 외부 DB·Slack·메일은 차단한다. 원문은 ignored `runs/`의 owner-only 파일에 보존한다. 월 주기와 유료 우선 차감은 구현 기본값으로 명시했다. 독립 팀원 label review와 실제 결제·운영 전달은 미검증이며 단일 표본이 운영 평균을 증명하지 않는다. [이번 검증 결과](reports/2026-10-08-shared-free-credits.md). 최종 항목별 정책 검토는 r3의 4대화 + r4의 가격 질문 2대화에서 6/6이다. 첫 run timeout과 중간 안내 누락, 단일 최종 전체 run이 아닌 한계도 보고서에 보존했다.

## Slot 상품 용어·Enterprise 계약 설명: v16 (2026-10-07)

v13의 합성 입력 4대화·5발화를 보존하고, 사용자가 확정한 Slot 용어와 Free·표준 Slot 성공보수 없음,
요청한 Enterprise에만 별도 비용 모델을 합의할 수 있다는 기준을 새 gold에 동결했다.
[입력](cases-v16.json) · [gold](gold-v16.md) · [manifest](manifest-v16.json).
목적·단위·실행/개인정보 경계·metrics·4/4 자체 검토 gate·한계는 아래 v13과 동일하다.
Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v16 --run=<new>`.
모델·설정·원문·source hash는 owner-only runs에 보존한다. 기존 v13 입력·gold·manifest는 수정하지 않는다.
[실행 결과](reports/2026-10-07-billing-notices.md#slot-용어와-확정된-enterprise-정책--v16-추가-검증): 4/4 자체 정책 검토, 5/5발화 실행. 독립 팀원 검토·실제 전달 E2E는 미검증.

# Company-side conversational QA

## 후보자 선추천 전달 사실 검증: v15 (2026-10-07)

실행 결과: 최종 r6의 핵심 사실·불확실성 의미 3/3. r1–r5의 실패와 부가 안내 품질 한계는
[검증 보고서](reports/2026-10-07-matching-history-reader.md)에 보존했다. 전반적 답변 품질의 완전 통과를 뜻하지 않는다.

[cases-v15.json](cases-v15.json) / [gold-v15.md](gold-v15.md) /
[manifest-v15.json](manifest-v15.json)은 앱 카드·이메일·관심 여부를 구분하는 합성 3대화·3발화다.
`read_talent` 상세 조회의 production 회사 공개용 projection과 formatter를 재사용한다.
Canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v15 --run=<new>`.
현재 production model/provider/reasoning/temperature, source/input hash와 원문을 owner-only runs에 남긴다.
Gate는 상세 조회·시각·미확인 상태에 대한 전체 답변 3/3 의미 통과, 미승인 효과·정보 노출·허위 완료 0이다.
동결 전에 공개 상태 사실만 합성했으며 DB·메일·Slack 호출은 차단한다. 각 1회 표본이므로 운영 평균이나
DB/RPC/transport E2E, 독립 팀원 검토를 증명하지 않는다. 실행 전 동결된 v6 기반 입력/정답은 보존한다.


## 후보자 선추천 상한 이력: v17 (2026-10-08)

간결한 이력·개인정보 안내를 적용한 후 같은 frozen v17을 r1/r2로 재실행했다. r2는 실행 3/3, 핵심 상한 사실·미기록 경계 3/3, 전체 gold 2/3이다. 미기록 답변에서 확인된 선정 0명 집계를 생략하는 한계가 남아 있다. [변경·검증·남은 gate](reports/2026-10-08-compact-matching-history.md). 운영 DB·실제 추천 발송은 하지 않았다.

최종 r3는 3/3 실행·해당 과거 사실의 의미 검토 통과(critical 0)였다. r1/r2의 상한 재개 표현,
근거 없는 별도 문의 안내·미기록을 비공개로 설명한 문제는 덮어쓰지 않고 보존했다.
그 실행의 `company_details` 조회 오류는 frozen adapter에 회사 상세 테이블이 없는 한계였으며 실제 DB 오류가 아니다.
현재 입력은 당시 수치·누락·상한과 같은 경우·선정과 발송을 구분한다. 구현자 검토이고 독립 팀원 검토는 아니다.

[입력](cases-v17.json)·[사전 정답](gold-v17.md)·[manifest](manifest-v17.json)은 호출 전에 동결한 합성 3대화다.
최신 run의 당시 연결 대기 14명/상한 10명, 기본 5개 밖의 과거 기록 조회, 당시 수치가 미기록인 경우를 검증한다.
기존 v14·v6 입력/정답은 보존한다. 단위는 대화 전체이며 실행 완료, 경로·수치·미확인 상태의 사실성,
필요한 추가 조회, 비공개 정보 노출과 권한 없는 효과를 원문으로 검토한다. Gate는 3/3 의미 통과와 critical 0이다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v17 --run=<new>`.
production 모델·prompt·history reader/formatter/get_more_data를 사용하고 DB만 frozen read-only table adapter로 대체한다.
현재 회사 모델/OpenRouter/reasoning/temperature·소스 hash는 매 run에 기록한다. 실제 DB·메일·Slack은 차단한다.
합성 원문·모델 출력도 ignored owner-only `runs/`에 저장한다. 각 1회 표본은 실제 발송·동시성·SQL E2E,
운영 평균 또는 독립 팀원 검토를 증명하지 않는다. Priority 선정과 회사 메시지 품질은 별도의 실제 격리 inspection으로 확인한다.

## 검색 이력 조회 계약 검증: v14 (2026-10-07)

실행 결과: 최종 r4 기능·사실 의미 5/5, 기존 v10 회귀 3/3발화, 관련 코드 131/131.
중간 timeout·복합 요청 누락과 전체 타입 검사 한계는 [보고서](reports/2026-10-07-matching-history-reader.md)를 참조한다.

[cases-v14.json](cases-v14.json) / [gold-v14.md](gold-v14.md) /
[manifest-v14.json](manifest-v14.json)은 실행 전에 동결한 합성 5대화·5발화다.
최근 기본 이력, 이전 페이지와 회사 메모 동시 조회, 빈 기록, 등록/시작 및 미기록 수치,
조회 실패를 검증한다. 기존 frozen 입력/정답은 변경하지 않는다.

Canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v14 --run=<new>`.
실제 production 모델·tool loop·schema·formatter와 검색 이력 reader/get_more_data executor를 사용한다.
DB만 frozen read-only table adapter로 대체하며 기본 입력도 같은 history reader/formatter로 만든다.
API·DB·발송은 차단하고 모델 provider만 허용한다. 기본 모델/provider/reasoning/temperature와
소스·입력·prompt fingerprint, raw response는 ignored owner-only `runs/<run>/`에 기록한다.
평가 단위는 대화 전체이며 실행 완료율, 숫자/시간/미확인 상태 정확성, 필요한 추가 조회,
권한 없는 효과와 비공개 정보 노출을 검토한다. Gate는 5/5 원문 의미 통과와 critical 0이다.
합성 challenge 1회는 운영 평균, 실제 DB/transport E2E 또는 독립 팀원 검토가 아니다.


## 구독 설명·크레딧 부족 표시 경계: v13 (2026-10-07)

[입력](cases-v13.json)·[gold](gold-v13.md)·[동결 manifest](manifest-v13.json)는 한국어·영어
요금 문의 2대화와 Intro·연결 수락 차단 2대화, 총 5발화다. 합성 v6 회사·후보자를 재사용한다.
최신 서비스 정책과 충돌하는 과거 답변 예시를 명시적으로 주입하며, 부족 오류는 합성 executor에서
반복 재현한다. 기존 v1 계약의 기본 빈 검색 결과와 달리 이 버전은 오래된 예시가 있는 조건이다.
실제 검색·DB·발송은 하지 않는다. 입력과 gold는 첫 실행 전에 동결했으며 독립 팀원 검토는 대기 중이다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v13 --run=<새 이름>`.
실제 production loop·prompt·tool schema, 현재 기본 모델/추론 설정, progressive, temperature 0.5,
turn별 timeout 120초를 사용한다. 정확한 모델·source snapshot·fingerprint·provider 원문은 ignored
`runs/`에 0700/0600으로 보존하며 네트워크는 모델 provider만 허용한다. Gold는 모델에 주입하지 않는다.

Gate는 4대화의 정책·권한·사실성 자체 검토 통과, critical 0, 두 차단 경로의 표시 metadata 존재와
실행 효과 0이다. 모델 입력에 부족 코드·잔액·차감량이 없고 정상 흐름에는 notice가 없는지 별도로 확인한다.
단어 매칭은 machine metadata 경계만 검사하며 답변 의미는 전체 원문을 읽어 판단한다.
1회씩의 challenge여서 운영 신뢰도나 실제 Slack 전달 성공률은 주장하지 않는다.
[실행 결과와 한계](reports/2026-10-07-billing-notices.md)에 최초 실행과 보완 후 재실행,
기존 v11 연결/Intro 선택 회귀를 함께 기록했다.

## /org 응답 언어 검증: 기존 v8·v10 선택 사례 (2026-09-30)

기존 고정 입력을 유지하고 canonical runner에 `--response-locale=ko|en`을 지정해 웹 UI 또는
팀원별 Slack 언어 설정에 따른 회사 채팅 응답을 검토한다. 언어 설정은 run manifest에 기록하고
`src/i18n/org` 및 Slack 연결 코드도 source snapshot에 포함한다.
웹 역할 생성 안내, 기존 추천 수락 후 연결 결정, Slack의 언어 설정 유무 사례의 실제 모델 원문, timeout과 한계는
[검증 보고서](reports/2026-09-30-org-response-locale.md)에 기록했다. 전체 회귀나 전달 E2E의 증거는 아니다.

## 가벼운 연락 요청의 도구 선택·메일 작성: v12 (2026-09-28)

[입력](cases-v12.json)·[사전 기대 의미](gold-v12.md)·[동결 manifest](manifest-v12.json)는 전화번호,
이력서, 면접 불참 사유, 출근 조건, 기존 포트폴리오 요청의 후속 확인 5건이다. 각 1발화의 독립 대화로,
현재 production loop/schema와 실제 writer를 실행해 `create_draft`/`send` 선택과 전체 본문을 확인한다.
사용자가 제시한 인명은 합성 별칭으로 바꾸고 기존 v6 Role·후보자를 재사용했다. 실제 후보자 조회는 없다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v12 --copy=real --run=<새 이름>`.
대화 모델은 현재 `google/gemini-3.8-flash`/OpenRouter, medium, temperature 0.5, progressive이며,
초안은 기존 `copy.ts`의 Claude/Luna fallback을 사용한다. 정확한 설정·전체 source snapshot·입력 hash·provider
요청과 응답은 ignored `runs/`에 0700/0600으로 보존한다. 네트워크는 모델 provider만 허용하며 DB·발송은 차단한다.

입력과 gold는 첫 실행 전에 동결한다. 각 요청의 대상·의미·권한·메일 품질 5/5와 critical 0을 내용 gate로,
실제 action 선택을 별도로 기록한다. 사람이 전체 원문을 읽으며 기대와 다른 선택도 그대로 남긴다.
각 1회인 합성 challenge이므로 선택 확률·운영 평균·실제 DB/Slack/메일 전달 성공을 주장하지 않는다.
독립 팀원 gold 검토는 대기 중이다.

[실행 결과](reports/2026-09-28-casual-contact-requests.md): 5/5 실행, draft 4건·send 1건.
출근 조건 초안의 미확인 진행 배경 추가로 의미·사실성은 4/5이며, 전화번호 초안의 운영 용어도 문체 경고로 남겼다.

2026-09-28 [후보자 연락의 기존 메일 예시 복원 검증](reports/2026-09-28-candidate-contact-examples.md):
동결 v8 중 3대화·7발화와 실제 보조 writer 5회를 검토했다. 원문 예시 보존·본문 작성·부분 수정을
확인했으며, 첫 연락의 draft 선택과 기존 gold 사이의 불일치 1건을 별도로 기록했다.

## 선택적인 단계와 인터뷰 요청 검증: v11 (2026-09-28)

[cases-v11.json](cases-v11.json), [gold-v11.md](gold-v11.md), [manifest-v11.json](manifest-v11.json)은
단계 없는 연결 수락·Intro·신규 및 후속 인터뷰·목적 보완·기존 안내 즉시화의 5대화/9발화다.
합성 v6 회사·후보자를 재사용하고 실행 전에 새 입력과 gold를 동결했다. 기존 동결 자료는 유지한다.
현재 production loop/schema/serializer와 실제 모델을 사용하고, 읽기·상태 변경은 네트워크 없는 합성 adapter다.
도구는 사례명 분기 없이 동일한 ID·현재 상태·저장된 일정으로 동작한다.

Canonical runner: `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v11 --run=<새 이름>`.
OpenRouter `google/gemini-3.8-flash`, medium, temperature 0.5, progressive. 정확한 source/input hash,
모델 설정·원문·tool trace는 ignored `runs/`의 0700/0600 artifact로 남긴다. 운영 후보자 데이터·DB·발송은 사용하지 않는다.
평가 단위는 전체 순차 대화이며 5/5의 필수 효과·동의·상태 설명, critical 0을 수동 의미 검토한다.
독립 팀원 gold 검토와 실제 브라우저/전달 E2E는 별도 미검증 범위다. 실행 결과와 실패는
[선택적 단계 검증 보고서](reports/2026-09-28-optional-stage.md)에 기록한다.


## 추천 이력·기존 추천 수락 검증: v10 (2026-09-28)

[cases-v10.json](cases-v10.json) / [gold-v10.md](gold-v10.md) / [manifest-v10.json](manifest-v10.json)은
승인된 company-first 계약으로 작성한 합성 challenge 2개 대화·3발화다. 미응답/거절 추천의 ready 자격과,
기존 Harper 추천 수락 후 연결 대기로 이동한 후보에 대한 후속 Intro 질문을 검증한다. 최초 실행 전에 동결했고
이전 dataset/gold를 덮어쓰지 않았다. 독립 팀원 gold 검토는 대기 중이다.

Canonical runner는 기존 `scripts/evalCompanyAgentCapabilities.ts`다.
`pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v10 --case=CSCQ1012 --run=<새 이름>`으로 실행한다.
Production agent loop·도구 schema·결과 serializer와 현재 상태/수락 시각을 가진 synthetic read adapter를 사용한다.
실제 DB executor·Slack/email transport를 호출하지 않는다. 사례별 production 분기를 추가하지 않았다.

실행 모델은 `google/gemini-3.8-flash`(OpenRouter, medium, temperature 0.5, progressive)다.
모델·source snapshot·frozen hash·prompt fingerprint·raw trace는 ignored `runs/<run>/`에 0600/0700으로 보존한다.
입력은 합성 자료이며 production 후보자 데이터나 credentials를 artifact에 저장하지 않는다.

Gate는 3발화의 상태 사실·의미·불필요한 행동 없음과 critical 오류 0이다. 문자열 일치로 판단하지 않는다.
원문 검토에서 3/3을 통과했고 결과·한계는 [보고서](reports/2026-09-28-company-first-history.md)에 기록했다.
이 결과는 전체 v9/v10 회귀, 실제 DB 상태 변경, 브라우저 또는 메시지 왕복 E2E 통과를 뜻하지 않는다.

2026-10-07 수락 후 안내 수정: 같은 v10의 3턴을 재실행했다. 실행 3/3, 의미 검토 2/3이며 회사 Intro 이후 상태를 일반화한 오류 1건을 [추가 회귀 기록](reports/2026-10-07-unified-matching.md)에 남겼다. 기본 서비스 설명을 보완한 r3 재시험은 동일 입력 3/3 의미 통과였다. 실제 전달·UI E2E는 아니다.

## 정기 검색 설정 검증: v9 (2026-09-28)

[cases-v9.json](cases-v9.json) / [gold-v9.md](gold-v9.md) / [manifest-v9.json](manifest-v9.json)은
v8의 37변형을 보존하고 웹·Slack의 정기 검색 끄기→현재값 확인→켜기 2변형을 추가한다.
목적은 실제 company-side LLM의 일반 수정 도구 선택·boolean 전달·설정과 즉시 검색의 구분이다.
평가 단위는 각 surface의 3발화 대화이며, 6발화 모두의 의미·권한 통과와 critical 0이 gate다.
기존 canonical runner, 모델/OpenRouter 설정·합성 입력·owner-only runs·원문 수동 검토 계약을 따른다.
`--dataset=v9 --case=CSCQ911,CSCQ910-new_search`로 새 설정과 기존 일회성 검색을 함께 확인한다.
합성 수정 adapter는 실제 parser/resolver를 사용하며 실제 DB/외부 전송을 증명하지 않는다.
새 입력은 사용자 요청·현재 제품 계약에 근거해 실행 전 동결했고 기존 gold는 변경하지 않았다.
이 작은 기능 challenge는 운영 평균이나 전체 v9 통과를 의미하지 않는다.
[2026-09-28 검증 기록](reports/2026-09-28-periodic-search-setting.md)에 모델 실행,
격리 DB 검증, timeout과 미검증 범위를 구분해 기록한다.

## 기존 실행 계약: v8 / Role v3

[평가 장치 계약](evaluation-contract-v1.md) → [입력 v8](cases-v8.json) / [정답 v8](gold-v8.md) /
[동결 manifest](manifest-v8.json) 순서로 확인한다. 37변형·54발화, 기존 v7은 보존한다.
보류/취소·즉시화·전달/수신·재서술/조건 추가 경계를 명시했으며 이전 실패를 본 회귀 세트다.
canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v8 --copy=real --run=<new-id>`.
`--model=<OpenRouter company-side model ID>`는 같은 동결 입력에 다른 모델을 실행한다. 생략하면 기존 Gemini 3.8 Flash를 사용하며 모델·reasoning·sampling 설정은 각 새 run의 manifest와 provider 원문에 기록한다.
`--stream=true`는 같은 입력·모델·도구로 provider SSE 전송 경로를 검사한다. 원문 캡처는 응답 소비와
병행하며 completion별 `firstTextMs`, `latencyMs`, `textDeltaCount`를 저장한다. 브라우저/DB/발송 E2E를
대체하지 않는다. [2026-09-28 웹 스트리밍 검증](reports/2026-09-28-web-streaming.md)은 동결 v8의
선택 2변형과 실제 수신 hook 회귀를 구분한다.
model 설정·privacy·metric은 아래 기존 모델 행동 계층과 같고 새 계약이 판정 경계를 보완한다.
Role 작성은 [role-creation-v3.json](role-creation-v3.json)을 사용하며 회사 배경/예시 검색까지 고정한다.
`CONTACT_QA_DATASET=v3 CONTACT_QA_ROLE_DATASET=v3`으로 연락 runner의 `role-creation`을 실행한다.
각 입력의 모든 필수 행동·의미와 critical 0, 원문 검토가 gate다. 정확한 실행 결과는 새 보고서로 기록한다.
실제 DB/transport와 합성 도구 계층을 합쳐 운영 성공률로 주장하지 않는다.
현재 runner는 source 전체 snapshot과 보조 writer의 provider 원문도 키 없이 보존한다.
직접 발송은 원본 대화 모델의 최종 본문이며 `--copy=real`의 보조 writer는 검토용 draft/revision에만 쓴다.
오류·미완료·빈 실행은 exit 1이다. exit 0은 품질 통과가 아니라 실행 완료만 의미한다.

## 최신 실행 결과 — 2026-09-26 / v8

[2026-09-27 연락 조회 후속 수정](reports/2026-09-27-contact-reader.md): 실제 DB의 양방향 FK로
목록·상세 조회가 실패하는 누락 경계를 수정했다. read-only 확인, 조회 회귀 10/10, 동결 v8 중
2변형의 모델 행동을 별도로 검증했다. 아래 전체 평가 결과를 모든 DB 조회의 성공 증거로 해석하지 않는다.

[계약·실행·개선 종합](reports/2026-09-25-contract-v8.md) ·
[37변형별 원문 판정](reports/2026-09-26-v8-adjudication.md).
같은 최종 소스의 최초 실행은 35/37변형(52/54발화) 완료, 2건은 모델 호출 timeout이다.
해당 2변형을 같은 입력·소스로 각각 한 번 재시험한 뒤 필수 행동/권한/의미는 37/37 확인했다.
최초 실행은 실패로 보존하며 100% 최초 성공으로 집계하지 않는다. 실제 executor/DB contacts v3는
5/5대화·6개 inline relay·replay 중복 0, 별도 Role v3는 전체 5발화 통과다.
말투/장황함의 사용성 경고와 호출 안정성, 외부 transport/worker/실제 예시 검색의 미검증 범위는 남았다.
203/203 관련 코드 회귀 통과. 운영 배포나 독립 팀원의 blind review를 대신하지 않는다.

## 이전 실행 결과 — 2026-09-25

[실행·개선 보고서](reports/2026-09-25-execution-and-improvements.md): v7 전체 34변형/49발화 실행,
실패 후 targeted 재시험, Role v2 실제 저장/활성화, contacts v2 5대화와 실제 메일 1왕복을 분리했다.
**전체 NO-GO**: Role 최초 작성의 조건 강화와 일부 연락/답변 의미 확장이 남는다. 구조·transport 성공을
품질 통과로 바꾸지 않으며, Codex 자체 원문 검토는 팀원의 독립 blind review가 아니다.
원문/도구/DB 효과·source hash는 ignored runs에 보존한다. r10 이후 보조 writer의 provider 원문도
headers/key 없이 같은 private run에 저장한다. 기존 실행/정답을 덮어쓰지 않는다.

## v7 확장 실행 계층 (2026-09-25)

[34변형·49발화 입력](cases-v7.json), [사전 정답](gold-v7.md), [동결 manifest](manifest-v7.json).
v6 fixture를 immutable base로 읽고 새 대화·연락·범위·실패 조건을 추가한다. 위임 회신은
`../company-talent-contacts/README.md`의 실제 executor/DB 5개 세트를 재사용한다.
canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v7 --copy=real --run=<새 ID>`다.
평가 단위·모델 설정·prompt 계약·privacy는 아래 모델 행동 계층과 동일하며, critical 0 및 34변형의
필수 행동·품질 통과가 해당 계층 gate다. 입력·정답을 바꾸면 v8을 만들고 실행 결과에 맞춰 v7을 고치지 않는다.
참조 parser, 여러 연락/대상별 idempotency, batch, 날짜·대상 필터, pagination, 기존 연락, 오류 주입을
adapter에 추가했다. 여전히 production DB executor는 아니며 실제 권한·발송을 증명하지 않는다.
01의 전용 Role 등록 완료와 Calendar 실물 등 미구현 계층은 gold에 명시했으며 통과로 세지 않는다.
각 run의 전체 원문을 사람이 읽고 판정한다. API 호출 완료나 효과 개수만으로 자동 품질 pass를 부여하지 않는다.

### 전용 Role 등록 보완 평가

`role-creation-v2.json`은 별도 5-turn 입력/정답이다. v1은 격리 환경의 active Role 한도를 소진한
fixture 문제를 드러내 그대로 보존했다. v2는 정확한 기존 테스트 Role만 일시 중단하고 종료 후 복구한다.
발화와 gold는 동일하며 fixture 조건 변경을 provenance로 기록했다. 모델·prompt 변경은 새 run,
입력 변경은 새 버전이다. canonical runner는 연락 QA의 loopback 전용 환경을 재사용하는
`scripts/evalUnifiedCompanyContacts.ts role-creation`이다. 현재 Gemini/OpenRouter 설정과 실제
`runOrgRoleCreationChat`/저장/확정 RPC를 사용한다. 일반 대화 진입 평가와 구분하며, 동일 Role의
draft→명시적 확인→active, Brief 의미/강도, 비공개 구분을 사람이 함께 판정한다. 1개 전체 대화가
단위이며 필수 행동 모두와 critical 0이 gate다. 회사/후보자 alias와 합성 채용 조건을 사용한다.
LLM 원문·fixture·source/input hash는 공용 격리 runner의 `../company-talent-contacts/runs/<run-id>/`
아래 0600 파일로 저장한다. 실제 Slack 수신·worker 매칭을 검증하지 않으며, 테스트 Role/channel은
정확한 ID로 정리한다. 이 한 사례는 sparse JD나 모든 직무에 대한 일반 성능 추정이 아니다.

## 보존된 기본 회귀: v6 (2026-09-24)

[10개 시나리오·이상적인 답변](gold-v6.md) · [고정 입력 14변형](cases-v6.json) · [동결/provenance](manifest-v6.json).
v5는 기존 Role/관심 상태가 gold와 충돌했던 입력을 그대로 보존한다. v6은 이 입력 모순과 03의 오래된 초안 의무 문장만 수정했다.
사용자의 전체 gold 검토는 아직 필요하다. 실행 이후 정답을 바꾸려면 v7 입력·gold·manifest를 만들고 비교한다.

```bash
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --run=<new-id>
# 이메일 작성/수정까지 기존 production writer를 실제 호출. 실제 DB/발송은 하지 않음.
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --copy=real --run=<new-id>
# 같은 입력/모델의 전체 기능 노출 비교군
npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v6 --mode=full --run=<new-id>
```

- 목적/단위/prompt 계약/metrics/gate: 아래 v5 회귀 계층과 동일. 14변형의 전체 대화가 단위, mandatory behavior와 qualitative review를 분리한다.
- 설정: 주 대화 Gemini 3.8 Flash/OpenRouter, 0.5, medium, 최소 8192 output budget. 실제 값·mode·copyMode·source hash는 run manifest에 기록한다.
- `--copy=real`은 기존 `copy.ts`의 Claude 및 Luna fallback을 유지한다. 이 경우 모델 API allowlist에 Anthropic/OpenAI만 추가한다. 회사·후보자·연락 내용은 여전히 합성이며 DB·메일·Slack·Calendar 네트워크는 차단한다.
- 골드·입력의 hash를 실행 전에 검증하고 run 폴더를 덮어쓰지 않는다. 원문 request/response, tool effects, latency, provider usage는 ignored `runs/`에 owner-only로 저장한다. 출력에 대한 모델별 평균 우열이나 실제 전송 성공을 추정하지 않는다.
- 한계: synthetic 도구는 production executor의 권한/검색/관계 조회/발송 구현을 실행하지 않는다. `--copy=real`일 때만 이메일 본문 의미·revision 보존을 검토할 수 있다. 그래도 HTTP/DB 외부 전달 E2E는 아니다. source hash는 실행 시점을 식별하지만 dirty source 전체의 복제본은 아니다; 모델 입력 원문은 보존한다.
- usage·비용은 주 대화 completion의 provider 응답에 한한다. `--copy=real`의 기존 이메일 writer는 작성 결과만 보존하며 내부 호출별 토큰·fallback·비용은 현재 이 runner에서 수집하지 않는다. 현재 parent abort signal은 writer/fallback까지 전달하고 중단 후 DB 저장도 막는다. provider의 실제 청구 중단까지 보장하는 것은 아니다.
- `scripts/inspectCompanyAgentInput.ts`는 네트워크 없는 구조 측정 도구다. `benchmarkOrgAgentPrompt.ts`는 Anthropic tokenizer 기준 참고값이며 Gemini 청구비용/품질 측정이 아니다. `evalOrgAgentLive.ts`는 legacy full-mode 탐색 harness로 canonical gate가 아니다.
- 회귀 결과와 남은 release gate는 [구현·평가 보고서](reports/2026-09-24-agent-refactor.md)에 기록한다.

운영 migration 적용·외부 전달·전용 Role 등록 전체 E2E는 별도 승인/격리 환경이 필요한 미검증 범위다.

## v5 — 지연 로딩·대화 판단 회귀 계층 (2026-09-24)

v4 실제 Slack E2E 계약은 아래에 그대로 보존한다. v5는 이를 대체하지 않는 **별도 증거 계층**이다.
목표는 Gemini/OpenRouter 실제 모델과 production `runOrgAgentToolLoop`, 입력 builder, tool schema,
결과 serializer, exact-presentation assembler를 사용해 회사 발화의 의미·도구 선택·연속성을 반복 평가하는 것이다.
실제 DB·메일·Slack·Calendar는 호출하지 않는다. tool executor만 합성 in-memory adapter로 대체한다.

- 입력: [cases-v5.json](cases-v5.json), 10개 시나리오·14개 변형. 시간/회사/후보자/Role/과거 발화 고정.
- 사전 정답 및 사람이 수정할 원본: [gold-v5.md](gold-v5.md). 첫 실행 전에 사용자 연락 계약 수정을 반영했다.
- 동결: [manifest-v5.json](manifest-v5.json)의 입력·gold SHA-256를 runner가 검증한다. 정답/입력을 바꾸면 새 버전으로 만든다.
- 평가 단위: 한 변형의 전체 순차 대화. 앞 turn의 실제 답변·contact ID/revision이 다음 turn에 들어간다.
- canonical runner: `scripts/evalCompanyAgentCapabilities.ts`; `.env.local`의 OpenRouter key만 모델 호출에 사용.
- 설정: `google/gemini-3.8-flash`, OpenRouter, temperature 0.5, turn당 120초, production tool budget.
  초기 r1은 high/4,000 출력 한도에서 추론만 생성 후 종료가 관측됐다. 이후 medium 및 Gemini 최소 8,192 한도로 비교하며 실제 설정은 run manifest에 기록한다.
- v5 재실행: `npx tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v5 --run=<새-run-id>`.
  `--case=CSCQ503`으로 범위를 줄이고, `--mode=full`로 같은 모델·새 core의 전체 도구 노출과 비교 가능하다.
- metric: 필수 행동/대상/도구와 effect log, 사실성, 연속성, 사용자 수고, 자연스러움을 원문을 보고 사람이 판정한다.
  단어·문장 길이·말투 regex 점수나 자동 전체 pass는 없다. critical 0 및 14/14 필수 행동·품질 통과가 이 계층 gate다.
- source commit + dirty source hash, completion별 실제 request/response와 prompt fingerprint, 토큰·cache usage·provider 비용(제공 시), 지연을 보존한다.
- privacy: production 데이터 없음. 합성 데이터만 OpenRouter로 전송. DB adapter는 즉시 오류, 네트워크는 OpenRouter만 허용.
  raw 결과는 ignored `runs/<run-id>` (폴더 0700, 파일 0600). 기존 run은 덮어쓰지 않는다.
- 한계: 도구 writer의 실제 이메일 문구, authorization RPC, 실제 대상 검색/DB·transport의 정확성은 증명하지 않는다.
  초안 adapter는 요청과 수정 원문을 보존하며 실제 copy writer를 모사하지 않는다. 실패/미지원 adapter는 성공으로 처리하지 않는다.
  전용 Role 작성 전체 흐름, batch contact, production 외부 전달은 별도 검증이다. 작은 challenge set은 평균 성능 표본이 아니다.

DB 경계의 canonical 비모델 테스트는 `scripts/testCompanyContactDirectDelivery.mjs`로 분리한다.
실제 production 공개 전에는 기존 E2E 계층과 연락 DB 회귀 검증이 추가로 필요하다.

격리 SQL 재현(검증한 PGlite 0.5.8, 프로젝트 의존성·운영 DB 변경 없음):

```bash
contact_qa_dir=$(mktemp -d /tmp/harper-contact-db.XXXXXX)
npm install --prefix "$contact_qa_dir" --no-save @electric-sql/pglite@0.5.8
PGLITE_MODULE_PATH="$contact_qa_dir/node_modules/@electric-sql/pglite" node scripts/testCompanyContactDirectDelivery.mjs
```

이 스크립트는 메모리 DB와 최소 fixture schema에 실제 migration을 적용한다. 실제 운영 schema의
모든 제약·trigger 또는 별도 worker transport를 복제한 테스트는 아니다.

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


## 자동 예시 프로필 제거 후 검색 smoke (2026-10-15)

기존 frozen v8의 CSCQ810-new_search 한 변형만 `20261015-profile-calibration-retirement-v8-r1`로 재실행했다. 실제 company-side 모델·loop가 candidate_search를 로드하고 정확한 Role로 request_matching_search를 한 번 호출했으며 제거된 예시 프로필 도구나 후보자 연락은 없었다. 원문과 manifest·review.json은 ignored owner-only runs에 보존한다. 응답의 탐색 시작 표현은 합성 queued 결과보다 진행을 앞서 설명하므로 실제 Worker 시작·전체 대화 품질 gate 통과를 주장하지 않는다. 운영 DB·Slack·메일·검색 Worker 실행은 이 평가 범위 밖이며 제거 DB와 읽기 호환은 별도 확인했다.


## 일반 대화의 Role 알림 설정과 채용 시작: v27 (2026-10-15)

- 목적/단위: Role 작성 전용 대화 밖에서 동일한 복수 draft 설정 제안에 대한 승인·설정만 승인·일부 Role 승인·완료 정보 누락의 4개 전체 응답과 실제 합성 효과를 검토한다.
- 동결 입력/gold: `cases-v27.json`, `gold-v27.md`, `manifest-v27.json`. 기존 버전은 보존한다. 제품 요청에서 만든 비식별 합성이며 production 데이터는 없다. gold는 첫 호출 전에 Codex가 작성했고 독립 팀원 검토 전이다.
- 계약/runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v27 --run=<fresh>`. production 일반 company-side loop, 현재 채널 context, capability loader, schema, 정책, serializer를 사용한다. 기존 `read_role`의 notification 조회와 독립 설정·기존 결합 활성화 executor 효과는 메모리 adapter로 모사한다.
- 설정: 기본 `google/gemini-3.8-flash`, OpenRouter, production reasoning/temperature, turn 120초. 실제 설정·source fingerprint·usage는 run manifest와 completion 원문에 기록한다.
- gate: 4/4 승인 범위·정확한 대상·상태 일치·필요 업무 수행, critical 0. 자연스러움과 재확인 여부는 전체 원문 의미 검토다. 단어/문장 매칭 점수는 없다.
- privacy/한계: 외부 DB·Slack·메일 차단. 합성만 모델 provider에 전송하며 원문은 ignored `runs/`의 0700/0600에 보존한다. 실제 DB 권한·Slack ingress/전달·동시 실행 검증이나 운영 평균 품질을 증명하지 않는다. 첫인사 작성은 별도 `company-side-background-result-writing/member-welcome-v2`다.


v28은 v27의 `missing_info`에서 저장 지역이 서울인데 완료 검사만 지역 누락을 반환하던 합성 입력 모순을 고친 버전이다. `cases-v28.json`의 해당 지역만 null로 바꾸고 `gold-v28.md` 의미는 유지했다. v27 실행 이후 fixture audit에서 발견한 수정임을 manifest에 남겼으며 이전 파일은 덮어쓰지 않았다. `--dataset=v28 --case=CSCQ2701-missing_info`는 해당 1건만 검증한다. 나머지 3개 v27 결과는 동일한 입력 slice의 별도 근거이며 전체 v28 실행이라고 표현하지 않는다.

이번 로컬 변경·실행 결과와 초기 adapter/fixture 오류, 미검증 범위는 [검증 기록](reports/2026-10-15-general-role-setup.md)에 구분했다.
## 수동 인재상 조사 미리보기 research-preview-v1 (2026-10-15)

- 목적/단위: 회사·Role 입력 하나에서 원본 company-side LLM이 관련 팀원과 공개 경력 근거를 자율 조사하고 기대 수준·가산점·탐색 방향, Brief와 회사 설명의 초안을 만드는 한 세션. 채용 시작 run에는 연결하지 않는다.
- 동결 입력/gold: [research-preview-v1.json](research-preview-v1.json), [사전 의미 기준](research-preview-gold-v1.md), [재현 manifest](research-preview-manifest-v1.json). 운영 원문 없는 합성 2건과 공개 회사 Exa를 대상으로 한 가상 Role 1건. 첫 실행 전에 고정하며 기존 dataset을 바꾸지 않는다.
- canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/runRoleSearchResearchPreview.ts --run=<새 ID> --case=RSR01,RSR02,RSR03`. 직접 구현한 `runRoleSearchResearchPreview`와 기존 공통 loop·모델·schema·serializer·web provider를 사용한다. `--input=<local-packet.json>`은 같은 입력 구조의 수동 packet이며 동결 benchmark로 보고하지 않는다.
- 입력/출력: 회사 식별 정보, 현재 Role·Brief, 실제 또는 합성으로 구분된 대화와 메모. 평가용 내부 read adapter는 packet에 있는 자료만 반환하고 미수집 자료는 조회 실패로 드러낸다. 공개 웹은 사례별 frozen evidence 또는 실제 Exa다. 출력은 모델이 쓴 하나의 Markdown 문서이며 새 판단 JSON·저장 테이블은 없다.
- 설정: 현재 `resolveOrgAgentModel(undefined)` 결과, 기존 reasoning/temperature를 사용하고 실제 설정을 manifest에 기록한다. 다른 모델로 fallback하지 않는다. 세션 240초, 기존 30회 도구 호출/80,000자 결과 예산. Source·입력·gold hash, completion 요청/응답, 도구 결과·시각, public cache와 네트워크 결과를 보존한다.
- metric/gate: 필수 의미 3/3, 중대한 사실 조작·미승인 효과·정보 노출 0. 근거 확보·기준 연결·초안 유용성·사실성·효과 범위를 전체 원문으로 검토한다. 실행 완료는 품질 통과가 아니며 정규식·키워드 품질 판정은 없다.
- privacy: DB·Slack·메일·queue 네트워크 차단, 모델 completion과 공개 Exa 조회만 허용. 자료는 해당 모델 provider와 Exa에 필요한 범위로 전달한다. 새 public cache는 메모리에만 남고 raw 출력·source snapshot·수동 packet은 ignored `runs/`의 0700/0600에 보존한다. 비밀키·HTTP 인증 헤더는 기록하지 않는다.
- 한계: 내부 read는 frozen adapter이며 실제 DB 권한/조회 E2E가 아니다. Live 웹은 시점에 따라 바뀌므로 완전한 frozen 비교가 아니다. 공개 회사의 Role·발화는 가상이며 실제 회사 선호의 증거가 아니다. 작은 작성자 challenge이며 독립 팀원 검토, 운영 분포, Brief 저장·메시지 전달·활성화·추천 품질은 미검증이다.

2026-10-15 [구현·검증 보고서](reports/2026-10-15-role-search-research-preview.md): 최종 r3 실행 3/3 완료, 의미 품질 1/3 통과로 gate 미통과. 이전 실패와 원본 초안은 보존했으며 채용 시작 run에는 연결하지 않았다.

같은 날 [후속 개선·검증](reports/2026-10-15-role-search-research-refinement.md): r4/r5/r6 각 3건을 같은 입력·모델로 보완했다. 최신 r6 실행 3/3, 기존 Brief 원문 보존과 부모/답글 분리 3/3이지만 문서 전체 의미 gate 0/3이다. 관련 팀원의 공개 LinkedIn을 스스로 발견·조회하는 동작은 확인했다. 조사 해석·회사 설명에서 기준 확대와 출처 해석 문제가 남아 자동 저장·발송에는 연결하지 않는다.

r7은 같은 v1의 RSR01 한 건으로 회사 설명 말투와 조건부 기준 조정 제안의 마무리만 추가 확인했다. 원하는 표현은 관찰했으나 문서 전체 의미 판정은 미통과이며, 전체 3건 재평가나 자동 적용 승인으로 세지 않는다. 같은 후속 보고서에 기록했다.

## 수동 조사 퀄리티 바·가산 효과 research-preview-v2 (2026-10-15)

- 목적: 업무 경험만 반복하거나 판단 효과 없는 탐색 경로로 끝나던 문제를 검증한다. Brief 자체에 어느 수준의 회사·팀·학업 배경을 어느 정도 플러스로 볼지, 실제 검토 우선순위 효과를 도출하는 한 세션이 단위다.
- 동결 자료: [v2 입력](research-preview-v2.json), [v2 gold](research-preview-gold-v2.md), [manifest](research-preview-manifest-v2.json). v1 세 사례는 그대로 보존하고 사전 pedigree 우대가 없는 합성 데이터 인프라 역할 RSR04를 추가했다. 새 gold는 사용자 정정 요청에 따른 coverage 확장이며 첫 v2 호출 전에 작성했다. 과거 v1 결과를 새 정답으로 다시 채점하지 않는다.
- runner: 기존 `scripts/runRoleSearchResearchPreview.ts --run=<fresh-id> --dataset=v2 --case=RSR01,RSR02,RSR04`. 실행 prefix·입출력·네트워크 격리·model/provider/reasoning/temperature·240초 예산은 위 v1 계약과 같다. 버전 선택만 추가했고 각 run에서 실제 설정·입력/gold hash·source snapshot을 보존한다.
- gate: 전체 4/4 필수 의미, critical 0. 선택 3건은 해당 결과만 보고한다. 기존 필수조건 보존, 구체적인 배경 수준, 근거에 비례하는 가산 강도, 실제 비교 효과, 사용자 반대 선호·근거 부족 경계를 원문 의미로 검토한다. 키워드 점수·출력 교정은 없다.
- provenance/privacy/한계: 운영 데이터 없음. RSR04 인물과 경력 조합은 모두 합성이며 실재 학교·회사명의 실제 재직자나 채용 선호를 뜻하지 않는다. v1과 같은 ignored 0700/0600 보존·provider 경계, 내부 adapter·live 웹 한계·비독립 작성자 검토를 적용한다. 자동 저장·발송·채용 시작에는 연결하지 않는다.

원인, 변경 책임 원본과 각 실행의 개선·실패는 [퀄리티 바 개선 기록](reports/2026-10-15-role-search-quality-bar.md)에 보존한다.

## 조사 전용 Sol medium과 수준 중심 Brief: research-preview-v3 (2026-10-15)

- 사용자 정정: 출신 회사·팀은 수준의 예시이며 그 출신만 가산점 대상이 되는 것이 아니다. 수준이 다른 배경에서 어떻게 드러나는지와, 실제 구성·반복 근거가 있는 특정 출신의 추가 가산을 구분한다.

- 동결 자료: [v3 입력](research-preview-v3.json), [v3 gold](research-preview-gold-v3.md), [manifest](research-preview-manifest-v3.json). v2 사례는 동일하며 gold를 첫 실행 전에 새 버전으로 작성했다. v2 판정은 소급 수정하지 않는다.
- runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/runRoleSearchResearchPreview.ts --run=<fresh-id> --dataset=v3 --case=RSR04`. 단위·내부 adapter·자료 보존·네트워크 격리는 위 계약을 재사용한다.
- 설정: 조사 진입점만 `gpt-6.1-sol`, reasoning `medium`으로 고정한다. 기존 OpenAI Responses 경로를 사용하고 temperature는 전송하지 않는다. 일반 회사 대화의 기본 모델과 다른 Sol 호출의 기본 high는 유지한다. 실제 completion 설정·provider·usage·source hash는 run에 보존한다.
- 기준/범위: 전체 gate 4/4·critical 0, 선택 실행은 해당 결과만 보고한다. 수준·비교 가능성·가산 효과·출신 집중도의 근거를 전체 문서로 검토한다. 모델과 prompt를 함께 바꿔 모델 단독 비교가 아니다. 합성/공개 자료의 출처·privacy·독립 검토 및 무발송 한계는 v2와 같다.

[Sol medium 실행 기록](reports/2026-10-15-role-search-sol-medium.md): 선택 RSR04 1/1 의미 확인, 실제 completion 4회 모두 Sol medium/OpenAI Responses. 다른 회사·인접 분야에서 같은 수준을 비교하는 기준을 Brief에 작성했다. 전체 v3 gate·운영 전달·추천 성과는 미검증이다.

## 실제 회사 수동 관찰 real-company-preview-v1

- 사용자가 요청한 실제 회사 한 곳의 기존 역할을 읽기 전용으로 캡처해 조사·Brief·Slack 부모/답글 초안 원문을 확인하는 1회 관찰이다. 기존 frozen v1/v2/v3 입력과 gold를 바꾸지 않으며 benchmark 통과율로 합산하지 않는다.
- 원본·최소 입력·capture manifest는 ignored `private/`에, 결과와 실제 source/model/input hash는 ignored `runs/`에 0700/0600으로 보존한다. 운영 조회는 Worker `connect_read_only`만 사용하고 transaction_read_only=on을 확인한다. 회사·현재 Brief·관련 대화 일부와 출처가 명시된 검토 기록 요약만 제공한다. 미수집 이력을 없다고 간주하지 않는다.
- runner는 `scripts/runRoleSearchResearchPreview.ts --dataset=v3 --input=<private packet> --case=REAL01 --run=<fresh-id>`다. 실제 회사 snapshot의 provenance와 회사 공통 request를 전달하며, 별칭 역할·testOnly 표시는 메모리에서만 존재한다. 내부 읽기는 snapshot adapter, 공개 검색은 실제 Exa다. DB·활성화·Slack·메일·queue transport는 차단한다.
- OpenAI Responses `/v1/responses`, gpt-6.1-sol/medium, `store:false`, temperature 생략을 사용한다. 첫 실행의 4,000토큰 출력 한도 소진 후 조사 전용 completion 한도를 16,384로 늘려 같은 입력의 새 run으로 재실행한다. 일반 대화의 출력 한도는 바꾸지 않는다. 현재 사용자의 실제 회사 조사 요청이 이 최소 입력의 처리 근거다. 계정 측 retention 설정은 조회하지 않았다. Exa에는 공개 검색에 필요한 정보만 보내며 내부 후보자·검토 원문은 검색어에 넣지 않는다.
- 사전 검토 기준은 원문 보존, 출처에 비례한 수준·가산 강도, 특정 회사/팀에 닫히지 않는 비교 기준, 사실과 제안 구분, Slack 초안의 근거 설명·조건부 조정 제안, 실제 저장/발송 주장 없음이다. 의미 평가는 원문을 읽어 작성자가 기록하고, 키워드 판정·사후 문구 교정은 하지 않는다. 독립 gold 없는 1건 관찰이므로 release gate 또는 일반 품질 보증이 아니다.

[실제 회사 관찰 기록](reports/2026-10-15-role-search-real-company-preview.md): r1은 출력 한도 소진, r2는 완료했다. 수준·가산 효과는 관찰했으나 회사 공통 조건의 역할 적용 범위와 긴 Slack 답글을 남은 검토점으로 기록했다. 원문은 수정하지 않고 로컬 비공개 파일로 제공하며 자동 적용·발송은 승인하지 않는다.

## Hiring Brief 직접 편집 (2026-10-15)

[변경 범위와 검증 한계](reports/2026-10-15-hiring-brief-direct-edit.md): 강제 승인 대기 제거, 코드 검사 42/42. 기존 role-criteria-v1 인접 회귀 4/4이며 일반 편집의 문맥상 동의 LLM 평가·운영 E2E는 미검증이다. 미배포.

## 회사 이메일 surface: 기존 v19 재실행 (2026-10-15)

입력·gold·manifest v19를 변경하지 않고 canonical `scripts/evalCompanyAgentCapabilities.ts`의
`--response-surface=email`로 같은 공통 tool loop와 이메일 표현 지침을 검증했다. 도구 제공·권한은
기존 chat 실행 계약을 유지한다. 모델/provider/reasoning은 기본값 그대로이며, `--response-locale=ko`는
실제 저장된 팀원 언어 설정이 있는 경로, 옵션 생략은 설정 없는 경로다. 이 설정도 각 run manifest에 남긴다.
합성 입력만 provider에 보내며 기존 네트워크 차단·0700/0600 원문 보관을 유지한다.
권한 의미 gate 3/3과 별도로 전체 답변 문체·이메일 링크 렌더링을 검토한다. v19는 수신·SMTP·첨부·재시도
E2E나 이메일 특화 품질 전체를 검증하지 않는다. 이 경계는 격리 단위/SQL 검사와 구분한다.
[결과와 남은 범위](reports/2026-10-15-company-email.md).


## 2026-10-15 Terra → Sol 호출 설정

환경변수를 제외한 Terra 호출 설정과 선택 UI를 Sol로 전환했다. 기존 frozen v6의
`CSCQ501-web` 1건을 Sol로 재실행한 [검증과 한계](reports/2026-10-15-terra-to-sol.md)를
기록했다. 실제 호출 2회·오류 0이며 전체 품질 gate와 운영 배포를 뜻하지 않는다.


## CC 연결 첫 답장 넛지: v29 (2026-10-15)

합성 후보 Daniel Park의 첫 답장 사건 1건. [입력](cases-v29.json), [의미 기준](gold-v29.md), [manifest](manifest-v29.json)를 실행 전에 동결했다. 실제 company-side loop·공통 event prompt와 기본 Gemini/medium을 사용한다. `pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v29 --run=<new>`로 재현한다. 목적은 간단한 첫 답장 알림이며 정확한 문장 정답은 없다. 기준은 첫 답장 사실과 대상의 정확성, 짧고 자연스러운 안내, 본문·열람·후속 발송 등 미확인 주장과 미승인 효과 0이다. 합성 도구를 사용하고 DB·Slack·메일 네트워크는 차단한다. 원문/provider 결과·source hash·실행 설정은 ignored runs의 0700/0600에 보관한다. 단일 작성 예시로 실제 운영 채널 전달이나 광범위 품질 검증을 뜻하지 않는다. DB trigger·멱등성은 `scripts/testIntroFirstReplyCompanyUpdate.mjs`로 별도 확인한다.

후속 v30은 v29의 불필요한 후속 제안과 미확인 회사 수신함 도착 단정을 기록한 뒤, 사건 목적과 제공되지 않은 사실 범위를 보완한 새 입력이다. [입력](cases-v30.json) · [gold](gold-v30.md) · [manifest](manifest-v30.json). 나머지 실행·평가·개인정보 경계는 v29와 같고 `--dataset=v30`으로 실행한다. 이전 입력과 결과는 보존한다.

최종 v31은 v30에서도 남은 회사 수신함 확인 가능 단정을 막기 위해 Harper 수신 사본과 회사 수신 증거를 구분한다. [입력](cases-v31.json) · [gold](gold-v31.md) · [manifest](manifest-v31.json). 동일 runner의 `--dataset=v31`이며 나머지 계약은 v29와 같다. 이전 결과는 보존한다.

실행 결과: v29 r1은 불필요한 제안과 회사 수신함 도착 추론, v30 r1은 수신함 확인 가능 단정으로 의미 gate 미통과다. `intro-first-reply-v31-r1`은 실제 Gemini 1회(17.8초)로 첫 답장 사실만 짧게 알렸고 도구 실행·발송·미확인 수신함 주장이 없어 단일 예시 의미 검토 통과다. 운영 회사 대화·Slack 전송 E2E는 제외한다. 모든 이전 실행 원문은 보존했다.

## Intro 수락 후 연결 완료 안내: v32 (2026-10-15)

[입력](cases-v32.json) · [gold](gold-v32.md) · [manifest](manifest-v32.json). 목적은 과거 제안 시점·후보자 수락·완료된 소개를 자연스럽게 연결하는 회사 Slack 안내다. 합성 2건의 개별 event turn이 단위이고 기존 production `buildCompanyUpdatePrompt`·company-side loop·공통 문체/도구를 사용한다. `scripts/evalCompanyAgentCapabilities.ts --dataset=v32 --response-locale=ko --run=<new>`가 canonical runner다. 기본 Gemini 3.8 Flash/OpenRouter·medium·temperature 0.5·120초이며 실제 설정/source/input hash와 raw는 ignored runs 0700/0600에 보존한다. Gate는 2/2 수동 의미·사실·자연스러움 검토와 미승인 효과 0이다. 사용자 제보 유형으로 만든 비식별 합성이며 기존 frozen 자료는 보존한다. 실제 DB·Slack·메일 네트워크는 차단한다. 작은 작성자 검토로 운영 전송/독립 검토/전체 분포를 증명하지 않는다. DB 연결 완료 trigger와 receipt 사실은 `scripts/testIntroConnectionCompanyUpdate.mjs`의 격리 PostgreSQL로 별도 검증한다.

v32 첫 출력은 수락·완료 사실은 맞았지만 제안 시점을 생략했다. 목적에 이전 제안의 대상·역할·시점 맥락을 명확히 한 [v33 입력](cases-v33.json)·[gold](gold-v33.md)·[manifest](manifest-v33.json)를 새로 동결했다. 같은 runner의 `--dataset=v33`이며 나머지 단위·설정·gate·privacy·한계는 v32와 같다.

v33 최종 run `intro-connected-v33-r1`은 실제 기본 모델 2회로 2/2 원문 의미 확인, 미승인 효과 0이다. 이전 v32의 날짜 누락과 SQL 시간대 비교 수정, 실제 모델 출력의 Slack renderer 확인 및 미배포 경계는 [결과 보고서](reports/2026-10-15-intro-connection-notice.md)에 기록했다.

## 수동 조사 저장·전달 research-delivery-v1 (2026-10-16)

- 단위/목적: 승인된 조사 요청 하나에서 같은 company-side LLM이 조사 → Brief 수정 → 저장본 재조회 → 새 Slack 부모/설명 답글 확정까지 수행한다. 자동 채용 시작 연결은 없다.
- 입력/gold: `research-preview-v3.json` 원본 불변, 새 [delivery gold](research-delivery-gold-v1.md)와 [manifest](research-delivery-manifest-v1.json)를 첫 실행 전에 동결했다. 입력 provenance·합성 경력 한계는 v3와 같다.
- canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/runRoleSearchResearchPreview.ts --run=<fresh-id> --dataset=v3 --case=RSR04 --simulate-delivery`. 실제 delivery loop·prompt·tool schema·scope guard를 재사용하고, Brief mutation은 공통 parser/resolver로 메모리에만 적용한다. 메시지는 메모리에 확정하며 실제 DB·Slack·queue transport는 차단한다.
- 모델/설정: gpt-6.1-sol, medium, OpenAI Responses, store:false, temperature 생략, completion 최대40,000토큰, 세션240초·30tool·80,000자 결과 예산. 실제 설정·source hash·원문은 run manifest에 기록한다.
- metric/gate: 선택 사례의 기존 조건 보존, 전이 가능한 경력 수준·가산 효과, 실제 저장본과 설명 일치, 사용자 관점의 다음 단계 이해를 원문으로 판정한다. 선택1건을 전체 gate로 확대하지 않는다. 중대한 사실 조작·권한 밖 효과는 0건이어야 한다.
- privacy: 합성 자료와 frozen 공개 페이지만 provider로 보내며 DB/Slack/메일/queue 네트워크는 허용하지 않는다. 원문 completion·Brief·메시지는 ignored runs의0700/0600에 남긴다. API key·인증 헤더는 기록하지 않는다.
- 한계: 실제 저장 권한·Slack 렌더링·운영 Worker 실행은 이 LLM 시뮬레이션으로 검증되지 않는다. 전달 재시도/검색 handoff는 별도의 격리 단위·PGlite 테스트로 확인한다. 비독립 작성자 review이며 작은 합성 사례다.

[2026-10-16 전달 검증](reports/2026-10-16-role-search-delivery.md): 관련 격리 테스트19개 통과. 실제 Sol medium 합성 RSR04 실행의 최종 r3에서 Brief 수정·재조회·부모/답글 확정과 선택 사례 의미를 확인했다. 실제 Slack/DB/Worker E2E 및 전체 v3 gate는 미검증이며 채용 시작 자동 연결·배포는 하지 않았다.

## 경력 환경의 수준과 업무 직접 경험 구분: research-preview-v4 / delivery-v2 (2026-10-16)

- 목적/단위: 하나의 조사 세션에서 조직·학업 환경의 수준, 개인의 경력 발전·성과, Role 직접 경험을 구분해 실제 비교 가능한 Brief와 회사 설명을 만든다.
- 동결 자료: [v4 입력](research-preview-v4.json), [v4 gold](research-preview-gold-v4.md), [입력 manifest](research-preview-manifest-v4.json), [delivery v2 gold](research-delivery-gold-v2.md), [delivery manifest](research-delivery-manifest-v2.json). v3 입력은 보존하고 VESSL AI 가상 FDE를 추가했으며, 첫 호출 전 새 gold를 동결한다.
- canonical runner: `TSX_TSCONFIG_PATH=scripts/tsconfig.json node --import tsx scripts/runRoleSearchResearchPreview.ts --run=<fresh-id> --dataset=v4 --case=RSR04,RSR05 --simulate-delivery --delivery-contract=v2`. Production 연구/delivery loop와 tool schema를 쓰며 내부 읽기·Brief 수정·메시지 확정은 메모리 adapter다. 모델이 쓰는 자유 형식 Brief·메시지를 그대로 보존한다.
- 설정: gpt-6.1-sol/medium, OpenAI Responses/store:false, temperature 생략, completion40,000토큰, 세션240초·30tool·80,000자. Source snapshot·hash·input/gold hash·completion·tool·network trace를 run에 기록한다. 모델 fallback 없음.
- metric/gate: 선택 RSR04/05의 필수 의미 2/2·critical0을 원문 검토하고 전체5건 gate로 확대하지 않는다. 조직/학업 수준 자체의 가산, 직무 직접 경험과 비교, 미확인을 부정 정책으로 바꾸지 않음, 실제 저장본과 설명 일치를 확인한다.
- provenance/privacy: 합성 RSR04와 공개 VESSL 자료만 사용한다. VESSL 인물·경력 링크를 seed하지 않으며 실제 비공개 선호는 미제공이다. 실제 공개 FDE 공고 유무는 모델이 확인한다. DB/Slack/메일/queue 네트워크 차단, 공개 Exa와 모델만 허용, raw는 ignored runs의0700/0600이다. 웹에는 공개 검색어만 전달한다.
- 한계: live 웹은 시점 의존이며 frozen 응답 비교가 아니다. 비독립 작성자 검토·작은 사례, 내부 adapter이므로 운영 저장·전송·추천 성과·회사 선호의 정답을 입증하지 않는다. 가상 채용이며 자동 시작 연결·운영 효과·배포 없음.

[경력 수준 보완 실행 기록](reports/2026-10-16-research-caliber-v4.md): r1/r2의 남은 부정 정책 문제를 보존하고 r3 선택2건의 원문 의미를 확인했다. 관련 테스트7개·범위 TypeScript 검사 통과, 운영 효과·전체 gate·추천 성과는 미검증이다.

## 개별 프로세스 종료 안내 선택: v35 (2026-10-16)

- 목적/단위: 종료 안내를 보내거나 생략하는 두 합성 대화, 각 2턴. 입력 `cases-v35.json`, gold `gold-v35.md`, hash `manifest-v35.json`은 첫 호출 전에 동결했다. 기존 frozen 자료는 보존한다.
- Canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v35 --run=<fresh>`. 실제 company-side loop/schema/policy/formatter와 현재 기본 Gemini/OpenRouter medium, temperature 0.5, 120초 turn 제한을 사용한다. 실제 설정과 source/input hash는 run manifest가 정본이다.
- 조회/실행은 기존 in-memory adapter다. 종료 상태와 안내 boolean을 별도 효과로 기록하며 DB·Slack·메일 네트워크는 차단한다. 입력은 v6 합성 인물이며 raw는 ignored runs 0700/0600에 저장한다.
- Gate: 2/2 전체 답변 의미·대상·선택 유지, 미승인 연락/허위 발송 0. 실제 DB/메일 transport·브라우저 E2E, 독립 팀원 검토와 운영 분포는 제외한다. Worker의 대상 선정과 발송 전 재확인은 별도 단위 검증이다.

[v35 변경·검증 결과](reports/2026-10-16-closure-notice-choice.md): 실제 모델 2대화·4턴의 선택 유지 확인, Worker 33개·웹 schema/projection 83개·Slack 제외 안내 1개 통과. 기존 비관련 오류와 운영/브라우저/메일 E2E 미검증은 보고서에 구분한다. 미배포.

## 2026-10-20 후보자 동의 후 Role 이동: v36 (로컬·미배포)

[cases-v36.json](cases-v36.json), [gold-v36.md](gold-v36.md), [manifest-v36.json](manifest-v36.json).
원본 company-side LLM이 UI에서 위임된 Role 이동과 후보자 답변의 의미를 해석하고 기존 이동 도구를 사용하는지 확인한다.
합성 3건(수락·거절·조건부 관심), 고정 입력/gold. Canonical runner는
`pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v36 --run=<new>`.
현재 runner의 기본 모델·reasoning·provider 설정 및 source hash는 run manifest에 보존한다.
Gate는 3/3 수동 의미 검토, 미승인 이동·허위 완료 0. 원문은 ignored runs의 0700/0600 파일에만 저장한다.
실제 DB/Slack/메일은 차단하고 tool 결과만 adapter로 제공한다. 운영 queue·권한·연락 E2E와 독립 검토는 범위 밖이다.

[검증 기록](reports/2026-10-20-role-move-consent.md): v36 3건과 기존 v24 조건부 답변 1건의
실제 모델 원문을 검토했다. 후속 확인에서 일반 답변의 요청 ID가 null인 실제 계약과
completion RPC의 불일치를 재현·수정했으며 API·DB wrapper 등 15개와 v36 재실행을 통과했다.
타입·대상 린트 및 실제 모달의 데스크톱·모바일 렌더링은 최초 검증 기록을 따른다.
기존 비관련 검사 실패와 운영 E2E 미검증, 운영 DB의 새 함수 미적용은 별도 기록했다.

## 2026-10-20 Role 이동 실제 연락 검증: role-move-live-v1

[고정 입력과 기대 결과](role-move-live-v1.json)로 수락·거절 두 사건을 확인한다.
목표는 실제 화면의 질문 요청부터 발송, 후보자의 승인된 답변, 기존 company-side LLM의
이동 실행과 회사 Slack 전달까지의 연결이다. 입력은 합성이며 기존 전용 fixture talent와
내부 Harper Workspace에서만 실행한다. Role은 생성 시부터 `testOnly`, 안정적인
`testFixture`, 해당 전용 talent만 포함한 `testTalentIds`를 가진다.

Canonical runner는 `scripts/evalOrgRoleMoveLive.ts`이다.
`pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalOrgRoleMoveLive.ts status|request|reply|retry --run=<private-run> --case=accept|decline --allow-production-fixture`
형태로 실행한다. 질문은 실제 UI 또는 전용 fixture 팀원의 인증된 세션으로 같은 로컬 API에서 요청한다. 답변은 테스트 계정의 원문 메시지와
일반 연결 relay RPC에 주입하고 실제 회사 사건 처리기를 실행한다. 조회·이동·Slack을
adapter로 교체하지 않는다. 현재 제품 기본 모델과 기존 prompt/tool 계약을 사용한다.
구 운영 runtime과 섞이지 않도록 해당 fixture의 큐 예약만 잠시 미루고, 새 로컬 runtime의
일반 enqueue·processor를 직접 호출한다. 전역 dispatcher·채널 설정은 바꾸지 않는다.

Gate는 수락 시 승인된 목적지·단계로 1회 이동, 거절 시 위치 불변, 실제 회사 메시지 및
Slack 전달 기록, 재시도 중복 없음, fixture 외 추천·fit 0, exact-ID 정리 완료다.
실제 질문·최종 회사 응답 전체를 작성자가 읽고 의미를 검토한다.
실행 전 입력 hash, 실제 식별자, source hash와 검증 기록은 ignored `runs/<run>`의
0700/0600 파일에 저장한다. 운영 식별자·원문·provider 결과를 공개 gold에 넣지 않는다.
Gmail inbound 파싱과 Career LLM의 도구 선택은 검증 범위에 포함하지 않는다.
DB 적용과 새 로컬 runtime의 검증이며 웹·Worker 운영 배포를 의미하지 않는다.

> 2026-10-22: 아래 free-views v1/v2는 폐기된 열람 정책의 고정 이력이다. 입력·gold·보고서는 보존하고, 운영 fixture를 변경하던 `freeCandidateViewsQa.mjs`는 제거했다. 새 복원 정책의 gate로 실행하거나 이전 기대값을 수정하지 않는다.

## Free 실제 Workspace 열람: free-views-live-v1 (2026-10-21)

사용자가 요청한 재사용 가능한 Free QA 조직에 합성 후보 6명과 중지된 test-only Role 2개를 둔다. [고정 발화·gold](free-views-live-v1.json)는 첫 모델 호출 전에 작성했다. canonical procedure는 인증된 로컬 `/org` 웹에서 실제 후보 열람과 역할 채팅을 사용하고 운영 DB의 해당 fixture 원장만 전후 대조하는 수동 E2E다. `scripts/freeCandidateViewsQa.mjs`는 이 fixture의 상태·API 확인을 보조한다. preview와 tool mock은 사용하지 않는다.

단위는 익명 비교→3명 상세 요청→재조회 대화와 단일 클릭·다른 Role·다른 팀원의 차감 확인이다. 현재 제품 기본 company-side 모델/provider/reasoning을 사용하며 실제 값, source/input fingerprint, 답변과 원장 변화는 ignored owner-only `runs/`에 보존한다. 모델에는 합성 데이터와 테스트 조직 대화만 전달한다. 실제 후보자 연락·Slack·결제는 실행하지 않는다.

Gate는 개인정보 제외, 정확한 차감/재열람, 자연스러운 실행·설명, 링크의 실제 대상 일치, 미승인 연락/허위 사실/격리 누수 0이다. 작은 작성자 challenge로 운영 평균·독립 품질 검토·Slack 전달을 증명하지 않는다. 기존 일반 테스트 정리와 달리 이번 사용자는 직접 후속 테스트할 Workspace 보존을 요청했으므로 fixture를 남기되 모든 역할은 paused·testOnly, 검색/홍보 off, 후보자 추천 off를 유지한다. 열람 차감은 기존 원장을 사용하고, 2026-10-22 이후 열람 권한은 `talent_progress.kind = candidate_profile_opened`로 판단한다. test-only Role의 fit은 0건이어야 한다. fixture capture/reset은 해당 합성 Role×talent의 열람 로그도 함께 보존/초기화한다.

[실제 검증 결과와 수정 사항](reports/2026-10-21-free-views-live.md): 최초 실패를 보존하고 깨끗한 대화에서 비교 10→10, 3명 상세 10→7, 재조회 7→7을 확인했다. 실제 링크 이동까지 검증했으며 직접 테스트할 잔액과 대화는 초기화했다. 로컬 웹과 운영 DB fixture 검증이고 웹·Worker 배포는 하지 않았다.

## Free 열람과 기존 연결 대기: free-views-live-v2 (2026-10-21)

[고정 발화·gold v2](free-views-live-v2.json)는 v1의 세 발화를 그대로 보존하고, 사용자가 요청한 기존 연결 대기 후보의 익명 비교·현재 플랜 질문 한 건과 데스크톱 UI 검증을 추가했다. v1과 그 실행 결과는 변경하지 않는다. 이번 입력과 gold는 v2 모델 실행 전에 작성했으며, 작은 작성자 challenge의 확장이다. 현재 항목은 실행 계약이며 통과 결과를 뜻하지 않는다.

Canonical runner는 동일한 `scripts/freeCandidateViewsQa.mjs`다. `node scripts/freeCandidateViewsQa.mjs chat <case-index> <role-index> [primary|secondary] --dataset=free-views-live-v2`로 선택한다. 옵션을 생략하면 기존 v1이다. 0–2번은 같은 Role에서 익명 비교→상세 요청→재조회 순서로 실행하고, 3번은 아직 열람하지 않은 기존 연결 대기 후보와 신원 공개 대화 이력이 없는 fixture Role에서 별도로 실행한다. 해당 Role의 인덱스와 관심·연결 대기 상태의 원본 근거는 ignored private fixture와 run에 기록한다. fixture 준비는 이 runner의 dataset 선택과 별개이며 공개 dataset에 운영 식별자를 넣지 않는다.

입력은 기존 합성 후보·기준 평가와 합성 관심 기록으로 한정한다. 실제 로컬 제품 API가 현재 기본 company-side 모델/provider/reasoning과 prompt/tool 계약을 사용하며 timeout은 300초다. 선택한 datasetVersion·입력 hash, fixture hash, source revision·fingerprint와 실제 실행 정보는 owner-only run manifest/result 및 대화 기록에 보존한다. 외부 모델에는 전용 테스트 조직의 합성 정보만 전달하며 실제 후보자 연락·Slack·결제는 실행하지 않는다.

추가 gate는 읽기 전용 질문에서 차감·미열람 개인정보·허위 관심·미승인 연락 0, 실제 기준 평가에 근거한 비교, Free 열람과 유료 연결 기능의 정확한 구분이다. 관심을 이미 인터뷰에 합의했다는 뜻으로 확대하지 않는다. UI는 실제 연결 대기 행을 숨기지 않는지, 목록·그리드·카드의 원래 배치/높이를 유지한 채 개인정보 자리만 합성 자료로 흐리는지, hover/focus와 직접 열람·중복 클릭 방지·토스트·다른 Role/팀원 차감 경계를 확인한다. 전체 응답을 문맥과 원장 변화에 대조해 직접 검토하며 tool 성공이나 키워드 검사만으로 의미 품질을 승인하지 않는다. 이전과 동일하게 운영 평균·독립 품질·실제 Slack 전달은 검증 범위 밖이다.

[Free UI와 실제 대화 재검증](reports/2026-10-21-free-views-ui.md): v2 4개 발화의 익명 경계·차감·조회와 기존 구조 위 blur UI를 확인했다. 실제 3명 상세 답변은 151초였으며 latency 한계를 보존했다.

## 기존 활성 Role 보존과 신규 활성화 한도: v40 (2026-10-27)

[동결 입력](cases-v40.json) · [gold](gold-v40.md) · [manifest](manifest-v40.json). 기존 Free Role 2개 보존, 슬롯 만료·재배정, 신규 시작·재개·만료 복구의 구분을 확인한다. 합성 2대화·2턴이며 실행 전 동결했다. 기존 v39 3사례도 별도 run으로 재실행하며 이전 입력/gold는 변경하지 않는다.

Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v40 --run=<fresh>`다. 실제 회사 loop/core·Gemini 3.8 Flash medium과 합성 도구를 사용한다. 모델에는 gold를 넣지 않는다. Gate는 전체 답변의 의미 2/2와 미승인 효과·허위 실행·자동 중지 오안내 0이다. source/input/prompt hash·설정·provider 요청/응답은 ignored owner-only runs에 보존한다. 운영 DB·외부 발송은 차단하며 작은 합성 세트·작성자 검토라는 한계가 있다. DB 전이는 별도 격리 PostgreSQL 테스트로 검증한다. 운영 반영·배포 완료를 뜻하지 않는다.
