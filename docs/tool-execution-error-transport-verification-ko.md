# Tool 오류 전달 구현 및 비교 검증

문서 기준: 2026-10-14

상태: 로컬 구현, 미배포. [설계 계약](tool-execution-error-transport-implementation-plan-ko.md)을 구현했다. 기존 업무 안내를 유지하고 예상하지 못한 오류의 실제 진단을 모델에 전달하는 경로를 검증했다. **모든 production 상황에서 부작용이 없다는 증명은 아니며, 기존 검사 실패와 모델 판단의 실패를 아래에 구분한다.**

## 1 구현한 경로

| 경로 | 실행과 전달 |
| --- | --- |
| Career Anthropic 일반·stream | 호출 capture, 기존 결과 renderer, 실제 다음 요청의 tool result |
| Career OpenAI·OpenRouter·provider fallback | 같은 capture, 기존 JSON 결과와 추가 진단, Responses output |
| 웹 route와 서버 chatTurn의 로컬 executor | 위 model loop에서 포착. route의 완료 후 context refresh 실패도 결과와 분리 |
| 회사 웹·Slack | 기존 company-safe formatter 유지, 호출·진단 수집과 본문 우선 예산 적용 |
| 회사 채용 등록 | 기존 안내·confirmation·read-back 유지, 부분 저장과 HTTP 오류의 전체 효과 분리 |
| calibration·회사 조사·Ops auto-intro | 하위 실행 wrapper, 오류·부분 결과를 기존 작성 loop로 전달 |
| 음성 endpoint·Realtime·Live | 원래 응답 필드와 모델용 결과 분리. client는 준비된 결과를 다시 JSON parsing하지 않고 전달 |
| Next 이메일·지원 준비 | Career 공통 loop 사용. job continuation 신호를 일반 실패나 답변 복구로 삼키지 않음 |
| 지원서 브라우저 action·읽기 전용 inspection | 실제 runtime 실행 및 외부 agent tool result에 공통 오류 직렬화 사용 |
| Candid | 웹 검색·scraping의 반환 및 예외를 공통 전달로 연결 |
| Ops 도구 디버거 | 별도 실행 경계도 capture, 기존 formatter와 본문 우선 budget 사용 |
| Python 이메일 Chat·Responses | 공통 실행 capture와 원문 결과를 유지하는 model output |
| Python 회사 조사 | 모든 action 실행, 내부 source 실패, compact summary에 진단 보충 |

`responsesChatAdapter`, final presentation, route-local registry는 준비된 내용을 운반한다. 같은 호출에 실행 wrapper를 중복 적용하지 않았다. provider가 내부에서 실행하는 built-in 도구나 도구 호출이 아닌 일반 모델 추론은 로컬 executor 범위와 구분한다.

## 2 공통 처리와 실제로 찾은 결함

`toolExecution.ts`는 원래 반환값 또는 예외를 포착하고 호출별 진단을 수집한다. `toolError.ts`는 안전한 진단 직렬화와 전달 준비를 담당한다. Error·plain object·primitive·cause·AggregateError·추가 속성을 처리하며 객체를 `String(error)`로 축약하지 않는다. Python도 같은 책임을 사용한다.

진단이 없는 정상 결과는 기존 serializer를 사용한다. 업무 결과 객체는 수정하지 않는다. `ok:false`에 무실행·재시도 정책을 추가하지 않으며 기존 consumer의 상태 판단을 유지한다. 오류 payload는 전달 경계에서만 정제하고, 기존 instruction·answerDraft·부분 완료 사실을 보존한다.

검증 중 다음 결함을 찾아 보완했다.

- 일부 내부 catch의 원래 오류가 사라졌다. 기존 안내는 그대로 두고 호출 단위 수집기에 보고하도록 연결했다.
- 진행 표시 실패가 업무 실행을 막거나, 완료 후 context refresh 오류가 실제 결과를 덮어쓸 수 있었다. 결과와 보고 실패를 분리했다. 권한·입력 검사는 그대로 hard failure다.
- 이메일 continuation 예외가 native 바깥의 답변 복구에서 추가 모델 호출을 유발했다. 기존 예외 타입에 trusted Symbol을 연결하고 내부 catch와 바깥 복구 모두에서 전파한다.
- 추가 진단 때문에 회사의 기존 본문이 80,000자 budget에서 밀려날 수 있었다. 본문을 먼저 계산하고 각 completion 전에 남은 공간에 진단을 재배치한다.
- 음성 client가 진단이 붙은 문자열을 다시 JSON parsing하면 배열·문자열 결과를 잃을 수 있었다. 모델용 결과를 그대로 전달한다.
- 오류 필드의 인증정보가 모델용 결과에서는 제거돼도 HTTP 원본 output에 남을 수 있었다. HTTP 전달 경계의 오류 필드도 정제하며 executor의 원래 객체는 유지한다.
- 기존 billing 오류의 UI 전용 원인이 추가 속성 보존으로 노출될 수 있었다. 오류 클래스가 자신의 모델 공유 projection을 제공하도록 해 일반 오류의 확장성과 해당 privacy 경계를 함께 유지했다.

공통 계층에 오류별 해결 목록, 추가 진단 LLM, 자동 재시도 또는 대화 상태 머신을 넣지 않았다.

## 3 hand-crafted 텍스트 보존

비교 기준은 구현 시작 시점의 dirty 작업 트리다. Git HEAD나 이전 배포본으로 사용자 변경을 되돌리지 않았다. 코드 baseline은 ignored `.local/tool-error-transport-baseline-20261014/`에 owner-only로 보관했다. 별도 checkout은 만들지 않았다.

TypeScript 2,453개 파일의 문자열·template segment 176,109개와 Python 28개 파일의 문자열 segment 10,553개를 검색·비교했다. 이 숫자는 업무 문구만의 개수가 아니다. 작업 중 다른 수정도 발견됐으므로 이번 작업의 파일 목록을 따로 구분했다.

이번 작업에서 기존 업무 안내 literal·template를 제거하거나 재작성하지 않았다. 회사의 `formatOrgAgentToolResult`와 `orgAgentToolRecoveryInstruction` 함수 본문은 baseline과 동일하다. 검토 요청·보류 질문·검색 접수·지원 준비·회사 초안·Role 작성·이메일의 기존 producer도 유지했다. 진단 수집을 연결한 곳은 기존 반환값과 본문을 함께 검증했다.

의도적으로 바뀐 부분은 다음과 같다.

| 변경 | 보존과의 관계 |
| --- | --- |
| 최근 추가한 `ERROR_EXPLANATIONS` 17개 제거 | 설계에서 제거하기로 한 공통 설명표. 기존 업무 안내와 구분 |
| `Tool error:`·`tool_error=` 부착 방식 변경 | 진단 운반 framing만 변경. 기존 업무 본문은 유지 |
| 오류 객체의 추가 속성·cause·source 진단 보충 | 새 정보가 추가되며 기존 instruction·answerDraft는 유지 |
| HTTP 상태에서 만든 무실행 flag 교정 | 안내 문구를 재작성하지 않고 확인된 실행 사실만 반영 |
| 실제 credential·source-private 진단 제외 | 보안 경계가 우선. 공유 가능한 업무 문구는 유지 |

무진단 결과의 equality, 진단이 있는 결과의 본문·필드 유지, JSON 유효성, 정확한 초안과 native block의 보존을 검증했다. 기존 문구 생성이 유지된다는 사실이 LLM의 최종 답변까지 글자 단위로 같다는 뜻은 아니다.

## 4 자동 검사 결과

| 검사 | 결과 |
| --- | --- |
| TypeScript 관련 단위·통합 검사 | 348건: 통과 337, 실패 10, skip 1 |
| Python 오류·이메일·회사 summary 회귀 | 9/9 통과, 변경 파일 문법 검사 통과 |
| 실제 요청 생성 경로 | Anthropic·OpenAI·OpenRouter·fallback × stream/non-stream × resume 여부 × batch 1/3, 32조합 통과 |
| 각 조합의 runtime continuation | 예외 identity 유지, 실행 1회·모델 요청 1회, 복구 completion과 후속 도구 실행 없음 |
| 음성 endpoint | 기존 응답·안내 유지, 내부 진단 전달, 새로운 SDK 오류 및 HTTP credential 제외 확인 |
| serializer·보고 경계 | 추가 속성·cause·순환·거대 배열·큰 key·getter·DOM 오류·formatter 실패·병렬 호출·진단 충돌·cached result 확인 |
| 공통 helper lint | 통과 |

실패 10건은 baseline 코드를 메모리에서 로드한 재실행에서도 확인했다. 현재 파일을 임시로 되돌리거나 다른 checkout에서 검사하지 않았다.

- company capability loop 2건: Team 접근 조회를 지원하지 않는 DB fixture.
- 기존 업무 안내·Role·priority-review 계약 검사 7건: 현재 안내와 맞지 않는 기대 문구·source pattern, 누락된 migration 참조 등.
- Ops debugger 1건: 기대 상한 48,000자와 이미 사용 중이던 80,000자의 불일치.

HTTP 상태만으로 무실행을 기대하던 source-pattern 검사 1건은 설계가 의도적으로 바꾼 계약이었다. 이를 실제 formatter의 전·후 실행 사실 검증으로 교체해, 실행 전 거절은 무실행이고 실행 후 4xx는 효과 미확인임을 확인했다. 다른 기존 실패를 가리려고 fixture·migration·업무 문구를 바꾸지 않았다.

전체 타입 검사에는 baseline의 25건이 남는다. 최종 검사에서는 작업 중 별도 수정된 UI·번역 파일의 4건을 포함해 총 29건이 관측됐으며 이번 변경 파일에서 추가된 타입 오류는 없었다. 전체 build 성공으로 보고하지 않는다.

## 5 실제 모델과 provider 전달

[company-side 평가 계약](evaluation/company-side-conversational-qa/README.md)의 frozen v20 입력·gold·manifest를 그대로 사용했다. 실제 production model loop와 provider를 호출하되 DB·도구 효과는 합성 adapter이고, production DB·Slack·메일 발송은 차단했다.

Canonical runner는 `scripts/evalCompanyAgentCapabilities.ts --dataset=v20 --run=<new>`다. 이번 run은 `20261014-common-tool-execution-v20-r1`, `r2`, `r3`이며 raw·source snapshot·provider request는 해당 평가의 ignored `runs/`에 owner-only로 보관한다. 수동 의미 검토도 별도 run artifact에 기록한다.

r1·r2에서 팀원 권한 거절 2건은 통과했고 응답 유실 1건은 미통과였다. 실제 다음 provider 요청에서 원래 메시지, `08006`, `effect_status=unknown`을 확인했으며 해당 오류가 `[object Object]`로 축약되지 않았다. 모델은 그 정보가 있어도 재호출하고 접수 실패를 단정했다. 이는 [이전 평가에서도 남아 있던 실패](evaluation/company-side-conversational-qa/reports/2026-10-14-tool-errors.md)다.

r3도 의미 검토 2/3이며 같은 응답 유실 실패가 남았다. 최종 provider capture에서도 원래 메시지·code·효과 미확인 정보의 전달을 확인했다. 오류 전달 성공과 모델 판단의 실패를 같은 결과로 취급하지 않는다. 이 평가만으로 다른 대화나 실제 DB·외부 발송의 안전을 입증하지 않는다.

## 6 기존 대비 부작용과 남은 한계

검사 범위에서 이번 변경으로 추가된 회귀는 발견하지 않았다. 그러나 다음 비용과 한계는 남는다.

- 진단 추가로 token·지연·로그량이 늘 수 있다. 정상 무진단 경로는 그대로이며 회사 본문 예산과 Python의 기존 compact summary 범위를 기준으로 추가 진단을 제한한다.
- 추가 정보로 LLM의 답변과 도구 선택이 달라질 수 있다. 응답 유실의 재호출·확정 실패 설명은 실제로 아직 관측됐다.
- 공유 정보가 늘어나는 만큼 source privacy가 중요하다. credential·request/body·billing 경계는 검증했지만 generic serializer가 모든 다른 사용자 데이터를 알아서 판별하는 것은 아니다.
- 유한한 직렬화·전달 용량 때문에 상세가 생략될 수 있다. 생략을 표시하고 기존 본문을 진단 때문에 버리지 않는다.
- runtime 제어와 완료 후 callback 처리는 의도적으로 교정했다. 이를 정상 실행·cache·기존 권한 검사 변경으로 확대하지 않았다.

배포·push·migration·production restart·실제 사용자 발송은 수행하지 않았다. 실제 마이크·브라우저 UI와 모든 production 도구의 live side effect를 실행한 검증은 아니다.
