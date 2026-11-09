# 정기 후보 소개 복원과 가입일 표시 — 2026-10-15

로컬 구현·검증이며 배포, 운영 DB 변경, Slack 발송은 하지 않았다.

## 확인한 운영 기준

- 웹: `matchharper.com`의 production READY 배포 `dpl_8zDE85GcGuWYjFLrjJ48aN6AhL7D`, commit `b49471af4ae2e6df6129c550a17b6536f57bfb8a`.
- Worker: 운영 company-first 서비스가 active이고 checkout `5c6ba484fbea7f56461201fd1d103975cde08b91`. 작성 관련 세 파일에 운영 미커밋 변경이 없으며 writer 모델/추론 환경 override도 없음을 읽기 전용으로 확인했다.
- 해당 배포의 `write_channel_bundles`가 `write_slack_message`를 호출해 완성 문장을 저장하는 경로를 복원했다. 두 배포 프롬프트 원문은 그대로 보존하고 공통 가입일 지침만 덧붙였음을 비교했다. 기본 writer는 GPT-6.1 Sol/high/temperature 1.0/16384다.

## 변경 계약

정기 회사 선추천·연결 대기 소개는 기존 Worker 작성 → 완성 카드 outbox → 기존 웹 전달 순서다. 웹의 company-side 본문 재작성은 제거했다. 소개 뒤의 선택적 회사 이벤트는 유지하며 전달되지 않은 소개를 근거로 호출하지 않는다. 반복 복구는 같은 이벤트 키를 사용한다.

가입일은 `talent_users.created_at`을 소개 작성 직전 필요한 후보자만 조회해 Asia/Seoul 기준 `YYYY-MM-DD`로 제공한다. 공통 Profile·scoring·rerank 입력에 추가하지 않고, 가입 시각이나 새로운 저장 테이블도 추가하지 않는다. 최근 여부는 LLM이 판단하며 코드에 날짜 cutoff나 문구 교정 규칙을 두지 않는다. 가입만으로 역할 수락·현재 이직 의사·응답 가능성·후보자 적합도를 추정하지 않는다.

## 검증 결과

- 기존 소개 전달·수락 후보 runner 및 채널별 가입일 범위 검증: targeted pytest 12건 통과.
- 실제 새 가입일 조회를 canonical read-only 연결로 실행했고 날짜 형식과 KST 날짜 경계를 확인했다. 운영 row나 schema를 쓰지 않았다.
- `node scripts/testCompanyFirstPresentationFollowup.mjs`: 실제 전달 완료 함수를 합성 DB/queue adapter로 실행해 미전달 때 무호출, 실제 전달 Role만 호출, 여러 채널의 Role 중복 제거, 완료 후 복구 시 안정된 이벤트 키를 확인했다.
- frozen signup-date-v2, 실제 기존 writer/model 호출 2묶음·후보 소개 4개: 구조와 전체 원문 수동 검토 2/2 통과. 두 유형 모두 최근 후보에게만 가입 날짜를 가볍게 표시하고 오래된 날짜는 생략했다. 경력 성과 귀속, 원래 상태와 다음 행동, 후보 링크·이모지·소개 분리를 유지했고 가입에서 다른 의사를 추정하지 않았다.
- 실제 run: `writing-20261014T171341-ce06f5d4`, `writing-20261014T171357-d9e84a7c` (run ID는 UTC 기준). 원문·provider 설정·source hash·frozen manifest·수동 판정은 ignored owner-only runs에 보존했다.
- Python 변경 파일 문법 검사를 통과했다. 전체 웹 TypeScript 검사는 수정 범위 밖의 signup 상태 타입, Career nullable 필드, Ops 점수 타입, 기존 연락 테스트 등의 오류로 실패했다. 이 오류를 이번 변경으로 수정하지 않았으며 전체 타입 통과를 주장하지 않는다.

## 한계

작은 합성 작성 회귀이며 평균 품질 비교, 독립 검토, 실제 Slack 표시·정기 검색·큐 전달 E2E가 아니다. 기존 frozen v1과 당시 v23 결과를 변경하지 않았다. 소개 이후 선택적 에이전트의 판단 품질은 이번 writer-only 모델 검증 범위 밖이다.
