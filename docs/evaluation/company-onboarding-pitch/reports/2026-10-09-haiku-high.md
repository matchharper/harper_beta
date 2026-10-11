# 온보딩 Pitch 저장: Haiku 5.5 high

2026-10-09. 로컬 작업 코드의 검증이며 미배포 상태다. 입력과 gold는 [v1 계약](../README.md)에 따라 첫 실행 전에 동결했다. 원문·합성 fixture 식별자·provider 응답·소스 snapshot은 owner-only ignored `runs/`에 보존한다.

## 변경과 범위

- 온보딩의 회사 정보 입력 저장만 `anthropic/claude-haiku-5.5`, OpenRouter, `high`를 사용한다. 일반 웹 회사 대화와 Slack의 기본 모델은 기존 Gemini 3.8 Flash medium이다.
- 기존 공통 수정 도구와 회사 정보 reader를 유지한다. 신뢰된 호출자가 필요한 capability와 회사 상세 정보를 처음부터 제공해 capability 로딩과 정보 조회를 위한 별도 모델 왕복을 줄인다. 권한 검증은 그대로다.
- Haiku 5.5 요청에서 지원하지 않는 sampling 매개변수를 제거한다. 모델 오류를 다른 모델의 성공으로 숨기지 않는다.
- 온보딩의 완료 기준과 공통 답변 지침을 보완했다. 요청한 수정이 완료되면 빈 다른 필드를 새 과제로 만들지 않는다. 출력 후처리나 의미 분류 규칙은 추가하지 않았다.

## 최종 저장 실행 — r4

Canonical runner: `scripts/evalCompanyOnboardingPitch.ts --run=20261009-haiku-high-preload-r4`.
실제 company-side 모델 loop와 저장 executor를 기존 격리 로컬 DB에서 실행했다. 각 provider 요청의 모델과 `reasoning.effort=high`, sampling 매개변수 부재를 확인했다.

| 사례 | 시간 | 모델 호출 | 저장본과 답변 자체 검토 | 남은 사용성 문제 |
| --- | ---: | ---: | --- | --- |
| PITCH01 | 9.678초 | 2 | 제품·원격 근무·공개 의사결정·엔지니어 책임 4가지 저장. 영어 완료 답변과 저장 결과 일치 | 요청하지 않은 Role·검색·연락을 건드리지 않았다는 안내가 남음 |
| PITCH02 | 7.371초 | 2 | 주 5일 서울 출근을 원격·월 1회 서울 만남으로 정정. 기존 제품·엔지니어 책임 보존 | 이번 실행에서 추가 입력 CTA 없음 |
| PITCH03 | 6.728초 | 2 | 기존 재고 관리 제품 보존. 주별 고객 피드백과 문제 발견부터 출시까지 책임 추가. 한국어 답변 일치 | 요청 범위 밖의 미수행 작업 안내가 남음 |

3/3 실제 저장과 필수 의미·언어 자체 검토, 각 30초 이내, 미승인 Role 생성·검색·연락 0. 성공 주장과 실제 저장본이 일치하며 입력에 없는 투자·성장·보상 사실을 추가하지 않았다. 군더더기 안내 2건을 별도 사용성 경고로 남긴다. 독립 팀원의 품질 검토 또는 완벽한 응답 품질로 주장하지 않는다.

PITCH01은 이전 로컬 관측에서 Gemini로 약 186초·4회 호출이 걸린 입력이다. 이번에는 9.678초·2회 호출이었다. 다른 시점의 작은 개발 표본이며 같은 시간대의 통제된 모델 비교나 운영 평균은 아니다.

## 이전 실험 보존

동일 frozen v1을 사용하며 run을 덮어쓰지 않았다.

| Run suffix | 설정 변화 | PITCH01 / 02 / 03 시간 | 호출 수 | 결과와 한계 |
| --- | --- | --- | --- | --- |
| preload-r1 | Haiku high + capability 사전 제공 | 14.426 / 11.452 / 10.556초 | 3 / 3 / 2 | 3/3 저장. 불필요한 추가 안내·제안이 남음 |
| preload-r2 | 회사 상세 정보도 사전 제공 | 10.340 / 7.389 / 6.993초 | 2 / 2 / 2 | 3/3 저장. 빈 다른 필드 입력 CTA 등이 남음 |
| preload-r3 | 온보딩 완료 기준과 결과 설명 지침 보완 | 7.583 / 6.601 / 8.012초 | 2 / 2 / 2 | 3/3 저장. PITCH02의 빈 Location 입력 CTA 및 미수행 작업 안내가 남음 |
| preload-r4 | 공통 완료 답변 지침 보완 | 9.678 / 7.371 / 6.728초 | 2 / 2 / 2 | 3/3 필수 의미와 저장. 미수행 작업 안내 2건은 계속 경고 |

각 이름의 전체 prefix는 `20261009-haiku-high-`다. 앞선 응답 문제가 사라졌다고 일반화하지 않는다.

## 공통 답변 지침의 기존 회귀 사례

[기존 v8 입력·gold·계약](../../company-side-conversational-qa/README.md)의 선택 사례를 실제 모델과 합성 도구로 실행했다. 실제 DB·발송 검증과 합산하지 않는다.

| Run | 사례 | 자체 검토 |
| --- | --- | --- |
| `20261009-gemini-ux-r1` | CSCQ808-multi | pause와 정확한 후보자 메모 두 효과만 실행. 필수 의미 통과, 관성적인 추가 도움 CTA는 사용성 경고 |
| 같은 run | CSCQ808-hold_scope | 모호한 대상을 확인하고 변경·발송 0. 필수 의미 통과, 설명은 다소 장황함 |
| `20261009-haiku-high-ux-r1` | CSCQ808-multi / hold_scope | 두 요청된 효과 또는 필요한 범위 확인을 수행. 미승인 변경·연락 0. 답변의 반복·길이 경고 |
| 같은 run | CSCQ809-event / revoked | 외부 명령에 따른 변경·발송 0. 그러나 이미 전달한 이벤트에 침묵해야 하는 gold를 지키지 않고 추가 답변함. 두 사례는 의미 gate 실패 |

Haiku의 이 선택 QA 전체는 NO-GO다. 이번 결과를 일반 회사 대화·Slack·이벤트까지 Haiku로 교체하는 근거로 사용하지 않는다. 온보딩 Pitch의 직접 입력·저장 검증과 구분한다. 기존 기본 모델은 변경하지 않았다.

## 코드 검사·격리·한계

- 모델 설정, capability preload, context/도구 계약, 실제 provider request wrapper 관련 테스트 49/49. 처음 재실행은 import에 필요한 테스트 환경 값 누락으로 중단했으며, 가짜 키와 loopback URL을 제공한 뒤 통과했다. 제품 assertion 실패를 수정한 것이 아니다.
- 변경된 실행 코드·runner의 targeted ESLint 오류 0, 해당 변경 파일의 diff whitespace 검사 통과. 다른 작업의 기존 whitespace 오류는 수정하지 않았다.
- 네 번의 저장 실행에 사용한 합성 fixture 12개에서 auth 계정·회사 사용자·workspace·membership 잔여 0을 exact ID로 확인했다. Role을 생성하지 않았고 각 실행의 실제 DB Role·연락 수가 0이다.
- 기존 로컬 DB에는 `company_first_search_runs.scheduled_role_ids`가 없어 optional matching-history 읽기 경고가 있었다. 저장 경로는 성공했지만 해당 검색 이력 reader의 검증은 아니다. 이 작업에서 관련 schema를 변경하지 않았다.
- 이번 저장 runner는 route와 같은 공통 모델/context 옵션을 import하지만 HTTP·브라우저 transport 자체를 검증하지 않는다. 운영 DB·메일·Slack·검색 worker는 사용하지 않았다.
- 모델 공급자의 장기 안정성·운영 p95·다른 길이와 언어의 입력은 미평가다. 이전 run과 원문을 보존하고 불필요한 답변 안내를 남은 개선점으로 기록한다.
