# 후보자 연락 초안의 기존 메일 예시 복원

2026-09-28. 로컬 코드 및 모델 출력 검증이며 배포·외부 발송 검증은 아니다.

## 변경과 원문 출처

삭제된 `src/lib/companyTalentRequests/candidateContactWriting.ts`의
[`5b115ab57f60066f7d02c67af9109b45d85b5d87` 원문](https://github.com/matchharper/harper_beta/blob/5b115ab57f60066f7d02c67af9109b45d85b5d87/src/lib/companyTalentRequests/candidateContactWriting.ts)에서
한국어·영어 각각의 근무 조건 질문과 이력서 요청 예시를 그대로 가져왔다.
삭제 직전 `27c1cbac^` 버전과도 이 파일의 차이가 없다.
새 예시를 만들거나 기존 문장을 수정하지 않았다. 예전 파일의 키워드 분류나 고정 fallback은 복원하지 않았다.

현재 작성 책임 원본인 `src/lib/companyTalentRequests/copyPrompt.ts`에 넣어
`create_draft`와 `revise_draft`가 같은 예시를 사용한다. 간단한 연락 목적도 인사, 배경,
요청, 답변 안내, Harper 서명이 이어지는 발송 가능한 메일로 완성하도록 지침을 보완했다.
원문 전달·짧은 답장·부분 수정 지시는 우선한다. 예시의 소개 완료·수락·긍정적 검토는
현재 후보자의 사실로 간주하지 않고, 제공된 근거가 있을 때만 쓴다.

| 원문 상수 | SHA-256 |
| --- | --- |
| `CANDIDATE_CONTACT_STYLE_EXAMPLES_KO` | `c5ad969cd95e05d3d783725e5cdc5ad8031a7775d88b90aa8bbd0fdefa5f7b16` |
| `CANDIDATE_CONTACT_STYLE_EXAMPLES_EN` | `c7c816bdc9568b5deaab0fecfb2947d849a7cc946a25a588b6ac07e8bd58776c` |

## 재현과 실행 범위

기존 동결 v8 입력·gold는 변경하지 않았다. canonical runner의 선택 실행이다.

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json scripts/evalCompanyAgentCapabilities.ts \
  --dataset=v8 --copy=real \
  --case=CSCQ806-approve,CSCQ806-english_narrow,CSCQ803-unique \
  --run=<새-run-id>
```

- run: `20260928-historical-contact-examples-r1`, 3대화·7발화 실행 완료, 호출 오류 0.
- 대화 모델: OpenRouter `google/gemini-3.8-flash`, medium, temperature 0.5, progressive.
- 실제 보조 writer: Anthropic `claude-sonnet-5`, temperature 0.2, 5회. fallback 호출 없음.
- source: `bd5c847a25e836c49d9f7ca7bfee4c977e4ad4e6`의 dirty 작업 트리.
  source fingerprint: `efb5b5f1a9844d07ee819f3a5a702b475a7fe77ee3ca227329afd64e847af9f8`.
- 합성 회사·후보자와 in-memory adapter를 사용했다. DB·메일·Slack 네트워크는 차단했다.
- 전체 원문, source snapshot, provider 요청·응답은 ignored `runs/<run>/`의 0700/0600 파일에 있다.
  Anthropic 실제 요청 5회 모두에 두 언어의 원문 예시가 온전히 포함됐다.

## 원문 검토 결과

| 단위 | 이메일 작성·수정 결과 | 동결 대화 gate |
| --- | --- | --- |
| CSCQ803-unique | 인사·회사/역할·요청 배경·파일 형식·첨부/링크·프로필 등록과 회사 전달·선택권·서명 확인. 요청하지 않은 소개 완료/긍정적 평가를 추가하지 않음 | 불일치. 기존 gold는 강제 draft를 실패로 정의하지만 현재 agent는 첫 연락 검토 정책에 따라 draft를 생성함. 본문 검증과 별개로 기록 |
| CSCQ806-approve | 자연스러운 메일 구성과 답변 안내 확인. 다음 주→이번 주 수정 외 본문 보존. 승인 후 최신 revision 2 본문 그대로 1건 예약 | 통과, 3발화 |
| CSCQ806-english_narrow | 제공된 영문과 조건 보존, 최초 생성에서 문단 구분만 추가. 수정에서는 Alex→Chris만 변경. 승인 후 최신 본문 그대로 1건 즉시 예약 | 통과, 3발화 |

작성/수정된 메일 5건은 전체 본문과 실제 tool 저장 결과를 읽어 목적·조건·문체·부분 수정 보존을 확인했다.
회사에 초안 확인을 요청하는 설명은 다소 반복적이어서 사용성 관찰로 남긴다.
이 변경은 보조 writer의 예시와 문체에 한정하며, 첫 연락에서 draft/send를 고르는 상위 정책은 바꾸지 않았다.
따라서 기존 gold와의 불일치 1건을 숨기거나 전체 3대화 gate 통과로 계산하지 않는다.

구조 회귀는 `copy.test.ts`, `directMessage.test.ts`, `relayContract.test.ts`의 18/18 통과다.
원문 SHA-256 일치와 작성·수정 양쪽 prompt 포함을 검사한다. 말투나 생성 품질을 문자열 검사로 채점하지 않는다.

## 한계

Codex 자체 원문 검토이며 독립 팀원의 blind review는 아니다. 전체 v8 회귀, 운영 품질 평균,
실제 DB 저장·이메일/Slack 왕복·직접 send의 메일 품질을 이번 실행으로 보장하지 않는다.
영문은 회사가 직접 제공한 본문 보존을 확인한 것이며, 영어 수신자용 자유 작성 평가는 별도다.
