# Role 이동 — 운영 DB와 실제 연락 검증

2026-10-20 UTC에 사용자가 운영 DB 적용과 내부 Harper Workspace·전용 talent 계정 테스트를 승인했다.
DB 변경은 적용했고, 새 웹 코드는 로컬에서 실행했다. 웹·Worker 배포는 하지 않았다.

## 운영 DB

- `org_candidate_role_move_web` migration을 운영에 적용했다. 운영 이력 버전은 `20261020130843`이다.
- 원본은 `supabase/migrations/20261020114613_org_candidate_role_move_web.sql`이다.
- 새 요청·완료 함수 두 개 모두 `service_role`만 실행 가능하며 `anon`·`authenticated` 실행 권한은 없다.
- 이번 기능과 무관한 Ops migration은 적용하지 않았다.

## 실제 실행

고정 입력은 `role-move-live-v1.json`, 실행기는 `scripts/evalOrgRoleMoveLive.ts`다.
운영 식별자·이메일·후보자 원문·Slack 영수증·전체 source hash는
ignored `runs/20261020-role-move-live-r1`과 `runs/20261020-role-move-live-r2`에만 보존한다.

| 확인 | 결과 |
| --- | --- |
| 실제 UI 요청 | 인증된 로컬 `/org/role`의 후보자 상세에서 모달을 열고 Harper 질문을 요청했다. 성공 화면과 실제 발송 기록 확인 |
| 팀원 인증 경로 | 내부 Workspace의 전용 팀원 계정 세션으로 같은 실제 API에 수락·거절용 질문 요청 |
| 후보자 질문 | 실제 이메일 발송과 provider ID, Career 메시지 저장 확인. 답변 전에 원래 위치 유지 |
| 명확한 수락 | 기본 company-side LLM이 Role 상세를 읽고 `move_candidate_to_role` 실행. 실제 completion RPC가 저장된 승인과 원문 relay를 확인하고 1회 이동 |
| 연결 대기 유지 | 기존 Role은 종료, 대상 Role의 `processed_stage`와 태그는 연결 대기. 저장된 완료 결과도 승인된 목적지·단계와 일치 |
| 회사 안내 | LLM이 실제 실행 결과를 설명한 한 메시지가 회사 대화와 허용된 테스트 Slack 채널에 전달됨 |
| 후보자 변경 안내 | 기존 발송 경로의 Role 변경 이메일과 Career 메시지 확인 |
| 이동 거절 | 이동 도구를 실행하지 않음. 추천 위치·단계·수정 시각이 모두 동일하며 변경 안내를 추가 생성하지 않음. 거절 내용은 회사 대화·Slack에 전달 |
| 재시도 | 두 사건 모두 같은 job·회사 메시지·Slack 영수증 재사용. 추가 이동·회사 메시지·Slack 전달 없음 |
| 격리·정리 | 생성 시부터 canonical testOnly와 전용 talent allowlist 적용. 일반 후보 추천·fit 없음. 두 run의 Role과 파생 기록 정리 후 35개 Role 참조 및 테스트 talent 메시지 잔존 0 |

회사 응답 원문과 실제 웹 화면을 읽었다. 수락 응답은 이동 완료와 연결 대기 상태,
거절 응답은 이동하지 않았다는 사실과 기존 상태를 설명한다.
회사 안내는 고정 성공 문구가 아니라 기본 `google/gemini-3.8-flash` company-side LLM의 응답이다.
Slack은 실제 발송 결과의 message timestamp와 저장된 영수증을 확인했다.
Slack 웹 화면은 로딩에 실패했고, 네이티브 앱은 Mac 잠금 때문에 직접 확인하지 못했다.
외부 테스트 이메일·Slack 메시지는 발송 증거로 남으며 DB fixture는 제거했다.

## 실행 중 확인한 문제와 처리

첫 run은 로컬의 별도 Ops 변경이 운영에 없는 `ops_only` 필드를 조회해 실패했다.
기존 운영 처리기가 이어받아 새 승인 범위 검증 없이 연결됨으로 옮겼으므로 해당 run을 성공으로 판정하지 않았다.
이는 DB 함수 추가만으로 새 웹 동작이 배포되는 것이 아님을 보여준다.

회사 연락 reader에 정확한 미존재 컬럼 오류에 한정한 호환 조회를 추가했다.
컬럼이 존재하면 기존 Ops 비공개 필터를 유지하며 권한 오류·다른 필드 오류는 그대로 실패한다.
두 번째 run은 해당 fixture의 큐 예약만 잠시 미루고 새 로컬 처리기가 직접 소유했다.
전역 dispatcher나 채널 설정은 변경하지 않았다.

두 번째 run의 최초 완료 시도에서는 테스트 실행기가 연락 본문 저장 단계를 빠뜨려
Slack 전달 후 최종 처리에서 실패했다. 일반 발송 진입점과 같은 본문 저장 계약을 실행기에 추가했다.
동일 job 재시도에서 이미 작성·전달된 응답을 재사용해 완료됐으며 중복 이동·발송은 없었다.
거절 run은 처음부터 이 계약을 포함해 완료됐다.

대상 DB·표시 분기 및 호환 reader 검사는 16개 통과했다.
별도 기존 `contacts.test.ts`는 변경된 Workspace 접근 검사에 필요한
`company_workspace` 응답이 fixture에 없어 실패했다. 이 테스트를 통과했다고 집계하거나
이번 작업에서 관련 없는 fixture를 고치지 않았다.

## 확인 범위

- 질문은 실제 UI와 인증된 API로 요청하고 이메일을 실제 발송했다.
- 후보자 답변은 전용 테스트 계정의 메시지로 저장하고 일반 relay RPC에 주입했다.
  Gmail inbound 파싱이나 Career 원본 LLM의 도구 선택까지 통과한 테스트는 아니다.
- DB 이동·company-side LLM·Slack transport를 mock으로 교체하지 않았다.
- 새 코드와 운영 DB의 결합 검증이다. 새 웹 기능의 운영 배포 완료를 의미하지 않는다.
- 합성 수락·거절 두 경우의 확인이며 모든 회사·대화 분포에 대한 평가가 아니다.
