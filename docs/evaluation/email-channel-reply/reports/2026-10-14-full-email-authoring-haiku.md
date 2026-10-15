# 이메일 본문 전체 LLM 작성 및 Haiku 재검증

2026-10-14. 사용자가 응답의 코드 뒤붙임뿐 아니라 원문 치환도 모두 제거하고 Haiku 5.5로 다시 테스트하도록 요청했다. 운영 배포와 운영 DB 변경은 하지 않았다.

## 작성 책임

- 이메일 응답 모델은 `email/runtime/model.ts`의 `claude-haiku-5-5`다. 이메일 지원 제안 생성도 기존 shared executor에 같은 모델을 전달한다. 웹 Career의 기본 모델은 별도다.
- `emailApplicationPassages`, passage ref 치환/필수 ref 검사와 review 전달 fingerprint를 삭제했다. 별도 review audit metadata를 쓰지 않는다. 과거 발송 이력 자체는 보존한다.
- Career LLM 응답은 `persistReplyMessage`에 그대로 저장되고 `renderReplyEmail(assistant.content)`으로 전달된다. 코드로 검토 내용이나 Career 링크를 붙이지 않는다. 공유 chat turn에서도 이메일 adapter에는 웹 공고 fallback 링크/진행 marker를 추가하지 않는다.
- 수정 전후 원문·작성물·질문·실제 지원 선택지는 기존 pending batch와 application context로 제공한다. LLM이 인용, 이유, 질문, 링크, 순서와 맺음을 모두 직접 쓴다. Markdown/HTML 렌더링과 구조적 control payload 제거, 소유권·동시성·권한·멱등 전달 경계는 유지한다.
- 이상적 이메일 예시의 placeholder를 실제 예시 문장으로 바꿨다. 예시 문구·회사·순서는 런타임 규칙이 아니다.

## 실모델 테스트에서 보완한 context

1. a run에서 문서가 있어도 legacy 프로필의 Resume status=(none)을 보고 이력서가 없다고 답한 사례가 나왔다. 이메일 prompt에는 이를 프로필 metadata로 명확하게 구분하고, 실제 파일 유무는 일반 문서 조회로 확인하도록 했다.
2. b run에서 useful changes가 없어 원본을 재사용했지만 추출 텍스트만 있고 원본 파일이 없는 fixture에서 upload 준비가 실패했다. sourceDocument에 fileName/mimeType, 업로드 파일 유무와 PDF export 가능 여부를 제공하고, 형식 준비와 새로운 내용 작성의 권한을 구분했다. 새 도구·상태·테이블·문구 후처리는 추가하지 않았다.
3. c run에서 지원 실행은 성공했으나 최종 LLM이 이번 접수를 과거 지원으로 오해해 다른 파일 버전과 재지원을 언급했다. current reply 시작 시각과 문서/browser 시각·제출 documentId를 함께 전달하도록 했다. 시간과 identifier는 실제 durable 사실이며 의미 판단은 LLM이 한다.
4. 파일 형식 변환에도 측정 조건·기간·업무 귀속·자격의 범위를 유지하도록 작성 계약을 명확하게 했다.

## 실행과 검증

동결한 application-v2와 application-question-v1을 그대로 사용했다. 모델/프롬프트 변경은 새 run이며 gold나 사례를 덮어쓰지 않았다. 실제 consumer, Career LLM, suggestion writer, SQL, 문서 저장과 발송 capture를 사용했고 JD/양식/사이트 접수는 기존 합성 경계다. 실존 지원자·외부 회사·실제 메일 발송은 없다. 원문은 ignored runs에 owner-only로 보관한다.

- a/b/c는 각각 3대화·5답장의 실제 중간 검증이다. 실패와 품질 문제를 보존했다.
- application-haiku-full-author-question-20261014-a는 3턴이다. 중간 질문을 승인으로 처리하지 않고 이후 명시 승인에만 지원했다. 시간 context 보완 전 run이며 마지막 버전과 혼동하지 않는다.
- application-haiku-full-author-20261014-d는 3대화·5답장이다. MIME field의 타입 오류 수정 뒤 application-haiku-full-author-20261014-e에서 assisted 2턴을 추가 확인했다. 전자는 MIME field가 생략된 run이지만 두 run 모두 파일 유무와 PDF export 사실을 제공한다.
- 관련 회귀 41/41과 변경 파일 ESLint 통과. 전체 TypeScript 검사에는 현재 checkout의 다른 경로 오류가 있어 전체 통과로 보고하지 않는다.

## 판단 범위

본문 전체를 모델이 작성하는 구조와 자연어 작성 품질은 별개의 검증이다. 코드가 더 이상 문장을 조립하지 않는다는 이유만으로 작성 품질 gate가 통과했다고 판단하지 않는다. 실제 접수는 합성 evidence이며 PDF의 실제 외부 사이트 업로드, 운영 queue/메일 클라이언트 호환성을 입증하지 않는다.

## 실제 결과와 남은 작성 품질

- d run의 5개 답장과 중간 질문 run의 3개 답장을 모델 provider 원문·저장 본문·발송 capture와 대조했다. 8/8에서 모델 원문과 저장 본문이 동일하고, capture도 그 본문의 Markdown 렌더 결과와 정확히 같았다. 응답 뒤붙임과 passage 치환은 없다. 비교 결과/본문 hash는 각 run의 authoring-integrity.json에 보관한다.
- d의 대화/제안 요청은 모두 Haiku 5.5이며 fallback 모델 호출이 없다. 모든 발화마다 capture 1통, 작업 상태 sent다.
- assisted는 승인한 사본으로 합성 접수 1회, manual/no-resume은 접수 0회다. 원본 문서의 텍스트·revision은 보존됐고, 실제 저장된 사본의 기간과 합성 테스트라는 성과 측정 조건을 확인했다. fixture talent/role 잔여 행은 모두 0이다.
- 중간 질문 run에서는 설명 질문에 접수/문서 수정을 하지 않았으며, 후속 명시 승인에만 저장·합성 접수했다. 답장을 강제하기 위한 키워드나 의미 분류 코드가 없다.
- 시각 context를 보완한 d의 assisted 완료 답장은 이번 요청에서 수정본으로 접수한 결과를 올바르게 안내했다. c의 과거/현재 접수 혼동은 성공으로 보고하지 않는다.
- 전체 TypeScript의 마지막 검사에는 다른 경로 진단 24개가 남아 있다. 이번 변경 경로 진단은 0이며 전체 타입 검사가 통과한 것은 아니다.

작성 품질 gate는 완전 통과가 아니다. Haiku는 완료 답장에서 optional 경험 질문을 다시 권하거나, manual 검토에서 이미 이력서에 명시된 종료일을 프로필의 빈 값 때문에 다시 묻기도 했다. 이력서가 없는 답장도 단순한 파일 선택보다 경력·절차 설명이 많다. 전후 문구·링크·결과는 읽을 수 있지만 모든 메일이 이상적인 말투/정보 선택에 도달했다고 주장하지 않는다. 이런 문제를 코드 문구 치환으로 가리지 않는다.

## 최종 smoke e: 판단 gate NO-GO

e에서도 모델 원문 → 저장 본문 → 발송 capture의 일치는 2/2다. 모든 provider 요청은 Haiku 5.5, 각 발화의 작업은 sent/capture 1통이며 fixture 잔여 행은 0이다. 원본도 바뀌지 않았다.

그러나 지원 실행은 0회다. 모델은 프로필의 endDate=null과 텍스트의 “end date not recorded”를 현재 재직이라는 사실로 잘못 해석했다. 이력서에는 종료일이 명시되어 있는데 이를 상충 사실이라고 질문했고, 후속 승인도 그 잘못된 확인 질문에서 멈췄다. suggestion 입력과 Career 입력 양쪽을 실제 provider 기록으로 확인했다. 원본의 날짜는 available evidence이고 null은 누락 값이다. 이를 문자열 후처리로 수정하거나 성공 답변으로 대체하지 않았다.

따라서 이 작업은 전체 본문 LLM 작성 구조와 Haiku 설정/실제 재검증을 완료했으나, Haiku의 사실 판단·대화 작성 release gate는 NO-GO다. d의 정상 동작이나 41개 deterministic 검사가 이 실패를 상쇄하지 않는다. 추가 품질 작업은 제공 evidence의 누락 값 의미와 prompt의 책임 원본에서 해결해야 하며, 모델 응답을 코드로 재작성하는 방식으로 돌아가지 않는다. 운영에 배포하지 않았다.
