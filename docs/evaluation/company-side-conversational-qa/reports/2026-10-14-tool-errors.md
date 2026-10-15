# 공통 Tool 오류 전달 검증 — 2026-10-14

로컬 구현이며 배포하지 않았다. 기존 작업 트리 변경은 보존했다.

## 변경과 증거 경계

- `src/lib/llm/toolError.ts`에서 알려진 machine 오류의 설명과 원래 진단을 함께 반환한다. 알 수 없는 오류는 원인을 추측하지 않고 message/code/details/hint/cause 및 provider 응답을 직렬화한다. 순환 참조·BigInt·문자열·비표준 throw도 처리하며 transport credential 필드와 stack은 모델 입력에서 제외한다.
- Career의 두 Anthropic 경로, 공통 OpenAI/OpenRouter loop, company-side loop, 음성 도구 endpoint와 두 클라이언트에 연결했다. 현재 Next 이메일은 Career loop를 공유한다. 반환된 error와 compact modelOutput, 초안 작성 실패, 일괄 연락의 개별 실패도 진단을 보존한다. 기존 회사용 결과 projection·부분 완료 사실과 차단 표시 경계는 유지한다. 채용 등록의 별도 loop, 회사 조사, Ops 웹 조사와 calibration의 개별 URL 실패에도 같은 formatter를 연결했다.
- Python `tool_errors.py`를 기존 이메일 loop와 회사 조사 agent에 연결했다. 기존 이메일 tool 예외는 job 전체로 전파하는 대신 실패 결과를 모델에 반환한다. 따라서 이 경로의 tool 실패만으로 자동 job 재시도가 발생하지 않으며, 모델에 기존 효과가 되돌려졌다고 단정하지 말고 현재 상태를 확인하도록 전달한다. provider/worker 자체 실패 처리는 그대로다.
- 모든 도구의 모든 예상 오류에 새 설명을 작성한 것은 아니다. 공통 경계는 알 수 없는 오류를 보존하고, 정확한 의미를 확인한 17개 코드에 설명을 추가한다. 이후 코드별 설명은 실제 발생 조건을 확인해 확장한다.

## 비모델 검증

- TypeScript 오류 직렬화·기존 결과 formatter·Career stream·Responses·새 이메일 테스트: 93/93.
- 실제 company-side loop의 객체 오류 전달과 취소 전파: 2/2.
- Python 신규 오류 전달 및 기존 이메일 모델 loop: 29/29.
- 회사 조사·calibration 관련 기존 테스트: 11/12. 나머지 1개는 기존 prompt에 특정 tool 호출 문장이 있다고 가정하는 fixture이며, 이번 변경에서 해당 prompt는 수정하지 않았다.
- TypeScript 타입 검사 통과.
- 전체 company capabilityLoop 테스트는 12/14였다. 기존 2개 fixture가 현재 Team 권한 조회를 제공하지 않아 실행 초입에서 실패한다. 이번 오류 formatter에 도달하기 전의 실패이며 관련 권한 코드/fixture를 변경하지 않았다.
- 최초 테스트 호출의 server-only preload 누락과 신규 Responses 테스트의 reasoning 옵션 누락은 테스트 실행/fixture 설정을 수정한 후 위 결과로 재확인했다.

## 동결 모델 평가

기존 frozen v20 입력·gold·manifest는 변경하지 않았다. canonical runner는 `scripts/evalCompanyAgentCapabilities.ts`다. 현재 기본 Gemini/OpenRouter 모델·reasoning·prompt/source hash는 각 run manifest에 기록한다. 합성 입력만 사용했고 DB·메일·Slack 전송은 차단했다. 원문은 ignored `runs/`의 owner-only 파일에 있다.

| Run | 범위 | 실행 | 원문 의미 검토 |
| --- | --- | --- | --- |
| `20261014-tool-error-v20-r1` | v20 전체 | 3/3 | 팀원 등록 거절 웹·Slack 2/2, 응답 유실 0/1 |
| `20261014-tool-error-v20-r2` | transport_unknown | 1/1 | 0/1 |
| `20261014-tool-error-v20-r3` | transport_unknown | 1/1 | 0/1 |

r2는 오류 발생과 실제 효과 미확인의 구분을 추가했고, r3는 실행 사실과 원본 diagnostic을 별도 필드로 분리했다. 모델 입력에는 `effect_status=unknown`과 원래 오류 `Connection closed before response`/`08006`이 보존되는 것을 확인했다.

그러나 세 run 모두 모델이 접수 실패를 단정했고, 즉시 같은 검색을 다시 호출했다. r3의 최종 답변도 “요청이 정상적으로 접수되지 않았어요”라고 표현했다. 따라서 **v20 전체 품질 gate는 통과하지 못했다**. 오류 정보 전달 성공을 모델의 불확실성 판단·안전한 재시도 성공으로 확대하지 않는다. 이를 고치기 위한 시나리오별 코드 분기나 출력 문구 교정은 추가하지 않았다.

작은 합성 평가와 작성자 검토이며 운영 전체 tool, 실제 transport E2E, 독립 팀원 검토를 증명하지 않는다.
