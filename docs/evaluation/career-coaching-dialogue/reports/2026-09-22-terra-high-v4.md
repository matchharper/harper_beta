# Career coaching lifecycle v4 평가 결과

## 결론

2026-09-22 `gpt-5.6-terra`, reasoning `high`로 frozen v4 14개 사례를 세 번 반복 실행했다. 세 run 모두 structural lifecycle violation 0건, tool error 0건이었다. 첫 번째 최종 run과 상태 무결성 보완 뒤의 마지막 run 원문을 human review했고 14개 사례가 모두 qualitative gate를 통과했으며 critical failure는 없었다. 마지막 run에서도 일반 대화 경계, 사실성, 종료 뒤 복귀와 Memory 경계를 확인했다.

보정 migration 적용 뒤에는 로컬 `/api/talent/chat` SSE와 연결 DB로 서로 다른 두 흐름을 추가 검증했다. direct start와 suggested 카드 start, active 대화, 명시적 종료, 종료 뒤 일반 대화 복귀까지 실제 DB 상태 전이가 모두 맞았다. 이 과정에서 만료 RPC의 null composite 반환을 서버가 오류로 오해하는 문제를 찾아 고쳤다. 기능 통합은 통과했지만 Terra 종료 턴 1건이 349.9초까지 지연돼 latency reliability는 아직 release gate를 통과했다고 볼 수 없다.

## 실행 조건

- dataset/gold: `cases-v4.json`, `gold-v4.json`
- runner: `scripts/evalCareerCoachingLifecycle.ts`
- provider/model/reasoning: OpenAI Responses API / `gpt-5.6-terra` / `high`
- channel: `chat`
- production prompt builder와 production tool schema 사용
- lifecycle mutation과 read tool은 메모리 안의 구조적 stub 사용
- raw prompt, transcript, tool call, provider metadata는 gitignored `runs/`에만 저장

## 반복 결과

| run | prompt fingerprint | 사례 | lifecycle violation | tool error | 검토 |
| --- | --- | ---: | ---: | ---: | --- |
| `20260922-terra-high-v4-r3` | `63aa8449…` | 14 | 0 | 0 | 전체 human review 통과 |
| `20260922-terra-high-v4-r4` | `9cbdf43c…` | 14 | 0 | 0 | 경계 반복 확인 |
| `20260922-terra-high-v4-r5` | `5f0ed1f7…` | 14 | 0 | 0 | 최종 코드 전체 human review 통과 |

## 사례별 판단

- 막연하지만 명시적인 코칭 요청은 저장된 맥락을 이용해 사용자가 고를 수 있는 구체적인 방향과 시간 범위를 제안했다. 아직 한 주제를 선택하지 않은 상태에서는 activity를 성급히 만들지 않았다.
- 명시적 코칭 탐색 뒤 해외 이동, 개발자에서 PM 전환, 보상 상승, 일의 재미 저하를 꺼낸 네 사례는 모두 유용한 topic과 범위를 만들었다. 사용자가 곧바로 분석을 요청한 경우에는 불필요한 확인 단계를 만들지 않고 시작했다.
- 같은 네 발화를 코칭 진입 없이 일반 채팅에서 말한 사례와 “이 공고 어때?” 사례는 lifecycle tool을 한 번도 호출하지 않았다.
- 보상 사례에서 확인하지 않은 시장 연봉 숫자를 사실처럼 제시하지 않았다. 해외 이동 사례에서도 확인하지 않은 비자 가능성이나 채용 시장 사실을 단정하지 않았다.
- 제안 카드 뒤 자연어로 시작한 사례와 처음부터 명시적으로 시작을 요청한 사례는 `active`로 전환했고, topic·예상 시간·agenda가 채워졌다.
- active 중 단발성 일반 질문은 그 질문에만 답했고 코칭 복귀 문구나 activity update를 붙이지 않았다.
- 명시적 종료에서는 `end`가 한 번 실행됐고, 다음 일반 질문에서는 코칭을 다시 열거나 종료를 반복하지 않았다.
- topic, agenda, 예상 시간, 시작·종료 여부, 다음 대화에서 이어가겠다는 약속을 durable Memory로 쓰지 않았다.

## migration 적용 뒤 실제 SSE·DB 검증

전용 임시 QA 계정을 만들고 `profile_visibility=dont_share`, 추천 비활성 상태에서 두 conversation을 실행했다. 테스트가 끝난 뒤 생성한 Auth 사용자와 Career 행을 정확한 ID로 삭제했고, 같은 fixture prefix의 Auth 사용자와 `talent_users` 행이 각각 0건인 것을 확인했다. raw transcript와 이벤트는 owner-only `runs/20260922-terra-live-db-e2e-after-migration/`에만 보관한다.

첫 흐름은 코칭 버튼 진입 뒤 해외 이직 판단을 20분 채팅으로 곧바로 시작했다. 버튼 진입만으로는 activity가 생기지 않았고, 주제·시간·즉시 시작 의사가 나온 다음 `active revision=1` 활동이 생성됐다. 명시적 종료 뒤 pointer가 해제됐으며, 이어진 휴가 문구 요청에는 코칭 재개나 재권유 없이 요청한 문장만 답했다.

두 번째 흐름은 기존 고정 사례와 다른 “시니어 IC 유지 대 작은 스타트업 첫 엔지니어” 선택이었다. 사용자가 아직 시작하지 말라고 하자 15분 `suggested revision=1` 카드가 생성됐다. 카드의 채팅 시작 action을 보내자 같은 message가 구체적인 agenda를 가진 `active revision=2`로 바뀌었다. 후속 발화에서는 선택을 단순한 안정성 대 도전으로 축약하지 않고 스타트업 실패의 회복 위험과 현 직장 잔류의 성장 정체 위험을 비교했다. 명시적 종료 뒤 pointer가 해제됐다. 전체 실행에서 tool failure log와 SSE error는 0건이었다.

첫 시도에서는 activity 생성 직후 다음 요청이 HTTP 500으로 실패했다. PostgreSQL의 composite 반환 RPC는 “만료 없음”을 JSON `null`뿐 아니라 모든 필드가 null인 객체로 돌려줄 수 있는데, 서버가 후자를 손상된 ended activity로 해석했다. null composite를 정상적인 “아직 만료되지 않음”으로 처리하도록 고치고 같은 흐름을 처음부터 재실행해 통과했다.

한국어 대화 중 tool 진행 문구를 영어로 생성하라는 공용 prompt 모순도 실제 SSE에서 확인했다. `_uiStatusMessage`가 최종 응답과 같은 언어를 사용하도록 수정했고, 재실행에서 “시니어 IC와 첫 엔지니어 제안 비교 코칭 대화를 종료하고 있습니다.”로 표시되는 것을 확인했다.

### 지연

본 실행 9턴에서 응답 헤더와 첫 SSE 이벤트는 2.6~3.3초에 도착했다. 349.9초 이상치 한 건을 제외한 8턴은 첫 텍스트 평균 7.2초·중앙값 6.6초, 전체 완료 평균 11.7초·중앙값 9.9초였다. 종료 턴 한 건은 첫 텍스트 348.9초·전체 완료 349.9초였고, 같은 active 종료만 분리해 두 번 재실행했을 때는 전체 8.4초와 8.9초로 정상 범위였다.

따라서 349.9초는 lifecycle RPC나 매번 생기는 고정 지연으로 재현되지는 않았다. 첫 SSE 이벤트가 이미 3.1초에 도착한 뒤 모델의 tool/최종 문장 구간에서 멈춘 provider 이상치로 보이지만, 현재 trace만으로 정확한 provider 원인을 확정할 수 없다. Career 모델 호출에는 이 장기 정지를 끊는 명시적인 per-attempt timeout이 없으므로, Terra를 기본 모델로 선택하려면 timeout/fallback 정책과 반복 latency 표본을 별도 검증해야 한다.

## 평가 중 바꾼 것

초기 반복에서는 direct start의 기준과 종료 뒤 동작, 외부 사실의 근거 경계, session control과 durable Memory의 구분을 더 명확히 할 필요가 있었다. production prompt를 다음처럼 고쳤다.

1. 현재 발화가 채팅 또는 통화 시작을 명시적으로 수락했거나 실제 분석을 시작한 경우에만 `start`를 허용했다.
2. 일반 조언, 공고 평가, 단발성 감정 표현, 과거 코칭 기록만으로는 activity를 만들지 않도록 했다.
3. 보상·비자·시장·회사 정보는 실제 read/search 결과 없이 수치나 사실을 단정하지 않도록 했다.
4. 종료된 과거 activity를 보고 `end`를 반복하지 않도록 했다.
5. 세션의 topic·agenda·시간·상태와 재참여 계획은 durable Memory에 저장하지 않도록 했다.

사례 문장이나 네 주제를 runtime 분기로 넣지 않았다. 모든 사례는 같은 일반 prompt와 같은 lifecycle tool 계약을 사용했다.

## release gate 해석

텍스트 모델의 lifecycle·콘텐츠 gate와 실제 migration/RPC의 기본 chat lifecycle은 통과했다. 전체 기능의 release gate에는 브라우저 카드 렌더링과 다중 클릭, stale revision, call 연결 실패 rollback, Realtime/Live 종료 E2E가 남아 있다. Terra는 한 번의 349.9초 장기 지연 때문에 latency reliability gate가 남아 있다. 이 보고서만으로 production 배포 완료를 주장하지 않는다.
