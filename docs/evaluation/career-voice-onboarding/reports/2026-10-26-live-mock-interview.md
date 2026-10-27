# Live 모의 면접 시작과 음성 입력 점검

2026-10-26 로컬 변경의 제한된 합성 검증이다. 배포·운영 DB 변경·실제 후보자 데이터 전송은 하지 않았다.

## 결과

| 실행 | 결과 | 확인한 동작 |
| --- | --- | --- |
| 위임 prompt와 시작 commentary만 수정 | 실패 | 사용자 발화 전 위임·검색·첫 질문이 없었다. 음성은 전사됐지만 시작 전 질문을 가정해 답했다. |
| 공통 backend 시작 요청 추가 | 통과 | 사용자 발화 전 위임과 검색 2회, 결제 처리 장애 상황의 기술 질문이 시작됐다. 끼어든 음성을 전사하고 같은 질문의 조건을 설명했다. |
| 기존 온보딩 완료 사례 | 통과 | 마지막 필수 답변 뒤 추가 확인 없이 `end_call(complete_onboarding=true)`를 요청했다. |

실패 실행도 보존했다. runner 종료 코드만으로 정성 gate를 판정하지 않았다. 모의 면접은 인사를 넘어 첫 기술 질문을 시작했고, 검색 결과가 비어 있을 때 회사의 실제 기출이라고 주장하지 않았다. 전체 대화와 이벤트 순서를 직접 검토했다. 최종 두 실행 모두 API 오류가 없고 `session.closed`를 수신했다. 이후 WebSocket close code는 1006으로 기록돼 정상 transport close handshake까지 확인한 것은 아니다.

## 변경과 검증 경계

- 시작 신호를 발화 요청인 `session.commentary.append`에서 공통 `response.item.create` + `response.create`로 바꿨다. backend가 준비와 도구 실행을 시작하고 음성 모델이 결과를 사용한다. 모의 면접별 실행 상태나 정성 답변 분기를 추가하지 않았다.
- 후속 위임 prompt에 실제 `<|SpawnThinking|>` 지시를 사용한다. backend 실패·미완료는 오류로 전달하며 통화 화면에서도 기존 toast로 표시한다.
- 로컬/명시적 debug 모드에서 마이크 track 상태, 입력 에너지, 전송량, 전사 이벤트 수를 기록한다. 진단에는 원음·전사 원문·장치 식별자·네트워크 주소를 넣지 않는다.
- 격리된 실제 hook 콜백/공통 prompt 검사 16개 통과. 시작 backend 요청, 도구 결과 후 응답 재개·중복 방지, usage 없는 실패, 전사 유지, 온보딩 종료 저장 순서와 진단 정보 범위를 확인했다. TypeScript 및 변경 runtime 파일 ESLint도 통과했다.

## 재현과 한계

[Frozen input/gold](../live-prompt-cases-mock-interview-v1.json), [재현 manifest](../mock-interview-manifest-v1.json), [canonical runner 및 계약](../README.md).

`gpt-live-1` + `gpt-6.1-sol`/`xhigh`, `cedar` 음성을 사용했다. macOS Yuna의 합성 한국어를 PCM16/24kHz로 연속 전송하고 실제 모델 응답을 받았다. 검색 도구는 합성 결과만 반환했으며 운영 도구·DB를 호출하지 않았다. 원음·요청·모델 출력은 ignored owner-only 디렉터리에만 있다.

한 건의 WebSocket smoke이므로 실제 사용자 마이크, 브라우저 WebRTC/스피커 재생, 실제 검색 지연, 장기 대화 성공률은 입증하지 않는다. 특히 원래 통화에서 사용자 음성 전사가 없었던 원인을 마이크 권한 또는 입력 장치 문제로 확정하지 않는다. 실제 로컬 재시도에서 입력 에너지·전송량·전사 유무를 함께 확인해야 이 부분을 구분할 수 있다. 첫 질문 시작은 사용자 전사보다 앞섰으나 당시 runner에는 세부 수신시각이 없어 정확한 첫 질문 latency는 보고하지 않는다.
