# 이메일 지원 검토 메일 작성 구조 수정

2026-10-14. 사용자가 기존 검토 메일의 기계적인 말투, 불필요한 수행 보고, 반복과 이해하기 어려운 구성을 지적했다. 이전의 실행 성공 확인은 작성 품질 검증으로 충분하지 않았다. 기존 결과는 보존하고 작성 기준을 강화한 frozen `application-v2`로 재실행했다. 운영 배포·운영 DB 변경은 하지 않았다.

## 기존 작성 경로와 원인

1. `simulation/server.ts`가 자료를 읽고 공통 `suggestionWriter.ts`를 호출한다. 제안 LLM은 웹 카드에도 사용하는 title/reason/change/question/material 구조를 반환한다.
2. `email/runtime/reply.ts`의 Career LLM이 공통 Career prompt, 준비 prompt와 이메일 contract를 읽고 앞부분을 쓴다.
3. 기존 `emailApplicationReview`는 title, reason, 수정 위치/전후 문장, 작성물, 선택지를 순서대로 텍스트로 조립했다. reply는 LLM 본문 뒤에 이 결과를 붙였다.

제안 prompt는 각 항목의 검토 제목·이유를 요구했고 이메일 prompt는 “The server appends the exact pending review text; do not duplicate that appendix in your prose.”라고 지시했다. 글 전체의 책임이 나뉘어 카드 제목·이유가 그대로 이어졌고, 앞부분의 요약과 뒤의 항목이 반복됐다. 사실 검증·원본 보존 같은 수행 지침도 사용자에게 설명할 내용과 섞였다.

## 변경한 책임

- 기존 Career LLM이 메일 전체의 설명, 질문, 순서, 라벨과 맺음을 작성한다. 별도 메일 writer를 만들지 않는다.
- title/reason/question을 코드로 조립해 붙이는 경로를 제거했다. 제안용 구조는 공통 업무 데이터로 유지한다.
- 코드는 승인 대상의 수정 전후 문장·작성물 원문과 보류 제출 검토만 보존한다. LLM이 현재 passage ref를 원하는 위치에 넣고 renderer가 정확한 인용 내용만 삽입한다. 설명이나 말투는 덧붙이지 않는다.
- ref 검사는 현재 identifier와 첫 검토의 필수 literal content 존재만 검증한다. 출력 단어, 말투, 문장 수, 자연어 동의를 판정하거나 바꾸지 않는다.
- 같은 내용이 실제로 전달됐는지는 기존 발송 audit의 activity/batch/content fingerprint로 확인한다. 확인된 과거 검토는 후속 질문에 필요한 인용만 사용할 수 있다. 새 persistence table이나 대화 분류 상태는 없다.
- 저장 완료 후 context에서 과거 무시한 제안과 응답 원장을 다시 주입하지 않는다. 현재 저장 문서와 승인한 변경이 기본 context다.
- 이메일 contract를 실행 책임과 작성 책임으로 구분하고, 검토·직접 지원 안내·이력서 없음·지원 완료의 사람이 직접 쓴 이상적인 예시 네 개를 추가했다. 예시는 말투와 정보 선택을 보여주며 회사명, 문구, 순서, 항목 수를 runtime 규칙으로 만들지 않는다.
- 공통 프로필 context에서 빈 종료일을 Present로 단정하던 처리를 제거했다. 누락 값을 누락으로 전달해 이력서와의 가짜 충돌이나 근거 없는 재직 판단을 줄인다. 저장 데이터는 변경하지 않았다.

## 실제 모델 재실행

메인 대화와 제안 모델은 기본 Sonnet 5.5이며 실제 provider를 사용했다. 메일/DB/도구/이력서 저장 경로는 실제 코드, JD·양식·접수는 기존 합성 경계다. 원문과 모델 요청/응답은 ignored owner-only runs에 있다.

- `application-writing-20261014-a`부터 d까지 초기 개선과 남은 반복/정보 문제를 검토했다. 이력서·프로필 종료일 표현의 불일치가 이 과정에서 드러났다. 실패·불완전한 출력을 삭제하거나 gold에 맞게 덮어쓰지 않았다.
- 종료일 context 수정 후 e는 assisted 2턴, f는 manual 2턴과 no-resume 1턴이다. 총 5개 실제 답장이 발송 capture에 저장됐다. 모델이 쓴 설명 안에 수정 원문이 들어가며 코드 제목/이유의 별도 뒤붙임은 없다.
- `application-writing-question-20261014-a`는 검토 → 개념 설명 질문 → 승인의 3턴이다. 질문을 승인으로 처리하지 않았고, 중간 답장에서 전체 수정 검토를 다시 붙이지 않았다. 이후 승인된 사본으로 합성 접수 1회까지 이어졌다. 이 run은 마지막 종료일 context 수정 전이며 전체 pipeline 증거와 분리해서 해석한다.
- e/f의 원본 revision/텍스트 보존, 제출 대상 사본 ID, assisted 접수 1회/manual·no-resume 0회, 매 발화 capture 1통, HTML 본문·절대 링크·ref 미노출과 fixture 정리를 확인했다. 잔여 talent/role 행은 0이다.
- 공통 suggestion writer의 frozen v1 3사례도 `application-suggestions/runs/2026-10-14T03-13-57-198Z`에서 실모델로 재실행했다. 구조 3/3이며 필수 링크, 관측 작성물, 미확인 ML 경험, 민감한 선택 항목 경계를 원문으로 검토했다.
- 관련 88개 회귀 테스트와 변경 파일 ESLint 통과. 전체 TypeScript는 현재 checkout의 org signup/server, coaching, matching 등의 다른 경로 오류로 실패하며 이번 변경 경로의 오류는 없다. 전체 타입 통과로 보고하지 않는다.

## 품질 판단과 남은 한계

코드가 조립하던 카드 설명과 반복 review appendix를 제거한 것은 실제 출력으로 확인했다. 원문의 수정 전후를 구분할 수 있고 이유·질문을 대화 문장 안에서 이해할 수 있다. 하지만 예시 추가만으로 모든 출력이 이상적이 된 것은 아니다. 완료 답장에서 답하지 않은 선택 질문을 보고하거나, 이력서가 없는 답장에서 프로필 정보를 나열하고 예시 답장 문구를 제시하는 출력이 여전히 있었다. 작은 challenge의 작성 개선 확인이며 모든 말투가 통과했다거나 작성 품질 gate가 완전히 해결됐다고 주장하지 않는다.

합성 이력서의 테스트 성과 표현을 간소화한 제안도 있어 실제 성과의 측정 범위·조건을 약화하지 않는지 더 넓은 자료로 확인해야 한다. 이를 문자열 후처리로 덮어쓰지 않는다. 실제 browser PDF bytes 업로드·외부 접수, 운영 queue/메일 클라이언트는 검증 범위 밖이다.
