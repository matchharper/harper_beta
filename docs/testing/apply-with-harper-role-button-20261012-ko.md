# 공고별 Apply with Harper 버튼과 비용 로그 — 로컬 구현

2026-10-12 기존 local main에서 구현했다. push·배포·production 데이터 변경은 하지 않았다.

## 화면과 대화

`/career/history?...&id=...`의 공고 상세에서 내 활동 위에 **Apply with Harper**를 표시한다. 저장/지원 상태나 예시 UUID에 묶이지 않고 현재 공고의 `roleId`와 회사·포지션 이름을 함께 전달한다.

클릭하면 한국어에서는 “이 포지션에 하퍼와 함께 지원하고 싶어. 지원 준비를 시작해줘.”를 즉시 보내고 Career 채팅을 연다. 영어 화면에서도 동등한 메시지를 보낸다. 기존 assistant가 지원 시작 카드·이력서 선택을 진행한다. 이 버튼 자체는 이력서 선택이나 외부 제출 승인을 대신하지 않는다. 대화 준비 전이나 응답/공고 변경 처리 중에는 비활성화하고 중복 클릭을 막는다.

## 비용 확인

서버 콘솔의 `[llm-usage]`에 단계 `label`, 실제 `model`, 토큰 수·캐시 사용량, 달러 기준 `estimatedCostUsd`, 단가 출처와 breakdown을 남긴다. DB 로그에 등록하지 않은 지원 분석·이력서 작성·결과 설명 label도 기록한다. 도구별 비용 attribution은 별도 API 호출로 중복 출력하지 않는다. 새 비용 로그에는 프롬프트·이력서·폼 답변을 넣지 않는다.

- `usageScope=request`: 일반 provider 응답 한 번의 추정 비용. native Anthropic streaming에서도 응답 ID·실제 모델과 최종 usage를 사용한다. 사용량이 없거나 실제 모델의 단가가 없으면 비용을 `null`로 남긴다.
- `usageScope=agent_turn` / `agent_session`: 브라우저 Agents API의 누적 사용량 스냅샷. 동일 스냅샷은 한 실행 안에서 중복 출력하지 않는다. `aggregation=cumulative_snapshot_do_not_sum`을 확인하고 스냅샷끼리, 또는 일반 요청 로그와 합산하지 않는다.
- Agents API는 내부 모델 호출별 사용량·cache-write 수·각 호출의 context 크기를 제공하지 않는다. 브라우저 비용은 표준 단가로 산정한 `estimated_partial`이며 cache-write/long-context 추가 요금과 sandbox/도구 비용은 포함하지 않는다. 최종 청구액이 아니다. 사용량이 늦게 도착하거나 조회할 수 없으면 `usage_unavailable`을 남긴다. 추가 사용량 조회는 최대 2초이고 실패해도 기존 흐름과 cleanup을 계속한다.

API 계약: [Agents API observability](https://developers.openai.com/api/docs/guides/agents-api/observability). 새 Astra 단가는 중앙 registry 한 곳에 [공식 Standard 단가](https://developers.openai.com/api/docs/models/gpt-6-astra)를 반영했다.

## 현재 모델

| 과정 | 코드 기본값 |
| --- | --- |
| Career 웹 대화·지원 모드 대화 | Claude Sonnet 5.5, 허용된 dev 선택은 기존대로 반영 |
| 지원 분석 | GPT-6 Luna |
| 이력서 작성·지원 결과 설명 | GPT-6.1 Sol, 기존 fallback 유지 |
| 공개 지원 폼 조회 | Ashby 공개 조회 우선. 그 외에는 공통 OpenAI 브라우저 + GPT-6 Luna low, `APPLICATION_FORM_INSPECTION_MODEL`로 별도 override |
| 실제 브라우저 지원 | GPT-6 Astra, 기존 APPLICATION_BROWSER_MODEL override 유지 |

웹 기본값은 `textChatModelConfig.ts`에서 결정한다. 공통 내부 `CAREER_LLM_CONFIG.assistant` 기본값과 구분한다. 이후 공개 지원 폼 조회만 Luna low로 전환했다. 조회 제한은 환경 준비 시간을 포함해 180초이며, 종료 후 자원 정리에는 별도의 짧은 제한을 둔다. 기본 대화·실제 지원·이력서 작성 모델은 유지한다.

## 검증 범위

합성 공고/대화와 mock provider로 화면 위치, 즉시 전송, 공고 전환, 한국어·영어, 진행 중 비활성화, 중복 클릭, 실패 재시도, 캐시/fallback 비용, 실제 streaming 두 호출의 개별 비용, Agents 이벤트/종료 조회 비용과 지연 제한을 검사한다. 기존 provider·지원 승인/질문/재연결 회귀 검사를 포함한다. 실제 사용자 대화나 외부 지원은 보내지 않았다.

최종 실행: 관련 11개 파일·59개 테스트 모두 통과, 전체 TypeScript 검사 통과, 변경 파일 ESLint 오류 0. `CareerHistoryPanel.tsx`의 기존 effect 경고 1개가 남았다. 합성 테스트는 `scripts/offlineTestNetwork.mjs`로 실제 외부 통신을 차단했다. 실행 로그는 ignored `.local/pr155-apply-button/tests.tap`에 있다. 지원 폼 검사 제한시간도 명시적 timer로 유지하고 종료 경로에서 해제하도록 수정했다.

전체 번역 검사에는 이번 키와 무관한 기존 `ui.*` 누락 22개가 있다. 새 요청 문구의 한국어·영어 값은 직접 작성하고 렌더링 테스트로 확인했다.
