# Free 무제한 Role·독립 공용 크레딧 검증

문서 기준: 2026-10-08. 로컬 코드와 합성 입력 기준이며 운영 반영·배포를 뜻하지 않는다.

## 변경한 계약

Free에서도 Role 생성·시작·재개는 무제한이다. 전체 Role이 월 공용 크레딧 10개를 함께 쓰고, 유료 Slot의 월 50개는 별도다. 배정된 Slot 잔액을 먼저 사용하고 부족하면 공용 잔액을 사용한다. 다른 Slot에서는 가져오지 않는다. 공용 크레딧은 유료 연결 권한을 만들지 않는다. Slot 만료는 Role을 중지시키지 않는다.

월 갱신·이월 없음은 기존 정책을 유지한 기본값이고, 유료 우선 차감은 이번 구현 기본값이다. 과거 한도 때문에 중지됐을 수 있는 Role을 임의 재개하지 않는다. 기존 계약과 Enterprise 권한도 임의 변경하지 않는다.

## 모델 평가

동결된 [v18 입력](../cases-v18.json), [gold](../gold-v18.md), [manifest](../manifest-v18.json)를 사용했다. 기존 v16 입력과 정답은 보존했다. Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts`이며 현재 company-side prompt·tool schema·loop를 사용하고 DB와 외부 발송은 합성 executor로 대체했다.

모든 run: `google/gemini-3.8-flash`, OpenRouter, reasoning `medium`, temperature `0.5`, progressive tools, non-streaming, 발화당 120초 제한. 정확한 provider·prompt/source fingerprint·원문은 각 run manifest에 보존한다.

| 실행 | 관찰과 처리 |
| --- | --- |
| `20261008-shared-credits-r1` | 6대화 중 5대화 실행. 한국어 가격 질문은 120초 timeout으로 미완료. 완료된 응답에서 공용 크레딧 공존·차감 순서·유료 기능 경계·소진 후 Role 생성은 올바르게 설명했다. |
| `20261008-shared-credits-r2` | 같은 frozen 한국어 가격 질문만 재실행해 완료. Enterprise 개별 계약 설명과 답변 길이에 보완 여지가 있었다. |
| `20261008-shared-credits-r3` | 공개 플랜 설명을 책임 원본에서 나눠 쓴 뒤 6대화·8발화 모두 실행. 공용 사용·유료 기능 경계·두 실패 처리 4대화는 의미 검토 통과. 요금제 개요 2대화는 paid 50 + shared 10의 공존 설명 일부를 생략해 gold 전체 통과로 처리하지 않았다. |
| `20261008-shared-credits-r4` | 공용 제공량이 유료 구독으로 대체되지 않는다는 비교를 명확히 한 뒤 같은 한국어·영어 가격 질문 2개 재실행. 두 답변 모두 Free 무제한·월 공용 10, Slot 월 50 + 공용 10 유지, 별도 Enterprise, 회사 상태 미확인 경계와 Slots/Billing 확인 경로를 설명했다. |

최종 항목별 검토는 r3의 4대화와 r4의 가격 2대화에서 6/6 정책·권한·실패 정직성 기준을 충족했다. 이는 한 번의 최종 전체 run에서 6/6을 관찰했다는 뜻은 아니다. 가격 안내의 장황함과 영어 답변의 월 구독 중심 요약은 남은 품질 한계이며 연간 옵션의 정확한 구매 안내는 화면·FAQ에서 제공한다.

두 크레딧 부족 시나리오는 승인된 도구 호출을 시도했고, 효과 0·별도 billing notice 1개·허위 완료 0이었다. 원본 model completion 요청에는 `credits_exhausted`나 내부 오류 객체가 들어가지 않았다. 공개 플랜 정책과 실제 계정 잔액은 구분한다.

## 별도 구현 검증

- `scripts/testWorkspaceBilling.mjs`: 실제 migration/RPC를 PGlite에 적용. 5→10 전환 시 기존 사용량·기간 ID 보존, 무제한 Role, draft/paused 안전 경계, Intro 원자성, 재시도, 유료 Slot 독립 잔액·교환·갱신, 연 결제 월별 제공, 여러 Slot 구매, 제공 Slot, 만료·Free 복귀, 권한 검증 통과.
- `scripts/testWorkspaceSlotAcceptance.mjs`: Stripe/제공 Slot 만료 뒤 Role active 유지, 기존 추천의 늦은 후보자 수락, 회사 전달 상태·동의·테스트 격리·종료 경계 통과.
- `scripts/testWorkspaceSharedCredits.mjs`: 별도 임시 PostgreSQL 17에서 16개까지 실제 연결을 사용. 30개 Role의 동시 차감은 10건만 성공, 잔액 음수 없음. 동일 요청 20회는 이벤트·차감 1개. paid 우선·공용 fallback·다른 Slot 잔액 격리, 미배정 Role Free 매칭, 유료 연결 경계, 취소 뒤 공용 사용량 유지 통과. 서버는 TCP를 열지 않고 종료 후 폐기했다.
- 관련 컴포넌트·API·billing·Role 활성화·FAQ·Role 상태 테스트 63개 통과. 후속 소규모 화면/FAQ 검증과 한·영 locale 검사도 통과했다.
- 변경 파일 대상 lint 통과. 앱 소스 타입 검사에는 이번 작업 이전에도 있던 `OfficialJobsExperience.tsx`의 `body`와 `server.ts`의 `is_anonymous` 타입 오류 2건이 남아 있다. 전체 타입 검사 통과로 기록하지 않는다.
- 실제 컴포넌트를 정적으로 렌더해 Playwright에서 Free/유료/소진 × 한/영 × 1280/390px 12조합 확인. 가로 overflow 없음. 실제 계정 로그인·결제·hydration 클릭 E2E 검증은 아니다. Slots 공용 패널과 Role별 Slot 카드, 사용 내역의 공용 출처 표시를 분리했다.

Stripe 상품·가격·결제 흐름을 변경하지 않았다. 기존 Stripe Test clock runner의 기대값은 새 공용 잔액에 맞췄지만 Stripe를 호출해 재실행하지 않았다. 운영 DB·FAQ seed·실제 후보자 데이터·메일·Slack은 변경하지 않았다. 신규 migration과 앱을 함께 출시해야 하며 배포·운영 설정 변경은 별도 승인 범위다.

## 데이터 경계와 한계

모든 평가·DB fixture는 합성 데이터이며 내부 Role은 삽입 전 `testOnly`와 안정적인 `testFixture`를 표시했다. 모델 원문은 ignored `runs/` 아래 owner-only 권한, 화면 산출물은 ignored `output/playwright/shared-credits/`에 있다. 생산 데이터를 평가 입력에 사용하지 않았다. 독립 팀원 label review와 실서비스 전송·구독 E2E, 운영 평균 품질은 검증하지 않았다.
