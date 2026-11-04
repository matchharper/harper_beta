# 재접속 사건 입력과 인사 (2026-11-04, 로컬)

## 변경

- 실제 대화 역할·내용·순서를 보존하고, 마지막 provider 입력에 실제 재접속 사건을 붙인다. provider `user` 역할을 사용하지만 앱 사건이며 사용자 발화·새 동의가 아님을 표시한다. 대화 DB에는 사용자 메시지를 쓰지 않는다.
- 재접속 지침은 사건 입력에 한 번만 제공한다. 준비된 추천 결과는 기존 runtime context에 남는다. 온보딩 진행 중 재방문도 같은 입력 경계를 사용하며, 추천 preload는 온보딩 완료 이후로 유지한다.
- 기존 재접속 목적을 인사로 새 대화를 여는 것으로 수정했다. 추천 도구와 미응답 항목, 무응답 계약은 유지한다. 인사 후처리·품질 키워드 검사·새 persistence는 추가하지 않았다.
- native Anthropic의 두 호출부를 기존 opt-in provider trace에 연결했다. observer가 없으면 기존 fetch와 동일하며 인증 헤더는 기록하지 않는다.

## 검증

Frozen v1 네 사례(마지막 user/assistant × 미팅 요청 유/무)와 v4 `ready_candidates`를 재사용했다. 데이터와 gold는 변경하지 않았다. 제품 `chatTurn` 입력 조립과 실제 Haiku streaming을 사용했다. DB 읽기·쓰기와 도구 부작용은 합성 fixture로 격리했다.

| 실행 | 사례 | 결과 |
| --- | --- | --- |
| `runs/20261104-return-event-v1-traced` | v1 4개 | 모두 첫 본문이 재방문 인사로 시작. 각 1회 native Haiku HTTP 200, fallback 없음. |
| `runs/20261104-return-event-v4-ready` | v4 ready_candidates | 추천 반영 도구 호출 후 인사로 시작하는 본문. 메모리 fixture 추천 3건과 출력 일치. native Haiku HTTP 200 2회, fallback 없음. |

최초 provider 요청 모두 마지막 역할은 `user`이며 재접속 사건은 한 번만 포함된다. 첫 본문 delta는 v1에서 595–786ms, 도구를 실행한 v4에서 6,938ms였다. 원본 요청·표시 본문·delta·도구 결과·source hash는 각 ignored run 디렉터리에 보존한다. 도구 전 인사를 반드시 먼저 스트리밍한다는 검증은 아니며, 사용자에게 보이는 본문이 인사로 시작하는지 확인했다.

관련 테스트 36개 통과: 실제 chatTurn의 온보딩 완료/미완료 및 마지막 user/assistant 입력, native streaming/non-streaming 요청 형태, SSE route, 기존 fallback streaming, lifecycle 지침, provider trace 격리. `git diff --check` 통과.

첫 실행 `runs/20261104-return-event-v1`은 Haiku 응답 후 기존 평가 도구의 native trace 미연결 때문에 중단됐다. native trace 연결 후 새 디렉터리에서 다시 실행했으며 이전 결과를 덮어쓰지 않았다. 테스트 첫 시도는 OpenAI 모듈 초기화에 필요한 fixture key가 없어 실패했고, 이후 가짜 key로 격리 실행했다.

## 해석과 범위

이번 입력 계약과 인사 시작은 위 5개 실제 모델 출력에서 확인했다. v1의 일부 답변은 과거 맥락을 길게 재설명하고, 마지막 사용자 발화가 있는 사례에서 과거에 논의한 범위를 넓게 표현했다. 따라서 이 결과를 전체 재접속 문구 품질 통과로 확대하지 않는다. 도구가 없는 v1은 실제 추천 수행 품질을 판단하는 데이터가 아니다. 전체 v4 평가·실사용 계정 브라우저 E2E·실제 추천 저장·운영 배포는 수행하지 않았다.
