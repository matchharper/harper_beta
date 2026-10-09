# 구독 설명과 잔액 부족 안내 검증

문서 기준: 2026-10-07. 로컬 변경 검증이며 배포 완료를 뜻하지 않는다.

## 실제 모델 평가

현재 company-side 기본 모델 `google/gemini-3.8-flash`, OpenRouter/Google Vertex, medium,
temperature 0.5, progressive를 사용했다. DB·Slack·메일 접근은 차단하고 합성 도구만 실행했다.
전체 발화·응답·도구 호출은 ignored run 폴더에서 직접 읽었다. 자체 검토이며 독립 검토는 아니다.

| 실행 | 관찰과 판정 |
| --- | --- |
| `billing-notices-v13-20261007` | 4대화/5발화 실행 완료. 최신 요금 설명과 부족 metadata 분리는 동작했지만, 일반 실행 오류 계약 때문에 부족 후 재시도를 제안하는 UX 문제가 있었다. 이 실행을 최종 통과로 계산하지 않는다. |
| `billing-notices-v13-20261007-r2` | 같은 frozen 4대화/5발화 재실행. 요금 설명 2건은 오래된 예시보다 Free·유료 Agent·Enterprise를 우선하고 회사별 계약을 추측하지 않았다. Intro·수락 오류는 완료를 주장하거나 재시도를 제안하지 않았고, 각 실패에 표시 notice 1개·실행 효과 0을 확인했다. 과업 의미 gate 4/4, critical 0. |
| `billing-notices-v11-regression-20261007` | 기존 frozen 연결 수락·Intro 2대화/4발화. 승인 전 확인과 승인 후 정확한 대상에 대한 실행 효과 각 1건. 정상 결과에 부족 notice 없음. 선택한 2대화의 흐름 검토 통과. 전체 v11 회귀를 뜻하지 않는다. |

부족 원인·잔액을 모델에 넣지 않으므로 모델 답변은 일반 실패 설명이다. 실제 해결 안내는 서버가
웹의 답변 하단과 Slack 메시지의 별도 블록에 붙인다. 같은 요청을 반복해도 해결되지 않는다는
범용 `blocked` 오류 계약으로 재시도 제안을 보완했다. 모델 답변을 정규식으로 고치거나 덮어쓰지 않았다.
원문 검토에서는 일부 답변이 필요 이상으로 길거나 마지막 도움 제안이 반복되는 문체 한계도 관찰했다.

## 코드·화면 표시 검증

- 관련 자동 테스트 83개 통과: 실제 대화 loop의 오류 처리, 재호출/요약/대화 조회 입력에서 표시 metadata 제외,
  정상 요청에 notice 없음, 한국어·영어 오류 문구, Slack 블록 제한과 버튼 보존, 기존 스트리밍·serializer 회귀.
- JSDOM에서 실제 Intro 모달에 입력하고 실패를 발생시켰다. 선택한 언어의 오류 1개, 입력 보존,
  모달 유지, 추가 toast 없음과 채팅 안내의 문의 링크를 확인했다. 화면 스크린샷이나 실제 브라우저 E2E는 아니다.
- 후보자 보드·Pipeline·후보자 상세의 Intro caller에서 중복 오류 toast를 제거했다. 보드·Pipeline의
  수락/종료 모달은 오류 표시를 모달에 맡기고, 모달 없는 작업의 오류 toast는 유지했다.
- 변경 파일 대상 lint 통과. 전체 TypeScript 검사는 기존 생성 파일·평가 private 파일의 import 문제,
  `OfficialJobsExperience`의 `body` 타입과 `TalentDetailSimpleView`의 기존 번역 literal 불일치 때문에 실패한다.
  이번 수정으로 추가된 타입 오류는 최종 검사에 없다. 전체 빌드 통과로 주장하지 않는다.

초기 DOM 테스트는 브라우저 transport 대신 Node BroadcastChannel이 열려 종료되지 않았다.
JSDOM 환경에서 해당 transport를 비활성화해 정리했으며 최종 83개 실행은 정상 종료했다.
최초 단위 테스트는 가짜 Supabase 환경 변수가 없어 시작에 실패했고, 외부 접근이 불가능한 테스트 값으로 수정했다.

## 검증 한계와 운영 범위

실제 Slack에 메시지를 보내거나 운영 DB의 FAQ 예시를 갱신하지 않았고 배포도 하지 않았다.
FAQ 코드 원본과 현재 core를 수정했으며 과거 예시가 남아 있어도 현재 core의 정책을 우선한다.
Slack 재전송은 저장된 메시지/변경안 metadata를 매번 다시 읽도록 구현했고, 안내를 원본 답변에
합쳐 저장하지 않는다. 실제 Slack API 장애·재전송 E2E, 실제 결제와 이번 안내를 묶은 E2E는 이 검증 범위 밖이다.
이전 Stripe Test Clock 검증과 이번 모델·표시 검증을 하나의 성공률로 합산하지 않는다.


## Slot 용어와 확정된 Enterprise 정책 — v16 추가 검증

2026-10-07, 로컬 코드 변경이며 운영 웹앱 배포 결과가 아니다. 운영 DB의 가격 FAQ 3개 본문은 별도로 사용자 승인 범위에서 갱신했다.

- 최초 `2026-10-07-slot-terminology-r1`은 case 필터 구분자를 잘못 지정해 0건 실행으로 종료했다. 유효한 평가로 세지 않는다.
- `2026-10-07-slot-terminology-r2`: frozen v13의 한국어·영어 가격 문의 2건 실행. Slot 용어는 반영됐지만 기존 prompt가 Enterprise를 항상 성공보수 계약으로 설명하는 문제가 남아 있었다. 이 결과를 현 정책 전체 통과로 취급하지 않았다.
- 사용자가 이미 확정한 Free·표준 Slot 성공보수 없음 / 요청한 Enterprise의 별도 비용 모델 가능 조건을 core·FAQ에 반영했다. v13 gold를 덮어쓰지 않고 같은 4대화·5발화의 v16 입력·gold·manifest를 실행 전에 동결했다.
- 최종 `2026-10-07-slot-policy-r1`: 현재 production loop·schema, OpenRouter `google/gemini-3.8-flash`, medium, temperature 0.5. 합성 도구만 사용했으며 source/input hash·모델 원문·metadata는 ignored run에 0600/0700으로 보존했다.

| 대화 | 원문 자체 검토 |
| --- | --- |
| pricing_ko | 슬롯당 Role 1개, Free/표준 슬롯 성공보수 없음, Enterprise 별도 합의 가능을 설명했다. 회사의 현재 계약·구체 가격을 추측하지 않고 확인 경로를 제시했다. |
| pricing_en | 같은 정책·불확실성을 영어로 설명했고, Enterprise 성공보수를 필수로 단정하지 않았다. |
| intro_exhausted | 실제 요청 도구 호출 후 실패를 설명했다. 발송·성공을 주장하지 않았고 billingNotice는 화면용 metadata에만 기록됐다. 실행 효과 0. |
| connect_exhausted | 확인 후 승인된 두 번째 발화에서 수락을 시도했고 실패를 성공으로 바꾸지 않았다. 실패 턴에만 별도 billingNotice, 실행 효과 0. |

실행 4/4대화·5/5발화, 정책·권한·사실성 자체 검토 4/4, critical 0이다. 한국어 가격 답변은 다소 길고 연결 실패 답변의 부가 CTA가 남아 있으므로 문체 전반의 최적화를 주장하지 않는다. 독립 팀원 검토, 실제 Slack/이메일 전달, 결제 E2E, 운영 신뢰도 평가는 아니다. 별도 코드/UI 테스트 33개에서 이전 Stripe tag·설정·API 입력 호환, 역할별 크레딧 표시, LLM 오류와 화면 metadata 분리도 통과했다. 초기 단위 테스트 실행은 환경변수 누락으로 실패했으며, 외부 호출을 하지 않는 합성 키/localhost 설정을 명시한 최종 실행이 33/33이다.
