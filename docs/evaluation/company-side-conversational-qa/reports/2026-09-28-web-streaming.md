# 웹 대화 스트리밍 검증

2026-09-28. 로컬 변경 검증이며 운영 배포 완료를 뜻하지 않는다.

## 변경과 재현

일반 회사 대화와 기존 Role 웹 대화의 production completion을 provider SSE로 소비한다.
텍스트만 즉시 전달하고 도구 인자·추론은 화면에 보내지 않는다. 도구 실행·Gemini 서명/upstream 고정,
완료 검증, 최종 exact presentation 조립·저장은 유지한다. 저장된 메시지와 미완성 텍스트를 분리하며
provider 오류·출력 예산 초과·종료 전 연결 단절을 정상 완료로 처리하지 않는다.
신규 Role 작성과 Slack은 기존 전달 방식이다. 모델·reasoning·prompt·도구 정책은 변경하지 않았다.

Canonical runner:

```bash
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts --dataset=v8 --stream=true --case=CSCQ804-chat,CSCQ802-today --run=<새-run-id>
```

실행 ID: `2026-09-28-web-stream-r1`. 동결 v8의 입력/gold/계약 hash 검증 후 실행했다.
Gemini 3.8 Flash / OpenRouter / Google, medium, temperature 0.5, turn당 120초,
`progressive`, `copy=synthetic`. source revision·dirty source fingerprint·snapshot·원문·provider usage는
ignored `runs/2026-09-28-web-stream-r1/` manifest와 각 completion에 보존했다(폴더 0700, 파일 0600).
합성 데이터만 모델에 전송했고 DB·메일·Slack·Calendar 네트워크는 차단했다.

## 결과와 직접 원문 검토

| 변형 | 전송 결과 | 의미/권한 검토 |
| --- | --- | --- |
| CSCQ804-chat | 호출 1회, 첫 텍스트 4.364초, 완료 4.618초, delta 3개 | 바쁜 상황에 공감하고 업무 요청을 열어 둠. 새 도구/업무 생성 없음. 의미 통과, 추가 업무 안내는 다소 불필요함. |
| CSCQ802-today | 호출 3회, 전체 23.296초. 최종 호출 첫 텍스트 10.123초, 완료 11.217초, delta 8개 | 최근 10분 전 연락을 조회하고 새 발송 0, 관심/회신/열람/단계 변경 주장 없음. 추가 여부 확인 전에 draft까지 만든 것은 불필요한 작업 경고. 합성 writer의 본문은 실제 이메일 품질 증거가 아님. |

선택 2변형은 전송 오류 없이 완료했다. 도구만 반환한 첫 두 completion에는 텍스트 delta가 없으며,
추론 시간을 스트리밍 개선 효과로 계산하지 않는다. 사용자 장애 입력과 다른 합성 사례이므로
기존 140초 지연 대비 성능 개선율을 주장하지 않는다. 전체 v8 품질 gate 통과도 아니다.

## 코드 경계 검증

- provider/Responses adapter, Career 공유 스트림, company loop·tool·thinking log 회귀 50/50.
- 실제 React hook + 분할 SSE frame 수신 및 live store 회귀 2/2: 완료 전 텍스트 렌더링,
  최종 본문 교체·저장 메시지 중복 없음, error 종료, 완료 직후 새 turn을 시작해도 이전 cleanup이 지우지 않음.
- 전체 TypeScript 검사는 기존 생성 route의 삭제된 `network.js` 참조 2건,
  private 연락 검사 스크립트 1건, GTM 테스트 5건 때문에 실패했다. 이 변경 경로의 오류는 없었다.
- 수정 파일과 전이 의존성으로 범위를 잡은 별도 TypeScript 검사는 통과했다. 로컬 chat API 컴파일과 미인증 요청의 401 반환도 확인했다.

운영 DB write, 후보자 연락, 실제 브라우저 대화 제출, 배포는 실행하지 않았다.
