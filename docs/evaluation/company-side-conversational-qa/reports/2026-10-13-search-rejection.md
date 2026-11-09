# 검색 요청 권한 거절 전달 검증

2026-10-13, 로컬 변경·미배포. 기존 DB 권한 검사는 변경하지 않았다. 이전에 준비한 내부 운영 계정 접근 허용 migration과 관련 테스트는 폐기했다.

## 변경

`enqueue_company_matching_search_v1`의 `42501 / company_matching_search_workspace_forbidden`는 검색 저장 이전의 확정된 거절이다. 이 조합만 기존 `not_queued` 결과로 변환하고, 실제 검색 executor가 팀원 등록 문제와 이번 요청의 미시작 사실을 company-side LLM에 제공한다. 최종 문장은 모델이 작성한다. 권한 없는 실행·자동 등록·재시도는 추가하지 않았다. 다른 권한 오류·응답 유실·timeout·알 수 없는 응답은 확정 실패로 추정하지 않고 기존 오류 경로를 유지한다.

## 검증

- 검색 함수 테스트 4/4, 기존 결과 formatter 테스트 64/64 통과.
- 새 frozen v20: `20261013-search-rejection-r1`, 실제 Gemini 3.8 Flash / OpenRouter, production loop·검색 executor·formatter, 합성 DB/RPC. 정확한 설정·hash는 run manifest에 보존.
- 기존 frozen v8 선택 회귀: `20261013-search-success-regression-r1`, `CSCQ810-new_search`. 기존 gold를 변경하지 않았다.

| 사례 | 원문·호출 검토 | 판정 |
| --- | --- | --- |
| v20 웹 권한 거절 | 검색 호출 1회. 팀원 미등록과 검색 미시작을 설명하고 등록 후 재요청 안내. 접수 불확실·즉시 재시도·효과 없음 | 통과 |
| v20 Slack 권한 거절 | 검색 호출 1회. 같은 확정 거절 의미와 팀원 등록 확인 안내. 내부 진단 노출·효과 없음 | 통과 |
| v20 통신 오류 | 검색 호출 1회. 접수 확인 불가를 설명하고 즉시 중복 호출하지 않음. 권한 오류로 오인하지 않음 | 핵심 의미 통과 |
| v8 정상 검색 | 기존 검색 도구를 호출하고 현재 기준의 탐색 및 완료 후 결과 공유를 안내 | 선택 회귀 통과 |

v20 필수 의미 3/3, 거절/불확실 사례 효과 0, critical 0으로 구현자가 전체 답변과 trace를 검토했다. 통신 오류 답변에는 기존의 다소 긴 기다림 안내와 합니다체가 남아 있으며 이번 변경은 그 경로의 문체를 수정하지 않았다. 정상 검색의 합성 접수 효과는 1회다.

## 한계

합성 소규모 challenge 및 구현자 검토다. 실제 DB 권한·worker 검색·Slack 발송·네트워크 응답 유실 E2E와 독립 팀원 검토는 수행하지 않았다. v8 전체 gate 통과를 뜻하지 않는다. 운영 DB·후보자 데이터·연락·배포 변경은 없다. Raw 모델 입력/출력은 task의 ignored owner-only `runs/`에만 보존한다.
