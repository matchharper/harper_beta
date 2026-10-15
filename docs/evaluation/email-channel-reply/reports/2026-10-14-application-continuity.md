# 이메일 지원 실행 귀속과 승인 후 연속성 수정

2026-10-14. 사용자가 이번 요청에서 실행한 지원을 과거 지원으로 설명하는 문제를 수정하고, 긍정 답장 뒤 같은 질문을 반복하는 문제가 해결됐는지 확인하도록 요청했다. 기존 Haiku e run에서는 아직 해결되지 않았으며 지원이 날짜 확인 질문에서 멈췄다. 운영 배포·운영 DB 변경은 하지 않았다.

## 수정한 사실과 계약

- 기존 browser 상태에 서버가 확인한 시작 요청 메시지 ID를 선택적으로 기록한다. 사용자/model 입력으로 전달받는 필드가 아니다. 이메일의 기존 reply job metadata에는 실제로 시작/처리한 browser run ID를 기록한다. Queue continuation이 끝난 뒤에도 이 연결이 유지된다. 새 테이블이나 판단 상태는 없다.
- LLM context는 현재 답장의 실제 execution run ID, 해당 application run ID/시작 메시지, 실제 선택 파일 ID와 pinned fingerprint를 함께 제공한다. 모델은 이 사실로 현재 완료와 과거 확인을 구분한다. 시각만으로 소속을 추정하지 않는다.
- 동일 ID/파일의 실제 receipt를 다른 버전의 이전 제출로 설명하지 않도록 증거의 의미를 명확히 했다. 과거에 확인한 receipt는 그 제출 사건의 증거이며, 후속 확인 질문에 새 웹 조회가 없다는 이유로 이미 확인한 접수 사실을 불명확하게 만들지 않는다. 회사의 현재 심사/채용 상태는 별개다.
- 프로필 snapshot의 null 날짜는 미기록값으로 생략하고, 기록된 근무 개월 수는 날짜 필드와 분리된 duration summary로 제공한다. 읽을 수 있는 공통 프로필에서도 같은 의미를 표시한다. 원본 데이터는 바꾸지 않는다. 개월 수로 종료일을 새로 계산하거나 명시된 이력서 날짜를 상충값으로 만드는 근거로 쓰지 않는다.
- 공통 resume source 계약은 미기록값/기간 요약과 명시된 날짜·실제 사용자 정정을 구분한다. 이메일 approval 계약은 검토한 수정 승인과 새로운 경험/법적 자격 사실의 답변을 구분한다. 충분한 기존 사실로 가능한 작업은 선택 질문을 ignore로 정리한 뒤 같은 턴에서 저장·지원한다. 실제 필수 미확인 사실이 있으면 그 요구사항만 질문한다.
- 본문은 원본 Career LLM이 전부 작성한다. 승인 키워드, 질문 문구 검출, 응답 재작성/고정 성공 문구, 별도 classifier/writer는 없다. 기존 파일 소유권·버전, 중복 실행·동시성·권한 경계는 유지한다.

## 평가 계약과 범위

동결한 application-continuity-v1은 synthetic 3대화·7턴이며 canonical scripts/evalEmailRuntimeReplies.ts에서 실행한다. 기존 v2/e 입력에 같은 승인 문장을 사용하는 대화에 후속 접수 질문을 추가했고, 다른 자연어 승인과 실제 필수 취업 자격이 미확인인 양식을 추가했다. 후자는 승인 문장이 사실 답변을 대신하지 않는지 확인한다. 입력/gold/manifest는 첫 run 전에 동결했으며 기존 데이터/gold를 바꾸지 않았다. 필수 양식 field는 기존 외부 inspection fixture의 generic fields 속성으로 공급한다. 런타임에 시나리오 분기를 추가하지 않았다.

실제 consumer·Career Haiku 5.5·suggestion writer·도구·문서 SQL 저장·Queue continuation·메일 renderer/capture를 사용했다. JD·양식·사이트 접수만 기존 synthetic 외부 경계다. 실존 사람/회사 데이터와 실제 외부 메일·지원은 없다. 원문 provider 호출/답장은 ignored runs에 owner-only로 저장한다. 전체 대화·저장 문서·실행 귀속을 직접 읽어 판정하며 문구/길이/키워드 자동 점수는 사용하지 않는다.

## 첫 검증과 보완

application-continuity-20261014-a: 긍정 이후 저장·접수 및 현재 요청 완료 귀속은 정상으로 이어졌다. 그러나 프로필의 48개월이라는 숫자로 원본의 종료일 확인을 다시 요청했고, 접수 후에도 반복했다. 이후 확인 질문에는 이미 검증된 receipt의 사건과 새 웹 조회를 혼동해 접수 사실을 분명하게 답하지 못했다. 첫 run을 통과로 보고하지 않고 보존했다.

이 결과를 근거로 기간 요약의 입력 의미와 실제 접수 사건의 evidence 계약을 보완했다. 원본 출력이나 gold를 덮어쓰지 않았다.

## 보완 후 b 결과

- 현재 요청/후속 확인: 초기 검토 → 사용자의 수정·지원 승인 → 저장·접수 1회까지 진행했다. 승인 후 필수 날짜 답변을 다시 요구하지 않았고, 완료를 현재 요청의 실행으로 안내했다. 후속 질문에는 접수 사실과 정확한 제출 파일을 답했다. 새 지원을 시작하거나 다른 버전의 이전 제출을 주장하지 않았다.
- 다른 긍정 표현: 추가 경험을 넣지 말고 보내달라는 자연어 지시로 검토한 수정만 저장·접수 1회까지 진행했다. 선택 경험 질문과 승인 형식을 재요구하지 않았다.
- 필수 미확인 자격: 긍정은 연락처 수정/지원 권한으로 읽고, 미국 취업 자격의 Yes/No는 추론하지 않았다. 실제 요구사항만 물었고 접수 0회다. 가짜 재직 기간 질문은 없었다.
- 요청한 행동 gate는 3대화/7턴에서 통과했다. 사례별 실제 body와 tool/document 상태를 함께 판정했다. 문체나 모든 Haiku 판단이 일반적으로 해결됐다는 뜻은 아니다. 일부 설명은 여전히 길고 보고 형태다.
- 관련 deterministic 회귀 54/54와 변경 파일 ESLint 통과. 전체 TypeScript는 checkout의 다른 경로 진단으로 실패하며 변경 경로 진단은 0이다. 전체 타입 통과로 보고하지 않는다.

## 한계

첫 b 완료 답장에는 미응답 선택 사항이 지원에 지장 없다는 설명이 남았지만, 답변을 다시 요구하거나 실행을 막지는 않았다. 좁은 frozen challenge를 통과한 결과이며 production 신뢰도나 실제 ATS 업로드/접수 검증이 아니다. 미확인 필수 사실을 건너뛰지 않는 안전 경계는 의도적으로 유지한다. 운영 배포는 하지 않았다.

## 완료 기록 조회의 원인 수정과 최종 e

추가 재실행 d에서 현재 요청 완료는 정상으로 안내했으나, 이후 접수 확인 질문에 다시 불분명하게 답했다. 실제 provider 입력을 읽으니 application context가 “No active application in this conversation.”이었다. 기존 RPC의 ID 없는 기본 read는 active만 반환해서, 새 이메일에서 완료 기록의 receipt와 파일이 사라졌다. b의 올바른 후속 답장은 이전 메일의 내용으로만 이어진 것으로, durable evidence 조회 검증까지 충분하지 않았다.

loadEmailApplication은 기존 job의 명시 ID와 active read를 우선하고, 둘 다 없을 때 같은 사용자·대화의 최근 application anchor ID를 읽은 뒤 기존 owner-check RPC로 완료 기록을 조회한다. 읽기만으로 새 작업/제출을 만들지 않는다. 새 이메일의 execution run ID는 비어 있고 과거의 receipt/파일은 남으므로, 현재 실행과 과거 확인을 구분할 실제 증거가 모두 제공된다. 완료 기록의 ID read·owner guard와 이 fallback은 회귀로 확인했다.

필수 질문을 publish한 뒤 본문이 없는 경로에서는 기존 visible-text recovery가 요청된 Haiku 모델을 전달받지 않아 기본 GPT-5.6 Terra를 사용했다. 기존 recovery에 선택 모델을 전달하도록 수정했다. 별도 writer를 만든 것이 아니라 원래 caller의 설정을 기존 completion에도 유지한 것이다. b의 필수 자격 승인 후 답장에는 Terra recovery가 포함돼 있으며 이를 Haiku-only 결과로 주장하지 않는다.

- e는 동일 frozen input의 current-and-later 3턴과 required-fact 2턴을 재실행했다. 모든 실제 provider 요청은 Haiku 5.5였다.
- 같은 승인 문장 뒤 실제 사본 저장·접수 1회, 현재 요청에서 완료한 결과 안내, 이후 질문에 실제 완료 receipt와 정확한 사용 파일 안내를 확인했다. 다른 버전의 과거 지원이나 재지원 제안은 없었다. 날짜/선택 경험 답변을 다시 요구해 작업을 막지 않았다.
- 필수 자격은 승인 표현으로 추정하지 않았고 해당 사실만 다시 물었으며 접수 0회였다. 다만 이 답장은 실제 제출이 시작되지 않았다는 설명보다 불확실성 설명이 길었다. 다른 표현의 approval는 b의 Haiku-only natural-approval 2턴 결과로 확인했다.
- e 5개에서는 provider 원문·저장 본문이 정확히 동일했고, b는 7개 중 6개가 동일했다. b의 Terra recovery 1개는 기존 정규화에서 줄 끝 공백 두 개만 제거됐으며 문장은 바뀌지 않았다. 모든 capture는 실제 저장 본문의 renderer 결과와 정확히 같았다. OpenAI Responses 형식과 Anthropic 형식을 각각 구조적으로 읽어 비교했으며 문구 수정이나 품질 classifier는 없다. 원본 문서 text/revision도 보존됐고, 정확한 제출 파일과 원본 날짜/측정 조건을 확인했다.
- c는 다른 작업 경로 externalRecommendationsV2/prompts.ts가 일시적으로 문법 오류인 시점에 import가 실패해 모델 대화가 실행되지 않았다. 해당 소스를 변경하지 않았고 오류가 사라진 뒤 d/e를 새 run으로 실행했다. c/fatal.json을 보존한다.
- 매 실행의 fixture를 exact-ID로 정리했고 완료한 모든 사례의 잔여 talent/role은 0이다.

범위는 사용자가 요청한 승인 연속성·현재/과거 완료 귀속·필수 unknown 안전 경계다. 완료 답장에서 선택 사항을 다시 설명하거나 수정 수를 부정확하게 세는 등 다른 작성 품질은 모두 해결됐다고 주장하지 않는다. 운영 배포·운영 DB migration은 없다.

최종 코드의 관련 회귀는 61/61 통과했다. 완료 기록 조회·owner-checked ID read와 선택 모델의 기존 recovery 전달도 포함한다. 변경 파일 ESLint 및 diff whitespace 검사 통과, 전체 TypeScript는 다른 경로 오류가 남고 변경 경로 오류는 없다.
