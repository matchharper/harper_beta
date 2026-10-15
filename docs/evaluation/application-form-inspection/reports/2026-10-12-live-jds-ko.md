# 실제 JD의 지원 폼 조회 검증

2026-10-12 기존 local main에서 실제 공개 공고 3개를 검증했다. 사용자 정보·이력서·답변은 제공하지 않았으며 입력·첨부·동의·제출·로그인은 하지 않았다. push·배포도 하지 않았다. 각 실행의 실제 prompt·source hash와 원본 결과는 owner-only ignored run에 있다.

## 결과

| 시작 공고 | 도착한 폼/조회 경로 | 반환한 입력·질문 | 소요 시간 |
| --- | --- | --- | --- |
| [Channel ML 공고](https://channel.io/kr/careers/04d1bd56-f75b-4dc1-ad61-c538274bdccf) | 관찰된 지원하기 링크를 따라 [Lever 폼](https://jobs.lever.co/zoyi/04d1bd56-f75b-4dc1-ad61-c538274bdccf/apply) 조회 | 26개 입력, 실제 보이는 native control 26개와 일치 | 99.2초 |
| [Anthropic Business Technology 공고](https://job-boards.greenhouse.io/anthropic/jobs/5400153008) | Greenhouse 폼을 공통 OpenAI 브라우저 + Luna low로 조회 | 22개 입력. 숨은 mirror input 제외 | 122.4초 |
| [WorkOS Enterprise 공고](https://jobs.ashbyhq.com/workos/d76843a8-2a45-444a-b187-3336b45a7934) | Ashby의 공개 application schema 조회 | 11개 질문. 독립적으로 확인한 공개 UI의 질문 목록과 일치 | 약 0.5초 |

두 브라우저 실행 모두 환경 준비·모델 판단·읽기·정리를 포함해 3분 이내였다. 실행기 모델 turn은 0건이며 조회 planner만 Luna를 사용했다. 모델 세션/브라우저 세션/환경 삭제는 404로 확인했다. Ashby 경로는 브라우저와 모델을 만들지 않는다. 임시 암호화 결과는 기존 private Storage 전송 경로에서 읽은 뒤 정리하며 후보자·공고·문서·메시지 행이나 설정·스키마를 수정하지 않는다.

## Channel에서 확인한 목록

선택지를 질문 하나로 묶어 읽으면 14개 항목이다. 지원 경로의 13개 체크박스를 각각 세므로 원본 입력 수는 26개다.

| 묶음 | 입력·질문 |
| --- | --- |
| 기본 정보·이력서 | 이력서, 이름, 이메일, 전화번호, 현재 위치, 현재 회사 |
| 링크 | 포트폴리오, GitHub, 블로그, Notion |
| 지원 경로 | 지원 경로 질문과 13개 선택지, 기타 경로 설명, 사내 추천인의 닉네임 |
| 동의 | 향후 채용 기회에 관한 연락 동의 |

기타 경로와 추천인 textarea는 HTML label 연결이 없어 처음에는 내부 입력 이름으로만 식별됐다. 현재는 해당 입력 주변의 실제 DOM 질문 텍스트를 보존한다. 체크박스 선택지에도 원본 그룹 질문과 선택지 문맥을 함께 전달한다. 실행 결과에 지원 경로 질문·포트폴리오 및 각 링크·두 서술형 질문이 들어 있는지도 확인했다. 특정 회사명이나 공고 ID로 동작을 나누지 않는다.

## 발견한 문제와 수정

초기 구현은 조회 자체는 가능했으나 준비 문항만 선택했다. 실제 Greenhouse 폼에서는 22개 질문 중 서술형 준비 문항 2개만 반환했고, Ashby도 기본 정보·선택 질문을 제외했다. Channel의 첫 시도는 Lever까지 도착했지만 검증된 보고 함수 없이 종료돼 unavailable로 남겼다. 이 실패들을 성공으로 계산하지 않았다.

현재 조회는 기본 정보·파일·링크·서술형·사실 질문·선택지·동의를 포함한 전체 공개 입력 목록을 보존한다. 무엇이 지원 준비 항목인지는 기존 후속 분석이 판단한다. 숨은 mirror input을 제외하고 custom combobox의 실제 타입과 접근성 label을 읽으며, native label의 입력값/선택지 텍스트를 질문 이름에 섞지 않는다. 새 탭 링크도 관찰된 href로 이어서 조회할 수 있다. 필수 여부·제한·첨부 형식은 원본 속성을 그대로 쓰고, 원본에 없는 값은 미확인으로 둔다. 특정 입력 밖의 PDF 제출 안내 같은 공통 문구도 공개 원본 text로 후속 분석에 보존한다.

단독 모듈 로딩 검증에서는 session → suggestions → input 규격의 순환 초기화 문제도 발견했다. 공통 edits 규격을 독립 schema로 분리해 입력 규격을 바꾸지 않고 초기화 순환을 끊었다. 테스트의 질문 tool 식별자도 현재 공통 식별자를 참조하도록 맞췄다.

## 검증과 재현 범위

관련 11개 파일의 **51개 테스트 통과**, 변경 production 파일 ESLint 통과. 실제 Chromium 검사는 입력·첨부·승인·제출 차단, 새 탭 링크, iframe, unbound label, custom combobox, 숨은 mirror 제외, 선택지 그룹 문맥과 원본 속성을 검증한다. 기존 지원 승인·request 불변성·중복 전송 방지·암호화·취소·정리 검사도 통과했다. 새 전체 목록 계약의 synthetic inventory-v2 일반 폼은 실제 API로 7개 항목·원본 제약·쓰기 요청 0건·cleanup을 확인했다. iframe/login의 inventory-v2 전체 재실행은 이번 요청에서 하지 않았다; 기존 v1 기록은 역사 자료로 유지한다.

전체 TypeScript 검사에는 이번 조회 수정과 별개인 `src/components/career/chat/elements/RecommendationSearchProgress.tsx:163`의 미정의 `searchProgress` 오류 1개가 남았다. 해당 화면 코드는 수정하지 않았다. 마지막 검사 로그는 `.local/pr155-apply-button/live-forms-tsc-checked.log`다. 조회 관련 테스트 51개와 변경 production 파일 ESLint는 통과했으므로 이를 전체 프로젝트 타입 검사 통과로 표현하지 않는다.

실제 live-v3 실행 ID: Channel `2026-10-12T09-21-22-894Z-live-v3-channel-lever`, Greenhouse `2026-10-12T09-16-44-371Z-live-v3-anthropic-greenhouse`, WorkOS `2026-10-12T09-32-12-050Z-live-v3-workos-ashby`. 원본/모델 출력은 ignored `runs/`, 독립 브라우저 원본은 ignored `private/reference-live-v2/`에 있다. 최초 실패와 이전 성공도 덮어쓰지 않았다. live-v2는 WorkOS가 smoke gate였으며, live-v3는 별도 UI에서 확인한 11개 전체 질문으로 검증한다. 추가 gold 검토는 이전 결과를 본 뒤 진행했음을 manifest에 명시했다.

결과는 검사 시점의 공개 화면 기준이다. 답변 후 나타나는 분기 질문·로그인·차단 CAPTCHA·원본에 없는 제한은 미확인으로 남는다. 실제 제출 성공이나 모든 ATS의 호환성을 검증한 것은 아니다. 읽기 중 사이트의 익명 bootstrap 조회는 POST를 사용할 수 있으므로, 사용자 답변·첨부·제출이 없었다는 사실과 모든 HTTP POST가 0건이라는 주장은 구분한다. 비용 로그의 usage가 provider에서 오지 않으면 null/미확인으로 남기며 최종 청구액을 추측하지 않는다.
