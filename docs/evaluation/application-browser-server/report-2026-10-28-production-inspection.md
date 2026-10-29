# 운영 지원서 확인 오류의 로컬 재실행 — 2026-10-28

운영에서 숫자 전용 `fieldRefs` 검사로 실패한 실제 공고 3개를 해당 검사를 제거한 로컬 `inspectApplicationForm`으로 각각 한 번 실행했다. 호출자는 로컬이며 실제 모델·실행기는 OpenAI, 실제 Chromium은 Browserbase에서 실행했다. 모의 응답이 아니다. 한국 시간 18:06–18:07에 브라우저가 실행되었다.

| 공고 · 운영 message ID | 이번 반환 결과 | 소요 시간 |
|---|---|---:|
| Halter Senior Engineering Manager · 440305 | `read`, 입력 요소 51개. Resume·Cover letter 업로드, 이름·이메일·전화·지원 질문 등을 반환. 지원 화면 접근 가능(`supported`). | 97.991초 |
| SpaceX Sourcing Manager, Electronics (Starlink) · 440223 | `read`, 입력 요소 46개. 이름·이메일·첨부·경력/자격 질문 등을 반환. 지원 화면 접근 가능(`supported`). | 84.894초 |
| Goldman Sachs Korea Advisory Analyst/Associate · 438047 | `partial`, Email Address와 약관 동의 checkbox 2개. 이메일 입력과 동의가 필요한 다음 단계는 진행하지 않아 `unsupported`. | 92.475초 |

세 실행 모두 `report_application_form`이 숫자가 아닌 UUID와 콜론을 포함하는 참조를 반환했고, 서버 변환이 정상 완료되었다. 예를 들어 Goldman Sachs는 `b4017448-5630-49d0-a9d0-f246a3127ef4:4`와 `:6`을 반환했다. 과거에는 이 참조가 숫자 전용 정규식에 걸려 읽은 입력칸 전체를 사용할 수 없었다. 이번에는 관측한 두 입력칸과 실제 접근 제한이 보존되었다.

`supported`는 지원 화면에 접근했다는 결과이며 제출 완료를 의미하지 않는다. 입력 요소 수에는 선택지별 radio/checkbox와 복합 입력 요소가 포함되므로 질문 수와 같지 않다. 개인정보 입력·파일 첨부·약관 동의·지원 제출은 하지 않았다. 조건부 질문의 전체 범위, 이력서 생성 및 실제 제출 경로는 이번 실행으로 검증되지 않았다. 세 실행에서 환경변수 누락 오류는 없었다.

## 별도로 재현된 미해결 오류

1. **분석 실패 후 지원서 확인 대기에서 회복하지 못함.** 운영 Bind CX Operation Manager 기록 438680은 `analysisStatus=failed`, `applicationInspection.status=queued`였다. 로컬의 실제 `needsApplicationInspection`에 같은 상태를 넣으면 `false`, 분석 완료 상태로만 바꾸면 `true`다. 웹 지원의 분석 완료 조건 때문에 확인을 시작하지 못한다. `awaitApplicationInspection`은 여전히 pending인 작업을 기다리다가 약 250초 후 예외를 낸다. 운영에서 사용자의 재시도 요청 뒤 약 250초씩 실패했던 결과와 일치한다. 최초 분석의 AbortError 원인은 이 재현으로 확정하지 않았으며, 250초 대기 전체를 다시 실행한 것은 아니다. 위치: `src/lib/career/simulation/applicationInspection.ts`의 `needsApplicationInspection`, `awaitApplicationInspection`.
2. **프로토콜 없는 이력서 링크가 생성 전체를 중단함.** 실제 `parseResumeInput`에 합성 이력서와 `www.linkedin.com/in/example`을 전달하면 `TypeError: Invalid URL`, 같은 입력을 `https://www.linkedin.com/in/example`로 바꾸면 통과한다. `src/lib/resumes/schema.ts`의 `checkUrl`이 `new URL(url)`을 호출하는 지점이다. 운영에서 확인한 프로토콜 없는 LinkedIn 링크 오류를 개인정보 없이 재현했다. 문서 저장·PDF 생성까지 실행한 시험은 아니다.

위 두 문제는 이번 입력칸 참조 제한 제거로 수정되지 않았다. 이 결과는 전체 서비스에 다른 오류가 없다는 보장이 아니다.

## 재현 자료와 실행 정리

등록된 runner와 계약은 [README](README.md#production-inspection-failure-diagnostic--2026-10-28)를 따른다. `production-inspection-failures-20261028-v1` 그룹의 ignored, owner-only `runs/`에 각 실행의 manifest, result, latest snapshot/report, resource, cleanup, browser-usage 및 별도 cleanup 조회 결과를 보존했다. 합성 입력 재현은 `local-error-reproduction.json`에 저장했다.

- Halter: `inspection-95a96abf-4ef1-4f02-bf68-722e87ab7e2e`
- SpaceX: `inspection-02b66d95-fbb8-4b20-ba77-75104b45d31d`
- Goldman Sachs: `inspection-636c048c-230b-4002-93bb-e70b08aaa6fe`

실행 시작 manifest 세 개는 같은 source hashes를 기록했다. 이후 별도 로컬 작업으로 worker 파일 hash가 바뀌었으므로 이 결과를 그 이후 파일 전체의 검증으로 해석하지 않는다. 시작 시 worker SHA-256은 `053309e3a40b39b4a80ecf6e30d2fa1e78b1a24677fd775fd7c6daad16da74a1`이다.

Browserbase 세 세션은 모두 `COMPLETED`를 확인했다. 별도 읽기 조회에서도 세 OpenAI session과 세 environment 모두 HTTP 404로 삭제를 확인했다. 운영 지원 기록 변경, 사용자 메시지, 실제 지원 제출, 배포는 하지 않았다.
