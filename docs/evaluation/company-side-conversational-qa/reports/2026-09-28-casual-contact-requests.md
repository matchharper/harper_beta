# 가벼운 회사 연락 요청 5건 검증

2026-09-28. 현재 로컬 코드·실제 company-side LLM으로 독립 요청 5건을 각 한 번 실행했다.
`create_draft` 4건, `send` 1건이었다. 실행 오류 0, 의미·사실성 검토 4/5이며 전체 내용 gate는 미통과다.
도구 선택을 강제하거나 결과를 보고 prompt·입력·gold를 바꾸지 않았다.

## 실행과 재현

- frozen input/gold: `cases-v12.json`, `gold-v12.md`, `manifest-v12.json`.
- run: `20260928-casual-contact-requests-r1`.
- canonical runner: `scripts/evalCompanyAgentCapabilities.ts --dataset=v12 --copy=real --run=<새 ID>`.
- 대화 모델: `google/gemini-3.8-flash`, OpenRouter, medium, temperature 0.5, progressive.
- 실제 초안 writer: `claude-sonnet-5`, Anthropic, temperature 0.2, 4회. 직접 `send`의 본문은
  대화 모델이 작성한 그대로이며 보조 writer를 호출하지 않았다. fallback 호출 없음.
- source revision: `bd5c847a25e836c49d9f7ca7bfee4c977e4ad4e6` dirty tree.
  source fingerprint: `efb5b5f1a9844d07ee819f3a5a702b475a7fe77ee3ca227329afd64e847af9f8`.
- 첫 연락 3건, 이미 면접 안내를 한 후보의 불참 사유 문의 1건, 기존 자료 요청 후속 1건.
  과거 연락은 실행 기준 5일 전으로 동결했다. 인명은 합성 별칭이며 실제 인터뷰 이력이 아니다.
- 실제 loop·schema·serializer·writer를 사용하되 읽기/저장은 합성 adapter다. 실제 DB·메일·Slack에
  접근하지 않았다. chat/slack source는 입력 조건이며 실제 UI/transport 검증은 아니다.
- raw trace, provider 요청/응답, 원문 메일, source snapshot은 ignored run 폴더의 0700/0600 artifact에 있다.
  `emails-and-actions.md`는 실제 output에서 기계적으로 추출한 보기용 원문이며 `manual-review.json`에 판정을 남겼다.

## 전체 원문 검토

| 단위 | 실제 호출 | 결과와 판단 |
| --- | --- | --- |
| phone_first | read_talent → contact_talent(create_draft) | 요청 대상·휴대전화 문의·공유 선택권 유지. 의미 통과. 본문에 현재 연결 대기 상태를 언급해 운영 용어가 드러나는 문체 경고 |
| resume_first | read_talent → contact_talent(create_draft) | 회사/역할·최신 이력서·첨부/업로드·형식·프로필 반영·이번 역할 검토 전달·선택권 포함. 통과 |
| interview_absence | read_talent → contact_talent(create_draft) | 제공된 면접 일자와 불참 사유만 배려 있게 질문. 이유 추정·사과/증빙 요구·재예약/단계 변경 없음. 통과 |
| onsite_first | read_talent → contact_talent(create_draft) | 주 3일·서울 사무실 조건은 유지. 하지만 회사 지시나 tool 인자에 없던 다음 단계 진행을 연락 배경으로 추가해 사실성 실패 |
| portfolio_followup | list_contacts → contact_talent(send) | 과거 연락 확인 후 자료를 줄 수 있는 대략적 일정만 짧게 문의. 기한·불이익·새 약속 없음. 본문 그대로 전달 adapter에 저장. 통과 |

`onsite_first`의 문제는 실제로 채용 단계를 변경한 것이 아니라, writer가 근거 없는 진행 배경을
메일에 덧붙인 것이다. 바깥 LLM의 `requestContext`는 출근 가능 여부만 담고 있었다.
따라서 tool 선택·실행 성공과 별개로 본문 품질 실패로 기록한다. 후보자 정보를 새로 공개하거나
미승인 연락/상태 변경을 실행한 건은 없다. 회사용 초안 확인 안내는 전반적으로 다소 반복적이다.

이 요청은 현재 동작 관찰이므로 생성된 문구를 교정해 결과로 제시하거나 production prompt를 추가 수정하지 않았다.
이후 개선은 같은 frozen v12의 새 run으로 비교해야 한다. 최초 5건 중 마음에 드는 결과만 고르는 재실행은 없었다.
모델 호출 전 파일 작성 명령의 인코딩 오류로 fixture 생성이 한 번 실패했으나, fixture/manifest를
정상 생성하고 hash 동결을 마친 뒤에만 모델 실행을 시작했다. 이는 위 5건의 모델 실패나 재시도가 아니다.

## 해석 한계

각 요청당 1회이며 독립 팀원 검토 전의 Codex 자체 원문 검토다. 전체 연락에서 항상 같은 action을
선택한다거나 production 평균 품질을 보장하지 않는다. 실제 executor의 권한, DB 저장,
수신자 메일함·Slack 왕복은 검증하지 않았다. 운영 배포·실제 발송은 하지 않았다.
